/**
 * GoPlugin - Concurrent asset processing via Go WebAssembly.
 * Handles point cloud parsing, CAD import, and background tasks.
 */
import * as THREE from 'three';
import { GoAssetBridge } from '../bindings/WasmBridge.js';
import { logger } from '../core/Logger.js';

export const GoPlugin = {
  name: 'Go',
  _state: null,
  _wasmModule: null,
  _isInitialized: false,
  _workerPool: [],
  _maxWorkers: 4,

  async init(state) {
    this._state = state;

    // Initialize Go Wasm module via the shared bridge
    await this._initWasm();

    // Create worker pool for concurrent processing
    this._initWorkerPool();

    // Register our accepted extensions + drop-zone descriptors with
    // the host's import DOM registry (MasterApp._initImportDomHandlers
    // installed the listeners at the top of init() so they are
    // already up by the time we dispatch). Mirrors the pattern in
    // plugins/ModelImportPlugin.js — each plugin owns its own format
    // list so the host UI composes dynamically. Adding a new Wasm
    // format (e.g. .xyz for academic LiDAR) is a one-line edit here
    // — no MasterApp / index.html change required.
    //
    // Idempotency: listener uses a Set for extensions + a Map keyed
    // by `category` for zone labels, so duplicate / late-arriving
    // dispatches are safe.
    this._registerImportSurface();
  },

  // ── Import DOM registration (host: MasterApp._initImportDomHandlers) ──
  //
  // Dispatches `import:register-extension` once with all 6 Wasm
  // formats (.las / .ply / .step / .iges / .stp / .igs) and
  // `import:register-zone-text` twice — once per logical category
  // (point clouds vs CAD). Each category is a separate dispatch so
  // future plugin splits (e.g. adding a "scan" category independent
  // of "pointclouds") require zero changes here.
  //
  // Wrapped in try/catch so an unusual execution context (no `window`,
  // SSR-like env, test runner without a stub) doesn't blow up the
  // Wasm init — the dispatch is purely a UI hint.
  _registerImportSurface() {
    try {
      window.dispatchEvent(new CustomEvent('import:register-extension', {
        detail: { extensions: ['.las', '.ply', '.step', '.iges', '.stp', '.igs'] },
      }));
      window.dispatchEvent(new CustomEvent('import:register-zone-text', {
        detail: { category: 'pointclouds', label: 'point clouds' },
      }));
      window.dispatchEvent(new CustomEvent('import:register-zone-text', {
        detail: { category: 'cad', label: 'CAD' },
      }));
    } catch (err) {
      logger.warn('Go', 'Could not dispatch import:register-* events:', err && err.message ? err.message : err);
    }
  },

  async _initWasm() {
    try {
      // GoAssetBridge is initialized by bindings/WasmBridge.js and
      // gracefully degrades if the Go Wasm binary is unavailable.
      this._wasmModule = GoAssetBridge;
      this._isInitialized = true;
      logger.log('Go', 'Wasm bridge initialized');
    } catch (err) {
      logger.error('Go', 'Failed to initialize Wasm bridge:', err);
    }
  },

  // ── StateManager accessor (shared with LightingPlugin's pattern) ──
  // Used to track / release GFX resources (point cloud geometries,
  // CAD groups) so the GfxResourcePanel + AIAgent MemoryExpert can
  // detect accumulation beyond just water-cubemaps.
  _getStateManager() {
    return this._state && this._state.data && this._state.data.pluginManager
      ? this._state.data.pluginManager._plugins && this._state.data.pluginManager._plugins.get('StateManager')
      : null;
  },

  _initWorkerPool() {
    for (let i = 0; i < this._maxWorkers; i++) {
      this._workerPool.push({
        id: i,
        busy: false,
        task: null
      });
    }
  },

  /**
   * Parses point cloud data (LAS/PLY) concurrently
   */
  async parsePointCloud(fileBuffer) {
    if (!this._isInitialized) return null;

    const worker = this._getAvailableWorker();
    if (!worker) {
      logger.warn('Go', 'No workers available, queuing task');
      return new Promise(resolve => {
        setTimeout(() => {
          this.parsePointCloud(fileBuffer).then(resolve);
        }, 100);
      });
    }

    worker.busy = true;

    try {
      const result = await this._wasmModule.parsePointCloud(fileBuffer);

      if (!result || !result.positions) {
        logger.warn('Go', 'Point cloud parsing returned no result');
        return null;
      }

      // Convert to Three.js Points
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
      if (result.colors) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(result.colors, 3));
      }

      const material = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: !!result.colors
      });

      const points = new THREE.Points(geometry, material);
      points.name = 'PointCloud_' + Date.now();
      points.userData.isManagedObject = true;

      // Track the point cloud geometry as a GFX resource so the
      // GfxResourcePanel + MemoryExpert can see large imports. A
      // typical LiDAR scan is 10-50MB; a 5M-point cloud is ~60MB.
      const sm = this._getStateManager();
      if (sm && typeof sm.trackGfxResource === 'function') {
        let bytes = geometry.attributes.position.array.byteLength;
        if (geometry.attributes.color) bytes += geometry.attributes.color.array.byteLength;
        const id = `pointcloud/${points.uuid}`;
        sm.trackGfxResource(id, bytes, 'pointcloud-geometry', points.name);
        points.userData.gfxResourceId = id;
      }

      return points;
    } finally {
      worker.busy = false;
    }
  },

  /**
   * Imports CAD files (STEP/IGES) with concurrent meshing
   */
  async importCAD(fileBuffer) {
    if (!this._isInitialized) return null;

    const worker = this._getAvailableWorker();
    if (!worker) return null;

    worker.busy = true;

    try {
      const result = await this._wasmModule.importCAD(fileBuffer);

      if (!result || !result.meshes) {
        logger.warn('Go', 'CAD import returned no result');
        return null;
      }

      const group = new THREE.Group();
      group.name = 'CAD_Model_' + Date.now();
      group.userData.isManagedObject = true;

      result.meshes.forEach((meshData, i) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.5,
          roughness: 0.5
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `CAD_Part_${i}`;
        mesh.userData.isManagedObject = true;
        group.add(mesh);
      });

      // Track the CAD group as a GFX resource (sum of all child
      // geometry byte lengths — position + index + normal arrays).
      // A typical STEP file is 5-20MB; the panel + MemoryExpert can
      // now see imports pile up.
      const sm = this._getStateManager();
      if (sm && typeof sm.trackGfxResource === 'function') {
        let bytes = 0;
        group.traverse((obj) => {
          if (!obj.isMesh || !obj.geometry) return;
          if (obj.geometry.attributes.position) bytes += obj.geometry.attributes.position.array.byteLength;
          if (obj.geometry.index) bytes += obj.geometry.index.array.byteLength;
          if (obj.geometry.attributes.normal) bytes += obj.geometry.attributes.normal.array.byteLength;
        });
        const id = `cad/${group.uuid}`;
        sm.trackGfxResource(id, bytes, 'cad-geometry', group.name);
        group.userData.gfxResourceId = id;
      }

      return group;
    } finally {
      worker.busy = false;
    }
  },

  /**
   * Streams large file chunks for processing
   */
  async streamFileChunks(fileBuffer, chunkSize, processFn) {
    if (!this._isInitialized) return;

    const totalChunks = Math.ceil(fileBuffer.byteLength / chunkSize);
    const promises = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileBuffer.byteLength);
      const chunk = fileBuffer.slice(start, end);

      promises.push(
        this._processChunk(chunk, i, processFn)
      );
    }

    await Promise.all(promises);
  },

  async _processChunk(chunk, index, processFn) {
    const worker = this._getAvailableWorker();
    if (!worker) return;

    worker.busy = true;

    try {
      const result = await processFn(chunk, index);
      return result;
    } finally {
      worker.busy = false;
    }
  },

  _getAvailableWorker() {
    return this._workerPool.find(w => !w.busy);
  },

  update(deltaTime) {
    // Monitor worker pool health
    const busyCount = this._workerPool.filter(w => w.busy).length;
    this._state.emit('go:worker:status', {
      total: this._maxWorkers,
      busy: busyCount,
      available: this._maxWorkers - busyCount
    });
  },

  nodes: {
    'Go/ParsePointCloudNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">☁️ Parse Point Cloud (Go)</div>
        <div class="node-body">
          <input type="file" class="node-input" data-prop="file" accept=".las,.ply" />
          <label>Point Size:</label>
          <input type="number" class="node-input" data-prop="size" value="0.1" step="0.01" />
        </div>
        <button class="run-node-btn" data-action="run">Parse Point Cloud</button>
        <div class="node-outputs">
          <span data-type="Points">Point Cloud</span>
        </div>
      `;
      return el;
    },

    'Go/ImportCADNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">📐 Import CAD (Go)</div>
        <div class="node-body">
          <input type="file" class="node-input" data-prop="file" accept=".step,.iges" />
          <label>Tolerance:</label>
          <input type="number" class="node-input" data-prop="tolerance" value="0.001" step="0.0001" />
        </div>
        <button class="run-node-btn" data-action="run">Import CAD</button>
        <div class="node-outputs">
          <span data-type="Group">CAD Model</span>
        </div>
      `;
      return el;
    },

    'Go/WorkerStatusNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">📊 Worker Pool Status</div>
        <div class="node-body" style="font-size:10px;">
          <div id="go-worker-status">Workers: 0/4 busy</div>
        </div>
        <div class="node-outputs">
          <span data-type="Boolean">Pool Available</span>
        </div>
      `;
      return el;
    }
  }
};
