/**
 * tests/ModelImport.test.js
 *
 * Loader-method unit tests for the ModelImportPlugin. Runs with Node's
 * built-in `node:test` runner — no extra dependencies required. The
 * project is `"type": "module"` in package.json, so ESM imports work
 * out of the box.
 *
 * Run with:
 *   node --test tests/ModelImport.test.js
 *
 * Or via the new package script (added alongside this file):
 *   npm test
 *
 * Test plan:
 *
 *   1. loadOBJ (REAL loader) — verifies that OBJLoader.handleOBJ-style
 *      text parsing flows through the plugin correctly. Fixture: 4
 *      `v` lines + 1 triangular `f` line; expectation: root Group walks
 *      to a Mesh whose BufferGeometry has a `position` attribute with
 *      exactly 3 entries.
 *
 *   2. loadSTL (REAL loader) — verifies the binary-STL parse path.
 *      Fixture: a 134-byte ArrayBuffer laid out as
 *      `[80-byte header, 4-byte uint32 LE count=1, 50-byte triangle]`.
 *      The triangle's vertices and normal are all zeros (an "empty"
 *      triangle at the origin). Expectation: root.isMesh === true +
 *      `position.count === 3`.
 *
 *   3. loadModel DISPATCHER (5 mocked per-method loaders) — verifies
 *      that the SUPPORTED_EXTS map correctly routes by extension, that
 *      the dispatcher lowercases + strips the leading dot, and that
 *      an unsupported extension returns null and emits a
 *      `model:import:error` window event.
 *
 * Why mock instead of fixture for GLB/GLTF/FBX?
 *   GLB is a tightly-spec'd binary container; FBX is even worse (the
 *   public spec was withdrawn in 2006 and r170 still uses an old
 *   ASCII+v7 binary mixer that doesn't roundtrip through manual
 *   construction). Rather than ship a tiny binary fixture we'd have
 *   to maintain byte-by-byte, mocking the per-method methods lets us
 *   isolate the dispatcher's behavior (which is the actual user-facing
 *   surface) and trust Three.js's own loader tests for the parse path.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { ModelImportPlugin } from '../plugins/ModelImportPlugin.js';

// The plugin reads `window` on init (it installs window listeners for
// the model:import event). Node 18+ exposes globalThis as an object,
// so we install a minimal stub. Restored to undefined after each test
// to keep test isolation in case other suites touch the same global.
const originalWindow = globalThis.window;
beforeEach(() => {
  globalThis.window = makeStubWindow();
});
afterEach(() => {
  globalThis.window = originalWindow;
});

// ── Test helpers ─────────────────────────────────────────────────────────

/**
 * Minimal stub for the parts of `window` the plugin touches.
 * Tracks the handlers registered for each event so dispatch tests
 * can assert on emissions and the dispatcher test can listen for
 * `model:import:error`.
 */
function makeStubWindow() {
  const handlers = new Map();
  const dispatched = []; // log every event the plugin fires — tests assert on this
  return {
    addEventListener(name, handler) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(handler);
    },
    removeEventListener(name, handler) {
      const list = handlers.get(name);
      if (!list) return;
      const i = list.indexOf(handler);
      if (i !== -1) list.splice(i, 1);
    },
    dispatchEvent(event) {
      dispatched.push(event);
      const list = handlers.get(event.type) || [];
      // Snapshot in case a handler calls removeEventListener.
      for (const h of list.slice()) {
        try { h(event); } catch (_) { /* swallow handler errors in tests */ }
      }
      return true;
    },
    _handlers: handlers,
    _dispatched: dispatched,
  };
}

/**
 * Build a mock MasterState with just the surface the plugin touches:
 *   - data.scene (no-op add)
 *   - data.pluginManager._plugins.get('StateManager').trackGfxResource
 *   - data.mixers (Map)
 *   - data.clips (Map)
 * Also returns a `smCalls` array recording every trackGfxResource call,
 * so tests can assert that importWiring registered a row.
 */
function makeMockState() {
  const smCalls = [];
  const scene = { add() {}, remove() {}, traverse() {} };
  const stateManager = {
    trackGfxResource(id, bytes, type, label) {
      smCalls.push({ id, bytes, type, label });
    },
    releaseGfxResource() {},
  };
  const pluginManager = {
    _plugins: new Map([['StateManager', stateManager]]),
  };
  const data = {
    scene,
    pluginManager,
    mixers: new Map(),
    clips: new Map(),
    selectedObjects: [],
  };
  return {
    state: {
      data,
      set() {}, emit() {}, on() {},
    },
    smCalls,
  };
}

/**
 * Spread-copy the singleton plugin into a fresh instance so each test
 * starts with a clean `this` (loaders, _state). Calls `init()` so
 * each per-method loader is instantiated.
 *
 * @returns {{ plugin, state, smCalls }}
 */
function setupPlugin() {
  const { state, smCalls } = makeMockState();
  const plugin = { ...ModelImportPlugin };
  plugin.init(state);
  return { plugin, state, smCalls };
}

/**
 * Walk a Three.js Object3D root and return the first descendant Mesh
 * (or `null` if none). OBJLoader / GLTFLoader return Group roots; the
 * real geometry lives on a child Mesh.
 */
function findFirstMesh(root) {
  if (!root || typeof root.traverse !== 'function') return null;
  let found = null;
  root.traverse((c) => {
    if (!found && c.isMesh) found = c;
  });
  return found;
}

// ── 1) loadOBJ (REAL loader) ─────────────────────────────────────────────

describe('ModelImportPlugin.loadOBJ (real OBJLoader)', () => {
  let plugin;
  beforeEach(() => { plugin = setupPlugin().plugin; });

  it('parses a minimal 4-vertex + 1-face OBJ text into a Mesh with a position attribute', async () => {
    // 4 vertices on the corners of a unit-XY square + 1 triangular face
    // referencing vertices 1,2,3. The OBJLoader produces a Group
    // whose only child is a Mesh; that Mesh's BufferGeometry has
    // positions for the 3 face vertices.
    const objText = [
      '# minimal OBJ: unit-square-with-triangle-face',
      'v 0 0 0',
      'v 1 0 0',
      'v 1 1 0',
      'v 0 1 0',
      'f 1 2 3',
      '',
    ].join('\n');

    const result = await plugin.loadOBJ(objText);

    assert.ok(result, 'loadOBJ should return a non-null result');
    assert.ok(result.root, 'result should have a root');
    assert.equal(result.animations.length, 0, 'OBJ format carries no animations');

    const mesh = findFirstMesh(result.root);
    assert.ok(mesh, 'OBJ output should contain at least one Mesh');
    assert.equal(mesh.isMesh, true, 'first descendant isMesh === true');
    const pos = mesh.geometry?.attributes?.position;
    assert.ok(pos, 'Mesh should have a position attribute on its geometry');
    assert.equal(pos.count, 3, 'a single triangular OBJ face yields 3 position vertices');
    // Per-vertex coordinate check (idiomatic for BufferAttribute and
    // more robust than deepEqual on the raw typed-array slice — Three.js
    // micro-versions may pack shared position/normal/uv attributes
    // differently but the per-vertex accessor is the contract).
    assert.equal(pos.getX(0), 0, 'face-vertex 0 X coord matches OBJ `v 0 0 0`');
    assert.equal(pos.getY(0), 0);
    assert.equal(pos.getZ(0), 0);
    assert.equal(pos.getX(1), 1, 'face-vertex 1 X coord matches OBJ `v 1 0 0`');
    assert.equal(pos.getY(1), 0);
    assert.equal(pos.getZ(1), 0);
    assert.equal(pos.getX(2), 1, 'face-vertex 2 X coord matches OBJ `v 1 1 0`');
    assert.equal(pos.getY(2), 1);
    assert.equal(pos.getZ(2), 0);
  });

  it('returns null when the OBJLoader failed to instantiate earlier', async () => {
    // Simulate a broken init by nulling just the OBJ loader.
    plugin._objLoader = null;
    const result = await plugin.loadOBJ('v 0 0 0\n');
    assert.equal(result, null);
  });
});

// ── 2) loadSTL (REAL loader) ─────────────────────────────────────────────

describe('ModelImportPlugin.loadSTL (real STLLoader)', () => {
  let plugin;
  beforeEach(() => { plugin = setupPlugin().plugin; });

  it('parses a 1-triangle binary STL blob (empty triangle at origin) into a Mesh with 3 position vertices', async () => {
    /**
     * Binary STL layout (little-endian):
     *   bytes   0..79   header (80 bytes — fill with zeros)
     *   bytes  80..83   uint32 LE triangle count = 1
     *   bytes  84..95   normal (3 × float32 LE)
     *   bytes  96..131  vertices (9 × float32 LE)
     *   bytes 132..133  attribute byte count (0)
     *                                              total = 134 bytes
     */
    const HEADER = 80;
    const COUNT_BYTES = 4;
    const TRIANGLE_BYTES = 50; // 12 (normal) + 36 (9 floats) + 2 (attr)
    const TOTAL = HEADER + COUNT_BYTES + TRIANGLE_BYTES; // 134

    const buffer = new ArrayBuffer(TOTAL);
    const dv = new DataView(buffer);
    dv.setUint32(HEADER, 1, true); // triangle count

    // All remaining bytes stay zero — the "empty triangle" the user
    // requested. Normal = (0,0,0), vertices = origin (3× degenerate),
    // attribute = 0. The geometry is degenerate but valid: STLLoader
    // still produces a BufferGeometry with 3 position entries.

    const result = await plugin.loadSTL(buffer);

    assert.ok(result, 'loadSTL should return a non-null result');
    assert.ok(result.root, 'result should have a root');
    assert.equal(result.root.isMesh, true, 'STL plugin wraps the geometry in a Mesh');
    // `isGroup` is not defined on THREE.Mesh (only on THREE.Group, which
    // Mesh does not extend). We use `assert.ok(!isGroup)` rather than
    // `assert.equal(isGroup, false)` to handle the undefined case.
    assert.ok(!result.root.isGroup, 'STL root is not a Group');
    assert.equal(result.animations.length, 0, 'STL format carries no animations');

    const pos = result.root.geometry?.attributes?.position;
    assert.ok(pos, 'Mesh should have a position attribute on its geometry');
    assert.equal(pos.count, 3, 'single-triangle STL has 3 position vertices');

    // The plugin calls computeVertexNormals() for STL (no normals in
    // binary STL). Verify that ran and produced a normal attribute.
    const norm = result.root.geometry.attributes.normal;
    assert.ok(norm, 'STL geometry should have a normal attribute (auto-generated)');
    assert.equal(norm.count, 3);
  });

  it('returns null when the STLLoader failed to instantiate earlier', async () => {
    plugin._stlLoader = null;
    const result = await plugin.loadSTL(new ArrayBuffer(134));
    assert.equal(result, null);
  });
});

// ── 3) loadModel dispatcher (per-method methods MOCKED) ──────────────────

describe('ModelImportPlugin.loadModel dispatcher', () => {
  // Per-method loaders for GLB/GLTF/FBX are replaced with counting
  // spies because constructing binary fixture files byte-by-byte is
  // fragile and the parse path itself is owned by Three.js (and
  // tested in their own suite). The DISPATCHER's correct routing +
  // normalization + error-event emission is what the plugin owns —
  // that's what we test here.

  let plugin;
  let calls;  // { loadGLB: [], loadGLTF: [], loadFBX: [], loadOBJ: [], loadSTL: [] }

  function installSpyLoaders() {
    calls = { loadGLB: [], loadGLTF: [], loadFBX: [], loadOBJ: [], loadSTL: [] };
    plugin.loadGLB  = async (buf)          => { calls.loadGLB.push({ kind: 'buffer', len: buf?.byteLength ?? -1 }); return { root: { name: 'mock_glb'  }, animations: [] }; };
    plugin.loadGLTF = async (buf)          => { calls.loadGLTF.push({ kind: 'buffer', len: buf?.byteLength ?? -1 }); return { root: { name: 'mock_gltf' }, animations: [] }; };
    plugin.loadFBX  = async (buf)          => { calls.loadFBX.push({ kind: 'buffer', len: buf?.byteLength ?? -1 }); return { root: { name: 'mock_fbx'  }, animations: [] }; };
    // We keep OBJ/STL mocks as well so a non-mocked route can't
    // accidentally try to call a real loader in this block.
    plugin.loadOBJ  = async (text)         => { calls.loadOBJ.push({ kind: 'text',   len: (text ?? '').length });   return { root: { name: 'mock_obj'  }, animations: [] }; };
    plugin.loadSTL  = async (buf)          => { calls.loadSTL.push({ kind: 'buffer', len: buf?.byteLength ?? -1 }); return { root: { name: 'mock_stl'  }, animations: [] }; };
  }

  function fakeFile(name) {
    // Mimic the Browser File surface `loadModel` reads:
    //   - await file.text()       for OBJ branch
    //   - await file.arrayBuffer() for everything else
    return {
      name,
      text:        async () => '<<obj text placeholder>>',
      arrayBuffer: async () => new ArrayBuffer(64), // dummy 64B blob — mocks ignore
    };
  }

  beforeEach(() => {
    ({ plugin } = setupPlugin());
    installSpyLoaders();
  });

  it('routes ".glb" → loadGLB exactly once, and nothing else', async () => {
    await plugin.loadModel(fakeFile('helmet.glb'), 'glb');
    assert.equal(calls.loadGLB.length,  1, 'loadGLB called once');
    assert.equal(calls.loadGLTF.length, 0);
    assert.equal(calls.loadFBX.length,  0);
    assert.equal(calls.loadOBJ.length,  0);
    assert.equal(calls.loadSTL.length,  0);
  });

  it('routes ".gltf" → loadGLTF exactly once', async () => {
    await plugin.loadModel(fakeFile('scene.gltf'), 'gltf');
    assert.equal(calls.loadGLTF.length, 1);
    assert.equal(calls.loadGLB.length,  0);
    assert.equal(calls.loadFBX.length,  0);
  });

  it('routes ".fbx" → loadFBX exactly once', async () => {
    await plugin.loadModel(fakeFile('rigged.fbx'), 'fbx');
    assert.equal(calls.loadFBX.length,  1);
    assert.equal(calls.loadGLB.length,  0);
    assert.equal(calls.loadGLTF.length, 0);
  });

  it('takes the OBJ branch via file.text() and feeds it to loadOBJ', async () => {
    await plugin.loadModel(fakeFile('mesh.obj'), 'obj');
    assert.equal(calls.loadOBJ.length, 1);
    assert.equal(calls.loadOBJ[0].kind, 'text');
    assert.equal(calls.loadOBJ[0].len, '<<obj text placeholder>>'.length);
    // OBJ does NOT go through file.arrayBuffer() — verify other loads untouched.
    assert.equal(calls.loadGLB.length, 0);
    assert.equal(calls.loadSTL.length, 0);
  });

  it('takes the STL branch via file.arrayBuffer() and feeds it to loadSTL', async () => {
    await plugin.loadModel(fakeFile('part.stl'), 'stl');
    assert.equal(calls.loadSTL.length, 1);
    assert.equal(calls.loadSTL[0].kind, 'buffer');
    assert.equal(calls.loadSTL[0].len, 64);
  });

  it('normalizes extension: lowercases + strips leading dot ("Mixed.GLB" / ".GLB" / "GLB" all map to loadGLB)', async () => {
    // Test all three forms in sequence; loadGLB should fire on each.
    await plugin.loadModel(fakeFile('mixed.glb'), '.GLB');
    await plugin.loadModel(fakeFile('UPPER.glb'), 'GLB');
    await plugin.loadModel(fakeFile('lower.glb'), 'glb');
    assert.equal(calls.loadGLB.length, 3);
  });

  it('returns null and emits model:import:error for an unsupported extension', async () => {
    let captured = null;
    const handler = (e) => { captured = e.detail; };
    window.addEventListener('model:import:error', handler);
    try {
      const result = await plugin.loadModel(fakeFile('mystery.xyz'), 'xyz');
      assert.equal(result, null, 'unsupported extension returns null');
      assert.ok(captured, 'should have dispatched model:import:error');
      assert.equal(captured.name, 'mystery.xyz');
      assert.equal(captured.ext, 'xyz');
      assert.match(captured.error, /Unsupported extension/i);
      // No per-method loader was invoked on an unsupported extension.
      assert.equal(calls.loadGLB.length,  0);
      assert.equal(calls.loadGLTF.length, 0);
      assert.equal(calls.loadFBX.length,  0);
      assert.equal(calls.loadOBJ.length,  0);
      assert.equal(calls.loadSTL.length,  0);
    } finally {
      window.removeEventListener('model:import:error', handler);
    }
  });

  it('gracefully handles a missing File argument', async () => {
    const result = await plugin.loadModel(null, 'glb');
    assert.equal(result, null);
    assert.equal(calls.loadGLB.length, 0);
  });
});

// ── 4) Plugin init wiring (one smoke check beyond the loader tests) ──────

describe('ModelImportPlugin.init wiring', () => {
  it('instantiates all four addon loaders and registers the model:import listener', async () => {
    const { plugin } = setupPlugin();
    assert.ok(plugin._gltfLoader, 'GLTFLoader instantiated');
    assert.ok(plugin._objLoader,   'OBJLoader instantiated');
    assert.ok(plugin._stlLoader,   'STLLoader instantiated');
    assert.ok(plugin._fbxLoader,   'FBXLoader instantiated');
    // The window stub grew handlers as init added them.
    const handlerList = window._handlers.get('model:import');
    assert.ok(handlerList && handlerList.length === 1, 'one model:import listener installed');
  });

  it('published the loaded model to the StateManager tracker for loadOBJ processing', async () => {
    const { plugin, smCalls } = setupPlugin();
    const objText = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3', ''].join('\n');
    // Bypass dispatcher to feed `.loadOBJ` directly — the dispatcher
    // path is exercised in the dispatcher describe-block above.
    const raw = await plugin.loadOBJ(objText);
    // Mimic what loadModel does after the per-method loader returns.
    const group = plugin._processAndCenter(raw, 'mini.obj', 'obj');
    assert.ok(group.isGroup, '_processAndCenter returns a Group');
    assert.equal(group.userData.importExt, 'obj');
    assert.ok(group.userData.gfxResourceId, 'group carries its GFX resource id');
    assert.equal(smCalls.length, 1, 'one trackGfxResource call');
    assert.equal(smCalls[0].type, 'obj-geometry');
    assert.ok(smCalls[0].bytes > 0, 'bytes counted from position+normal+uv + index');
  });
});

// ── 5) Init-time import:register-* dispatches (domain registration) ────────

describe('ModelImportPlugin.init dispatches import:register-* events', () => {
  // The plugin talks to MasterApp._initImportDomHandlers via two
  // CustomEvents on init(). The listener rebuilds #import-file-input's
  // accept attribute and #drop-zone-text with an Oxford-style join
  // based on whatever plugins have registered. By dispatching from
  // init() the plugin keeps index.html in sync with SUPPORTED_EXTS
  // automatically — extending the plugin = one line in SUPPORTED_EXTS,
  // no markup edit.

  it('dispatches import:register-extension with all 5 supported extensions', () => {
    setupPlugin(); // init() runs and dispatches the events
    const events = globalThis.window._dispatched;
    const extEvent = events.find((e) => e.type === 'import:register-extension');
    assert.ok(extEvent, 'plugin should dispatch import:register-extension on init');
    assert.deepEqual(
      [...extEvent.detail.extensions].sort(),
      ['fbx', 'glb', 'gltf', 'obj', 'stl']
    );
  });

  it('dispatches import:register-zone-text with { category: "models", label: "3D models" }', () => {
    setupPlugin();
    const events = globalThis.window._dispatched;
    const zoneEvent = events.find((e) => e.type === 'import:register-zone-text');
    assert.ok(zoneEvent, 'plugin should dispatch import:register-zone-text on init');
    assert.equal(zoneEvent.detail.category, 'models');
    assert.equal(zoneEvent.detail.label, '3D models');
  });

  it('fires each event exactly once per init() call (idempotent re-init safe)', () => {
    setupPlugin();
    const events = globalThis.window._dispatched;
    const extCount = events.filter((e) => e.type === 'import:register-extension').length;
    const zoneCount = events.filter((e) => e.type === 'import:register-zone-text').length;
    assert.equal(extCount, 1, 'one import:register-extension per init');
    assert.equal(zoneCount, 1, 'one import:register-zone-text per init');
  });

  it('follows the same shape register pattern for both events (detail is a plain object, not strings)', () => {
    setupPlugin();
    const events = globalThis.window._dispatched;
    for (const evt of events) {
      if (evt.type === 'import:register-extension' || evt.type === 'import:register-zone-text') {
        assert.equal(typeof evt.detail, 'object');
        assert.notEqual(evt.detail, null);
      }
    }
  });
});
