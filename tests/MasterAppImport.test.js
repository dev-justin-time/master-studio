/**
 * tests/MasterAppImport.test.js
 *
 * End-to-end-ish tests for MasterApp's import surface. Covers the
 * three concerns flagged in the previous reviews:
 *
 *   1. Both import paths (unified + dedicated 3D-model) wire correctly.
 *   2. The reject logic on the dedicated path emits a notification
 *      event AND does NOT call `_importFile` for non-model picks.
 *   3. The `import:register-extension` dispatches from
 *      `ModelImportPlugin` (and the parallel one we just added to
 *      `GoPlugin`) merge into the unified `#import-file-input.accept`
 *      attribute at load time.
 *
 * Implementation note: the project doesn't have jsdom and the user
 * hasn't authorized adding test-only deps. So we bring our own
 * minimal DOM stub layer (`makeStubElement` / `makeStubDocument` /
 * `makeStubWindow`) that only knows about the elements MasterApp's
 * import wiring actually touches. This keeps the test surface small
 * and fast (still under Node's `--test` runner — no install).
 *
 * Run with `node --test tests/MasterAppImport.test.js`.
 *
 * ── Auto-cleanup ─────────────────────────────────────────────────────
 * Each test restores `globalThis.window` / `globalThis.document` in
 * afterEach so test ordering is irrelevant.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { MasterApp } from '../MasterApp.js';
import { ModelImportPlugin, SUPPORTED_EXTS } from '../plugins/ModelImportPlugin.js';
import { GoPlugin } from '../plugins/GoPlugin.js';

// ── DOM stub layer ─────────────────────────────────────────────────────────

/**
 * Minimal DOM element with addEventListener / setAttribute / classList.
 * The `_fire(name, event)` helper simulates a real DOM event — it
 * delivers the payload to every listener registered for `name`,
 * snapshotting the listener array so handler-driven removeEventListener
 * doesn't break iteration.
 */
function makeStubElement(tagName = 'div') {
  const _listeners = new Map();
  const _attributes = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    style: {},
    value: '',
    textContent: '',
    classList: {
      _set: new Set(),
      add(cls) { this._set.add(cls); },
      remove(cls) { this._set.delete(cls); },
      contains(cls) { return this._set.has(cls); },
      toggle(cls) { this._set.has(cls) ? this._set.delete(cls) : this._set.add(cls); },
    },
    getAttribute(name) {
      return _attributes.has(name) ? _attributes.get(name) : null;
    },
    setAttribute(name, val) {
      _attributes.set(name, String(val));
      // Mirror onto own property so reading `el.accept` matches what
      // `el.getAttribute('accept')` returns — easier in assertions.
      if (typeof el[name] !== 'function' && el[name] !== null) {
        try { el[name] = String(val); } catch (_) { /* value type is read-only */ }
      }
    },
    addEventListener(name, handler) {
      if (!_listeners.has(name)) _listeners.set(name, []);
      _listeners.get(name).push(handler);
    },
    removeEventListener(name, handler) {
      const list = _listeners.get(name);
      if (!list) return;
      const i = list.indexOf(handler);
      if (i !== -1) list.splice(i, 1);
    },
    click() {
      el._fire('click', { target: el });
    },
    /** Deliver `event` to every handler registered for `name`. */
    _fire(name, event) {
      const list = _listeners.get(name) || [];
      for (const h of list.slice()) {
        try { h(event); } catch (err) { /* swallow handler errors */ }
      }
    },
    _listeners: _listeners,
    _attributes: _attributes,
  };
  // Default element-specific fields.
  if (tagName === 'input') {
    el.type = 'file';
    el.accept = '';
  }
  return el;
}

/**
 * Stub Document with createElement and getElementById. Pre-populated
 * with every id MasterApp's import wiring reads from the DOM. Elements
 * not pre-populated return `null` (consistent with the real API).
 */
function makeStubDocument(elementIds) {
  const _elements = Object.create(null);
  for (const id of elementIds) {
    _elements[id] = makeStubElement('div');
  }
  return {
    getElementById(id) { return _elements[id] || null; },
    createElement(tagName) { return makeStubElement(tagName); },
    _elements: _elements,
  };
}

/**
 * Stub window with addEventListener / dispatchEvent. Records every
 * dispatched event so tests can assert on `notification` / model:*
 * emissions. Mirrors the pattern in tests/ModelImport.test.js.
 */
function makeStubWindow() {
  const _handlers = new Map();
  const _dispatched = [];
  return {
    addEventListener(name, handler) {
      if (!_handlers.has(name)) _handlers.set(name, []);
      _handlers.get(name).push(handler);
    },
    removeEventListener(name, handler) {
      const list = _handlers.get(name);
      if (!list) return;
      const i = list.indexOf(handler);
      if (i !== -1) list.splice(i, 1);
    },
    dispatchEvent(event) {
      _dispatched.push(event);
      const list = _handlers.get(event.type) || [];
      for (const h of list.slice()) {
        try { h(event); } catch (_) { /* swallow */ }
      }
      return true;
    },
    confirm() { return true; }, // yes to all window.confirm prompts (clearScene)
    _handlers: _handlers,
    _dispatched: _dispatched,
  };
}

// ── MasterApp import fixture ───────────────────────────────────────────────

// IDs the import wiring in `_initImportDomHandlers` and
// `_initImportHandlers` actually reads from the DOM. Kept tight on
// purpose: every element here costs a stub allocation. Other ids
// (lassoOverlay, btn-play, dbg-*, gfx-*, …) are referenced by other
// MasterApp methods + plugins but NOT by the import wiring these
// tests exercise, so they're omitted.
const ELEMENT_IDS = [
  'import-file-input',  // accept-listened by `_initImportDomHandlers`
  'model-file-input',   // guarded change handler in `_initImportHandlers`
  'btn-import',         // unified-path click → opens import-file-input
  'btn-import-model',   // dedicated-path click → opens model-file-input
  'drop-zone',          // drag/drop overlay (read by `_initImportHandlers`)
  'drop-zone-text',     // label rendered by `_initImportDomHandlers`
  'viewport',           // dragenter/dragleave/dragover/drop target
];

const originalGlobals = {};

function setupMasterApp() {
  // Snapshot originals so afterEach can restore. In Node these are
  // typically `undefined`; we capture them anyway for safety.
  originalGlobals.window = globalThis.window;
  originalGlobals.document = globalThis.document;

  const win = makeStubWindow();
  const doc = makeStubDocument(ELEMENT_IDS);
  globalThis.window = win;
  globalThis.document = doc;

  // Construct MasterApp. The constructor only sets up THREE.Scene,
  // MasterState, PluginManager, NodeGraphExecutor — none of these
  // need a browser DOM at construction time.
  const app = new MasterApp();

  // Pre-add both import-domain plugins to the plugin map WITHOUT
  // calling their `init()` yet — we want listeners installed FIRST,
  // THEN the plugins dispatch, THEN the listener picks up the events.
  const goCopy = { ...GoPlugin };
  const modelCopy = { ...ModelImportPlugin };
  app.plugins._plugins.set('Go', goCopy);
  app.plugins._plugins.set('ModelImport', modelCopy);

  // Listener install order is critical (MasterApp.init ensures this by
  // calling _initImportDomHandlers first). We mirror that here.
  app._initImportDomHandlers();

  return { app, win, doc, goCopy, modelCopy };
}

async function setupMasterAppWithPlugins() {
  const ctx = setupMasterApp();
  // Trigger plugin dispatches in the SAME ORDER that MasterApp.init()
  // registers them: GoPlugin first, ModelImportPlugin later. This
  // matters because the host listener stores zone labels in a Map
  // and reads them back in insertion order to compose the drop-zone
  // text — so swapping the order here would flip the asserted strings.
  //
  // `goCopy.init` is async (it awaits its Wasm init before
  // dispatching); `modelCopy.init` is sync.
  await ctx.goCopy.init(ctx.app.state);
  ctx.modelCopy.init(ctx.app.state);
  return ctx;
}

async function setupMasterAppWithWiring() {
  const ctx = await setupMasterAppWithPlugins();
  // Now wire up the file-input change handlers + button click chains.
  ctx.app._initImportHandlers();
  return ctx;
}

function restoreGlobals() {
  globalThis.window = originalGlobals.window;
  globalThis.document = originalGlobals.document;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MasterApp import surface', () => {
  let app, win, doc;

  beforeEach(async () => {
    ({ app, win, doc } = await setupMasterAppWithWiring());
  });

  afterEach(() => {
    restoreGlobals();
  });

  // ── 1) Listener side: dyn-extension merge into #import-file-input.accept ──

  describe('_initImportDomHandlers — dyn-extension merge at load time', () => {
    it('appends all 6 Wasm + 5 model extensions to #import-file-input.accept', () => {
      const input = doc.getElementById('import-file-input');
      const accept = input.getAttribute('accept') || '';
      const EXPECTED = ['.las', '.ply', '.step', '.iges', '.stp', '.igs',
                       '.glb', '.gltf', '.obj', '.stl', '.fbx'];
      for (const ext of EXPECTED) {
        assert.ok(accept.includes(ext), `accept should include ${ext}; got "${accept}"`);
      }
    });

    it('renders drop-zone text via Oxford-style join of all 3 categories', () => {
      const text = doc.getElementById('drop-zone-text');
      // DELIBERATE exact-string assert: the wording also depends on
      // two further contracts (any of which can break this loudly):
      //   (a) GoPlugin dispatches "pointclouds" BEFORE "cad" in
      //       `_registerImportSurface()` (insertion-order drives the
      //       rendered label order).
      //   (b) The listener's Oxford-join algorithm in
      //       `_initImportDomHandlers.updateZoneText()` ("X, Y, or Z
      //       here" for ≥3 entries).
      // Treat a failure here as a canary, not a bug — but DO update
      // the test before merging if you change any of the above.
      assert.equal(text.textContent, 'Drop point clouds, CAD, or 3D models here');
    });

    it('is idempotent: re-dispatching the same extension does not duplicate', () => {
      const input = doc.getElementById('import-file-input');
      const before = input.getAttribute('accept');
      window.dispatchEvent(new CustomEvent('import:register-extension', {
        detail: { extensions: ['.glb', '.gltf'] },
      }));
      const after = input.getAttribute('accept');
      assert.equal(after, before, 'Set-based dedup should keep the merged list identical');
    });

    it('is category-key-dedup: re-registering a zone label replaces the prior one', () => {
      const text = doc.getElementById('drop-zone-text');
      window.dispatchEvent(new CustomEvent('import:register-zone-text', {
        detail: { category: 'models', label: 'mesh files' },
      }));
      assert.equal(text.textContent, 'Drop point clouds, CAD, or mesh files here');
    });
  });

  // ── 2) Unified path: #btn-import → #import-file-input → _importFile ──

  describe('unified import path (Wasm + model)', () => {
    it('installs a click handler on #btn-import that opens the file picker', () => {
      const btn = doc.getElementById('btn-import');
      // The handler triggers `importInput.click()`, which in turn
      // opens the OS file picker. We assert the handler is wired —
      // simulating `el.click()` synchronously, in real browsers the
      // file picker opens asynchronously.
      const list = btn._listeners.get('click') || [];
      assert.ok(list.length >= 1, 'btn-import should have a click handler installed');
    });

    it('forwarding a .glb from #import-file-input routes through _importFile', async () => {
      let calls = 0;
      let lastFile = null;
      app._importFile = (file) => { calls++; lastFile = file; return Promise.resolve(null); };

      const input = doc.getElementById('import-file-input');
      const fakeFile = { name: 'helmet.glb', arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
      input._fire('change', { target: { files: [fakeFile], value: 'helmet.glb' } });
      // _importFile returns a Promise; await microtask drain.
      await new Promise((r) => setImmediate(r));

      assert.equal(calls, 1);
      assert.equal(lastFile, fakeFile);
    });

    it('forwarding a .las from #import-file-input routes through _importFile (Wasm too)', async () => {
      let calls = 0;
      let lastFile = null;
      app._importFile = (file) => { calls++; lastFile = file; return Promise.resolve(null); };

      const input = doc.getElementById('import-file-input');
      const fakeFile = { name: 'scan.las', arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
      input._fire('change', { target: { files: [fakeFile], value: 'scan.las' } });
      await new Promise((r) => setImmediate(r));

      assert.equal(calls, 1);
      assert.equal(lastFile, fakeFile);
    });

    it('reset value="" runs after a valid pick on the unified input', () => {
      app._importFile = () => Promise.resolve(null);
      const input = doc.getElementById('import-file-input');
      input._fire('change', { target: { files: [{ name: 'a.glb' }], value: 'a.glb' } });
      assert.equal(input.value, '');
    });
  });

  // ── 3) Dedicated 3D-model path: #btn-import-model + #model-file-input ──

  describe('dedicated 3D-model path', () => {
    it('installs a click handler on #btn-import-model', () => {
      const btn = doc.getElementById('btn-import-model');
      const list = btn._listeners.get('click') || [];
      assert.ok(list.length >= 1, 'btn-import-model should have a click handler installed');
    });

    it('valid .glb → _importFile called once with the file', async () => {
      let calls = 0;
      let lastFile = null;
      app._importFile = (file) => { calls++; lastFile = file; return Promise.resolve(null); };

      const input = doc.getElementById('model-file-input');
      const fakeFile = { name: 'helmet.glb', arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
      input._fire('change', { target: { files: [fakeFile], value: 'helmet.glb' } });
      await new Promise((r) => setImmediate(r));

      assert.equal(calls, 1);
      assert.equal(lastFile, fakeFile);
    });

    it('JS-syncs #model-file-input.accept from SUPPORTED_EXTS at init time (markup carries no accept list)', () => {
      // Single-source-of-truth invariant: the dedicated picker's
      // accept attribute MUST match `Object.keys(SUPPORTED_EXTS)` —
      // never the markup (intentionally empty in index.html since
      // this round). Locks drift prevention between ModelImportPlugin
      // and the OS file picker filter. SUPPORTED_EXTS is imported
      // directly because it's a module-level `export const`, not a
      // static property of the ModelImportPlugin class.
      const input = doc.getElementById('model-file-input');
      const expected = Object.keys(SUPPORTED_EXTS).map((x) => '.' + x).join(',');
      assert.equal(input.accept, expected,
        `#model-file-input.accept should mirror SUPPORTED_EXTS; got "${input.accept}"`);
    });

    it('valid .obj → also accepted (file input accept is the only OS-level gate)', async () => {
      let calls = 0;
      app._importFile = () => { calls++; return Promise.resolve(null); };

      const input = doc.getElementById('model-file-input');
      input._fire('change', { target: { files: [{ name: 'unit.obj', arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }], value: 'unit.obj' } });
      await new Promise((r) => setImmediate(r));

      assert.equal(calls, 1);
    });

    it('non-model .las → emits state.emit("notification", warning) and does NOT call _importFile', async () => {
      let callFile = 0;
      app._importFile = () => { callFile++; return Promise.resolve(null); };

      // Spy on state.emit; we don't want to overwrite emit() because
      // listener behavior depends on its return value chain.
      const emits = [];
      const orig = app.state.emit.bind(app.state);
      app.state.emit = (name, payload) => {
        emits.push({ name, payload });
        return orig(name, payload);
      };

      const input = doc.getElementById('model-file-input');
      const fakeFile = { name: 'scan.las', arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
      input._fire('change', { target: { files: [fakeFile], value: 'scan.las' } });
      await new Promise((r) => setImmediate(r));

      assert.equal(callFile, 0, '_importFile must NOT be called for non-model picks');

      const warns = emits.filter((e) => e.name === 'notification' && e.payload && e.payload.type === 'warning');
      assert.ok(warns.length >= 1, 'a warning notification should have been emitted');
      assert.ok(/isn't a 3D model/i.test(warns[0].payload.message),
        `message should describe the rejection; got "${warns[0].payload.message}"`);
    });

    it('non-model file with no extension → also rejected', async () => {
      let callFile = 0;
      app._importFile = () => { callFile++; return Promise.resolve(null); };

      const input = doc.getElementById('model-file-input');
      input._fire('change', { target: { files: [{ name: 'Makefile', arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }], value: 'Makefile' } });
      await new Promise((r) => setImmediate(r));

      assert.equal(callFile, 0);
    });

    it('reset value="" runs after a rejected (non-model) pick', () => {
      const orig = app.state.emit.bind(app.state);
      app.state.emit = (n, p) => orig(n, p);

      const input = doc.getElementById('model-file-input');
      input._fire('change', { target: { files: [{ name: 'scan.las' }], value: 'scan.las' } });
      assert.equal(input.value, '', 'reset must run on the reject path so the same file can be re-selected');
    });

    it('reset value="" runs after an accepted pick', () => {
      app._importFile = () => Promise.resolve(null);
      const input = doc.getElementById('model-file-input');
      input._fire('change', { target: { files: [{ name: 'cube.glb' }], value: 'cube.glb' } });
      assert.equal(input.value, '', 'reset must run on the accept path');
    });
  });

  // ── 4) State restoration after `import:register-extension` post-init ──

  describe('dynamic registration after init', () => {
    it('appending a new extension via import:register-extension merges into the accept list', () => {
      const input = doc.getElementById('import-file-input');
      const before = input.getAttribute('accept');
      window.dispatchEvent(new CustomEvent('import:register-extension', {
        detail: { extensions: ['.usdz'] },
      }));
      const after = input.getAttribute('accept');
      assert.ok(after.includes('.usdz'), 'newly registered extension should be merged in');
      assert.ok(before.length < after.length, 'the merged list should be longer than the snapshot');
    });

    it('appending a new zone label via import:register-zone-text re-renders drop-zone text', () => {
      const text = doc.getElementById('drop-zone-text');
      window.dispatchEvent(new CustomEvent('import:register-zone-text', {
        detail: { category: 'images', label: 'images' },
      }));
      // Same deliberate-coupling comment as the 3-category test
      // above applies (Oxford-join algorithm + registration order +
      // listener implementation). Update them together if you touch
      // the listener.
      assert.equal(text.textContent, 'Drop point clouds, CAD, 3D models, or images here');
    });
  });
});
