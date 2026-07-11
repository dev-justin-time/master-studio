/**
 * WasmBridge - Loads and initializes Rust and Go WebAssembly modules.
 * Falls back gracefully if a module is unavailable.
 */

let rustModule = null;
let goModule = null;
let rustReady = false;
let goReady = false;

/**
 * Initialize both Wasm modules. Called once during app startup.
 */
export async function initWasmModules() {
  // Load Rust Wasm (wasm-pack web target)
  try {
    rustModule = await import('../wasm/pkg/rust_core.js');
    if (rustModule.default) {
      await rustModule.default();
    }
    rustReady = true;
    console.log('[WasmBridge] Rust module loaded');
  } catch (err) {
    console.warn('[WasmBridge] Rust module not available:', err);
    rustReady = false;
  }

  // Load Go Wasm
  try {
    await import('../wasm/pkg/wasm_exec.js');
    const go = new window.Go();
    const response = await fetch('../wasm/pkg/go_engine.wasm');
    const result = await WebAssembly.instantiateStreaming(response, go.importObject);
    go.run(result.instance);
    goReady = true;
    console.log('[WasmBridge] Go module loaded');
  } catch (err) {
    console.warn('[WasmBridge] Go module not available:', err);
    goReady = false;
  }
}

// ── Rust Geometry Bridge ────────────────────────────────────────────────────

export const RustGeometryBridge = {
  computeBoolean: async (meshA, meshB, operation) => {
    if (!rustReady || !rustModule) {
      console.warn('[RustGeometryBridge] Rust Wasm not ready');
      return meshA;
    }

    const posA = meshA.geometry.attributes.position.array;
    const idxA = meshA.geometry.index?.array;
    const posB = meshB.geometry.attributes.position.array;
    const idxB = meshB.geometry.index?.array;

    return rustModule.compute_boolean(posA, idxA, posB, idxB, operation);
  },

  decimateMesh: async (mesh, percent) => {
    if (!rustReady || !rustModule) {
      console.warn('[RustGeometryBridge] Rust Wasm not ready');
      return mesh.geometry;
    }

    const positions = mesh.geometry.attributes.position.array;
    const indices = mesh.geometry.index?.array;

    return rustModule.decimate_mesh(positions, indices, percent);
  },

  generateBVH: async (mesh) => {
    if (!rustReady || !rustModule) {
      console.warn('[RustGeometryBridge] Rust Wasm not ready');
      return null;
    }

    const positions = mesh.geometry.attributes.position.array;
    const indices = mesh.geometry.index?.array;

    return rustModule.generate_bvh(positions, indices);
  }
};

export const RustPhysicsBridge = {
  stepPhysics: async (bodies, deltaTime) => {
    if (!rustReady || !rustModule) {
      console.warn('[RustPhysicsBridge] Rust Wasm not ready');
      return bodies;
    }

    const bodyData = bodies.map(b => ({
      position: [b.position.x, b.position.y, b.position.z],
      velocity: [b.velocity.x, b.velocity.y, b.velocity.z],
      mass: b.mass
    }));

    return rustModule.step_physics(bodyData, deltaTime);
  }
};

// ── Go Asset Bridge ──────────────────────────────────────────────────────────

export const GoAssetBridge = {
  parsePointCloud: async (fileBuffer) => {
    if (!goReady || !window.goParsePointCloud) {
      console.warn('[GoAssetBridge] Go Wasm not ready');
      return null;
    }

    return window.goParsePointCloud(fileBuffer);
  },

  importCAD: async (fileBuffer) => {
    if (!goReady || !window.goImportCAD) {
      console.warn('[GoAssetBridge] Go Wasm not ready');
      return null;
    }

    return window.goImportCAD(fileBuffer);
  }
};

// Expose to window for the NodeGraphExecutor to access easily
if (typeof window !== 'undefined') {
  window.RustGeometryBridge = RustGeometryBridge;
  window.RustPhysicsBridge = RustPhysicsBridge;
  window.GoAssetBridge = GoAssetBridge;
  window.initWasmModules = initWasmModules;
}
