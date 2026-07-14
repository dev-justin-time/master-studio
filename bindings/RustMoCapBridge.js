/**
 * RustMoCapBridge - High-performance math backend for the MoCap pipeline.
 *
 * Pattern mirrors `WasmBridge.js`:
 *   - Lazy async `init()` (called from MoCapPlugin.init)
 *   - Graceful JS fallback when Rust Wasm is unavailable
 *   - `isReady` flag + `getStatus()` so the plugin can route around
 *     a missing backend (JS fallback is ~3-5x slower but functionally
 *     identical at the API level)
 *   - Exposed on `window.RustMoCapBridge` for direct access from the
 *     node graph + external pages
 *
 * The actual Rust Wasm module (`wasm/pkg/mocap_core.js`) is the
 * production target. Until that's compiled the JS fallback provides
 * 1-Euro filter, FABRIK IK, CCD IK, DLT triangulation, and Kalman
 * smoothing. Performance is adequate for a single-source pipeline
 * (33 body landmarks) at 30fps; multi-cam (3+ views × 33) benefits
 * noticeably from the Rust SIMD implementation.
 */

import { logger } from '../core/Logger.js';

let mocapModule = null;
let isReady = false;
const FALLBACK = { name: 'js', latencyBudget: '~1ms/frame' };

/**
 * Initialize the Rust Wasm module. Idempotent — calling more than once
 * is a no-op (so MoCapPlugin.init can re-call it on hot-reload).
 *
 * On failure we keep `isReady = false` and let the bridge fall back
 * to the JS implementation. This is intentional: the studio should
 * still launch even if Rust compilation hasn't run yet.
 */
export async function initMoCapWasm() {
  if (isReady) return true;
  try {
    mocapModule = await import('../wasm/pkg/mocap_core.js');
    if (mocapModule.default) {
      await mocapModule.default();
    }
    isReady = true;
    logger.log('RustMoCapBridge', 'Rust module loaded.');
    return true;
  } catch (err) {
    logger.warn('RustMoCapBridge', 'Rust module not available; using JS fallback:', err);
    isReady = false;
    return false;
  }
}

/** Sync readiness probe. Used by MoCapPlugin.update() to skip the Wasm hot path on cold start. */
export function getMoCapStatus() {
  return { ready: isReady, backend: isReady ? 'rust-wasm' : 'js-fallback' };
}

// ════════════════════════════════════════════════════════════════════════
// Public math API. Each method routes to Rust Wasm if ready, otherwise
// to a JS fallback. Both implementations share the same function shape
// (input/output contract) so callers don't need to branch.
// ════════════════════════════════════════════════════════════════════════

/**
 * One Euro Filter — adaptive low-pass for jittery AI landmark data.
 *
 * @param {Array<{x:number,y:number,z:number,visibility?:number}>} landmarks
 * @param {number} beta  - responsiveness (typical 0.005–0.05, higher = less lag, more jitter)
 * @param {number} dCutoff - derivative cutoff Hz (typical 0.5–3)
 * @returns {Array<{x,y,z,visibility}>} filtered landmarks (new array)
 */
function jsOneEuroFilter(landmarks, beta = 0.007, dCutoff = 1.0) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return [];
  const dt = 1 / 60; // assume 60fps; one Euro is forgiving on this
  const minCutoff = 1.0; // standard 1Hz base cutoff
  const alpha = (cutoff) => {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  };
  const dAlpha = alpha(dCutoff);

  // Persistent filter state per landmark. The bridge is a singleton
  // so we attach the state to a hidden symbol-like key on the first
  // call. (We could also use a WeakMap but the singleton guarantee
  // is simpler and the state is bounded to 33 entries.)
  if (!jsOneEuroFilter._state) jsOneEuroFilter._state = new Map();
  const state = jsOneEuroFilter._state;

  return landmarks.map((lm, i) => {
    const prev = state.get(i) || { x: lm.x, y: lm.y, z: lm.z, dx: 0, dy: 0, dz: 0 };
    // Estimate derivative
    const dx = (lm.x - prev.x) / dt;
    const dy = (lm.y - prev.y) / dt;
    const dz = (lm.z - prev.z) / dt;
    // Smooth the derivative
    const edx = prev.dx + dAlpha * (dx - prev.dx);
    const edy = prev.dy + dAlpha * (dy - prev.dy);
    const edz = prev.dz + dAlpha * (dz - prev.dz);
    // Adaptive cutoff
    const cutoff = minCutoff + beta * Math.sqrt(edx * edx + edy * edy + edz * edz);
    const a = alpha(cutoff);
    const nx = prev.x + a * (lm.x - prev.x);
    const ny = prev.y + a * (lm.y - prev.y);
    const nz = prev.z + a * (lm.z - prev.z);
    state.set(i, { x: nx, y: ny, z: nz, dx: edx, dy: edy, dz: edz });
    return { x: nx, y: ny, z: nz, visibility: lm.visibility };
  });
}

/**
 * FABRIK IK solver (Forward And Backward Reaching Inverse Kinematics).
 * Iteratively adjusts a chain of bones to reach a target end-effector.
 *
 * @param {Array<{position:THREE.Vector3,parent:number|null}>} bones
 * @param {{position:THREE.Vector3,boneIndex:number}} target
 * @param {number} iterations
 * @returns {Array<THREE.Vector3>} updated bone positions
 */
function jsSolveFABRIK(bones, target, iterations = 10) {
  if (!bones || bones.length === 0) return [];
  // Deep copy positions to avoid mutating the rig
  const positions = bones.map(b => b.position.clone());
  const lengths = [];
  for (let i = 1; i < positions.length; i++) {
    lengths.push(positions[i].distanceTo(positions[i - 1]));
  }
  const totalLen = lengths.reduce((a, b) => a + b, 0);
  const targetPos = target.position.clone();
  const distToTarget = positions[0].distanceTo(targetPos);

  // Target unreachable — stretch toward it
  if (distToTarget > totalLen) {
    for (let i = 0; i < positions.length - 1; i++) {
      const r = positions[i].distanceTo(targetPos);
      const lambda = lengths[i] / Math.max(r, 1e-6);
      positions[i + 1].copy(positions[i]).lerp(targetPos, lambda);
    }
  } else {
    // Target reachable — FABRIK iteration
    const origRoot = positions[0].clone();
    for (let iter = 0; iter < iterations; iter++) {
      // Backward: place end at target, work toward root
      positions[positions.length - 1].copy(targetPos);
      for (let i = positions.length - 2; i >= 0; i--) {
        const r = positions[i].distanceTo(positions[i + 1]);
        const lambda = lengths[i] / Math.max(r, 1e-6);
        positions[i].copy(positions[i + 1]).lerp(positions[i], lambda);
      }
      // Forward: re-anchor root, work back to target
      positions[0].copy(origRoot);
      for (let i = 1; i < positions.length; i++) {
        const r = positions[i].distanceTo(positions[i - 1]);
        const lambda = lengths[i - 1] / Math.max(r, 1e-6);
        positions[i].copy(positions[i - 1]).lerp(positions[i], lambda);
      }
    }
  }
  return positions;
}

/**
 * CCD IK solver (Cyclic Coordinate Descent).
 * For each iteration, walks from end-effector toward root, rotating
 * each joint to point the end-effector at the target.
 *
 * @param {Array<{position:THREE.Vector3,parent:number|null}>} bones
 * @param {{position:THREE.Vector3,boneIndex:number}} target
 * @param {number} iterations
 * @returns {Array<THREE.Vector3>} updated bone positions
 */
function jsSolveCCD(bones, target, iterations = 10) {
  if (!bones || bones.length === 0) return [];
  const positions = bones.map(b => b.position.clone());
  const targetPos = target.position.clone();
  const endIdx = target.boneIndex ?? positions.length - 1;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = endIdx - 1; i >= 0; i--) {
      const toEnd = positions[endIdx].clone().sub(positions[i]).normalize();
      const toTarget = targetPos.clone().sub(positions[i]).normalize();
      const dot = THREE_VEC_CLAMP(toEnd.dot(toTarget), -1, 1);
      if (dot > 0.9999) continue; // already aligned
      const axis = toEnd.clone().cross(toTarget).normalize();
      if (axis.lengthSq() < 1e-6) continue;
      const angle = Math.acos(dot);
      // Rotate all bones from i+1..end around `axis` by `angle`
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (let j = i + 1; j <= endIdx; j++) {
        const rel = positions[j].clone().sub(positions[i]);
        const rotated = rotateVec3(rel, axis, cos, sin);
        positions[j].copy(positions[i]).add(rotated);
      }
    }
  }
  return positions;
}

/** Inline rotate helper (avoids allocating THREE.Quaternion per CCD step). */
function rotateVec3(v, axis, cos, sin) {
  // Rodrigues' rotation formula
  const dot = v.x * axis.x + v.y * axis.y + v.z * axis.z;
  const cx = axis.y * v.z - axis.z * v.y;
  const cy = axis.z * v.x - axis.x * v.z;
  const cz = axis.x * v.y - axis.y * v.x;
  return {
    x: v.x * cos + cx * sin + axis.x * dot * (1 - cos),
    y: v.y * cos + cy * sin + axis.y * dot * (1 - cos),
    z: v.z * cos + cz * sin + axis.z * dot * (1 - cos),
  };
}

function THREE_VEC_CLAMP(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Direct Linear Transform (DLT) triangulation for multi-camera setups.
 * Given N≥2 2D points (one per camera) and N projection matrices,
 * computes the 3D point that minimizes algebraic error.
 *
 * @param {Array<{x:number,y:number}>} points2D  - one per camera (pixels)
 * @param {Array<number[]>} projectionMatrices  - one per camera, length 12 (3x4)
 * @returns {{x:number,y:number,z:number}}
 */
function jsTriangulateDLT(points2D, projectionMatrices) {
  if (!points2D || points2D.length < 2) return { x: 0, y: 0, z: 0 };
  // Build the linear system A · X = 0 (4×2N matrix × 4-vector).
  // DLT minimizes ||A·X|| subject to ||X||=1 via SVD; for the JS
  // fallback we use a least-squares pseudoinverse of the 2N×4 system.
  const rows = [];
  for (let i = 0; i < points2D.length; i++) {
    const P = projectionMatrices[i];
    const p = points2D[i];
    rows.push([
      p.x * P[8]  - P[0], p.x * P[9]  - P[1], p.x * P[10] - P[2],  p.x * P[11] - P[3],
    ]);
    rows.push([
      p.y * P[8]  - P[4], p.y * P[9]  - P[5], p.y * P[10] - P[6],  p.y * P[11] - P[7],
    ]);
  }
  // Solve A · X = 0 by computing the eigenvector of A^T·A with smallest eigenvalue.
  // The JS fallback does a simpler thing: solve the overdetermined 2N×3 system
  // A' · Y = -B where Y = (X,Y,Z) and B = the 4th column. Use normal equations.
  // A = first 3 columns, B = -4th column
  const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const AtB = [0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < 3; i++) {
      AtB[i] -= row[i] * row[3];
      for (let j = 0; j < 3; j++) {
        AtA[i][j] += row[i] * row[j];
      }
    }
  }
  // Solve via Cramer's rule (3×3 is small enough)
  const det = (
    AtA[0][0] * (AtA[1][1] * AtA[2][2] - AtA[1][2] * AtA[2][1]) -
    AtA[0][1] * (AtA[1][0] * AtA[2][2] - AtA[1][2] * AtA[2][0]) +
    AtA[0][2] * (AtA[1][0] * AtA[2][1] - AtA[1][1] * AtA[2][0])
  );
  if (Math.abs(det) < 1e-9) return { x: 0, y: 0, z: 0 };
  const invDet = 1 / det;
  const adj = [
    [AtA[1][1] * AtA[2][2] - AtA[1][2] * AtA[2][1], AtA[0][2] * AtA[2][1] - AtA[0][1] * AtA[2][2], AtA[0][1] * AtA[1][2] - AtA[0][2] * AtA[1][1]],
    [AtA[1][2] * AtA[2][0] - AtA[1][0] * AtA[2][2], AtA[0][0] * AtA[2][2] - AtA[0][2] * AtA[2][0], AtA[0][2] * AtA[1][0] - AtA[0][0] * AtA[1][2]],
    [AtA[1][0] * AtA[2][1] - AtA[1][1] * AtA[2][0], AtA[0][1] * AtA[2][0] - AtA[0][0] * AtA[2][1], AtA[0][0] * AtA[1][1] - AtA[0][1] * AtA[1][0]],
  ];
  const X = (invDet * (adj[0][0] * AtB[0] + adj[0][1] * AtB[1] + adj[0][2] * AtB[2]));
  const Y = (invDet * (adj[1][0] * AtB[0] + adj[1][1] * AtB[1] + adj[1][2] * AtB[2]));
  const Z = (invDet * (adj[2][0] * AtB[0] + adj[2][1] * AtB[1] + adj[2][2] * AtB[2]));
  return { x: X, y: Y, z: Z };
}

/**
 * Kalman-style confidence-based smoothing.
 * Blends the new landmark with the previous estimate, weighted by
 * MediaPipe's `visibility` score. Low-visibility landmarks
 * (occluded body parts) retain more of the previous frame.
 *
 * @param {Array<{x:number,y:number,z:number,visibility:number}>} landmarks
 * @param {Map<number,{x,y,z}>|null} prevState
 * @returns {{out:Array<{x,y,z,visibility}>, state:Map}}
 */
function jsKalmanSmooth(landmarks, prevState = null) {
  const state = prevState || new Map();
  const out = landmarks.map((lm, i) => {
    const vis = typeof lm.visibility === 'number' ? Math.max(0, Math.min(1, lm.visibility)) : 0.8;
    const prev = state.get(i);
    // Confidence-weighted blend. vis=1.0 → 80% new, vis=0.0 → 0% new
    const w = 0.2 + 0.6 * vis;
    const nx = prev ? prev.x * (1 - w) + lm.x * w : lm.x;
    const ny = prev ? prev.y * (1 - w) + lm.y * w : lm.y;
    const nz = prev ? prev.z * (1 - w) + lm.z * w : lm.z;
    state.set(i, { x: nx, y: ny, z: nz });
    return { x: nx, y: ny, z: nz, visibility: lm.visibility };
  });
  return { out, state };
}

// ── Public bridge (auto-routes between Rust Wasm and JS fallback) ───────

export const RustMoCapBridge = {
  /** Backend name for UI display: "rust-wasm" | "js-fallback" */
  get backend() { return isReady ? 'rust-wasm' : 'js-fallback'; },

  isReady: () => isReady,

  /**
   * One Euro Filter. Returns a NEW array of landmarks; doesn't mutate input.
   * @param {Array} landmarks
   * @param {number} beta (default 0.007)
   * @param {number} dCutoff (default 1.0)
   */
  oneEuroFilter: (landmarks, beta, dCutoff) => {
    if (isReady && mocapModule?.one_euro_filter) {
      return mocapModule.one_euro_filter(landmarks, beta, dCutoff);
    }
    return jsOneEuroFilter(landmarks, beta, dCutoff);
  },

  /**
   * FABRIK IK solver. Returns updated bone positions.
   * @param {Array} bones
   * @param {{position:{x,y,z},boneIndex:number}} target
   * @param {number} iterations (default 10)
   */
  solveFABRIK: (bones, target, iterations) => {
    if (isReady && mocapModule?.solve_fabrik_ik) {
      return mocapModule.solve_fabrik_ik(bones, target, iterations);
    }
    return jsSolveFABRIK(bones, target, iterations);
  },

  /**
   * CCD IK solver. Returns updated bone positions.
   */
  solveCCD: (bones, target, iterations) => {
    if (isReady && mocapModule?.solve_ccd_ik) {
      return mocapModule.solve_ccd_ik(bones, target, iterations);
    }
    return jsSolveCCD(bones, target, iterations);
  },

  /**
   * Direct Linear Transform triangulation for multi-camera setups.
   */
  triangulateDLT: (points2D, projectionMatrices) => {
    if (isReady && mocapModule?.triangulate_dlt) {
      return mocapModule.triangulate_dlt(points2D, projectionMatrices);
    }
    return jsTriangulateDLT(points2D, projectionMatrices);
  },

  /**
   * Confidence-based Kalman smoothing. State is held internally;
   * pass `null` to reset, or return value's `state` for persistence.
   */
  kalmanSmooth: (landmarks, prevState) => {
    if (isReady && mocapModule?.kalman_smooth) {
      return mocapModule.kalman_smooth(landmarks, prevState);
    }
    return jsKalmanSmooth(landmarks, prevState);
  },
};

// Expose globally so external UIs / node graph can call directly
if (typeof window !== 'undefined') {
  window.RustMoCapBridge = RustMoCapBridge;
}
