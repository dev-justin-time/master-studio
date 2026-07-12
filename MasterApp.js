import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

import { MasterState } from './core/MasterState.js';
import { PluginManager } from './core/PluginManager.js';
import { NodeGraphExecutor } from './core/NodeGraphExecutor.js';

// Import Bindings
import './bindings/WasmBridge.js';
import './bindings/LuaBridge.js';

// Import Plugins
import { RiggingPlugin } from './plugins/RiggingPlugin.js';
import { AnimationPlugin } from './plugins/AnimationPlugin.js';
import { PhysicsPlugin } from './plugins/PhysicsPlugin.js';
import { ProceduralPlugin } from './plugins/ProceduralPlugin.js';
import { AIBehaviorPlugin } from './plugins/AIBehaviorPlugin.js';
import { GameMapPlugin } from './plugins/GameMapPlugin.js';
import { SelectionPlugin } from './plugins/SelectionPlugin.js';
import { StateManagerPlugin } from './plugins/StateManagerPlugin.js';
import { AIAgentPlugin } from './plugins/AIAgentPlugin.js';
import { MenuSystemPlugin } from './plugins/MenuSystemPlugin.js';
import { LightingCameraPlugin } from './plugins/LightingCameraPlugin.js';
import { LightingPlugin } from './plugins/LightingPlugin.js';
import { PhotorealisticRenderPlugin } from './plugins/PhotorealisticRenderPlugin.js';
import { TransformGizmoPlugin } from './plugins/TransformGizmoPlugin.js';
import { RustPlugin } from './plugins/RustPlugin.js';
import { GoPlugin } from './plugins/GoPlugin.js';
import { LuaPlugin } from './plugins/LuaPlugin.js';
import { WaterPlugin } from './plugins/WaterPlugin.js';
import { logger } from './core/Logger.js';

export class MasterApp {
  constructor() {
    // 1. Core Architecture
    this.state = new MasterState();
    this.plugins = new PluginManager(this.state);
    this.nodeGraph = new NodeGraphExecutor(this.state, this.plugins);

    // 2. Three.js Core
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    this.renderer = null;
    this.composer = null;
    this._outlinePass = null;
    this.controls = null;
    this.clock = new THREE.Clock();

    // Physics debug
    this._physicsDebug = false;
    this._debugGroup = null;

    // 3. State Initialization
    this.state.set('scene', this.scene);
    this.state.set('camera', this.camera);
    this.state.set('renderer', null); // populated in _initRenderer
    this.state.set('pluginManager', this.plugins); // for cross-plugin access (e.g. LightingCameraPlugin → LightingPlugin)
  }

  async init() {
    this._initRenderer();
    this._initLights();
    this._initPostProcessing();

    // Register Plugins
    this.plugins.register(StateManagerPlugin);
    this.plugins.register(AIAgentPlugin);
    // AIAgent needs the StateManager plugin instance, not MasterState
    const stateMgr = this.plugins._plugins.get('StateManager');
    this.plugins._plugins.get('AIAgents').init(stateMgr);

    // Subscribe to self-optimizing actions from AI experts
    stateMgr.subscribe('render.outlinePass', (enabled) => {
      if (this._outlinePass) {
        this._outlinePass.enabled = enabled;
        logger.log('AI Optimize', 'Outline pass:', enabled ? 'ON' : 'OFF');
      }
    });

    stateMgr.subscribe('physics.substeps', (substeps) => {
      const physics = this.plugins._plugins.get('PhysicsPlugin');
      if (physics && substeps > 0) {
        physics._timeStep = 1 / substeps;
        logger.log('AI Optimize', 'Physics substeps:', substeps, '→ timestep:', physics._timeStep.toFixed(4));
      }
    });

    stateMgr.subscribe('memory.gc', (timestamp) => {
      logger.log('AI Optimize', 'Memory GC triggered at', timestamp);
      // Reset renderer info counters to free tracked memory
      if (this.renderer) {
        this.renderer.info.reset();
      }
    });

    // Toggle debug panel
    let debugOpen = false;
    document.getElementById('state-debug-toggle')?.addEventListener('click', () => {
      debugOpen = !debugOpen;
      const body = document.getElementById('state-debug-body');
      const toggle = document.getElementById('state-debug-toggle');
      if (body) body.style.display = debugOpen ? 'block' : 'none';
      if (toggle) toggle.textContent = debugOpen ? '▾ State Debug' : '▸ State Debug';
    });

    // Wire sidebar/debug panel toggle from menu
    window.addEventListener('togglePanel', (e) => {
      if (e.detail.panel === 'sidebar') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.style.display = sidebar.style.display === 'none' ? '' : 'none';
      } else if (e.detail.panel === 'debug') {
        document.getElementById('state-debug-toggle')?.click();
      }
    });

    this.plugins.register(MenuSystemPlugin);
    this.plugins.register(LightingCameraPlugin);
    this.plugins.register(TransformGizmoPlugin);

    this.plugins.register(RiggingPlugin);
    this.plugins.register(AnimationPlugin);
    this.plugins.register(PhysicsPlugin);
    this.plugins.register(ProceduralPlugin);
    this.plugins.register(AIBehaviorPlugin);
    this.plugins.register(GameMapPlugin);
    this.plugins.register(SelectionPlugin);

    this.plugins.register(LightingPlugin);
    this.plugins.register(PhotorealisticRenderPlugin);

    // Register language/Wasm plugins
    this.plugins.register(RustPlugin);
    this.plugins.register(GoPlugin);
    this.plugins.register(LuaPlugin);

    // Register Water (shader surface + foam + edge fade + cube-camera reflections)
    this.plugins.register(WaterPlugin);

    // Setup TransformControls now that renderer/camera exist
    const gizmo = this.plugins._plugins.get('TransformGizmo');
    if (gizmo?.setup) {
      gizmo.setup(this.camera, this.renderer, this.controls, this.scene);
    }

    // Use PhotorealisticRender's composer (SSAO, Bloom, FXAA) as primary pipeline
    const prPlugin = this.plugins._plugins.get('PhotorealisticRender');
    if (prPlugin?.composer) {
      // Inject OutlinePass into the photorealistic pipeline (after all passes, so outline stays sharp)
      prPlugin.composer.addPass(this._outlinePass);
      this.composer = prPlugin.composer;
      logger.log('MasterApp', 'Swapped to PhotorealisticRender pipeline.');
    }

    // Wire menu render-preset & screenshot events to PhotorealisticRender
    window.addEventListener('setRenderPreset', (e) => {
      const pr = this.plugins._plugins.get('PhotorealisticRender');
      pr?.applyPreset(e.detail.preset);
    });
    window.addEventListener('captureScreenshot', async () => {
      const pr = this.plugins._plugins.get('PhotorealisticRender');
      if (pr?.captureScreenshot) {
        const url = await pr.captureScreenshot();
        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.download = `screenshot-${Date.now()}.png`;
          a.click();
        }
      }
    });

    this._initNodeEditorUI();
    this._initToolbarButtons();
    this._initKeybindings();
    this._initDemoScene();

    // Wire menu events for selection operations to the Selection plugin
    this._wireMenuEvents();

    // Wire file import (point cloud / CAD) via Go Wasm
    this._initImportHandlers();

    // Initialize Wasm Modules (Rust/Go/Lua)
    await this._initWasmModules();

    // Start Render Loop
    this._animate();

    logger.log('MasterApp', 'Initialized successfully.');
  }

  _initRenderer() {
    const canvas = document.getElementById('renderCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Size from the canvas's actual CSS box (works for both full-window and 3-column
    // brutalist layouts). Fall back to window inner dims in case layout hasn't
    // settled yet (e.g. canvas inserted before DOM ready).
    const initW = canvas.clientWidth || window.innerWidth;
    const initH = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(initW, initH);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.state.set('renderer', this.renderer);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.state.set('controls', this.controls);

    const _resizeRenderer = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this._outlinePass?.setSize(w, h);
    };
    window.addEventListener('resize', _resizeRenderer);
    // Also watch the canvas's host element (e.g. <section id="viewport">) so
    // brutalist 3-column resizes — sidebar collapse, modal open, etc. — reflow
    // the renderer correctly without depending solely on window resize.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(_resizeRenderer).observe(canvas.parentElement || canvas);
    }
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this._outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.scene, this.camera);
    this._outlinePass.edgeStrength = 3;
    this._outlinePass.visibleEdgeColor.set('#00ff00');
    this._outlinePass.edgeGlow = 1;
    this._outlinePass.pulsePeriod = 2;
    this.composer.addPass(this._outlinePass);

    // Wire up selection highlighting (traverse groups to highlight child meshes)
    this.state.on('selection:changed', (objects) => {
      const meshes = [];
      objects.forEach(obj => {
        if (obj.isMesh) {
          meshes.push(obj);
        } else if (obj.isGroup) {
          obj.traverse(child => {
            if (child.isMesh) meshes.push(child);
          });
        }
      });
      this._outlinePass.selectedObjects = meshes;
      // Mirror onto window CustomEvent so external UIs (e.g. studio.html's
      // properties panel) can sync without reaching into MasterState.
      window.dispatchEvent(new CustomEvent('selection:changed', { detail: objects }));
    });

    // Click-to-select via raycasting (with drag threshold to avoid orbit interference)
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    let mouseDownX = 0, mouseDownY = 0;

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      mouseDownX = e.clientX;
      mouseDownY = e.clientY;
    });

    this.renderer.domElement.addEventListener('mouseup', (e) => {
      const selection = this.plugins._plugins.get('Selection');
      if (selection?._isLassoActive) return;

      // Only treat as a click if the mouse barely moved (≤ 3px)
      const dx = e.clientX - mouseDownX;
      const dy = e.clientY - mouseDownY;
      if (Math.sqrt(dx * dx + dy * dy) > 3) return;

      this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this._mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      this._raycaster.setFromCamera(this._mouse, this.camera);
      const targets = [];
      this.scene.traverse(obj => {
        if (obj.isMesh && obj.userData.isManagedObject) targets.push(obj);
      });

      const hits = this._raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (selection?._stickySelect) {
          const current = this.state.data.selectedObjects || [];
          if (current.includes(hitObj)) {
            selection._setSelection(current.filter(o => o !== hitObj));
          } else {
            selection._setSelection([...current, hitObj]);
          }
        } else {
          selection?._setSelection([hitObj]);
        }
      }
    });
  }

  async _initWasmModules() {
    logger.log('MasterApp', 'Initializing WebAssembly modules...');
    // Initialize language plugin Wasm runtimes (plugins gracefully degrade if Wasm is unavailable)
    const rust = this.plugins._plugins.get('Rust');
    const go = this.plugins._plugins.get('Go');
    const lua = this.plugins._plugins.get('Lua');

    if (rust?.init) await rust.init(this.state);
    if (go?.init) await go.init(this.state);
    if (lua?.init) await lua.init(this.state);

    logger.log('MasterApp', 'Language plugins initialized.');
  }

  _initNodeEditorUI() {
    const addNodeMenu = document.getElementById('add-node-menu');
    const graphArea = document.getElementById('node-graph-area');
    if (!addNodeMenu || !graphArea) return;

    // Dynamically build the "Add Node" menu from registered plugins
    const categories = {};
    this.plugins.getAvailableNodes().forEach(nodeType => {
      const [cat, name] = nodeType.split('/');
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ type: nodeType, name });
    });

    Object.entries(categories).forEach(([cat, nodes]) => {
      const header = document.createElement('div');
      header.className = 'menu-category';
      header.textContent = cat;
      addNodeMenu.appendChild(header);

      nodes.forEach(node => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.textContent = node.name;
        item.addEventListener('click', () => {
          const creator = this.plugins.getNodeCreator(node.type);
          if (creator) {
            const domNode = creator(100, 100); // Spawn at center
            domNode.dataset.nodeType = node.type;
            graphArea.appendChild(domNode);
            this._registerNodeInGraph(node.type, domNode);
          }
        });
        addNodeMenu.appendChild(item);
      });
    });
  }

  _registerNodeInGraph(nodeType, domElement) {
    // Parse the DOM element back into a data object for the NodeGraphExecutor
    const nodeData = {
      type: nodeType,
      dom: domElement,
      inputs: {}, // Parsed from DOM inputs
      outputs: {}
    };

    // Add to executor's active graph
    this.nodeGraph.activeGraph.push(nodeData);

    // Wire up on-demand execution buttons (e.g. Rust CSG/Decimate nodes)
    const runBtn = domElement.querySelector('[data-action="run"]');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        this.nodeGraph.executeNodeOnDemand(nodeData).catch(err => {
          logger.error('MasterApp', 'Node execution failed:', err);
        });
      });
    }

    // Sync range input value display for decimate nodes
    const rangeInput = domElement.querySelector('input[type="range"][data-prop="percent"]');
    const percentDisplay = domElement.querySelector('.percent-value');
    if (rangeInput && percentDisplay) {
      rangeInput.addEventListener('input', () => {
        percentDisplay.textContent = `${rangeInput.value}%`;
      });
    }
  }

  // ── Toolbar Button Handlers ──
  _initToolbarButtons() {
    const selection = this.plugins._plugins.get('Selection');
    const physics = this.plugins._plugins.get('PhysicsPlugin');

    document.getElementById('btn-add-cube')?.addEventListener('click', () => {
      const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      const mat = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        roughness: 0.4,
        metalness: 0.3
      });
      const cube = new THREE.Mesh(geo, mat);
      cube.name = 'Cube_' + Date.now();
      cube.position.set(
        (Math.random() - 0.5) * 6,
        2 + Math.random() * 2,
        (Math.random() - 0.5) * 6
      );
      cube.userData.isManagedObject = true;
      this.scene.add(cube);
      const body = physics?.createRigidBody(cube.name, cube, { mass: 1 });
      // Give a random initial velocity for bouncing/colliding
      if (body) {
        body.velocity.x = (Math.random() - 0.5) * 4;
        body.velocity.y = 2 + Math.random() * 3;
        body.velocity.z = (Math.random() - 0.5) * 4;
      }
      selection?._setSelection([cube]);
      logger.log('Toolbar', 'Spawned cube:', cube.name);
    });

    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      selection?.selectAll();
    });

    document.getElementById('btn-deselect')?.addEventListener('click', () => {
      selection?.deselectAll();
    });

    document.getElementById('btn-lasso')?.addEventListener('click', () => {
      if (selection?._isLassoActive) {
        selection.completeLassoSelect();
        document.getElementById('btn-lasso').textContent = '🎯 Lasso';
      } else {
        selection?.startLassoSelect();
        document.getElementById('btn-lasso').textContent = '🎯 Complete';
      }
    });

    // Listen for lasso state changes to update button
    this.state.on('selection:lasso:started', () => {
      document.getElementById('btn-lasso').textContent = '🎯 Complete';
    });
    this.state.on('selection:lasso:completed', () => {
      document.getElementById('btn-lasso').textContent = '🎯 Lasso';
    });

    // Listen for sticky toggle
    this.state.on('selection:sticky:toggled', ({ enabled }) => {
      const el = document.getElementById('sticky-indicator');
      if (el) {
        el.textContent = 'Sticky: ' + (enabled ? 'ON' : 'OFF');
        el.style.color = enabled ? '#00ff88' : '#888';
      }
    });

    // Debug toggle button
    document.getElementById('btn-debug')?.addEventListener('click', () => {
      this._togglePhysicsDebug();
    });

    // Gizmo mode toolbar buttons
    const gizmoPlugin = this.plugins._plugins.get('TransformGizmo');
    document.getElementById('btn-translate')?.addEventListener('click', () => {
      gizmoPlugin?.setMode('translate');
    });
    document.getElementById('btn-rotate')?.addEventListener('click', () => {
      gizmoPlugin?.setMode('rotate');
    });
    document.getElementById('btn-scale')?.addEventListener('click', () => {
      gizmoPlugin?.setMode('scale');
    });

    // Listen to gizmo mode changes to update toolbar active states
    this.state.on('gizmo:mode:changed', ({ mode }) => {
      ['translate', 'rotate', 'scale'].forEach(m => {
        const btn = document.getElementById(`btn-${m}`);
        if (btn) {
          btn.classList.toggle('active', m === mode);
        }
      });
    });

    this.state.on('physics:debug:toggled', (enabled) => {
      const btn = document.getElementById('btn-debug');
      if (btn) {
        btn.textContent = enabled ? '🐛 Debug ON' : '🐛 Debug';
        btn.style.background = enabled ? '#2a4a2a' : '#2a2a2a';
      }
    });
  }

  // ── Keyboard Shortcuts ──
  _initKeybindings() {
    const selection = this.plugins._plugins.get('Selection');
    const gizmo = this.plugins._plugins.get('TransformGizmo');

    window.addEventListener('keydown', (e) => {
      // Ignore when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      switch (true) {
        case ctrl && key === 'a':
          e.preventDefault();
          selection?.selectAll();
          break;
        case key === 'escape':
          selection?.deselectAll();
          break;
        case key === 'g' && !ctrl:
        case key === 'r' && !ctrl:
        case key === 's' && !ctrl:
          e.preventDefault();
          gizmo?.handleKey(key, e);
          break;
        case key === 't' && !ctrl:
          e.preventDefault();
          selection?.toggleStickySelect();
          break;
        case key === 'u' && !ctrl:
          selection?.ungroupSelected();
          break;
        case key === 'i' && !ctrl:
          selection?.invertSelection();
          break;
        case key === 'l' && !ctrl:
          if (selection?._isLassoActive) {
            selection?.completeLassoSelect();
          } else {
            selection?.startLassoSelect();
          }
          break;
        case key === '1':
          selection?.selectByColor('#ff4444');
          break;
        case key === '2':
          selection?.selectByColor('#44aaff');
          break;
        case key === '3':
          selection?.selectByColor('#44ff44');
          break;
        case key === 'p' && !ctrl:
          this._togglePhysicsDebug();
          break;
      }
    });

    // Mouse support for lasso mode
    window.addEventListener('mousedown', (e) => {
      if (selection?._isLassoActive && e.target === this.renderer.domElement) {
        selection.addLassoPoint(e.clientX, e.clientY);
      }
    });

    // Double-click to complete lasso
    window.addEventListener('dblclick', (e) => {
      if (selection?._isLassoActive) {
        selection.completeLassoSelect();
      }
    });
  }

  // ── Physics Debug Overlay ──
  _togglePhysicsDebug() {
    this._physicsDebug = !this._physicsDebug;

    if (this._physicsDebug) {
      if (!this._debugGroup) {
        this._debugGroup = new THREE.Group();
        this._debugGroup.name = 'PhysicsDebug';
        this.scene.add(this._debugGroup);
      }
    } else {
      if (this._debugGroup) {
        this._clearDebugMeshes();
      }
    }

    this.state.emit('physics:debug:toggled', this._physicsDebug);
    logger.log('PhysicsDebug', this._physicsDebug ? 'ON' : 'OFF');
  }

  _renderPhysicsDebug() {
    if (!this._physicsDebug || !this._debugGroup) return;

    this._clearDebugMeshes();

    const physics = this.plugins._plugins.get('PhysicsPlugin');
    const bodies = physics?._state?.data?.physicsBodies;
    if (!bodies) return;

    bodies.forEach(body => {
      if (!body.object || body.isStatic) return;

      const pos = body.object.position;
      const radius = physics._getBodyHalfHeight(body);

      // Wireframe sphere
      const sphereGeo = new THREE.SphereGeometry(radius, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.4 });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.copy(pos);
      sphere.userData._debug = true;
      this._debugGroup.add(sphere);

      // Velocity arrow
      const velMag = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2 + body.velocity.z ** 2);
      if (velMag > 0.01) {
        const dir = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z).normalize();
        const arrow = new THREE.ArrowHelper(dir, pos, velMag * 0.3, 0xff4444, 0.15, 0.1);
        arrow.userData._debug = true;
        this._debugGroup.add(arrow);
      }
    });
  }

  _clearDebugMeshes() {
    if (!this._debugGroup) return;
    while (this._debugGroup.children.length > 0) {
      const child = this._debugGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      if (child.line) {
        child.line?.geometry?.dispose();
        child.line?.material?.dispose();
        child.cone?.geometry?.dispose();
        child.cone?.material?.dispose();
      }
      this._debugGroup.remove(child);
    }
  }

  // ── Demo Scene ──
  _initDemoScene() {
    const selection = this.plugins._plugins.get('Selection');
    const physics = this.plugins._plugins.get('PhysicsPlugin');

    // Grid floor
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    grid.name = 'GridFloor';
    this.scene.add(grid);

    // Simple ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.name = 'Ground';
    ground.userData.isManagedObject = true;
    this.scene.add(ground);

    // Physics body for ground (static)
    physics?.createRigidBody('Ground', ground, { mass: 0, isStatic: true });

    // ── Test objects (12 scattered for lasso testing) ──
    const colors = [0xff4444, 0x44aaff, 0xffaa00, 0xff44ff, 0x44ff44, 0xffff44,
                    0xff6644, 0x66aaff, 0xaaff44, 0xff66aa, 0x66ffaa, 0xaaaa44];
    const shapeTypes = ['Cube','Sphere','Cylinder','Cone','Torus','Icosahedron',
                        'Cube','Sphere','Cylinder','Cone','Torus','Icosahedron'];
    const shapes = [
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.SphereGeometry(0.4, 24, 24),
      new THREE.CylinderGeometry(0.35, 0.35, 0.9, 20),
      new THREE.ConeGeometry(0.4, 0.9, 20),
      new THREE.TorusGeometry(0.35, 0.14, 12, 24),
      new THREE.IcosahedronGeometry(0.4),
    ];

    colors.forEach((color, i) => {
      const geo = shapes[i % shapes.length];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `Demo_${shapeTypes[i]}_${i}`;
      mesh.position.set(
        (i % 4 - 1.5) * 3.0 + (Math.random() - 0.5) * 1.5,
        0.8 + Math.random() * 0.6,
        (Math.floor(i / 4) - 1) * 3.0 + (Math.random() - 0.5) * 1.5
      );
      mesh.castShadow = true;
      mesh.userData.isManagedObject = true;
      this.scene.add(mesh);

      physics?.createRigidBody(mesh.name, mesh, { mass: 1 });

      if (i === 0) {
        selection?._setSelection([mesh]);
      }
    });

    // ── Simple terrain patch using GameMapPlugin ──
    const gameMap = this.plugins._plugins.get('GameMap');
    if (gameMap) {
      const heightmapData = new Float32Array(50 * 50);
      for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
          const nx = x / 50 - 0.5;
          const nz = y / 50 - 0.5;
          heightmapData[y * 50 + x] = Math.sin(nx * 6) * Math.cos(nz * 6) * 0.8 + Math.sin(nx * nz * 10) * 0.3;
        }
      }

      gameMap._cacheMap({
        id: 'demo_terrain',
        size: 10,
        segments: 50,
        color: 0x5a9c5e,
        heightmap: { width: 50, height: 50, data: heightmapData }
      });

      gameMap.generateTiledWorld([
        {
          mapId: 'demo_terrain',
          position: { x: -8, y: -0.3, z: -3 },
          scale: { x: 0.5, y: 0.5, z: 0.5 }
        }
      ], {
        blendEdges: false,
        autoLOD: false,
        collisionLayer: false
      }).then(world => {
        logger.log('Demo', 'Terrain generated:', world?.name);
      });
    }

    logger.log(`[Demo] Scene initialized with ${colors.length} selectable objects + terrain`);
  }

  // ── File Import (Point Cloud / CAD via Go Wasm) ──
  _initImportHandlers() {
    const importInput = document.getElementById('import-file-input');
    const dropZone = document.getElementById('drop-zone');
    const viewport = document.getElementById('viewport');

    // Toolbar button opens the hidden file input
    document.getElementById('btn-import')?.addEventListener('click', () => {
      importInput?.click();
    });

    // Handle file selection from the input
    importInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this._importFile(file);
      importInput.value = ''; // reset so the same file can be re-selected
    });

    // Drag & drop over the viewport
    let dragCounter = 0;
    viewport?.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dropZone?.classList.add('active');
    });
    viewport?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dropZone?.classList.remove('active');
        dragCounter = 0;
      }
    });
    viewport?.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    viewport?.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropZone?.classList.remove('active');

      const file = e.dataTransfer?.files?.[0];
      if (file) this._importFile(file);
    });
  }

  async _importFile(file) {
    const go = this.plugins._plugins.get('Go');
    if (!go) {
      logger.warn('MasterApp', 'GoPlugin not registered');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();

    let object = null;
    if (['las', 'ply'].includes(ext)) {
      object = await go.parsePointCloud(buffer);
    } else if (['step', 'iges', 'stp', 'igs'].includes(ext)) {
      object = await go.importCAD(buffer);
    } else {
      logger.warn('MasterApp', 'Unsupported import format:', ext);
      return;
    }

    if (!object) {
      logger.warn('MasterApp', 'Import returned no result for', file.name);
      return;
    }

    // Center the imported object in the scene
    object.position.set(0, 0, 0);
    this.scene.add(object);

    // Select the imported object
    const selection = this.plugins._plugins.get('Selection');
    selection?._setSelection([object]);

    logger.log('MasterApp', 'Imported', file.name, '→', object.name);
  }

  // ── Menu Event Wiring (CustomEvent → plugin methods) ──
  _wireMenuEvents() {
    const selection = this.plugins._plugins.get('Selection');

    // Selection operations
    window.addEventListener('selectAll', () => selection?.selectAll());
    window.addEventListener('deselectAll', () => selection?.deselectAll());
    window.addEventListener('invertSelection', () => selection?.invertSelection());
    window.addEventListener('group', () => selection?.groupSelected());
    window.addEventListener('ungroup', () => selection?.ungroupSelected());

    // Primitives: spawn via the same logic as btn-add-cube
    window.addEventListener('addPrimitive', async (e) => {
      const physics = this.plugins._plugins.get('PhysicsPlugin');
      const type = e.detail.type;
      let geo;
      switch (type) {
        case 'cube':
        case 'box':       geo = new THREE.BoxGeometry(0.8, 0.8, 0.8); break;
        case 'sphere':
        case 'uvsphere':  geo = new THREE.SphereGeometry(0.45, 32, 32); break;
        case 'icosphere': geo = new THREE.IcosahedronGeometry(0.45); break;
        case 'cone':      geo = new THREE.ConeGeometry(0.45, 0.9, 24); break;
        case 'cylinder':  geo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 24); break;
        case 'torus':     geo = new THREE.TorusGeometry(0.4, 0.15, 16, 32); break;
        case 'plane':     geo = new THREE.PlaneGeometry(1.2, 1.2); break;
        case 'capsule':   geo = new THREE.CapsuleGeometry(0.3, 0.6, 4, 8); break;
        // Pyramid is a square ConeGeometry (4 radial segments)
        case 'pyramid':   geo = new THREE.ConeGeometry(0.5, 0.9, 4); break;
        case 'text3d': {
          // Try real TextGeometry via three's bundled helvetiker font;
          // gracefully fall back to a thin BoxGeometry if the font load fails.
          try {
            const { TextGeometry } = await import('three/addons/geometries/TextGeometry.js');
            const { FontLoader } = await import('three/addons/loaders/FontLoader.js');
            const font = await new Promise((resolve, reject) => {
              new FontLoader().load(
                'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json',
                resolve, undefined, reject
              );
            });
            geo = new TextGeometry('MEME', { font, size: 0.5, depth: 0.1, curveSegments: 4 });
            geo.center();
          } catch (err) {
            logger.warn('MasterApp', 'Text3D font load failed, using fallback geometry:', err.message || err);
            geo = new THREE.BoxGeometry(0.8, 0.4, 0.1);
          }
          break;
        }
        default:          geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        roughness: 0.4,
        metalness: 0.3
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `${type}_${Date.now()}`;
      mesh.position.set(
        (Math.random() - 0.5) * 6,
        2 + Math.random() * 2,
        (Math.random() - 0.5) * 6
      );
      mesh.userData.isManagedObject = true;
      this.scene.add(mesh);
      physics?.createRigidBody(mesh.name, mesh, { mass: 1 });
      selection?._setSelection([mesh]);
    });

    // ── 3D Text Generator (TextGeometry with rich params) ────────────────────
    // Wired by scene.html's Text Generator modal. The modal dispatches a
    // `generateText3D` CustomEvent with { text, font, size, depth } where size
    // is 1-100 (UI scale) and depth is 0-30 (UI scale). Multipliers map them
    // to Three.js geometry units so the resulting mesh is visible at scene
    // scale (~0.5 units).
    //
    // Fonts: only `helvetiker` is bundled in three.js examples; `space_grotesk`
    // and `roboto_mono` fall back to helvetiker with a warn so the user keeps
    // getting a usable result.
    const TEXT3D_FONT_URLS = {
      helvetiker:     'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json',
      space_grotesk:  'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', // fallback
      roboto_mono:    'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', // fallback
    };
    const TEXT3D_SIZE_SCALE = 0.012;   // UI 100 → geometry 1.2 units
    const TEXT3D_DEPTH_SCALE = 0.012;  // UI 30  → geometry 0.36 units

    // Cache loaded font JSONs so repeated CREATE clicks reuse a single fetch.
    const _text3dFontCache = new Map();
    async function _loadText3dFont(url) {
      if (_text3dFontCache.has(url)) return _text3dFontCache.get(url);
      const { FontLoader } = await import('three/addons/loaders/FontLoader.js');
      const p = new Promise((resolve, reject) => {
        new FontLoader().load(url, resolve, undefined, reject);
      });
      _text3dFontCache.set(url, p);
      return p;
    }

    window.addEventListener('generateText3D', async (e) => {
      const physics = this.plugins._plugins.get('PhysicsPlugin');
      const selection = this.plugins._plugins.get('Selection');
      const detail = e.detail || {};
      const text = (detail.text || 'HODL').toString().slice(0, 12);
      const fontKey = (detail.font || 'space_grotesk').toString();
      const sizeUI = parseFloat(detail.size) || 42;
      const depthUI = parseFloat(detail.depth) || 8.5;
      const fontUrl = TEXT3D_FONT_URLS[fontKey] || TEXT3D_FONT_URLS.helvetiker;
      const isFallback = fontKey !== 'helvetiker';
      let geo;
      try {
        const { TextGeometry } = await import('three/addons/geometries/TextGeometry.js');
        const font = await _loadText3dFont(fontUrl);
        geo = new TextGeometry(text, {
          font,
          size: sizeUI * TEXT3D_SIZE_SCALE,
          depth: depthUI * TEXT3D_DEPTH_SCALE,
          curveSegments: 4,
          bevelEnabled: false,
        });
        geo.center();
        if (isFallback) {
          logger.warn('MasterApp', `Font '${fontKey}' not bundled — using helvetiker fallback.`);
        }
      } catch (err) {
        logger.warn('MasterApp', 'Text3D font load failed, using BoxGeometry fallback:', err.message || err);
        const approxW = text.length * 0.4;
        geo = new THREE.BoxGeometry(approxW, sizeUI * 0.012, depthUI * 0.012);
      }

      const mat = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        roughness: 0.4,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `Text3D_${text}_${Date.now()}`;
      mesh.position.set(
        (Math.random() - 0.5) * 4,
        1.0 + Math.random() * 1.5,
        (Math.random() - 0.5) * 4
      );
      mesh.userData.isManagedObject = true;
      mesh.userData.textContent = text;
      mesh.userData.fontFamily = fontKey;
      this.scene.add(mesh);
      // TextGeometry is dense — default to STATIC body to avoid per-frame physics cost.
      // Users who want gravity/ragdoll can call createRigidBody with mass=0.5 manually.
      selection?._setSelection([mesh]);
      window.dispatchEvent(new CustomEvent('text3d:created', { detail: { name: mesh.name } }));
      logger.log('MasterApp', `Generated 3D text: "${text}" (${mesh.name})`);
    });

    // ── Select by name (driven by Outliner clicks in scene.html) ─────────────
    // The scene outliner is a list of buttons; on click they dispatch
    // `select:byName` with { name }. Here we find the matching scene object
    // (managedObject only) and push it through SelectionPlugin._setSelection.
    window.addEventListener('select:byName', (e) => {
      const target = e.detail?.name;
      if (!target) return;
      let match = null;
      this.scene.traverse(obj => {
        if (match) return;
        if (obj.userData?.isManagedObject && obj.name === target) match = obj;
      });
      if (match) {
        const selection = this.plugins._plugins.get('Selection');
        selection?._setSelection([match]);
      } else {
        logger.warn('MasterApp', `select:byName: no managed object named "${target}"`);
      }
    });

    // Delete selected (also remove physics bodies + water cube-camera RTTs)
    window.addEventListener('delete', () => {
      const sel = this.state.data.selectedObjects;
      if (sel?.length) {
        const bodies = this.state.data.physicsBodies;
        sel.forEach(obj => {
          if (bodies) bodies.delete(obj.uuid);
          this.scene.remove(obj);
          // WaterPlugin holds a cubemap `WebGLRenderTarget` per water mesh.
          // Detaching from scene alone leaks that GFX memory. Notify the
          // plugin so `disposeWater` runs `_renderTarget.dispose()`.
          if (obj.userData && obj.userData.isWater) {
            window.dispatchEvent(new CustomEvent('water:dispose', { detail: { name: obj.name } }));
          }
        });
        selection?._setSelection([]);
      }
    });

    // Duplicate selected
    window.addEventListener('duplicate', () => {
      const sel = this.state.data.selectedObjects;
      if (!sel?.length) return;
      const physics = this.plugins._plugins.get('PhysicsPlugin');
      const newSelection = [];
      sel.forEach(obj => {
        const clone = obj.clone(true);
        clone.name = obj.name + '_copy';
        clone.position.x += 1.5;
        clone.userData.isManagedObject = true;
        this.scene.add(clone);
        physics?.createRigidBody(clone.name, clone, { mass: 1 });
        newSelection.push(clone);
      });
      selection?._setSelection(newSelection);
    });
  }

  // ── Debug Panel Update (throttled to ~1/sec) ──
  _updateDebugPanel(deltaTime) {
    if (this._debugPanelAcc === undefined) this._debugPanelAcc = 0;
    this._debugPanelAcc += deltaTime;
    if (this._debugPanelAcc < 1.0) return;
    this._debugPanelAcc = 0;

    const stateMgr = this.plugins._plugins.get('StateManager');
    if (!stateMgr) return;

    const fps = stateMgr.getState('performance.fps');
    const frameTime = stateMgr.getState('performance.frameTime');
    const mem = stateMgr.getState('performance.memoryMB');
    const outline = stateMgr.getState('render.outlinePass');
    const substeps = stateMgr.getState('physics.substeps');

    const aiAgent = this.plugins._plugins.get('AIAgents');
    const bufSize = aiAgent?._telemetryBuffer?.length ?? 0;
    const expertCount = aiAgent?._experts?.size ?? 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('dbg-fps', fps?.toFixed(0) ?? '--');
    set('dbg-frame', frameTime?.toFixed(1) ?? '--');
    set('dbg-mem', mem?.toFixed(0) ?? '--');
    set('dbg-outline', outline ? 'ON' : 'OFF');
    set('dbg-substeps', substeps ?? '--');
    set('dbg-mw', stateMgr._middleware.length);
    set('dbg-buf', bufSize);
    set('dbg-experts', expertCount);
    set('dbg-listeners', stateMgr._listeners.size);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const deltaTime = this.clock.getDelta();

    // 0. Dispatch FPS telemetry to StateManager for AI experts
    const fps = deltaTime > 0 ? 1 / deltaTime : 60;
    const stateMgr = this.plugins._plugins.get('StateManager');
    if (stateMgr) {
      stateMgr.dispatch({ type: 'PERF/UPDATE_FPS', payload: fps, path: 'performance.fps' });
      stateMgr.dispatch({ type: 'PERF/UPDATE_FRAME_TIME', payload: deltaTime * 1000, path: 'performance.frameTime' });
      if (performance.memory) {
        stateMgr.dispatch({ type: 'PERF/UPDATE_MEMORY', payload: performance.memory.usedJSHeapSize / 1048576, path: 'performance.memoryMB' });
      }
      // Feed physics step time so PhysicsExpert can recommend substep adjustments
      const physics = this.plugins._plugins.get('PhysicsPlugin');
      const physStepMS = physics?._timeStep ? physics._timeStep * 1000 : 0.5;
      stateMgr.dispatch({ type: 'PHYSICS/STEP_TIME', payload: physStepMS, path: 'physics.stepTimeMS' });
    }

    // 1. Update Controls
    this.controls.update();

    // 2. Evaluate Visual Node Graph (Triggers Rust/Go/Lua logic)
    const nodeEvalStart = performance.now();
    this.nodeGraph.evaluate(deltaTime);
    const nodeEvalMS = performance.now() - nodeEvalStart;
    if (stateMgr) {
      stateMgr.dispatch({ type: 'NODE_GRAPH/EVAL_TIME', payload: nodeEvalMS, path: 'nodeGraph.evalTimeMS' });
    }

    // 3. Update Independent Plugins (Animation mixers, Physics steps)
    this.plugins.update(deltaTime);

    // 4. Render physics debug overlay
    this._renderPhysicsDebug();

    // 5. Render
    this.composer.render();

    // 6. Update StateManager debug panel (once per second)
    this._updateDebugPanel(deltaTime);
  }
}

// ── Bootstrap ──
// Expose on window so external pages (studios, debug panels) can read scene/camera
// without having to import MasterApp class directly.
window.app = new MasterApp();
window.app.init().catch((err) => logger.error('MasterApp', err));