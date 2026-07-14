/**
 * AtmospherePlugin.js — Volumetric fog + god rays (crepuscular rays).
 *
 * Combines two atmospheric effects under one plugin:
 *
 *  1. **Volumetric fog** — `THREE.FogExp2` is applied to the scene. This
 *     is Three.js's built-in exponential distance fog; it integrates
 *     natively with `MeshStandardMaterial` (and WaterPlugin's Water
 *     material already gates on `scene.fog !== undefined`). A custom
 *     raymarched 3D fog volume is OUT OF SCOPE for this plugin — it
 *     would require a deferred renderer or a per-material `onBeforeCompile`
 *     injection across every mesh. Distance-fog gets you 90% of the
 *     "volumetric" feel for 1% of the cost. If a future need for true
 *     3D fog arises, that's a separate plugin.
 *
 *  2. **God rays** — a 4-pass screen-space god-rays postprocess using
 *     Three.js's bundled `GodRaysShader.js` (GodRaysFakeSunShader +
 *     GodRaysGenerateShader + GodRaysCombineShader). The "fake sun" pass
 *     renders a bright billboard at the sun's screen position, two
 *     radial-blur generate passes smear it outward, and a combine pass
 *     adds the smudge to the main scene. The whole chain runs at
 *     half-resolution (`MASK_RTT_SCALE = 0.5`) for performance. We
 *     intentionally skip `GodRaysDepthMaskShader` — its purpose is to
 *     occlude the sun behind scene geometry, but the fake-sun shader
 *     already produces a perfectly visible sun regardless of depth
 *     (the cinematic look we want). Depth-aware occlusion can be
 *     added in v2 if needed.
 *
 * Composer integration: the plugin registers a `GodRaysPass` (custom
 * `Pass` subclass) into PhotorealisticRender's composer BEFORE the FXAA
 * pass — the order is: render → ssao → bloom → godRays → fxaa → output.
 * Putting it after Bloom gives the most cinematic look; before FXAA
 * ensures the rays are anti-aliased correctly.
 *
 * Plugin contract:
 *   - `init(state)`: looks up the PhotorealisticRender plugin's composer
 *     and injects the god-rays pass. Sets up `THREE.FogExp2` on the scene.
 *     No-op if the renderer/composer/scene aren't ready yet.
 *   - `update(dt)`: projects the sun position to screen space (the
 *     bundled shader needs screen-space coords, not world space).
 *   - `setVolumetricFog({ enabled, color, density })`: configure fog.
 *   - `setGodRays({ enabled, intensity, decay, weight, samples, exposure,
 *     sunColor, bgColor })`: configure god rays.
 *   - `setSunPosition(Vector3)`: place the sun in world space.
 *   - `setPreset(fogName, godRaysName)`: apply a named preset to either
 *     or both. Recognized: `clear | dusk | foggy | spooky | arctic`
 *     for fog; `off | subtle | cinematic | blazing` for god rays.
 *   - `dispose()`: release the three render targets + remove the pass
 *     from the composer. Idempotent.
 *
 * State coupling: emits `ATMOSPHERE/CHANGED` events via `state.emit`
 * for AI agents / debug panel / other listeners to react to.
 */

import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import {
  GodRaysFakeSunShader,
  GodRaysGenerateShader,
  GodRaysCombineShader,
} from 'three/addons/shaders/GodRaysShader.js';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

// ── Presets ─────────────────────────────────────────────────────────────────

const FOG_PRESETS = Object.freeze({
  clear:  { color: 0x0a0a0a, density: 0.000 },
  dusk:   { color: 0x3a2a1f, density: 0.015 },
  foggy:  { color: 0xa8a8a8, density: 0.045 },
  spooky: { color: 0x150a18, density: 0.060 },
  arctic: { color: 0xc0d8e8, density: 0.022 },
});

const GODRAYS_PRESETS = Object.freeze({
  off:       { intensity: 0.0,  decay: 0.96, weight: 0.5, samples: 60,  exposure: 0.4, sunColor: 0xffeeaa, bgColor: 0x000000 },
  subtle:    { intensity: 0.4,  decay: 0.97, weight: 0.4, samples: 60,  exposure: 0.3, sunColor: 0xffffff, bgColor: 0x000000 },
  cinematic: { intensity: 0.85, decay: 0.94, weight: 0.6, samples: 80,  exposure: 0.6, sunColor: 0xffeeaa, bgColor: 0x000000 },
  blazing:   { intensity: 1.5,  decay: 0.92, weight: 0.7, samples: 100, exposure: 0.8, sunColor: 0xffaa66, bgColor: 0x1a0a05 },
});

const DEFAULT_SUN_POSITION = new THREE.Vector3(15, 25, 15);
const MASK_RTT_SCALE = 0.5;  // half-resolution for the sun-mask + blur passes

// ── Internal Pass: 4-stage god rays chain ───────────────────────────────────

/**
 * Custom `Pass` that runs the entire 4-stage god-rays pipeline:
 *   1. Render fake-sun billboard → `maskRTT`
 *   2. Radial blur (generate)    → `blurRTT1`
 *   3. Radial blur (generate)    → `blurRTT2`
 *   4. Combine scene + blur      → `writeBuffer`
 *
 * The Pass base class's `needsSwap` + `clear` + `renderToScreen` plumbing
 * handles composer integration; we just override `render()` to drive the
 * 4 RTTs + 4 materials.
 */
class GodRaysPass extends Pass {
  constructor({ width, height, fogColor, fogDensity, sunColor, bgColor, intensity, decay, weight, samples, exposure }) {
    super();
    this.needsSwap = true;
    this.clear = false;
    this.renderToScreen = false;

    // Render targets (half-res)
    const rtW = Math.max(1, Math.floor(width * MASK_RTT_SCALE));
    const rtH = Math.max(1, Math.floor(height * MASK_RTT_SCALE));
    const rtParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
    };
    this.maskRTT  = new THREE.WebGLRenderTarget(rtW, rtH, rtParams);
    this.blurRTT1 = new THREE.WebGLRenderTarget(rtW, rtH, rtParams);
    this.blurRTT2 = new THREE.WebGLRenderTarget(rtW, rtH, rtParams);

    // Materials (one per stage)
    this.fakeSunMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GodRaysFakeSunShader.uniforms),
      vertexShader: GodRaysFakeSunShader.vertexShader,
      fragmentShader: GodRaysFakeSunShader.fragmentShader,
    });
    this.generateMaterial1 = this._makeGenerateMaterial();
    this.generateMaterial2 = this._makeGenerateMaterial();
    this.combineMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GodRaysCombineShader.uniforms),
      vertexShader: GodRaysCombineShader.vertexShader,
      fragmentShader: GodRaysCombineShader.fragmentShader,
    });

    this.fsQuad = new Pass.FullScreenQuad();

    // Tunable state (set by the plugin)
    this.intensity = intensity;
    this.exposure = exposure;
    this.decay = decay;
    this.weight = weight;
    this.samples = samples;
    this.fogColor = new THREE.Color(fogColor);
    this.bgColor = new THREE.Color(bgColor);
  }

  _makeGenerateMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GodRaysGenerateShader.uniforms),
      vertexShader: GodRaysGenerateShader.vertexShader,
      fragmentShader: GodRaysGenerateShader.fragmentShader,
    });
  }

  /**
   * Resize the half-res RTTs. Called by `_handleResize` and the plugin's
   * own resize hook.
   */
  setSize(width, height) {
    const rtW = Math.max(1, Math.floor(width * MASK_RTT_SCALE));
    const rtH = Math.max(1, Math.floor(height * MASK_RTT_SCALE));
    this.maskRTT.setSize(rtW, rtH);
    this.blurRTT1.setSize(rtW, rtH);
    this.blurRTT2.setSize(rtW, rtH);
  }

  /**
   * Drive the 4-stage chain. Called once per composer.render() invocation
   * (when the pass is enabled). Read buffer = previous pass's output
   * (the main scene + SSAO + Bloom); write buffer = next pass's input
   * (FXAA in our chain).
   */
  render(renderer, writeBuffer, readBuffer) {
    // If the sun is behind the camera, skip the whole chain to save GPU.
    // The plugin's update(dt) re-syncs `_sunInFront` every frame, so we
    // always see the current value here.
    if (!this._sunInFront) {
      // Just copy the read buffer to the write buffer; no god rays.
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
      } else {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) renderer.clear();
      }
      this.fsQuad.material = this._getCopyMaterial(readBuffer.texture);
      this.fsQuad.render(renderer);
      return;
    }

    // Stage 1: fake-sun billboard → maskRTT
    this.fakeSunMaterial.uniforms.vSunPositionScreenSpace.value.copy(this._sunScreen);
    this.fakeSunMaterial.uniforms.fAspect.value = this._aspect;
    this.fakeSunMaterial.uniforms.sunColor.value.copy(this.sunColor || this.fogColor);
    this.fakeSunMaterial.uniforms.bgColor.value.copy(this.bgColor);
    renderer.setRenderTarget(this.maskRTT);
    renderer.clear();
    this.fsQuad.material = this.fakeSunMaterial;
    this.fsQuad.render(renderer);

    // Stage 2: radial blur maskRTT → blurRTT1
    this._runGenerate(this.generateMaterial1, this.maskRTT.texture, this.blurRTT1, this._fStepSize(0));

    // Stage 3: radial blur blurRTT1 → blurRTT2 (smaller step → longer rays)
    this._runGenerate(this.generateMaterial2, this.blurRTT1.texture, this.blurRTT2, this._fStepSize(1));

    // Stage 4: combine readBuffer (main scene) + blurRTT2 → writeBuffer
    this.combineMaterial.uniforms.tColors.value = readBuffer.texture;
    this.combineMaterial.uniforms.tGodRays.value = this.blurRTT2.texture;
    this.combineMaterial.uniforms.fGodRayIntensity.value = this.intensity * this.exposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.material = this.combineMaterial;
    this.fsQuad.render(renderer);
  }

  _runGenerate(material, inputTex, outputRTT, stepSize) {
    material.uniforms.tInput.value = inputTex;
    material.uniforms.vSunPositionScreenSpace.value.copy(this._sunScreen);
    material.uniforms.fStepSize.value = stepSize;
    renderer.setRenderTarget(outputRTT);
    renderer.clear();
    this.fsQuad.material = material;
    this.fsQuad.render(renderer);
  }

  _fStepSize(passIndex) {
    // Two-pass cascade with decreasing step size produces a long,
    // smooth radial blur. Total effective tap count ≈ samples² which
    // matches the original Crytek-style god rays paper.
    return 1.0 / Math.max(1, this.samples) * (1 + passIndex * 2);
  }

  _getCopyMaterial(srcTex) {
    if (!this.__copyMaterial) {
      this.__copyMaterial = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec2 vUv; uniform sampler2D tDiffuse; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }',
      });
    }
    this.__copyMaterial.uniforms.tDiffuse.value = srcTex;
    return this.__copyMaterial;
  }

  dispose() {
    this.maskRTT.dispose();
    this.blurRTT1.dispose();
    this.blurRTT2.dispose();
    this.fakeSunMaterial.dispose();
    this.generateMaterial1.dispose();
    this.generateMaterial2.dispose();
    this.combineMaterial.dispose();
    if (this.__copyMaterial) this.__copyMaterial.dispose();
    this.fsQuad.dispose();
  }
}

// ── The plugin itself ────────────────────────────────────────────────────────

export const AtmospherePlugin = {
  name: 'Atmosphere',
  _state: null,
  _enabled: { fog: true, godRays: true },
  _fog: { color: 0x3a2a1f, density: 0.015 },
  _godRays: {
    intensity: 0.85, decay: 0.94, weight: 0.6,
    samples: 80, exposure: 0.6,
    sunColor: 0xffeeaa, bgColor: 0x000000,
  },
  _sunPosition: new THREE.Vector3().copy(DEFAULT_SUN_POSITION),
  _sunScreen: new THREE.Vector3(0.5, 0.5, 1),
  // Cached "sun is in front of the camera" flag. Set in update(dt);
  // read by GodRaysPass.render() for the cheap behind-camera early-out.
  // The shader's per-sample fade (`f = z / 1000`) is vestigial (canonical
  // three.js example never exercises it), so we pass a constant z=1.0 to
  // the shader and rely on this boolean for the actual visibility test.
  _sunInFront: true,
  _aspect: 1,
  _godRaysPass: null,
  _composer: null,
  _passIndex: -1,
  _resizeBound: null,

  init(state) {
    this._state = state;
    const scene = state && state.data && state.data.scene;
    if (!scene) {
      logger.warn('AtmospherePlugin', 'No scene in state — fog will not apply. Init deferred.');
      return;
    }

    // 1. Apply default fog
    this._initFog(scene);

    // 2. Wire the god rays pass into PhotorealisticRender's composer
    //    (registered AFTER PhotorealisticRender in MasterApp.js).
    const pr = state.data.pluginManager && state.data.pluginManager._plugins
      ? state.data.pluginManager._plugins.get('PhotorealisticRender')
      : null;
    if (!pr || !pr.composer) {
      logger.warn('AtmospherePlugin', 'PhotorealisticRender.composer not available — god rays disabled. Init deferred.');
      return;
    }
    this._composer = pr.composer;
    this._installGodRaysPass(pr.composer);

    // 3. Resize hook
    this._resizeBound = () => this._handleResize();
    window.addEventListener('resize', this._resizeBound);

    logger.log('AtmospherePlugin', `Initialized (fog=${this._enabled.fog ? 'on' : 'off'}, godRays=${this._enabled.godRays ? 'on' : 'off'}).`);
  },

  _initFog(scene) {
    if (this._enabled.fog) {
      scene.fog = new THREE.FogExp2(this._fog.color, this._fog.density);
    } else {
      // Preserve a null fog so user-toggled "no fog" sticks.
      scene.fog = null;
    }
  },

  _installGodRaysPass(composer) {
    const renderer = this._state.data.renderer;
    const camera = this._state.data.camera;
    const w = renderer ? renderer.domElement.width  : window.innerWidth;
    const h = renderer ? renderer.domElement.height : window.innerHeight;
    this._aspect = w / Math.max(1, h);

    this._godRaysPass = new GodRaysPass({
      width: w, height: h,
      fogColor: this._fog.color,
      fogDensity: this._fog.density,
      sunColor: this._godRays.sunColor,
      bgColor: this._godRays.bgColor,
      intensity: this._godRays.intensity,
      decay: this._godRays.decay,
      weight: this._godRays.weight,
      samples: this._godRays.samples,
      exposure: this._godRays.exposure,
    });
    this._godRaysPass.enabled = this._enabled.godRays;
    // Sync the screen-space sun position (the Pass reads it each frame).
    // The Pass mirrors `_sunScreen` + `_sunInFront` directly; update(dt)
    // re-syncs `_sunInFront` every frame so the behind-camera early-out
    // stays accurate.
    this._godRaysPass._sunScreen = this._sunScreen;
    this._godRaysPass._sunInFront = this._sunInFront;
    this._godRaysPass._aspect = this._aspect;
    this._godRaysPass.sunColor = new THREE.Color(this._godRays.sunColor);
    this._godRaysPass.bgColor = new THREE.Color(this._godRays.bgColor);

    // Look up FXAA via PhotorealisticRender's _passes Map (it's already
    // keyed by name) instead of fragile heuristic search by `uniforms.resolution`
    // (which collides with future passes that have a resolution uniform).
    // Fall back to appending at the end if FXAA is missing from the chain.
    const pr = this._state.data.pluginManager._plugins.get('PhotorealisticRender');
    const passes = composer.passes;
    const fxaaPass = pr && pr._passes ? pr._passes.get('fxaa') : null;
    let fxaaIdx = fxaaPass ? passes.indexOf(fxaaPass) : -1;
    if (fxaaIdx < 0) {
      logger.warn('AtmospherePlugin', 'FXAA pass not found in composer (custom preset?) — appending god rays at the end of the chain.');
      fxaaIdx = passes.length;
    }
    this._passIndex = fxaaIdx;
    passes.splice(this._passIndex, 0, this._godRaysPass);
    logger.log('AtmospherePlugin', `God rays pass inserted at index ${this._passIndex} (before FXAA).`);
  },

  _handleResize() {
    const renderer = this._state && this._state.data && this._state.data.renderer;
    if (!renderer || !this._godRaysPass) return;
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    this._godRaysPass.setSize(w, h);
    this._aspect = w / Math.max(1, h);
  },

  /**
   * Per-frame: project the sun's world position to screen space. The
   * bundled god-rays shader needs uv-space coords. The shader's
   * per-sample fade (`f = z / 1000`) is vestigial (canonical three.js
   * example never exercises it), so we pass a constant z=1.0 and
   * track the "in front of camera" boolean separately for the Pass's
   * early-out (avoids a `setRenderTarget` + 4 draw calls when the sun
   * is off-screen / behind the camera).
   */
  update(dt) {
    if (!this._enabled.godRays || !this._godRaysPass) return;
    const camera = this._state && this._state.data && this._state.data.camera;
    if (!camera) return;

    // Project to NDC: x,y in [-1,1], z in [-1, 1] for in-front-of-camera
    // points. For points behind the camera, the perspective divide can
    // produce z > 1 (the point wraps around the projection).
    this._sunScreen.copy(this._sunPosition).project(camera);
    const clipZ = this._sunScreen.z;
    // After this point, x,y are remapped to [0,1] (uv space).
    this._sunScreen.x = (this._sunScreen.x + 1) * 0.5;
    this._sunScreen.y = (this._sunScreen.y + 1) * 0.5;
    // "In front of camera" = inside the canonical [-1, 1] clip range.
    // The Pass's early-out uses this boolean (not the z value).
    this._sunInFront = clipZ >= -1 && clipZ <= 1;
    if (this._godRaysPass) this._godRaysPass._sunInFront = this._sunInFront;
    // z = 1000 keeps the shader's per-sample fade at f=1.0 (sharpest blur).
    // The shader computes `f = min(1, max(z / 1000, 0))`; smaller z = softer
    // blur, larger z = sharper. The canonical three.js example uses very-far
    // suns whose projected z ≈ 1, so its f ≈ 0.001 (very soft). We want
    // the user-tunable blur quality, so we pass z=1000 for full sharpness.
    this._sunScreen.z = 1000.0;
  },

  // ── Public API ────────────────────────────────────────────────────────────

  setVolumetricFog({ enabled, color, density } = {}) {
    const scene = this._state && this._state.data && this._state.data.scene;
    if (!scene) return;
    if (typeof enabled === 'boolean') this._enabled.fog = enabled;
    if (typeof color === 'number' || typeof color === 'string') {
      this._fog.color = new THREE.Color(color).getHex();
    }
    if (typeof density === 'number') this._fog.density = Math.max(0, density);

    if (this._enabled.fog) {
      if (!scene.fog) {
        scene.fog = new THREE.FogExp2(this._fog.color, this._fog.density);
      } else {
        scene.fog.color.set(this._fog.color);
        scene.fog.density = this._fog.density;
      }
    } else {
      scene.fog = null;
    }
    this._state.emit('atmosphere:changed', { kind: 'fog', ...this._fog, enabled: this._enabled.fog });
  },

  setGodRays({ enabled, intensity, decay, weight, samples, exposure, sunColor, bgColor } = {}) {
    if (typeof enabled === 'boolean') {
      this._enabled.godRays = enabled;
      if (this._godRaysPass) this._godRaysPass.enabled = enabled;
    }
    if (typeof intensity === 'number') this._godRays.intensity = Math.max(0, intensity);
    if (typeof decay === 'number')      this._godRays.decay = Math.min(0.999, Math.max(0.5, decay));
    if (typeof weight === 'number')     this._godRays.weight = Math.max(0, weight);
    if (typeof samples === 'number')    this._godRays.samples = Math.max(2, Math.min(200, samples | 0));
    if (typeof exposure === 'number')   this._godRays.exposure = Math.max(0, exposure);
    if (typeof sunColor === 'number' || typeof sunColor === 'string') {
      this._godRays.sunColor = new THREE.Color(sunColor).getHex();
    }
    if (typeof bgColor === 'number' || typeof bgColor === 'string') {
      this._godRays.bgColor = new THREE.Color(bgColor).getHex();
    }
    if (this._godRaysPass) {
      this._godRaysPass.intensity = this._godRays.intensity;
      this._godRaysPass.exposure = this._godRays.exposure;
      this._godRaysPass.sunColor = new THREE.Color(this._godRays.sunColor);
      this._godRaysPass.bgColor = new THREE.Color(this._godRays.bgColor);
    }
    this._state.emit('atmosphere:changed', { kind: 'godRays', ...this._godRays, enabled: this._enabled.godRays });
  },

  setSunPosition(vec3) {
    if (!vec3) return;
    this._sunPosition.copy(vec3);
  },

  setSunFromObject(object3d) {
    if (!object3d) return;
    this._sunPosition.copy(object3d.position);
  },

  setPreset(fogName, godRaysName) {
    if (fogName && FOG_PRESETS[fogName]) {
      const f = FOG_PRESETS[fogName];
      this.setVolumetricFog({ enabled: f.density > 0, color: f.color, density: f.density });
    }
    if (godRaysName && GODRAYS_PRESETS[godRaysName]) {
      const g = GODRAYS_PRESETS[godRaysName];
      const enabled = godRaysName !== 'off';
      this.setGodRays({
        enabled,
        intensity: g.intensity,
        decay: g.decay,
        weight: g.weight,
        samples: g.samples,
        exposure: g.exposure,
        sunColor: g.sunColor,
        bgColor: g.bgColor,
      });
    }
    this._state.emit('atmosphere:preset', { fog: fogName, godRays: godRaysName });
  },

  dispose() {
    if (this._resizeBound) {
      window.removeEventListener('resize', this._resizeBound);
      this._resizeBound = null;
    }
    if (this._godRaysPass && this._composer) {
      const idx = this._composer.passes.indexOf(this._godRaysPass);
      if (idx >= 0) this._composer.passes.splice(idx, 1);
    }
    if (this._godRaysPass) {
      this._godRaysPass.dispose();
      this._godRaysPass = null;
    }
    this._composer = null;
    this._passIndex = -1;
    // We deliberately do NOT clear `scene.fog` — the user might have
    // configured it before the plugin was installed.
    logger.log('AtmospherePlugin', 'Disposed.');
  },

  // ── Node Graph Integration ───────────────────────────────────────────────

  async executeNode(node, parsed) {
    const action = (node && node.type ? node.type.split('/')[1] : '') || 'FogNode';
    switch (action) {
      case 'FogNode': {
        const enabled = parsed.enabled === undefined ? true : (String(parsed.enabled) !== '0' && parsed.enabled !== 'false');
        const color = parsed.color || '#3a2a1f';
        const colorInt = parseInt(color.toString().replace('#', ''), 16);
        const density = parseFloat(parsed.density);
        this.setVolumetricFog({ enabled, color: colorInt, density: Number.isFinite(density) ? density : 0.015 });
        return this._fog;
      }
      case 'GodRaysNode': {
        const enabled = parsed.enabled === undefined ? true : (String(parsed.enabled) !== '0' && parsed.enabled !== 'false');
        const opts = { enabled };
        if (parsed.intensity !== undefined) opts.intensity = parseFloat(parsed.intensity);
        if (parsed.decay      !== undefined) opts.decay = parseFloat(parsed.decay);
        if (parsed.weight     !== undefined) opts.weight = parseFloat(parsed.weight);
        if (parsed.samples    !== undefined) opts.samples = parseFloat(parsed.samples);
        if (parsed.exposure   !== undefined) opts.exposure = parseFloat(parsed.exposure);
        if (parsed.sunColor)  opts.sunColor = parseInt(parsed.sunColor.toString().replace('#', ''), 16);
        if (parsed.bgColor)   opts.bgColor  = parseInt(parsed.bgColor.toString().replace('#', ''), 16);
        // Optional sun position override
        const sx = parseFloat(parsed.sunX), sy = parseFloat(parsed.sunY), sz = parseFloat(parsed.sunZ);
        if (Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz)) {
          this.setSunPosition(new THREE.Vector3(sx, sy, sz));
        }
        this.setGodRays(opts);
        return this._godRays;
      }
      case 'AtmospherePresetNode': {
        const preset = (parsed.preset || 'dusk').toString();
        const idx = preset.indexOf('+');
        if (idx > 0) {
          this.setPreset(preset.slice(0, idx), preset.slice(idx + 1));
        } else if (FOG_PRESETS[preset]) {
          this.setPreset(preset);
        } else if (GODRAYS_PRESETS[preset]) {
          this.setPreset(null, preset);
        } else {
          logger.warn('AtmospherePlugin', `Unknown preset: ${preset}`);
        }
        return { fog: this._fog, godRays: this._godRays };
      }
      default:
        logger.warn('AtmospherePlugin', `Unknown node action: ${action}`);
        return null;
    }
  },

  // ── Visual Nodes ──────────────────────────────────────────────────────────

  nodes: {
    'Atmosphere/FogNode': (x, y) => {
      const body = document.createElement('div');
      body.className = 'atmosphere-fog-body';
      body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';
      body.innerHTML = [
        // Implementation note: this is THREE.FogExp2 (exponential distance
        // fog), not true 3D raymarched volumetric fog. The latter would
        // require per-material shader injection across the whole scene.
        '<div style="font-size:9px;color:#5a6a4a;font-style:italic;">THREE.FogExp2 (distance-based)</div>',
        '<label style="font-size:10px;color:#84967c;">ENABLED</label>',
        '<select class="node-input" data-prop="enabled" style="background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;">',
        '<option value="1">ON</option><option value="0">OFF</option></select>',
        '<label style="font-size:10px;color:#84967c;">FOG_COLOR</label>',
        '<input type="color" data-prop="color" value="#3a2a1f" style="width:100%;height:24px;background:#1c1b1b;border:1px solid #3b4b35;">',
        '<label style="font-size:10px;color:#84967c;">DENSITY (0 = clear, 0.06 = thick)</label>',
        '<input type="range" data-prop="density" min="0" max="0.08" step="0.001" value="0.015" style="width:100%">',
        '<button class="atmosphere-run" data-action="run" style="margin-top:6px;background:#3a4d3a;color:#d4f5cd;border:2px solid #000;font-weight:700;padding:5px;cursor:pointer;">\u25B6 APPLY FOG</button>',
      ].join('');
      return createNodeCard(x, y, '\uD83C\uDF2B\uFE0F Fog (Exponential)', ['Enabled', 'Color', 'Density'], [], { body, extraClasses: ['node-card-atmosphere'] });
    },
    'Atmosphere/GodRaysNode': (x, y) => {
      const body = document.createElement('div');
      body.className = 'atmosphere-godrays-body';
      body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';
      body.innerHTML = [
        '<label style="font-size:10px;color:#84967c;">ENABLED</label>',
        '<select class="node-input" data-prop="enabled" style="background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;">',
        '<option value="1">ON</option><option value="0">OFF</option></select>',
        '<div style="display:flex;gap:4px;">',
        '<div style="flex:1"><label style="font-size:10px;color:#84967c;">SUN X</label><input type="number" data-prop="sunX" value="15" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;"></div>',
        '<div style="flex:1"><label style="font-size:10px;color:#84967c;">SUN Y</label><input type="number" data-prop="sunY" value="25" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;"></div>',
        '<div style="flex:1"><label style="font-size:10px;color:#84967c;">SUN Z</label><input type="number" data-prop="sunZ" value="15" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;"></div>',
        '</div>',
        '<label style="font-size:10px;color:#84967c;">INTENSITY (0 = off, 2 = blazing)</label>',
        '<input type="range" data-prop="intensity" min="0" max="2" step="0.01" value="0.85" style="width:100%">',
        '<label style="font-size:10px;color:#84967c;">DECAY (0.9 = long, 0.99 = tight)</label>',
        '<input type="range" data-prop="decay" min="0.5" max="0.999" step="0.001" value="0.94" style="width:100%">',
        '<label style="font-size:10px;color:#84967c;">SAMPLES (30 = fast, 100 = quality)</label>',
        '<input type="number" data-prop="samples" value="80" min="2" max="200" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;">',
        '<label style="font-size:10px;color:#84967c;">EXPOSURE (0 = subtle, 1 = full)</label>',
        '<input type="range" data-prop="exposure" min="0" max="1" step="0.01" value="0.6" style="width:100%">',
        '<label style="font-size:10px;color:#84967c;">SUN_COLOR</label>',
        '<input type="color" data-prop="sunColor" value="#ffeeaa" style="width:100%;height:24px;background:#1c1b1b;border:1px solid #3b4b35;">',
        '<button class="atmosphere-godrays-run" data-action="run" style="margin-top:6px;background:#3a4d3a;color:#d4f5cd;border:2px solid #000;font-weight:700;padding:5px;cursor:pointer;">\u2600\uFE0F APPLY GOD RAYS</button>',
      ].join('');
      return createNodeCard(x, y, '\u2600\uFE0F God Rays', ['Enabled', 'Sun XYZ', 'Intensity', 'Decay', 'Samples', 'Exposure', 'SunColor'], [], { body, extraClasses: ['node-card-atmosphere'] });
    },
    'Atmosphere/AtmospherePresetNode': (x, y) => {
      const body = document.createElement('div');
      body.className = 'atmosphere-preset-body';
      body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';
      body.innerHTML = [
        '<label style="font-size:10px;color:#84967c;">PRESET</label>',
        '<select class="node-input" data-prop="preset" style="background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;">',
        '<option value="dusk+cinematic">Dusk + Cinematic</option>',
        '<option value="foggy+subtle">Foggy + Subtle</option>',
        '<option value="spooky+blazing">Spooky + Blazing</option>',
        '<option value="arctic+cinematic">Arctic + Cinematic</option>',
        '<option value="clear+off">Clear (no effects)</option>',
        '<option value="dusk">Dusk only</option>',
        '<option value="cinematic">Cinematic god rays only</option>',
        '</select>',
        '<button class="atmosphere-preset-run" data-action="run" style="margin-top:6px;background:#3a4d3a;color:#d4f5cd;border:2px solid #000;font-weight:700;padding:5px;cursor:pointer;">\u2728 APPLY PRESET</button>',
      ].join('');
      return createNodeCard(x, y, '\uD83C\uDF05 Atmosphere Preset', ['Preset'], [], { body, extraClasses: ['node-card-atmosphere'] });
    },
  },
};
