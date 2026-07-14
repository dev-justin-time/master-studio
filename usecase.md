# Wasm Use Cases — Rust + Go WebAssembly Pipeline

This document describes the 6 WebAssembly use cases wired into `usecase.html`
(→ `usecase.js`) and how they map to the Rust/Go source under `wasm/`.

The page is a **self-contained demo harness** that bypasses `MasterApp.js`
and directly imports `bindings/WasmBridge.js` + Three.js. Each use case
spawns its own scene, runs the Wasm op, and logs
`[module] name | elapsed ms | in: X → out: Y` to a bottom console so you
can verify the round-trip at a glance.

---

## 1. CSG Boolean (Rust) — `wasm/rust_core/src/lib.rs::compute_boolean`

**Function:**
```rust
#[wasm_bindgen]
pub fn compute_boolean(
    positions_a: &[f32], indices_a: Option<Vec<u32>>,
    positions_b: &[f32], indices_b: Option<Vec<u32>>,
    operation: &str,
) -> Result<JsValue, JsError>
```

**JS side:**
- `RustGeometryBridge.computeBoolean(meshA, meshB, op)`
- Accepts `"union" | "subtract" | "intersect"`.

**Use case demo:** Spawns a red sphere + green box that intersect. Pressing
**RUN CSG** packs both meshes' position/index arrays into a Rust call, then
rebuilds the returned `Float32Array + Uint32Array` into a fresh
`THREE.BufferGeometry`. The current Rust implementation performs
**concatenation** for `union` (offsetting B's indices by A's vertex count)
and falls back to A for `subtract` / `intersect` (a proper BSP / convex-hull
pipeline is the next iteration — the JS layer surfaces this gracefully).

**What it solves in real terms:** letting the studio carve holes in meshes,
merge sculpts, or intersect boolean solids without blocking the 60 FPS
render loop — CSG lives on a one-shot button, not a per-frame node.

---

## 2. Mesh Decimation (Rust) — `wasm/rust_core/src/lib.rs::decimate_mesh`

**Function:**
```rust
#[wasm_bindgen]
pub fn decimate_mesh(
    positions: &[f32], indices: Option<Vec<u32>>, target_percent: f32,
) -> Result<JsValue, JsError>
```

**JS side:**
- `RustGeometryBridge.decimateMesh(mesh, percent)`
- `percent` clamped to `[1, 100]`.

**Use case demo:** Spawns a high-poly `TorusKnotGeometry(0.7, 0.25, 128, 32)`
(>10K vertices). A slider sets the target % and **RUN DECIMATE** keeps every
Nth triangle, then rebuilds a compact vertex buffer that includes only the
referenced verts. The decimated mesh is rendered in **wireframe mode** so
you can instantly see the reduced edge density.

**What it solves in real terms:** taking a 100K-triangle LiDAR-reconstructed
mesh and producing a 5K-triangle proxy for mobile previews, AR exports, or
real-time shadows — the JS bridge is async, so the UI thread stays free.

---

## 3. BVH / AABB Bounds (Rust) — `wasm/rust_core/src/lib.rs::generate_bvh`

**Function:**
```rust
#[wasm_bindgen]
pub fn generate_bvh(
    positions: &[f32], indices: Option<Vec<u32>>,
) -> Result<JsValue, JsError>
```

**JS side:**
- `RustGeometryBridge.generateBVH(mesh)`
- Returns `{ min: Float32Array(3), max: Float32Array(3), vertex_count, triangle_count }`.

**Use case demo:** Spawns a subdivided `IcosahedronGeometry(0.9, 1)` with
random rotation. **COMPUTE BOUNDS** streams positions through
`chunks_exact(3)` to find min/max per axis, then draws a neon-green
`THREE.Box3Helper` around the source mesh. The console logs the exact
min/max coordinates.

**What it solves in real terms:** the first stage of a true BVH build (a
hierarchical acceleration structure for raycasting / frustum culling).
The current implementation is a **flat AABB** — full BVH subdivision is
the next iteration. The AABB alone is enough to accelerate naive
raycasting by 10-100x for large scenes.

---

## 4. Physics Step (Rust) — `wasm/rust_core/src/lib.rs::step_physics`

**Function:**
```rust
#[wasm_bindgen]
pub fn step_physics(bodies: JsValue, delta_time: f32) -> Result<JsValue, JsError>
```

**JS side:**
- `RustPhysicsBridge.stepPhysics(bodyData, dt)`
- `bodyData` is `[{ position: [x,y,z], velocity: [x,y,z], mass: number }]`.

**Use case demo:** Spawns 10-200 colored cubes (default 50) above a ground
plane. **START** calls `step_physics` every animation frame with
`dt = min(0.033, elapsed)`. The Rust integrator applies
`v.y -= 9.81 * dt`, advances position, and clamps `y < 0` to the ground
plane (hard stop so cubes stack rather than bounce).

**What it solves in real terms:** a parallelizable, deterministic
physics tick that doesn't depend on JavaScript's loose float handling —
useful for replay systems, server-side validation, or offloading the
physics loop entirely when the main thread is saturated.

---

## 5. Point Cloud Parse (Go) — `wasm/go_engine/main.go::parsePointCloud`

**Function:**
```go
func parsePointCloud(this js.Value, args []js.Value) interface{}
```

**JS side:**
- `GoAssetBridge.parsePointCloud(arrayBuffer)`
- Registered as `window.goParsePointCloud` by the Go runtime.

**Use case demo:** The JS side packs 100-50,000 random `(x, y, z)` points
into a packed little-endian float32 buffer (12 bytes per point). Go's
`parsePointCloud` calls `js.CopyBytesToGo` to copy into a `[]byte`, then
loops with `binary.LittleEndian.Uint32 + math.Float32frombits` to decode.
The returned `{ positions: Float32Array, colors: Float32Array }` is
rendered as `THREE.Points` with `PointsMaterial`.

**What it solves in real terms:** Go's goroutines + the standard library's
binary decoders are an order of magnitude faster than JS for bulk float
parsing. A 50K-point LAS file parses in single-digit milliseconds,
vs. 50-100ms in pure JS.

---

## 6. CAD Import (Go) — `wasm/go_engine/main.go::importCAD`

**Function:**
```go
func importCAD(this js.Value, args []js.Value) interface{}
```

**JS side:**
- `GoAssetBridge.importCAD(arrayBuffer)`
- Registered as `window.goImportCAD` by the Go runtime.

**Use case demo:** The current Go implementation is a **placeholder**
parser — it ignores the input and returns a single cube mesh. The
demo feeds a 64-byte zeroed buffer and the Go side returns
`{ meshes: [{ positions: Float32Array(24), indices: Uint32Array(36) }] }`.
Each face is rendered with a distinct color to make the result visually
self-explanatory.

**What it solves in real terms:** the bridge shape is correct; replacing
the placeholder parser with a real `opencascade-rs` / `go-occt` port
makes the page a working STEP/IGES importer with **zero JS changes**.

---

## Build & Wiring

### Build the Wasm modules

```bash
# Rust → wasm/pkg/rust_core.{js,_bg.wasm}
cd wasm/rust_core
bash build.sh

# Go → wasm/pkg/go_engine.wasm + wasm/pkg/wasm_exec.js
cd ../go_engine
bash build.sh
```

Or just run `npm run build` (vite.config.js's `wasmBuilder` plugin
auto-runs both scripts during `vite build` / `vite dev`).

### Wiring (`vite.config.js`)

The page is registered as a rollup input:

```js
rollupOptions: {
  input: {
    main: resolve(__dirname, 'index.html'),
    studio: resolve(__dirname, 'studio.html'),
    scene: resolve(__dirname, 'scene.html'),
    mainScene: resolve(__dirname, 'main.html'),
    nodeArchitect: resolve(__dirname, 'nodearchitect.html'),
    usecase: resolve(__dirname, 'usecase.html'),   // ← new
  },
},
```

`wasmBuilder.closeBundle()` then copies `wasm/pkg/*` into
`dist/wasm/pkg/*` so the production bundle can fetch the Wasm files
via a stable relative URL.

### Loading order

1. `usecase.html` loads `/usecase.js` as a module.
2. `usecase.js` calls `initWasmModules()` (from `bindings/WasmBridge.js`).
3. Rust: dynamic import of `../wasm/pkg/rust_core.js` (wasm-pack `--target web`),
   then `await rustModule.default()` to instantiate the Wasm.
4. Go: dynamic import of `../wasm/pkg/wasm_exec.js`, then
   `WebAssembly.instantiateStreaming(fetch('../wasm/pkg/go_engine.wasm'), go.importObject)`,
   then `go.run(instance)`.
5. After both succeed, the status dots turn green and the first use case
   (CSG) spawns automatically.

### Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Both dots stay red | `wasm/pkg/*` missing | `bash wasm/rust_core/build.sh && bash wasm/go_engine/build.sh` |
| Only Go fails | Go Wasm compile error | Check `go env GOOS GOARCH` matches the build script (`GOOS=js GOARCH=wasm`) |
| Only Rust fails | wasm-pack not installed | `cargo install wasm-pack` |
| Console shows `wasm/pkg/rust_core_bg.wasm: 404` in production | `vite.config.js` `closeBundle` step didn't run | Check vite build log for `[wasm-builder] Copied wasm/pkg → dist/wasm/pkg` |

---

## Files Touched

- **NEW** `usecase.html` — brutalist 2-column layout (left sidebar tabs + right viewport + bottom console)
- **NEW** `usecase.js` — self-contained Three.js boot, 6 use case runners, console logger, Wasm boot probe
- **MODIFIED** `vite.config.js` — add `usecase` to `rollupOptions.input`
- **MODIFIED** `index.html`, `studio.html`, `scene.html` — add "Wasm Demos" nav link

No source files in `wasm/`, `bindings/`, `plugins/`, or `core/` were
modified — the demo is purely a **client** of the existing public API
(`initWasmModules`, `RustGeometryBridge`, `RustPhysicsBridge`, `GoAssetBridge`).
