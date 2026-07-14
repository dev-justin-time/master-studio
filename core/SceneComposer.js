/**
 * SceneComposer - Deterministic template-based scene builder.
 *
 * Renders a "plan" (a JSON-serializable scene description) into a live
 * Three.js scene by calling existing plugins' public methods. The
 * composer is INTENTIONALLY stateless beyond its template library and
 * PRNG cache: it never owns a reference to the scene/camera after a
 * compose() call returns. This keeps it composable, testable, and
 * safe to call from anywhere (node-graph on-demand, AI expert,
 * window event).
 *
 * Public API:
 *   listTemplates() -> [{ id, name, description, category, densityRange }]
 *   getTemplate(id) -> Template | null
 *   compose(plan, state) -> THREE.Group
 *     - plan = { template, density, seed, palette?, overrides? }
 *     - state = the MasterState instance
 *     - returns a THREE.Group containing every spawned object; the
 *       caller (plugin) is responsible for adding it to the scene.
 *
 *   derivePlanFromPrompt(prompt, options) -> Plan
 *     - Heuristic keyword match against the 7 templates. No LLM
 *       dependency. Falls back to the closest template by tag overlap,
 *       then to "naturalForest" as the safe default.
 *
 * Plan schema (v1):
 *   {
 *     template:   string   (template id; required)
 *     density:    number   (0-1; multiplier on per-template base counts)
 *     seed:       number   (32-bit int; deterministic PRNG seed)
 *     palette?:   string   (palette id; random if omitted)
 *     overrides?: { [fieldPath]: any }   (e.g. { 'lights.directional.color': '#ffaa00' })
 *   }
 *
 * Per-template structure (see BUILTIN_TEMPLATES):
 *   {
 *     id, name, description, category,
 *     densityRange: [min, max],   // the range the density slider maps to
 *     baseCount:  number,         // the "100% density" object count
 *     palettes:   [paletteIds],   // available palettes
 *     sections:   { terrain?, water?, buildings[], foliage[], lights[], decor[], fog?, skybox? }
 *   }
 *
 * Composition order (matters — later sections can reference earlier ones):
 *   1. terrain     — PlaneGeometry + heightmap (deterministic noise)
 *   2. water       — WaterPlugin.createWaterSurface (if requested)
 *   3. fog         — AtmospherePlugin.setVolumetricFog
 *   4. lights      — LightingPlugin.addLight per spec
 *   5. buildings   — primitive meshes
 *   6. foliage     — primitive meshes (trees, rocks)
 *   7. decor       — extra primitives (props, signage)
 *   8. skybox      — LightingPlugin.applyPreset (or scene.background)
 *   9. camera      — LightingPlugin.setCameraView (final)
 */
import * as THREE from 'three';
import { logger } from './Logger.js';

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────
// Deterministic + tiny. 32-bit seed → 32-bit output. Identical output
// across browsers/engines so a (template, seed) pair always yields the
// same jitter pattern — shareable "preset URLs" are possible later.
function mulberry32(seed) {
  let a = (seed | 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Palettes (curated 5-color sets) ───────────────────────────────────────
// Hex strings; consumed by colorFromPalette() which returns a THREE.Color.
// Each palette is named + tagged so the LLM / template engine can pick.
const PALETTES = {
  forest_autumn: ['#3d2817', '#8b4513', '#cd853f', '#d2691e', '#fff8dc'],
  forest_spring: ['#2d4a2b', '#4a7c59', '#7fb069', '#c5e1a5', '#f0f7e8'],
  desert_sunset: ['#2c1810', '#8b4513', '#cd853f', '#daa520', '#ff7f50'],
  desert_noon:   ['#3a2817', '#a0826d', '#c19a6b', '#deb887', '#f5deb3'],
  cyber_neon:    ['#0a0a1f', '#1e0a3c', '#7b2cbf', '#00ffff', '#ff006e'],
  cyber_punk:    ['#1a0a0a', '#660708', '#a4161a', '#f5cb5c', '#dad7cd'],
  arctic_dawn:   ['#0c1a2c', '#1e3a5f', '#5e7c99', '#c5d8e8', '#f0f8ff'],
  space_station: ['#000000', '#1a1a2e', '#16213e', '#0f3460', '#e94560'],
  underwater:    ['#001a2c', '#003d5c', '#00838f', '#4fb3bf', '#b2ebf2'],
  studio_neutral:['#1a1a1a', '#3a3a3a', '#6a6a6a', '#a0a0a0', '#ffffff'],
};

// ── Per-template "geometry primitives" library ───────────────────────────
// Each section is an array of factories: fn(plan, rng) -> [mesh, mesh, ...]
// Factories close over the plan + RNG so they're deterministic per call.
// The list of supported primitive types matches the toolbar in scene.html
// (cube / sphere / cylinder / cone / torus / plane / icosphere / capsule).

function makePrimitive(type, opts) {
  let geo;
  switch (type) {
    case 'cube':     geo = new THREE.BoxGeometry(opts.w || 1, opts.h || 1, opts.d || 1); break;
    case 'sphere':   geo = new THREE.SphereGeometry(opts.r || 0.5, opts.seg || 16, opts.seg || 12); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(opts.r || 0.5, opts.r || 0.5, opts.h || 1, opts.seg || 16); break;
    case 'cone':     geo = new THREE.ConeGeometry(opts.r || 0.5, opts.h || 1, opts.seg || 16); break;
    case 'torus':    geo = new THREE.TorusGeometry(opts.r || 0.5, opts.tube || 0.15, 8, 24); break;
    case 'plane':    geo = new THREE.PlaneGeometry(opts.w || 1, opts.h || 1, 1, 1); break;
    case 'icosphere':geo = new THREE.IcosahedronGeometry(opts.r || 0.5, 0); break;
    case 'capsule':  geo = new THREE.CapsuleGeometry(opts.r || 0.3, opts.h || 0.5, 4, 8); break;
    default:         geo = new THREE.BoxGeometry(1, 1, 1);
  }
  return geo;
}

function makeMaterial(hex, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex || '#888888'),
    roughness: opts.roughness != null ? opts.roughness : 0.7,
    metalness: opts.metalness != null ? opts.metalness : 0.1,
  });
}

function colorFromPalette(plan, rng, role = 'primary') {
  const palette = PALETTES[plan.palette] || PALETTES.studio_neutral;
  // 5 roles: 0=background, 1=primary, 2=secondary, 3=accent, 4=highlight
  const idx = { background: 0, primary: 1, secondary: 2, accent: 3, highlight: 4 }[role] ?? 1;
  // Slight jitter so the same role in two objects isn't byte-identical.
  const jitter = Math.floor(rng() * 2);
  return palette[Math.min(palette.length - 1, idx + jitter)];
}

// ── Built-in templates ───────────────────────────────────────────────────
// Each is a self-contained function of (plan, rng, state) that adds
// objects directly to a Group. They DO NOT add the group to the scene
// — that's the caller's job (so the composer can return the group
// before the scene knows about it).

const TEMPLATES = {

  // ── 1. MEDIEVAL VILLAGE ────────────────────────────────────────────────
  medievalVillage: {
    id: 'medievalVillage',
    name: 'Medieval Village',
    description: 'A small cluster of stone-and-wood cottages around a village square, lit by warm torches at dusk.',
    category: 'settlement',
    densityRange: [0.4, 1.0],
    baseCount: 30,
    palettes: ['forest_autumn', 'desert_sunset'],
    sections: {
      terrain: { size: 60, segments: 40, amplitude: 0.4, color: '#5a7843' },
      water: { width: 24, height: 18, segments: 64, waterColor: '#1a3a2a' },
      buildings: [
        // 5-7 cottages distributed on a rough ring around the village center
        { type: 'ring', count: 6, radius: 9, jitter: 1.5, primitive: 'cottage' },
        // 1 chapel in the center (slightly larger)
        { type: 'single', position: [0, 0, 0], primitive: 'chapel' },
      ],
      foliage: [
        { type: 'scatter', count: 12, radius: 18, primitive: 'tree_pine' },
      ],
      lights: [
        { type: 'directional', options: { color: '#ffaa66', intensity: 1.4, position: [12, 18, 8], castShadow: true, shadowMapSize: 2048 } },
        { type: 'hemisphere', options: { color: '#ff8855', groundColor: '#3a2818', intensity: 0.4 } },
        { type: 'point', options: { color: '#ffaa44', intensity: 0.6, position: [0, 3, 0], distance: 12 } },
      ],
      fog: { preset: 'dusk' },
      godRays: { preset: 'subtle' },
    },
  },

  // ── 2. CYBERPUNK CITY ──────────────────────────────────────────────────
  cyberpunkCity: {
    id: 'cyberpunkCity',
    name: 'Cyberpunk City',
    description: 'A neon-lit street of tall angular buildings under a magenta sky. Holographic billboards flicker overhead.',
    category: 'urban',
    densityRange: [0.5, 1.0],
    baseCount: 40,
    palettes: ['cyber_neon', 'cyber_punk'],
    sections: {
      terrain: { size: 80, segments: 20, amplitude: 0, color: '#0a0a1f' },
      buildings: [
        // Two rows of buildings flanking a "street"
        { type: 'row', count: 10, length: 36, side: 1, primitive: 'skyscraper' },
        { type: 'row', count: 10, length: 36, side: -1, primitive: 'skyscraper' },
        // A few shorter buildings in the back
        { type: 'scatter', count: 6, area: [[-18, -18], [18, 18]], primitive: 'block' },
      ],
      decor: [
        // Holographic billboards: emissive planes
        { type: 'scatter', count: 5, area: [[-15, 6, -15], [15, 12, 15]], primitive: 'billboard' },
      ],
      lights: [
        { type: 'directional', options: { color: '#ff44aa', intensity: 0.3, position: [-20, 25, 10], castShadow: false } },
        { type: 'hemisphere', options: { color: '#3300ff', groundColor: '#0a002a', intensity: 0.6 } },
        // Colorful point lights for "neon signs"
        { type: 'point', options: { color: '#00ffff', intensity: 1.5, position: [-8, 4, 0], distance: 15 } },
        { type: 'point', options: { color: '#ff006e', intensity: 1.5, position: [8, 4, 5], distance: 15 } },
        { type: 'point', options: { color: '#7b2cbf', intensity: 1.0, position: [0, 4, -8], distance: 15 } },
      ],
      fog: { preset: 'spooky' },
    },
  },

  // ── 3. NATURAL FOREST ──────────────────────────────────────────────────
  naturalForest: {
    id: 'naturalForest',
    name: 'Natural Forest',
    description: 'A peaceful deciduous forest with a clearing, scattered rocks, and a small stream. Afternoon light filters through the canopy.',
    category: 'nature',
    densityRange: [0.3, 1.0],
    baseCount: 50,
    palettes: ['forest_spring', 'forest_autumn'],
    sections: {
      terrain: { size: 70, segments: 50, amplitude: 0.6, color: '#4a6b3a' },
      water: { width: 6, height: 20, segments: 32, waterColor: '#3a5a4a' },
      foliage: [
        { type: 'scatter', count: 35, area: [[-30, -30], [30, 30]], primitive: 'tree_deciduous' },
        { type: 'scatter', count: 8, area: [[-30, -30], [30, 30]], primitive: 'rock' },
        { type: 'scatter', count: 15, area: [[-30, -30], [30, 30]], primitive: 'bush' },
      ],
      lights: [
        { type: 'directional', options: { color: '#fff5d0', intensity: 1.6, position: [15, 25, 10], castShadow: true, shadowMapSize: 2048 } },
        { type: 'hemisphere', options: { color: '#a8d8a0', groundColor: '#3a5a2a', intensity: 0.7 } },
      ],
      fog: { preset: 'arctic' },
    },
  },

  // ── 4. ABSTRACT SCULPTURE ──────────────────────────────────────────────
  abstractSculpture: {
    id: 'abstractSculpture',
    name: 'Abstract Sculpture',
    description: 'A floating cluster of geometric primitives orbiting a central glowing core. Minimal, gallery-style.',
    category: 'art',
    densityRange: [0.4, 1.0],
    baseCount: 25,
    palettes: ['studio_neutral'],
    sections: {
      buildings: [
        { type: 'orbit', count: 20, radius: 6, primitive: 'abstract_shape' },
        { type: 'single', position: [0, 0, 0], primitive: 'core_orb' },
      ],
      lights: [
        { type: 'point', options: { color: '#ffffff', intensity: 2.5, position: [0, 0, 0], distance: 20 } },
        { type: 'directional', options: { color: '#ffffff', intensity: 0.4, position: [5, 10, 5], castShadow: true } },
        { type: 'hemisphere', options: { color: '#dddddd', groundColor: '#1a1a1a', intensity: 0.5 } },
      ],
      fog: { preset: 'dusk' },
      godRays: { preset: 'off' },
    },
  },

  // ── 5. SPACE STATION ───────────────────────────────────────────────────
  spaceStation: {
    id: 'spaceStation',
    name: 'Space Station',
    description: 'A modular space station with a central hub, ring habitats, and antenna arrays. Deep-space backdrop.',
    category: 'sci-fi',
    densityRange: [0.5, 1.0],
    baseCount: 20,
    palettes: ['space_station', 'studio_neutral'],
    sections: {
      buildings: [
        { type: 'single', position: [0, 0, 0], primitive: 'station_hub' },
        { type: 'ring', count: 8, radius: 8, primitive: 'habitat_module' },
        { type: 'scatter', count: 6, area: [[-4, -4, -4], [4, 4, 4]], primitive: 'antenna' },
      ],
      decor: [
        // Antenna lights (blinking)
        { type: 'scatter', count: 4, area: [[-3, 5, -3], [3, 7, 3]], primitive: 'beacon' },
      ],
      lights: [
        { type: 'ambient', options: { color: '#222244', intensity: 0.4 } },
        { type: 'point', options: { color: '#ffffff', intensity: 1.2, position: [0, 0, 0], distance: 30 } },
        { type: 'point', options: { color: '#ff4444', intensity: 0.8, position: [8, 0, 0], distance: 8 } },
        { type: 'point', options: { color: '#44ff44', intensity: 0.8, position: [-8, 0, 0], distance: 8 } },
        { type: 'point', options: { color: '#4444ff', intensity: 0.8, position: [0, 0, 8], distance: 8 } },
      ],
    },
  },

  // ── 6. DESERT OASIS ────────────────────────────────────────────────────
  desertOasis: {
    id: 'desertOasis',
    name: 'Desert Oasis',
    description: 'Sand dunes surrounding a small spring with palm trees. Harsh midday sun, distant haze.',
    category: 'nature',
    densityRange: [0.3, 0.9],
    baseCount: 25,
    palettes: ['desert_noon', 'desert_sunset'],
    sections: {
      terrain: { size: 80, segments: 60, amplitude: 1.2, color: '#d2b48c' },
      water: { width: 12, height: 10, segments: 48, waterColor: '#2a6a5a' },
      foliage: [
        { type: 'ring', count: 8, radius: 5, primitive: 'palm_tree' },
        { type: 'scatter', count: 4, area: [[-25, -25], [25, 25]], primitive: 'cactus' },
      ],
      lights: [
        { type: 'directional', options: { color: '#fff4d0', intensity: 2.0, position: [10, 25, 10], castShadow: true, shadowMapSize: 4096 } },
        { type: 'hemisphere', options: { color: '#e0c8a0', groundColor: '#a08060', intensity: 0.5 } },
      ],
      fog: { preset: 'dusk' },
    },
  },

  // ── 7. UNDERSEA CORAL ──────────────────────────────────────────────────
  underseaCoral: {
    id: 'underseaCoral',
    name: 'Undersea Coral',
    description: 'A coral reef seen from below the surface. Sunlight dapples through turquoise water. Schools of fish are implied via particle points.',
    category: 'underwater',
    densityRange: [0.4, 1.0],
    baseCount: 30,
    palettes: ['underwater'],
    sections: {
      terrain: { size: 60, segments: 40, amplitude: 0.5, color: '#c2a878' },
      foliage: [
        { type: 'scatter', count: 15, area: [[-25, -25], [25, 25]], primitive: 'coral' },
        { type: 'scatter', count: 10, area: [[-20, -20], [20, 20]], primitive: 'seaweed' },
      ],
      decor: [
        { type: 'scatter', count: 30, area: [[-20, 0, -20], [20, 6, 20]], primitive: 'fish_school' },
      ],
      lights: [
        { type: 'directional', options: { color: '#80e0ff', intensity: 0.6, position: [0, 30, 0], castShadow: false } },
        { type: 'hemisphere', options: { color: '#4fb3bf', groundColor: '#003d5c', intensity: 0.5 } },
      ],
      fog: { preset: 'spooky' },
    },
  },
};

// ── Primitive factories used by templates ─────────────────────────────────

const PRIMITIVES = {
  cottage: (rng, palette) => {
    const meshes = [];
    // Box body
    const w = 1.5 + rng() * 0.8, h = 1.2 + rng() * 0.4, d = 1.5 + rng() * 0.8;
    meshes.push(new THREE.Mesh(
      makePrimitive('cube', { w, h, d }),
      makeMaterial(colorFromPalette({ palette }, rng, 'secondary'), { roughness: 0.9 })
    ));
    // Pyramid roof
    meshes.push(new THREE.Mesh(
      makePrimitive('cone', { r: Math.max(w, d) * 0.75, h: 0.8, seg: 4 }),
      makeMaterial(colorFromPalette({ palette }, rng, 'accent'), { roughness: 0.85 })
    ));
    // Door
    meshes.push(new THREE.Mesh(
      makePrimitive('cube', { w: 0.3, h: 0.6, d: 0.05 }),
      makeMaterial(colorFromPalette({ palette }, rng, 'primary'))
    ));
    // Translate roof to top + door to front
    meshes[1].position.y = h / 2 + 0.4;
    meshes[2].position.set(0, -h / 4, d / 2 + 0.03);
    return meshes;
  },

  chapel: (rng, palette) => {
    const meshes = [];
    const w = 3, h = 1.5, d = 5;
    meshes.push(new THREE.Mesh(makePrimitive('cube', { w, h, d }), makeMaterial('#888888')));
    meshes.push(new THREE.Mesh(makePrimitive('cone', { r: 1.5, h: 1.2, seg: 4 }), makeMaterial('#6a6a6a')));
    // Bell tower
    meshes.push(new THREE.Mesh(makePrimitive('cube', { w: 0.8, h: 1.0, d: 0.8 }), makeMaterial('#888888')));
    meshes[1].position.y = h / 2 + 0.6;
    meshes[2].position.set(0, h / 2 + 1.5, 0);
    return meshes;
  },

  tree_pine: (rng, palette) => {
    const meshes = [];
    const trunk = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.15, h: 0.8, seg: 8 }),
      makeMaterial('#3a2818', { roughness: 0.95 })
    );
    trunk.position.y = 0.4;
    meshes.push(trunk);
    const foliage = new THREE.Mesh(
      makePrimitive('cone', { r: 0.6, h: 2.2, seg: 8 }),
      makeMaterial(colorFromPalette({ palette }, rng, 'primary'), { roughness: 0.95 })
    );
    foliage.position.y = 1.6;
    meshes.push(foliage);
    return meshes;
  },

  tree_deciduous: (rng, palette) => {
    const meshes = [];
    const trunk = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.2, h: 1.0, seg: 8 }),
      makeMaterial('#3a2818', { roughness: 0.95 })
    );
    trunk.position.y = 0.5;
    meshes.push(trunk);
    const canopy = new THREE.Mesh(
      makePrimitive('icosphere', { r: 0.9 + rng() * 0.3 }),
      makeMaterial(colorFromPalette({ palette }, rng, 'primary'), { roughness: 0.9 })
    );
    canopy.position.y = 1.5;
    meshes.push(canopy);
    return meshes;
  },

  bush: (rng, palette) => {
    const mesh = new THREE.Mesh(
      makePrimitive('icosphere', { r: 0.4 + rng() * 0.2 }),
      makeMaterial(colorFromPalette({ palette }, rng, 'secondary'), { roughness: 0.9 })
    );
    mesh.scale.y = 0.6;
    return [mesh];
  },

  rock: (rng) => {
    const mesh = new THREE.Mesh(
      makePrimitive('icosphere', { r: 0.5 + rng() * 0.8 }),
      makeMaterial('#6a6a6a', { roughness: 0.95 })
    );
    mesh.scale.set(1 + rng() * 0.5, 0.4 + rng() * 0.3, 1 + rng() * 0.5);
    return [mesh];
  },

  palm_tree: (rng) => {
    const meshes = [];
    const trunk = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.12, h: 2.5, seg: 8 }),
      makeMaterial('#5a3a20', { roughness: 0.95 })
    );
    trunk.position.y = 1.25;
    meshes.push(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(
        makePrimitive('icosphere', { r: 0.4 + rng() * 0.2 }),
        makeMaterial('#3a7a2a', { roughness: 0.85 })
      );
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.5, 2.5, Math.sin(a) * 0.5);
      leaf.scale.set(2, 0.2, 0.4);
      meshes.push(leaf);
    }
    return meshes;
  },

  cactus: (rng) => {
    const meshes = [];
    const body = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.3, h: 1.5 + rng() * 0.5, seg: 8 }),
      makeMaterial('#4a7a3a', { roughness: 0.9 })
    );
    body.position.y = 0.75;
    meshes.push(body);
    // Side arm
    const arm = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.15, h: 0.6, seg: 8 }),
      makeMaterial('#4a7a3a', { roughness: 0.9 })
    );
    arm.position.set(0.3, 1.0, 0);
    arm.rotation.z = -Math.PI / 3;
    meshes.push(arm);
    return meshes;
  },

  coral: (rng, palette) => {
    const meshes = [];
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const stem = new THREE.Mesh(
        makePrimitive('cylinder', { r: 0.05, h: 0.8 + rng() * 0.8, seg: 6 }),
        makeMaterial(colorFromPalette({ palette }, rng, 'primary'), { roughness: 0.7 })
      );
      stem.position.set((rng() - 0.5) * 0.3, stem.geometry.parameters.height / 2, (rng() - 0.5) * 0.3);
      meshes.push(stem);
      const top = new THREE.Mesh(
        makePrimitive('icosphere', { r: 0.15 + rng() * 0.15 }),
        makeMaterial(colorFromPalette({ palette }, rng, 'highlight'), { roughness: 0.6 })
      );
      top.position.set(stem.position.x, stem.geometry.parameters.height + 0.1, stem.position.z);
      meshes.push(top);
    }
    return meshes;
  },

  seaweed: (rng) => {
    const mesh = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.04, h: 1.5 + rng() * 1.0, seg: 5 }),
      makeMaterial('#2a8a4a', { roughness: 0.9 })
    );
    mesh.position.y = mesh.geometry.parameters.height / 2;
    mesh.rotation.z = (rng() - 0.5) * 0.3;
    return [mesh];
  },

  fish_school: (rng) => {
    // A few small icospheres = fish (loose)
    const meshes = [];
    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const fish = new THREE.Mesh(
        makePrimitive('icosphere', { r: 0.08 + rng() * 0.04 }),
        makeMaterial('#5a8acc', { metalness: 0.5, roughness: 0.4 })
      );
      fish.position.set((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
      fish.scale.set(1.5, 0.6, 0.5);
      meshes.push(fish);
    }
    return meshes;
  },

  skyscraper: (rng, palette) => {
    const w = 2 + rng() * 1.5, h = 8 + rng() * 10, d = 2 + rng() * 1.5;
    const body = new THREE.Mesh(
      makePrimitive('cube', { w, h, d }),
      makeMaterial(colorFromPalette({ palette }, rng, 'secondary'), { roughness: 0.4, metalness: 0.6 })
    );
    body.position.y = h / 2;
    // Emissive "windows" (small box on front face)
    const windows = new THREE.Mesh(
      makePrimitive('cube', { w: w * 0.6, h: h * 0.7, d: 0.05 }),
      new THREE.MeshStandardMaterial({
        color: colorFromPalette({ palette }, rng, 'accent'),
        emissive: new THREE.Color(colorFromPalette({ palette }, rng, 'accent')),
        emissiveIntensity: 0.4,
      })
    );
    windows.position.set(0, h * 0.5, d / 2 + 0.03);
    return [body, windows];
  },

  block: (rng, palette) => {
    const w = 1.5 + rng() * 2, h = 2 + rng() * 4, d = 1.5 + rng() * 2;
    const mesh = new THREE.Mesh(
      makePrimitive('cube', { w, h, d }),
      makeMaterial(colorFromPalette({ palette }, rng, 'secondary'), { roughness: 0.5, metalness: 0.3 })
    );
    mesh.position.y = h / 2;
    return [mesh];
  },

  billboard: (rng, palette) => {
    const mesh = new THREE.Mesh(
      makePrimitive('plane', { w: 2, h: 1.2 }),
      new THREE.MeshStandardMaterial({
        color: colorFromPalette({ palette }, rng, 'highlight'),
        emissive: new THREE.Color(colorFromPalette({ palette }, rng, 'highlight')),
        emissiveIntensity: 1.0,
        side: THREE.DoubleSide,
      })
    );
    return [mesh];
  },

  abstract_shape: (rng, palette) => {
    const types = ['icosphere', 'torus', 'cube', 'sphere', 'cylinder'];
    const t = types[Math.floor(rng() * types.length)];
    const mesh = new THREE.Mesh(
      makePrimitive(t, { r: 0.3 + rng() * 0.4, w: 0.5, h: 0.5, d: 0.5, seg: 12 }),
      makeMaterial(colorFromPalette({ palette }, rng, rng() > 0.5 ? 'accent' : 'highlight'), {
        roughness: 0.2, metalness: 0.8,
      })
    );
    return [mesh];
  },

  core_orb: () => {
    const mesh = new THREE.Mesh(
      makePrimitive('sphere', { r: 1.2, seg: 32 }),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.8,
        roughness: 0.1, metalness: 0.9,
      })
    );
    return [mesh];
  },

  station_hub: (rng) => {
    const meshes = [];
    const body = new THREE.Mesh(
      makePrimitive('cylinder', { r: 2, h: 1.5, seg: 16 }),
      makeMaterial('#4a4a55', { roughness: 0.6, metalness: 0.4 })
    );
    body.position.y = 0.75;
    meshes.push(body);
    // Top antenna
    const antenna = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.1, h: 2, seg: 6 }),
      makeMaterial('#888899', { metalness: 0.7 })
    );
    antenna.position.y = 2.5;
    meshes.push(antenna);
    return meshes;
  },

  habitat_module: (rng) => {
    const mesh = new THREE.Mesh(
      makePrimitive('sphere', { r: 0.6, seg: 16 }),
      makeMaterial('#5a5a66', { roughness: 0.5, metalness: 0.5 })
    );
    mesh.scale.set(1.2, 0.8, 1.2);
    return [mesh];
  },

  antenna: (rng) => {
    const mesh = new THREE.Mesh(
      makePrimitive('cylinder', { r: 0.04, h: 1.5 + rng() * 1.5, seg: 5 }),
      makeMaterial('#888899', { metalness: 0.7 })
    );
    mesh.position.y = mesh.geometry.parameters.height / 2;
    return [mesh];
  },

  beacon: () => {
    const mesh = new THREE.Mesh(
      makePrimitive('sphere', { r: 0.1, seg: 8 }),
      new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 2,
      })
    );
    return [mesh];
  },
};

// ── Heightmap generator (deterministic) ───────────────────────────────────
// Simple FBM noise via summed octaves. Cheap + good enough for terrain
// massing. Returns Float32Array of size (segments+1)^2.
function generateHeightmap(size, segments, amplitude, seed) {
  const rng = mulberry32(seed);
  const N = segments + 1;
  const data = new Float32Array(N * N);
  // 3 octaves of value noise
  const octaves = [
    { freq: 1.0, amp: 1.0 },
    { freq: 2.3, amp: 0.5 },
    { freq: 5.1, amp: 0.25 },
  ];
  // Pre-compute random gradient offsets per octave
  const grads = octaves.map(() => rng);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      let h = 0;
      for (let o = 0; o < octaves.length; o++) {
        const freq = octaves[o].freq;
        const u = (x / N) * freq;
        const v = (z / N) * freq;
        // Bilinear sample of a noise field
        const u0 = Math.floor(u), v0 = Math.floor(v);
        const fu = u - u0, fv = v - v0;
        const h00 = grads[o]() * Math.sin(u0 * 7.3 + v0 * 11.7);
        const h10 = grads[o]() * Math.sin((u0 + 1) * 7.3 + v0 * 11.7);
        const h01 = grads[o]() * Math.sin(u0 * 7.3 + (v0 + 1) * 11.7);
        const h11 = grads[o]() * Math.sin((u0 + 1) * 7.3 + (v0 + 1) * 11.7);
        const h0 = h00 * (1 - fu) + h10 * fu;
        const h1 = h01 * (1 - fu) + h11 * fu;
        h += octaves[o].amp * (h0 * (1 - fv) + h1 * fv);
      }
      data[z * N + x] = h * amplitude;
    }
  }
  return { width: N, height: N, data };
}

// ── Section executors ─────────────────────────────────────────────────────
// Each takes the section spec, the plan, the rng, the group being built,
// and the state, and adds the appropriate Three.js objects to the group.

function execTerrain(spec, plan, rng, group, state) {
  if (!spec) return;
  const heightmap = generateHeightmap(spec.size, spec.segments, spec.amplitude, plan.seed);
  // Use GameMapPlugin's _cacheMap + generateTiledWorld flow if available;
  // otherwise build a simple PlaneGeometry directly.
  const gameMap = state.data.pluginManager?._plugins?.get?.('GameMap');
  if (gameMap) {
    const mapId = `composer_terrain_${plan.seed}`;
    gameMap._cacheMap({
      id: mapId,
      size: spec.size,
      segments: spec.segments,
      color: new THREE.Color(spec.color).getHex(),
      heightmap,
    });
    gameMap.generateTiledWorld([{
      mapId,
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }], { blendEdges: false, autoLOD: false, collisionLayer: false }).then(world => {
      // The GameMap plugin attaches the world to the scene. We don't
      // want it in the scene twice, so we remove it from the scene
      // and add its children to our group instead.
      if (world && world.parent) world.parent.remove(world);
      if (world) {
        world.traverse((c) => { if (c.isMesh) c.userData.isManagedObject = true; });
        group.add(world);
      }
    });
    return;
  }
  // Fallback: direct PlaneGeometry
  const geo = new THREE.PlaneGeometry(spec.size, spec.size, spec.segments, spec.segments);
  const pos = geo.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    const x = Math.floor((i / 3) % (spec.segments + 1));
    const z = Math.floor((i / 3) / (spec.segments + 1));
    pos[i + 2] = heightmap.data[z * (spec.segments + 1) + x];
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.isManagedObject = true;
  group.add(mesh);
}

function execWater(spec, plan, rng, group, state) {
  if (!spec) return;
  const water = state.data.pluginManager?._plugins?.get?.('Water');
  if (!water) {
    logger.warn('SceneComposer', 'WaterPlugin not registered — skipping water section');
    return;
  }
  const result = water.createWaterSurface({
    width: spec.width,
    height: spec.height,
    segments: spec.segments,
    waterColor: new THREE.Color(spec.waterColor).getHex(),
  });
  if (result && result.mesh) {
    // Defer: water plugin adds the mesh to the scene immediately.
    // Re-parent into our group so the composer can return a single
    // "this is the scene" group.
    result.mesh.position.y = 0.05;
    if (result.mesh.parent) result.mesh.parent.remove(result.mesh);
    group.add(result.mesh);
  }
}

function execBuildings(spec, plan, rng, group, state) {
  if (!Array.isArray(spec)) return;
  for (const section of spec) {
    switch (section.type) {
      case 'ring': {
        for (let i = 0; i < section.count; i++) {
          const angle = (i / section.count) * Math.PI * 2 + rng() * 0.2;
          const r = section.radius + (rng() - 0.5) * (section.jitter || 0);
          const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
          addPrimitiveMeshes(section.primitive, x, 0, z, rng, plan, group);
        }
        break;
      }
      case 'single': {
        const [x, y, z] = section.position || [0, 0, 0];
        addPrimitiveMeshes(section.primitive, x, y, z, rng, plan, group);
        break;
      }
      case 'row': {
        for (let i = 0; i < section.count; i++) {
          const t = i / (section.count - 1);
          const x = (t - 0.5) * section.length;
          const z = section.side * (6 + rng() * 3);
          addPrimitiveMeshes(section.primitive, x, 0, z, rng, plan, group);
        }
        break;
      }
      case 'scatter': {
        const [lo, hi] = section.area || [[-10, -10], [10, 10]];
        for (let i = 0; i < section.count; i++) {
          const x = lo[0] + rng() * (hi[0] - lo[0]);
          const z = lo[1] + rng() * (hi[1] - lo[1]);
          addPrimitiveMeshes(section.primitive, x, 0, z, rng, plan, group);
        }
        break;
      }
      case 'orbit': {
        for (let i = 0; i < section.count; i++) {
          const angle = (i / section.count) * Math.PI * 2;
          const x = Math.cos(angle) * section.radius;
          const z = Math.sin(angle) * section.radius;
          const y = (rng() - 0.5) * 1.5;
          addPrimitiveMeshes(section.primitive, x, y, z, rng, plan, group);
        }
        break;
      }
    }
  }
}

function execFoliage(spec, plan, rng, group, state) {
  execBuildings(spec, plan, rng, group, state); // same section types
}

function execDecor(spec, plan, rng, group, state) {
  execBuildings(spec, plan, rng, group, state);
}

function addPrimitiveMeshes(primitiveName, x, y, z, rng, plan, group) {
  const factory = PRIMITIVES[primitiveName];
  if (!factory) {
    logger.warn('SceneComposer', `Unknown primitive: ${primitiveName}`);
    return;
  }
  const meshes = factory(rng, plan.palette);
  const wrapper = new THREE.Group();
  wrapper.position.set(x, y, z);
  wrapper.rotation.y = rng() * Math.PI * 2; // random spin for variety
  const scaleVar = 0.85 + rng() * 0.3;
  wrapper.scale.setScalar(scaleVar);
  wrapper.name = `${plan.template}_${primitiveName}_${Date.now()}_${Math.floor(rng() * 1000)}`;
  wrapper.userData.isManagedObject = true;
  wrapper.userData.composedBy = 'SceneComposer';
  wrapper.userData.templateId = plan.template;
  wrapper.userData.seed = plan.seed;
  for (const m of meshes) {
    m.castShadow = true;
    m.receiveShadow = true;
    wrapper.add(m);
  }
  group.add(wrapper);
}

function execLights(spec, plan, rng, state) {
  if (!Array.isArray(spec)) return;
  const lighting = state.data.pluginManager?._plugins?.get?.('Lighting');
  if (!lighting) {
    logger.warn('SceneComposer', 'LightingPlugin not registered — skipping lights section');
    return;
  }
  for (const light of spec) {
    if (light.type === 'preset') {
      lighting.applyPreset && lighting.applyPreset(light.name);
      continue;
    }
    const opts = { ...(light.options || {}) };
    if (opts.color && typeof opts.color === 'string') {
      opts.color = new THREE.Color(opts.color).getHex();
    }
    if (opts.position && Array.isArray(opts.position)) {
      opts.position = { x: opts.position[0], y: opts.position[1], z: opts.position[2] };
    }
    lighting.addLight(light.type, opts);
  }
}

function execFog(spec, plan, rng, state) {
  if (!spec) return;
  const atmosphere = state.data.pluginManager?._plugins?.get?.('Atmosphere');
  if (!atmosphere) return;
  if (spec.preset) {
    atmosphere.setPreset(spec.preset, spec.godRays);
  } else if (spec.density != null) {
    atmosphere.setVolumetricFog({
      enabled: true,
      color: spec.color ? new THREE.Color(spec.color).getHex() : undefined,
      density: spec.density,
    });
  }
}

function execGodRays(spec, plan, rng, state) {
  if (!spec) return;
  const atmosphere = state.data.pluginManager?._plugins?.get?.('Atmosphere');
  if (!atmosphere) return;
  if (spec.preset) {
    atmosphere.setPreset(null, spec.preset);
  }
}

function execCamera(spec, plan, rng, state) {
  if (!spec) return;
  const lighting = state.data.pluginManager?._plugins?.get?.('Lighting');
  if (!lighting) return;
  // Defer one frame so all spawned objects are in the scene before
  // the camera frames them.
  if (spec.view) {
    setTimeout(() => {
      lighting.setCameraView(spec.view);
      if (spec.afterFrame) {
        setTimeout(() => {
          const framed = lighting.frameAll ? lighting.frameAll() : null;
          if (framed === null && spec.view) lighting.setCameraView(spec.view);
        }, 100);
      }
    }, 50);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export const SceneComposer = {

  listTemplates() {
    return Object.values(TEMPLATES).map(t => ({
      id: t.id, name: t.name, description: t.description, category: t.category,
      densityRange: t.densityRange,
    }));
  },

  getTemplate(id) {
    return TEMPLATES[id] || null;
  },

  listPalettes() {
    return Object.keys(PALETTES);
  },

  /**
   * Compose a plan into a live group. Returns the THREE.Group
   * (caller adds to scene). On any plugin-missing error, returns a
   * partial group with whatever WAS composed + a warn.
   */
  compose(plan, state) {
    if (!plan || !state) {
      logger.warn('SceneComposer', 'compose: missing plan or state');
      return null;
    }
    const template = TEMPLATES[plan.template];
    if (!template) {
      logger.warn('SceneComposer', `compose: unknown template "${plan.template}"`);
      return null;
    }
    const rng = mulberry32(plan.seed || 1);
    // Pick a palette if not specified
    if (!plan.palette) {
      const paletteIds = template.palettes;
      plan.palette = paletteIds[Math.floor(rng() * paletteIds.length)];
    }
    const group = new THREE.Group();
    group.name = `ComposedScene_${plan.template}_${plan.seed}`;
    group.userData.isManagedObject = true;
    group.userData.composedBy = 'SceneComposer';
    group.userData.templateId = plan.template;
    group.userData.seed = plan.seed;
    group.userData.palette = plan.palette;

    try {
      execTerrain(template.sections.terrain, plan, rng, group, state);
      execWater(template.sections.water, plan, rng, group, state);
      execFog(template.sections.fog, plan, rng, state);
      execLights(template.sections.lights, plan, rng, state);
      execBuildings(template.sections.buildings, plan, rng, group, state);
      execFoliage(template.sections.foliage, plan, rng, group, state);
      execDecor(template.sections.decor, plan, rng, group, state);
      execGodRays(template.sections.godRays, plan, rng, state);
      execCamera(template.sections.camera, plan, rng, state);
    } catch (err) {
      logger.error('SceneComposer', 'compose failed mid-way:', err);
    }
    return group;
  },

  /**
   * Heuristic prompt -> plan. Tokenizes the prompt, scores each
   * template by tag overlap, and returns the highest-scoring
   * template (with a random seed + density).
   *
   * No LLM dependency. Falls back to "naturalForest" if no
   * template scores >= 1. User prompts like "medieval village on
   * a lake at sunset" reliably map to the right template.
   */
  derivePlanFromPrompt(prompt, options = {}) {
    const text = (prompt || '').toLowerCase();
    const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.length === 0) {
      return { template: 'naturalForest', density: 0.7, seed: Math.floor(Math.random() * 1e9) };
    }
    const TEMPLATE_TAGS = {
      medievalVillage: ['medieval', 'village', 'cottage', 'chapel', 'torches', 'dusk', 'castle', 'kingdom', 'thatched', 'stone'],
      cyberpunkCity:   ['cyberpunk', 'neon', 'city', 'urban', 'skyscraper', 'futuristic', 'hologram', 'street', 'cyber', 'dystopian'],
      naturalForest:   ['forest', 'tree', 'nature', 'woodland', 'grove', 'stream', 'deciduous', 'pine', 'wild', 'outdoor'],
      abstractSculpture:['abstract', 'sculpture', 'art', 'gallery', 'minimal', 'orb', 'geometric', 'modern'],
      spaceStation:    ['space', 'station', 'orbit', 'sci-fi', 'scifi', 'antenna', 'hub', 'ring', 'module', 'zero-g', 'zero', 'gravity'],
      desertOasis:     ['desert', 'oasis', 'sand', 'dune', 'palm', 'cactus', 'sun', 'arid', 'dry', 'sahara'],
      underseaCoral:    ['undersea', 'underwater', 'coral', 'reef', 'ocean', 'sea', 'fish', 'submarine', 'kelp', 'seaweed', 'dive'],
    };
    const scores = {};
    for (const [tpl, tags] of Object.entries(TEMPLATE_TAGS)) {
      scores[tpl] = 0;
      for (const tok of tokens) {
        if (tags.includes(tok)) scores[tpl] += 1;
      }
    }
    let best = 'naturalForest', bestScore = 0;
    for (const [tpl, s] of Object.entries(scores)) {
      if (s > bestScore) { bestScore = s; best = tpl; }
    }
    // Density heuristic: longer prompts → denser
    const density = options.density != null
      ? options.density
      : Math.min(1, 0.5 + tokens.length * 0.03);
    return {
      template: best,
      density,
      seed: options.seed || Math.floor(Math.random() * 1e9),
    };
  },
};
