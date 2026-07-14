/**
 * MoCapHUD.js — Live motion-capture HUD widget.
 *
 * Self-contained position:fixed overlay (no required DOM mount). Renders:
 *   - Video preview (mirrored by default for natural webcam interaction)
 *   - Skeleton overlay on a 2D canvas (lines + dots for landmarks)
 *   - Performance bar (FPS, latency, confidence, dropped frames)
 *   - Source picker (webcam/file/hand/face)
 *   - Recording controls (start/stop/playback)
 *   - Retarget target picker (Mixamo/VRM/Stick/Custom)
 *   - Gesture log (last 10 events)
 *
 * Lifecycle:
 *   - `attach(plugin)` — wired by MoCapPlugin.init
 *   - `show()` / `hide()` / `toggle()` — visibility control
 *   - `update(perf, landmarks)` — called per frame from MoCapPlugin.update
 *   - `logGesture(name, detail)` — append to gesture log
 *   - `destroy()` — remove all DOM + listeners
 *
 * Design choices:
 *   - Brutalist styling (matches WaterDebugOverlay / GfxResourcePanel)
 *   - Draggable by the header (mousedown → mousemove tracking)
 *   - Skeleton overlay re-renders only when landmarks change
 *   - All event handlers are isolated to prevent leaks on destroy
 */

import { logger } from '../core/Logger.js';

// MediaPipe Pose connection pairs (landmark A → landmark B) for skeleton drawing.
// Mirrors the official Pose Landmarker visualization.
const SKELETON_PAIRS = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15], [15, 19], [15, 17], [17, 19],
  // Right arm
  [12, 14], [14, 16], [16, 20], [16, 18], [18, 20],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

const NEON_GREEN = '#02e600';
const NEON_YELLOW = '#ffe16d';
const NEON_CYAN = '#00e5ff';
const NEON_ORANGE = '#ff9500';
const NEON_PURPLE = '#b388ff';

export class MoCapHUD {
  constructor() {
    this._plugin = null;        // wired via attach()
    this._state = null;
    this._visible = false;
    this._videoEl = null;       // current video element to draw
    this._videoCanvas = null;   // <canvas> for video preview
    this._videoCtx = null;
    this._skelCanvas = null;    // <canvas> for skeleton overlay
    this._skelCtx = null;
    this._lastLandmarks = null; // change detection
    this._lastVideoTime = -1;
    this._perf = {
      fps: 0, latency: 0, confidence: 0,
      droppedFrames: 0, sourceType: '—', sourceId: '—',
      retarget: '—', recording: false, framesRecorded: 0,
    };
    this._gestureLog = [];     // last 10 gestures
    this._container = null;
    this._raf = null;           // requestAnimationFrame handle
    this._destroyed = false;
    this._dragOffset = { x: 0, y: 0 };
    this._isDragging = false;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  attach(plugin) {
    this._plugin = plugin;
    this._state = plugin._state;
    this._buildDOM();
  }

  // ── DOM construction ──────────────────────────────────────────────────

  _buildDOM() {
    const root = document.createElement('div');
    root.id = 'mocap-hud';
    root.style.cssText = `
      position: fixed;
      top: 40px;
      right: 16px;
      width: 320px;
      max-height: calc(100vh - 60px);
      background: #0e0e0e;
      border: 2px solid ${NEON_GREEN};
      box-shadow: 6px 6px 0 0 #000;
      color: #e5e2e1;
      font-family: 'Space Grotesk', monospace;
      font-size: 10px;
      z-index: 11000;
      display: none;
      flex-direction: column;
      overflow: hidden;
      border-radius: 0;
    `;

    root.innerHTML = `
      <div class="mocap-hud-header" style="
        background: ${NEON_GREEN};
        color: #013a00;
        padding: 6px 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: move;
        user-select: none;
        border-bottom: 2px solid #000;
      ">
        <span style="font-size:14px;">🎥</span>
        <span style="flex:1;">MoCap HUD</span>
        <span id="mocap-hud-status" style="font-size:8px;opacity:0.7;">READY</span>
        <button id="mocap-hud-close" style="
          background: transparent;
          border: 2px solid #013a00;
          color: #013a00;
          width: 18px;
          height: 18px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        ">×</button>
      </div>

      <!-- Video preview (16:9) -->
      <div style="position:relative; background:#000; width:100%; aspect-ratio: 16/9; overflow:hidden;">
        <canvas id="mocap-hud-video" width="480" height="270" style="width:100%;height:100%;display:block;"></canvas>
        <canvas id="mocap-hud-skel" width="480" height="270" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></canvas>
        <div id="mocap-hud-no-source" style="
          position:absolute;inset:0;
          display:flex;align-items:center;justify-content:center;
          color:#3b4b35;font-size:11px;text-align:center;padding:8px;
        ">No source active.<br>Use MoCap menu → Add Webcam</div>
      </div>

      <!-- Performance bar -->
      <div id="mocap-hud-perf" style="
        background: #1c1b1b;
        padding: 6px 10px;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 4px 12px;
        font-size: 9px;
        border-bottom: 1px solid #3b4b35;
        color: #b9ccaf;
      ">
        <div>FPS: <span id="mocap-hud-fps" style="color:${NEON_GREEN};font-weight:700;">--</span></div>
        <div>LATENCY: <span id="mocap-hud-latency" style="color:${NEON_GREEN};font-weight:700;">--</span>ms</div>
        <div>CONF: <span id="mocap-hud-conf" style="color:${NEON_GREEN};font-weight:700;">--</span></div>
        <div>DROPS: <span id="mocap-hud-drops" style="color:${NEON_YELLOW};font-weight:700;">0</span></div>
      </div>

      <!-- Source picker -->
      <div style="padding:6px 10px;background:#131313;border-bottom:1px solid #3b4b35;">
        <div style="font-size:9px;color:#b9ccaf;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">SOURCE</div>
        <div style="display:flex;gap:4px;">
          <button data-mocap-source="webcam" style="flex:1;background:#1c1b1b;color:${NEON_GREEN};border:2px solid ${NEON_GREEN};padding:4px 6px;font-size:9px;cursor:pointer;font-weight:700;font-family:inherit;">📹 WEBCAM</button>
          <button data-mocap-source="file" style="flex:1;background:#1c1b1b;color:${NEON_CYAN};border:2px solid ${NEON_CYAN};padding:4px 6px;font-size:9px;cursor:pointer;font-weight:700;font-family:inherit;">📁 FILE</button>
          <button data-mocap-source="hand" style="flex:1;background:#1c1b1b;color:${NEON_PURPLE};border:2px solid ${NEON_PURPLE};padding:4px 6px;font-size:9px;cursor:pointer;font-weight:700;font-family:inherit;">✋ HAND</button>
          <button data-mocap-source="face" style="flex:1;background:#1c1b1b;color:${NEON_ORANGE};border:2px solid ${NEON_ORANGE};padding:4px 6px;font-size:9px;cursor:pointer;font-weight:700;font-family:inherit;">🙂 FACE</button>
        </div>
        <div id="mocap-hud-source-status" style="margin-top:4px;font-size:8px;color:#b9ccaf;">No source active</div>
      </div>

      <!-- Recording controls -->
      <div style="padding:6px 10px;background:#1c1b1b;border-bottom:1px solid #3b4b35;">
        <div style="font-size:9px;color:#b9ccaf;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">RECORDING</div>
        <div style="display:flex;gap:4px;align-items:center;">
          <button id="mocap-hud-rec" style="flex:1;background:#1c1b1b;color:#ff4444;border:2px solid #ff4444;padding:4px 6px;font-size:10px;cursor:pointer;font-weight:700;font-family:inherit;">● REC</button>
          <button id="mocap-hud-stop" style="flex:1;background:#1c1b1b;color:#b9ccaf;border:2px solid #3b4b35;padding:4px 6px;font-size:10px;cursor:pointer;font-weight:700;font-family:inherit;" disabled>■ STOP</button>
          <span id="mocap-hud-rec-time" style="font-size:9px;color:#b9ccaf;font-weight:700;min-width:50px;text-align:right;">00:00</span>
        </div>
        <div style="display:flex;gap:4px;align-items:center;margin-top:4px;">
          <select id="mocap-hud-retarget" style="flex:1;background:#1c1b1b;color:${NEON_YELLOW};border:2px solid ${NEON_YELLOW};padding:3px 4px;font-size:9px;cursor:pointer;font-weight:700;font-family:inherit;">
            <option value="mixamo-humanoid">Mixamo</option>
            <option value="vrm-humanoid">VRM</option>
            <option value="stick-figure">Stick</option>
            <option value="custom-json">Custom</option>
          </select>
          <button id="mocap-hud-export-bvh" style="background:#1c1b1b;color:${NEON_CYAN};border:2px solid ${NEON_CYAN};padding:3px 6px;font-size:9px;cursor:pointer;font-weight:700;font-family:inherit;">BVH</button>
          <button id="mocap-hud-export-glb" style="background:#1c1b1b;color:${NEON_CYAN};border:2px solid ${NEON_CYAN};padding:3px 6px;font-size:9px;cursor:pointer;font-weight:700;font-family:inherit;">GLB</button>
        </div>
      </div>

      <!-- Gesture log -->
      <div style="flex:1; min-height: 80px; max-height: 200px; overflow-y:auto; padding:6px 10px; background:#0e0e0e;">
        <div style="font-size:9px;color:#b9ccaf;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">GESTURE LOG</div>
        <div id="mocap-hud-gestures" style="font-size:9px;color:#b9ccaf;line-height:1.4;">
          <div style="opacity:0.5;font-style:italic;">No gestures yet</div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    this._container = root;
    this._videoCanvas = root.querySelector('#mocap-hud-video');
    this._videoCtx = this._videoCanvas.getContext('2d');
    this._skelCanvas = root.querySelector('#mocap-hud-skel');
    this._skelCtx = this._skelCanvas.getContext('2d');

    // Wire up event handlers (isolated so destroy() can null them)
    root.querySelector('#mocap-hud-close').addEventListener('click', () => this.hide());
    root.querySelector('#mocap-hud-rec').addEventListener('click', () => this._onRecordClick());
    root.querySelector('#mocap-hud-stop').addEventListener('click', () => this._onStopClick());
    root.querySelector('#mocap-hud-export-bvh').addEventListener('click', () => this._onExportBVH());
    root.querySelector('#mocap-hud-export-glb').addEventListener('click', () => this._onExportGLB());
    root.querySelectorAll('[data-mocap-source]').forEach(btn => {
      btn.addEventListener('click', () => this._onSourceClick(btn.dataset.mocapSource));
    });
    root.querySelector('#mocap-hud-retarget').addEventListener('change', (e) => {
      this._plugin?.setRetargetPreset(e.target.value);
    });

    // Drag handling
    const header = root.querySelector('.mocap-hud-header');
    header.addEventListener('mousedown', (e) => this._onDragStart(e));
  }

  // ── Public API ────────────────────────────────────────────────────────

  show() {
    if (!this._container) return;
    this._container.style.display = 'flex';
    this._visible = true;
    if (!this._raf) this._raf = requestAnimationFrame(() => this._tick());
    this._state?.emit?.('mocap:hud:shown', true);
  }

  hide() {
    if (!this._container) return;
    this._container.style.display = 'none';
    this._visible = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._state?.emit?.('mocap:hud:shown', false);
  }

  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  isVisible() {
    return this._visible;
  }

  attachVideo(videoElement) {
    this._videoEl = videoElement;
    this._lastVideoTime = -1;
  }

  detachVideo() {
    this._videoEl = null;
    // Clear the canvas
    if (this._videoCtx) {
      this._videoCtx.fillStyle = '#000';
      this._videoCtx.fillRect(0, 0, this._videoCanvas.width, this._videoCanvas.height);
    }
  }

  /**
   * Update the perf metrics. Called from MoCapPlugin.update each frame
   * (the HUD internally throttles to 4Hz to avoid layout thrash).
   */
  updatePerf(perf) {
    Object.assign(this._perf, perf);
    this._renderPerf();
  }

  /**
   * Update the skeleton overlay. Called every frame the landmarks change.
   */
  updateSkeleton(landmarks) {
    this._lastLandmarks = landmarks;
    this._drawSkeleton();
  }

  /**
   * Append to the gesture log (max 10 entries).
   */
  logGesture(name, detail = '') {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    this._gestureLog.unshift({ name, detail, time });
    if (this._gestureLog.length > 10) this._gestureLog.pop();
    this._renderGestureLog();
  }

  destroy() {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  _tick() {
    if (this._destroyed || !this._visible) return;
    this._drawVideoFrame();
    this._updateRecordingTime();
    this._raf = requestAnimationFrame(() => this._tick());
  }

  _drawVideoFrame() {
    if (!this._videoCtx) return;
    const ctx = this._videoCtx;
    const w = this._videoCanvas.width, h = this._videoCanvas.height;
    if (this._videoEl && this._videoEl.readyState >= 2 && this._videoEl.videoWidth > 0) {
      // Skip duplicate frames (the source's currentTime didn't advance)
      if (this._videoEl.currentTime !== this._lastVideoTime) {
        this._lastVideoTime = this._videoEl.currentTime;
        // Mirror horizontally (natural webcam interaction)
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(this._videoEl, 0, 0, -w, h);
        ctx.restore();
      }
    } else {
      // No source — clear with "No source" overlay
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const noSrc = this._container.querySelector('#mocap-hud-no-source');
      if (noSrc) noSrc.style.display = 'flex';
    }
    // Update skeleton overlay on every tick (it cheap)
    this._drawSkeleton();
  }

  _drawSkeleton() {
    if (!this._skelCtx) return;
    const ctx = this._skelCtx;
    const w = this._skelCanvas.width, h = this._skelCanvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!this._lastLandmarks || this._lastLandmarks.length < 33) return;
    // MediaPipe landmarks are normalized [0,1] in image space. To match
    // the mirrored video, we also flip X here.
    const xform = (lm) => ({
      x: (1 - lm.x) * w, // mirror
      y: lm.y * h,
    });
    // Draw connections
    ctx.strokeStyle = NEON_GREEN;
    ctx.lineWidth = 2;
    for (const [a, b] of SKELETON_PAIRS) {
      const pa = this._lastLandmarks[a], pb = this._lastLandmarks[b];
      if (!pa || !pb) continue;
      const aVis = typeof pa.visibility === 'number' ? pa.visibility : 0.8;
      const bVis = typeof pb.visibility === 'number' ? pb.visibility : 0.8;
      if (aVis < 0.3 || bVis < 0.3) continue;
      const A = xform(pa), B = xform(pb);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    // Draw landmark dots
    ctx.fillStyle = NEON_YELLOW;
    for (let i = 0; i < 33; i++) {
      const lm = this._lastLandmarks[i];
      if (!lm) continue;
      const vis = typeof lm.visibility === 'number' ? lm.visibility : 0.8;
      if (vis < 0.3) continue;
      const p = xform(lm);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _renderPerf() {
    if (!this._container) return;
    const set = (id, val) => {
      const el = this._container.querySelector(id);
      if (el) el.textContent = val;
    };
    set('#mocap-hud-fps', this._perf.fps > 0 ? this._perf.fps.toFixed(0) : '--');
    set('#mocap-hud-latency', this._perf.latency > 0 ? this._perf.latency.toFixed(1) : '--');
    const confPct = this._perf.confidence > 0 ? (this._perf.confidence * 100).toFixed(0) : '--';
    set('#mocap-hud-conf', confPct);
    set('#mocap-hud-drops', this._perf.droppedFrames);
    const status = this._perf.sourceType !== '—'
      ? `${this._perf.sourceType} → ${this._perf.sourceId}`
      : 'No source active';
    set('#mocap-hud-source-status', status);
    const hdrStatus = this._container.querySelector('#mocap-hud-status');
    if (hdrStatus) {
      hdrStatus.textContent = this._perf.recording ? `● REC ${this._perf.framesRecorded}f` : (this._perf.sourceType !== '—' ? 'LIVE' : 'READY');
    }
  }

  _renderGestureLog() {
    if (!this._container) return;
    const el = this._container.querySelector('#mocap-hud-gestures');
    if (!el) return;
    if (this._gestureLog.length === 0) {
      el.innerHTML = '<div style="opacity:0.5;font-style:italic;">No gestures yet</div>';
      return;
    }
    el.innerHTML = this._gestureLog.map(g => {
      const safeName = String(g.name).replace(/[<>]/g, '');
      const safeDetail = String(g.detail).replace(/[<>]/g, '');
      return `<div style="margin-bottom:2px;"><span style="color:#02e600;">[${g.time}]</span> <span style="color:#ffe16d;font-weight:700;">${safeName}</span> ${safeDetail}</div>`;
    }).join('');
  }

  _updateRecordingTime() {
    if (!this._container) return;
    const el = this._container.querySelector('#mocap-hud-rec-time');
    if (!el || !this._plugin) return;
    const rec = this._plugin.getRecorder?.();
    if (!rec || !rec.isRecording()) {
      el.textContent = '00:00';
      return;
    }
    const session = rec.getActiveSessionId();
    const start = rec._activeStartTime;
    if (!session || !start) return;
    const elapsed = (performance.now() - start) / 1000;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
    el.textContent = `${mm}:${ss}`;
  }

  // ── Button handlers ───────────────────────────────────────────────────

  _onRecordClick() {
    if (!this._plugin) return;
    const rec = this._plugin.getRecorder?.();
    if (!rec) return;
    if (rec.isRecording()) return;
    rec.start(`Session_${Date.now()}`);
    this._perf.recording = true;
    this._container.querySelector('#mocap-hud-rec').style.color = '#ff4444';
    this._container.querySelector('#mocap-hud-stop').disabled = false;
    this._renderPerf();
  }

  _onStopClick() {
    if (!this._plugin) return;
    const rec = this._plugin.getRecorder?.();
    if (!rec) return;
    rec.stop();
    this._perf.recording = false;
    this._perf.framesRecorded = 0;
    this._container.querySelector('#mocap-hud-rec').style.color = '#ff4444';
    this._container.querySelector('#mocap-hud-stop').disabled = true;
    this._renderPerf();
  }

  _onExportBVH() {
    if (!this._plugin) return;
    const rec = this._plugin.getRecorder?.();
    if (!rec) return;
    const sessions = rec.getSessions();
    if (sessions.length === 0) {
      this.logGesture('export', 'No sessions to export');
      return;
    }
    const last = sessions[sessions.length - 1];
    const bvh = rec.exportBVH(last.id);
    if (bvh) rec.downloadExport(bvh, `${last.name}.bvh`, 'application/bvh');
  }

  _onExportGLB() {
    if (!this._plugin) return;
    const rec = this._plugin.getRecorder?.();
    if (!rec) return;
    const sessions = rec.getSessions();
    if (sessions.length === 0) {
      this.logGesture('export', 'No sessions to export');
      return;
    }
    const last = sessions[sessions.length - 1];
    rec.exportGLB(last.id).then((glb) => {
      if (glb) rec.downloadExport(glb, `${last.name}.glb`, 'model/gltf-binary');
    });
  }

  _onSourceClick(type) {
    if (!this._plugin) return;
    this._plugin.addSource(`src_${Date.now()}`, type, {})
      .then(() => {
        this._perf.sourceType = type;
        this._perf.sourceId = 'src_' + Date.now();
        this._renderPerf();
        this._container.querySelector('#mocap-hud-no-source').style.display = 'none';
      })
      .catch(err => {
        this.logGesture('source', `Failed: ${err.message || err}`);
      });
  }

  // ── Drag handling ─────────────────────────────────────────────────────

  _onDragStart(e) {
    if (e.target.tagName === 'BUTTON') return; // don't drag from buttons
    this._isDragging = true;
    const rect = this._container.getBoundingClientRect();
    this._dragOffset.x = e.clientX - rect.left;
    this._dragOffset.y = e.clientY - rect.top;
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    e.preventDefault();
  }

  _onMouseMove(e) {
    if (!this._isDragging) return;
    const x = e.clientX - this._dragOffset.x;
    const y = e.clientY - this._dragOffset.y;
    this._container.style.left = `${x}px`;
    this._container.style.top = `${y}px`;
    this._container.style.right = 'auto'; // override the default right: 16px
  }

  _onMouseUp() {
    this._isDragging = false;
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
  }
}

if (typeof window !== 'undefined') {
  window.MoCapHUD = MoCapHUD;
}
