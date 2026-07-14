/**
 * ProceduralPlugin - Procedural geometry generation.
 *
 * Generates terrain, noise-displaced meshes, and CSG boolean operations.
 * Heavy mesh math delegates to Rust Wasm via the bridge.
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const ProceduralPlugin = {
  name: 'ProceduralPlugin',

  init(state) {
    this._state = state;
    logger.log('ProceduralPlugin', 'Initialized');
  },

  /** Generate a subdivided plane with noise displacement */
  generateTerrain(width, depth, segments, heightFn) {
    const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      const y = heightFn(x, z);
      pos.setZ(i, y);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x448844, wireframe: false }));
    mesh.name = 'ProceduralTerrain';
    this._state.data.scene?.add(mesh);
    this._state.emit('geometry:generated', mesh);
    return mesh;
  },

  /** Apply simplex-like noise displacement to an existing mesh */
  noiseDisplace(mesh, amplitude = 1, frequency = 1) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * frequency;
      const y = pos.getY(i) * frequency;
      const z = pos.getZ(i) * frequency;
      // Simple sin-based noise as placeholder
      const offset = Math.sin(x * 3) * Math.cos(z * 3) * Math.sin(y * 2) * amplitude;
      pos.setX(i, pos.getX(i) + offset * 0.1);
      pos.setZ(i, pos.getZ(i) + offset * 0.1);
    }
    mesh.geometry.computeVertexNormals();
    mesh.geometry.attributes.position.needsUpdate = true;
    this._state.emit('geometry:displaced', mesh);
    return mesh;
  },

  /** Compute CSG boolean between two meshes (delegates to Rust Wasm) */
  computeBoolean(meshA, meshB, operation) {
    logger.log(`[ProceduralPlugin] CSG ${operation} on ${meshA?.name} + ${meshB?.name}`);
    // Handoff to Rust Wasm for heavy CSG math
    const result = window.RustGeometryBridge?.computeBoolean(meshA, meshB, operation);
    return result ?? meshA;
  },

  // ── Visual Nodes ──
  nodes: {
    'Geometry/NoiseDisplaceNode': (x, y) =>
      createNodeCard(x, y, 'Noise Displace', ['Mesh', 'Amplitude', 'Frequency'], ['Displaced Mesh']),

    'Geometry/BooleanCSGNode': (x, y) =>
      createNodeCard(x, y, 'Boolean CSG', ['Mesh A', 'Mesh B', 'Operation'], ['Result Mesh']),

    'Geometry/GeometryOutputNode': (x, y) =>
      createNodeCard(x, y, 'Geometry Output', ['Mesh'], []),
  }
};