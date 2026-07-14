/**
 * LightingPlugin - Unified lighting + camera + recording system.
 *
 * Merges the prior LightingCameraPlugin's responsibilities (view presets,
 * frame-selected/all, camera animations) with LightingPlugin's lighting
 * management (lights, HDRI env maps, light presets, GFX resource tracking).
 *
 * New in this revision:
 *   - OrthographicCamera toggle (top / front / right switch to ortho for
 *     blueprint-style viewing)
 *   - StereoscopicCamera: a pair of PerspectiveCameras offset by an
 *     interpupillary distance, rendered side-by-side via setViewport +
 *     setScissor. Mode toggle: 'off' | 'sbs' (side-by-side) | 'anaglyph'.
 *   - MediaRecorder over renderer.domElement.captureStream(60), with
 *     optional getUserMedia microphone audio. WebM (VP9/Opus) preferred,
 *     falls back to VP8/WebM/MP4. Output via Blob + <a download>.
 *   - Frame export: captureFrame({format,w,h}) returns a Blob; exportFrame()
 *     forces a render then triggers a download.
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

const DEFAULT_IPD = 0.064; // 6.4cm — average human interpupillary distance
const STEREO_MODES = Object.freeze(['off', 'sbs', 'anaglyph']);

const RECORDER_MIME_PREFERENCE = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

export const LightingPlugin = {
  name: 'Lighting',
  _state: null,
  _lights: new Map(),
  _environmentMap: null,
  _lightPresets: new Map(),
  _cameraPresets: new Map(),
  _pmremGenerator: null,
  _defaultPreset: 'studio',

  _cameraType: 'perspective',
  _orthoViewSize: 10,

  _stereoMode: 'off',
  _stereoCamL: null,
  _stereoCamR: null,
  _stereoIPD: DEFAULT_IPD,
  _previousCamera: null,

  _mediaRecorder: null,
  _recorderStream: null,
  _recorderChunks: [],
  _recorderMime: null,
  _recorderAudio: false,
  _recording: false,
  _recordingStartedAt: 0,

  init(state) {
    this._state = state;
    const renderer = state.data.renderer;
    if (!renderer) {
      logger.warn('LightingPlugin', 'No renderer in state — PMREMGenerator skipped');
      this._initDefaultPresets();
      this._initDefaultCameraPresets();
      this._setupEventListeners();
      return;
    }
    this._pmremGenerator = new THREE.PMREMGenerator(renderer);
    this._pmremGenerator.compileEquirectangularShader();

    this._initDefaultPresets();
    this._initDefaultCameraPresets();
    this._setupEventListeners();
    this._setupDefaultLighting();

    state.on('scene:cleared', () => this._setupDefaultLighting());
  },

  update(deltaTime) {
    this._lights.forEach((light) => {
      if (light.userData.animate) this._animateLight(light, deltaTime);
    });
    if (this._stereoMode === 'sbs' && this._stereoCamL && this._stereoCamR) {
      const main = this._state.data.camera;
      if (main) this._syncStereoFromMain(main);
    }
  },

  _getStateManager() {
    return this._state && this._state.data && this._state.data.pluginManager
      ? this._state.data.pluginManager._plugins && this._state.data.pluginManager._plugins.get('StateManager')
      : null;
  },

  // ── Lighting ────────────────────────────────────────────────────────────

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
        logger.warn('LightingPlugin', `Unknown light type: ${type}`);
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

      const sm = this._getStateManager();
      if (sm && typeof sm.trackGfxResource === 'function') {
        const w = light.shadow.mapSize.width;
        const h = light.shadow.mapSize.height;
        const faces = light.isPointLight ? 6 : 1;
        const bytes = w * h * 4 * faces;
        const id = `shadow/${light.uuid}/${w}x${h}`;
        sm.trackGfxResource(id, bytes, 'shadow-map', light.name || `${type}_Light_${this._lights.size}`);
        light.userData.gfxResourceId = id;
      }
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

    if (light.userData && light.userData.gfxResourceId) {
      const sm = this._getStateManager();
      if (sm && typeof sm.releaseGfxResource === 'function') {
        sm.releaseGfxResource(light.userData.gfxResourceId);
      }
      delete light.userData.gfxResourceId;
    }

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

      if (this._environmentMap && this._environmentMap !== envMap) {
        if (this._environmentMap.userData && this._environmentMap.userData.gfxResourceId) {
          const sm = this._getStateManager();
          if (sm && typeof sm.releaseGfxResource === 'function') {
            sm.releaseGfxResource(this._environmentMap.userData.gfxResourceId);
          }
        }
      }

      this._environmentMap = envMap;
      texture.dispose();

      const sm = this._getStateManager();
      if (sm && typeof sm.trackGfxResource === 'function') {
        const w = (envMap.image && envMap.image[0] && envMap.image[0].width) || 256;
        const h = (envMap.image && envMap.image[0] && envMap.image[0].height) || 256;
        const bytes = w * h * 4 * 6;
        const label = (url || '').split('/').pop() || 'hdri';
        const id = `hdri/${url || 'env'}`;
        sm.trackGfxResource(id, bytes, 'hdri-envmap', label);
        envMap.userData = envMap.userData || {};
        envMap.userData.gfxResourceId = id;
      }

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

  // ── Camera: presets + animations (merged from LightingCameraPlugin) ─────

  _initDefaultCameraPresets() {
    this._cameraPresets.set('perspective', {
      position: { x: 6, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 75, type: 'perspective',
    });
    this._cameraPresets.set('top', {
      position: { x: 0, y: 15, z: 0.1 }, target: { x: 0, y: 0, z: 0 }, fov: 50, type: 'orthographic',
    });
    this._cameraPresets.set('front', {
      position: { x: 0, y: 3, z: 15 }, target: { x: 0, y: 0, z: 0 }, fov: 50, type: 'orthographic',
    });
    this._cameraPresets.set('right', {
      position: { x: 15, y: 3, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50, type: 'orthographic',
    });
    this._cameraPresets.set('iso', {
      position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 35, type: 'perspective',
    });
  },

  setCameraView(presetName) {
    const preset = this._cameraPresets.get(presetName);
    if (!preset) return;

    const camera = this._state.data.camera;
    const controls = this._state.data.controls;
    if (!camera || !controls) return;

    if (preset.type) this.setCameraType(preset.type);

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPos = new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z);
    const endTarget = new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z);

    if (preset.fov && camera.isPerspectiveCamera) {
      camera.fov = preset.fov;
      camera.updateProjectionMatrix();
    }

    const duration = 400;
    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, endPos, ease);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      controls.update();
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    this._state.emit('camera:view:changed', { preset: presetName, type: preset.type });
  },

  setCameraType(type) {
    if (type !== 'perspective' && type !== 'orthographic') {
      logger.warn('LightingPlugin', `setCameraType: unknown type "${type}"`);
      return;
    }
    if (type === this._cameraType) return;

    const oldCam = this._state.data.camera;
    const aspect = oldCam ? oldCam.aspect : (window.innerWidth / Math.max(1, window.innerHeight));
    const oldPos = oldCam ? oldCam.position.clone() : new THREE.Vector3(0, 5, 10);
    const oldFov = oldCam && oldCam.isPerspectiveCamera ? oldCam.fov : 50;
    const oldNear = oldCam ? oldCam.near : 0.1;
    const oldFar = oldCam ? oldCam.far : 1000;

    let newCam;
    if (type === 'orthographic') {
      const half = this._orthoViewSize;
      newCam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 2000);
    } else {
      newCam = new THREE.PerspectiveCamera(oldFov, aspect, oldNear, oldFar);
    }
    newCam.position.copy(oldPos);

    this._state.data.camera = newCam;
    if (this._state.data.controls) {
      this._state.data.controls.object = newCam;
      this._state.data.controls.update();
    }
    this._cameraType = type;
    if (oldCam && oldCam.dispose) oldCam.dispose();

    this._state.emit('camera:type:changed', { type });
    logger.log('LightingPlugin', `Camera → ${type}`);
  },

  frameSelected() {
    const selected = this._state.data.selectedObjects;
    if (!selected || selected.length === 0) return;
    const box = new THREE.Box3();
    selected.forEach(obj => box.expandByObject(obj));
    this._frameBox(box);
  },

  frameAll() {
    const scene = this._state.data.scene;
    if (!scene) return;
    const box = new THREE.Box3();
    scene.traverse(obj => { if (obj.userData?.isManagedObject) box.expandByObject(obj); });
    if (box.isEmpty()) return;
    this._frameBox(box);
  },

  _frameBox(box) {
    const camera = this._state.data.camera;
    const controls = this._state.data.controls;
    if (!camera || !controls) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);

    if (camera.isPerspectiveCamera) {
      const fov = camera.fov * (Math.PI / 180);
      const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.5;
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.length() < 0.01) dir.set(0, 0, 1);
      camera.position.copy(center).addScaledVector(dir, dist);
    } else {
      const padding = 1.2;
      this._orthoViewSize = (maxDim / 2) * padding;
      const aspect = camera.aspect;
      camera.left = -this._orthoViewSize * aspect;
      camera.right = this._orthoViewSize * aspect;
      camera.top = this._orthoViewSize;
      camera.bottom = -this._orthoViewSize;
      camera.updateProjectionMatrix();
    }
    controls.target.copy(center);
    controls.update();
  },

  applyLightingPreset(presetName) {
    this.applyPreset(presetName);
    logger.log('LightingPlugin', `Lighting preset → ${presetName}`);
  },

  // ── Stereoscopic camera ──────────────────────────────────────────────────

  setStereoMode(mode) {
    if (!STEREO_MODES.includes(mode)) {
      logger.warn('LightingPlugin', `setStereoMode: unknown mode "${mode}"`);
      return;
    }
    if (mode === this._stereoMode) return;

    const renderer = this._state.data.renderer;
    if (!renderer) return;

    if (this._stereoMode === 'sbs') this._disableSBS();
    if (this._stereoMode === 'anaglyph') this._disableAnaglyph();

    this._stereoMode = mode;
    if (mode === 'sbs') this._enableSBS(renderer);
    if (mode === 'anaglyph') this._enableAnaglyph(renderer);

    this._state.emit('camera:stereo:changed', { mode });
    logger.log('LightingPlugin', `Stereo mode → ${mode}`);
  },

  getStereoMode() { return this._stereoMode; },

  setInterpupillaryDistance(meters) {
    this._stereoIPD = Math.max(0, Number(meters) || DEFAULT_IPD);
    this._state?.emit('camera:stereo:ipd:changed', { ipd: this._stereoIPD });
  },

  _enableSBS(renderer) {
    this._ensureStereoCameras();
    this._previousCamera = this._state.data.camera;
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    this._stereoCamL.viewport = new THREE.Vector4(0, 0, w / 2, h);
    this._stereoCamL.setViewOffset(w, h, 0, 0, w / 2, h);
    this._stereoCamR.viewport = new THREE.Vector4(w / 2, 0, w / 2, h);
    this._stereoCamR.setViewOffset(w, h, w / 2, 0, w / 2, h);
    this._state.data.camera = this._stereoCamL;
    if (this._state.data.controls) this._state.data.controls.object = this._stereoCamL;
    // autoClear stays true; the R pass in renderStereoRightHalf()
    // uses scissor+clearDepth so it doesn't clobber the L pass.
    renderer.autoClear = true;
  },

  _disableSBS() {
    const renderer = this._state.data.renderer;
    if (renderer) renderer.autoClear = true;
    if (this._stereoCamL) {
      this._stereoCamL.clearViewOffset();
      this._stereoCamL.viewport.set(0, 0, 0, 0);
    }
    if (this._stereoCamR) {
      this._stereoCamR.clearViewOffset();
      this._stereoCamR.viewport.set(0, 0, 0, 0);
    }
    if (this._previousCamera) {
      this._state.data.camera = this._previousCamera;
      if (this._state.data.controls) this._state.data.controls.object = this._previousCamera;
    }
  },

  _enableAnaglyph() {
    // Anaglyph needs a shader pass on the EffectComposer. Without
    // anaglyph post-processing injected into PhotorealisticRender's
    // composer, this falls back to off and warns the user.
    logger.warn('LightingPlugin', "Anaglyph mode requires the AnaglyphEffect pass. Falling back to 'off'.");
    this._stereoMode = 'off';
  },

  _disableAnaglyph() { /* no-op */ },

  _ensureStereoCameras() {
    const main = this._state.data.camera;
    if (!main) return;
    if (!this._stereoCamL) {
      this._stereoCamL = new THREE.PerspectiveCamera(
        main.isPerspectiveCamera ? main.fov : 50,
        main.aspect || 1, main.near || 0.1, main.far || 1000);
    }
    if (!this._stereoCamR) {
      this._stereoCamR = new THREE.PerspectiveCamera(
        main.isPerspectiveCamera ? main.fov : 50,
        main.aspect || 1, main.near || 0.1, main.far || 1000);
    }
    this._syncStereoFromMain(main);
  },

  _syncStereoFromMain(main) {
    if (!this._stereoCamL || !this._stereoCamR) return;
    this._stereoCamL.position.copy(main.position);
    this._stereoCamR.position.copy(main.position);
    this._stereoCamL.quaternion.copy(main.quaternion);
    this._stereoCamR.quaternion.copy(main.quaternion);
    this._stereoCamL.aspect = main.aspect;
    this._stereoCamR.aspect = main.aspect;
    this._stereoCamL.fov = main.fov;
    this._stereoCamR.fov = main.fov;
    this._stereoCamL.updateProjectionMatrix();
    this._stereoCamR.updateProjectionMatrix();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(main.quaternion);
    this._stereoCamL.position.addScaledVector(right, -this._stereoIPD / 2);
    this._stereoCamR.position.addScaledVector(right,  this._stereoIPD / 2);
  },

  renderStereoRightHalf(renderer, scene) {
    if (this._stereoMode !== 'sbs' || !this._stereoCamR) return;
    if (!renderer) renderer = this._state.data.renderer;
    if (!scene) scene = this._state.data.scene;
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    renderer.setScissorTest(true);
    renderer.setScissor(w / 2, 0, w / 2, h);
    renderer.setViewport(w / 2, 0, w / 2, h);
    renderer.clearDepth();
    renderer.render(scene, this._stereoCamR);
    renderer.setScissorTest(false);
  },

  // ── Recording (MediaRecorder) ────────────────────────────────────────────

  isRecording() { return this._recording; },

  async startRecording(options = {}) {
    if (this._recording) {
      logger.warn('LightingPlugin', 'startRecording: already recording');
      return false;
    }
    if (typeof MediaRecorder === 'undefined') {
      logger.warn('LightingPlugin', 'startRecording: MediaRecorder not supported in this browser');
      return false;
    }
    const renderer = this._state.data.renderer;
    if (!renderer || !renderer.domElement || !renderer.domElement.captureStream) {
      logger.warn('LightingPlugin', 'startRecording: canvas.captureStream not supported');
      return false;
    }

    const fps = Math.max(1, Math.min(60, options.fps || 60));
    const includeAudio = !!options.audio;

    let videoStream;
    try {
      videoStream = renderer.domElement.captureStream(fps);
    } catch (err) {
      logger.error('LightingPlugin', 'captureStream failed:', err);
      return false;
    }

    let combinedStream = videoStream;
    if (includeAudio) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length) {
          combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...audioTracks,
          ]);
        }
      } catch (err) {
        logger.warn('LightingPlugin', 'Microphone access denied; recording video-only:', err.message || err);
      }
    }

    const mimeType = options.mimeType || this._pickSupportedMime();
    if (!mimeType) {
      logger.warn('LightingPlugin', 'startRecording: no supported MediaRecorder mimeType');
      return false;
    }

    let recorder;
    try {
      recorder = new MediaRecorder(combinedStream, { mimeType });
    } catch (err) {
      logger.error('LightingPlugin', 'MediaRecorder constructor failed:', err);
      return false;
    }

    this._recorderChunks = [];
    this._recorderMime = mimeType;
    this._recorderStream = combinedStream;
    this._recorderAudio = includeAudio && combinedStream.getAudioTracks().length > 0;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._recorderChunks.push(e.data);
    };
    recorder.onerror = (e) => {
      logger.error('LightingPlugin', 'MediaRecorder error:', e?.error || e);
    };
    recorder.onstop = () => {
      const blob = new Blob(this._recorderChunks, { type: this._recorderMime });
      this._recording = false;
      this._recorderChunks = [];
      this._state.emit('recording:stopped', { blob, mimeType: this._recorderMime });
      logger.log('LightingPlugin', `Recording stopped → ${(blob.size / 1048576).toFixed(2)}MB ${this._recorderMime}`);
      this._teardownRecorder();
    };

    recorder.start(1000);
    this._mediaRecorder = recorder;
    this._recording = true;
    this._recordingStartedAt = performance.now();
    this._state.emit('recording:started', { mimeType, audio: this._recorderAudio });
    logger.log('LightingPlugin', `Recording started (${mimeType}, audio=${this._recorderAudio}, fps=${fps})`);
    return true;
  },

  stopRecording() {
    if (!this._recording || !this._mediaRecorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      const rec = this._mediaRecorder;
      const onStop = () => {
        const blob = new Blob(this._recorderChunks, { type: this._recorderMime });
        this._recording = false;
        resolve(blob);
      };
      rec.addEventListener('stop', onStop, { once: true });
      try {
        rec.stop();
      } catch (err) {
        logger.error('LightingPlugin', 'stopRecording failed:', err);
        resolve(null);
      }
    });
  },

  _pickSupportedMime() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
    for (const m of RECORDER_MIME_PREFERENCE) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return null;
  },

  _teardownRecorder() {
    if (this._recorderStream) {
      this._recorderStream.getTracks().forEach(t => t.stop());
      this._recorderStream = null;
    }
    this._mediaRecorder = null;
    this._recorderChunks = [];
  },

  // ── Frame export ────────────────────────────────────────────────────────

  async captureFrame(options = {}) {
    const renderer = this._state.data.renderer;
    if (!renderer) return null;
    const format = options.format || 'image/png';

    // Force a synchronous render immediately before toBlob. Browsers
    // clear the WebGL drawing buffer after compositing, so without
    // this we'd capture a blank frame.
    const composer = this._state.data.composer
      || this._state.data.pluginManager?._plugins?.get('PhotorealisticRender')?.composer;
    if (composer) {
      composer.render();
    } else {
      renderer.render(this._state.data.scene, this._state.data.camera);
    }

    return new Promise((resolve) => {
      try {
        renderer.domElement.toBlob((blob) => resolve(blob), format, 0.95);
      } catch (err) {
        logger.error('LightingPlugin', 'captureFrame toBlob failed:', err);
        resolve(null);
      }
    });
  },

  async exportFrame(filename = `frame-${Date.now()}.png`) {
    const blob = await this.captureFrame();
    if (!blob) return false;
    const ext = (blob.type.split('/')[1] || 'png').toLowerCase();
    const finalName = /\.[a-z0-9]+$/i.test(filename) ? filename : `${filename}.${ext}`;
    this._triggerDownload(blob, finalName);
    return true;
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

  // ── Event wiring (merged from LightingCameraPlugin) ─────────────────────

  _setupEventListeners() {
    window.addEventListener('setCameraView', (e) => this.setCameraView(e.detail.view));
    window.addEventListener('resetView', () => this.setCameraView('perspective'));
    window.addEventListener('frameSelected', () => this.frameSelected());
    window.addEventListener('frameAll', () => this.frameAll());
    window.addEventListener('applyLightingPreset', (e) => this.applyLightingPreset(e.detail.preset));
    window.addEventListener('setCameraType', (e) => this.setCameraType(e.detail.type));
    window.addEventListener('setStereoMode', (e) => this.setStereoMode(e.detail.mode));
    window.addEventListener('startRecording', (e) => this.startRecording(e.detail || {}));
    window.addEventListener('stopRecording', () => this.stopRecording());
    window.addEventListener('exportFrame', (e) => this.exportFrame(e.detail?.filename));
  },

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose() {
    this.stopRecording();
    if (this._mediaRecorder) this._teardownRecorder();
    this._stereoCamL = null;
    this._stereoCamR = null;
    this._lights.forEach((_, uuid) => this.removeLight(uuid));
    if (this._pmremGenerator) {
      this._pmremGenerator.dispose();
      this._pmremGenerator = null;
    }
  },

  // ── Light presets ───────────────────────────────────────────────────────

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

  // ── Visual Nodes ────────────────────────────────────────────────────────

  nodes: {
    'Lighting/AddLightNode': (x, y) =>
      createNodeCard(x, y, 'Add Light', ['Type', 'Color', 'Intensity'], ['Light']),
    'Lighting/ApplyPresetNode': (x, y) =>
      createNodeCard(x, y, 'Lighting Preset', ['Preset'], []),
    'Lighting/LoadHDRINode': (x, y) =>
      createNodeCard(x, y, 'Load HDRI', ['URL', 'Intensity'], ['Env Map']),

    'Camera/SetViewNode': (x, y) =>
      createNodeCard(x, y, 'Set Camera View', ['View'], []),
    'Camera/FrameSelectedNode': (x, y) =>
      createNodeCard(x, y, 'Frame Selected', [], []),
    'Camera/FrameAllNode': (x, y) =>
      createNodeCard(x, y, 'Frame All', [], []),
    'Camera/SetTypeNode': (x, y) =>
      createNodeCard(x, y, 'Camera Type', ['Type'], []),
    'Camera/StereoModeNode': (x, y) =>
      createNodeCard(x, y, 'Stereo Mode', ['Mode', 'IPD'], []),
    'Camera/StartRecordingNode': (x, y) =>
      createNodeCard(x, y, 'Start Recording', ['FPS', 'Audio'], []),
    'Camera/StopRecordingNode': (x, y) =>
      createNodeCard(x, y, 'Stop Recording', [], []),
    'Camera/ExportFrameNode': (x, y) =>
      createNodeCard(x, y, 'Export Frame', ['Filename'], []),
  }
};
