# Master Studio

A browser-based 3D creative studio built on **Three.js r170** + **Vite** + **Rust/Go Wasm**. Open `index.html` and you get a fully-wired scene editor with 20+ plugins, a visual node graph, AI self-optimization, and the new **AI Scene Composer** that can build a 30+ object scene in 2 seconds from a text prompt.

> **What's new in this release:** unified lighting + camera + recording, iOS LiDAR .ply processing, generic point cloud operations, volumetric fog + god rays, and the **AI Scene Composer** (the headline new ability).

## Quick Start

```bash
npm install
npm run dev
# → open http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

Requires **Node 18+** and a browser with **WebGL 2** + **Wasm SIMD** support.

## The AI Scene Composer (Headline Feature)

The biggest thing this project ships is `AI/ComposeSceneNode`. Open the **Add Node** menu, pick **AI → Compose Scene**, type a prompt, and watch 30+ objects appear in the outliner in under 2 seconds:

```
medieval village on a lake at dusk
cyberpunk city with neon signs
natural forest with a stream
abstract sculpture in a gallery
space station in orbit
desert oasis at sunset
undersea coral reef
```

Seven hand-crafted templates ship by default. Each is a richly-detailed plan (lighting, fog, water, terrain, foliage, camera) that renders through the existing plugin pipeline so composed scenes are indistinguishable from ones you build by hand.

**Optional LLM mode:** set `window.OPENAI_API_KEY = 'sk-...'` in the browser console, and the node will use `gpt-4o-mini` to convert prompts into template selections. The deterministic fallback always works offline.

See [`core/SceneComposer.js`](./core/SceneComposer.js) for the template library, [`plugins/SceneComposerPlugin.js`](./plugins/SceneComposerPlugin.js) for the plugin wrapper, and [`bindings/SceneComposerLLM.js`](./bindings/SceneComposerLLM.js) for the optional LLM bridge.

## What else is here

| Domain | Plugins | What it does |
|---|---|---|
| **Lighting + Camera + Recording** | `Lighting` | 4 light presets, HDRI env-maps, Orthographic + Stereoscopic cameras, MediaRecorder canvas capture, frame export, GFX-resource tracking |
| **Volumetric + God Rays** | `Atmosphere` | `THREE.FogExp2` + 4-pass god-rays postprocess, 5 fog + 4 god-ray presets, screen-space sun projection |
| **Geometry / Boolean / Decimate** | `Rust` (Wasm) | Real CSG, mesh decimation, and BVH on heavy geometry |
| **Point Cloud / LiDAR** | `LidarIOS`, `PointCloud` | iOS ARKit .ply parsing (confidence + classification), voxel downsample, statistical outlier removal, normal estimation, DBSCAN, marching-cubes meshing, PLY/OBJ/glTF export |
| **Concurrent Asset Processing** | `Go` (Wasm) | LAS/PLY point-cloud parsing + STEP/IGES CAD import, worker pool |
| **Sandboxed Logic** | `Lua` (Wasm) | Per-object Lua scripts evaluated each frame |
| **Animation / Rigging** | `Animation`, `Rigging` | Skeletal animation + bone retargeting |
| **MoCap** | `MoCap` | Webcam-based landmark detection drives rigged skeletons |
| **Physics** | `Physics` | Rigid body physics with adjustable substeps |
| **AI Behavior** | `AIBehavior` | Per-object AI decision trees |
| **Map / World Gen** | `GameMap` | Heightmap-driven tiled worlds with edge blending, LOD, collision |
| **Procedural** | `Procedural` | Geometry + texture generators (noise, fractals) |
| **State + Self-Optimization** | `StateManager`, `AIAgents` | Middleware + expert system (Performance, Memory, Physics, NodeGraph, SceneComposer) that watches telemetry and dispatches optimizations |
| **Selection / Outliner** | `Selection` | Lasso, sticky select, group/ungroup, select-by-color/type/bounding-box/name |
| **Transform Gizmo** | `TransformGizmo` | Three.js TransformControls with mode + space toggles |
| **Postprocessing** | `PhotorealisticRender` | EffectComposer with SSAO, Bloom, FXAA, OutputPass + OutlinePass |
| **UI** | `MenuSystem` | Menu event dispatch (addPrimitive, captureScreenshot, setRenderPreset, etc.) |
| **Water** | `Water` | Real `Water` shader surface, foam, edge fade, cubemap RTT lifecycle |
| **Gfx Resource Panel** | `GfxResourcePanel` | Live table of every tracked GPU resource (water cubemaps, shadow maps, HDRIs, point clouds, CAD) |
| **AI Composer (NEW)** | `SceneComposer` | Template-based + LLM-optional scene builder (see above) |
| **Undo / Redo (NEW)** | `UndoManager` | Cmd+Z / Cmd+Shift+Z over the StateManager's history middleware |
| **Save / Load (NEW)** | `SceneIO` | JSON + GLTF save/load + 5s localStorage autosave |
| **Perf Stats (NEW)** | `PerfStats` | FPS / frame / draw calls / triangles / geometries / textures overlay |

## Keyboard shortcuts

| Key | Action |
|---|---|
| **G / R / S** | Translate / Rotate / Scale gizmo mode |
| **Space** | Toggle gizmo world/local space |
| **T** | Toggle sticky select |
| **L** | Start/complete lasso select |
| **A** | Select all (Ctrl+A) |
| **Escape** | Deselect all |
| **U** | Ungroup selected |
| **I** | Invert selection |
| **1 / 2 / 3** | Select by color (red/blue/green) |
| **Delete / Backspace** | Delete selected |
| **Cmd/Ctrl + Z** | Undo (NEW) |
| **Cmd/Ctrl + Shift + Z** or **Cmd/Ctrl + Y** | Redo (NEW) |
| **P** | Toggle physics debug overlay |

## Architecture

The project is built around a **plugin** contract: every feature is a `{ name, init(state), update(dt), nodes }` object registered with the central `PluginManager`. Plugins communicate through a single event bus (`MasterState.emit/on`) and the rich dispatch system (`StateManager.dispatch + middleware + telemetry`).

```
┌──────────────────────────────────────────────────────────────┐
│  MasterApp                                                   │
│  ├── MasterState   (event bus + set/on/emit)                 │
│  ├── PluginManager (registers all plugins)                    │
│  └── NodeGraphExecutor (evaluates visual node graph)          │
├──────────────────────────────────────────────────────────────┤
│  Plugins (one file each in plugins/)                         │
│  ├── Lighting | Atmosphere | Rust | Go | Lua                 │
│  ├── Water | WaterDebugOverlay | GfxResourcePanel            │
│  ├── AIAgents (5 experts including SceneComposer)            │
│  ├── Selection | TransformGizmo | Animation | Rigging        │
│  ├── MoCap | Physics | Procedural | GameMap | AIBehavior     │
│  ├── StateManager | MenuSystem | LidarIOS | PointCloud       │
│  ├── PhotorealisticRender                                     │
│  ├── SceneComposer (NEW) | PerfStats (NEW)                   │
├──────────────────────────────────────────────────────────────┤
│  Core                                                         │
│  ├── SceneComposer (template library) — core/SceneComposer.js│
│  ├── UndoManager — core/UndoManager.js                       │
│  ├── SceneIO — core/SceneIO.js                                │
│  ├── MasterState — core/MasterState.js                        │
│  └── Logger — core/Logger.js                                 │
├──────────────────────────────────────────────────────────────┤
│  Bindings                                                     │
│  ├── WasmBridge (Rust + Go loader)                            │
│  ├── LuaBridge (fengari)                                      │
│  └── SceneComposerLLM (NEW; OpenAI bridge)                   │
└──────────────────────────────────────────────────────────────┘
```

## Building a new plugin

See [`docs/PLUGIN_AUTHORING.md`](./docs/PLUGIN_AUTHORING.md) for the full guide. The 30-second version:

```js
// plugins/MyPlugin.js
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const MyPlugin = {
  name: 'MyPlugin',
  _state: null,
  init(state) {
    this._state = state;
    logger.log('MyPlugin', 'ready');
    window.addEventListener('my:event', (e) => this._handle(e.detail));
  },
  update(dt) { /* per-frame work */ },
  _handle(detail) { /* event handler */ },
  nodes: {
    'MyPlugin/DoThingNode': (x, y) =>
      createNodeCard(x, y, 'Do Thing', ['Input'], ['Output']),
  },
};
```

Then in `MasterApp.js`:

```js
import { MyPlugin } from './plugins/MyPlugin.js';
// inside init():
this.plugins.register(MyPlugin);
```

The plugin will appear in the **Add Node** menu, get a per-frame `update(dt)` call, and have full access to the event bus. Done.

## The 3 most useful files to read

1. **`MasterApp.js`** — the bootstrap. Wires everything together, starts the render loop, owns the rAF chain.
2. **`core/MasterState.js`** — the event bus. Everything flows through it.
3. **`plugins/AIAgentPlugin.js`** — the expert pattern. The cleanest example of how plugins should be written.

## Roadmap

This project is feature-rich and self-optimizing, but is not yet a polished editor. The known gaps (prioritized):

- [ ] Undo/Redo UI (the data + keyboard work; needs a panel)
- [ ] Save/Load UI menu (the IO works; needs menu items)
- [ ] Mobile / tablet responsive layout
- [ ] Plugin authoring guide (in progress: [`docs/PLUGIN_AUTHORING.md`](./docs/PLUGIN_AUTHORING.md))
- [ ] Tests (currently 0; the plugin architecture makes them trivial to add)
- [ ] Linter / formatter (currently relies on hand discipline)
- [ ] CI / build pipeline (currently builds locally only)
- [ ] README GIF (the AI Composer + 30+ object scene in 2 seconds)

## License

MIT.
