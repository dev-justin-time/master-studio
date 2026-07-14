/**
 * WaterDebugOverlay.js — Primitive cube-camera debug overlay.
 *
 * Renders the `+Y` (top-down) face of a selected water mesh's cubemap
 * render target to a 200x200 `<canvas>` inside the Properties panel of
 * scene.html / studio.html, so the user can see what the water is
 * reflecting in real time.
 *
 * Design constraints (this is intentionally a "primitive" overlay):
 *   • Single face (`+Y`) — most informative for a horizontal water plane
 *   • 256×256 readback resized to a 200×200 canvas via `putImageData`
 *   • Throttled to ~30 FPS (33ms interval) so the GPU→CPU stall from
 *     `readRenderTargetPixels` doesn't dominate the main render loop
 *   • Auto-shows when a `userData.isWater` mesh is in the selection,
 *     auto-hides on deselect or `water:dispose` for the active water
 *   • No-op if the page doesn't have a `#water-debug-container` mount
 *     (lets other pages — `index.html`, `nodearchitect.html` — coexist)
 *
 * Lifecycle:
 *   • `init(state)` — looks up the renderer + the DOM mount, allocates
 *     the readback buffer once
 *   • `update(dt)` — called by MasterApp's `plugins.update(dt)` each
 *     frame, throttles itself via `_lastUpdate`
 *   • `dispose()` — tears down listeners; rarely needed in practice
 *     because the page lifetime == the plugin lifetime
 *
 * State coupling:
 *   • Reads `mesh._renderTarget` (Three.js's WebGLCubeRenderTarget) via
 *     `renderer.readRenderTargetPixels(rt, 0, 0, w, h, buffer, faceIndex)`.
 *   • Listens for `selection:changed` on the StateManager to show/hide.
 *   • Listens for `water:dispose` window events to hide if the active
 *     water is being deleted (the RTT will be disposed and a readback
 *     would fail with "RENDER_TARGET_DISPOSED").
 */

import { logger } from '../core/Logger.js';

const UPDATE_INTERVAL_MS = 33;   // ~30 FPS throttled readback
const FACE_INDEX_TOP = 2;        // +Y face of the cubemap (top-down)
const READBACK_SIZE = 200;       // pixels per side for readRenderTargetPixels (matches canvas 1:1)
const CANVAS_SIZE = 200;         // CSS pixels for the debug canvas
const CUBEMAP_MAX_BYTES = READBACK_SIZE * READBACK_SIZE * 4; // RGBA8

export const WaterDebugOverlay = {
  name: 'WaterDebugOverlay',
  _state: null,
  _renderer: null,
  _container: null,
  _canvas: null,
  _ctx: null,
  _label: null,
  _currentWater: null,
  _buffer: null,
  _imageData: null,
  _lastUpdate: 0,
  _mounted: false,
  _visible: false,
  _warnedReadback: false,
  _flipRow: null, // scratch buffer for Y-flip

  init(state) {
    this._state = state;
    this._renderer = state && state.data && state.data.renderer;
    this._container = typeof document !== 'undefined'
      ? document.getElementById('water-debug-container')
      : null;
    this._canvas = this._container
      ? this._container.querySelector('#water-debug-canvas')
      : null;
    this._label = this._container
      ? this._container.querySelector('.water-debug-label')
      : null;

    if (!this._container || !this._canvas) {
      // Not fatal — the overlay is optional. Other pages (index.html,
      // nodearchitect.html) don't include the mount and shouldn't spam
      // the console; one warn at init is enough.
      logger.warn('WaterDebugOverlay', 'No #water-debug-container in DOM; overlay disabled.');
      return;
    }

    const ctx = this._canvas.getContext('2d');
    if (!ctx) {
      logger.warn('WaterDebugOverlay', 'Failed to acquire 2D context on debug canvas.');
      return;
    }
    this._ctx = ctx;

    // Allocate the readback buffer + ImageData + scratch flip row once.
    // READBACK_SIZE × READBACK_SIZE × 4 bytes (RGBA8) = 256 KB per
    // readback — cheap, but allocating it per-frame would churn GC.
    this._buffer = new Uint8Array(CUBEMAP_MAX_BYTES);
    this._imageData = ctx.createImageData(READBACK_SIZE, READBACK_SIZE);
    this._flipRow = new Uint8ClampedArray(READBACK_SIZE * 4);

    // Start hidden; visible only when a water mesh is selected.
    this._container.style.display = 'none';
    this._visible = false;
    this._mounted = true;

    // Show/hide on selection changes.
    this._onSelectionChangedBound = this._onSelectionChanged.bind(this);
    this._state.on('selection:changed', this._onSelectionChangedBound);

    // If a water is already selected at init (rare), pick it up.
    const current = this._state.data && this._state.data.selectedObjects;
    if (current && current.length) this._onSelectionChanged(current);

    // Hide on water disposal (the RTT is gone, the next readback would
    // throw and we don't want the user staring at a stale frame).
    window.addEventListener('water:dispose', this._onWaterDisposeBound = (e) => {
      const disposedName = e.detail && e.detail.name;
      if (!this._currentWater) return;
      if (!disposedName || this._currentWater.name === disposedName) {
        this._hide();
      }
    });

    logger.log('WaterDebugOverlay', 'Initialized.');
  },

  _onSelectionChanged(objects) {
    if (!this._mounted) return;
    const arr = objects || (this._state.data && this._state.data.selectedObjects) || [];
    const water = arr.find((o) => o && o.userData && o.userData.isWater);
    if (water && water._renderTarget) {
      this._show(water);
    } else {
      this._hide();
    }
  },

  _show(water) {
    if (!this._mounted) return;
    if (this._currentWater !== water) {
      this._currentWater = water;
      if (this._label) this._label.textContent = `${water.name} [+Y FACE]`;
      // Clear stale pixels from the previous water so the first new
      // frame doesn't show a mix of two reflections.
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
    this._container.style.display = '';
    this._visible = true;
  },

  _hide() {
    if (!this._mounted) return;
    this._currentWater = null;
    this._container.style.display = 'none';
    this._visible = false;
  },

  /**
   * Per-frame update. Called by MasterApp's `plugins.update(dt)`. Throttles
   * itself via `UPDATE_INTERVAL_MS` so the GPU readback stall doesn't
   * dominate the main render loop (one `readRenderTargetPixels` of a
   * 256x256 face is ~0.3ms on midrange hardware, but the implicit
   * GPU pipeline sync can blow that to 1-2ms on slow drivers).
   */
  update(dt) {
    if (!this._mounted || !this._visible || !this._currentWater) return;
    if (!this._renderer) return;

    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    if (now - this._lastUpdate < UPDATE_INTERVAL_MS) return;
    this._lastUpdate = now;

    const water = this._currentWater;
    const rt = water._renderTarget;
    if (!rt) {
      // RTT was disposed out from under us (e.g. user deleted the
      // water from a different path than `water:dispose`).
      this._hide();
      return;
    }

    try {
      this._renderer.readRenderTargetPixels(
        rt, 0, 0, READBACK_SIZE, READBACK_SIZE, this._buffer, FACE_INDEX_TOP
      );
    } catch (err) {
      if (!this._warnedReadback) {
        // Throttle to one warn per session so a misconfigured page
        // doesn't drown the console.
        logger.warn('WaterDebugOverlay', 'readRenderTargetPixels failed (RTT disposed?):', err && err.message ? err.message : err);
        this._warnedReadback = true;
      }
      this._hide();
      return;
    }

    // Copy RGBA into the ImageData backing buffer.
    const dst = this._imageData.data;
    dst.set(this._buffer);

    // WebGL cubemap face pixels come back bottom-up; canvas pixels are
    // top-down. Flip in place using a single scratch row so we don't
    // allocate per-frame.
    this._flipYInPlace(dst, READBACK_SIZE);

    this._ctx.putImageData(this._imageData, 0, 0);
  },

  /** In-place vertical flip of a Uint8ClampedArray arranged as w*h RGBA. */
  _flipYInPlace(data, h) {
    const w = READBACK_SIZE;
    const rowSize = w * 4;
    const half = h >> 1; // h is always even here (256)
    for (let y = 0; y < half; y++) {
      const top = y * rowSize;
      const bot = (h - 1 - y) * rowSize;
      // Copy top row to scratch, copy bottom row to top, copy scratch to bottom.
      this._flipRow.set(data.subarray(top, top + rowSize));
      data.copyWithin(top, bot, bot + rowSize);
      data.set(this._flipRow, bot);
    }
  },

  dispose() {
    if (!this._mounted) return;
    if (this._state && this._onSelectionChangedBound) {
      this._state.off('selection:changed', this._onSelectionChangedBound);
    }
    if (this._onWaterDisposeBound) {
      window.removeEventListener('water:dispose', this._onWaterDisposeBound);
    }
    this._hide();
    this._mounted = false;
    logger.log('WaterDebugOverlay', 'Disposed.');
  }
};
