/**
 * SceneIO - Scene save/load via JSON serialization.
 *
 * Provides three save formats:
 *   - JSON (round-trippable; the canonical "save file" format)
 *   - GLTF (delegates to Three.js GLTFExporter for portability)
 *   - localStorage (auto-save on every change; survives page reloads)
 *
 * The JSON format is versioned (currently v1) so future schema
 * changes can be migrated. The structure is intentionally human-
 * readable so users can hand-edit scene files.
 *
 * Schema (v1):
 *   {
 *     version: 1,
 *     generator: 'master-studio',
 *     timestamp: <unix ms>,
 *     scene: {
 *       background: '#1a1a1a',
 *       fog: { color, density, type } | null,
 *       environment: { intensity, backgroundIntensity } | null,
 *     },
 *     camera: {
 *       position: [x, y, z], target: [x, y, z],
 *       fov, near, far, type: 'perspective' | 'orthographic',
 *     },
 *     objects: [
 *       {
 *         id, name, uuid,
 *         type: 'mesh' | 'group' | 'lights' | 'water' | 'atmosphere',
 *         geometry: { kind: 'box' | 'sphere' | ..., params: {...} } | null,
 *         material: { color, roughness, metalness, opacity, transparent } | null,
 *         position: [x, y, z], rotation: [x, y, z], scale: [x, y, z],
 *         visible, castShadow, receiveShadow, userData: {...},
 *         children: [ ... recursive ... ],
 *       }
 *     ],
 *     lights: [ /* same shape as objects but type='lights' * / ],
 *     atmosphere: { fog: { color, density }, godRays: { intensity, ... } } | null,
 *   }
 *
 * Restoration: walks the JSON tree, recreates geometries + materials
 * + lights + fog + camera. Unknown object types are skipped with a
 * warn (forward-compatibility for new plugin objects).
 *
 * Non-breaking: this file is additive. It does not modify MasterApp,
 * any existing plugin, or any rendering code. MasterApp wires the
 * `scene:save` and `scene:load` window events to it.
 */
import * as THREE from 'three';
import { logger } from './Logger.js';

const SCHEMA_VERSION = 1;
const AUTOSAVE_KEY = 'master-studio:autosave';
const AUTOSAVE_INTERVAL_MS = 5000;

// ── Geometry snapshot helpers ────────────────────────────────────────────

/**
 * Snapshot a BufferGeometry into a JSON-friendly shape. Supports the
 * common Three.js built-in geometries (Box, Sphere, Cylinder, Cone,
 * Torus, Plane, Icosahedron, Capsule). Custom / procedural geometries
 * (e.g. Water's PlaneGeometry is custom) fall back to a "kind" tag
 * with no params — restore will recreate the primitive by kind name
 * using the default size.
 */
function snapshotGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'BoxGeometry') {
    const p = geometry.parameters;
    return { kind: 'box', width: p.width, height: p.height, depth: p.depth };
  }
  if (geometry.type === 'SphereGeometry') {
    const p = geometry.parameters;
    return { kind: 'sphere', radius: p.radius, widthSegments: p.widthSegments, heightSegments: p.heightSegments };
  }
  if (geometry.type === 'CylinderGeometry') {
    const p = geometry.parameters;
    return { kind: 'cylinder', radiusTop: p.radiusTop, radiusBottom: p.radiusBottom, height: p.height, radialSegments: p.radialSegments };
  }
  if (geometry.type === 'ConeGeometry') {
    const p = geometry.parameters;
    return { kind: 'cone', radius: p.radius, height: p.height, radialSegments: p.radialSegments };
  }
  if (geometry.type === 'TorusGeometry') {
    const p = geometry.parameters;
    return { kind: 'torus', radius: p.radius, tube: p.tube, radialSegments: p.radialSegments, tubularSegments: p.tubularSegments };
  }
  if (geometry.type === 'PlaneGeometry') {
    const p = geometry.parameters;
    return { kind: 'plane', width: p.width, height: p.height, widthSegments: p.widthSegments, heightSegments: p.heightSegments };
  }
  if (geometry.type === 'IcosahedronGeometry') {
    return { kind: 'icosphere', radius: geometry.parameters.radius, detail: geometry.parameters.detail };
  }
  if (geometry.type === 'CapsuleGeometry') {
    const p = geometry.parameters;
    return { kind: 'capsule', radius: p.radius, length: p.length, capSegments: p.capSegments, radialSegments: p.radialSegments };
  }
  // Unknown / custom geometry
  return { kind: 'unknown', originalType: geometry.type };
}

function restoreGeometry(snap) {
  if (!snap) return new THREE.BoxGeometry(1, 1, 1);
  switch (snap.kind) {
    case 'box':       return new THREE.BoxGeometry(snap.width, snap.height, snap.depth);
    case 'sphere':    return new THREE.SphereGeometry(snap.radius, snap.widthSegments, snap.heightSegments);
    case 'cylinder':  return new THREE.CylinderGeometry(snap.radiusTop, snap.radiusBottom, snap.height, snap.radialSegments);
    case 'cone':      return new THREE.ConeGeometry(snap.radius, snap.height, snap.radialSegments);
    case 'torus':     return new THREE.TorusGeometry(snap.radius, snap.tube, snap.radialSegments, snap.tubularSegments);
    case 'plane':     return new THREE.PlaneGeometry(snap.width, snap.height, snap.widthSegments, snap.heightSegments);
    case 'icosphere': return new THREE.IcosahedronGeometry(snap.radius, snap.detail || 0);
    case 'capsule':   return new THREE.CapsuleGeometry(snap.radius, snap.length, snap.capSegments, snap.radialSegments);
    default:          return new THREE.BoxGeometry(1, 1, 1); // safe fallback
  }
}

// ── Material snapshot helpers ────────────────────────────────────────────

function snapshotMaterial(material) {
  if (!material) return null;
  if (Array.isArray(material)) {
    return { multi: true, materials: material.map(snapshotMaterial) };
  }
  const out = {
    color: '#' + material.color.getHexString(),
    roughness: material.roughness,
    metalness: material.metalness,
    opacity: material.opacity,
    transparent: material.transparent,
    side: material.side,
    emissive: material.emissive ? '#' + material.emissive.getHexString() : null,
    emissiveIntensity: material.emissiveIntensity,
    wireframe: !!material.wireframe,
  };
  return out;
}

function restoreMaterial(snap) {
  if (!snap) return new THREE.MeshStandardMaterial({ color: 0xcccccc });
  if (snap.multi && Array.isArray(snap.materials)) {
    return snap.materials.map(restoreMaterial);
  }
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(snap.color || '#cccccc'),
    roughness: snap.roughness != null ? snap.roughness : 0.7,
    metalness: snap.metalness != null ? snap.metalness : 0.1,
  });
  if (snap.opacity != null) {
    mat.opacity = snap.opacity;
    mat.transparent = !!snap.transparent;
  }
  if (snap.side != null) mat.side = snap.side;
  if (snap.emissive) {
    mat.emissive = new THREE.Color(snap.emissive);
    mat.emissiveIntensity = snap.emissiveIntensity || 1;
  }
  if (snap.wireframe) mat.wireframe = true;
  return mat;
}

// ── Object snapshot / restore ────────────────────────────────────────────

function snapshotObject(obj) {
  const out = {
    id: obj.uuid,
    name: obj.name || null,
    type: obj.isLight ? 'light' : (obj.isGroup ? 'group' : (obj.isMesh ? 'mesh' : obj.type)),
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale:    [obj.scale.x, obj.scale.y, obj.scale.z],
    visible:  obj.visible,
    castShadow: !!obj.castShadow,
    receiveShadow: !!obj.receiveShadow,
    userData: { ...obj.userData },
  };
  // Strip Three.js's own userData keys (event listeners, refs) that
  // don't round-trip cleanly. We keep isManagedObject, isWater,
  // isGroup, composedBy, templateId, seed, palette, lightType.
  if (obj.isLight) {
    out.light = {
      kind: obj.isPointLight ? 'point' :
             obj.isDirectionalLight ? 'directional' :
             obj.isSpotLight ? 'spot' :
             obj.isHemisphereLight ? 'hemisphere' :
             obj.isAmbientLight ? 'ambient' : 'unknown',
      color: '#' + (obj.color ? obj.color.getHexString() : 'ffffff'),
      intensity: obj.intensity,
      distance: obj.distance,
    };
  } else if (obj.isMesh) {
    out.geometry = snapshotGeometry(obj.geometry);
    out.material = snapshotMaterial(obj.material);
  }
  if (obj.isGroup || obj.children.length > 0) {
    out.children = obj.children
      .filter(c => c !== obj)
      .map(snapshotObject);
  }
  return out;
}

function restoreObject(snap, parent) {
  let obj;
  if (snap.type === 'light' && snap.light) {
    const l = snap.light;
    let light;
    switch (l.kind) {
      case 'point':       light = new THREE.PointLight(new THREE.Color(l.color), l.intensity, l.distance || 50); break;
      case 'directional': light = new THREE.DirectionalLight(new THREE.Color(l.color), l.intensity); break;
      case 'spot':        light = new THREE.SpotLight(new THREE.Color(l.color), l.intensity); break;
      case 'hemisphere':  light = new THREE.HemisphereLight(new THREE.Color(l.color), 0x444444, l.intensity); break;
      case 'ambient':     light = new THREE.AmbientLight(new THREE.Color(l.color), l.intensity); break;
      default:            return null;
    }
    obj = light;
  } else if (snap.type === 'group') {
    obj = new THREE.Group();
  } else if (snap.geometry) {
    const geom = restoreGeometry(snap.geometry);
    const mat  = Array.isArray(snap.material)
      ? restoreMaterial(snap.material)
      : restoreMaterial(snap.material);
    obj = new THREE.Mesh(geom, mat);
  } else {
    return null;
  }
  obj.name = snap.name || obj.name;
  obj.position.set(snap.position[0], snap.position[1], snap.position[2]);
  obj.rotation.set(snap.rotation[0], snap.rotation[1], snap.rotation[2]);
  obj.scale.set(snap.scale[0], snap.scale[1], snap.scale[2]);
  obj.visible = snap.visible !== false;
  obj.castShadow = !!snap.castShadow;
  obj.receiveShadow = !!snap.receiveShadow;
  // Only restore a curated subset of userData — never event listeners
  // or internal references.
  const safeKeys = ['isManagedObject', 'isWater', 'isGroup', 'isLidarScan', 'isLidarHeightmap',
                    'composedBy', 'templateId', 'seed', 'palette', 'lightType', 'textContent', 'fontFamily'];
  for (const k of safeKeys) {
    if (snap.userData && k in snap.userData) obj.userData[k] = snap.userData[k];
  }
  // Ensure the standard flags are set even if missing from the snapshot.
  obj.userData.isManagedObject = true;
  parent.add(obj);
  if (Array.isArray(snap.children)) {
    for (const childSnap of snap.children) {
      restoreObject(childSnap, obj);
    }
  }
  return obj;
}

// ── Public API ────────────────────────────────────────────────────────────

export const SceneIO = {

  _stateManager: null,
  _autosaveTimer: null,
  _lastSavedAt: 0,

  init(state) {
    this._stateManager = state;
    this._setupEventListeners();
    this._setupAutosave(state);
    logger.log('SceneIO', 'Initialized (autosave every 5s)');
  },

  _setupEventListeners() {
    window.addEventListener('scene:save', (e) => {
      const format = (e.detail && e.detail.format) || 'json';
      this.saveToFile(format);
    });
    window.addEventListener('scene:load', (e) => {
      const file = e.detail && e.detail.file;
      if (file) this.loadFromFile(file);
    });
    window.addEventListener('scene:clear', () => {
      this.clearScene();
    });
  },

  _setupAutosave(state) {
    // Auto-save to localStorage every 5s while the page is open.
    // Cheap: just a JSON.stringify of the scene tree. The page
    // restore on load is a separate code path (see restoreAutosave).
    if (this._autosaveTimer) clearInterval(this._autosaveTimer);
    this._autosaveTimer = setInterval(() => {
      try {
        const scene = state && state.data && state.data.scene;
        if (!scene) return;
        const json = this.toJSON(scene);
        try {
          localStorage.setItem(AUTOSAVE_KEY, json);
          this._lastSavedAt = Date.now();
        } catch (quotaErr) {
          // localStorage quota exceeded (large scene). Silently skip.
        }
      } catch (err) {
        logger.warn('SceneIO', 'autosave failed:', err);
      }
    }, AUTOSAVE_INTERVAL_MS);
  },

  /**
   * Restore from localStorage on app start. Returns true if a saved
   * scene was found and loaded.
   */
  restoreAutosave(state) {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const json = JSON.parse(raw);
      const scene = state && state.data && state.data.scene;
      if (!scene) return false;
      this.fromJSON(json, scene, state);
      logger.log('SceneIO', `Restored autosave (${json.objects?.length || 0} top-level objects)`);
      return true;
    } catch (err) {
      logger.warn('SceneIO', 'autosave restore failed:', err);
      return false;
    }
  },

  /**
   * Snapshot the live scene into a JSON object.
   */
  toJSON(scene, camera) {
    if (!scene) return null;
    const out = {
      version: SCHEMA_VERSION,
      generator: 'master-studio',
      timestamp: Date.now(),
      scene: {
        background: scene.background ? '#' + (scene.background.getHexString ? scene.background.getHexString() : scene.background) : null,
        fog: scene.fog ? {
          color: '#' + scene.fog.color.getHexString(),
          density: scene.fog.density,
          type: scene.fog.isFogExp2 ? 'exp2' : 'linear',
        } : null,
        environment: scene.environment ? { intensity: scene.environmentIntensity || 1 } : null,
      },
      objects: [],
    };
    // Snapshot every managed object at the top level of the scene.
    // Lights are inlined as `type: 'light'`.
    scene.children.forEach(child => {
      if (child.userData && child.userData.isManagedObject) {
        out.objects.push(snapshotObject(child));
      } else if (child.isLight) {
        out.objects.push(snapshotObject(child));
      }
    });
    // Camera
    if (camera) {
      out.camera = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
        type: camera.isPerspectiveCamera ? 'perspective' : 'orthographic',
      };
    }
    return out;
  },

  /**
   * Restore a JSON snapshot into the live scene. The scene is NOT
   * cleared first — the caller can do that explicitly via
   * `clearScene()` if a fresh load is desired.
   */
  fromJSON(json, scene, state) {
    if (!json || !scene) return false;
    if (json.version !== SCHEMA_VERSION) {
      logger.warn('SceneIO', `Schema version mismatch: expected ${SCHEMA_VERSION}, got ${json.version}. Attempting best-effort load.`);
    }
    // Apply background
    if (json.scene && json.scene.background) {
      scene.background = new THREE.Color(json.scene.background);
    }
    // Apply fog
    if (json.scene && json.scene.fog) {
      const f = json.scene.fog;
      if (f.type === 'exp2') scene.fog = new THREE.FogExp2(new THREE.Color(f.color), f.density);
      else scene.fog = new THREE.Fog(new THREE.Color(f.color), 0, 100);
    } else if (json.scene && json.scene.fog === null) {
      scene.fog = null;
    }
    // Apply environment intensity
    if (json.scene && json.scene.environment && scene.environment) {
      scene.environmentIntensity = json.scene.environment.intensity;
    }
    // Apply camera
    if (json.camera && state && state.data && state.data.camera) {
      const cam = state.data.camera;
      cam.position.set(json.camera.position[0], json.camera.position[1], json.camera.position[2]);
      if (json.camera.fov && cam.isPerspectiveCamera) {
        cam.fov = json.camera.fov;
        cam.updateProjectionMatrix();
      }
    }
    // Apply objects
    if (Array.isArray(json.objects)) {
      for (const objSnap of json.objects) {
        try {
          restoreObject(objSnap, scene);
        } catch (err) {
          logger.warn('SceneIO', `Failed to restore object "${objSnap.name}":`, err);
        }
      }
    }
    if (state && state.emit) state.emit('scene:restored', { json });
    return true;
  },

  /**
   * Save the current scene to a file (triggers a download).
   */
  saveToFile(format = 'json') {
    const scene = this._stateManager && this._stateManager.data && this._stateManager.data.scene;
    const camera = this._stateManager && this._stateManager.data && this._stateManager.data.camera;
    if (!scene) return false;
    if (format === 'json') {
      const json = this.toJSON(scene, camera);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      this._triggerDownload(blob, `scene-${Date.now()}.json`);
      return true;
    }
    if (format === 'gltf') {
      // Defer GLTF export to a separate code path; it requires the
      // GLTFExporter from three/addons. We lazy-import on demand so
      // the bundle doesn't pay for it when only JSON is used.
      import('three/addons/exporters/GLTFExporter.js').then(({ GLTFExporter }) => {
        const exporter = new GLTFExporter();
        exporter.parse(scene, (gltf) => {
          const blob = new Blob([JSON.stringify(gltf)], { type: 'model/gltf+json' });
          this._triggerDownload(blob, `scene-${Date.now()}.gltf`);
        }, (err) => {
          logger.error('SceneIO', 'GLTF export failed:', err);
        });
      }).catch((err) => logger.error('SceneIO', 'GLTFExporter import failed:', err));
      return true;
    }
    return false;
  },

  /**
   * Load a scene from a file. Reads the file, parses JSON, restores.
   */
  async loadFromFile(file) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const scene = this._stateManager && this._stateManager.data && this._stateManager.data.scene;
      const state = this._stateManager;
      if (!scene) return false;
      const ok = this.fromJSON(json, scene, state);
      if (ok && state && state.emit) {
        state.emit('notification', {
          message: `Loaded scene "${file.name}" (${json.objects?.length || 0} objects)`,
          type: 'success',
        });
      }
      return ok;
    } catch (err) {
      logger.error('SceneIO', 'loadFromFile failed:', err);
      return false;
    }
  },

  /**
   * Remove every managed object from the scene.
   *
   * IMPORTANT: Lights are intentionally NOT removed. The reasoning:
   *   - Lights are tracked via `userData.isLightSource` (set by
   *     LightingPlugin), not `userData.isManagedObject`.
   *   - Removing lights would also drop the user's preset
   *     (studio/outdoor/night/dramatic), leaving them in a black
   *     scene — a common foot-gun.
   *   - Calling `applyPreset('studio')` after `clearScene()` is the
   *     intended way to "fully reset" a scene. We do this implicitly
   *     here by emitting `scene:cleared` so the LightingPlugin can
   *     re-apply its default preset (it listens for this event).
   *
   * If the user wants to clear lights too, they should call
   * `lighting.applyPreset('studio')` after `clearScene()` — that's
   * the intended way to "fully reset" a scene.
   */
  clearScene() {
    const state = this._stateManager;
    const scene = state && state.data && state.data.scene;
    if (!scene) return;
    const toRemove = [];
    scene.traverse((c) => {
      if (c === scene) return;
      if (c.userData && c.userData.isManagedObject) toRemove.push(c);
    });
    for (const c of toRemove) {
      if (c.parent) c.parent.remove(c);
      if (c.geometry) c.geometry.dispose && c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
        else c.material.dispose && c.material.dispose();
      }
    }
    if (state.emit) state.emit('scene:cleared');
  },

  _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
