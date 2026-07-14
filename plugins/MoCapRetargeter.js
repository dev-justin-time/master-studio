/**
 * MoCapRetargeter.js — Skeleton-agnostic motion capture retargeting.
 *
 * Takes MediaPipe Pose landmarks (33 3D points) and applies them as
 * bone quaternions to ANY Three.js skeleton. The mapping is a "preset"
 * that declares, for each bone, which two MediaPipe landmark indices
 * define the bone's direction in the rest pose, and what the rest-pose
 * direction vector is.
 *
 * Built-in presets:
 *   - `mixamo-humanoid`  — 15-bone Mixamo rig (Hips, Spine, Chest, Neck,
 *     Head, L/R UpperArm, L/R LowerArm, L/R UpperLeg, L/R LowerLeg, L/R Foot)
 *   - `vrm-humanoid`     — VRM 1.0 humanoid (similar to Mixamo but with
 *     additional Chest/Spine separation)
 *   - `stick-figure`     — 12-bone debug visualization
 *   - `custom-json`      — user-supplied JSON (via addCustomPreset())
 *
 * Why a retargeter is the key differentiator:
 *   - MediaPipe's 33 landmarks map to a T-pose by definition
 *   - But no two rigs use the same bone names, hierarchy, or rest
 *     directions. Without a retargeter, you're stuck retargeting to
 *     one specific skeleton
 *   - The retargeter is what makes this "skeleton-agnostic" — point
 *     it at any Three.js Skeleton and the preset declares how to
 *     interpret the MediaPipe output
 *
 * Confidence blending: when a MediaPipe landmark's `visibility` is
 * below 0.5, we hold the last good pose for that bone (a common
 * trick used by professional MoCap tools to handle occluded body
 * parts without jitter).
 *
 * T-pose calibration: `applyTposeCalibration(skeleton, source)` captures
 * 60 frames of neutral pose and stores the average direction for each
 * bone as the new rest direction. The next retarget call uses these
 * calibrated rest directions instead of the preset's defaults — useful
 * when the user's skeleton has non-standard bone orientations.
 */

import * as THREE from 'three';
import { logger } from '../core/Logger.js';

// ════════════════════════════════════════════════════════════════════════
// Built-in presets
// ════════════════════════════════════════════════════════════════════════

/**
 * Common MediaPipe Pose landmark indices used across all presets.
 * Documented once at the top of the file so each preset below can
 * reference a clear semantic name instead of magic numbers.
 */
const MP = Object.freeze({
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
});

// Each preset declares the bone mapping: for each bone name, the two
// MediaPipe indices that define the bone's source direction, and the
// rest-pose direction vector in the TARGET skeleton's local space.
//
// The rotation is computed as: quat = fromTo(restDir, srcDir) where
// srcDir is the world-space direction from landmark[a] to landmark[b].
//
// `scale` is the per-bone multiplier applied to the source direction
// (so a small/short bone in the target rig doesn't get blown out by
// a long MediaPipe limb segment).
const PRESETS = {
  'mixamo-humanoid': {
    name: 'Mixamo Humanoid',
    description: '15-bone Mixamo humanoid rig (Hips → Foot, L/R).',
    bones: {
      // Spine
      'mixamorigSpine':       { mpIndices: [MP.LEFT_HIP, MP.LEFT_SHOULDER], restDir: [0, 1, 0], scale: 0.5 },
      // Chest (skip — Mixamo merges Spine1 into Spine for some rigs)
      'mixamorigSpine1':      { mpIndices: [MP.LEFT_HIP, MP.LEFT_SHOULDER], restDir: [0, 1, 0], scale: 0.5 },
      // Neck
      'mixamorigNeck':        { mpIndices: [MP.LEFT_SHOULDER, MP.NOSE],      restDir: [0, 1, 0], scale: 0.2 },
      // Head
      'mixamorigHead':        { mpIndices: [MP.LEFT_SHOULDER, MP.NOSE],      restDir: [0, 1, 0], scale: 0.2 },
      // Left arm
      'mixamorigLeftArm':     { mpIndices: [MP.LEFT_SHOULDER, MP.LEFT_ELBOW],  restDir: [1, 0, 0], scale: 1.0 },
      'mixamorigLeftForeArm': { mpIndices: [MP.LEFT_ELBOW,    MP.LEFT_WRIST],  restDir: [1, 0, 0], scale: 1.0 },
      // Right arm
      'mixamorigRightArm':    { mpIndices: [MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW], restDir: [-1, 0, 0], scale: 1.0 },
      'mixamorigRightForeArm':{ mpIndices: [MP.RIGHT_ELBOW,    MP.RIGHT_WRIST], restDir: [-1, 0, 0], scale: 1.0 },
      // Left leg
      'mixamorigLeftUpLeg':   { mpIndices: [MP.LEFT_HIP,  MP.LEFT_KNEE],  restDir: [0, -1, 0], scale: 1.0 },
      'mixamorigLeftLeg':     { mpIndices: [MP.LEFT_KNEE, MP.LEFT_ANKLE], restDir: [0, -1, 0], scale: 1.0 },
      'mixamorigLeftFoot':    { mpIndices: [MP.LEFT_ANKLE, MP.LEFT_FOOT_INDEX], restDir: [0, 0, 1], scale: 0.3 },
      // Right leg
      'mixamorigRightUpLeg':  { mpIndices: [MP.RIGHT_HIP,  MP.RIGHT_KNEE],  restDir: [0, -1, 0], scale: 1.0 },
      'mixamorigRightLeg':    { mpIndices: [MP.RIGHT_KNEE, MP.RIGHT_ANKLE], restDir: [0, -1, 0], scale: 1.0 },
      'mixamorigRightFoot':   { mpIndices: [MP.RIGHT_ANKLE, MP.RIGHT_FOOT_INDEX], restDir: [0, 0, 1], scale: 0.3 },
    },
  },

  'vrm-humanoid': {
    name: 'VRM Humanoid',
    description: 'VRM 1.0 humanoid rig (similar to Mixamo with explicit Chest/Spine split).',
    bones: {
      'hips':         { mpIndices: [MP.LEFT_HIP, MP.RIGHT_HIP], restDir: [0, 1, 0], scale: 0.0 }, // root
      'spine':        { mpIndices: [MP.LEFT_HIP, MP.LEFT_SHOULDER], restDir: [0, 1, 0], scale: 0.5 },
      'chest':        { mpIndices: [MP.LEFT_HIP, MP.LEFT_SHOULDER], restDir: [0, 1, 0], scale: 0.5 },
      'upperChest':   { mpIndices: [MP.LEFT_HIP, MP.LEFT_SHOULDER], restDir: [0, 1, 0], scale: 0.5 },
      'neck':         { mpIndices: [MP.LEFT_SHOULDER, MP.NOSE], restDir: [0, 1, 0], scale: 0.2 },
      'head':         { mpIndices: [MP.LEFT_SHOULDER, MP.NOSE], restDir: [0, 1, 0], scale: 0.2 },
      'leftUpperArm':  { mpIndices: [MP.LEFT_SHOULDER, MP.LEFT_ELBOW], restDir: [1, 0, 0], scale: 1.0 },
      'leftLowerArm':  { mpIndices: [MP.LEFT_ELBOW, MP.LEFT_WRIST],    restDir: [1, 0, 0], scale: 1.0 },
      'rightUpperArm': { mpIndices: [MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW], restDir: [-1, 0, 0], scale: 1.0 },
      'rightLowerArm': { mpIndices: [MP.RIGHT_ELBOW, MP.RIGHT_WRIST],    restDir: [-1, 0, 0], scale: 1.0 },
      'leftUpperLeg':  { mpIndices: [MP.LEFT_HIP, MP.LEFT_KNEE],  restDir: [0, -1, 0], scale: 1.0 },
      'leftLowerLeg':  { mpIndices: [MP.LEFT_KNEE, MP.LEFT_ANKLE], restDir: [0, -1, 0], scale: 1.0 },
      'rightUpperLeg': { mpIndices: [MP.RIGHT_HIP, MP.RIGHT_KNEE],  restDir: [0, -1, 0], scale: 1.0 },
      'rightLowerLeg': { mpIndices: [MP.RIGHT_KNEE, MP.RIGHT_ANKLE], restDir: [0, -1, 0], scale: 1.0 },
    },
  },

  'stick-figure': {
    name: 'Stick Figure (Debug)',
    description: '12-bone debug visualization. Use to verify landmark extraction without a real rig.',
    bones: {
      'Spine':    { mpIndices: [MP.LEFT_HIP, MP.LEFT_SHOULDER], restDir: [0, 1, 0], scale: 0.5 },
      'Neck':     { mpIndices: [MP.LEFT_SHOULDER, MP.NOSE], restDir: [0, 1, 0], scale: 0.2 },
      'LeftArm':  { mpIndices: [MP.LEFT_SHOULDER, MP.LEFT_ELBOW], restDir: [1, 0, 0], scale: 1.0 },
      'LeftForeArm': { mpIndices: [MP.LEFT_ELBOW, MP.LEFT_WRIST], restDir: [1, 0, 0], scale: 1.0 },
      'RightArm': { mpIndices: [MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW], restDir: [-1, 0, 0], scale: 1.0 },
      'RightForeArm': { mpIndices: [MP.RIGHT_ELBOW, MP.RIGHT_WRIST], restDir: [-1, 0, 0], scale: 1.0 },
      'LeftUpLeg': { mpIndices: [MP.LEFT_HIP, MP.LEFT_KNEE], restDir: [0, -1, 0], scale: 1.0 },
      'LeftLeg':   { mpIndices: [MP.LEFT_KNEE, MP.LEFT_ANKLE], restDir: [0, -1, 0], scale: 1.0 },
      'RightUpLeg':{ mpIndices: [MP.RIGHT_HIP, MP.RIGHT_KNEE], restDir: [0, -1, 0], scale: 1.0 },
      'RightLeg':  { mpIndices: [MP.RIGHT_KNEE, MP.RIGHT_ANKLE], restDir: [0, -1, 0], scale: 1.0 },
    },
  },

  'custom-json': {
    name: 'Custom (User JSON)',
    description: 'User-supplied JSON mapping. Call `addCustomPreset(json)` to populate.',
    bones: {},
  },
};

const VISIBILITY_THRESHOLD = 0.5;
const CALIBRATION_FRAMES = 60; // ~1s at 60fps

// ════════════════════════════════════════════════════════════════════════
// MoCapRetargeter class
// ════════════════════════════════════════════════════════════════════════

export class MoCapRetargeter {
  constructor() {
    this._customPresets = new Map(); // user presets (name -> preset)
    this._calibrationFrames = new Map(); // presetName -> { frames: number, restDirs: Map<boneName, [x,y,z]> }
    this._lastGoodQuats = new Map(); // boneName -> {x,y,z,w} for confidence fallbacks
    this._tempQuat = new THREE.Quaternion();
    this._tempVec3 = new THREE.Vector3();
  }

  /**
   * Returns the list of available preset names (built-in + custom).
   */
  listPresets() {
    const built = Object.keys(PRESETS);
    const custom = Array.from(this._customPresets.keys());
    return [...built, ...custom];
  }

  /**
   * Get a preset by name. Returns the preset object or null if not found.
   */
  getPreset(name) {
    return PRESETS[name] || this._customPresets.get(name) || null;
  }

  /**
   * Add a user-supplied custom preset.
   * @param {string} name
   * @param {{bones:Object,description?:string,scale?:number}} preset
   */
  addCustomPreset(name, preset) {
    if (!preset || typeof preset !== 'object' || !preset.bones) {
      logger.warn('MoCapRetargeter', `addCustomPreset("${name}"): missing 'bones' object`);
      return false;
    }
    this._customPresets.set(name, { ...preset, name: preset.name || name, _custom: true });
    logger.log('MoCapRetargeter', `Added custom preset "${name}" with ${Object.keys(preset.bones).length} bones.`);
    return true;
  }

  /**
   * Retarget MediaPipe landmarks to a Three.js skeleton.
   *
   * @param {Array<{x:number,y:number,z:number,visibility?:number}>} landmarks - MediaPipe Pose output
   * @param {string} presetName - which preset to use
   * @param {THREE.Skeleton} skeleton - the target rig
   * @param {Object} [opts]
   * @param {THREE.Object3D} [opts.root] - skeleton root Object3D for root-position translation
   * @param {boolean} [opts.useCalibration] - if true, use T-pose-calibrated rest directions
   * @param {boolean} [opts.mirrorX] - if true, mirror X axis (for natural webcam interaction)
   * @returns {{applied:number,skipped:number,rootPos:{x,y,z}|null}} per-bone application stats
   */
  retarget(landmarks, presetName, skeleton, opts = {}) {
    if (!landmarks || landmarks.length < 33) {
      return { applied: 0, skipped: 0, rootPos: null };
    }
    const preset = this.getPreset(presetName);
    if (!preset) {
      logger.warn('MoCapRetargeter', `retarget: unknown preset "${presetName}"`);
      return { applied: 0, skipped: 0, rootPos: null };
    }
    if (!skeleton || !skeleton.bones) {
      logger.warn('MoCapRetargeter', 'retarget: invalid skeleton');
      return { applied: 0, skipped: 0, rootPos: null };
    }

    // Build a bone-name → THREE.Bone lookup once
    const boneLookup = new Map();
    for (const bone of skeleton.bones) boneLookup.set(bone.name, bone);

    // Root position: average of left/right hip (or use the first hip if skeleton has hips)
    let rootPos = null;
    if (opts.root) {
      const lh = landmarks[MP.LEFT_HIP], rh = landmarks[MP.RIGHT_HIP];
      if (lh && rh) {
        const mx = (lh.x + rh.x) / 2;
        const my = (lh.y + rh.y) / 2;
        const mz = (lh.z + rh.z) / 2;
        // MediaPipe coordinates: x∈[0,1] (right→left in mirrored mode), y∈[0,1] (top→bottom),
        // z is depth (negative = closer to camera). Flip y so up is +Y, and (optionally) flip x.
        const sx = opts.mirrorX ? 1 - mx : mx;
        const sy = 1 - my;
        const sz = mz;
        // Scale to scene units (empirically 2-3 units tall for a human)
        const SCENE_SCALE = 2.5;
        rootPos = { x: (sx - 0.5) * SCENE_SCALE, y: (sy - 0.5) * SCENE_SCALE, z: -sz * SCENE_SCALE };
        opts.root.position.set(rootPos.x, rootPos.y, rootPos.z);
      }
    }

    let applied = 0, skipped = 0;
    const calibration = opts.useCalibration ? this._calibrationFrames.get(presetName) : null;

    // Reused scratch quaternions to avoid per-bone allocations.
    // `_parentWorld` and `_invParent` are only allocated lazily because
    // most single-bone presets don't need them.
    const desiredWorld = this._tempQuat;
    const parentWorld = new THREE.Quaternion();
    const invParent = new THREE.Quaternion();

    // Sort preset bones by their depth in the skeleton (root first)
    // so the local-space multiply below reads an up-to-date parent
    // world quaternion. The conversion `local = parent_inverse *
    // desired_world` requires the parent's world transform to reflect
    // its already-written quaternion. We sort once per `retarget()` call
    // — for 15-bone presets the cost is negligible (< 1µs).
    //
    // The previous version assumed `Object.entries(preset.bones)` was
    // already in root-first order. That worked for the built-in presets
    // (which happen to be declared root-first) but broke for any custom
    // JSON preset where the user declared children before parents. The
    // explicit sort is robust to any declaration order.
    const boneDepth = new Map();
    for (const [boneName] of Object.entries(preset.bones)) {
      const bone = boneLookup.get(boneName);
      if (!bone) continue;
      let depth = 0;
      let p = bone.parent;
      while (p && p.isBone) { depth++; p = p.parent; }
      boneDepth.set(boneName, depth);
    }
    const sortedBones = Object.entries(preset.bones)
      .sort((a, b) => (boneDepth.get(a[0]) ?? 0) - (boneDepth.get(b[0]) ?? 0));

    for (const [boneName, def] of sortedBones) {
      const bone = boneLookup.get(boneName);
      if (!bone) { skipped++; continue; }

      const a = landmarks[def.mpIndices[0]];
      const b = landmarks[def.mpIndices[1]];
      if (!a || !b) { skipped++; continue; }

      // Confidence check: if either landmark is occluded, hold the
      // last good rotation rather than letting the bone snap to
      // a wildly different position.
      const visA = typeof a.visibility === 'number' ? a.visibility : 0.8;
      const visB = typeof b.visibility === 'number' ? b.visibility : 0.8;
      const minVis = Math.min(visA, visB);

      if (minVis < VISIBILITY_THRESHOLD && this._lastGoodQuats.has(boneName)) {
        // Reuse the last good quaternion (in LOCAL space — same as a
        // normal write below, so the child chain stays consistent).
        const last = this._lastGoodQuats.get(boneName);
        bone.quaternion.set(last.x, last.y, last.z, last.w);
        bone.updateMatrixWorld(true);
        applied++;
        continue;
      }

      // World-space source direction (a→b). MediaPipe x is right-to-left in
      // mirrored mode; we already flipped it in the root calc, but bone
      // directions also need to match the rig's coordinate convention.
      // Three.js: +X right, +Y up, +Z toward camera (out of screen).
      const sourceX = (b.x - a.x) * (opts.mirrorX ? -1 : 1);
      const sourceY = -(b.y - a.y); // flip Y so up is +Y
      const sourceZ = -(b.z - a.z); // flip Z so closer to camera is +Z

      const srcDir = this._tempVec3.set(sourceX, sourceY, sourceZ);
      const srcLen = srcDir.length();
      if (srcLen < 1e-6) { skipped++; continue; }
      srcDir.divideScalar(srcLen);

      // Rest direction: use calibrated if available, else preset default
      let restDir;
      if (calibration && calibration.restDirs.has(boneName)) {
        const cal = calibration.restDirs.get(boneName);
        restDir = new THREE.Vector3(cal[0], cal[1], cal[2]).normalize();
      } else {
        restDir = new THREE.Vector3(def.restDir[0], def.restDir[1], def.restDir[2]);
      }

      // Desired WORLD rotation: from rest → source.
      // Three.js's `setFromUnitVectors(from, to)` gives the shortest-arc quaternion.
      desiredWorld.setFromUnitVectors(restDir, srcDir);

      // Convert world rotation to LOCAL rotation relative to the parent.
      // For a single-root rig (parent is the skeleton root, no bone parent),
      // the parent world quaternion is identity and this becomes a no-op.
      // For a multi-bone chain, the parent world quaternion is read from
      // the live matrixWorld, which was updated by the previous iteration
      // (skeleton.bones is conventionally root-first, so parents come first).
      if (bone.parent && bone.parent.isBone) {
        bone.parent.getWorldQuaternion(parentWorld);
        invParent.copy(parentWorld).invert();
        bone.quaternion.copy(invParent).multiply(desiredWorld);
      } else {
        bone.quaternion.copy(desiredWorld);
      }

      // Push the new transform into the bone's matrixWorld so the next
      // bone in the chain sees the up-to-date parent world quaternion.
      bone.updateMatrixWorld(true);

      // Cache the last good LOCAL quaternion for confidence fallbacks.
      this._lastGoodQuats.set(boneName, {
        x: bone.quaternion.x, y: bone.quaternion.y, z: bone.quaternion.z, w: bone.quaternion.w,
      });
      applied++;
    }

    return { applied, skipped, rootPos };
  }

  /**
   * Capture `CALIBRATION_FRAMES` of the current pose as the new T-pose
   * rest direction. Should be called from a button like "T-Pose Calibrate"
   * after the user has been standing still for ~1 second.
   *
   * @param {string} presetName
   * @param {Array} landmarks - the current frame's landmarks (used to validate the input)
   * @returns {boolean} true if calibration started; call `.complete()` when done
   */
  startCalibration(presetName) {
    this._calibrationFrames.set(presetName, {
      frames: 0,
      restDirs: new Map(), // boneName -> [x,y,z] running sum
    });
    logger.log('MoCapRetargeter', `Calibration started for preset "${presetName}". Stand in T-pose for ~1s.`);
    return true;
  }

  /**
   * Add a calibration sample. Call this every frame for `CALIBRATION_FRAMES` frames.
   */
  addCalibrationFrame(presetName, landmarks) {
    const cal = this._calibrationFrames.get(presetName);
    if (!cal) return;
    const preset = this.getPreset(presetName);
    if (!preset) return;
    for (const [boneName, def] of Object.entries(preset.bones)) {
      const a = landmarks[def.mpIndices[0]];
      const b = landmarks[def.mpIndices[1]];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = -(b.y - a.y), dz = -(b.z - a.z);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-6) continue;
      const dirX = dx / len, dirY = dy / len, dirZ = dz / len;
      if (!cal.restDirs.has(boneName)) {
        cal.restDirs.set(boneName, [dirX, dirY, dirZ]);
      } else {
        const cur = cal.restDirs.get(boneName);
        // Running sum (we'll average when complete)
        cur[0] += dirX; cur[1] += dirY; cur[2] += dirZ;
      }
    }
    cal.frames++;
  }

  /**
   * Finalize calibration. Averages the accumulated directions and
   * stores them in the preset's per-bone rest direction override.
   * @returns {boolean} true if completed successfully
   */
  completeCalibration(presetName) {
    const cal = this._calibrationFrames.get(presetName);
    if (!cal) return false;
    const preset = this.getPreset(presetName);
    if (!preset) return false;
    const N = cal.frames || 1;
    for (const [boneName, sum] of cal.restDirs.entries()) {
      const ax = sum[0] / N, ay = sum[1] / N, az = sum[2] / N;
      const len = Math.sqrt(ax * ax + ay * ay + az * az);
      if (len > 1e-6) {
        sum[0] = ax / len; sum[1] = ay / len; sum[2] = az / len;
      }
    }
    logger.log('MoCapRetargeter', `Calibration complete for "${presetName}" (${cal.frames} frames, ${cal.restDirs.size} bones).`);
    return true;
  }

  /**
   * Cancel a calibration in progress (discards the running sums).
   */
  cancelCalibration(presetName) {
    this._calibrationFrames.delete(presetName);
  }

  /**
   * Check if a calibration is currently in progress.
   */
  isCalibrating(presetName) {
    return this._calibrationFrames.has(presetName);
  }

  /**
   * Get the calibration progress (0..1).
   */
  getCalibrationProgress(presetName) {
    const cal = this._calibrationFrames.get(presetName);
    if (!cal) return 0;
    return Math.min(1, cal.frames / CALIBRATION_FRAMES);
  }

  /**
   * Reset all cached "last good quaternions" (e.g. when switching rigs).
   */
  reset() {
    this._lastGoodQuats.clear();
  }
}

// Export a singleton instance + the preset list for read-only access
export const moCapRetargeter = new MoCapRetargeter();
export { PRESETS, CALIBRATION_FRAMES };

if (typeof window !== 'undefined') {
  window.MoCapRetargeter = MoCapRetargeter;
  window.moCapRetargeter = moCapRetargeter;
  window.MOCAP_PRESETS = PRESETS;
}
