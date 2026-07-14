/**
 * architect-orchestrator.js
 *
 * Composes the 11 brutalist concern files into a working NodeArchitect
 * visual demo (the page at `nodearchitect.html`):
 *   1. mounts a SIGNAL: STABLE indicator at the top-right
 *   2. mounts three input nodes — string, font-map, scale-factor
 *   3. mounts a central generator-core-node output
 *   4. creates a wire-system overlay connecting all input sockets to the
 *      central socket (drawn live via SVG paths)
 *   5. starts a metrics-collector that updates SYSTEM_LOAD + WIRES
 *      counters on the footer
 *   6. wires modal close affordances + the [WIRE TO SCENE] button
 *   7. tears down observers / RAF loops / window listeners when the
 *      modal closes (auto-cleanup on every close path)
 *
 * Self-contained boot. Defensive: every step early-returns if its target
 * slot is missing — this means the page is also tolerant to partial HTML.
 */

import { createSignalIndicator }       from '../ui/brutalist/signal-indicator.js';
import { createMetricsCollector }      from './metrics-collector.js';
import { createWireSystem }            from './wire-system.js';
import { createStringInputNode }       from './string-input-node.js';
import { createFontMapNode }           from './font-map-node.js';
import { createScaleFactorNode }       from './scale-factor-node.js';
import { createGeneratorCoreNode }     from './generator-core-node.js';

const $ = (id) => document.getElementById(id);

function boot() {
  const modal = $('architect-modal');
  if (!modal) return;

  // ── 1. SIGNAL: STABLE indicator (top-right of modal) ──────────────────────
  const signalSlot = $('signal-slot');
  let signal;
  if (signalSlot) {
    signal = createSignalIndicator({ status: 'stable', label: 'SIGNAL' });
    signalSlot.appendChild(signal.element);
  }

  // ── 2. Three input nodes in the left column ───────────────────────────────
  let stringNode, fontNode, scaleNode;
  const stringHost = $('slot-string-input');
  if (stringHost) {
    stringNode = createStringInputNode(stringHost, {
      label: 'STRING_INPUT',
      placeholder: 'ENTER STRING...',
      defaultValue: 'HODL',
      withWire: true, wireLength: 80, wireRotate: 0,
    });
  }

  const fontHost = $('slot-font-map');
  if (fontHost) {
    fontNode = createFontMapNode(fontHost, {
      label: 'FONT_MAP',
      options: [
        { id: 'space_grotesk', label: 'SPACE_GRT' },
        { id: 'roboto_mono',   label: 'RBTO_MONO' },
      ],
      defaultId: 'space_grotesk',
      withWire: true, wireLength: 64, wireRotate: -12,
    });
  }

  const scaleHost = $('slot-scale-factor');
  if (scaleHost) {
    scaleNode = createScaleFactorNode(scaleHost, {
      label: 'SCALE_FACTOR',
      min: 1, max: 100, defaultValue: 42, step: 1,
      withWire: true, wireLength: 96, wireRotate: 12,
    });
  }

  // ── 3. Central generator-core-node output ────────────────────────────────
  let coreNode;
  const coreHost = $('slot-gen-core');
  if (coreHost) {
    coreNode = createGeneratorCoreNode(coreHost, {
      label: '3D GEN CORE',
      subLabel: '',
      icon: 'settings_input_component',
      pinColor: '#77ff61',
    });
  }

  // ── 4. Wire-system overlay — connects every input socket to the core ─────
  let wireSys;
  const graph = $('architect-graph');
  if (graph) {
    wireSys = createWireSystem({ container: graph, color: '#77ff61' });
    const sockets = [stringNode, fontNode, scaleNode]
      .map(n => n && n.socketEl)
      .filter(Boolean);
    sockets.forEach(s => wireSys.connect(s, coreNode && coreNode.socketEl));
    wireSys.redraw();
  }

  // ── 5. Metrics collector → footer readouts ────────────────────────────────
  const metrics = createMetricsCollector({ intervalMs: 1000 });
  if (wireSys) metrics.setWireCount(() => wireSys.count());
  metrics.subscribe(snap => {
    const loadEl = $('status-load');
    if (loadEl) loadEl.textContent = Number.isFinite(snap.loadPct) ? `${snap.loadPct}%` : '—';
    const wiresEl = $('status-wires');
    if (wiresEl && typeof snap.wireCount === 'number') {
      wiresEl.textContent = `${snap.wireCount} ACTIVE`;
    }
    if (coreNode && typeof coreNode.setSubLabelFromSnapshot === 'function') {
      coreNode.setSubLabelFromSnapshot(snap);
    }
    // Translate metrics into a SIGNAL status (memory > 70% → degraded).
    if (signal && Number.isFinite(snap.loadPct)) {
      if (snap.loadPct > 90) signal.setStatus('down');
      else if (snap.loadPct > 70) signal.setStatus('degraded');
      else signal.setStatus('stable');
    }
  });
  metrics.start();

  // ── 6. Modal close affordances (all routes through teardown via 7) ────────
  const closeModal = () => { modal.style.display = 'none'; teardown(); };
  $('architect-close')?.addEventListener('click', closeModal);
  $('architect-cancel')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  function onEscapeKeydown(e) {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  }
  document.addEventListener('keydown', onEscapeKeydown);

  // ── 7. Teardown helper — runs on every close path so observers / RAF /
  //      intervals / window listeners don't leak when the modal closes.
  let tornDown = false;
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    try { metrics.stop(); } catch (_) {}
    try { wireSys && wireSys.destroy(); } catch (_) {}
    try { document.removeEventListener('keydown', onEscapeKeydown); } catch (_) {}
  }

  // ── 8. [WIRE TO SCENE] action — emits values + metrics snapshot ───────────
  $('architect-wire')?.addEventListener('click', () => {
    const detail = {
      text:  stringNode?.getValue?.() ?? '',
      font:  fontNode?.getValue?.() ?? '',
      size:  scaleNode?.getValue?.() ?? 0,
      wireCount: wireSys?.count?.() ?? 0,
      metrics: metrics.snapshot(),
      ts: Date.now(),
    };
    window.dispatchEvent(new CustomEvent('architect:wire-scene', { detail }));
  });
}

// Register on DOMContentLoaded (MasterApp.js is async-ish) so the
// orchestrator waits for the page skeleton if it loads late.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
