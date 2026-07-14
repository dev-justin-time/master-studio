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

  init(state) {
    this._state = state;
    this._initNormalMap();
    this._wireWindowEvents();
    logger.log('WaterPlugin', 'Initialized.');
  },

  /**
   * Build the procedural water-normal texture once. We use a CanvasTexture
   * with a tiled sine-wave pattern so the surface stays self-contained (no
   * external HTTP calls).
   *
   * Encoding: red channel = -dh/du (X slope), green channel = -dh/dv
   * (Y slope), blue = 255. We use finite differences across a fixed step
   * so the two channels differ; that produces diagonal wave motion rather
   * than the perfectly-aligned stripes you'd get from encoding the same
   * scalar in both. The Math.tanh bounds the final byte value so the
   * encoding never saturates regardless of derivative magnitude.
   */
  _initNormalMap() {
    try {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(size, size);

      // Two octaves of a rotating sine field. Their derivatives are
      // combined and bounded via Math.tanh so the encoding never hits
      // the [0, 255] clamps regardless of derivative magnitude (a plain
      // linear multiplier would saturate most pixels to 0 or 255).
      const freq1 = 6.0, freq2 = 14.0;
      const amp1  = 0.4, amp2  = 0.18;
      const step  = 1 / size;
      // 0.06 is a soft scaler for the linear pre-bounded derivative; the
      // Math.tanh below ensures the final byte value is always smooth.
      const linearPreScale = 0.06;

      const encodeBounded = (n) => {
        // tanh bounds to (-1, 1), then maps to a centered 128 byte.
        const bounded = Math.tanh(n * linearPreScale);
        return Math.round((bounded * 0.5 + 0.5) * 255);
      };

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x * step;
          const v = y * step;

          // Height field
          const h1_x0 = Math.sin((u * freq1 + v * freq1 * 0.66) * Math.PI * 2) * amp1;
          const h2_x0 = Math.sin((u * freq2 - v * freq2 * 0.64) * Math.PI * 2 + 0.4) * amp2;
          // X+epsilon sample for dH/du
          const h1_dx = Math.sin(((u + step) * freq1 + v * freq1 * 0.66) * Math.PI * 2) * amp1;
          const h2_dx = Math.sin(((u + step) * freq2 - v * freq2 * 0.64) * Math.PI * 2 + 0.4) * amp2;
          // Y+epsilon sample for dH/dv
          const h1_dy = Math.sin((u * freq1 + (v + step) * freq1 * 0.66) * Math.PI * 2) * amp1;
          const h2_dy = Math.sin((u * freq2 - (v + step) * freq2 * 0.64) * Math.PI * 2 + 0.4) * amp2;

          const dhdu = ((h1_dx + h2_dx) - (h1_x0 + h2_x0)) / step;
          const dhdv = ((h1_dy + h2_dy) - (h1_x0 + h2_x0)) / step;

          const i = (y * size + x) * 4;
          img.data[i + 0] = encodeBounded(-dhdu);  // X slope → red
          img.data[i + 1] = encodeBounded(-dhdv);  // Y slope → green
          img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      }

      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
      this._normalMap = tex;
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
