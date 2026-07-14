/**
 * GameMapPlugin - Procedural world generation via map blending and tiling.
 * Integrates with mapmaker data to create seamless game worlds.
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';

export const GameMapPlugin = {
  name: 'GameMap',
  _state: null,
  _activeWorld: null,
  _mapCache: new Map(),

  init(state) {
    this._state = state;
    state.on('mapmaker:map:loaded', (mapData) => {
      this._cacheMap(mapData);
    });
  },

  update(deltaTime) {
    if (this._activeWorld) {
      this._updateWorldAnimations(deltaTime);
    }
  },

  async generateTiledWorld(mapConfigs, options = {}) {
    const {
      blendEdges = true,
      edgeBlendWidth = 2.0,
      autoLOD = true,
      collisionLayer = true
    } = options;

    const worldGroup = new THREE.Group();
    worldGroup.name = 'Generated_World';
    worldGroup.userData.isWorldMap = true;
    worldGroup.userData.isManagedObject = true;

    for (const config of mapConfigs) {
      const mapData = await this._loadMap(config.mapId);
      if (!mapData) continue;
      const segment = this._createMapSegment(mapData, config);
      worldGroup.add(segment);
    }

    if (blendEdges) {
      this._blendMapEdges(worldGroup, edgeBlendWidth);
    }

    if (collisionLayer) {
      const collisionMesh = this._generateCollisionLayer(worldGroup);
      collisionMesh.name = 'World_Collision';
      collisionMesh.userData.isCollisionLayer = true;
      collisionMesh.visible = false;
      worldGroup.add(collisionMesh);
    }

    if (autoLOD) {
      this._applyWorldLOD(worldGroup);
    }

    this._activeWorld = worldGroup;
    this._state.data.scene.add(worldGroup);
    this._state.emit('world:generated', { world: worldGroup });

    return worldGroup;
  },

  _blendMapEdges(worldGroup, blendWidth) {
    const segments = worldGroup.children.filter(c => c.userData.isMapSegment);

    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const segA = segments[i];
        const segB = segments[j];
        const dist = segA.position.distanceTo(segB.position);
        if (dist < blendWidth * 2) {
          this._createBlendZone(segA, segB, blendWidth);
        }
      }
    }
  },

  _createBlendZone(segA, segB, blendWidth) {
    const midpoint = segA.position.clone().lerp(segB.position, 0.5);

    const blendGeo = new THREE.PlaneGeometry(blendWidth * 2, 10, 32, 32);
    const blendMat = new THREE.MeshStandardMaterial({
      color: 0x808080,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });

    const blendMesh = new THREE.Mesh(blendGeo, blendMat);
    blendMesh.position.copy(midpoint);
    blendMesh.lookAt(segB.position);
    blendMesh.rotateX(-Math.PI / 2);
    blendMesh.userData.isBlendZone = true;

    this._deformBlendVertices(blendMesh, segA, segB, blendWidth);

    segA.parent.add(blendMesh);
  },

  _deformBlendVertices(blendMesh, segA, segB, blendWidth) {
    const positions = blendMesh.geometry.attributes.position.array;
    const segAHeight = segA.userData.heightmap;
    const segBHeight = segB.userData.heightmap;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const blendFactor = (x + blendWidth) / (blendWidth * 2);

      const heightA = this._sampleHeightmap(segAHeight, x, z);
      const heightB = this._sampleHeightmap(segBHeight, x, z);

      positions[i + 1] = THREE.MathUtils.lerp(heightA, heightB, blendFactor);
    }

    blendMesh.geometry.attributes.position.needsUpdate = true;
    blendMesh.geometry.computeVertexNormals();
  },

  _generateCollisionLayer(worldGroup) {
    const collisionGeo = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    worldGroup.traverse((child) => {
      if (child.isMesh && child.userData.isTerrain) {
        const geo = child.geometry;
        const pos = geo.attributes.position.array;
        const idx = geo.index ? geo.index.array : null;

        const offset = vertices.length / 3;

        for (let i = 0; i + 9 <= pos.length; i += 9) {
          vertices.push(pos[i], pos[i + 1], pos[i + 2]);
          vertices.push(pos[i + 3], pos[i + 4], pos[i + 5]);
          vertices.push(pos[i + 6], pos[i + 7], pos[i + 8]);
        }

        if (idx) {
          for (let i = 0; i < idx.length; i += 3) {
            indices.push(idx[i] + offset, idx[i + 1] + offset, idx[i + 2] + offset);
          }
        }
      }
    });

    collisionGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    if (indices.length > 0) {
      collisionGeo.setIndex(indices);
    }

    const collisionMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });

    return new THREE.Mesh(collisionGeo, collisionMat);
  },

  _applyWorldLOD(worldGroup) {
    worldGroup.traverse((child) => {
      if (child.isMesh && child.userData.isTerrain) {
        const lod = new THREE.LOD();

        lod.addLevel(child, 0);

        const medGeo = this._simplifyGeometry(child.geometry, 0.5);
        const medMesh = new THREE.Mesh(medGeo, child.material);
        lod.addLevel(medMesh, 50);

        const lowGeo = this._simplifyGeometry(child.geometry, 0.25);
        const lowMesh = new THREE.Mesh(lowGeo, child.material);
        lod.addLevel(lowMesh, 100);

        child.parent.add(lod);
        child.parent.remove(child);
      }
    });
  },

  _simplifyGeometry(geometry, factor) {
    const simplified = geometry.clone();
    const positions = simplified.attributes.position.array;
    const newPositions = [];

    const step = Math.floor(1 / factor);
    for (let i = 0; i < positions.length; i += step * 3) {
      newPositions.push(positions[i], positions[i + 1], positions[i + 2]);
    }

    simplified.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    simplified.computeVertexNormals();

    return simplified;
  },

  _cacheMap(mapData) {
    this._mapCache.set(mapData.id, mapData);
  },

  async _loadMap(mapId) {
    if (this._mapCache.has(mapId)) {
      return this._mapCache.get(mapId);
    }

    return new Promise((resolve) => {
      this._state.emit('mapmaker:map:request', { mapId, callback: resolve });
    });
  },

  _createMapSegment(mapData, config) {
    const { position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0 }, scale = { x: 1, y: 1, z: 1 } } = config;

    const size = mapData.size || 100;
    const segments = mapData.segments || 50;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    if (mapData.heightmap) {
      const positions = geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        positions[i + 2] = this._sampleHeightmap(mapData.heightmap, x, y);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    const material = new THREE.MeshStandardMaterial({
      color: mapData.color || 0x4a7c4e,
      roughness: 0.8,
      metalness: 0.2,
      flatShading: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.scale.set(scale.x, scale.y, scale.z);
    mesh.position.set(position.x, position.y, position.z);
    mesh.userData.isMapSegment = true;
    mesh.userData.isTerrain = true;
    mesh.userData.isManagedObject = true;
    mesh.userData.heightmap = mapData.heightmap;
    mesh.userData.mapId = mapData.id;

    return mesh;
  },

  _sampleHeightmap(heightmap, x, z) {
    if (!heightmap || !heightmap.data) return 0;

    const width = heightmap.width;
    const height = heightmap.height;

    const u = (x / width) + 0.5;
    const v = (z / height) + 0.5;

    const clampedU = Math.max(0, Math.min(1, u));
    const clampedV = Math.max(0, Math.min(1, v));

    const px = clampedU * (width - 1);
    const py = clampedV * (height - 1);

    const x0 = Math.floor(px);
    const x1 = Math.min(x0 + 1, width - 1);
    const y0 = Math.floor(py);
    const y1 = Math.min(y0 + 1, height - 1);

    const fx = px - x0;
    const fy = py - y0;

    const h00 = heightmap.data[y0 * width + x0];
    const h10 = heightmap.data[y0 * width + x1];
    const h01 = heightmap.data[y1 * width + x0];
    const h11 = heightmap.data[y1 * width + x1];

    const h0 = THREE.MathUtils.lerp(h00, h10, fx);
    const h1 = THREE.MathUtils.lerp(h01, h11, fx);

    return THREE.MathUtils.lerp(h0, h1, fy);
  },

  _updateWorldAnimations(deltaTime) {
    this._activeWorld.traverse((child) => {
      if (child.userData.isWater) {
        if (child.material.map) {
          child.material.map.offset.y += deltaTime * 0.05;
        }
      }
    });
  },

  // ── Visual Nodes ──
  nodes: {
    'GameMap/GenerateWorldNode': (x, y) =>
      createNodeCard(x, y, 'Generate Tiled World', ['Map Configs', 'Blend Width'], ['World Group']),

    'GameMap/HeightmapNode': (x, y) =>
      createNodeCard(x, y, 'Heightmap Generator', ['Width', 'Height', 'Scale', 'Seed'], ['Heightmap Data']),
  }
};
