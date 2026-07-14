/**
 * PerfStatsPlugin - Lightweight performance stats overlay.
 *
 * Reads `renderer.info` on a setInterval (low-rate; doesn't contend
 * with the render loop) and writes the numbers into a small DOM
 * panel. The panel is opt-in: if `#perf-stats-container` doesn't
 * exist in the DOM, the plugin is a no-op.
 *
 * Displayed metrics:
 *   - FPS (rolling average over the last second)
 *   - Frame time (ms; from clock.getDelta)
 *   - Draw calls (renderer.info.render.calls)
 *   - Triangles (renderer.info.render.triangles)
 *   - Geometries (renderer.info.memory.geometries)
 *   - Textures (renderer.info.memory.textures)
 *   - Programs (renderer.info.programs?.length; falls back to N/A
 *     if the renderer doesn't expose .programs)
 *
 * Public API:
 *   toggle()        -> bool   (returns the new visibility)
 *   show() / hide()
 *   setPollInterval(ms)       (default 500; minimum 100)
 *
 * Non-breaking: this file is purely additive. It reads from
 * `state.data.renderer` and `state.data.camera` and never modifies
 * anything. The DOM panel is built by the plugin itself if the
 * mount point exists.
 */
import * as THREE from 'three';
import { logger } from '../core/Logger.js';

const DEFAULT_POLL_MS = 500;
const FPS_WINDOW = 20;  // rolling window of frame times

export const PerfStatsPlugin = {
  name: 'PerfStats',
  _state: null,
  _container: null,
  _panel: null,
  _visible: true,
  _pollInterval: null,
  _pollMs: DEFAULT_POLL_MS,
  _frameTimes: [],
  _lastT: 0,

  init(state) {
    this._state = state;
    this._container = document.getElementById('perf-stats-container');
    if (!this._container) {
      logger.log('PerfStatsPlugin', 'No #perf-stats-container — plugin is a no-op');
      return;
    }
    this._buildPanel();
    this._setupEventListeners();
    this._startPolling();
    logger.log('PerfStatsPlugin', `Initialized (poll=${this._pollMs}ms)`);
  },

  update(dt) {
    // Track per-frame time so the panel can show a rolling average.
    // Cheap: just a push + a length check.
    if (this._visible) {
      this._frameTimes.push(dt * 1000);
      if (this._frameTimes.length > FPS_WINDOW) this._frameTimes.shift();
    }
  },

  _buildPanel() {
    this._panel = document.createElement('div');
    this._panel.id = 'perf-stats-panel';
    this._panel.style.cssText = [
      'position: fixed',
      'bottom: 8px',
      'right: 8px',
      'z-index: 1000',
      'background: rgba(0, 0, 0, 0.78)',
      'color: #77ff61',
      'font: 11px/1.4 "Courier New", monospace',
      'padding: 6px 8px',
      'border: 1px solid #3b4b35',
      'pointer-events: none',
      'min-width: 140px',
      'user-select: none',
    ].join(';');
    this._panel.innerHTML = `
      <div style="font-weight:bold;color:#d4f5cd;margin-bottom:4px;">PERF</div>
      <div>FPS: <span data-stat="fps">--</span></div>
      <div>Frame: <span data-stat="frame">--</span> ms</div>
      <div>Calls: <span data-stat="calls">--</span></div>
      <div>Tris: <span data-stat="tris">--</span></div>
      <div>Geo: <span data-stat="geos">--</span></div>
      <div>Tex: <span data-stat="texs">--</span></div>
      <div>Prog: <span data-stat="progs">--</span></div>
    `;
    this._container.appendChild(this._panel);
  },

  _setupEventListeners() {
    window.addEventListener('perf-stats:toggle', () => this.toggle());
    window.addEventListener('perf-stats:show', () => this.show());
    window.addEventListener('perf-stats:hide', () => this.hide());
  },

  _startPolling() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => this._refresh(), this._pollMs);
  },

  setPollInterval(ms) {
    this._pollMs = Math.max(100, Math.min(5000, ms | 0));
    this._startPolling();
  },

  _refresh() {
    if (!this._visible || !this._panel) return;
    const state = this._state;
    if (!state || !state.data) return;
    const renderer = state.data.renderer;
    const set = (k, v) => {
      const el = this._panel.querySelector(`[data-stat="${k}"]`);
      if (el) el.textContent = v;
    };
    // FPS
    if (this._frameTimes.length > 0) {
      const avgFrame = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
      const fps = avgFrame > 0 ? (1000 / avgFrame).toFixed(0) : '60';
      set('fps', fps);
      set('frame', avgFrame.toFixed(2));
    }
    if (!renderer || !renderer.info) return;
    const info = renderer.info;
    set('calls', info.render.calls || 0);
    set('tris', (info.render.triangles || 0).toLocaleString());
    set('geos', info.memory.geometries || 0);
    set('texs', info.memory.textures || 0);
    if (Array.isArray(info.programs)) set('progs', info.programs.length);
    else set('progs', 'N/A');
  },

  toggle() {
    if (this._visible) this.hide(); else this.show();
    return this._visible;
  },

  show() {
    this._visible = true;
    if (this._panel) this._panel.style.display = '';
  },

  hide() {
    this._visible = false;
    if (this._panel) this._panel.style.display = 'none';
  },

  // Plugin contract
  nodes: {},
};
