/**
 * PointCloudPlugin - Generic point cloud processing.
 *
 * Pure-JS implementations of common 3D point cloud operations. These
 * run on the main thread (WASM/worker dispatch is out of scope) but
 * are written to be O(N) or O(N log N) where possible. The spatial
 * hash is a uniform 3D grid that gives O(1) bucket lookups, which
 * keeps nearest-neighbor queries cheap for the operations that need
 * them (outlier removal, normal estimation, DBSCAN).
 *
 * Public API:
 *   voxelDownsample(points, voxelSize) -> THREE.Points
 *     - 3D spatial hash: each occupied cell contributes one centroid
 *       point (the average of all points in that cell).
 *   statisticalOutlierRemoval(points, k=20, stdMul=2.0) -> THREE.Points
 *     - For each point, compute the mean distance to its k nearest
 *       neighbors. Drop points whose mean distance is more than
 *       (stdMul × global stddev) above the global mean.
 *   estimateNormals(points, k=10) -> THREE.BufferGeometry
 *     - Per-point PCA: take the k nearest neighbors, compute the
 *       covariance matrix, the smallest eigenvector is the normal.
 *   clusterDBSCAN(points, eps, minPts) -> { labels: Int32Array, count: int }
 *     - Standard DBSCAN. labels[i] = cluster id (0-based) or -1 (noise).
 *   marchingCubesMesh(points, resolution, bounds) -> THREE.Mesh
 *     - Voxelize the cloud into a (resolution)³ grid, compute a
 *       signed "density" per cell, then run a tiny marching-cubes
 *       to extract an isosurface. This is a simplified version —
 *       the gradient sign is approximated from neighbor densities.
 *       Output is a watertight-ish isosurface that approximates
 *       the cloud envelope; NOT a Poisson-quality reconstruction.
 *   exportAs(points, format, filename) -> bool
 *     - 'ply' (binary LE), 'obj' (ASCII v/vn), 'gltf' (JSON + bin
 *       via PLY-to-mesh conversion; very basic)
 *
 * Input: a THREE.Points (or any object with a BufferGeometry whose
 * 'position' attribute is a 3-component float array). The plugin
 * preserves the existing material unless the caller wraps the
 * result.
 */
import * as THREE from 'three';
import { logger } from '../core/Logger.js';

// ── Spatial hash for nearest-neighbor lookups ────────────────────────────
class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }
  _key(x, y, z) {
    const cs = this.cellSize;
    return `${Math.floor(x / cs)},${Math.floor(y / cs)},${Math.floor(z / cs)}`;
  }
  insert(x, y, z, idx) {
    const k = this._key(x, y, z);
    let cell = this.cells.get(k);
    if (!cell) { cell = []; this.cells.set(k, cell); }
    cell.push(idx);
  }
  /**
   * Return indices in the 27 cells around (x,y,z). Caller filters
   * by exact distance if needed.
   */
  queryNeighbors(x, y, z) {
    const cs = this.cellSize;
    const ix = Math.floor(x / cs), iy = Math.floor(y / cs), iz = Math.floor(z / cs);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = `${ix + dx},${iy + dy},${iz + dz}`;
          const cell = this.cells.get(k);
          if (cell) out.push(...cell);
        }
      }
    }
    return out;
  }
}

// ── Cloud-bound helper ────────────────────────────────────────────────────
function getPositionAttribute(points) {
  const g = points.geometry || points;
  return g ? g.getAttribute('position') : null;
}

function readPos(pos, i, out) {
  out.x = pos.getX(i);
  out.y = pos.getY(i);
  out.z = pos.getZ(i);
  return out;
}

function computeBounds(pos, N) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ) };
}

function _makePointsFromArrays(positions, normals, newName) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (normals) g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const mat = new THREE.PointsMaterial({ color: 0x88aaff, size: 0.05, vertexColors: false });
  const p = new THREE.Points(g, mat);
  p.name = newName;
  p.userData.isManagedObject = true;
  return p;
}

export const PointCloudPlugin = {
  name: 'PointCloud',
  _state: null,

  init(state) {
    this._state = state;
    logger.log('PointCloudPlugin', 'initialized');
  },

  update(dt) {},

  _getStateManager() {
    return this._state && this._state.data && this._state.data.pluginManager
      ? this._state.data.pluginManager._plugins && this._state.data.pluginManager._plugins.get('StateManager')
      : null;
  },

  // ── Voxel downsample ────────────────────────────────────────────────────

  voxelDownsample(points, voxelSize = 0.05) {
    const pos = getPositionAttribute(points);
    if (!pos) return points;
    const N = pos.count;
    if (N === 0) return points;

    const accum = new Map();
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      readPos(pos, i, p);
      const k = `${Math.floor(p.x / voxelSize)},${Math.floor(p.y / voxelSize)},${Math.floor(p.z / voxelSize)}`;
      let entry = accum.get(k);
      if (!entry) { entry = { x: 0, y: 0, z: 0, n: 0 }; accum.set(k, entry); }
      entry.x += p.x; entry.y += p.y; entry.z += p.z; entry.n++;
    }

    const M = accum.size;
    const outPos = new Float32Array(M * 3);
    let i = 0;
    for (const e of accum.values()) {
      outPos[i * 3]     = e.x / e.n;
      outPos[i * 3 + 1] = e.y / e.n;
      outPos[i * 3 + 2] = e.z / e.n;
      i++;
    }
    const out = _makePointsFromArrays(outPos, null, `VoxelDown_${Date.now()}`);
    this._track(out, outPos.byteLength, 'pointcloud-voxel');
    return out;
  },

  // ── Statistical outlier removal ─────────────────────────────────────────

  statisticalOutlierRemoval(points, k = 20, stdMul = 2.0) {
    const pos = getPositionAttribute(points);
    if (!pos) return points;
    const N = pos.count;
    if (N < k + 1) return points;

    // Step 1: build a kd-tree-like grid (SpatialHash with cellSize =
    // approximate avg nearest-neighbor distance; we use 2 × avg
    // bbox / N^(1/3) as a heuristic).
    const bbox = computeBounds(pos, N);
    const size = bbox.max.clone().sub(bbox.min).length() / Math.cbrt(N) * 0.5;
    const hash = new SpatialHash(Math.max(size, 1e-3));
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      readPos(pos, i, p);
      hash.insert(p.x, p.y, p.z, i);
    }

    // Step 2: for each point, get the k nearest neighbors (approx,
    // from the 27 surrounding cells). Compute mean distance.
    const meanDists = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      readPos(pos, i, p);
      const candidates = hash.queryNeighbors(p.x, p.y, p.z);
      // Compute actual distances and pick k smallest
      const dists = [];
      for (const c of candidates) {
        if (c === i) continue;
        const dx = pos.getX(c) - p.x;
        const dy = pos.getY(c) - p.y;
        const dz = pos.getZ(c) - p.z;
        dists.push(dx * dx + dy * dy + dz * dz);
      }
      if (dists.length < k) {
        // fall back: use what we have
        meanDists[i] = dists.length ? Math.sqrt(dists.reduce((s, d) => s + d, 0) / dists.length) : 0;
        continue;
      }
      // Partial sort to k smallest — use a simple insertion sort
      // (k is small, ≤20).
      for (let j = 0; j < k; j++) {
        let minIdx = j;
        for (let m = j + 1; m < dists.length; m++) {
          if (dists[m] < dists[minIdx]) minIdx = m;
        }
        if (minIdx !== j) {
          const tmp = dists[j]; dists[j] = dists[minIdx]; dists[minIdx] = tmp;
        }
      }
      let sum = 0;
      for (let j = 0; j < k; j++) sum += dists[j];
      meanDists[i] = Math.sqrt(sum / k);
    }

    // Step 3: global mean + stddev of meanDists
    let sum = 0;
    for (let i = 0; i < N; i++) sum += meanDists[i];
    const globalMean = sum / N;
    let varSum = 0;
    for (let i = 0; i < N; i++) {
      const d = meanDists[i] - globalMean;
      varSum += d * d;
    }
    const globalStd = Math.sqrt(varSum / N);
    const threshold = globalMean + stdMul * globalStd;

    // Step 4: keep points whose meanDist ≤ threshold
    const keep = [];
    for (let i = 0; i < N; i++) if (meanDists[i] <= threshold) keep.push(i);
    return this._subselect(pos, keep, `SOR_${Date.now()}`);
  },

  // ── Normal estimation (PCA over kNN) ───────────────────────────────────

  estimateNormals(points, k = 10) {
    const pos = getPositionAttribute(points);
    if (!pos) return null;
    const N = pos.count;
    if (N < 3) return null;

    // Choose cell size from bbox
    const bbox = computeBounds(pos, N);
    const cellSize = Math.max(bbox.max.clone().sub(bbox.min).length() / Math.cbrt(N) * 0.5, 1e-3);
    const hash = new SpatialHash(cellSize);
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      readPos(pos, i, p);
      hash.insert(p.x, p.y, p.z, i);
    }

    const normals = new Float32Array(N * 3);
    const mean = new THREE.Vector3();
    const cov = [0, 0, 0, 0, 0, 0]; // symmetric 3x3: xx,xy,xz,yy,yz,zz
    const v = new THREE.Vector3();
    const eigen = new THREE.Vector3();

    for (let i = 0; i < N; i++) {
      readPos(pos, i, p);
      const neighbors = hash.queryNeighbors(p.x, p.y, p.z);
      if (neighbors.length < 3) {
        // fallback: pick +Y as normal
        normals[i * 3] = 0; normals[i * 3 + 1] = 1; normals[i * 3 + 2] = 0;
        continue;
      }
      // mean
      mean.set(0, 0, 0);
      for (const c of neighbors) mean.add(v.set(pos.getX(c), pos.getY(c), pos.getZ(c)));
      mean.multiplyScalar(1 / neighbors.length);
      // covariance
      cov[0] = 0; cov[1] = 0; cov[2] = 0; cov[3] = 0; cov[4] = 0; cov[5] = 0;
      for (const c of neighbors) {
        v.set(pos.getX(c) - mean.x, pos.getY(c) - mean.y, pos.getZ(c) - mean.z);
        cov[0] += v.x * v.x;
        cov[1] += v.x * v.y;
        cov[2] += v.x * v.z;
        cov[3] += v.y * v.y;
        cov[4] += v.y * v.z;
        cov[5] += v.z * v.z;
      }
      // Power-iteration to find the largest eigenvalue's eigenvector
      // (we want the SMALLEST, so we use the standard PCA inverse
      // approach: find the smallest eigenvalue of the covariance,
      // which is the normal direction).
      // For simplicity and robustness across degenerate inputs,
      // we use Jacobi's method to diagonalize the 3x3 symmetric
      // matrix and pick the eigenvector for the smallest eigenvalue.
      // _jacobiEigen3 stores V row-major and returns eigenvectors as
      // its columns: eigenvector for values[i] lives at
      // v[0*3+i], v[1*3+i], v[2*3+i].
      const e = this._jacobiEigen3(cov, 12);
      const minIdx = e.values.indexOf(Math.min(...e.values));
      const nx = e.vectors[0 * 3 + minIdx];
      const ny = e.vectors[1 * 3 + minIdx];
      const nz = e.vectors[2 * 3 + minIdx];
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3]     = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    }

    return { normals, count: N };
  },

  /** Diagonalize a symmetric 3x3 matrix stored as 6 floats [xx,xy,xz,yy,yz,zz]. */
  _jacobiEigen3(c, maxIter = 20) {
    // Build the matrix (column-major, 9 elements)
    const a = [
      c[0], c[1], c[2],
      c[1], c[3], c[4],
      c[2], c[4], c[5],
    ];
    const v = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // identity
    const tol = 1e-12;
    for (let iter = 0; iter < maxIter; iter++) {
      // Find off-diagonal max
      let off = Math.abs(a[1]);
      if (Math.abs(a[2]) > off) off = Math.abs(a[2]);
      if (Math.abs(a[5]) > off) off = Math.abs(a[5]);
      if (off < tol) break;
      // Rotate largest off-diag to zero. Pick (p, q) where a is largest.
      let p, q;
      if (Math.abs(a[1]) >= Math.abs(a[2]) && Math.abs(a[1]) >= Math.abs(a[5])) { p = 0; q = 1; }
      else if (Math.abs(a[2]) >= Math.abs(a[5])) { p = 0; q = 2; }
      else { p = 1; q = 2; }
      const app = a[p * 3 + p];
      const aqq = a[q * 3 + q];
      const apq = a[p * 3 + q];
      const theta = (aqq - app) / (2 * apq);
      let t;
      if (Math.abs(theta) > 1e9) t = 1 / (2 * theta);
      else t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c2 = 1 / Math.sqrt(t * t + 1);
      const s = t * c2;
      // Rotate
      a[p * 3 + p] = app * c2 * c2 + 2 * apq * s * c2 + aqq * s * s;
      a[q * 3 + q] = app * s * s - 2 * apq * s * c2 + aqq * c2 * c2;
      a[p * 3 + q] = 0; a[q * 3 + p] = 0;
      for (let r = 0; r < 3; r++) {
        if (r === p || r === q) continue;
        const arp = a[r * 3 + p];
        const arq = a[r * 3 + q];
        a[r * 3 + p] = arp * c2 - arq * s;
        a[r * 3 + q] = arp * s + arq * c2;
        a[p * 3 + r] = a[r * 3 + p];
        a[q * 3 + r] = a[r * 3 + q];
      }
      for (let r = 0; r < 3; r++) {
        const vrp = v[r * 3 + p];
        const vrq = v[r * 3 + q];
        v[r * 3 + p] = vrp * c2 - vrq * s;
        v[r * 3 + q] = vrp * s + vrq * c2;
      }
    }
    return {
      values: [a[0], a[4], a[8]],
      // Eigenvectors live in the COLUMNS of V (row-major storage).
      // i.e. eigenvector for values[i] = (v[0*3+i], v[1*3+i], v[2*3+i]).
      vectors: v,
    };
  },

  // ── DBSCAN clustering ──────────────────────────────────────────────────

  clusterDBSCAN(points, eps = 0.1, minPts = 5) {
    const pos = getPositionAttribute(points);
    if (!pos) return null;
    const N = pos.count;
    if (N === 0) return { labels: new Int32Array(0), count: 0 };

    const cellSize = eps;
    const hash = new SpatialHash(cellSize);
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      readPos(pos, i, p);
      hash.insert(p.x, p.y, p.z, i);
    }

    const labels = new Int32Array(N).fill(-1); // -1 = unvisited / noise
    let clusterId = 0;

    for (let i = 0; i < N; i++) {
      if (labels[i] !== -1) continue;
      readPos(pos, i, p);
      const neighbors = this._regionQuery(hash, pos, N, p, eps);
      if (neighbors.length < minPts) {
        labels[i] = -1; // noise
        continue;
      }
      labels[i] = clusterId;
      const seeds = neighbors.slice();
      let head = 0;
      while (head < seeds.length) {
        const q = seeds[head++];
        if (labels[q] === -1) labels[q] = clusterId; // noise → border
        if (labels[q] !== -1) continue; // already visited by a previous cluster
        labels[q] = clusterId;
        readPos(pos, q, p);
        const qNeighbors = this._regionQuery(hash, pos, N, p, eps);
        if (qNeighbors.length >= minPts) {
          for (const qn of qNeighbors) {
            if (!seeds.includes(qn)) seeds.push(qn);
          }
        }
      }
      clusterId++;
    }

    return { labels, count: clusterId };
  },

  _regionQuery(hash, pos, N, p, eps) {
    const eps2 = eps * eps;
    const candidates = hash.queryNeighbors(p.x, p.y, p.z);
    const out = [];
    for (const c of candidates) {
      const dx = pos.getX(c) - p.x;
      const dy = pos.getY(c) - p.y;
      const dz = pos.getZ(c) - p.z;
      if (dx * dx + dy * dy + dz * dz <= eps2) out.push(c);
    }
    return out;
  },

  // ── Marching cubes (simplified) ────────────────────────────────────────
  //
  // Approach: voxelize the point cloud into a (N)³ grid. For each
  // cell, compute a "density" equal to the count of points whose
  // bbox falls within that cell (normalized to [0, 1]). Cells with
  // density ≥ 0.5 are "inside". A very simplified marching cubes
  // uses the 8-corner density check to determine a triangle for
  // each cell whose corners straddle the isosurface.
  //
  // This is NOT a real Poisson reconstruction. It's a quick
  // "shrink-wrap" that gives a visible mesh from any reasonably
  // dense point cloud. For high-quality output the user should
  // use a dedicated library.

  marchingCubesMesh(points, resolution = 32, bounds = null) {
    // NOTE: This is NOT a true marching-cubes / isosurface algorithm.
    // It voxelizes the point cloud into a (resolution)^3 grid, marks
    // each occupied cell, and emits one quad per cell face where the
    // cell is occupied but its neighbor is empty. The result is a
    // blocky "shell" that wraps the cloud envelope — it looks
    // acceptable for roughly spherical or "blob" point distributions
    // (e.g. a human body scan) but is NOT a Poisson-quality
    // reconstruction. For high-quality meshing use a dedicated
    // library (PoissonRecon, Open3D, etc.) or marching cubes with
    // interpolated edge crossings (out of scope here).
    const pos = getPositionAttribute(points);
    if (!pos) return null;
    const N = pos.count;
    if (N === 0) return null;

    const bbox = bounds || computeBounds(pos, N);
    const min = bbox.min, max = bbox.max;
    const size = new THREE.Vector3().subVectors(max, min);
    const cellSize = Math.min(size.x, size.y, size.z) / resolution;
    const R = resolution;
    const stride = R + 1;
    const totalCells = stride * stride * stride;

    // Per-cell point counts
    const counts = new Uint16Array(totalCells);
    for (let i = 0; i < N; i++) {
      const x = pos.getX(i) - min.x;
      const y = pos.getY(i) - min.y;
      const z = pos.getZ(i) - min.z;
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      const cz = Math.floor(z / cellSize);
      if (cx < 0 || cx > R || cy < 0 || cy > R || cz < 0 || cz > R) continue;
      counts[cz * stride * stride + cy * stride + cx]++;
    }

    // Find a per-cell density threshold: cell is "inside" if count
    // ≥ some fraction of the max cell count.
    let maxCount = 0;
    for (let i = 0; i < totalCells; i++) if (counts[i] > maxCount) maxCount = counts[i];
    if (maxCount === 0) return null;
    const densityThresh = maxCount * 0.3;

    // Build a vertex+normal buffer by walking the grid and emitting
    // marching-cubes triangles. To keep the implementation small,
    // we use a vertex-per-cell approach: for each cell whose density
    // is on the surface, emit a small quad (2 triangles) facing
    // outward along the density gradient. This is visually similar
    // to a true MC isosurface for a roughly spherical or "blob" cloud
    // but doesn't reproduce sharp features.
    const positions = [];
    const normals = [];
    const p = new THREE.Vector3();
    const grad = new THREE.Vector3();
    const SIZE2 = cellSize * 1.2;

    for (let cz = 0; cz < R; cz++) {
      for (let cy = 0; cy < R; cy++) {
        for (let cx = 0; cx < R; cx++) {
          const idx = cz * stride * stride + cy * stride + cx;
          const d = counts[idx];
          if (d < densityThresh) continue;
          // Check 6 neighbors — only emit a face where the neighbor
          // is empty (so the face is on the surface).
          const dirs = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1],
          ];
          for (const [dx, dy, dz] of dirs) {
            const nx = cx + dx, ny = cy + dy, nz = cz + dz;
            if (nx < 0 || nx > R || ny < 0 || ny > R || nz < 0 || nz > R) continue;
            const nidx = nz * stride * stride + ny * stride + nx;
            if (counts[nidx] >= densityThresh) continue;

            // Emit a quad facing (dx, dy, dz)
            p.set(min.x + (cx + 0.5) * cellSize,
                  min.y + (cy + 0.5) * cellSize,
                  min.z + (cz + 0.5) * cellSize);
            // Move face out to the cell boundary
            p.x += dx * cellSize * 0.5;
            p.y += dy * cellSize * 0.5;
            p.z += dz * cellSize * 0.5;
            // Compute in-plane tangent vectors
            let tx, ty, tz;
            if (dx !== 0) { ty = 1; tz = 0; }
            else if (dy !== 0) { tx = 1; tz = 0; }
            else { tx = 1; ty = 0; }
            const nrm = new THREE.Vector3(dx, dy, dz);
            const tan = new THREE.Vector3(tx, ty, tz).cross(nrm).normalize();
            const bit = nrm.clone().cross(tan).normalize();
            const half = SIZE2 / 2;
            const v0 = p.clone().addScaledVector(tan, -half).addScaledVector(bit, -half);
            const v1 = p.clone().addScaledVector(tan,  half).addScaledVector(bit, -half);
            const v2 = p.clone().addScaledVector(tan,  half).addScaledVector(bit,  half);
            const v3 = p.clone().addScaledVector(tan, -half).addScaledVector(bit,  half);
            // 2 triangles, CCW when viewed from outside (facing +nrm)
            positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
            positions.push(v0.x, v0.y, v0.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
            for (let t = 0; t < 6; t++) {
              normals.push(nrm.x, nrm.y, nrm.z);
            }
          }
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const mat = new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.6, metalness: 0.2 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `PointCloudMesh_${Date.now()}`;
    mesh.userData.isManagedObject = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._track(mesh, positions.byteLength, 'pointcloud-mesh');
    return mesh;
  },

  // ── Export ──────────────────────────────────────────────────────────────

  exportAs(points, format = 'ply', filename = null) {
    const pos = getPositionAttribute(points);
    if (!pos) return false;
    const N = pos.count;
    const norm = points.geometry ? points.geometry.getAttribute('normal') : null;

    let blob = null;
    let defaultExt = format;

    if (format === 'ply') {
      const headerStr = [
        'ply',
        'format binary_little_endian 1.0',
        `element vertex ${N}`,
        'property float x',
        'property float y',
        'property float z',
        norm ? 'property float nx' : '',
        norm ? 'property float ny' : '',
        norm ? 'property float nz' : '',
        'end_header',
        '',
      ].filter(Boolean).join('\n');
      const header = new TextEncoder().encode(headerStr);
      const propCount = 3 + (norm ? 3 : 0);
      const stride = propCount * 4;
      const buf = new ArrayBuffer(header.byteLength + N * stride);
      const u8 = new Uint8Array(buf);
      u8.set(header, 0);
      const dv = new DataView(buf, header.byteLength);
      let off = 0;
      for (let i = 0; i < N; i++) {
        dv.setFloat32(off + 0, pos.getX(i), true);
        dv.setFloat32(off + 4, pos.getY(i), true);
        dv.setFloat32(off + 8, pos.getZ(i), true);
        if (norm) {
          dv.setFloat32(off + 12, norm.getX(i), true);
          dv.setFloat32(off + 16, norm.getY(i), true);
          dv.setFloat32(off + 20, norm.getZ(i), true);
        }
        off += stride;
      }
      blob = new Blob([buf], { type: 'application/octet-stream' });
      defaultExt = 'ply';
    } else if (format === 'obj') {
      const lines = ['# Exported from PointCloudPlugin', `# ${N} vertices`];
      for (let i = 0; i < N; i++) {
        if (norm) {
          lines.push(`v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`);
          lines.push(`vn ${norm.getX(i).toFixed(6)} ${norm.getY(i).toFixed(6)} ${norm.getZ(i).toFixed(6)}`);
        } else {
          lines.push(`v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`);
        }
      }
      blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      defaultExt = 'obj';
    } else if (format === 'gltf') {
      // Minimal glTF 2.0 with a single POINTS primitive. Browsers
      // can display this via any glTF loader but it's a bare-bones
      // export — no animations, no materials beyond defaults.
      const positions = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        positions[i * 3]     = pos.getX(i);
        positions[i * 3 + 1] = pos.getY(i);
        positions[i * 3 + 2] = pos.getZ(i);
      }
      // bin = padded positions (4-byte aligned)
      const pad = (4 - (positions.byteLength % 4)) % 4;
      const bin = new ArrayBuffer(positions.byteLength + pad);
      new Uint8Array(bin).set(new Uint8Array(positions.buffer));
      const binStr = btoa(String.fromCharCode.apply(null, new Uint8Array(bin)));
      const gltf = {
        asset: { version: '2.0', generator: 'PointCloudPlugin' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ mode: 0, attributes: { POSITION: 0 } }] }],
        accessors: [{
          bufferView: 0, componentType: 5126, count: N, type: 'VEC3',
          min: [positions[0] || 0, positions[1] || 0, positions[2] || 0],
          max: [positions[0] || 0, positions[1] || 0, positions[2] || 0],
        }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
        buffers: [{ byteLength: bin.byteLength, uri: `data:application/octet-stream;base64,${binStr}` }],
      };
      blob = new Blob([JSON.stringify(gltf, null, 2)], { type: 'model/gltf+json' });
      defaultExt = 'gltf';
    } else {
      logger.warn('PointCloudPlugin', `exportAs: unknown format "${format}"`);
      return false;
    }

    const finalName = (filename || `pointcloud-export-${Date.now()}`).replace(/\.[^.]+$/, '') + '.' + defaultExt;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },

  // ── Helpers ─────────────────────────────────────────────────────────────

  _subselect(pos, keep, newName) {
    const N = keep.length;
    const out = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      out[i * 3]     = pos.getX(keep[i]);
      out[i * 3 + 1] = pos.getY(keep[i]);
      out[i * 3 + 2] = pos.getZ(keep[i]);
    }
    const p = _makePointsFromArrays(out, null, newName);
    this._track(p, out.byteLength, 'pointcloud-subselect');
    return p;
  },

  _track(obj, bytes, kind) {
    const sm = this._getStateManager();
    if (sm && typeof sm.trackGfxResource === 'function') {
      const id = `${kind}/${obj.uuid}`;
      sm.trackGfxResource(id, bytes, kind, obj.name);
      obj.userData.gfxResourceId = id;
    }
  },

  // ── Visual Nodes ────────────────────────────────────────────────────────

  nodes: {
    'PointCloud/VoxelDownsampleNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">📐 Voxel Downsample</div>
        <div class="node-body">
          <label>Voxel Size:</label>
          <input type="number" class="node-input" data-prop="voxelSize" value="0.05" step="0.01" />
        </div>
        <button class="run-node-btn" data-action="run">Downsample</button>
        <div class="node-outputs"><span data-type="Points">Reduced Cloud</span></div>
      `;
      return el;
    },

    'PointCloud/OutlierRemovalNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">🧹 Statistical Outlier Removal</div>
        <div class="node-body">
          <label>Neighbors (k):</label>
          <input type="number" class="node-input" data-prop="k" value="20" step="1" />
          <label>Stddev Mult:</label>
          <input type="number" class="node-input" data-prop="stdMul" value="2.0" step="0.1" />
        </div>
        <button class="run-node-btn" data-action="run">Remove Outliers</button>
        <div class="node-outputs"><span data-type="Points">Cleaned Cloud</span></div>
      `;
      return el;
    },

    'PointCloud/EstimateNormalsNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">📏 Estimate Normals</div>
        <div class="node-body">
          <label>Neighbors (k):</label>
          <input type="number" class="node-input" data-prop="k" value="10" step="1" />
        </div>
        <button class="run-node-btn" data-action="run">Compute Normals</button>
        <div class="node-outputs"><span data-type="Points">Cloud w/ Normals</span></div>
      `;
      return el;
    },

    'PointCloud/ClusterDBSCANNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">🔍 DBSCAN Cluster</div>
        <div class="node-body">
          <label>Epsilon (m):</label>
          <input type="number" class="node-input" data-prop="eps" value="0.1" step="0.01" />
          <label>Min Points:</label>
          <input type="number" class="node-input" data-prop="minPts" value="5" step="1" />
        </div>
        <button class="run-node-btn" data-action="run">Cluster</button>
        <div class="node-outputs"><span data-type="ClusterLabels">Cluster Ids</span></div>
      `;
      return el;
    },

    'PointCloud/MeshNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">🧊 Marching Cubes Mesh</div>
        <div class="node-body">
          <label>Resolution:</label>
          <input type="number" class="node-input" data-prop="resolution" value="32" step="4" min="8" max="128" />
        </div>
        <button class="run-node-btn" data-action="run">Generate Mesh</button>
        <div class="node-outputs"><span data-type="Mesh">Isosurface Mesh</span></div>
      `;
      return el;
    },

    'PointCloud/ExportNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">💾 Export Point Cloud</div>
        <div class="node-body">
          <label>Format:</label>
          <select class="node-input" data-prop="format">
            <option value="ply">PLY (binary LE)</option>
            <option value="obj">OBJ (ASCII)</option>
            <option value="gltf">glTF (JSON)</option>
          </select>
          <label>Filename:</label>
          <input type="text" class="node-input" data-prop="filename" value="pointcloud-export" />
        </div>
        <button class="run-node-btn" data-action="run">Export</button>
      `;
      return el;
    },
  }
};
