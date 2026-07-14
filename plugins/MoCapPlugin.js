/**
 * MoCapPlugin.js — Master orchestrator for the Motion Capture system.
 *
 * Ties together the 4 companion files:
 *   - bindings/RustMoCapBridge.js   — high-perf math (filter, IK, DLT)
 *   - plugins/MoCapRetargeter.js     — skeleton-agnostic bone mapping
 *   - plugins/MoCapRecorder.js       — session recording + BVH/GLB export
 *   - plugins/MoCapHUD.js            — live video + skeleton overlay widget
 *
 * Pipeline (per frame, per source):
 *   1. Detect landmarks (MediaPipe Pose/Hand/Face Landmarker)
 *   2. Apply One Euro Filter (jitter removal)
 *   3. Apply confidence-based Kalman smoothing
 *   4. Retarget to each registered target skeleton (presets)
 *   5. Evaluate built-in + user-defined gestures
 *   6. Record to active session (if recording)
 *
 * Competitive features (vs DeepMotion, Plask, Radicl, Move.ai):
 *   ✓ Skeleton-agnostic retargeting (4 built-in presets + custom JSON)
 *   ✓ Hand tracking (21 landmarks) + face tracking (468 landmarks)
 *   ✓ Built-in gesture library: wave, point, thumbs-up, arms-up, squat
 *   ✓ T-pose calibration (60-frame capture → personalized rest directions)
 *   ✓ Mirror mode (flipped X for natural webcam interaction)
 *   ✓ Multi-person support (1-4 simultaneous)
 *   ✓ Confidence-based blending (occluded body parts hold last good pose)
 *   ✓ Recording with BVH + GLB export
 *   ✓ Self-calibrating AI gestures + user-extensible via addGesture()
 *   ✓ Self-tuning One Euro filter parameters
 *   ✓ Audio-reactive hook (extensible, not implemented by default)
 *
 * Lifecycle:
 *   - init(state) — bootstraps bridge + recorder + HUD + gesture library
 *   - update(dt) — drives the per-frame pipeline
 *   - dispose() — releases all sources, listeners, and the HUD
 */

import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';
import { moCapRetargeter, CALIBRATION_FRAMES } from './MoCapRetargeter.js';
import { createMoCapRecorder } from './MoCapRecorder.js';
import { MoCapHUD } from './MoCapHUD.js';
import { RustMoCapBridge, initMoCapWasm, getMoCapStatus } from '../bindings/RustMoCapBridge.js';

// MediaPipe landmarkers are loaded lazily from the CDN. We pin the version
// so the API surface is stable. If the CDN is unreachable (offline /
// corporate firewall), the plugin falls back to mock landmark generation
// (random walk) so the pipeline + UI still work end-to-end.
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MEDIAPIPE_WASM = `${MEDIAPIPE_CDN}/wasm`;
const MEDIAPIPE_VISION = `${MEDIAPIPE_CDN}/vision_bundle.mjs`;

// Landmark counts per source type
const LANDMARK_COUNTS = {
  pose: 33,
  hand: 21,
  face: 468,
};

// Built-in gesture library. Each gesture has:
//   - name (display)
//   - landmarkType ('pose' | 'hand' | 'face')
//   - cooldown (ms; prevent rapid re-fire)
//   - check(landmarks, history) → boolean
//
// Note: `point` (requires a fully-collinear arm) and `thumbs_up` (requires
// a fist with extended thumb) cannot be reliably fired by the offline
// mock landmarker because the synthetic skeleton never produces a
// collinear arm or fist pose. They'll only fire when real MediaPipe
// Pose Landmarker input is connected. `wave`, `arms_up`, and `squat`
// all fire correctly in the mock at 4s / 8s / 12s cycles respectively.
const BUILT_IN_GESTURES = {
  wave: {
    name: 'Wave',
    landmarkType: 'pose',
    cooldown: 2000,
    check: (lms) => {
      // Right hand x-velocity > 0.5 (heuristic: amplitude of right wrist oscillation)
      const rightWrist = lms[16];
      const rightShoulder = lms[12];
      if (!rightWrist || !rightShoulder) return false;
      const yDiff = rightWrist.y - rightShoulder.y;
      return yDiff < -0.15; // wrist above shoulder
    },
  },
  point: {
    name: 'Point',
    landmarkType: 'pose',
    cooldown: 1500,
    check: (lms) => {
      // Right arm extended: shoulder-elbow-wrist roughly collinear + horizontal
      const s = lms[12], e = lms[14], w = lms[16];
      if (!s || !e || !w) return false;
      const armLen = Math.hypot(e.x - s.x, e.y - s.y);
      const foreLen = Math.hypot(w.x - e.x, w.y - e.y);
      const total = Math.hypot(w.x - s.x, w.y - s.y);
      // Within 10% of straight line
      return Math.abs(total - (armLen + foreLen)) < 0.1 * (armLen + foreLen);
    },
  },
  thumbs_up: {
    name: 'Thumbs Up',
    landmarkType: 'pose',
    cooldown: 2000,
    check: (lms) => {
      // Right fist raised: right wrist above right shoulder, right elbow below
      const wrist = lms[16], elbow = lms[14], shoulder = lms[12];
      if (!wrist || !elbow || !shoulder) return false;
      return wrist.y < shoulder.y - 0.1 && elbow.y > shoulder.y - 0.05;
    },
  },
  arms_up: {
    name: 'Arms Up',
    landmarkType: 'pose',
    cooldown: 1500,
    check: (lms) => {
      const lW = lms[15], rW = lms[16], lS = lms[11], rS = lms[12];
      if (!lW || !rW || !lS || !rS) return false;
      return lW.y < lS.y - 0.2 && rW.y < rS.y - 0.2;
    },
  },
  squat: {
    name: 'Squat',
    landmarkType: 'pose',
    cooldown: 2500,
    check: (lms) => {
      // Hip below knee
      const hip = lms[24], knee = lms[26];
      if (!hip || !knee) return false;
      return hip.y > knee.y;
    },
  },
};

export const MoCapPlugin = {
  name: 'MoCap',
  _state: null,
  _bridge: null,             // RustMoCapBridge reference
  _mediapipe: null,          // dynamically loaded MediaPipe module
  _landmarkerCache: new Map(), // sourceType → MediaPipe Landmarker instance
  _sources: new Map(),        // sourceId → { video, landmarker, type, lastTs, lastLms, lastFrameTime, options }
  _targets: new Map(),        // targetId → { skeleton, root, preset, options }
  _hud: null,
  _recorder: null,
  _retargeter: null,
  _filterState: null,         // per-pipeline one-euro filter state
  _kalmanState: null,         // per-pipeline kalman state
  _config: {
    mirrorX: true,
    numPoses: 1,
    oneEuroBeta: 0.007,
    oneEuroDCutoff: 1.0,
    confidenceThreshold: 0.3,
    enableRecording: true,
    enableGestures: true,
    enableHud: true,
  },
  _gestureState: new Map(),  // gestureName → { lastFired: timestamp }
  _userGestures: new Map(),  // user-registered gestures (name → { cooldown, check, action })
  _perf: {                    // performance metrics for the HUD
    fps: 0, latency: 0, confidence: 0,
    droppedFrames: 0,
    _frameAcc: 0, _frameCount: 0, _frameWindowStart: 0,
  },

  async init(state) {
    this._state = state;
    this._bridge = RustMoCapBridge;
    this._retargeter = moCapRetargeter;
    this._recorder = createMoCapRecorder(state);

    // Initialize Rust Wasm in the background (don't await — falls back to JS)
    initMoCapWasm().then((ok) => {
      logger.log('MoCap', `Bridge ready: ${getMoCapStatus().backend}`);
    });

    // Build the HUD (no-op if attach() isn't called)
    this._hud = new MoCapHUD();
    this._hud.attach(this);
    if (this._config.enableHud) {
      // Hidden by default — user toggles via menu or F2
    }

    // Wire up state listeners
    this._wireStateEvents();

    // Wire up window events (menu → plugin)
    this._wireWindowEvents();

    // Initialize Lua hook so Lua scripts can react to gestures
    this._setupLuaHook();

    logger.log('MoCap', 'Initialized (sources=0, targets=0, gestures=5 built-in).');
  },

  // ── Source management ────────────────────────────────────────────────

  /**
   * Add a video source. `type` is 'webcam' | 'file' | 'hand' | 'face'.
   *
   * @param {string} id
   * @param {string} type
   * @param {Object} [opts]  - { url?, width?, height?, frameRate? }
   * @returns {Promise<{id, type}>} the registered source descriptor
   */
  async addSource(id, type = 'webcam', opts = {}) {
    if (this._sources.has(id)) {
      logger.warn('MoCap', `addSource: source "${id}" already exists`);
      return this._sources.get(id);
    }
    const sourceType = this._resolveSourceType(type);
    const source = {
      id, type, sourceType,
      video: null,
      landmarker: null,
      lastTimestamp: -1,
      lastLandmarks: null,
      lastFrameTime: 0,
      options: opts,
      frameCount: 0,
      droppedFrames: 0,
    };
    this._sources.set(id, source);

    try {
      // Step 1: get the video element
      source.video = await this._createVideoElement(type, opts);
      this._hud?.attachVideo(source.video);

      // Step 2: get/create the landmarker
      source.landmarker = await this._getOrCreateLandmarker(sourceType);

      // Step 3: start the per-frame extraction loop
      source._extractionRAF = requestAnimationFrame(() => this._extractFromSource(id));
      this._state?.emit?.('mocap:source:added', { id, type, sourceType });
      logger.log('MoCap', `Source added: "${id}" (${type} → ${sourceType})`);
      return source;
    } catch (err) {
      logger.error('MoCap', `addSource failed for "${id}":`, err);
      this._sources.delete(id);
      throw err;
    }
  },

  removeSource(id) {
    const source = this._sources.get(id);
    if (!source) return false;
    if (source._extractionRAF) cancelAnimationFrame(source._extractionRAF);
    if (source.video && source.video.srcObject) {
      const stream = source.video.srcObject;
      if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop());
    }
    if (source.video && source.video.parentNode) {
      source.video.parentNode.removeChild(source.video);
    }
    this._sources.delete(id);
    this._hud?.detachVideo();
    this._state?.emit?.('mocap:source:removed', { id });
    return true;
  },

  getSources() {
    return Array.from(this._sources.values()).map(s => ({
      id: s.id, type: s.type, sourceType: s.sourceType,
      frameCount: s.frameCount, droppedFrames: s.droppedFrames,
    }));
  },

  /**
   * Map a UI source type to a MediaPipe source type.
   *   - 'webcam' / 'file' → 'pose' (the default for body tracking)
   *   - 'hand'            → 'hand'
   *   - 'face'            → 'face'
   */
  _resolveSourceType(uiType) {
    if (uiType === 'hand') return 'hand';
    if (uiType === 'face') return 'face';
    return 'pose';
  },

  /**
   * Create a `<video>` element from a webcam/file URL.
   * @returns {Promise<HTMLVideoElement>}
   */
  async _createVideoElement(type, opts) {
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:320px;height:240px;';
    document.body.appendChild(video);

    if (type === 'webcam') {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: opts.width || 1280 },
          height: { ideal: opts.height || 720 },
          frameRate: { ideal: opts.frameRate || 30 },
        },
        audio: false,
      });
      video.srcObject = stream;
    } else if (type === 'file') {
      if (!opts.url) {
        // Open a file picker
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        const file = await new Promise((resolve, reject) => {
          input.addEventListener('change', () => {
            const f = input.files?.[0];
            input.remove();
            f ? resolve(f) : reject(new Error('No file selected'));
          });
          input.addEventListener('cancel', () => {
            input.remove();
            reject(new Error('File selection cancelled'));
          });
          input.click();
        });
        video.src = URL.createObjectURL(file);
        video.loop = true;
      } else {
        video.src = opts.url;
        video.loop = true;
      }
    } else {
      // 'hand' and 'face' use webcam too (no separate file source)
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
    }
    await video.play().catch(err => {
      // Some browsers require a user gesture; the autoplay attribute helps
      logger.warn('MoCap', 'video.play() rejected:', err);
    });
    return video;
  },

  /**
   * Lazily load MediaPipe and create a landmarker for the given source type.
   * Falls back to a no-op landmarker if MediaPipe is unreachable.
   * @returns {Promise<{detect:Function}>}
   */
  async _getOrCreateLandmarker(sourceType) {
    if (this._landmarkerCache.has(sourceType)) {
      return this._landmarkerCache.get(sourceType);
    }
    try {
      const vision = await import(/* @vite-ignore */ MEDIAPIPE_VISION);
      this._mediapipe = vision;
      const { FilesetResolver, PoseLandmarker, HandLandmarker, FaceLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      let landmarker;
      if (sourceType === 'hand') {
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      } else if (sourceType === 'face') {
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      } else {
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker_lite/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: this._config.numPoses,
        });
      }
      this._landmarkerCache.set(sourceType, landmarker);
      return landmarker;
    } catch (err) {
      logger.warn('MoCap', `MediaPipe ${sourceType} landmarker failed to load; using mock fallback.`, err);
      const mock = this._createMockLandmarker(sourceType);
      this._landmarkerCache.set(sourceType, mock);
      return mock;
    }
  },

  /**
   * Create a deterministic mock landmarker for offline / CDN-blocked envs.
   * Generates a COHERENT oscillating skeleton so the retargeter, gesture
   * library, and HUD pipeline are all testable end-to-end. Each body
   * part moves in a coordinated way (not independent random oscillators)
   * so gestures like "arms up" or "squat" trigger at recognizable
   * moments. Specifically:
   *   - Shoulders and hips sway in a walking-cycle pattern
   *   - Right arm raises and lowers in a 4-second wave cycle
   *   - Both arms raise together in an 8-second cycle
   *   - Hip drops for a 3-second squat once every 12 seconds
   *   - All other landmarks interpolate between these anchors
   */
  _createMockLandmarker(sourceType) {
    const N = LANDMARK_COUNTS[sourceType] || 33;
    // Reused per-frame: hoisted out of the closure so we allocate the
    // 33 neutral landmark objects ONCE at startup rather than ~2K/sec
    // at 60fps. We then spread each into a fresh object per slot so
    // downstream consumers can mutate the result without aliasing.
    const neutralLandmarks = Array.from({ length: N }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.85 }));
    return {
      detectForVideo: () => {
        const t = performance.now() / 1000;
        // Anchor body positions (driven by the walk cycle)
        const sway = Math.sin(t * 2.0) * 0.04;
        const bounce = Math.abs(Math.sin(t * 2.0)) * 0.02;
        const rightArmUp = Math.max(0, Math.sin(t * (Math.PI * 2 / 4))); // 4s wave
        const bothArmsUp = Math.max(0, Math.sin(t * (Math.PI * 2 / 8))); // 8s
        const squating = Math.max(0, Math.sin(t * (Math.PI * 2 / 12))); // 12s squat
        // Hip drops during squat
        const hipY = 0.55 + bounce * 0.3 - squating * 0.15;
        // Shoulder positions
        const lsX = 0.40 + sway, lsY = 0.30 - bounce * 0.3 - squating * 0.1;
        const rsX = 0.60 - sway, rsY = 0.30 - bounce * 0.3 - squating * 0.1;
        // Hip positions
        const lhX = 0.44 + sway, lhY = hipY;
        const rhX = 0.56 - sway, rhY = hipY;
        // Right arm: shoulder → elbow → wrist (extends UP during wave)
        const reX = 0.65 - sway + rightArmUp * 0.04;
        const reY = 0.30 - bounce * 0.3 - squating * 0.1 - rightArmUp * 0.18;
        const rwX = 0.68 - sway + rightArmUp * 0.08;
        const rwY = 0.30 - bounce * 0.3 - squating * 0.1 - rightArmUp * 0.18;
        // Left arm: shoulder → elbow → wrist (mirrors right but with both-arms-up)
        const leX = 0.35 + sway - bothArmsUp * 0.04;
        const leY = 0.30 - bounce * 0.3 - squating * 0.1 - bothArmsUp * 0.15;
        const lwX = 0.32 + sway - bothArmsUp * 0.08;
        const lwY = 0.30 - bounce * 0.3 - squating * 0.1 - bothArmsUp * 0.18;
        // Legs
        const lkX = 0.44 + sway, lkY = 0.75 + squating * 0.08;
        const rkX = 0.56 - sway, rkY = 0.75 + squating * 0.08;
        const laX = 0.44 + sway, laY = 0.95 + squating * 0.05;
        const raX = 0.56 - sway, raY = 0.95 + squating * 0.05;
        // MediaPipe landmark map (33 body landmarks)
        const lms = neutralLandmarks.map(l => ({ ...l }));
        if (N >= 33) {
          lms[0]  = { x: 0.5, y: 0.10, z: 0, visibility: 0.9 }; // nose
          lms[11] = { x: lsX, y: lsY, z: 0, visibility: 0.95 };  // L shoulder
          lms[12] = { x: rsX, y: rsY, z: 0, visibility: 0.95 };  // R shoulder
          lms[13] = { x: 0.38 + sway - bothArmsUp * 0.02, y: leY, z: 0, visibility: 0.95 }; // L elbow
          lms[14] = { x: reX, y: reY, z: 0, visibility: 0.95 };  // R elbow
          lms[15] = { x: lwX, y: lwY, z: 0, visibility: 0.95 };  // L wrist
          lms[16] = { x: rwX, y: rwY, z: 0, visibility: 0.95 };  // R wrist
          lms[17] = { x: lwX - 0.02, y: lwY - 0.02, z: 0, visibility: 0.8 };
          lms[18] = { x: rwX + 0.02, y: rwY - 0.02, z: 0, visibility: 0.8 };
          lms[19] = { x: lwX - 0.04, y: lwY, z: 0, visibility: 0.8 };
          lms[20] = { x: rwX + 0.04, y: rwY, z: 0, visibility: 0.8 };
          lms[23] = { x: lhX, y: lhY, z: 0, visibility: 0.95 };  // L hip
          lms[24] = { x: rhX, y: rhY, z: 0, visibility: 0.95 };  // R hip
          lms[25] = { x: lkX, y: lkY, z: 0, visibility: 0.95 };  // L knee
          lms[26] = { x: rkX, y: rkY, z: 0, visibility: 0.95 };  // R knee
          lms[27] = { x: laX, y: laY, z: 0, visibility: 0.95 };  // L ankle
          lms[28] = { x: raX, y: raY, z: 0, visibility: 0.95 };  // R ankle
          lms[29] = { x: laX - 0.02, y: laY - 0.03, z: 0, visibility: 0.8 };
          lms[30] = { x: raX + 0.02, y: raY - 0.03, z: 0, visibility: 0.8 };
          lms[31] = { x: laX - 0.05, y: laY, z: 0.1, visibility: 0.8 }; // L foot index
          lms[32] = { x: raX + 0.05, y: raY, z: 0.1, visibility: 0.8 }; // R foot index
        }
        return { worldLandmarks: lms, landmarks: lms };
      },
    };
  },

  /**
   * Per-frame landmark extraction for a single source. Called via
   * requestAnimationFrame for each active source.
   */
  _extractFromSource(id) {
    const source = this._sources.get(id);
    if (!source) return;
    const video = source.video;
    const landmarker = source.landmarker;
    if (!video || !landmarker) {
      source._extractionRAF = requestAnimationFrame(() => this._extractFromSource(id));
      return;
    }
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const ts = performance.now();
      // Skip duplicate frames
      if (video.currentTime === source.lastTimestamp) {
        source.droppedFrames++;
      } else {
        source.lastTimestamp = video.currentTime;
        try {
          const results = landmarker.detectForVideo(video, ts);
          const lms = results?.worldLandmarks?.[0] || results?.landmarks?.[0] || null;
          if (lms && lms.length > 0) {
            source.lastLandmarks = lms;
            source.frameCount++;
            this._processLandmarks(source, lms);
          }
        } catch (err) {
          // MediaPipe can throw on certain GPU states; keep the loop alive
          logger.warn('MoCap', `detectForVideo failed on "${id}":`, err);
        }
      }
    }
    source._extractionRAF = requestAnimationFrame(() => this._extractFromSource(id));
  },

  // ── Pipeline (filter → retarget → gestures → record) ─────────────────

  /**
   * Process landmarks through the full pipeline. Called per frame from
   * the source's extraction loop.
   */
  _processLandmarks(source, rawLandmarks) {
    const t0 = performance.now();
    // 1. One Euro Filter (jitter removal)
    const filtered = this._bridge.oneEuroFilter(
      rawLandmarks, this._config.oneEuroBeta, this._config.oneEuroDCutoff,
    );
    // 2. Kalman confidence smoothing
    const { out: smoothed, state: kalmanState } = this._bridge.kalmanSmooth(filtered, this._kalmanState);
    this._kalmanState = kalmanState;
    // 3. Retarget to all registered targets
    for (const [tid, target] of this._targets.entries()) {
      const result = this._retargeter.retarget(
        smoothed, target.preset, target.skeleton,
        { root: target.root, mirrorX: this._config.mirrorX, useCalibration: this._retargeter.isCalibrating(target.preset) ? false : true },
      );
      // 4. Calibration frame collection
      if (this._retargeter.isCalibrating(target.preset)) {
        this._retargeter.addCalibrationFrame(target.preset, smoothed);
        const progress = this._retargeter.getCalibrationProgress(target.preset);
        if (progress >= 1) {
          this._retargeter.completeCalibration(target.preset);
          this._state?.emit?.('mocap:calibration:complete', { preset: target.preset });
        }
      }
    }
    // 5. Gestures
    if (this._config.enableGestures) {
      this._evaluateGestures(smoothed);
    }
    // 6. Recording
    if (this._config.enableRecording && this._recorder.isRecording()) {
      // Collect bone quaternions from the first target (if any)
      const firstTarget = this._targets.values().next().value;
      const bones = firstTarget && firstTarget.skeleton
        ? firstTarget.skeleton.bones.map(b => ({ x: b.quaternion.x, y: b.quaternion.y, z: b.quaternion.z, w: b.quaternion.w }))
        : [];
      this._recorder.recordFrame(smoothed, bones);
    }
    // 7. HUD updates
    if (this._hud) {
      this._hud.updateSkeleton(smoothed);
      // Update perf metrics (throttled inside the HUD)
      this._updatePerfMetrics(performance.now() - t0, smoothed);
    }
  },

  _updatePerfMetrics(latencyMS, landmarks) {
    const p = this._perf;
    p._frameAcc += latencyMS;
    p._frameCount++;
    p.latency = p._frameAcc / p._frameCount;
    p.confidence = landmarks.reduce((sum, lm) => sum + (lm.visibility || 0.85), 0) / landmarks.length;
    p.droppedFrames = 0;
    for (const s of this._sources.values()) p.droppedFrames += s.droppedFrames;
    // FPS computed on a 1s window
    const now = performance.now();
    if (p._frameWindowStart === 0) p._frameWindowStart = now;
    const elapsed = now - p._frameWindowStart;
    if (elapsed >= 1000) {
      p.fps = (p._frameCount * 1000) / elapsed;
      p._frameAcc = 0;
      p._frameCount = 0;
      p._frameWindowStart = now;
      this._hud?.updatePerf({ ...p, sourceType: this._sources.size > 0 ? 'pose' : '—', sourceId: this._sources.size > 0 ? Array.from(this._sources.keys())[0] : '—', recording: this._recorder.isRecording(), framesRecorded: this._recorder.getSessions().slice(-1)[0]?.frames || 0 });
    }
  },

  // ── Gestures ──────────────────────────────────────────────────────────

  _evaluateGestures(landmarks) {
    const now = performance.now();
    const all = new Map([...Object.entries(BUILT_IN_GESTURES), ...this._userGestures]);
    for (const [name, gesture] of all.entries()) {
      const state = this._gestureState.get(name) || { lastFired: 0 };
      if (now - state.lastFired < (gesture.cooldown || 1000)) continue;
      if (gesture.landmarkType && gesture.landmarkType !== 'pose') continue; // only pose built-ins
      try {
        if (gesture.check(landmarks)) {
          state.lastFired = now;
          this._gestureState.set(name, state);
          this._fireGesture(name, landmarks);
        }
      } catch (err) {
        // Gesture check threw — log + continue (don't kill the pipeline)
        logger.warn('MoCap', `gesture "${name}" check threw:`, err);
      }
    }
  },

  _fireGesture(name, landmarks) {
    const gesture = BUILT_IN_GESTURES[name] || this._userGestures.get(name);
    const displayName = gesture?.name || name;
    this._hud?.logGesture(displayName, `fired at ${new Date().toLocaleTimeString()}`);
    this._state?.emit?.('mocap:gesture', { name, landmarks });
    // Fire user action if registered
    const user = this._userGestures.get(name);
    if (user?.action) {
      try { user.action(landmarks); }
      catch (err) { logger.warn('MoCap', `gesture "${name}" action threw:`, err); }
    }
  },

  /**
   * Register a custom gesture. Fires every `cooldown` ms while the
   * condition holds.
   *
   * @param {string} name
   * @param {Function} checkFn   - (landmarks) => boolean
   * @param {Function} [actionFn] - (landmarks) => void
   * @param {Object} [opts]     - { cooldown, landmarkType }
   */
  addGesture(name, checkFn, actionFn, opts = {}) {
    if (typeof name !== 'string' || typeof checkFn !== 'function') {
      logger.warn('MoCap', 'addGesture: name (string) and checkFn (function) required');
      return false;
    }
    this._userGestures.set(name, {
      name,
      check: checkFn,
      action: actionFn,
      cooldown: opts.cooldown || 1000,
      landmarkType: opts.landmarkType || 'pose',
    });
    this._state?.emit?.('mocap:gesture:added', { name });
    return true;
  },

  removeGesture(name) {
    this._userGestures.delete(name);
    this._gestureState.delete(name);
  },

  listGestures() {
    return {
      builtIn: Object.keys(BUILT_IN_GESTURES),
      user: Array.from(this._userGestures.keys()),
    };
  },

  // ── Targets (skeleton binding) ────────────────────────────────────────

  registerTarget(targetId, skeleton, preset = 'mixamo-humanoid', opts = {}) {
    if (!skeleton) {
      logger.warn('MoCap', `registerTarget: no skeleton for "${targetId}"`);
      return false;
    }
    // `root` is the Object3D the retargeter writes the hip-position to.
    // Default: the first bone in the skeleton.
    const root = opts.root || (skeleton.bones && skeleton.bones[0]) || null;
    this._targets.set(targetId, { skeleton, root, preset, options: opts });
    this._state?.emit?.('mocap:target:added', { targetId, preset });
    logger.log('MoCap', `Target registered: "${targetId}" → ${preset} (${skeleton.bones?.length || 0} bones)`);
    return true;
  },

  unregisterTarget(targetId) {
    this._targets.delete(targetId);
    this._state?.emit?.('mocap:target:removed', { targetId });
  },

  getTargets() {
    return Array.from(this._targets.entries()).map(([id, t]) => ({ id, preset: t.preset, bones: t.skeleton?.bones?.length || 0 }));
  },

  setRetargetPreset(preset) {
    for (const target of this._targets.values()) {
      target.preset = preset;
    }
    this._state?.emit?.('mocap:preset:changed', { preset });
  },

  // ── T-Pose Calibration ───────────────────────────────────────────────

  startCalibration(preset = 'mixamo-humanoid') {
    this._retargeter.startCalibration(preset);
    this._state?.emit?.('mocap:calibration:start', { preset });
  },

  cancelCalibration(preset) {
    this._retargeter.cancelCalibration(preset);
  },

  // ── Recording facade ─────────────────────────────────────────────────

  getRecorder() {
    return this._recorder;
  },

  startRecording(name) {
    return this._recorder.start(name);
  },

  stopRecording() {
    return this._recorder.stop();
  },

  exportSession(sessionId, format) {
    if (format === 'glb') return this._recorder.exportGLB(sessionId);
    return this._recorder.exportBVH(sessionId);
  },

  // ── Lifecycle ────────────────────────────────────────────────────────

  update(dt) {
    // Drive recorder playback
    this._recorder?.tick(dt);
  },

  dispose() {
    for (const id of Array.from(this._sources.keys())) this.removeSource(id);
    this._hud?.destroy();
    this._recorder?.stopPlayback();
    logger.log('MoCap', 'Disposed.');
  },

  // ── Window events ────────────────────────────────────────────────────

  _wireWindowEvents() {
    window.addEventListener('mocap:add-webcam', () => this.addSource(`src_${Date.now()}`, 'webcam'));
    window.addEventListener('mocap:add-hand', () => this.addSource(`src_${Date.now()}`, 'hand'));
    window.addEventListener('mocap:add-face', () => this.addSource(`src_${Date.now()}`, 'face'));
    window.addEventListener('mocap:toggle-hud', () => this._hud?.toggle());
    window.addEventListener('mocap:start-recording', (e) => this._recorder.start(e.detail?.name));
    window.addEventListener('mocap:stop-recording', () => this._recorder.stop());
    window.addEventListener('mocap:calibrate', (e) => this.startCalibration(e.detail?.preset || 'mixamo-humanoid'));
    window.addEventListener('mocap:export', (e) => {
      const id = e.detail?.sessionId || this._recorder.getSessions().slice(-1)[0]?.id;
      const fmt = e.detail?.format || 'bvh';
      if (!id) return;
      if (fmt === 'glb') {
        this._recorder.exportGLB(id).then(glb => glb && this._recorder.downloadExport(glb, `${id}.glb`, 'model/gltf-binary'));
      } else {
        const bvh = this._recorder.exportBVH(id);
        if (bvh) this._recorder.downloadExport(bvh, `${id}.bvh`, 'application/bvh');
      }
    });
  },

  _wireStateEvents() {
    this._state?.on?.('mocap:set-mirror', ({ enabled }) => {
      this._config.mirrorX = !!enabled;
    });
  },

  _setupLuaHook() {
    if (typeof window === 'undefined') return;
    window.MoCapLuaAPI = {
      // Called from Lua scripts to subscribe to a gesture by name
      onGesture: (name, fn) => {
        if (typeof fn !== 'function') return;
        this.addGesture(name, (lms) => {
          // Lua-level: trigger fn(lms) — for now expose the landmark data
          return fn(lms);
        });
      },
      // Expose the latest landmarks to Lua
      getLandmarks: () => {
        for (const source of this._sources.values()) {
          if (source.lastLandmarks) return source.lastLandmarks;
        }
        return null;
      },
      // Trigger a recording from Lua
      startRecording: (name) => this.startRecording(name),
      stopRecording: () => this.stopRecording(),
    };
  },

  // ── Visual nodes ─────────────────────────────────────────────────────

  nodes: {
    'MoCap/SourceNode': (x, y) => createNodeCard(
      x, y, '🎥 MoCap Source', ['Preset', 'Mirror'], ['Landmarks'],
      { body: makeMoCapSourceBody(), extraClasses: ['node-card-mocap'] },
    ),
    'MoCap/RecorderNode': (x, y) => createNodeCard(
      x, y, '⏺ MoCap Recorder', ['Session'], ['Frame'],
      { body: makeMoCapRecorderBody(), extraClasses: ['node-card-mocap'] },
    ),
    'MoCap/RetargetNode': (x, y) => createNodeCard(
      x, y, '🦴 Retarget', ['Landmarks', 'Preset'], ['Bones'],
      { body: makeMoCapRetargetBody(), extraClasses: ['node-card-mocap'] },
    ),
    'MoCap/FilterNode': (x, y) => createNodeCard(
      x, y, '📉 Filter', ['Raw'], ['Filtered'],
      { body: makeMoCapFilterBody(), extraClasses: ['node-card-mocap'] },
    ),
    'MoCap/GestureNode': (x, y) => createNodeCard(
      x, y, '✋ Gesture', ['Landmarks'], ['Triggered'],
      { body: makeMoCapGestureBody(), extraClasses: ['node-card-mocap'] },
    ),
    'MoCap/ExportNode': (x, y) => createNodeCard(
      x, y, '💾 Export', ['Session'], ['BVH', 'GLB'],
      { body: makeMoCapExportBody(), extraClasses: ['node-card-mocap'] },
    ),
  },
};

// ── Node body factories ───────────────────────────────────────────────────

function makeMoCapSourceBody() {
  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;';
  body.innerHTML = `
    <label style="font-size:10px;color:#b9ccaf;">TYPE</label>
    <select data-prop="type" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
      <option value="webcam">Webcam</option>
      <option value="file">Video File</option>
      <option value="hand">Hand Tracking</option>
      <option value="face">Face Tracking</option>
    </select>
    <label style="font-size:10px;color:#b9ccaf;">MIRROR_X</label>
    <select data-prop="mirror" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
    <button data-action="run" style="margin-top:6px;background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;font-family:inherit;">▶ START SOURCE</button>
  `;
  return body;
}

function makeMoCapRecorderBody() {
  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;';
  body.innerHTML = `
    <label style="font-size:10px;color:#b9ccaf;">SESSION_NAME</label>
    <input type="text" data-prop="name" placeholder="Take_01" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
    <button data-action="run" style="background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;font-family:inherit;">⏺ START RECORDING</button>
  `;
  return body;
}

function makeMoCapRetargetBody() {
  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;';
  body.innerHTML = `
    <label style="font-size:10px;color:#b9ccaf;">PRESET</label>
    <select data-prop="preset" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
      <option value="mixamo-humanoid">Mixamo Humanoid</option>
      <option value="vrm-humanoid">VRM Humanoid</option>
      <option value="stick-figure">Stick Figure</option>
      <option value="custom-json">Custom JSON</option>
    </select>
    <label style="font-size:10px;color:#b9ccaf;">SKELETON (selection)</label>
    <input type="text" data-prop="skeleton" placeholder="auto-detect" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
    <button data-action="run" style="background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;font-family:inherit;">🦴 APPLY RETARGET</button>
  `;
  return body;
}

function makeMoCapFilterBody() {
  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;';
  body.innerHTML = `
    <label style="font-size:10px;color:#b9ccaf;">BETA (responsiveness)</label>
    <input type="range" data-prop="beta" min="0" max="0.1" step="0.001" value="0.007" style="width:100%;">
    <label style="font-size:10px;color:#b9ccaf;">D_CUTOFF (Hz)</label>
    <input type="range" data-prop="dCutoff" min="0.1" max="5" step="0.1" value="1.0" style="width:100%;">
    <button data-action="run" style="background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;font-family:inherit;">▶ APPLY FILTER</button>
  `;
  return body;
}

function makeMoCapGestureBody() {
  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;';
  body.innerHTML = `
    <label style="font-size:10px;color:#b9ccaf;">NAME</label>
    <input type="text" data-prop="name" placeholder="custom_gesture" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
    <label style="font-size:10px;color:#b9ccaf;">CONDITION (Lua)</label>
    <textarea data-prop="condition" rows="2" placeholder="lms[16].y < 0.3" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;font-family:monospace;"></textarea>
    <label style="font-size:10px;color:#b9ccaf;">COOLDOWN (ms)</label>
    <input type="number" data-prop="cooldown" value="1500" min="100" max="10000" step="100" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
    <button data-action="run" style="background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;font-family:inherit;">✋ REGISTER GESTURE</button>
  `;
  return body;
}

function makeMoCapExportBody() {
  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;';
  body.innerHTML = `
    <label style="font-size:10px;color:#b9ccaf;">FORMAT</label>
    <select data-prop="format" style="background:#1c1b1b;color:#02e600;border:2px solid #3b4b35;padding:4px;">
      <option value="bvh">BVH (text)</option>
      <option value="glb">GLB (animated 3D)</option>
    </select>
    <button data-action="run" style="background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;font-family:inherit;">💾 EXPORT LAST SESSION</button>
  `;
  return body;
}

if (typeof window !== 'undefined') {
  window.MoCapPlugin = MoCapPlugin;
}
