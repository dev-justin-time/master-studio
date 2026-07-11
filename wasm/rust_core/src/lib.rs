use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Uint32Array, Array};
use std::collections::HashMap;

// ── Boolean CSG Operations ──────────────────────────────────────────────────

#[wasm_bindgen]
pub fn compute_boolean(
    positions_a: &[f32],
    indices_a: Option<Uint32Array>,
    positions_b: &[f32],
    indices_b: Option<Uint32Array>,
    operation: &str,
) -> JsValue {
    let mesh_a = parse_mesh(positions_a, indices_a);
    let mesh_b = parse_mesh(positions_b, indices_b);

    let result = match operation {
        "union" => csg_union(&mesh_a, &mesh_b),
        "subtract" => csg_subtract(&mesh_a, &mesh_b),
        "intersect" => csg_intersect(&mesh_a, &mesh_b),
        _ => mesh_a.clone(),
    };

    let result_obj = js_sys::Object::new();

    let positions_array = Float32Array::new_with_length(result.positions.len() as u32);
    positions_array.copy_from(&result.positions);
    js_sys::Reflect::set(&result_obj, &"positions".into(), &positions_array).unwrap();

    if !result.indices.is_empty() {
        let indices_array = Uint32Array::new_with_length(result.indices.len() as u32);
        indices_array.copy_from(&result.indices);
        js_sys::Reflect::set(&result_obj, &"indices".into(), &indices_array).unwrap();
    }

    result_obj.into()
}

#[derive(Clone)]
struct Mesh {
    positions: Vec<f32>,
    indices: Vec<u32>,
}

fn parse_mesh(positions: &[f32], indices: Option<Uint32Array>) -> Mesh {
    let pos_vec = positions.to_vec();

    let idx_vec = if let Some(idx_array) = indices {
        let mut vec = vec![0u32; idx_array.length() as usize];
        idx_array.copy_to(&mut vec);
        vec
    } else {
        (0..(pos_vec.len() / 3) as u32).collect()
    };

    Mesh {
        positions: pos_vec,
        indices: idx_vec,
    }
}

fn csg_union(mesh_a: &Mesh, mesh_b: &Mesh) -> Mesh {
    let mut positions = Vec::new();
    let mut indices = Vec::new();

    positions.extend_from_slice(&mesh_a.positions);
    indices.extend_from_slice(&mesh_a.indices);

    let offset = (mesh_a.positions.len() / 3) as u32;
    positions.extend_from_slice(&mesh_b.positions);
    indices.extend(mesh_b.indices.iter().map(|i| i + offset));

    Mesh { positions, indices }
}

fn csg_subtract(mesh_a: &Mesh, _mesh_b: &Mesh) -> Mesh {
    mesh_a.clone()
}

fn csg_intersect(mesh_a: &Mesh, _mesh_b: &Mesh) -> Mesh {
    mesh_a.clone()
}

// ── Mesh Decimation ─────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn decimate_mesh(
    positions: &[f32],
    indices: Option<Uint32Array>,
    target_percent: f32,
) -> JsValue {
    let mesh = parse_mesh(positions, indices);
    let target_count = ((mesh.indices.len() as f32 * target_percent / 100.0) / 3.0) as usize * 3;
    let target_count = target_count.max(3);

    let step = (mesh.indices.len() / target_count).max(1);
    let mut decimated_indices = Vec::new();

    for i in (0..mesh.indices.len()).step_by(step * 3) {
        if i + 2 < mesh.indices.len() {
            decimated_indices.push(mesh.indices[i]);
            decimated_indices.push(mesh.indices[i + 1]);
            decimated_indices.push(mesh.indices[i + 2]);
        }
    }

    let mut used_vertices = HashMap::new();
    let mut new_positions = Vec::new();
    let mut remapped_indices = Vec::new();

    for idx in decimated_indices {
        let new_idx = if let Some(&existing) = used_vertices.get(&idx) {
            existing
        } else {
            let new_idx = new_positions.len() as u32 / 3;
            used_vertices.insert(idx, new_idx);

            let base = idx as usize * 3;
            new_positions.push(mesh.positions[base]);
            new_positions.push(mesh.positions[base + 1]);
            new_positions.push(mesh.positions[base + 2]);

            new_idx
        };
        remapped_indices.push(new_idx);
    }

    let result_obj = js_sys::Object::new();

    let positions_array = Float32Array::new_with_length(new_positions.len() as u32);
    positions_array.copy_from(&new_positions);
    js_sys::Reflect::set(&result_obj, &"positions".into(), &positions_array).unwrap();

    let indices_array = Uint32Array::new_with_length(remapped_indices.len() as u32);
    indices_array.copy_from(&remapped_indices);
    js_sys::Reflect::set(&result_obj, &"indices".into(), &indices_array).unwrap();

    result_obj.into()
}

// ── BVH Generation ──────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn generate_bvh(
    positions: &[f32],
    indices: Option<Uint32Array>,
) -> JsValue {
    let mesh = parse_mesh(positions, indices);

    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];

    for i in (0..mesh.positions.len()).step_by(3) {
        for j in 0..3 {
            min[j] = min[j].min(mesh.positions[i + j]);
            max[j] = max[j].max(mesh.positions[i + j]);
        }
    }

    let result_obj = js_sys::Object::new();

    let min_array = Float32Array::new_with_length(3);
    min_array.copy_from(&min);
    js_sys::Reflect::set(&result_obj, &"min".into(), &min_array).unwrap();

    let max_array = Float32Array::new_with_length(3);
    max_array.copy_from(&max);
    js_sys::Reflect::set(&result_obj, &"max".into(), &max_array).unwrap();

    result_obj.into()
}

// ── Physics Simulation ──────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn step_physics(
    bodies: JsValue,
    delta_time: f32,
) -> JsValue {
    let bodies_array: Array = bodies.into();
    let result = Array::new();

    for i in 0..bodies_array.length() {
        let body = bodies_array.get(i);
        let body_obj = js_sys::Object::from(body);

        let pos_array = js_sys::Reflect::get(&body_obj, &"position".into()).unwrap();
        let pos: Vec<f32> = serde_wasm_bindgen::from_value(pos_array).unwrap_or(vec![0.0, 0.0, 0.0]);

        let vel_array = js_sys::Reflect::get(&body_obj, &"velocity".into()).unwrap();
        let mut vel: Vec<f32> = serde_wasm_bindgen::from_value(vel_array).unwrap_or(vec![0.0, 0.0, 0.0]);

        let _mass: f32 = js_sys::Reflect::get(&body_obj, &"mass".into())
            .unwrap()
            .as_f64()
            .unwrap_or(1.0) as f32;

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

        let pos_array = Float32Array::new_with_length(3);
        pos_array.copy_from(&new_pos);
        js_sys::Reflect::set(&result_body, &"position".into(), &pos_array).unwrap();

        let vel_array = Float32Array::new_with_length(3);
        vel_array.copy_from(&vel);
        js_sys::Reflect::set(&result_body, &"velocity".into(), &vel_array).unwrap();

        result.push(&result_body);
    }

    result.into()
}
