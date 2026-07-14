/**
 * RustPlugin - Heavy computation via Rust WebAssembly.
 * Handles CSG booleans, mesh decimation, BVH generation, and physics simulation.
 */
import * as THREE from 'three';
import { RustGeometryBridge } from '../bindings/WasmBridge.js';

export const RustPlugin = {
  name: 'Rust',
  _state: null,
  _wasmModule: null,
  _isInitialized: false,
  _taskQueue: [],

  async init(state) {
    this._state = state;

    // Initialize Rust Wasm module
    await this._initWasm();

    state.on('rust:task:queued', (task) => {
      this._processQueue();
    });
  },

  async _initWasm() {
    try {
      // The actual Wasm module is loaded by bindings/WasmBridge.js.
      // RustGeometryBridge exposes the geometry functions and gracefully
      // degrades if the Wasm binary is unavailable.
      this._wasmModule = RustGeometryBridge;
      this._isInitialized = true;
      console.log('[Rust] Wasm bridge initialized');
    } catch (err) {
      console.error('[Rust] Failed to initialize Wasm bridge:', err);
    }
  },

  /**
   * Performs Boolean CSG operation (Union, Subtract, Intersect)
   */
  async booleanCSG(meshA, meshB, operation) {
    if (!this._isInitialized) {
      console.warn('[Rust] Wasm not initialized');
      return null;
    }

    const result = await this._wasmModule.computeBoolean(meshA, meshB, operation);

    if (!result || !result.positions) {
      console.warn('[Rust] CSG operation returned no result');
      return null;
    }

    // Rebuild Three.js geometry from Rust output
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
    if (result.indices) {
      newGeometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
    }
    newGeometry.computeVertexNormals();

    return newGeometry;
  },

  /**
   * Decimates mesh to reduce polygon count
   */
  async decimateMesh(mesh, targetPercent) {
    if (!this._isInitialized) return null;

    const result = await this._wasmModule.decimateMesh(mesh, targetPercent);

    if (!result || !result.positions) {
      console.warn('[Rust] Decimation returned no result');
      return null;
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
    if (result.indices) {
      newGeometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
    }
    newGeometry.computeVertexNormals();

    return newGeometry;
  },

  /**
   * Generates BVH (Bounding Volume Hierarchy) for fast raycasting
   */
  async generateBVH(mesh) {
    if (!this._isInitialized) return null;

    const bvhData = await this._wasmModule.generateBVH(mesh);

    mesh.userData.bvh = bvhData;
    return bvhData;
  },

  /**
   * Applies physics forces to rigid bodies
   */
  async applyPhysicsForces(bodies, deltaTime) {
    if (!this._isInitialized) return;

    const bodyData = bodies.map(b => ({
      position: [b.position.x, b.position.y, b.position.z],
      velocity: [b.velocity.x, b.velocity.y, b.velocity.z],
      mass: b.mass
    }));

    const updatedBodies = await this._wasmModule.stepPhysics(bodyData, deltaTime);

    // Apply results back to Three.js objects
    updatedBodies.forEach((data, i) => {
      bodies[i].position.set(data.position[0], data.position[1], data.position[2]);
      bodies[i].velocity.set(data.velocity[0], data.velocity[1], data.velocity[2]);
    });
  },

  update(deltaTime) {
    // Process queued tasks
    this._processQueue();
  },

  _processQueue() {
    if (this._taskQueue.length === 0) return;

    const task = this._taskQueue.shift();
    task.execute().then(result => {
      if (task.callback) task.callback(result);
    });
  },

  nodes: {
    'Rust/BooleanCSGNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">🧊 Boolean CSG (Rust)</div>
        <div class="node-body">
          <p style="font-size:10px;color:#888;margin:4px 0;">Uses first 2 selected meshes</p>
          <label>Operation:</label>
          <select class="node-input" data-prop="operation">
            <option value="union">Union</option>
            <option value="subtract">Subtract</option>
            <option value="intersect">Intersect</option>
          </select>
        </div>
        <button class="run-node-btn" data-action="run">Run CSG</button>
        <div class="node-outputs">
          <span data-type="Mesh">Result Mesh</span>
        </div>
      `;
      return el;
    },

    'Rust/DecimateNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">📉 Decimate Mesh (Rust)</div>
        <div class="node-body">
          <p style="font-size:10px;color:#888;margin:4px 0;">Uses first selected mesh</p>
          <label>Target %:</label>
          <input type="range" class="node-input" data-prop="percent" min="10" max="100" value="50" />
          <span class="percent-value" style="font-size:10px;color:#aaa;">50%</span>
        </div>
        <button class="run-node-btn" data-action="run">Run Decimate</button>
        <div class="node-outputs">
          <span data-type="Mesh">Decimated Mesh</span>
        </div>
      `;
      return el;
    },

    'Rust/PhysicsStepNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">⚡ Physics Step (Rust)</div>
        <div class="node-body">
          <label>Gravity:</label>
          <input type="number" class="node-input" data-prop="gravity" value="-9.81" step="0.1" />
        </div>
        <div class="node-outputs">
          <span data-type="Array">Updated Bodies</span>
        </div>
      `;
      return el;
    }
  }
};
