/**
 * usecase.js — Self-contained Wasm use case runner.
 *
 * Bypasses MasterApp (no node graph, no physics, no menus) so the Wasm
 * surface is exercised in isolation. Boots a single Three.js scene +
 * renders a 2-column brutalist layout that drives the 6 Wasm operations
 * from `usecase.html`:
 *
 *   1. CSG Boolean         (Rust)  compute_boolean
 *   2. Mesh Decimation     (Rust)  decimate_mesh
 *   3. BVH / AABB Bounds   (Rust)  generate_bvh
 *   4. Physics Step        (Rust)  step_physics
 *   5. Point Cloud Parse   (Go)    goParsePointCloud
 *   6. CAD Import          (Go)    goImportCAD
 *
 * Each operation logs `[module] name | elapsed | input → output` to the
 * bottom console for at-a-glance verification.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initWasmModules, getWasmStatus, RustGeometryBridge, RustPhysicsBridge, GoAssetBridge } from './bindings/WasmBridge.js';

// NOTE: We deliberately don't import `logger` from core/Logger.js here — the
// use case demo surfaces all status / error output via the on-screen brutalist
// console at the bottom of usecase.html (the `logInfo` / `logError` DOM
// helpers below). This keeps the demo fully self-contained without coupling
// it to the master console pipeline.

// ── Three.js boot ──────────────────────────────────────────────────────────
const canvas = document.getElementById('renderCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x131313);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x131313);

const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
camera.position.set(4, 4, 8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

const ambient = new THREE.HemisphereLight(0x77ff61, 0x131313, 0.7);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(5, 10, 7);
scene.add(dir);

// Ground plane (used by physics demo for collision)
const groundGeo = new THREE.PlaneGeometry(20, 20);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// Grid
const grid = new THREE.GridHelper(20, 20, 0x3b4b35, 0x1c1b1b);
grid.position.y = 0.001;
scene.add(grid);

function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(onResize).observe(canvas.parentElement);
}

// ── Scene reset helper ─────────────────────────────────────────────────────
// Clears all "user objects" (anything we added) and re-spawns the demo
// geometry for the given use case. Returns the spawned objects so the
// caller can run the Wasm op on them.
function clearScene() {
  // Remove everything except ground + grid + ambient + dir
  const keepers = new Set([ground, grid, ambient, dir]);
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (!keepers.has(obj)) {
      scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
  }
  // Also clear the BVH helper if present
  if (scene.userData.bvhHelper) {
    scene.remove(scene.userData.bvhHelper);
    scene.userData.bvhHelper.geometry.dispose();
    scene.userData.bvhHelper.material.dispose();
    scene.userData.bvhHelper = null;
  }
}

// ── Console logger ─────────────────────────────────────────────────────────
const consoleEl = document.getElementById('console');
function logLine(module, op, elapsedMs, inputStr, outputStr, color = 'text-on-surface-variant') {
  const line = document.createElement('div');
  line.className = `console-line fresh ${color}`;
  const moduleTag = module === 'rust' ? '[RUST]' : module === 'go' ? '[GO]  ' : '[INFO]';
  const time = String(elapsedMs).padStart(4, ' ');
  line.innerHTML = `<span class="text-outline">></span> <span class="text-secondary-fixed-dim">${moduleTag}</span> <span class="text-primary-fixed">${op}</span> <span class="text-outline">|</span> <span class="text-on-surface-variant">${time} ms</span> <span class="text-outline">|</span> <span class="text-on-surface-variant">in: ${inputStr}</span> <span class="text-outline">→</span> <span class="text-primary-fixed">out: ${outputStr}</span>`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
  // Remove the "fresh" flash class after the animation completes
  setTimeout(() => line.classList.remove('fresh'), 900);
}

function logInfo(msg) {
  const line = document.createElement('div');
  line.className = 'console-line text-on-surface-variant opacity-80';
  line.textContent = `// ${msg}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function logError(msg) {
  const line = document.createElement('div');
  line.className = 'console-line text-error';
  line.textContent = `! ${msg}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ── Stats updater ─────────────────────────────────────────────────────────
const sceneStatsEl = document.getElementById('scene-stats');
function updateStats() {
  let meshes = 0, verts = 0, tris = 0;
  scene.traverse(obj => {
    if (obj.isMesh) {
      meshes++;
      const pos = obj.geometry?.attributes?.position;
      if (pos) verts += pos.count;
      const idx = obj.geometry?.index;
      if (idx) tris += idx.count / 3;
      else if (pos) tris += pos.count / 3;
    } else if (obj.isPoints) {
      const pos = obj.geometry?.attributes?.position;
      if (pos) verts += pos.count;
    }
  });
  sceneStatsEl.textContent = `${meshes} mesh · ${verts.toLocaleString()} vert · ${Math.round(tris).toLocaleString()} tri`;
}
setInterval(updateStats, 200);

// ── Tab switcher ───────────────────────────────────────────────────────────
const tabButtons = document.querySelectorAll('.uc-tab');
const panels = document.querySelectorAll('.uc-panel');
const ucNameEl = document.getElementById('uc-name');

const UC_NAMES = {
  csg: 'CSG BOOLEAN',
  decimate: 'DECIMATE MESH',
  bvh: 'BVH BOUNDS',
  physics: 'PHYSICS STEP',
  pointcloud: 'POINT CLOUD',
  cad: 'CAD IMPORT',
};

let activeUC = 'csg';

function setActiveUC(name) {
  activeUC = name;
  ucNameEl.textContent = UC_NAMES[name] || name.toUpperCase();
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.uc === name));
  panels.forEach(p => p.classList.toggle('active', p.dataset.uc === name));
  // Stop physics sim if leaving
  if (name !== 'physics' && physicsState.running) {
    stopPhysics();
  }
  // Reset scene for the new use case
  clearScene();
  if (name === 'csg') setupCSG();
  else if (name === 'decimate') setupDecimate();
  else if (name === 'bvh') setupBVH();
  else if (name === 'physics') setupPhysics();
  else if (name === 'pointcloud') setupPointCloud();
  else if (name === 'cad') setupCAD();
  updateStats();
  logInfo(`Switched to use case: ${UC_NAMES[name]}`);
}

tabButtons.forEach(b => b.addEventListener('click', () => setActiveUC(b.dataset.uc)));

// ──────────────────────────────────────────────────────────────────────────
// UC1: CSG Boolean (Rust)
// ──────────────────────────────────────────────────────────────────────────
function setupCSG() {
  const sphereGeo = new THREE.SphereGeometry(0.8, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.4 });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.set(-0.3, 0.8, 0);
  sphere.castShadow = true;
  sphere.userData.label = 'A (sphere)';
  scene.add(sphere);

  const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x44aaff, roughness: 0.4 });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.set(0.3, 0.6, 0);
  box.castShadow = true;
  box.userData.label = 'B (box)';
  scene.add(box);
}

document.getElementById('csg-run').addEventListener('click', async () => {
  // Find first two meshes in scene
  const meshes = [];
  scene.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
  if (meshes.length < 2) {
    logError('CSG requires 2 meshes in the scene');
    return;
  }
  const [meshA, meshB] = meshes;
  const op = document.getElementById('csg-op').value;

  const t0 = performance.now();
  const result = await RustGeometryBridge.computeBoolean(meshA, meshB, op);
  const t1 = performance.now();

  if (!result || !result.positions) {
    logError('CSG returned no result (Rust Wasm may not be loaded)');
    return;
  }

  // Build the new geometry from the Wasm output
  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
  if (result.indices) {
    newGeo.setIndex(new THREE.BufferAttribute(result.indices, 1));
  }
  newGeo.computeVertexNormals();

  const vertsIn = meshA.geometry.attributes.position.array.length / 3 + meshB.geometry.attributes.position.array.length / 3;
  const vertsOut = result.vertex_count || (result.positions.length / 3);
  logLine('rust', `compute_boolean("${op}")`, (t1 - t0).toFixed(1), `${vertsIn} vert`, `${vertsOut} vert`);

  // Replace the two source meshes with the result
  clearScene();
  const newMat = new THREE.MeshStandardMaterial({ color: 0x77ff61, roughness: 0.4, metalness: 0.3 });
  const resultMesh = new THREE.Mesh(newGeo, newMat);
  resultMesh.position.set(0, 0.5, 0);
  resultMesh.castShadow = true;
  resultMesh.name = `CSG_${op}`;
  scene.add(resultMesh);
  updateStats();
});

// ──────────────────────────────────────────────────────────────────────────
// UC2: Decimate (Rust)
// ──────────────────────────────────────────────────────────────────────────
function setupDecimate() {
  const geo = new THREE.TorusKnotGeometry(0.7, 0.25, 128, 32);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.4, wireframe: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 1.5, 0);
  mesh.castShadow = true;
  scene.add(mesh);
}

document.getElementById('decimate-pct').addEventListener('input', (e) => {
  document.getElementById('decimate-pct-readout').textContent = `${e.target.value}%`;
});

document.getElementById('decimate-run').addEventListener('click', async () => {
  const mesh = scene.children.find(o => o.isMesh);
  if (!mesh) { logError('No mesh in scene'); return; }
  const pct = parseFloat(document.getElementById('decimate-pct').value);

  const t0 = performance.now();
  const result = await RustGeometryBridge.decimateMesh(mesh, pct);
  const t1 = performance.now();

  if (!result || !result.positions) {
    logError('Decimate returned no result (Rust Wasm may not be loaded)');
    return;
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
  if (result.indices) {
    newGeo.setIndex(new THREE.BufferAttribute(result.indices, 1));
  }
  newGeo.computeVertexNormals();

  const vertsIn = mesh.geometry.attributes.position.count;
  const vertsOut = result.vertex_count || (result.positions.length / 3);
  logLine('rust', `decimate_mesh(${pct}%)`, (t1 - t0).toFixed(1), `${vertsIn} vert`, `${vertsOut} vert`);

  clearScene();
  // Render as wireframe so the reduced edge count is instantly visible
  const mat = new THREE.MeshStandardMaterial({ color: 0x77ff61, wireframe: true, roughness: 0.4 });
  const decimated = new THREE.Mesh(newGeo, mat);
  decimated.position.set(0, 1.5, 0);
  decimated.name = `Decimated_${pct}`;
  scene.add(decimated);
  updateStats();
});

// ──────────────────────────────────────────────────────────────────────────
// UC3: BVH (Rust)
// ──────────────────────────────────────────────────────────────────────────
function setupBVH() {
  const geo = new THREE.IcosahedronGeometry(0.9, 1); // subdivided icosahedron
  const mat = new THREE.MeshStandardMaterial({ color: 0xff44ff, roughness: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 1.2, 0);
  mesh.rotation.set(0.4, 0.7, 0.2);
  mesh.castShadow = true;
  scene.add(mesh);
}

document.getElementById('bvh-run').addEventListener('click', async () => {
  const mesh = scene.children.find(o => o.isMesh);
  if (!mesh) { logError('No mesh in scene'); return; }

  const t0 = performance.now();
  const bvh = await RustGeometryBridge.generateBVH(mesh);
  const t1 = performance.now();

  if (!bvh || !bvh.min || !bvh.max) {
    logError('BVH returned no result (Rust Wasm may not be loaded)');
    return;
  }

  // bvh.min / bvh.max are Float32Array of length 3
  const min = new THREE.Vector3(bvh.min[0], bvh.min[1], bvh.min[2]);
  const max = new THREE.Vector3(bvh.max[0], bvh.max[1], bvh.max[2]);
  const box = new THREE.Box3(min, max);
  const helper = new THREE.Box3Helper(box, 0x02e600);
  helper.userData.bvhHelper = true;
  scene.add(helper);
  scene.userData.bvhHelper = helper;

  const vertsIn = mesh.geometry.attributes.position.count;
  logLine('rust', 'generate_bvh', (t1 - t0).toFixed(1), `${vertsIn} vert`, `min[${min.x.toFixed(2)},${min.y.toFixed(2)},${min.z.toFixed(2)}] max[${max.x.toFixed(2)},${max.y.toFixed(2)},${max.z.toFixed(2)}]`);
  updateStats();
});

// ──────────────────────────────────────────────────────────────────────────
// UC4: Physics (Rust)
// ──────────────────────────────────────────────────────────────────────────
const physicsState = {
  running: false,
  bodies: [],     // { position: Vector3, velocity: Vector3, mass: number, mesh: THREE.Mesh }
  rafId: null,
  lastT: 0,
};

function setupPhysics() {
  spawnPhysicsCubes(parseInt(document.getElementById('physics-count').value, 10));
}

function spawnPhysicsCubes(count) {
  const colors = [0xff4444, 0x44aaff, 0xffaa00, 0xff44ff, 0x44ff44, 0xffff44];
  for (let i = 0; i < count; i++) {
    const size = 0.3 + Math.random() * 0.2;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({
      color: colors[i % colors.length],
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 6,
      3 + Math.random() * 4,
      (Math.random() - 0.5) * 6
    );
    mesh.castShadow = true;
    scene.add(mesh);

    physicsState.bodies.push({
      position: mesh.position,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0,
        (Math.random() - 0.5) * 2
      ),
      mass: 1,
      mesh,
    });
  }
}

function stepPhysicsOnce(dt) {
  // Pack bodies into the shape the Wasm module expects
  const bodyData = physicsState.bodies.map(b => ({
    position: [b.position.x, b.position.y, b.position.z],
    velocity: [b.velocity.x, b.velocity.y, b.velocity.z],
    mass: b.mass,
  }));

  return RustPhysicsBridge.stepPhysics(bodyData, dt).then(updated => {
    // Apply results back to Three.js objects
    updated.forEach((data, i) => {
      const body = physicsState.bodies[i];
      body.position.set(data.position[0], data.position[1], data.position[2]);
      body.velocity.set(data.velocity[0], data.velocity[1], data.velocity[2]);
    });
  });
}

function startPhysics() {
  if (physicsState.running) return;
  physicsState.running = true;
  physicsState.lastT = performance.now();
  const tick = () => {
    if (!physicsState.running) return;
    const now = performance.now();
    const dt = Math.min(0.033, (now - physicsState.lastT) / 1000);
    physicsState.lastT = now;
    stepPhysicsOnce(dt).then(() => {
      physicsState.rafId = requestAnimationFrame(tick);
    });
  };
  tick();
  logInfo('Physics simulation started (50ms tick target, 60 FPS cap via dt clamp)');
}

function stopPhysics() {
  physicsState.running = false;
  if (physicsState.rafId) {
    cancelAnimationFrame(physicsState.rafId);
    physicsState.rafId = null;
  }
}

function resetPhysics() {
  stopPhysics();
  physicsState.bodies.forEach(b => {
    scene.remove(b.mesh);
    b.mesh.geometry.dispose();
    b.mesh.material.dispose();
  });
  physicsState.bodies = [];
  setupPhysics();
  updateStats();
  logInfo('Physics reset: cubes re-spawned at random positions above the ground plane');
}

document.getElementById('physics-run').addEventListener('click', startPhysics);
document.getElementById('physics-reset').addEventListener('click', resetPhysics);
document.getElementById('physics-count').addEventListener('input', (e) => {
  document.getElementById('physics-count-readout').textContent = e.target.value;
});
// Re-spawn when count changes (only if not currently running)
document.getElementById('physics-count').addEventListener('change', () => {
  if (!physicsState.running) resetPhysics();
});

// ──────────────────────────────────────────────────────────────────────────
// UC5: Point Cloud (Go)
// ──────────────────────────────────────────────────────────────────────────
function setupPointCloud() {
  // Empty scene — point cloud spawns on Run
  const hint = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 0.4),
    new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.6 })
  );
  hint.rotation.x = -Math.PI / 2;
  hint.position.y = 0.01;
  scene.add(hint);
}

function buildPointCloudBuffer(count) {
  // Pack (x, y, z) float32 little-endian into an ArrayBuffer
  const buffer = new ArrayBuffer(count * 12);
  const dv = new DataView(buffer);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 6;
    const y = Math.random() * 4;
    const z = (Math.random() - 0.5) * 6;
    dv.setFloat32(i * 12, x, true);
    dv.setFloat32(i * 12 + 4, y, true);
    dv.setFloat32(i * 12 + 8, z, true);
  }
  return buffer;
}

document.getElementById('pc-count').addEventListener('input', (e) => {
  document.getElementById('pc-count-readout').textContent = parseInt(e.target.value, 10).toLocaleString();
});

document.getElementById('pc-run').addEventListener('click', async () => {
  const count = parseInt(document.getElementById('pc-count').value, 10);
  const buffer = buildPointCloudBuffer(count);

  const t0 = performance.now();
  const result = await GoAssetBridge.parsePointCloud(buffer);
  const t1 = performance.now();

  if (!result || !result.positions) {
    logError('Point cloud parse returned no result (Go Wasm may not be loaded)');
    return;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
  if (result.colors) {
    geo.setAttribute('color', new THREE.Float32BufferAttribute(result.colors, 3));
  }
  geo.computeBoundingSphere();

  const mat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: !!result.colors,
    color: result.colors ? 0xffffff : 0x77ff61,
  });
  const points = new THREE.Points(geo, mat);
  points.name = `PointCloud_${count}`;

  const bytesIn = buffer.byteLength;
  const bytesOut = result.positions.byteLength + (result.colors ? result.colors.byteLength : 0);
  logLine('go', `goParsePointCloud(${count} pts)`, (t1 - t0).toFixed(1), `${(bytesIn / 1024).toFixed(1)} KB`, `${(bytesOut / 1024).toFixed(1)} KB`);

  clearScene();
  setupPointCloud(); // re-add the hint plane
  scene.add(points);
  updateStats();
});

// ──────────────────────────────────────────────────────────────────────────
// UC6: CAD Import (Go)
// ──────────────────────────────────────────────────────────────────────────
function setupCAD() {
  // Empty scene — CAD mesh spawns on Run
}

document.getElementById('cad-run').addEventListener('click', async () => {
  // Mock CAD-shaped buffer (just 64 bytes of zeros — the placeholder parser
  // ignores the input and returns a fixed cube)
  const buffer = new ArrayBuffer(64);

  const t0 = performance.now();
  const result = await GoAssetBridge.importCAD(buffer);
  const t1 = performance.now();

  if (!result || !result.meshes) {
    logError('CAD import returned no result (Go Wasm may not be loaded)');
    return;
  }

  const group = new THREE.Group();
  group.name = `CAD_Model`;
  const faceColors = [0x77ff61, 0xffaa00, 0x44aaff, 0xff44ff, 0xff4444, 0x44ff44];
  result.meshes.forEach((meshData, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: faceColors[i % faceColors.length],
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `CAD_Part_${i}`;
    group.add(mesh);
  });

  const bytesIn = buffer.byteLength;
  const bytesOut = result.meshes.reduce((sum, m) => sum + m.positions.byteLength + m.indices.byteLength, 0);
  logLine('go', `goImportCAD(${result.meshes.length} part)`, (t1 - t0).toFixed(1), `${bytesIn} B`, `${(bytesOut / 1024).toFixed(1)} KB`);

  clearScene();
  group.position.set(0, 0.5, 0);
  scene.add(group);
  updateStats();
});

// ── Render loop ────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ── Wasm boot + UI status updates ──────────────────────────────────────────
const rustDot = document.getElementById('status-rust-dot');
const rustText = document.getElementById('status-rust-text');
const goDot = document.getElementById('status-go-dot');
const goText = document.getElementById('status-go-text');

function setRustStatus(ok) {
  rustDot.classList.remove('loading', 'bg-yellow-500', 'bg-green-500', 'bg-red-500');
  if (ok === null) {
    rustDot.classList.add('loading', 'bg-yellow-500');
    rustText.textContent = 'loading…';
  } else if (ok) {
    rustDot.classList.add('bg-green-500');
    rustText.textContent = 'loaded';
  } else {
    rustDot.classList.add('bg-red-500');
    rustText.textContent = 'failed';
  }
}
function setGoStatus(ok) {
  goDot.classList.remove('loading', 'bg-yellow-500', 'bg-green-500', 'bg-red-500');
  if (ok === null) {
    goDot.classList.add('loading', 'bg-yellow-500');
    goText.textContent = 'loading…';
  } else if (ok) {
    goDot.classList.add('bg-green-500');
    goText.textContent = 'loaded';
  } else {
    goDot.classList.add('bg-red-500');
    goText.textContent = 'failed';
  }
}

(async function boot() {
  setRustStatus(null);
  setGoStatus(null);
  logInfo('Booting Wasm modules...');

  await initWasmModules();

  // Probe the bridge's actual Wasm load state. `getWasmStatus` returns the
  // booleans that `initWasmModules` set inside its try/catch blocks, so this
  // is a real read of the Wasm readiness flag (not just a function-existence
  // check, which would lie when the Wasm binary failed to load).
  const status = getWasmStatus();
  const rustOk = status.rust;
  const goOk = status.go;

  setRustStatus(rustOk);
  setGoStatus(goOk);
  logInfo(`Rust module: ${rustOk ? 'loaded' : 'NOT available'}`);
  logInfo(`Go module:   ${goOk ? 'loaded' : 'NOT available'}`);
  if (!rustOk && !goOk) {
    logError('No Wasm modules loaded. Run `bash wasm/rust_core/build.sh` + `bash wasm/go_engine/build.sh` then reload.');
  }

  // Spawn the initial use case scene
  setActiveUC('csg');
})();
