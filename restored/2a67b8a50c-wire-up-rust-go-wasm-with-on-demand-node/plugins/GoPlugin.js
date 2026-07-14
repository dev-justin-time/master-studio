/**
 * GoPlugin - Concurrent asset processing via Go WebAssembly.
 * Handles point cloud parsing, CAD import, and background tasks.
 */
import * as THREE from 'three';
import { GoAssetBridge } from '../bindings/WasmBridge.js';

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
  },

  async _initWasm() {
    try {
      // GoAssetBridge is initialized by bindings/WasmBridge.js and
      // gracefully degrades if the Go Wasm binary is unavailable.
      this._wasmModule = GoAssetBridge;
      this._isInitialized = true;
      console.log('[Go] Wasm bridge initialized');
    } catch (err) {
      console.error('[Go] Failed to initialize Wasm bridge:', err);
    }
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
      console.warn('[Go] No workers available, queuing task');
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
        console.warn('[Go] Point cloud parsing returned no result');
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
        console.warn('[Go] CAD import returned no result');
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
