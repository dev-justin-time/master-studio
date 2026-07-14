/**
 * PhotorealisticRenderPlugin - Advanced post-processing and rendering pipeline.
 * Includes bloom, SSAO, tone mapping, FXAA, and render presets.
 *
 * Exposes `composer` and `update()` so MasterApp can use it as the
 * primary render pipeline, replacing its own EffectComposer.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const PhotorealisticRenderPlugin = {
  name: 'PhotorealisticRender',
  _state: null,
  composer: null,
  _passes: new Map(),
  _renderPresets: new Map(),
  _currentPreset: 'preview',

  init(state) {
    this._state = state;

    this._initRenderPresets();
    this._initComposer();
    this.applyPreset('preview');

    logger.log('PhotorealisticRender', 'Pipeline initialized.');
  },

  update(deltaTime) {
    if (this._passes.has('bloom')) {
      const bloomPass = this._passes.get('bloom');
      if (bloomPass.userData?.animate) {
        bloomPass.strength = bloomPass.userData.baseStrength *
          (0.8 + 0.2 * Math.sin(performance.now() * 0.001));
      }
    }
  },

  _initComposer() {
    const renderer = this._state.data.renderer;
    const scene = this._state.data.scene;
    const camera = this._state.data.camera;
    if (!renderer || !scene || !camera) {
      logger.warn('PhotorealisticRender', 'Missing renderer/scene/camera — composer skipped');
      return;
    }

    this.composer = new EffectComposer(renderer);

    // 1. Render Pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);
    this._passes.set('render', renderPass);

    // 2. SSAO Pass
    const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.1;
    ssaoPass.enabled = false;
    this.composer.addPass(ssaoPass);
    this._passes.set('ssao', ssaoPass);

    // 3. Bloom Pass
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, 0.4, 0.85
    );
    bloomPass.enabled = false;
    this.composer.addPass(bloomPass);
    this._passes.set('bloom', bloomPass);

    // 4. FXAA Pass
    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
    this.composer.addPass(fxaaPass);
    this._passes.set('fxaa', fxaaPass);

    // 5. Output Pass (tone mapping + color space)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
    this._passes.set('output', outputPass);

    window.addEventListener('resize', () => this._handleResize());
  },

  applyPreset(presetName) {
    const preset = this._renderPresets.get(presetName);
    if (!preset) {
      logger.warn(`[PhotorealisticRender] Unknown preset: ${presetName}`);
      return;
    }

    // Apply SSAO
    if (this._passes.has('ssao')) {
      const ssaoPass = this._passes.get('ssao');
      ssaoPass.enabled = preset.ssao.enabled;
      if (preset.ssao.kernelRadius) ssaoPass.kernelRadius = preset.ssao.kernelRadius;
    }

    // Apply Bloom
    if (this._passes.has('bloom')) {
      const bloomPass = this._passes.get('bloom');
      bloomPass.enabled = preset.bloom.enabled;
      bloomPass.strength = preset.bloom.strength;
      bloomPass.radius = preset.bloom.radius;
      bloomPass.threshold = preset.bloom.threshold;
    }

    // Apply FXAA
    if (this._passes.has('fxaa')) {
      this._passes.get('fxaa').enabled = preset.fxaa;
    }

    // Apply tone mapping + renderer settings
    const renderer = this._state.data.renderer;
    if (renderer) {
      renderer.toneMapping = preset.toneMapping;
      renderer.toneMappingExposure = preset.exposure;
      renderer.shadowMap.type = preset.shadowType;
      renderer.setPixelRatio(preset.pixelRatio);
    }

    this._currentPreset = presetName;
    this._state.emit('rendering:preset:applied', { presetName });
  },

  setSSAO(enabled, options = {}) {
    const ssaoPass = this._passes.get('ssao');
    if (!ssaoPass) return;
    ssaoPass.enabled = enabled;
    if (options.kernelRadius) ssaoPass.kernelRadius = options.kernelRadius;
    if (options.minDistance) ssaoPass.minDistance = options.minDistance;
    if (options.maxDistance) ssaoPass.maxDistance = options.maxDistance;
    this._state.emit('rendering:ssao:toggled', { enabled, options });
  },

  setBloom(enabled, options = {}) {
    const bloomPass = this._passes.get('bloom');
    if (!bloomPass) return;
    bloomPass.enabled = enabled;
    if (options.strength !== undefined) bloomPass.strength = options.strength;
    if (options.radius !== undefined) bloomPass.radius = options.radius;
    if (options.threshold !== undefined) bloomPass.threshold = options.threshold;
    this._state.emit('rendering:bloom:toggled', { enabled, options });
  },

  setToneMapping(mode, exposure = 1) {
    const renderer = this._state.data.renderer;
    if (!renderer) return;
    renderer.toneMapping = mode;
    renderer.toneMappingExposure = exposure;
    this._state.emit('rendering:toneMapping:changed', { mode, exposure });
  },

  async captureScreenshot(options = {}) {
    const renderer = this._state.data.renderer;
    if (!renderer) return null;
    const { width = 1920, height = 1080, format = 'image/png' } = options;

    const origW = renderer.domElement.width;
    const origH = renderer.domElement.height;

    renderer.setSize(width, height);
    this.composer?.setSize(width, height);
    this.composer?.render();
    const dataURL = renderer.domElement.toDataURL(format);

    renderer.setSize(origW, origH);
    this.composer?.setSize(origW, origH);

    this._state.emit('rendering:screenshot:captured', { width, height, format });
    return dataURL;
  },

  toggleRaytracing(enabled) {
    this._state.emit('rendering:raytracing:toggled', { enabled });
    logger.log('PhotorealisticRender', `Raytracing ${enabled ? 'enabled' : 'disabled'} (experimental)`);
  },

  // ── Helpers ──

  _initRenderPresets() {
    this._renderPresets.set('draft', {
      name: 'Draft',
      ssao: { enabled: false },
      bloom: { enabled: false, strength: 0, radius: 0, threshold: 0 },
      fxaa: false,
      toneMapping: THREE.ACESFilmicToneMapping,
      exposure: 1,
      shadowType: THREE.BasicShadowMap,
      pixelRatio: 1
    });

    this._renderPresets.set('preview', {
      name: 'Preview',
      ssao: { enabled: true, kernelRadius: 16 },
      bloom: { enabled: true, strength: 0.5, radius: 0.4, threshold: 0.85 },
      fxaa: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      exposure: 1,
      shadowType: THREE.PCFSoftShadowMap,
      pixelRatio: Math.min(window.devicePixelRatio, 2)
    });

    this._renderPresets.set('production', {
      name: 'Production',
      ssao: { enabled: true, kernelRadius: 32 },
      bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.7 },
      fxaa: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      exposure: 1.2,
      shadowType: THREE.PCFSoftShadowMap,
      pixelRatio: 2
    });

    this._renderPresets.set('cinematic', {
      name: 'Cinematic',
      ssao: { enabled: true, kernelRadius: 24 },
      bloom: { enabled: true, strength: 1.2, radius: 0.8, threshold: 0.6 },
      fxaa: true,
      toneMapping: THREE.CineonToneMapping,
      exposure: 1.5,
      shadowType: THREE.PCFSoftShadowMap,
      pixelRatio: 2
    });
  },

  _handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer?.setSize(w, h);
    const fxaaPass = this._passes.get('fxaa');
    if (fxaaPass) {
      fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
    }
  },

  // ── Visual Nodes ──
  nodes: {
    'Rendering/ApplyPresetNode': (x, y) =>
      createNodeCard(x, y, 'Render Preset', ['Preset'], []),

    'Rendering/SSAONode': (x, y) =>
      createNodeCard(x, y, 'Screen Space AO', ['Enabled', 'Kernel Radius'], []),

    'Rendering/BloomNode': (x, y) =>
      createNodeCard(x, y, 'Bloom', ['Enabled', 'Strength', 'Threshold'], []),

    'Rendering/CaptureScreenshot': (x, y) =>
      createNodeCard(x, y, 'Capture Screenshot', ['Width', 'Height'], ['Screenshot']),
  }
};