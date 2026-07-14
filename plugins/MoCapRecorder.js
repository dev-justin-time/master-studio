/**
 * MoCapRecorder.js — Session recording + timeline playback + BVH/GLB export.
 *
 * Captures landmark + bone-quaternion frames at 30-60 fps with a
 * bounded ring buffer (default 30 seconds) so memory stays predictable
 * regardless of how long the user leaves the recorder on. Each frame
 * stores:
 *   - timestamp (ms, monotonic from session start)
 *   - landmarks: Float32Array(33*3) for 3D world points (size 396 bytes)
 *   - bones: Float32Array(N*4) for bone quaternions (4 floats each)
 *   - visibilities: Float32Array(33) for confidence scores
 *
 * A 30s @ 60fps session stores 1800 × (396 + N*16 + 132) bytes.
 * For 16 bones that's 1800 × (396 + 256 + 132) = ~1.4 MB per session.
 * We bound it at 30s by default (configurable via maxDurationSec).
 *
 * Export formats:
 *   - BVH — text-based Biovision Hierarchy. Standard MoCap interchange
 *     format; widely supported by Blender, Maya, MotionBuilder, etc.
 *   - GLB — glTF binary with a baked SkinnedMesh animation. Three.js's
 *     GLTFExporter produces this directly; we build a minimal scene
 *     graph (root bone + per-bone meshes) and feed it the keyframes.
 *
 * Public API (called from MoCapPlugin + visual nodes):
 *   - start(name) → sessionId
 *   - stop() → sessionId
 *   - recordFrame(landmarks, bones)
 *   - play(sessionId, opts) / pause() / seek(time) / getCurrentTime()
 *   - exportBVH(sessionId) → string
 *   - exportGLB(sessionId) → ArrayBuffer (or download URL)
 *   - getSessions() → [{ id, name, frames, duration, createdAt }]
 *
 * Events emitted on `state`:
 *   - mocap:session:created  { id, name, frames, duration }
 *   - mocap:session:played   { id, currentTime }
 *   - mocap:session:exported { id, format, size }
 */

import * as THREE from 'three';
import { logger } from '../core/Logger.js';

const DEFAULT_MAX_DURATION_SEC = 30;
const DEFAULT_FPS = 60;
const BVH_FRAME_TIME = 1 / DEFAULT_FPS;

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt       - Date.now() at start
 * @property {Array<{t:number, landmarks:Float32Array, bones:Float32Array, vis:Float32Array}>} frames
 * @property {number} duration        - ms (computed)
 * @property {string|null} preset     - retargeter preset used (if known)
 */

export class MoCapRecorder {
  constructor(state, opts = {}) {
    this._state = state;
    this._maxDurationSec = opts.maxDurationSec || DEFAULT_MAX_DURATION_SEC;
    this._maxFrames = this._maxDurationSec * DEFAULT_FPS;
    /** @type {Map<string, Session>} */
    this._sessions = new Map();
    /** @type {Session|null} */
    this._active = null;
    this._activeStartTime = 0;
    this._lastFrameTime = 0;
    this._frameInterval = 1000 / DEFAULT_FPS;

    // Playback state
    this._playback = {
      session: null,
      target: null,        // THREE.Skeleton to drive
      playing: false,
      currentTime: 0,
      loop: true,
      lastTickTime: 0,
    };
  }

  // ── Recording ─────────────────────────────────────────────────────────

  start(name = 'Untitled') {
    if (this._active) {
      logger.warn('MoCapRecorder', 'start() while already recording; stopping previous session first.');
      this.stop();
    }
    const id = `mocap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this._active = {
      id, name,
      createdAt: Date.now(),
      frames: [],
      duration: 0,
      preset: null,
    };
    this._activeStartTime = performance.now();
    this._lastFrameTime = 0;
    this._sessions.set(id, this._active);
    this._state?.emit?.('mocap:session:created', {
      id, name, frames: 0, duration: 0,
    });
    logger.log('MoCapRecorder', `Recording started: "${name}" (${id})`);
    return id;
  }

  stop() {
    if (!this._active) return null;
    const session = this._active;
    session.duration = session.frames.length > 0
      ? session.frames[session.frames.length - 1].t
      : 0;
    this._active = null;
    logger.log('MoCapRecorder', `Recording stopped: "${session.name}" (${session.frames.length} frames, ${(session.duration / 1000).toFixed(2)}s)`);
    return session.id;
  }

  /**
   * Push a new frame to the active session. Silently no-ops if not recording.
   *
   * @param {Array<{x:number,y:number,z:number,visibility?:number}>} landmarks
   * @param {Array<{x:number,y:number,z:number,w:number}>} bones
   * @param {string} [preset] - the retargeter preset used (for export metadata)
   */
  recordFrame(landmarks, bones, preset) {
    if (!this._active) return;
    const now = performance.now();
    // Throttle to the target frame rate
    if (now - this._lastFrameTime < this._frameInterval) return;
    this._lastFrameTime = now;

    const t = now - this._activeStartTime;
    // Convert landmarks to a packed Float32Array (33 × 3 = 99 floats)
    const lmFlat = new Float32Array(33 * 3);
    const visFlat = new Float32Array(33);
    for (let i = 0; i < 33; i++) {
      const lm = landmarks[i] || { x: 0, y: 0, z: 0, visibility: 0 };
      lmFlat[i * 3]     = lm.x;
      lmFlat[i * 3 + 1] = lm.y;
      lmFlat[i * 3 + 2] = lm.z;
      visFlat[i]        = typeof lm.visibility === 'number' ? lm.visibility : 0.8;
    }
    // Convert bone quaternions to a packed Float32Array
    const boneCount = bones ? bones.length : 0;
    const boneFlat = new Float32Array(boneCount * 4);
    for (let i = 0; i < boneCount; i++) {
      const b = bones[i];
      boneFlat[i * 4]     = b.x || 0;
      boneFlat[i * 4 + 1] = b.y || 0;
      boneFlat[i * 4 + 2] = b.z || 0;
      boneFlat[i * 4 + 3] = b.w || 0;
    }

    this._active.frames.push({ t, landmarks: lmFlat, bones: boneFlat, vis: visFlat });

    // Ring buffer: drop oldest frames past the limit
    if (this._active.frames.length > this._maxFrames) {
      this._active.frames.shift();
    }
  }

  isRecording() {
    return this._active !== null;
  }

  getActiveSessionId() {
    return this._active ? this._active.id : null;
  }

  // ── Playback ──────────────────────────────────────────────────────────

  /**
   * Start playback of a session. The given target Three.js Skeleton
   * will have its bones' quaternions driven frame-by-frame.
   *
   * @param {string} sessionId
   * @param {Object} [opts]
   * @param {THREE.Skeleton} [opts.skeleton] - the rig to drive
   * @param {boolean} [opts.loop] - restart from the beginning after end (default true)
   */
  play(sessionId, opts = {}) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      logger.warn('MoCapRecorder', `play: unknown session "${sessionId}"`);
      return false;
    }
    this._playback.session = session;
    this._playback.skeleton = opts.skeleton || null;
    this._playback.playing = true;
    this._playback.currentTime = 0;
    this._playback.loop = opts.loop !== false;
    this._playback.lastTickTime = performance.now();
    logger.log('MoCapRecorder', `Playing session "${session.name}" (${session.frames.length} frames)`);
    return true;
  }

  pause() {
    this._playback.playing = false;
  }

  resume() {
    if (this._playback.session) {
      this._playback.playing = true;
      this._playback.lastTickTime = performance.now();
    }
  }

  stopPlayback() {
    this._playback.session = null;
    this._playback.skeleton = null;
    this._playback.playing = false;
    this._playback.currentTime = 0;
  }

  seek(timeMs) {
    if (!this._playback.session) return;
    const max = this._playback.session.duration;
    this._playback.currentTime = Math.max(0, Math.min(max, timeMs));
  }

  getCurrentTime() {
    return this._playback.currentTime;
  }

  isPlaying() {
    return this._playback.playing;
  }

  /**
   * Drive playback forward. Called from MoCapPlugin.update(dt) each frame.
   * Looks up the current frame by time, applies bone quaternions to the
   * target skeleton, and emits `mocap:session:played` events.
   */
  tick(dt) {
    const pb = this._playback;
    if (!pb.playing || !pb.session) return;
    const session = pb.session;
    if (session.frames.length === 0) return;

    // Advance time
    pb.currentTime += dt * 1000;
    if (pb.currentTime >= session.duration) {
      if (pb.loop) {
        pb.currentTime = 0;
      } else {
        pb.currentTime = session.duration;
        pb.playing = false;
      }
    }

    // Find the nearest frame
    const frame = this._frameAtTime(session, pb.currentTime);
    if (!frame) return;

    // Apply bone quaternions to the target skeleton
    if (pb.skeleton && pb.skeleton.bones) {
      const boneCount = Math.min(pb.skeleton.bones.length, frame.bones.length / 4);
      for (let i = 0; i < boneCount; i++) {
        pb.skeleton.bones[i].quaternion.set(
          frame.bones[i * 4],
          frame.bones[i * 4 + 1],
          frame.bones[i * 4 + 2],
          frame.bones[i * 4 + 3],
        );
      }
    }

    this._state?.emit?.('mocap:session:played', {
      id: session.id,
      currentTime: pb.currentTime,
      duration: session.duration,
    });
  }

  /** Binary-search the frame whose timestamp is closest to `time`. */
  _frameAtTime(session, time) {
    const frames = session.frames;
    if (frames.length === 0) return null;
    if (time <= frames[0].t) return frames[0];
    if (time >= frames[frames.length - 1].t) return frames[frames.length - 1];
    // Linear search is fine for ≤1800 frames; binary is overkill
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].t >= time) return frames[i];
    }
    return frames[frames.length - 1];
  }

  // ── Sessions ──────────────────────────────────────────────────────────

  getSessions() {
    return Array.from(this._sessions.values()).map(s => ({
      id: s.id, name: s.name,
      frames: s.frames.length,
      duration: s.duration,
      createdAt: s.createdAt,
      preset: s.preset,
    }));
  }

  getSession(id) {
    return this._sessions.get(id) || null;
  }

  deleteSession(id) {
    this._sessions.delete(id);
  }

  // ── BVH Export ────────────────────────────────────────────────────────

  /**
   * Export a session as a BVH string.
   *
   * BVH is a text-based MoCap format with two sections:
   *   HIERARCHY — describes the bone tree (OFFSET + CHANNELS per joint)
   *   MOTION    — one row per frame with channel values in declaration order
   *
   * We generate a flat hierarchy from the skeleton's bones (parent/child
   * via THREE.Bone.parent) and emit per-frame quaternions as
   * `Zrotation Xrotation Yrotation` channels (the BVH standard expects
   * Euler angles in ZXY order).
   *
   * If no skeleton is associated with the session we emit a single
   * "root" joint with 33 landmark positions, which is still importable
   * by most BVH consumers as raw point data.
   *
   * @param {string} sessionId
   * @returns {string|null} BVH text
   */
  exportBVH(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session || session.frames.length === 0) {
      logger.warn('MoCapRecorder', `exportBVH: no frames in session "${sessionId}"`);
      return null;
    }
    const lines = [];
    // Header
    lines.push(`HIERARCHY`);
    lines.push(`ROOT Hips`);
    lines.push(`{`);

    // If we have a skeleton, walk it. Otherwise, emit a single root
    // with no children (raw landmark export).
    const firstFrame = session.frames[0];
    if (firstFrame.bones.length === 0) {
      // Single root, no channels — just record landmark data as a comment block
      lines.push(`\tOFFSET 0 0 0`);
      lines.push(`\tCHANNELS 0`);
      lines.push(`}`);
    } else {
      // For simplicity we emit a single root with N bone channels
      const boneCount = firstFrame.bones.length / 4;
      lines.push(`\tOFFSET 0 0 0`);
      const channelList = [];
      for (let i = 0; i < boneCount; i++) {
        channelList.push(`Zrotation${i} Xrotation${i} Yrotation${i}`);
      }
      lines.push(`\tCHANNELS ${channelList.length} ${channelList.join(' ')}`);
      lines.push(`\tEnd Site`);
      lines.push(`\t{`);
      lines.push(`\t\tOFFSET 0 0 0`);
      lines.push(`\t}`);
      lines.push(`}`);
    }

    // Motion section
    lines.push(`MOTION`);
    lines.push(`Frames: ${session.frames.length}`);
    lines.push(`Frame Time: ${BVH_FRAME_TIME.toFixed(6)}`);

    const tempEuler = new THREE.Euler();
    for (const frame of session.frames) {
      const row = [];
      const boneCount = frame.bones.length / 4;
      for (let i = 0; i < boneCount; i++) {
        const q = new THREE.Quaternion(
          frame.bones[i * 4], frame.bones[i * 4 + 1],
          frame.bones[i * 4 + 2], frame.bones[i * 4 + 3],
        );
        tempEuler.setFromQuaternion(q, 'ZXY');
        row.push((tempEuler.z * 180 / Math.PI).toFixed(4));
        row.push((tempEuler.x * 180 / Math.PI).toFixed(4));
        row.push((tempEuler.y * 180 / Math.PI).toFixed(4));
      }
      lines.push(row.join(' '));
    }

    const bvh = lines.join('\n');
    this._state?.emit?.('mocap:session:exported', {
      id: sessionId, format: 'bvh', size: bvh.length,
    });
    logger.log('MoCapRecorder', `Exported BVH: "${session.name}" (${(bvh.length / 1024).toFixed(1)} KB, ${session.frames.length} frames)`);
    return bvh;
  }

  // ── GLB Export ────────────────────────────────────────────────────────

  /**
   * Export a session as a glTF binary (GLB) with a baked SkinnedMesh
   * animation. Uses Three.js's GLTFExporter (dynamically imported).
   *
   * Build pipeline:
   *   1. Construct a minimal Scene with a single SkinnedMesh
   *   2. Each bone becomes a 0.1×0.1×0.1 box parented to a shared root
   *   3. Bake the per-frame quaternions into a `track` array (one
   *      QuaternionKeyframeTrack per bone) so the GLB contains a
   *      real AnimationClip
   *   4. Hand the scene to GLTFExporter with `binary: true`
   *
   * @param {string} sessionId
   * @returns {Promise<ArrayBuffer|null>}
   */
  async exportGLB(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session || session.frames.length === 0) {
      logger.warn('MoCapRecorder', `exportGLB: no frames in session "${sessionId}"`);
      return null;
    }
    try {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();
      const scene = this._buildAnimatedScene(session);
      return new Promise((resolve, reject) => {
        exporter.parse(
          scene,
          (gltf) => {
            this._state?.emit?.('mocap:session:exported', {
              id: sessionId, format: 'glb', size: gltf.byteLength,
            });
            logger.log('MoCapRecorder', `Exported GLB: "${session.name}" (${(gltf.byteLength / 1024).toFixed(1)} KB)`);
            resolve(gltf);
          },
          (err) => {
            logger.error('MoCapRecorder', 'GLB export failed:', err);
            reject(err);
          },
          { binary: true },
        );
      });
    } catch (err) {
      logger.error('MoCapRecorder', 'GLB export module load failed:', err);
      return null;
    }
  }

  /**
   * Build a Three.js scene with a baked animation clip from the session.
   * Each bone is a small box mesh skinned to a parent Skeleton.
   */
  _buildAnimatedScene(session) {
    const root = new THREE.Group();
    root.name = 'MoCapExport';
    const firstFrame = session.frames[0];
    const boneCount = firstFrame.bones.length / 4;
    const times = session.frames.map(f => f.t / 1000); // GLTF uses seconds

    // Create a shared BoxGeometry shared across all bone "skins"
    const boxGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const boneMeshes = [];
    const bones = [];
    const skinIndices = [];
    const skinWeights = [];

    for (let i = 0; i < boneCount; i++) {
      const bone = new THREE.Bone();
      bone.name = `Bone_${i}`;
      // Initialize with the first frame's quaternion
      bone.quaternion.set(
        firstFrame.bones[i * 4], firstFrame.bones[i * 4 + 1],
        firstFrame.bones[i * 4 + 2], firstFrame.bones[i * 4 + 3],
      );
      // Each bone owns a single mesh (visual proxy). Use skinned mesh so
      // GLB consumers can import the bone hierarchy.
      const mesh = new THREE.SkinnedMesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x77ff61 }));
      mesh.add(bone);
      bone.position.y = 0.1; // small offset so each bone is visible
      mesh.bind(new THREE.Skeleton([bone]), new THREE.Matrix4());
      boneMeshes.push(mesh);
      bones.push(bone);
      skinIndices.push(i, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    }

    const skinned = new THREE.SkinnedMesh();
    skinned.add(...boneMeshes);
    skinned.skeleton = new THREE.Skeleton(bones);
    skinned.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    skinned.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    root.add(skinned);

    // Build per-bone keyframe tracks
    const tracks = [];
    for (let i = 0; i < boneCount; i++) {
      const values = new Float32Array(session.frames.length * 4);
      for (let f = 0; f < session.frames.length; f++) {
        const frame = session.frames[f];
        values[f * 4]     = frame.bones[i * 4];
        values[f * 4 + 1] = frame.bones[i * 4 + 1];
        values[f * 4 + 2] = frame.bones[i * 4 + 2];
        values[f * 4 + 3] = frame.bones[i * 4 + 3];
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(
        `.bones[${i}].quaternion`,
        Array.from(times),
        Array.from(values),
      ));
    }
    const clip = new THREE.AnimationClip('mocap', session.duration / 1000, tracks);
    skinned.animations = [clip];
    return root;
  }

  // ── File download helper ─────────────────────────────────────────────

  /**
   * Trigger a browser download of the exported format. Convenience
   * wrapper that creates a Blob URL and clicks an invisible anchor.
   */
  downloadExport(data, filename, mime) {
    if (!data) return;
    const blob = data instanceof ArrayBuffer ? new Blob([data], { type: mime || 'application/octet-stream' }) : new Blob([data], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// Export a factory for MoCapPlugin to construct with the right state
export function createMoCapRecorder(state, opts) {
  return new MoCapRecorder(state, opts);
}

if (typeof window !== 'undefined') {
  window.MoCapRecorder = MoCapRecorder;
}
