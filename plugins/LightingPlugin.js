/**
 * LightingPlugin - Advanced scene lighting with HDRI, light presets, and IES support.
 * Manages all light sources, environment maps, and shadow settings.
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const LightingPlugin = {
  name: 'Lighting',
  _state: null,
  _lights: new Map(),
  _environmentMap: null,
  _lightPresets: new Map(),
  _pmremGenerator: null,
  _defaultPreset: 'studio',

  init(state) {
    this._state = state;
    const renderer = state.data.renderer;
    if (!renderer) {
      logger.warn('LightingPlugin', 'No renderer in state — PMREMGenerator skipped');
      this._initDefaultPresets();
      return;
    }
    this._pmremGenerator = new THREE.PMREMGenerator(renderer);
    this._pmremGenerator.compileEquirectangularShader();

    this._initDefaultPresets();
    this._setupDefaultLighting();

    state.on('scene:cleared', () => this._setupDefaultLighting());
  },

  update(deltaTime) {
    this._lights.forEach((light) => {
      if (light.userData.animate) {
        this._animateLight(light, deltaTime);
      }
    });
  },

  addLight(type, options = {}) {
    const {
      color = 0xffffff,
      intensity = 1,
      position = { x: 0, y: 5, z: 0 },
      target = { x: 0, y: 0, z: 0 },
      castShadow = true,
      shadowMapSize = 2048,
      name = `${type}_Light_${this._lights.size}`
    } = options;

    let light;
    switch (type) {
      case 'point':
        light = new THREE.PointLight(color, intensity, options.distance || 50, options.decay || 2);
        break;
      case 'spot':
        light = new THREE.SpotLight(color, intensity, options.distance || 50,
          THREE.MathUtils.degToRad(options.angle || 45),
          options.penumbra || 0.5, options.decay || 2);
        light.target.position.set(target.x, target.y, target.z);
        this._state.data.scene.add(light.target);
        break;
      case 'directional':
        light = new THREE.DirectionalLight(color, intensity);
        light.target.position.set(target.x, target.y, target.z);
        this._state.data.scene.add(light.target);
        break;
      case 'rectArea':
        light = new THREE.RectAreaLight(color, intensity, options.width || 5, options.height || 5);
        light.lookAt(target.x, target.y, target.z);
        break;
      case 'hemisphere':
        light = new THREE.HemisphereLight(color, options.groundColor || 0x444444, intensity);
        break;
      case 'ambient':
        light = new THREE.AmbientLight(color, intensity);
        break;
      default:
        logger.warn(`[LightingPlugin] Unknown light type: ${type}`);
        return null;
    }

    light.name = name;
    light.position.set(position.x, position.y, position.z);
    if (type !== 'ambient') light.castShadow = castShadow;

    if (castShadow && light.shadow) {
      light.shadow.mapSize.width = shadowMapSize;
      light.shadow.mapSize.height = shadowMapSize;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 100;
      light.shadow.bias = -0.0001;
      light.shadow.normalBias = 0.05;
    }

    light.userData.isLightSource = true;
    light.userData.lightType = type;

    this._state.data.scene.add(light);
    this._lights.set(light.uuid, light);

    this._state.emit('lighting:light:added', { light, type });
    return light;
  },

  removeLight(uuid) {
    const light = this._lights.get(uuid);
    if (!light) return;
    this._state.data.scene.remove(light);
    if (light.target) this._state.data.scene.remove(light.target);
    this._lights.delete(uuid);
    this._state.emit('lighting:light:removed', { uuid });
  },

  async loadHDRI(url, intensity = 1, blur = 0) {
    try {
      const loader = new THREE.TextureLoader();
      const texture = await loader.loadAsync(url);

      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;

      const envMap = this._pmremGenerator.fromEquirectangular(texture).texture;

      this._state.data.scene.environment = envMap;
      this._state.data.scene.background = blur > 0 ? envMap : envMap;
      this._state.data.scene.backgroundIntensity = intensity;
      this._state.data.scene.environmentIntensity = intensity;

      this._environmentMap = envMap;
      texture.dispose();

      this._state.emit('lighting:hdri:loaded', { url, intensity });
      return envMap;
    } catch (err) {
      logger.error('LightingPlugin', 'Failed to load HDRI:', err);
      return null;
    }
  },

  applyPreset(presetName) {
    const preset = this._lightPresets.get(presetName);
    if (!preset) {
      logger.warn('LightingPlugin', `Unknown preset: ${presetName}`);
      return;
    }

    // Clear existing lights (collect UUIDs first to avoid Map iteration + deletion bug)
    const uuids = [...this._lights.keys()];
    uuids.forEach(uuid => this.removeLight(uuid));

    preset.lights.forEach(lightConfig => {
      this.addLight(lightConfig.type, lightConfig.options);
    });

    if (preset.environment) {
      this._state.data.scene.background = new THREE.Color(preset.environment.background);
      this._state.data.scene.backgroundIntensity = preset.environment.intensity || 1;
    }

    if (preset.shadows && this._state.data.renderer) {
      this._state.data.renderer.shadowMap.enabled = preset.shadows.enabled;
      this._state.data.renderer.shadowMap.type = preset.shadows.type || THREE.PCFSoftShadowMap;
    }

    this._state.emit('lighting:preset:applied', { presetName });
  },

  updateLight(uuid, properties) {
    const light = this._lights.get(uuid);
    if (!light) return;
    if (properties.color !== undefined) light.color.set(properties.color);
    if (properties.intensity !== undefined) light.intensity = properties.intensity;
    if (properties.position) light.position.set(properties.position.x, properties.position.y, properties.position.z);
    if (properties.castShadow !== undefined) light.castShadow = properties.castShadow;
    this._state.emit('lighting:light:updated', { uuid, properties });
  },

  // ── Helpers ──

  _initDefaultPresets() {
    this._lightPresets.set('studio', {
      name: 'Studio',
      lights: [
        { type: 'directional', options: { color: 0xffffff, intensity: 1.5, position: { x: 5, y: 10, z: 7 }, castShadow: true } },
        { type: 'hemisphere', options: { color: 0xffffff, groundColor: 0x444444, intensity: 0.6 } },
        { type: 'point', options: { color: 0xffe4c4, intensity: 0.5, position: { x: -5, y: 3, z: -5 } } }
      ],
      environment: { background: 0x1a1a1a, intensity: 0.3 },
      shadows: { enabled: true, type: THREE.PCFSoftShadowMap }
    });

    this._lightPresets.set('outdoor', {
      name: 'Outdoor Daylight',
      lights: [
        { type: 'directional', options: { color: 0xfff4e0, intensity: 2, position: { x: 10, y: 20, z: 10 }, castShadow: true, shadowMapSize: 4096 } },
        { type: 'hemisphere', options: { color: 0x87ceeb, groundColor: 0x3d5c3d, intensity: 0.8 } }
      ],
      environment: { background: 0x87ceeb, intensity: 1 },
      shadows: { enabled: true, type: THREE.PCFSoftShadowMap }
    });

    this._lightPresets.set('night', {
      name: 'Night Scene',
      lights: [
        { type: 'directional', options: { color: 0x4466aa, intensity: 0.3, position: { x: -5, y: 10, z: 5 }, castShadow: true } },
        { type: 'point', options: { color: 0xffaa44, intensity: 1, position: { x: 0, y: 3, z: 0 }, distance: 20 } },
        { type: 'ambient', options: { color: 0x112244, intensity: 0.2 } }
      ],
      environment: { background: 0x0a0a1a, intensity: 0.1 },
      shadows: { enabled: true, type: THREE.PCFSoftShadowMap }
    });

    this._lightPresets.set('dramatic', {
      name: 'Dramatic',
      lights: [
        { type: 'spot', options: { color: 0xffffff, intensity: 3, position: { x: 0, y: 8, z: 5 }, angle: 30, penumbra: 0.8, castShadow: true, shadowMapSize: 4096 } },
        { type: 'point', options: { color: 0xff4444, intensity: 0.5, position: { x: -5, y: 2, z: -3 } } },
        { type: 'point', options: { color: 0x4444ff, intensity: 0.5, position: { x: 5, y: 2, z: -3 } } }
      ],
      environment: { background: 0x000000, intensity: 0.05 },
      shadows: { enabled: true, type: THREE.PCFSoftShadowMap }
    });
  },

  _setupDefaultLighting() {
    this.applyPreset(this._defaultPreset);
  },

  _animateLight(light, deltaTime) {
    if (light.userData.flicker) {
      light.intensity = light.userData.baseIntensity * (0.8 + Math.random() * 0.4);
    }
    if (light.userData.pulse) {
      light.userData.pulseTime = (light.userData.pulseTime || 0) + deltaTime;
      light.intensity = light.userData.baseIntensity * (0.5 + 0.5 * Math.sin(light.userData.pulseTime * 2));
    }
  },

  // ── Visual Nodes ──
  nodes: {
    'Lighting/AddLightNode': (x, y) =>
      createNodeCard(x, y, 'Add Light', ['Type', 'Color', 'Intensity'], ['Light']),

    'Lighting/ApplyPresetNode': (x, y) =>
      createNodeCard(x, y, 'Lighting Preset', ['Preset'], []),

    'Lighting/LoadHDRINode': (x, y) =>
      createNodeCard(x, y, 'Load HDRI', ['URL', 'Intensity'], ['Env Map']),
  }
};