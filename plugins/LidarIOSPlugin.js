/**
 * LidarIOSPlugin - iOS ARKit .ply LiDAR scan processing.
 *
 * Parses binary little-endian PLY exports from iOS ARKit's
 * ARWorldTrackingConfiguration with sceneReconstruction = .mesh.
 * Each vertex carries: x, y, z, nx, ny, nz, confidence, classification.
 *
 * Public API:
 *   parseIOSPly(arrayBuffer, options) -> { points, group, faces }
 *     - Reads PLY header (ASCII), validates field set, then binary
 *       reads all vertex properties in one big pass.
 *     - Builds a THREE.Points + custom ShaderMaterial that maps
 *       per-vertex confidence (0-2) to a green→yellow→red gradient
 *       so the user can visually identify scan quality.
 *   filterByConfidence(cloud, minConfidence=2) -> THREE.Points
 *     - Drops vertices with confidence < minConfidence.
 *   extractGround(cloud) -> THREE.Points
 *     - Returns points whose classification field equals 1 (ground).
 *   extractWalls(cloud) -> THREE.Points
 *     - Returns points whose classification field equals 2.
 *   fitPlaneRANSAC(points, iterations=200, threshold=0.02) -> {normal, distance, inliers}
 *     - Fits a plane to the point cloud using RANSAC. Used to
 *       recover the dominant ground plane even when classification
 *       is unreliable.
 *   generateHeightmapMesh(points, gridSize=0.05) -> THREE.Mesh
 *     - 2.5D heightmap triangulation: bucket points into an XZ grid
 *       and produce a PlaneGeometry whose Y is the max height per cell.
 *       Cheaper than full Poisson / marching-cubes and gives a usable
 *       "floor" surface for architectural LiDAR.
 *   exportAs(cloud, format, filename) -> triggers download
 *     - format: 'ply' (binary LE) | 'obj' (ASCII)
 *
 * Confidence field (iOS ARKit):
 *   0 = low    → red
 *   1 = medium → yellow
 *   2 = high   → green
 *
 * Classification field (iOS ARKit, subset):
 *   0 = unclassified
 *   1 = ground / floor
 *   2 = wall / vertical surface
 *   3 = ceiling
 *   4 = table / horizontal furniture
 *   5 = seat
 *   6 = window
 *   7 = door
 */
import * as THREE from 'three';
import { logger } from '../core/Logger.js';

// Confidence → RGB gradient (low/medium/high → red/yellow/green).
// Three stops give a quick visual on scan quality.
const CONFIDENCE_COLORS = [
  new THREE.Color(0.95, 0.20, 0.20), // 0 — red
  new THREE.Color(0.95, 0.78, 0.10), // 1 — yellow
  new THREE.Color(0.20, 0.85, 0.30), // 2 — green
];

// ── Custom shader: per-vertex color from confidence ────────────────────────
const CONFIDENCE_VS = /* glsl */`
attribute float aConfidence;
varying vec3 vColor;
varying float vConfidence;

void main() {
  // Smoothstep between [0,1] and [1,2] to mix CONFIDENCE_COLORS
  float c = clamp(aConfidence / 2.0, 0.0, 1.0);
  vec3 col;
  if (c < 0.5) {
    col = mix(vec3(0.95, 0.20, 0.20), vec3(0.95, 0.78, 0.10), c * 2.0);
  } else {
    col = mix(vec3(0.95, 0.78, 0.10), vec3(0.20, 0.85, 0.30), (c - 0.5) * 2.0);
  }
  vColor = col;
  vConfidence = aConfidence;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = 2.0 * (300.0 / -mvPosition.z);
}
`;

const CONFIDENCE_FS = /* glsl */`
varying vec3 vColor;
varying float vConfidence;

void main() {
  if (vConfidence < 0.05) discard; // hide unclassified noise
  gl_FragColor = vec4(vColor, 1.0);
}
`;

// Shared single instance: one ShaderMaterial for ALL LiDAR clouds so
// filter / subselect / re-import does not multiply GPU programs.
const _SHARED_CONFIDENCE_MATERIAL = new THREE.ShaderMaterial({
  vertexShader: CONFIDENCE_VS,
  fragmentShader: CONFIDENCE_FS,
  transparent: false,
  depthTest: true,
});
// Back-compat alias used by the existing call sites.
const _confidenceMaterial = () => _SHARED_CONFIDENCE_MATERIAL;

export const LidarIOSPlugin = {
  name: 'LidarIOS',
  _state: null,

  init(state) {
    this._state = state;
    logger.log('LidarIOSPlugin', 'initialized');
  },

  update(deltaTime) {},

  _getStateManager() {
    return this._state && this._state.data && this._state.data.pluginManager
      ? this._state.data.pluginManager._plugins && this._state.data.pluginManager._plugins.get('StateManager')
      : null;
  },

  /**
   * Parse an iOS ARKit binary PLY file from an ArrayBuffer.
   * Returns { points, group, vertexCount } where:
   *   - points: THREE.Points with custom shader (confidence-colored)
   *   - group: THREE.Group containing the points (ready to add to scene)
   *   - vertexCount: number of vertices parsed
   */
  parseIOSPly(arrayBuffer, options = {}) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      logger.warn('LidarIOSPlugin', 'parseIOSPly: expected ArrayBuffer');
      return null;
    }

    const header = this._parsePLYHeader(arrayBuffer);
    if (!header) return null;

    if (!header.properties.find(p => p.name === 'x' && p.type === 'float')
     || !header.properties.find(p => p.name === 'y' && p.type === 'float')
     || !header.properties.find(p => p.name === 'z' && p.type === 'float')) {
      logger.error('LidarIOSPlugin', 'PLY must have float x, y, z vertex properties');
      return null;
    }

    // iOS ARKit PLY is always binary little-endian. Reject ASCII
    // because it would be slow + a 10MB LiDAR scan would take >1s.
    if (header.format !== 'binary_little_endian') {
      logger.warn('LidarIOSPlugin', `PLY format "${header.format}" not supported (only binary_little_endian)`);
      return null;
    }

    const N = header.vertexCount;
    const propList = header.properties;
    const propCount = propList.length;
    const stride = header.stride; // bytes per vertex

    const positions = new Float32Array(N * 3);
    const normals = new Float32Array(N * 3);
    const confidence = new Float32Array(N);
    const classification = new Uint8Array(N);

    // Map property name → attribute slot
    const slotOf = (name) => propList.findIndex(p => p.name === name);
    const xSlot = slotOf('x');
    const ySlot = slotOf('y');
    const zSlot = slotOf('z');
    const nxSlot = slotOf('nx');
    const nySlot = slotOf('ny');
    const nzSlot = slotOf('nz');
    const confSlot = slotOf('confidence');
    const clsSlot = slotOf('classification');

    // Read each property as the type declared in the header. iOS uses
    // float for x/y/z/nx/ny/nz, float for confidence, and uint8 for
    // classification; the reader tolerates other widths.
    const dv = new DataView(arrayBuffer, header.dataOffset);
    let off = 0;
    for (let i = 0; i < N; i++) {
      for (let p = 0; p < propCount; p++) {
        const prop = propList[p];
        const base = off + prop.offset;
        switch (prop.type) {
          case 'float':
          case 'float32': {
            const v = dv.getFloat32(base, true);
            if (p === xSlot) positions[i * 3] = v;
            else if (p === ySlot) positions[i * 3 + 1] = v;
            else if (p === zSlot) positions[i * 3 + 2] = v;
            else if (p === nxSlot) normals[i * 3] = v;
            else if (p === nySlot) normals[i * 3 + 1] = v;
            else if (p === nzSlot) normals[i * 3 + 2] = v;
            else if (p === confSlot) confidence[i] = v;
            break;
          }
          case 'uchar':
          case 'uint8': {
            if (p === clsSlot) classification[i] = dv.getUint8(base);
            break;
          }
          case 'ushort':
          case 'uint16': {
            if (p === clsSlot) classification[i] = dv.getUint16(base, true) & 0xff;
            else if (p === confSlot) confidence[i] = dv.getUint16(base, true) / 65535.0 * 2.0;
            break;
          }
          case 'short':
          case 'int16': {
            if (p === confSlot) confidence[i] = (dv.getInt16(base, true) + 32768) / 65535.0 * 2.0;
            break;
          }
          case 'int':
          case 'int32': {
            if (p === clsSlot) classification[i] = dv.getInt32(base, true) & 0xff;
            break;
          }
          // uint32, double, etc — uncommon in iOS PLY
          default: break;
        }
      }
      off += stride;
    }

    // If normals weren't provided, compute them via cross-product
    // over a simple 1-ring neighborhood. This is O(N²) but only
    // needed when the export omitted them.
    const haveNormals = nxSlot !== -1 && nySlot !== -1 && nzSlot !== -1;
    if (!haveNormals) {
      this._estimateNormals(positions, normals, N);
    }

    // Build the THREE.Points
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geom.setAttribute('aConfidence', new THREE.BufferAttribute(confidence, 1));

    const material = _confidenceMaterial();
    const points = new THREE.Points(geom, material);
    points.name = options.name || `LidarScan_${Date.now()}`;
    points.userData.isManagedObject = true;
    points.userData.isLidarScan = true;
    points.userData.lidarVertexCount = N;
    points.userData.lidarBounds = this._computeBounds(positions, N);
    points.userData.lidarHistogram = this._confidenceHistogram(confidence, N);

    // Track as a GFX resource. Typical iOS scan is 1-10MB.
    const sm = this._getStateManager();
    if (sm && typeof sm.trackGfxResource === 'function') {
      const bytes = positions.byteLength + normals.byteLength + confidence.byteLength + classification.byteLength;
      const id = `lidar/${points.uuid}`;
      sm.trackGfxResource(id, bytes, 'lidar-points', points.name);
      points.userData.gfxResourceId = id;
    }

    const group = new THREE.Group();
    group.name = `${points.name}_group`;
    group.userData.isManagedObject = true;
    group.add(points);

    return { points, group, vertexCount: N, classification, confidence };
  },

  _parsePLYHeader(arrayBuffer) {
    const headerBytes = new Uint8Array(arrayBuffer, 0, Math.min(8192, arrayBuffer.byteLength));
    const headerText = new TextDecoder('ascii').decode(headerBytes);
    const lines = headerText.split('\n');
    let line = 0;

    if (lines[line].trim() !== 'ply') return null;
    line++;

    let format = null;
    let vertexCount = 0;
    const properties = [];
    let dataOffset = 0;
    let inVertexElement = false;

    while (line < lines.length) {
      const raw = lines[line];
      const parts = raw.trim().split(/\s+/);
      const key = parts[0];

      if (key === 'format') {
        format = parts[1];
      } else if (key === 'element') {
        inVertexElement = parts[1] === 'vertex';
        if (inVertexElement) vertexCount = parseInt(parts[2], 10);
      } else if (key === 'property' && inVertexElement) {
        // `property <type> <name>` OR `property list <count-type> <type> <name>`
        if (parts[1] === 'list') {
          // face properties (vertex_indices) — we don't use them
          // but we still need to advance the byte offset for stride
          // computation.
          const listCountType = SIZE_OF[parts[2]] || 4;
          const listValType = SIZE_OF[parts[3]] || 4;
          // Per-vertex overhead from list properties is variable.
          // For iOS PLY there's no list property on vertex element.
          // We add a fixed 4-byte conservative estimate.
          properties.push({ name: parts[4], type: 'list', listCountType, listValType, size: 0, offset: 0 });
        } else {
          const t = parts[1];
          const name = parts[2];
          properties.push({ name, type: t, size: SIZE_OF[t] || 0, offset: 0 });
        }
      } else if (key === 'end_header') {
        dataOffset = headerBytes.length; // approximate; will refine below
        break;
      }
      line++;
    }

    // Compute property offsets and stride
    let runningOffset = 0;
    for (const p of properties) {
      p.offset = runningOffset;
      runningOffset += p.size;
    }
    const stride = runningOffset;

    // Find the actual data offset: scan for "end_header\n" in the
    // first 16KB of the file (header can be longer than 8KB if
    // many properties are declared).
    let endMarker = -1;
    const marker = new TextEncoder().encode('end_header\n');
    for (let i = 0; i < arrayBuffer.byteLength - marker.length; i++) {
      let match = true;
      for (let j = 0; j < marker.length; j++) {
        if (new Uint8Array(arrayBuffer)[i + j] !== marker[j]) { match = false; break; }
      }
      if (match) { endMarker = i + marker.length; break; }
    }
    if (endMarker === -1) {
      // Fall back: use headerBytes.length (worked for ≤8KB headers).
      dataOffset = headerBytes.length;
    } else {
      dataOffset = endMarker;
    }

    return { format, vertexCount, properties, dataOffset, stride };
  },

  /** Drop vertices with confidence below the given minimum (0-2). */
  filterByConfidence(cloud, minConfidence = 2) {
    const conf = cloud.geometry.getAttribute('aConfidence');
    const pos = cloud.geometry.getAttribute('position');
    if (!conf || !pos) return cloud;

    const N = pos.count;
    const keep = [];
    for (let i = 0; i < N; i++) {
      if (conf.getX(i) >= minConfidence) keep.push(i);
    }
    return this._subselectPoints(cloud, keep, `LidarConfidence_${minConfidence}_${Date.now()}`);
  },

  /** Return points whose classification field equals the given int. */
  extractByClassification(cloud, clsInt) {
    const cls = cloud.userData.lidarClassification;
    if (!cls) return cloud;
    const pos = cloud.geometry.getAttribute('position');
    const conf = cloud.geometry.getAttribute('aConfidence');
    if (!pos) return cloud;

    const N = pos.count;
    const keep = [];
    for (let i = 0; i < N; i++) {
      if (cls[i] === clsInt) keep.push(i);
    }
    const out = this._subselectPoints(cloud, keep, `LidarClass${clsInt}_${Date.now()}`);
    if (out && conf) {
      out.geometry.setAttribute('aConfidence', conf);
    }
    return out;
  },

  extractGround(cloud) { return this.extractByClassification(cloud, 1); },
  extractWalls(cloud) { return this.extractByClassification(cloud, 2); },
  extractCeiling(cloud) { return this.extractByClassification(cloud, 3); },

  /**
   * Fit a plane via RANSAC over the cloud's positions. Useful as a
   * fallback when classification is missing or noisy. Returns
   * { normal: THREE.Vector3, distance: number, inliers: number[] }.
   */
  fitPlaneRANSAC(cloud, iterations = 200, threshold = 0.02) {
    const pos = cloud.geometry.getAttribute('position');
    if (!pos || pos.count < 3) return null;
    const N = pos.count;
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const C = new THREE.Vector3();
    const AB = new THREE.Vector3();
    const AC = new THREE.Vector3();
    const normal = new THREE.Vector3();

    let best = { inliers: [], count: 0, normal: null, distance: 0 };

    for (let iter = 0; iter < iterations; iter++) {
      // Sample 3 distinct random indices
      const i = Math.floor(Math.random() * N);
      let j = Math.floor(Math.random() * N);
      let k = Math.floor(Math.random() * N);
      while (j === i) j = Math.floor(Math.random() * N);
      while (k === i || k === j) k = Math.floor(Math.random() * N);

      A.fromBufferAttribute(pos, i);
      B.fromBufferAttribute(pos, j);
      C.fromBufferAttribute(pos, k);
      AB.subVectors(B, A);
      AC.subVectors(C, A);
      normal.crossVectors(AB, AC);
      const normLen = normal.length();
      if (normLen < 1e-6) continue;
      normal.divideScalar(normLen);

      // Plane equation: n·(p - A) = 0
      // Distance from each point: |n·(p - A)|
      const inliers = [];
      for (let p = 0; p < N; p++) {
        const dx = pos.getX(p) - A.x;
        const dy = pos.getY(p) - A.y;
        const dz = pos.getZ(p) - A.z;
        const d = Math.abs(normal.x * dx + normal.y * dy + normal.z * dz);
        if (d < threshold) inliers.push(p);
      }
      if (inliers.length > best.count) {
        const d = -(normal.x * A.x + normal.y * A.y + normal.z * A.z);
        best = { inliers, count: inliers.length, normal: normal.clone(), distance: d };
      }
    }

    if (best.count === 0) return null;
    return {
      normal: best.normal,
      distance: best.distance,
      inliers: best.inliers,
      inlierCount: best.count,
    };
  },

  /**
   * Project the point cloud to an XZ grid and produce a triangulated
   * mesh where each cell's Y is the max vertex height. Returns a
   * THREE.Mesh with PlaneGeometry-derived positions.
   */
  generateHeightmapMesh(cloud, gridSize = 0.05) {
    const pos = cloud.geometry.getAttribute('position');
    if (!pos || pos.count === 0) return null;

    const N = pos.count;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const w = Math.max(1, Math.ceil((maxX - minX) / gridSize) + 1);
    const h = Math.max(1, Math.ceil((maxZ - minZ) / gridSize) + 1);

    // Per-cell accumulator: -Infinity so first write is the max
    const cellMax = new Float32Array(w * h).fill(-Infinity);
    const cellIdx = new Int32Array(w * h).fill(-1);
    for (let i = 0; i < N; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const cx = Math.min(w - 1, Math.max(0, Math.floor((x - minX) / gridSize)));
      const cz = Math.min(h - 1, Math.max(0, Math.floor((z - minZ) / gridSize)));
      const idx = cz * w + cx;
      if (y > cellMax[idx]) { cellMax[idx] = y; cellIdx[idx] = i; }
    }

    // Build a w × h grid of Y values, with NaN for empty cells.
    // Replace empty cells with the mean of valid neighbors (smooth).
    const heights = new Float32Array(w * h);
    for (let i = 0; i < heights.length; i++) {
      heights[i] = cellMax[i] === -Infinity ? NaN : cellMax[i];
    }
    // Smoothing pass: replace NaN with average of valid neighbors
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const i = z * w + x;
        if (isNaN(heights[i])) {
          let sum = 0, count = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, nz = z + dz;
              if (nx < 0 || nx >= w || nz < 0 || nz >= h) continue;
              const v = heights[nz * w + nx];
              if (!isNaN(v)) { sum += v; count++; }
            }
          }
          if (count > 0) heights[i] = sum / count;
          else heights[i] = 0;
        }
      }
    }

    // Build PlaneGeometry and overwrite Y per-vertex.
    const geo = new THREE.PlaneGeometry(w * gridSize, h * gridSize, w - 1, h - 1);
    // PlaneGeometry vertices are in XY plane, so swap to XZ.
    const vPos = geo.attributes.position;
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const vIdx = z * w + x;
        const wx = minX + x * gridSize;
        const wz = minZ + z * gridSize;
        const wy = heights[vIdx];
        vPos.setXYZ(vIdx, wx, wy, wz);
      }
    }
    geo.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x88aa66,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `LidarHeightmap_${Date.now()}`;
    mesh.userData.isManagedObject = true;
    mesh.userData.isLidarHeightmap = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Track as GFX resource (mesh is small, ~few hundred KB)
    const sm = this._getStateManager();
    if (sm && typeof sm.trackGfxResource === 'function') {
      const id = `lidar/heightmap/${mesh.uuid}`;
      sm.trackGfxResource(id, vPos.array.byteLength + geo.index.array.byteLength, 'lidar-heightmap', mesh.name);
      mesh.userData.gfxResourceId = id;
    }

    return mesh;
  },

  /**
   * Export a point cloud as PLY (binary little-endian) or OBJ. The
   * resulting file is downloaded via a synthesized <a> element.
   */
  exportAs(cloud, format = 'ply', filename = null) {
    const pos = cloud.geometry.getAttribute('position');
    const conf = cloud.geometry.getAttribute('aConfidence');
    if (!pos) return false;

    const N = pos.count;
    let blob = null;
    let defaultExt = format;

    if (format === 'ply') {
      // Binary little-endian PLY (re-importable by this plugin)
      const propNames = ['x', 'y', 'z', 'confidence'];
      const propTypes = ['float', 'float', 'float', 'float'];
      const headerStr = [
        'ply',
        'format binary_little_endian 1.0',
        `element vertex ${N}`,
        'property float x',
        'property float y',
        'property float z',
        'property float confidence',
        'end_header',
        '',
      ].join('\n');
      const header = new TextEncoder().encode(headerStr);
      const stride = propTypes.length * 4;
      const buf = new ArrayBuffer(header.byteLength + N * stride);
      const u8 = new Uint8Array(buf);
      u8.set(header, 0);
      const dv = new DataView(buf, header.byteLength);
      let off = 0;
      for (let i = 0; i < N; i++) {
        dv.setFloat32(off + 0, pos.getX(i), true);
        dv.setFloat32(off + 4, pos.getY(i), true);
        dv.setFloat32(off + 8, pos.getZ(i), true);
        const c = conf ? conf.getX(i) : 0;
        dv.setFloat32(off + 12, c, true);
        off += stride;
      }
      blob = new Blob([buf], { type: 'application/octet-stream' });
      defaultExt = 'ply';
    } else if (format === 'obj') {
      // ASCII OBJ with `v x y z`
      const lines = ['# Exported from LidarIOSPlugin', `# ${N} vertices`];
      for (let i = 0; i < N; i++) {
        lines.push(`v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`);
      }
      blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      defaultExt = 'obj';
    } else {
      logger.warn('LidarIOSPlugin', `exportAs: unknown format "${format}"`);
      return false;
    }

    const finalName = (filename || `lidar-export-${Date.now()}`).replace(/\.[^.]+$/, '') + '.' + defaultExt;
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

  _subselectPoints(cloud, keepIndices, newName) {
    const pos = cloud.geometry.getAttribute('position');
    const norm = cloud.geometry.getAttribute('normal');
    const conf = cloud.geometry.getAttribute('aConfidence');
    const N = keepIndices.length;
    const newPos = new Float32Array(N * 3);
    const newNorm = new Float32Array(N * 3);
    const newConf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const src = keepIndices[i];
      newPos[i * 3]     = pos.getX(src);
      newPos[i * 3 + 1] = pos.getY(src);
      newPos[i * 3 + 2] = pos.getZ(src);
      if (norm) {
        newNorm[i * 3]     = norm.getX(src);
        newNorm[i * 3 + 1] = norm.getY(src);
        newNorm[i * 3 + 2] = norm.getZ(src);
      }
      if (conf) newConf[i] = conf.getX(src);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
    g.setAttribute('aConfidence', new THREE.BufferAttribute(newConf, 1));
    const out = new THREE.Points(g, _confidenceMaterial());
    out.name = newName;
    out.userData.isManagedObject = true;
    out.userData.isLidarScan = true;
    return out;
  },

  _computeBounds(positions, N) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  },

  _confidenceHistogram(confidence, N) {
    const buckets = [0, 0, 0]; // [0, 1, 2]
    for (let i = 0; i < N; i++) {
      const c = confidence[i];
      const b = Math.max(0, Math.min(2, Math.floor(c)));
      buckets[b]++;
    }
    return buckets;
  },

  _estimateNormals(positions, normals, N) {
    // Cheap O(N²) estimate. For large clouds users should re-import
    // with normals already present.
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const C = new THREE.Vector3();
    const AB = new THREE.Vector3();
    const AC = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      A.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      // Find nearest 2 neighbors
      let j = (i + 1) % N, k = (i + 2) % N;
      B.set(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
      C.set(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
      AB.subVectors(B, A);
      AC.subVectors(C, A);
      n.crossVectors(AB, AC);
      const len = n.length();
      if (len > 1e-6) n.divideScalar(len);
      else n.set(0, 1, 0);
      normals[i * 3]     = n.x;
      normals[i * 3 + 1] = n.y;
      normals[i * 3 + 2] = n.z;
    }
  },

  // ── Visual Nodes ────────────────────────────────────────────────────────

  nodes: {
    'Lidar/ParseIOSPlyNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">📡 Parse iOS LiDAR .ply</div>
        <div class="node-body">
          <input type="file" class="node-input" data-prop="file" accept=".ply" />
          <label>Min Confidence (0-2):</label>
          <input type="number" class="node-input" data-prop="minConfidence" value="1" step="1" min="0" max="2" />
        </div>
        <button class="run-node-btn" data-action="run">Parse LiDAR</button>
        <div class="node-outputs">
          <span data-type="Points">Point Cloud</span>
        </div>
      `;
      return el;
    },

    'Lidar/GenerateHeightmapNode': (x, y) => {
      const el = document.createElement('div');
      el.className = 'node-card';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.innerHTML = `
        <div class="node-header">🗺️ Generate Heightmap</div>
        <div class="node-body">
          <label>Cell Size (m):</label>
          <input type="number" class="node-input" data-prop="cellSize" value="0.05" step="0.01" />
        </div>
        <button class="run-node-btn" data-action="run">Triangulate Floor</button>
        <div class="node-outputs">
          <span data-type="Mesh">Heightmap Mesh</span>
        </div>
      `;
      return el;
    },

    'Lidar/ExportNode': (x, y) => {
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
          </select>
          <label>Filename:</label>
          <input type="text" class="node-input" data-prop="filename" value="lidar-export" />
        </div>
        <button class="run-node-btn" data-action="run">Export</button>
      `;
      return el;
    },
  }
};

// Type-size table for PLY properties (bytes).
const SIZE_OF = {
  char: 1, int8: 1, uchar: 1, uint8: 1,
  short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4,
  float: 4, float32: 4,
  double: 8, float64: 8,
};
