/**
 * scene-utils.js
 *
 * Shared brutalist-page glue for scene.html and studio.html. Every bootstrap-
 * style app glued on top of MasterApp.js needs (at minimum):
 *
 *   1. An FPS counter that ticks `#status-fps` on every animation frame.
 *   2. Status bar reflection (coords, obj count, vertex count).
 *   3. Sync of `.prop-input[data-prop]` panels from `selection:changed`.
 *   4. Hiding MenuSystemPlugin's auto-injected `#studio-menu-bar` in
 *      layouts that ship their own brutalist top nav.
 *
 * Every operation is defensive — if the page is missing a required element
 * (e.g. a page without a Properties panel), that subsystem no-ops cleanly.
 *
 * Auto-runs on import. Pages just embed `<script type="module" src="/core/scene-utils.js">`
 * after `<script type="module" src="/MasterApp.js">`.
 *
 * Exposes `window.__masterScene` + `window.__masterCamera` for downstream
 * consumers (e.g. studio.html's dynamic outliner refresh).
 */

const FPS_WINDOW_MS = 1000;
const COORDS_POLL_MS = 400;
const OBJ_POLL_MS = 800;
const MASTER_POLL_MS = 300;

function _$(id) { return document.getElementById(id); }

// ─── 1. FPS counter ────────────────────────────────────────────────────────
function initFpsCounter() {
  const el = _$('status-fps');
  if (!el) return;
  let frameTimes = [];
  function tick(now) {
    frameTimes.push(now);
    while (frameTimes.length && now - frameTimes[0] > FPS_WINDOW_MS) frameTimes.shift();
    el.textContent = String(frameTimes.length).padStart(3, '0');
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── 2. Status bar reflection (coords + obj count + verts) ──────────────────
// Keeps `window.__masterScene` + `window.__masterCamera` in sync for downstream
// consumers (studio.html's outliner refresh, etc.). Reads `window.app` fresh
// inside each tick — never captures a stale scene/camera reference, so a
// later page navigation (or Vite HMR) can't leave us writing to dead DOM.
function initStatusBar() {
  const coordsEl = _$('status-coords');
  const objEl = _$('status-obj');
  const vertsEl = _$('status-verts');

  // Mirror window.app references for any legacy consumers that read
  // window.__masterScene / window.__masterCamera directly.
  setInterval(() => {
    window.__masterScene = window.app?.scene ?? null;
    window.__masterCamera = window.app?.camera ?? null;
  }, MASTER_POLL_MS);

  if (coordsEl) {
    setInterval(() => {
      const c = window.app?.camera?.position;
      if (!c) return;
      const fmt = v => (Math.round(v * 10) / 10).toFixed(1);
      coordsEl.textContent = `X:${fmt(c.x)} Y:${fmt(c.y)} Z:${fmt(c.z)}`;
    }, COORDS_POLL_MS);
  }

  if (objEl) {
    setInterval(() => {
      const scene = window.app?.scene;
      if (!scene) return;
      // Top-level count only (matches the previous studio.html semantics).
      // Scene.traverse would also include meshes inside Groups (e.g. imported
      // GLB / point clouds), which would inflate the count vs. the legacy
      // `outliner-row` list. Top-level is what the Outliner shows.
      let count = 0, verts = 0;
      for (const child of scene.children) {
        if (child.userData?.isManagedObject) {
          count++;
          if (child.geometry?.attributes?.position) {
            verts += child.geometry.attributes.position.count;
          }
        }
      }
      objEl.textContent = count.toLocaleString();
      if (vertsEl) vertsEl.textContent = verts.toLocaleString();
    }, OBJ_POLL_MS);
  }
}

// ─── 3. Selection → Properties panel sync ──────────────────────────────────
// Reads `selection:changed` window CustomEvents (dispatched from MasterApp)
// and writes the LOCATION/ROTATION/SCALE inputs on the page. Includes the
// `is-changed` flash highlight so the user sees that the panel updated.
function initSelectionSync() {
  const fmt = v => (Math.round(v * 100) / 100).toFixed(2);
  const setVal = (name, val, unit = '') => {
    const el = document.querySelector(`[data-prop="${name}"]`);
    if (!el) return;
    const isRot = name.startsWith('rot-');
    el.value = isRot ? `${fmt(val * (180 / Math.PI))}°` : `${fmt(val)}${unit}`;
    el.classList.add('is-changed');
    setTimeout(() => el.classList.remove('is-changed'), 220);
  };
  const reset = () => {
    ['loc-x', 'loc-y', 'loc-z'].forEach(k => setVal(k, 0));
    ['rot-x', 'rot-y', 'rot-z'].forEach(k => setVal(k, 0));
    ['scale-x', 'scale-y', 'scale-z'].forEach(k => setVal(k, 1));
  };

  window.addEventListener('selection:changed', (e) => {
    const obj = e.detail && e.detail[0];
    if (!obj) { reset(); return; }
    setVal('loc-x', obj.position.x); setVal('loc-y', obj.position.y); setVal('loc-z', obj.position.z);
    setVal('rot-x', obj.rotation.x); setVal('rot-y', obj.rotation.y); setVal('rot-z', obj.rotation.z);
    setVal('scale-x', obj.scale.x); setVal('scale-y', obj.scale.y); setVal('scale-z', obj.scale.z);
  });
}

// ─── 4. hide MenuSystemPlugin's auto-injected menu bar ─────────────────────
// MenuSystemPlugin shifts `#app` down by 32px when it injects its bar; undo
// both effects since the brutalist top nav on each scene page already takes
// the top space.
function hidePluginMenuBar() {
  const mb = document.getElementById('studio-menu-bar');
  if (!mb) return;
  mb.style.display = 'none';
  const app = document.getElementById('app');
  if (app) {
    app.style.marginTop = '0';
    app.style.height = '100vh';
  }
}

function initMenuBarHider() {
  // Watch for the menu bar's appearance AND any future re-appearance (HMR /
  // plugin re-register) via `subtree: true`. As long as the bar exists, hide
  // it — and disconnect only when the page is unloading.
  const obs = new MutationObserver(hidePluginMenuBar);
  obs.observe(document.body, { childList: true, subtree: false });
  // Single fallback in case MutationObserver missed a fast inject (extremely
  // slow Wasm init). hidePluginMenuBar early-returns on subsequent calls.
  setTimeout(hidePluginMenuBar, 600);
  // Attach the observer to window so an HMR teardown script (vite-plugin
  // pre-amble) can disconnect it cleanly when the module re-runs.
  import.meta.hot?.dispose(() => obs.disconnect());
}

// ─── Auto-init on import (HMR-safe) ─────────────────────────────────────────
// Guard against HMR re-evaluation accumulating RAF loops + intervals +
// listeners. First run installs; subsequent runs no-op.
if (typeof window !== 'undefined' && window.__sceneUtilsInited) {
  // Module already initialized; do nothing.
} else {
  if (typeof window !== 'undefined') window.__sceneUtilsInited = true;
  initFpsCounter();
  initStatusBar();
  initSelectionSync();
  initMenuBarHider();
}
