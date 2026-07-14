# Plugin Authoring Guide

This guide covers everything you need to write a new plugin for Master Studio. The plugin architecture is deliberately small: a plugin is just a JavaScript object with four fields, registered with the central `PluginManager`.

## The 30-second version

```js
// plugins/MyPlugin.js
import { createNodeCard } from '../NodeFactory.js';
import { logger } from '../core/Logger.js';

export const MyPlugin = {
  name: 'MyPlugin',
  _state: null,
  init(state) { this._state = state; },
  update(dt) { /* per-frame work */ },
  nodes: {
    'MyPlugin/DoThingNode': (x, y) =>
      createNodeCard(x, y, 'Do Thing', ['Input'], ['Output']),
  },
};
```

Then in `MasterApp.js`:

```js
import { MyPlugin } from './plugins/MyPlugin.js';
this.plugins.register(MyPlugin);
```

That's the whole loop. The plugin will show up in the **Add Node** menu, get a per-frame `update(dt)` call, and have full access to the event bus.

## The plugin contract

A plugin is an object with the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | yes | Unique name. Other plugins look it up by this name. |
| `init(state)` | function | yes | Called once at app startup. Wire up event listeners, create resources, set up defaults. |
| `update(dt)` | function | no | Called every frame (60Hz). Do per-frame work here. Keep it cheap. |
| `nodes` | `Record<string, NodeFactory>` | no | Map of `category/NodeName` to a card factory `(x, y) => HTMLElement`. These populate the **Add Node** menu. |
| `dispose()` | function | no | Called on teardown. Release GPU resources, remove listeners. |
| anything else | `any` | no | Free-form. The plugin is the sole owner of its own state. |

### Naming

Plugin `name` is a short identifier (`"Lighting"`, `"Atmosphere"`, `"SceneComposer"`). It is the key under which the plugin is registered in `PluginManager._plugins`, so it must be unique. Use PascalCase.

Visual node keys are `"Category/NodeName"`. The category becomes the top-level group in the **Add Node** menu. Existing categories include: `Lighting`, `Camera`, `Atmosphere`, `Water`, `Selection`, `Transform`, `GameMap`, `AI`, `Go`, `Rust`, `Lua`, `PointCloud`, `Lidar`, `SceneComposer`. Pick a category that fits the menu grouping; if unsure, use the plugin name.

## Accessing shared state

The `state` passed to `init(state)` is the live `MasterState` instance. The two key fields are:

```js
state.data.scene;     // THREE.Scene
state.data.camera;    // THREE.Camera (PerspectiveCamera or OrthographicCamera)
state.data.renderer;  // THREE.WebGLRenderer
state.data.controls;  // OrbitControls
state.data.selectedObjects;  // Array<Object3D>
state.data.pluginManager;     // PluginManager
```

The `pluginManager` lets you look up other plugins by name:

```js
const lighting = state.data.pluginManager._plugins.get('Lighting');
if (lighting && lighting.addLight) {
  lighting.addLight('point', { color: 0xffaa00, intensity: 1.5 });
}
```

The `PluginManager` is intentionally an open Map — there's no permission system. Be polite: only call public methods, never mutate the other plugin's internal state.

## Emitting and listening to events

Two event systems coexist:

### `MasterState.emit / on` (lightweight event bus)

```js
// Listen (in init):
state.on('my:event', (detail) => this._handle(detail));
state.on('selection:changed', (objects) => this._onSelection(objects));

// Emit (anywhere):
state.emit('my:event', { foo: 'bar' });
state.emit('notification', { message: 'Hello', type: 'info' });
```

Use this for **notifications**, **lifecycle hooks** (selection changed, scene cleared, camera moved), and **plugin-to-plugin signals** that don't need a structured action.

### `StateManager.dispatch` (typed action system)

```js
// Listen (in init):
stateManager.subscribe('render.outlinePass', (enabled) => {
  this._outlinePass.enabled = enabled;
});

// Dispatch (anywhere):
stateManager.dispatch({
  type: 'RENDER/SET_OUTLINE_PASS',
  payload: false,
  path: 'render.outlinePass',
});
```

Use this for **state changes that need middleware** (history, telemetry, validation) and **AI agent dispatches** (the `AIAgentPlugin` ingests every dispatch into its 500-entry telemetry buffer).

`MasterState.emit` is a thin pass-through to `StateManager.dispatch` for some events, so you can mix the two — but for any new code path, prefer `dispatch` for actions and `emit` for signals.

## GFX resource tracking

If your plugin creates GPU resources (textures, render targets, shadow maps, geometries large enough to leak), register them with the StateManager so the `GfxResourcePanel` and `AIAgent.MemoryExpert` can see them.

```js
_getStateManager() {
  return this._state && this._state.data && this._state.data.pluginManager
    ? this._state.data.pluginManager._plugins && this._state.data.pluginManager._plugins.get('StateManager')
    : null;
}

addLight(type, opts) {
  const light = new THREE.DirectionalLight(...);
  // ... configure light ...
  const sm = this._getStateManager();
  if (sm && typeof sm.trackGfxResource === 'function') {
    const bytes = 2048 * 2048 * 4;  // 2048×2048 RGBA shadow map
    const id = `shadow/${light.uuid}/2048x2048`;
    sm.trackGfxResource(id, bytes, 'shadow-map', light.name);
    light.userData.gfxResourceId = id;  // remember for release
  }
  return light;
}

removeLight(uuid) {
  const light = this._lights.get(uuid);
  if (!light) return;
  // Release BEFORE disposing the GPU resource so the AI sees the freed bytes.
  if (light.userData && light.userData.gfxResourceId) {
    const sm = this._getStateManager();
    if (sm && typeof sm.releaseGfxResource === 'function') {
      sm.releaseGfxResource(light.userData.gfxResourceId);
    }
    delete light.userData.gfxResourceId;
  }
  // ... dispose geometry / material / texture ...
}
```

`trackGfxResource(id, bytes, kind, label)` — registers a resource.

`releaseGfxResource(id)` — releases it. The AI's MemoryExpert watches the per-`kind` count and recommends cleanup when it exceeds a threshold (4 water cubemaps, 6 shadow maps, 3 HDRIs, 3 point clouds, 3 CAD models by default).

## Adding visual nodes

Every plugin can expose visual nodes for the brutalist node graph. Use `createNodeCard(x, y, label, inputs, outputs, opts)`:

```js
import { createNodeCard } from './NodeFactory.js';

nodes: {
  'MyPlugin/DoThingNode': (x, y) => {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';
    body.innerHTML = `
      <label>Filename</label>
      <input type="text" data-prop="filename" value="output.json">
      <button data-action="run">Run</button>
    `;
    return createNodeCard(x, y, 'Do Thing', ['Input'], ['Output'], { body });
  },
},
```

The `data-prop` attributes on form fields are automatically parsed by `NodeGraphExecutor._parseNodeInputs` and passed to your plugin's `executeNode(node, parsed)` method (if defined).

The `data-action="run"` button is auto-wired by `MasterApp._registerNodeInGraph` to call `nodeGraph.executeNodeOnDemand(nodeData)`. This in turn calls your `executeNode(node, parsed)` if defined, or `_handleLogicNode(action, inputs, dt)` for the older plugin pattern.

## Per-frame update

`update(dt)` is called every frame from `MasterApp._animate()`. Keep it cheap — heavy work here will tank the frame rate. For expensive operations, schedule them on a `setInterval` or `requestIdleCallback` instead.

```js
update(dt) {
  this._lights.forEach(light => {
    if (light.userData.animate) this._animateLight(light, dt);
  });
}
```

If you need to do work at a different rate (e.g. 1Hz DOM updates), see `MasterApp._setupBackgroundWork()` for the pattern used by the debug panel.

## Disposal

If your plugin creates GPU resources, scene objects, or event listeners, implement `dispose()` to clean them up:

```js
dispose() {
  this._lights.forEach((_, uuid) => this.removeLight(uuid));
  window.removeEventListener('my:event', this._handleBound);
  if (this._pmremGenerator) {
    this._pmremGenerator.dispose();
    this._pmremGenerator = null;
  }
}
```

The PluginManager does NOT automatically call `dispose()` — it's a manual cleanup that the host (typically `MasterApp`) calls on teardown or hot-reload.

## Common patterns from existing plugins

### Lazy-spawn expensive resources

`LightingPlugin` doesn't create a `WebGLRenderTarget` until `setStereoMode('sbs')` is first called. Saves GPU memory for users who never use stereoscopic.

### Bridging window events to plugin methods

Most plugins expose both a direct method (e.g. `lighting.setCameraView('top')`) AND a window event listener that calls the same method (so HTML pages can dispatch without importing the plugin). Pattern:

```js
_setupEventListeners() {
  window.addEventListener('setCameraView', (e) => this.setCameraView(e.detail.view));
}
```

### Per-instance GFX resource IDs

Always namespace by UUID so multiple instances don't collide:

```js
const id = `${kind}/${light.uuid}/${w}x${h}`;
sm.trackGfxResource(id, bytes, 'shadow-map', light.name);
light.userData.gfxResourceId = id;
```

### Defensive null checks

Plugins are often registered before their dependencies. Always check before calling:

```js
const lighting = this._getPluginManager()?._plugins?.get?.('Lighting');
if (lighting?.addLight) lighting.addLight('point', opts);
```

## Anti-patterns to avoid

- **Don't import another plugin's source.** Plugins should only know each other by name. Importing creates tight coupling that breaks the lazy-spawn / re-register cycle.
- **Don't store references to the scene in long-lived closures.** The scene can be cleared and rebuilt; the plugin will hold a stale reference. Use `this._state.data.scene` at call-time.
- **Don't call `state.dispatch` from inside a `state.subscribe` callback** — the dispatch will re-enter the same callback and may loop.
- **Don't render the plugin's UI on every frame.** Use `state.on('notification', ...)` to surface events, or write to a dedicated mount point in the DOM at most 1×/sec.
- **Don't throw from `init`.** Plugins that fail to initialize should log a warn and return early. The app should keep running with whatever subset of plugins succeeded.

## Copy-paste template

Save this as `plugins/MyPlugin.js`:

```js
/**
 * MyPlugin - <one-line description>.
 *
 * Public API:
 *   doThing(options) -> result
 *
 * Plugin contract:
 *   - init(state)         : wire up listeners, create resources
 *   - update(dt)          : per-frame work
 *   - doThing(options)    : main public method
 *   - nodes.MyNode        : one visual node (optional)
 *   - dispose()           : cleanup on teardown (optional)
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

const DEFAULTS = Object.freeze({ /* your config here */ });

export const MyPlugin = {
  name: 'MyPlugin',
  _state: null,
  _resources: new Map(),

  init(state) {
    this._state = state;
    this._setupEventListeners();
    logger.log('MyPlugin', 'Initialized');
  },

  update(dt) {
    // Per-frame work. Keep cheap.
  },

  doThing(options = {}) {
    const o = { ...DEFAULTS, ...options };
    // ... do work ...
    return result;
  },

  _setupEventListeners() {
    window.addEventListener('my:event', (e) => this.doThing(e.detail));
  },

  _getStateManager() {
    return this._state && this._state.data && this._state.data.pluginManager
      ? this._state.data.pluginManager._plugins && this._state.data.pluginManager._plugins.get('StateManager')
      : null;
  },

  dispose() {
    this._resources.forEach((res, id) => res.dispose && res.dispose());
    this._resources.clear();
  },

  nodes: {
    'MyPlugin/DoThingNode': (x, y) =>
      createNodeCard(x, y, 'Do Thing', ['Input'], ['Output']),
  },
};
```

Register it in `MasterApp.js` near the other plugins:

```js
import { MyPlugin } from './plugins/MyPlugin.js';
// inside init():
this.plugins.register(MyPlugin);
```

That's the whole loop. Welcome to the plugin ecosystem.
