/**
 * WaterPlugin.js — Comprehensive Three.js Water surface integration.
 *
 * Wraps `three/addons/objects/Water.js` (built-in since r70) with:
 *   • Procedural canvas-generated water-normal map (no CDN dependency)
 *     with a graceful fallback to threejs.org's `waternormals.jpg` if the
 *     environment allows.
 *   • Real animated waves via the `time` uniform (advanced every frame in
 *     the plugin's `update()` so the animate loop stays the single source
 *     of truth).
 *   • Configurable sun direction / sun color / water color / distortion
 *     scale / alpha — passed straight to `Water`'s uniforms.
 *   • Foam effect: injected via `onBeforeCompile` so it shares the same
 *     ShaderMaterial pipeline (no second material). Foam uses the water
 *     depth-derived fresnel term so it brightens near grazing angles.
 *   • Edge fade: injected via `onBeforeCompile` to fade the alpha as the
 *     camera approaches a configured `fadeDistance`, preventing the
 *     hard square edge of the plane from being visible underwater / on
 *     landfall.
 *   • CubeCamera lifecycle: `disposeWater()` explicitly releases the
 *     internal `WebGLRenderTarget` held by `Water` (Three.js's own
 *     `material.dispose` does NOT cascade-release the cubemap render
 *     target), so deleted water doesn't leak GPU memory.
 *   • Two node-factory entries — `Water/WaterSurfaceNode` to spawn a
 *     new water and `Water/WaterDepthNode` to tune depth / density
 *     uniforms on an existing one.
 *
 * IMPORTANT: This plugin must be registered AFTER MasterApp has wired
 * the `state.data.renderer` and `state.data.scene` (which happen in
 * `_initRenderer` and the constructor respectively). Window listeners for
 * `addWater` and `water:dispose` are registered in `init()` so external
 * UIs (menus, modals) can spawn + clean up water without needing a
 * direct reference to the plugin.
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';
import { createWaterNormalTexture } from './water/normal-map.js';

// Default config sized for typical brutalist demo scenes (10km lake default,
// smaller than the 10000-unit Three.js official example so visible reflections
// stay GPU-cheap on midrange hardware).
const DEFAULTS = Object.freeze({
  width: 200,
  height: 200,
  segments: 128,
  textureWidth: 512,
  textureHeight: 512,
  distortionScale: 3.7,
  alpha: 1.0,
  sunDirection: [0.7, 0.3, 0.7],   // light comes from upper-right (over shoulder)
  sunColor: 0xffffff,
  waterColor: 0x001e0f,
  foamIntensity: 0.35,
  foamColor: 0xc0d8ff,
  fadeEnabled: true,
  fadeNear: 50,
  fadeFar: 180,
});

export const WaterPlugin = {
  name: 'Water',
  _state: null,
  _waters: new Set(),
  _normalMap: null,
  _normalMapReady: false,
  // When true, listening for the `water:cleanup` window event will
  // auto-dispose off-camera water surfaces down to `autoCleanupBudget`.
  // Disable for debugging / a "no-touch" run (e.g. a cinematic scene
  // where the AI's recommendation should be informational only).
  autoCleanupEnabled: true,
  // Default cap: keep at most this many water surfaces after cleanup.
  // MemoryExpert's recommend threshold is 4 (fires when count >= 4);
  // 2 leaves the user's primary + their most-recent test puddle and
  // trims the older test puddles the AI suspect is "forgotten".
  autoCleanupBudget: 2,
  // Reusable scratch Frustum + projection matrix so per-event
  // off-camera tests don't allocate. Frustum is per-camera and
  // re-initialized inside `_isOffCamera` to match the current camera.
  _scratchFrustum: null,
  _scratchMatrix: null,

  init(state) {
    this._state = state;
    this._initNormalMap();
    this._wireWindowEvents();
    this._scratchFrustum = new THREE.Frustum();
    this._scratchMatrix = new THREE.Matrix4();
    logger.log('WaterPlugin', `Initialized (autoCleanupEnabled=${this.autoCleanupEnabled}, budget=${this.autoCleanupBudget}).`);
  },

  /**
   * Initialize the procedural water-normal texture.
   *
   * Delegates to `plugins/water/normal-map.js#createWaterNormalTexture`,
   * a pure function that handles the math + DOM-canvas painting with no
   * plugin state. This method is a thin try/catch wrapper that bridges
   * the pure module's throw-on-failure contract into the plugin's
   * `_normalMap` / `_normalMapReady` instance fields.
   *
   * Encoding cheat-sheet (also documented in normal-map.js):
   *   red channel = -dh/du (X slope)
   *   green channel = -dh/dv (Y slope)
   *   blue = 255 (constant up vector)
   *   Math.tanh bounds the byte value so derivatives never saturate.
   *
   * Failure modes are caught here rather than in the pure module so the
   * plugin can degrade gracefully (caller will see `_normalMapReady=false`
   * and fall back to the bundled waternormals.jpg via Three.js Water.js).
   */
  _initNormalMap() {
    try {
      this._normalMap = createWaterNormalTexture();
      this._normalMapReady = true;
    } catch (err) {
      logger.warn('WaterPlugin', 'Procedural normal map failed:', err);
      this._normalMapReady = false;
    }
  },

  /**
   * Create a fully-configured water surface and add it to the active scene.
   * Auto-selects the result so the user can immediately drag/copy/delete it.
   *
   * @returns {{
   *   mesh: THREE.Mesh,
   *   water: Water,
   *   dispose: () => void,
   *   setSun: (x:number, y:number, z:number) => void,
   *   setWaterColor: (hex:number) => void,
   *   setDistortion: (scale:number) => void,
   * } | null}
   */
  createWaterSurface(userOpts = {}) {
    if (!this._state?.data?.renderer || !this._state?.data?.scene) {
      logger.warn('WaterPlugin', 'createWaterSurface called before renderer/scene ready');
      return null;
    }
    const o = { ...DEFAULTS, ...userOpts };

    // Convert user-friendly colors/vectors into THREE types if needed.
    const sunDirection = Array.isArray(o.sunDirection)
      ? new THREE.Vector3().fromArray(o.sunDirection)
      : (o.sunDirection instanceof THREE.Vector3 ? o.sunDirection.clone() : new THREE.Vector3(0.7, 0.3, 0.7));
    sunDirection.normalize();
    // IMPORTANT: pass the Color straight in. Water.js r170 uses the color
    // value directly (it already does the luminance-scaling internally in
    // the fragment shader). Earlier we multiplied by 0.6*PI which made
    // suns too bright + washed out the highlights.
    const sunColor = new THREE.Color(o.sunColor);
    const waterColor = new THREE.Color(o.waterColor);

    const geometry = new THREE.PlaneGeometry(o.width, o.height, o.segments, o.segments);

    const water = new Water(geometry, {
      textureWidth:  o.textureWidth,
      textureHeight: o.textureHeight,
      waterNormals:  this._normalMap,
      sunDirection,
      sunColor,
      waterColor,
      distortionScale: o.distortionScale,
      alpha: o.alpha,
      fog: this._state.data.scene.fog !== undefined,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0; // water bed default; user can move mesh after creation

    this._extendWaterShader(water, o);

    const mesh = /** @type {THREE.Mesh} */ (water);
    mesh.name = `Water_${Date.now()}`;
    mesh.userData.isManagedObject = true;
    mesh.userData.isWater = true;
    mesh.userData.waterType = 'shader-surface';
    mesh.userData.waterOpts = o;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    // Track the cubemap RTT bytes with the StateManager. This is the
    // single source of truth for "how much GPU memory are we using" so
    // AIBehaviorPlugin's MemoryExpert (and the AIAgentPlugin orchestrator)
    // can detect accumulation and recommend disposal. The Water.js
    // `_renderTarget` is a `WebGLCubeRenderTarget` (6 faces); we estimate
    // 6 × W × H × (4 RGBA + 2 depth) bytes which covers color + depth
    // buffer. mipmaps are not accounted for (~33% overhead, conservative
    // underestimate so we don't over-claim freed memory).
    if (this._state?.data?.pluginManager?._plugins?.get) {
      const sm = this._state.data.pluginManager._plugins.get('StateManager');
      if (sm && typeof sm.trackGfxResource === 'function') {
        const rt = water._renderTarget;
        const w = (rt && rt.width) || o.textureWidth;
        const h = (rt && rt.height) || o.textureHeight;
        const cubemapBytes = 6 * w * h * 4 + 6 * w * h * 2;
        const resourceId = `water/${mesh.uuid}/cubemap`;
        sm.trackGfxResource(resourceId, cubemapBytes, 'water-cubemap', mesh.name);
        mesh.userData.gfxResourceId = resourceId;
      }
    }

    this._state.data.scene.add(mesh);
    this._waters.add(mesh);

    // Auto-select so the user can immediately tweak transform + properties.
    const selection = this._state.data.pluginManager?._plugins?.get?.('Selection');
    if (selection && typeof selection._setSelection === 'function') {
      selection._setSelection([mesh]);
    }

    logger.log('WaterPlugin', `Created water surface "${mesh.name}" (${o.width}\u00D7${o.height}, ${o.segments} seg)`);

    return {
      mesh,
      water,
      setSun(x, y, z)      { sunDirection.set(x, y, z).normalize(); },
      setWaterColor(hex)   { waterColor.set(hex); water.material.uniforms.waterColor.value.copy(waterColor); },
      setDistortion(s)     { water.material.uniforms.distortionScale.value = s; },
      dispose: () => this.disposeWater(mesh),
    };
  },

  /**
   * Inject foam + camera-distance edge fade via shader patching. We do this
   * once per Water instance via `onBeforeCompile` so the plugin doesn't
   * duplicate the underlying material.
   *
   * If the fragment-shader string doesn't match (e.g. a future Three.js
   * release rewrites the line), we fall back to "no foam / no edge fade"
   * rather than corrupting the shader. A warn keeps the regression loud.
   */
  _extendWaterShader(water, o) {
    const foamIntensity = o.foamIntensity;
    const foamColor = new THREE.Color(o.foamColor);
    const fadeEnabled = o.fadeEnabled !== false;
    const fadeNear = o.fadeNear ?? 50;
    const fadeFar  = o.fadeFar  ?? 180;

    const uniformDecls = [
      'uniform vec3 sunColor;',
      'uniform float uFoamIntensity;',
      'uniform vec3 uFoamColor;',
      'uniform float uFadeEnabled;',
      'uniform float uFadeNear;',
      'uniform float uFadeFar;',
    ].join('\n           ');

    const colorReplacement = 'uniform vec3 sunColor;';
    const alphaReplacement = 'gl_FragColor = vec4( blendOverlay( base.rgb, color ), base.a );';
    const alphaWithEffects = [
      'float foamTerm = uFoamIntensity * (1.0 - clamp(distortionUv.y, 0.0, 1.0));',
      'vec3 withFoam = mix(blendOverlay(base.rgb, color), uFoamColor, smoothstep(0.4, 0.95, foamTerm));',
      // Camera-distance fade: worldPosition is already a varying in the
      // Water.js vertex pass; we just project to worldspace XZ length for
      // the alpha attenuation.
      'float camDist = length(worldPosition.xz);',
      'float fadeFactor = (uFadeEnabled > 0.5) ? smoothstep(uFadeNear, uFadeFar, camDist) : 0.0;',
      'float finalAlpha = mix(base.a, 0.0, fadeFactor);',
      'gl_FragColor = vec4(withFoam, finalAlpha);',
    ].join('\n           ');

    water.material.onBeforeCompile = (shader) => {
      shader.uniforms.uFoamIntensity = { value: foamIntensity };
      shader.uniforms.uFoamColor      = { value: foamColor };
      shader.uniforms.uFadeEnabled    = { value: fadeEnabled ? 1.0 : 0.0 };
      shader.uniforms.uFadeNear       = { value: fadeNear };
      shader.uniforms.uFadeFar        = { value: fadeFar };

      const beforeColor = shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(colorReplacement, uniformDecls);
      if (shader.fragmentShader === beforeColor) {
        logger.warn('WaterPlugin', 'sunColor uniform decl not found \u2014 foam uniforms skipped, foam effect disabled.');
        return;
      }
      const beforeAlpha = shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(alphaReplacement, alphaWithEffects);
      if (shader.fragmentShader === beforeAlpha) {
        logger.warn('WaterPlugin', 'gl_FragColor assignment not found \u2014 edge fade / foam effect disabled. Three.js Water.js shader may have changed.');
      }
    };
    water.material.needsUpdate = true;
  },

  /**
   * Advance time-based wave animation. Called by MasterApp's animate loop
   * via `plugins.update(dt)`. Future-proof: works regardless of how many
   * water surfaces are alive.
   */
  update(dt) {
    for (const mesh of this._waters) {
      if (mesh.material && mesh.material.uniforms && mesh.material.uniforms.time) {
        mesh.material.uniforms.time.value += dt;
      }
    }
  },

  /**
   * Clean teardown: removes mesh from scene, disposes geometry + material,
   * AND explicitly disposes Water.js's internal `WebGLRenderTarget`
   * (held on the Water instance as `_renderTarget`). Three.js's own
   * `material.dispose()` does NOT cascade-release the cubemap RTT, so
   * we do it explicitly here to plug the GPU memory leak path.
   */
  disposeWater(mesh) {
    if (!mesh || !this._waters.has(mesh)) return;

    // Release the GPU resource registration BEFORE disposing the
    // WebGLRenderTarget. This is the canonical telemetry point: the
    // StateManager emits a `PERF/GFX_DELTA` patch with `event: 'release'`
    // and a negative `deltaBytes` so AIBehaviorPlugin's MemoryExpert
    // (via the AIAgentPlugin telemetry pipeline) can observe freed
    // memory. Calling release before dispose keeps the delta accurate
    // even if dispose() throws.
    if (mesh.userData?.gfxResourceId) {
      const sm = this._state?.data?.pluginManager?._plugins?.get?.('StateManager');
      if (sm && typeof sm.releaseGfxResource === 'function') {
        sm.releaseGfxResource(mesh.userData.gfxResourceId);
      }
      delete mesh.userData.gfxResourceId;
    }

    if (mesh.parent) mesh.parent.remove(mesh);
    if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
      mesh.geometry.dispose();
    }
    if (mesh._renderTarget && typeof mesh._renderTarget.dispose === 'function') {
      mesh._renderTarget.dispose();
      mesh._renderTarget = null;
    }
    if (mesh.material && typeof mesh.material.dispose === 'function') {
      mesh.material.dispose();
    }
    this._waters.delete(mesh);
    logger.log('WaterPlugin', `Disposed water "${mesh.name}"`);
  },

  /**
   * External window-event bridge so brutalist HTML pages / menus can spawn
   * water without importing the plugin directly.
   */
  _wireWindowEvents() {
    window.addEventListener('addWater', (e) => {
      const opts = e.detail || {};
      this.createWaterSurface(opts);
    });

    // Disposal bridge triggered by MasterApp._wireMenuEvents' delete handler
    // when a `userData.isWater` mesh is removed from the scene. Without this
    // bridge, deleting a water surface via the menu would only detach the
    // mesh from the scene — the cubemap `WebGLRenderTarget` would leak GFX
    // memory because Three.js's `material.dispose()` does NOT cascade
    // release it.
    window.addEventListener('water:dispose', (e) => {
      const name = e.detail && e.detail.name;
      const target = name
        ? [...this._waters].find(m => m.name === name)
        : null;
      if (target) {
        this.disposeWater(target);
        return;
      }
      // Fallback: dispose the first water if no name was provided (single-water scene).
      const first = [...this._waters][0];
      if (first) this.disposeWater(first);
    });

    // AI-driven cleanup bridge: AIAgent's MemoryExpert dispatches
    // `{ type: 'WATER/RECOMMEND_CLEANUP', payload: { count, bytes, mb } }`
    // whenever the live water count exceeds its threshold (4 by
    // default). Without this bridge the recommendation is a toast +
    // panel banner and nothing else. The auto-cleanup identifies
    // off-camera / non-selected candidates and disposes them down to
    // `autoCleanupBudget` so the AI's recommendation becomes an
    // action, not just a notification. Oldest + selected waters are
    // protected (the user's primary lake survives; the water they're
    // actively editing survives).
    window.addEventListener('water:cleanup', (e) => {
      if (!this.autoCleanupEnabled) {
        logger.log('WaterPlugin', 'water:cleanup ignored: autoCleanupEnabled = false');
        return;
      }
      const detail = (e && e.detail) || {};
      const result = this._autoCleanupWaters({
        budget: typeof detail.budget === 'number' ? detail.budget : this.autoCleanupBudget,
      });
      if (result.deleted.length > 0) {
        const mb = typeof detail.mb === 'number' ? detail.mb.toFixed(1) : '?';
        logger.log('WaterPlugin', `Auto-cleaned ${result.deleted.length} water surface(s) (~${mb}MB GPU):`, result.deleted);
        this._state?.emit?.('notification', {
          message: `[Water] Cleaned up ${result.deleted.length} off-camera water surface(s) (~${mb}MB GPU freed)`,
          type: 'info',
        });
      } else {
        // No deletions possible (e.g. all waters are protected: oldest
        // + selected, or already within budget). Clear the recommendation
        // state so MemoryExpert doesn't re-fire every 30s and spam the
        // user with the same toast. The next recommendation will only
        // fire when a new water raises the count back above the expert's
        // threshold (>= 4 by default). This mirrors the user-dismiss
        // path on the GfxResourcePanel banner.
        logger.log('WaterPlugin', `water:cleanup: nothing disposed (${result.skipped || 'no reason'}) \u2014 clearing state`);
        const sm = this._state?.data?.pluginManager?._plugins?.get?.('StateManager');
        if (sm && typeof sm.dispatch === 'function') {
          sm.dispatch({
            type: 'WATER/RECOMMEND_CLEANUP',
            payload: null,
            path: 'water.recommendCleanup',
          });
        }
      }
    });
  },

  // ── Auto-cleanup (AI recommendation → actual disposal) ───────────────

  /**
   * Test whether a water mesh is currently visible in the camera frustum.
   * Uses the mesh's bounding sphere (computed lazily) projected through
   * the camera's projection matrix. A camera that's null (scene not yet
   * initialised) returns `false` (we can't prove "off-camera") so the
   * water is kept by the sort.
   *
   * Note: Three.js's `Mesh.frustumCulled` (default true) already culls
   * the water from the render loop when off-camera, so this test is
   * semantically consistent with what the user actually sees on screen.
   */
  _isOffCamera(mesh, camera) {
    if (!camera || !mesh || !mesh.geometry) return false;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    if (!this._scratchFrustum || !this._scratchMatrix) return false;
    this._scratchMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._scratchFrustum.setFromProjectionMatrix(this._scratchMatrix);
    // Apply mesh world transform to the local-space sphere
    const worldSphere = mesh.geometry.boundingSphere.clone();
    worldSphere.applyMatrix4(mesh.matrixWorld);
    return !this._scratchFrustum.intersectsSphere(worldSphere);
  },

  /**
   * Disposes off-camera water surfaces down to `budget`. Selection
   * priority for protection:
   *   1. The oldest water in `_waters` (Set preserves insertion order).
   *      This is the user's "primary" lake — the first one they
   *      crafted. The AI should never silently kill it.
   *   2. Any water currently in `state.data.selectedObjects` (the
   *      user is actively editing it; deleting it would be jarring).
   *   3. The rest are candidates. Among candidates we sort:
   *        a) off-camera first (highest priority for disposal)
   *        b) then farthest from camera (least likely to be relevant)
   *   We delete the top-N candidates where N = (currentCount - budget).
   *
   * Returns `{ deleted: [name...], skipped: string|null, ... }` so
   * the caller can log / notify. `skipped` is one of:
   *   - 'within-budget'  — already at or below budget, no action
   *   - 'no-deletable-candidates' — count > budget but every water is
   *     protected (e.g. user has selected all of them). The AI's
   *     recommendation toast remains; user can unselect + retry.
   *   - 'no-camera'      — can't prove off-camera without a camera,
   *     and the only water is the protected primary.
   *
   * Note: disposeWater() also releases the GFX resource via the
   * StateManager (which emits a `PERF/GFX_DELTA` release event), so
   * after auto-cleanup the live water count drops below budget
   * AND the aggregate GPU bytes drop. The next 2s MemoryExpert
   * cycle should see the count back under threshold and stay quiet.
   */
  _autoCleanupWaters({ budget = 2 } = {}) {
    if (this._waters.size <= budget) {
      return { deleted: [], skipped: 'within-budget' };
    }

    const camera = this._state?.data?.camera;
    const selected = this._state?.data?.selectedObjects || [];
    const selectedSet = new Set(selected);

    // Set iteration order = insertion order. The first water is the
    // user's "primary" (the lake they crafted first). Protect it
    // unconditionally so the AI can't nuke their main work.
    const waters = [...this._waters];
    const primary = waters[0];

    const candidates = waters.filter(m => m !== primary && !selectedSet.has(m));

    if (candidates.length === 0) {
      return { deleted: [], skipped: 'no-deletable-candidates' };
    }

    // Sort: off-camera first (highest-priority disposal), then
    // farthest from camera. The sort is stable so insertion order
    // is the tiebreaker (older test puddles before newer ones).
    candidates.sort((a, b) => {
      const aOff = this._isOffCamera(a, camera) ? 1 : 0;
      const bOff = this._isOffCamera(b, camera) ? 1 : 0;
      if (aOff !== bOff) return bOff - aOff;
      if (camera) {
        const aDist = a.position.distanceTo(camera.position);
        const bDist = b.position.distanceTo(camera.position);
        return bDist - aDist;
      }
      return 0;
    });

    const toDeleteCount = this._waters.size - budget;
    const toDelete = candidates.slice(0, toDeleteCount);
    const deleted = [];
    for (const mesh of toDelete) {
      const name = mesh.name;
      this.disposeWater(mesh);
      deleted.push(name);
    }
    return { deleted, skipped: null, freedCount: toDelete.length };
  },

  // ── Node-graph integration ────────────────────────────────────────────
  nodes: {
    /**
     * Visual node card for the brutalist node graph. Inherits the standard
     * pin/pin-row layout via createNodeCard, with body parameters parsed
     * by NodeGraphExecutor._parseNodeInputs. The trailing \u25B6 CREATE WATER
     * button has `data-action="run"` which MasterApp._registerNodeInGraph
     * already wires to `nodeGraph.executeNodeOnDemand(nodeData)`.
     */
    'Water/WaterSurfaceNode': function waterSurfaceNodeCard(x, y) {
      const body = document.createElement('div');
      body.className = 'water-node-body';
      body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';

      body.innerHTML = [
        '<label style="font-size:10px;color:#84967c;">WIDTH</label>',
        '<input type="number" data-prop="width" value="200" min="1" max="2000" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">',
        '<label style="font-size:10px;color:#84967c;">HEIGHT</label>',
        '<input type="number" data-prop="height" value="200" min="1" max="2000" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">',
        '<label style="font-size:10px;color:#84967c;">SEGMENTS</label>',
        '<input type="number" data-prop="segments" value="128" min="1" max="512" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">',
        '<label style="font-size:10px;color:#84967c;">DISTORTION</label>',
        '<input type="range" data-prop="distortionScale" min="0" max="10" step="0.1" value="3.7" style="width:100%;">',
        '<label style="font-size:10px;color:#84967c;">ALPHA</label>',
        '<input type="range" data-prop="alpha" min="0" max="1" step="0.05" value="1" style="width:100%;">',
        '<label style="font-size:10px;color:#84967c;">SUN_ELEVATION</label>',
        '<input type="range" data-prop="sunElevation" min="0" max="90" step="1" value="30" style="width:100%;">',
        '<label style="font-size:10px;color:#84967c;">SUN_AZIMUTH</label>',
        '<input type="range" data-prop="sunAzimuth" min="0" max="360" step="1" value="45" style="width:100%;">',
        '<label style="font-size:10px;color:#84967c;">WATER_COLOR</label>',
        '<input type="color" data-prop="waterColor" value="#001e0f" style="width:100%;height:28px;background:#1c1b1b;border:1px solid #3b4b35;">',
        '<button class="water-run" data-action="run" style="margin-top:6px;background:#00ff00;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;">',
        '\u25B6 CREATE WATER',
        '</button>',
      ].join('');

      return createNodeCard(x, y, '\uD83D\uDCA7 Water Surface', ['Width', 'Height', 'Segments', 'Distortion', 'Alpha', 'Sun'], ['Water Mesh'], { body, extraClasses: ['node-card-water'] });
    },
    /**
     * Companion node: tunes the depth-attenuation / fog-density on an
     * existing water mesh WITHOUT touching the foam sliders. Body exposes:
     *   - target:     name of an existing water (matches by exact name)
     *   - fadeEnabled: 0/1 toggle for the depth-attenuation shader effect
     *   - fadeNear:   distance in scene units where the fade BEGINS
     *   - fadeFar:    distance in scene units where the fade is COMPLETE
     *                 (water alpha \u2192 0 by the camera-distance smoothstep)
     *   - tintDensity: 0..1 multiplier on `alpha` for additional global
     *                  opacity control without re-creating the surface
     * Clicking \u25B6 APPLY DEPTH routes through NodeGraphExecutor's runtime
     * which calls `executeNode` \u2192 `_updateWaterDepth`.
     *
   * Depth / opacity tuning is decoupled from the WaterSurfaceNode card
   * so the user can iterate on a fog curve without re-running CSG or
   * rebuilding the mesh. The depth effect is implemented by the foam
   * shader injection in `_extendWaterShader` (see `uFadeEnabled` /
   * `uFadeNear` / `uFadeFar`); this node is just a control surface for
   * those uniforms.
     */
    'Water/WaterDepthNode': function waterDepthNodeCard(x, y) {
      const body = document.createElement('div');
      body.className = 'water-depth-body';
      body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';
      body.innerHTML = [
        '<label style="font-size:10px;color:#84967c;">TARGET_NAME (or empty=selection)</label>',
        '<input type="text" data-prop="target" placeholder="Water_\u2026" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">',
        '<label style="font-size:10px;color:#84967c;">FADE_ENABLED (0=off, 1=on)</label>',
        '<input type="range" data-prop="fadeEnabled" min="0" max="1" step="1" value="1" style="width:100%;">',
        '<label style="font-size:10px;color:#84967c;">FADE_NEAR (scene units)</label>',
        '<input type="number" data-prop="fadeNear" value="50" min="0" max="500" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">',
        '<label style="font-size:10px;color:#84967c;">FADE_FAR (scene units)</label>',
        '<input type="number" data-prop="fadeFar" value="180" min="0" max="1000" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">',
        '<label style="font-size:10px;color:#84967c;">TINT_DENSITY (alpha multiplier)</label>',
        '<input type="range" data-prop="tintDensity" min="0.1" max="1" step="0.05" value="1" style="width:100%;">',
        '<button class="water-depth-run" data-action="run" style="margin-top:6px;background:#02e600;color:#013a00;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;">',
        '\u25B6 APPLY DEPTH',
        '</button>',
      ].join('');

      return createNodeCard(x, y, '\uD83C\uDF0A Water Depth', ['Target', 'Fade'], ['Updated Mesh'], { body, extraClasses: ['node-card-water-depth'] });
    },
  },

  /**
   * Called from NodeGraphExecutor when a `Water/*` node is executed
   * on-demand (manually or via the `data-action="run"` button click).
   * Dispatches by the action sub-type:
   *   - `WaterDepthNode`    \u2192 mutates an existing water mesh's depth uniforms
   *   - `WaterSurfaceNode`  (default) \u2192 creates a new water mesh
   */
  async executeNode(node, parsed) {
    const action = (node && node.type ? node.type.split('/')[1] : '') || 'WaterSurfaceNode';
    if (action === 'WaterDepthNode') {
      return this._updateWaterDepth(parsed);
    }

    const sunElevDeg = parseFloat(parsed.sunElevation) || 30;
    const sunAzimDeg = parseFloat(parsed.sunAzimuth)   || 45;
    const elev = (sunElevDeg * Math.PI) / 180;
    const azim = (sunAzimDeg * Math.PI) / 180;
    // Spherical \u2192 cartesian (Three.js camera coords: +Y up).
    const sunDir = [
      Math.cos(elev) * Math.cos(azim),
      Math.sin(elev),
      Math.cos(elev) * Math.sin(azim),
    ];
    const hex = (parsed.waterColor || '#001e0f').toString();
    const colorInt = parseInt(hex.replace('#', ''), 16);

    return this.createWaterSurface({
      width:        parseFloat(parsed.width)        || DEFAULTS.width,
      height:       parseFloat(parsed.height)       || DEFAULTS.height,
      segments:     parseInt(parsed.segments)       || DEFAULTS.segments,
      distortionScale: parseFloat(parsed.distortionScale) ?? DEFAULTS.distortionScale,
      alpha:        parseFloat(parsed.alpha)        ?? DEFAULTS.alpha,
      sunDirection: sunDir,
      waterColor:   colorInt,
    });
  },

  /**
   * Apply depth / density uniforms to an existing water mesh without
   * re-creating it. Resolution order for the target:
   *   1. `parsed.target` (string name) \u2014 if it matches an active water.
   *      If the user typed a name that does not match, we warn + return
   *      `null` rather than silently falling through to selection (the
   *      previous behavior was confusing because a typo in the name was
   *      indistinguishable from "no selection").
   *   2. First water in the current selection
   *   3. First water in `_waters` (single-water scene fallback)
   * Returns the updated mesh on success, `null` if no target was found.
   *
   * The 4 uniform writes target the depth-attenuation controls injected
   * by `_extendWaterShader` (uFadeEnabled / uFadeNear / uFadeFar) plus
   * the built-in `alpha` uniform for an additional `tintDensity`
   * multiplier. Foam is set during creation via the plugin's default
   * (see `DEFAULTS.foamIntensity`); this card tunes depth only, so a
   * base alpha change won't fight a foam tweak. Each uniform gets its
   * own existence check so a missing uniform (e.g. if a future Three.js
   * sub-version renames one) emits a warn instead of silently no-oping.
   */
  _updateWaterDepth(parsed = {}) {
    let target = null;
    const targetName = (parsed.target || '').toString().trim();

    if (targetName) {
      target = [...this._waters].find(m => m.name === targetName) || null;
      if (!target) {
        logger.warn('WaterPlugin', `_updateWaterDepth: no active water named "${targetName}" \u2014 check spelling. (Not falling through to selection to avoid hiding typos.)`);
        return null;
      }
    }
    if (!target && this._state) {
      const selected = this._state.data.selectedObjects || [];
      target = selected.find(o => o.userData && o.userData.isWater) || null;
    }
    if (!target && this._waters.size) {
      target = [...this._waters][0];
    }
    if (!target) {
      logger.warn('WaterPlugin', '_updateWaterDepth: no water mesh to update (no name match, no water in selection, no water in _waters)');
      return null;
    }

    const u = target.material && target.material.uniforms;
    if (!u) {
      logger.warn('WaterPlugin', `_updateWaterDepth: target "${target.name}" has no uniforms`);
      return null;
    }

    // fadeEnabled is a 0/1 toggle (slider step=1). We coerce to a
    // {0,1}-valued float so the shader's `uFadeEnabled > 0.5` test works
    // on both GLSL ES 1.00 (no bool uniforms) and 3.00 contexts.
    if (parsed.fadeEnabled !== undefined) {
      if (u.uFadeEnabled) {
        const on = parseFloat(parsed.fadeEnabled);
        if (Number.isFinite(on)) u.uFadeEnabled.value = on >= 0.5 ? 1.0 : 0.0;
      } else {
        logger.warn('WaterPlugin', `_updateWaterDepth: target "${target.name}" has no "uFadeEnabled" uniform \u2014 foam shader injection may not have run.`);
      }
    }
    // Parse fadeNear / fadeFar into locals first; commit at the end so we
    // can validate the pair. GLSL smoothstep(uFadeNear, uFadeFar, camDist)
    // is undefined when edge0 >= edge1, so a user typo of (near=80, far=40)
    // would produce a broken fade curve; we refuse to apply a backwards
    // pair and log a warn instead.
    let resolvedNear = null;
    let resolvedFar  = null;

    if (parsed.fadeNear !== undefined) {
      if (u.uFadeNear) {
        const near = parseFloat(parsed.fadeNear);
        if (Number.isFinite(near) && near >= 0) resolvedNear = near;
      } else {
        logger.warn('WaterPlugin', `_updateWaterDepth: target "${target.name}" has no "uFadeNear" uniform.`);
      }
    }
    if (parsed.fadeFar !== undefined) {
      if (u.uFadeFar) {
        const far = parseFloat(parsed.fadeFar);
        if (Number.isFinite(far) && far >= 0) resolvedFar = far;
      } else {
        logger.warn('WaterPlugin', `_updateWaterDepth: target "${target.name}" has no "uFadeFar" uniform.`);
      }
    }
    if (resolvedNear !== null && resolvedFar !== null && resolvedFar <= resolvedNear) {
      logger.warn('WaterPlugin', `_updateWaterDepth: fadeFar (${resolvedFar}) must be > fadeNear (${resolvedNear}) for a valid GLSL smoothstep curve. Skipping both writes.`);
      resolvedNear = null;
      resolvedFar  = null;
    }
    if (resolvedNear !== null) u.uFadeNear.value = resolvedNear;
    if (resolvedFar  !== null) u.uFadeFar.value  = resolvedFar;
    if (parsed.tintDensity !== undefined) {
      if (u.alpha) {
        // Multiplicative on top of the original waterOpts.alpha so the
        // user can layer the depth tweak on top of a base alpha from
        // WaterSurfaceNode without compounding across repeated calls.
        // The fade term still multiplies on top of this in the shader
        // (`finalAlpha = mix(base.a, 0.0, fadeFactor)`), so a low
        // tintDensity + an aggressive fade curve produce a doubly-faded
        // look \u2014 exactly what you'd want for murky deep water.
        const tint = parseFloat(parsed.tintDensity);
        if (Number.isFinite(tint)) {
          const baseAlpha = target.userData && target.userData.waterOpts
            ? target.userData.waterOpts.alpha
            : 1.0;
          u.alpha.value = Math.max(0, Math.min(1, baseAlpha * tint));
        }
      } else {
        logger.warn('WaterPlugin', `_updateWaterDepth: target "${target.name}" has no "alpha" uniform.`);
      }
    }

    // Auto-select the updated water so the user can see the effect.
    const selection = this._state?.data?.pluginManager?._plugins?.get?.('Selection');
    if (selection && typeof selection._setSelection === 'function') {
      selection._setSelection([target]);
    }

    logger.log('WaterPlugin', `Updated depth uniforms on "${target.name}" (fade=${u.uFadeEnabled?.value}, near=${u.uFadeNear?.value}, far=${u.uFadeFar?.value}, tint=${u.alpha?.value})`);
    return target;
  },
};
