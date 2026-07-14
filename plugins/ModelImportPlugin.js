/**
 * ModelImportPlugin - Import 3D models from disk into the scene.
 *
 * Mirrors the existing GoPlugin import pattern (parsePointCloud /
 * importCAD) but for standard 3D model formats. Supported extensions:
 *
 *   .glb   - Binary glTF  (Three.js GLTFLoader handles both)
 *   .gltf  - Text glTF    (same loader, JSON parsed)
 *   .obj   - Wavefront OBJ
 *   .stl   - STereoLithography (binary OR ASCII; loader auto-detects)
 *   .fbx   - Autodesk FBX (binary; with skeleton + animations)
 *
 * Each loader is exposed as a public method (loadGLB, loadGLTF, loadOBJ,
 * loadSTL, loadFBX) so it can be called from a node card, devtools, or a
 * future menu. The unified `loadModel(file, ext)` dispatcher routes by
 * extension and is the canonical entry point for the MasterApp import
 * flow and the `model:import` window event.
 *
 * Non-breaking: this file is purely additive. It does not touch any
 * existing plugin, the existing GoPlugin point-cloud / CAD path, or
 * the existing file-input wiring in MasterApp. MasterApp's `_importFile`
 * gains one extra branch (5 new extensions) but the GoPlugin route is
 * untouched.
 *
 * Window events:
 *   - listens  `model:import`        (CustomEvent with detail: { file, ext })
 *   - dispatches `model:imported`     (CustomEvent with detail: { object, name, ext, animations })
 *   - dispatches `model:import:error` (CustomEvent with detail: { name, ext, error })
 *
 * Resource tracking: every loaded model is registered with the
 * StateManager's GFX resource tracker (type `model-geometry`) so the
 * GfxResourcePanel + AI MemoryExpert can see large GLB/FBX imports
 * accumulating GPU memory, matching the pattern set by GoPlugin
 * (`pointcloud-geometry`) and WaterPlugin (`water-cubemap`).
 *
 * Animation: glTF and FBX carry animation clips. The plugin creates
 * an `AnimationMixer` per model and registers it in
 * `state.data.mixers` (a Map keyed by uuid); AnimationPlugin's
 * per-frame `update(dt)` walks the map and calls `mixer.update(dt)`,
 * so rigged models animate out-of-the-box. Clips are NOT auto-played;
 * the user controls playback via the `Animation/PlayAnimationNode` card
 * or a future menu.
 *
 * Limitations (documented in JSDoc on loadModel):
 *   - Parsing runs on the main thread. A 100MB+ FBX will jank the
 *     UI. Worker-based loading is out of scope for v1.
 *   - Models are centered at the origin (AABB → -center translation)
 *     but NOT rescaled. A 1m and a 100m model are both placed at
 *     `(0,0,0)`; the user scales after import via the TransformGizmo.
 *   - The plugin does NOT toast on success or failure. The caller
 *     (MasterApp._importFile) handles user-visible feedback. The
 *     plugin only logs + dispatches the import:error event so any
 *     toast UI can listen.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

// Extension → loader method name. Lowercased. The dispatcher uses this
// to keep the switch statement in `loadModel` declarative. Adding a new
// format = one line here + one method below.
//
// Exported (not module-private) so MasterApp._initImportHandlers can
// consume this as the single source of truth for model extensions —
// the dedicated #btn-import-model / #model-file-input wiring uses
// `Object.keys(SUPPORTED_EXTS)` to seed its JS-level guard so the
// accept list stays in sync with this dispatch table without a manual
// edit to MasterApp. Keep this map FROZEN so the runtime extension
// iteration order stays stable for tests that assert ordering.
export const SUPPORTED_EXTS = Object.freeze({
  glb:  'loadGLB',
  gltf: 'loadGLTF',
  obj:  'loadOBJ',
  stl:  'loadSTL',
  fbx:  'loadFBX',
});

// A reasonable default material for STL files (which arrive as a bare
// BufferGeometry with no material). MeshStandardMaterial is consistent
// with the rest of the studio (PBR, IBL-friendly).
const _STL_DEFAULT_MATERIAL = () => new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  roughness: 0.55,
  metalness: 0.25,
});

export const ModelImportPlugin = {
  name: 'ModelImport',
  _state: null,
  // Loader instances are created lazily in init() so the import cost
  // (a few hundred KB of Three.js addon code) is paid only when the
  // plugin is actually registered. If the user never imports a model
  // they don't pay.
  _gltfLoader: null,
  _objLoader: null,
  _stlLoader: null,
  _fbxLoader: null,

  init(state) {
    this._state = state;
    try {
      this._gltfLoader = new GLTFLoader();
      this._objLoader  = new OBJLoader();
      this._stlLoader  = new STLLoader();
      this._fbxLoader  = new FBXLoader();
    } catch (err) {
      // If any loader fails to instantiate (e.g. three.js addons not
      // resolvable in the current build), the plugin still works for
      // the formats whose loaders did construct. We just skip the
      // broken ones with a warn.
      logger.warn('ModelImport', 'One or more loaders failed to instantiate:', err && err.message ? err.message : err);
    }
    this._wireWindowEvents();
    this._registerImportSurface();
    logger.log('ModelImport', `Initialized (supported: ${Object.keys(SUPPORTED_EXTS).join(', ')})`);
  },

  // ── Import DOM registration (host: MasterApp._initImportDomHandlers) ──
  //
  // MasterApp installs `import:register-extension` /
  // `import:register-zone-text` listeners at the top of its init()
  // (before any plugin is registered). We dispatch from here so the
  // #import-file-input's accept attribute and the #drop-zone-text
  // overlay stay in sync with our SUPPORTED_EXTS list automatically.
  // Adding a new import format (e.g. .usdz later) = one line in
  // SUPPORTED_EXTS + nothing else — the host UI updates on the next
  // page load with no markup edit.
  //
  // Idempotency: the host uses a Set for extensions and a Map keyed by
  // `category` for zone labels, so duplicate / late-arriving
  // dispatches are safe.
  _registerImportSurface() {
    try {
      const exts = Object.keys(SUPPORTED_EXTS); // ['glb','gltf','obj','stl','fbx']
      window.dispatchEvent(new CustomEvent('import:register-extension', {
        detail: { extensions: exts },
      }));
      window.dispatchEvent(new CustomEvent('import:register-zone-text', {
        detail: { category: 'models', label: '3D models' },
      }));
    } catch (err) {
      // If `window` isn't defined (Node test env with no stub) the
      // registration is silently skipped — the host's fall-through
      // behavior uses the baseline markup in that case.
      logger.warn('ModelImport', 'Could not dispatch import:register-* events:', err && err.message ? err.message : err);
    }
  },

  update(/* dt */) {
    // Animation mixers are advanced by AnimationPlugin.update(), which
    // iterates `state.data.mixers` and calls `mixer.update(dt)`. Models
    // that carry clips register their mixer there in `_processAndCenter`
    // so this plugin does not need a per-frame hook.
  },

  // ── Window event bridge ─────────────────────────────────────────────

  _wireWindowEvents() {
    // Programmatic import: devtools, node cards, future menus dispatch
    // this event with { file, ext } and the plugin does the rest.
    // `model:imported` is fired back on success (consumed by any UI
    // that wants to show "Imported X" or auto-select the result).
    window.addEventListener('model:import', async (e) => {
      const detail = (e && e.detail) || {};
      const { file, ext } = detail;
      if (!file || !ext) {
        logger.warn('ModelImport', 'model:import: missing file or ext in detail');
        return;
      }
      const result = await this.loadModel(file, ext);
      if (result) {
        window.dispatchEvent(new CustomEvent('model:imported', {
          detail: { object: result, name: file.name, ext, animations: result.userData.animations || [] },
        }));
      }
    });
  },

  // ── Public dispatcher ───────────────────────────────────────────────

  /**
   * Single entry point used by the file input + drag-drop paths.
   * Resolves the extension, calls the matching loader, and returns a
   * fully-processed `THREE.Group` ready to add to the scene (centered,
   * shadow-enabled, managed, GFX-tracked, animation mixer registered).
   *
   * @param {File|Blob} file  Source file. Read as ArrayBuffer or text
   *                          internally; the caller does not pre-read.
   * @param {string} ext      Extension WITHOUT the leading dot
   *                          (e.g. 'glb', 'GLB', '.obj' all accepted).
   * @returns {Promise<THREE.Group|null>}  Processed model Group, or
   *                          `null` on failure (error event already
   *                          dispatched + logged).
   */
  async loadModel(file, ext) {
    if (!file) return null;
    const e = (ext || '').toString().replace(/^\./, '').toLowerCase();
    const methodName = SUPPORTED_EXTS[e];
    if (!methodName) {
      logger.warn('ModelImport', `Unsupported extension: "${ext}". Supported: ${Object.keys(SUPPORTED_EXTS).join(', ')}`);
      this._dispatchError(file.name, e, new Error(`Unsupported extension: ${ext}`));
      return null;
    }
    try {
      // OBJLoader needs text; the other three need an ArrayBuffer.
      // Branch on the method to avoid reading the file twice for OBJ.
      let raw;
      if (methodName === 'loadOBJ') {
        raw = await this.loadOBJ(await file.text());
      } else {
        const buffer = await file.arrayBuffer();
        raw = await this[methodName](buffer);
      }
      if (!raw) {
        // Loader returned null (already logged a warn); still surface
        // an error event so devtools / future toasts see it.
        this._dispatchError(file.name, e, new Error('Loader returned null'));
        return null;
      }
      return this._processAndCenter(raw, file.name, e);
    } catch (err) {
      logger.error('ModelImport', `Failed to load ${file.name}:`, err);
      this._dispatchError(file.name, e, err);
      return null;
    }
  },

  // ── Per-format loaders ──────────────────────────────────────────────

  /**
   * Parse a binary .glb file. The GLTFLoader auto-detects .glb vs .gltf
   * (by checking the first 4 bytes for the `glTF` magic), so the same
   * loader handles both formats. We return the `gltf` object (not just
   * `gltf.scene`) so `_processAndCenter` can wire up the animations.
   */
  async loadGLB(arrayBuffer) {
    if (!this._gltfLoader) {
      logger.warn('ModelImport', 'GLTFLoader not available');
      return null;
    }
    return new Promise((resolve, reject) => {
      this._gltfLoader.parse(
        arrayBuffer,
        '', // base path (no external refs for pure .glb)
        (gltf) => resolve({ root: gltf.scene, animations: gltf.animations || [] }),
        (err) => reject(err)
      );
    });
  },

  /** Parse a text .gltf file. Same loader as GLB; the parse() method
   *  detects the format from the input. */
  async loadGLTF(jsonText) {
    if (!this._gltfLoader) {
      logger.warn('ModelImport', 'GLTFLoader not available');
      return null;
    }
    return new Promise((resolve, reject) => {
      this._gltfLoader.parse(
        jsonText,
        '',
        (gltf) => resolve({ root: gltf.scene, animations: gltf.animations || [] }),
        (err) => reject(err)
      );
    });
  },

  /** Parse a Wavefront .obj text file. OBJ has no native animation. */
  async loadOBJ(text) {
    if (!this._objLoader) {
      logger.warn('ModelImport', 'OBJLoader not available');
      return null;
    }
    const group = this._objLoader.parse(text);
    return { root: group, animations: [] };
  },

  /** Parse a .stl file. STL has no material; we wrap the geometry in a
   *  Mesh with a sensible default PBR material. No animation. */
  async loadSTL(arrayBuffer) {
    if (!this._stlLoader) {
      logger.warn('ModelImport', 'STLLoader not available');
      return null;
    }
    const geometry = this._stlLoader.parse(arrayBuffer);
    geometry.computeVertexNormals(); // STL doesn't ship normals; smooth them.
    const material = _STL_DEFAULT_MATERIAL();
    const mesh = new THREE.Mesh(geometry, material);
    return { root: mesh, animations: [] };
  },

  /** Parse a binary .fbx file. FBX often carries skeleton + clips; we
   *  return both so the caller can wire the mixer. */
  async loadFBX(arrayBuffer) {
    if (!this._fbxLoader) {
      logger.warn('ModelImport', 'FBXLoader not available');
      return null;
    }
    const group = this._fbxLoader.parse(arrayBuffer);
    // FBXLoader attaches animations to the returned object as
    // `.animations`. (Some old docs say `.anim`; r170 uses `.animations`.)
    return { root: group, animations: group.animations || [] };
  },

  // ── Post-load processing ────────────────────────────────────────────

  /**
   * Wrap a loaded model + its animations into the final scene-ready
   * Group. Steps:
   *   1. Ensure the root is a Group (STL returns a Mesh, others a Group).
   *   2. Walk the tree: set castShadow + receiveShadow on every Mesh,
   *      and `userData.isManagedObject = true` on every node (so the
   *      scene-graph traversals in Selection, Outliner, etc. pick up
   *      the children too, not just the root).
   *   3. Center the AABB at the origin (no rescale).
   *   4. Track the GFX byte cost with the StateManager.
   *   5. If animations exist, create an AnimationMixer and register
   *      it in `state.data.mixers` so AnimationPlugin's update loop
   *      advances the playback. Clips are also registered in
   *      `state.data.clips` for the PlayAnimationNode to look up by
   *      name.
   *
   * The returned Group is the user-facing handle. Add it to the scene
   * with `scene.add(group)` and call `selection._setSelection([group])`
   * to activate the gizmo + outliner.
   */
  _processAndCenter({ root, animations }, filename, ext) {
    // STL arrives as a Mesh (no group). Wrap in a Group so callers
    // can rely on `.isGroup === true` for outliner/transform handles.
    let group;
    if (root.isGroup) {
      group = root;
    } else {
      group = new THREE.Group();
      group.name = filename.replace(/\.[^.]+$/, '');
      group.add(root);
    }
    if (!group.name) group.name = filename.replace(/\.[^.]+$/, '') || `Model_${Date.now()}`;
    group.name = `${group.name}_${Date.now()}`; // avoid name collisions across re-imports
    group.userData.isManagedObject = true;
    group.userData.importSource = filename;
    group.userData.importExt = ext;
    group.userData.animations = animations;

    // Shadow flags + managed flag on every descendant mesh. The
    // Selection / Outliner / delete-listener pipeline checks
    // `userData.isManagedObject` on the root AND on children, so we
    // set it on every node to keep traversals consistent. (Mirrors
    // GoPlugin's CAD import pattern.)
    group.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        if (!c.userData) c.userData = {};
        c.userData.isManagedObject = true;
        // If the mesh has no name (some OBJ meshes), give it one so
        // outliner items don't all show as "".
        if (!c.name) c.name = `${group.name}_part_${c.id}`;
      }
    });

    // Center the AABB at the origin. This does NOT change the model's
    // apparent scale; a 100m-tall building and a 1m cube both end up
    // centered at (0,0,0). Users rescale via the TransformGizmo.
    this._centerAtOrigin(group);

    // GFX resource tracking. The id is namespaced by format so the
    // GfxResourcePanel can group by type ("glb" vs "fbx" vs "obj").
    // Sum every geometry's position + index + (if present) normal
    // + uv byte lengths. A typical glTF is 5-30MB on disk, ~20-80MB
    // in GPU memory (uncompressed attributes + indices).
    const sm = this._getStateManager();
    if (sm && typeof sm.trackGfxResource === 'function') {
      let bytes = 0;
      group.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        const g = obj.geometry;
        for (const attr of ['position', 'normal', 'uv', 'uv2', 'color', 'tangent']) {
          if (g.attributes[attr]) bytes += g.attributes[attr].array.byteLength;
        }
        if (g.index) bytes += g.index.array.byteLength;
      });
      const id = `model/${group.uuid}`;
      sm.trackGfxResource(id, bytes, `${ext}-geometry`, group.name);
      group.userData.gfxResourceId = id;
    }

    // Animation wiring. Register each clip in `state.data.clips`
    // (Map<name, AnimationClip>) and create a mixer for the root
    // group. Clips are NOT auto-played; the user starts them via
    // Animation/PlayAnimationNode or future menu actions.
    if (animations && animations.length > 0 && this._state) {
      const mixers = this._state.data.mixers;
      const clips = this._state.data.clips;
      if (mixers instanceof Map && clips instanceof Map) {
        const mixer = new THREE.AnimationMixer(group);
        mixers.set(group.uuid, mixer);
        animations.forEach((clip, i) => {
          // If the clip has no name (some FBX exports), give it one
          // so the PlayAnimationNode can look it up.
          if (!clip.name) clip.name = `${group.name}_clip_${i}`;
          clips.set(clip.name, clip);
        });
        logger.log('ModelImport', `Registered ${animations.length} animation clip(s) on "${group.name}"`);
      }
    }

    logger.log('ModelImport', `Imported "${filename}" (${ext}, ${animations.length} clip(s), ${group.children.length} top-level children)`);
    return group;
  },

  /**
   * Translate the entire subtree so its axis-aligned bounding box is
   * centered at the world origin. Uses a `Box3` (not a `Sphere`) so
   * the visual result matches what the user sees. The translation is
   * applied in-place on the root Group's position; child positions
   * are not modified.
   *
   * If the model is empty or the BBox is degenerate (all vertices at
   * one point), this is a no-op.
   */
  _centerAtOrigin(root) {
    const box = new THREE.Box3();
    // `expandByObject` walks the tree and includes every geometry. The
    // world-matrix propagation is required because meshes default to
    // `matrixAutoUpdate=true` but their `matrixWorld` is only current
    // on the next render frame. We force an update here.
    root.updateMatrixWorld(true);
    box.expandByObject(root);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
      // Degenerate BBox (all NaN/inf). Skip; do not corrupt the
      // user's transform with garbage values.
      return;
    }
    // Move the root so the bbox center lands at (0,0,0). Equivalently
    // translate every vertex by `-center`, but translating the root
    // is cheaper and preserves the loaded geometry's original data.
    root.position.sub(center);
  },

  // ── StateManager accessor (mirrors GoPlugin's helper) ──────────────
  _getStateManager() {
    return this._state && this._state.data && this._state.data.pluginManager
      ? this._state.data.pluginManager._plugins && this._state.data.pluginManager._plugins.get('StateManager')
      : null;
  },

  _dispatchError(name, ext, err) {
    window.dispatchEvent(new CustomEvent('model:import:error', {
      detail: { name, ext, error: err && err.message ? err.message : String(err) },
    }));
  },

  // ── Node-graph integration ──────────────────────────────────────────
  /**
   * Visual node card for the brutalist node graph. Users can drop a
   * .glb/.gltf/.obj/.stl/.fbx file onto the input and click IMPORT.
   * The card delegates to `loadModel(file, ext)` via the standard
   * `data-action="run"` plumbing that MasterApp._registerNodeInGraph
   * already wires to `nodeGraph.executeNodeOnDemand(nodeData)`.
   */
  nodes: {
    'Model/ImportModelNode': function importModelNodeCard(x, y) {
      const body = document.createElement('div');
      body.className = 'model-import-body';
      body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';
      body.innerHTML = [
        '<label style="font-size:10px;color:#84967c;">FILE (.glb / .gltf / .obj / .stl / .fbx)</label>',
        '<input type="file" class="node-input" data-prop="file" accept=".glb,.gltf,.obj,.stl,.fbx" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;font-size:10px;">',
        '<button class="model-import-run" data-action="run" style="margin-top:6px;background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;">\u25B6 IMPORT MODEL</button>',
      ].join('');
      return createNodeCard(
        x, y,
        '\uD83D\uDCBE Import Model',
        ['File'],
        ['Group'],
        { body, extraClasses: ['node-card-model-import'] }
      );
    },
  },

  /**
   * Called from NodeGraphExecutor when a `Model/ImportModelNode` is
   * executed on-demand. Reads the `file` input element from the parsed
   * DOM, extracts the extension, and routes through the unified
   * `loadModel` dispatcher. The returned Group is auto-added to the
   * scene + auto-selected by the standard `_applyGeometryToScene`
   * helper in NodeGraphExecutor (which is reused for the Go Wasm
   * nodes). Because STL is a Mesh and the others are Groups, the
   * helper wraps the result in a Mesh if needed; for our case the
   * loader already returns a Group/Mesh, so we just return it.
   */
  async executeNode(node, parsed) {
    const fileInput = parsed && parsed.file;
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
      logger.warn('ModelImport', 'executeNode: no file selected');
      return null;
    }
    const file = fileInput.files[0];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return this.loadModel(file, ext);
  },
};
