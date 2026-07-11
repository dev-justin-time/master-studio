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
    this.controls = null;
    this.clock = new THREE.Clock();

    // Physics debug
    this._physicsDebug = false;
    this._debugGroup = null;

    // 3. State Initialization
    this.state.set('scene', this.scene);
    this.state.set('camera', this.camera);
  }

  async init() {
    this._initRenderer();
    this._initLights();
    this._initPostProcessing();

    // Register Plugins
    this.plugins.register(RiggingPlugin);
    this.plugins.register(AnimationPlugin);
    this.plugins.register(PhysicsPlugin);
    this.plugins.register(ProceduralPlugin);
    this.plugins.register(AIBehaviorPlugin);
    this.plugins.register(GameMapPlugin);
    this.plugins.register(SelectionPlugin);

    this._initNodeEditorUI();
    this._initToolbarButtons();
    this._initKeybindings();
    this._initDemoScene();

    // Initialize Wasm Modules (Rust/Go/Lua)
    await this._initWasmModules();

    // Start Render Loop
    this._animate();

    console.log('[MasterApp] Initialized successfully.');
  }

  _initRenderer() {
    const canvas = document.getElementById('renderCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
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

    const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.scene, this.camera);
    outlinePass.edgeStrength = 3;
    outlinePass.visibleEdgeColor.set('#00ff00');
    this.composer.addPass(outlinePass);
  }

  async _initWasmModules() {
    console.log('[MasterApp] Initializing WebAssembly modules...');
    // await import('./wasm/geometry_core_bg.wasm');
    // await import('./wasm/physics_core_bg.wasm');
    // await import('./wasm/fengari_lua_bg.wasm');
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
      console.log('[Toolbar] Spawned cube:', cube.name);
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
          selection?.groupSelected();
          break;
        case key === 'u' && !ctrl:
          selection?.ungroupSelected();
          break;
        case key === 'i' && !ctrl:
          selection?.invertSelection();
          break;
        case key === 's' && !ctrl:
          e.preventDefault();
          selection?.toggleStickySelect();
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
    console.log('[PhysicsDebug]', this._physicsDebug ? 'ON' : 'OFF');
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
        console.log('[Demo] Terrain generated:', world?.name);
      });
    }

    console.log(`[Demo] Scene initialized with ${colors.length} selectable objects + terrain`);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const deltaTime = this.clock.getDelta();

    // 1. Update Controls
    this.controls.update();

    // 2. Evaluate Visual Node Graph (Triggers Rust/Go/Lua logic)
    this.nodeGraph.evaluate(deltaTime);

    // 3. Update Independent Plugins (Animation mixers, Physics steps)
    this.plugins.update(deltaTime);

    // 4. Render physics debug overlay
    this._renderPhysicsDebug();

    // 5. Render
    this.composer.render();
  }
}

// ── Bootstrap ──
const app = new MasterApp();
app.init().catch(console.error);
