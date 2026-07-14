/**
 * LightingCameraPlugin - Camera controls, views, frame-selected/all,
 * and lighting preset switching (delegated to LightingPlugin).
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const LightingCameraPlugin = {
  name: 'LightingCamera',
  _state: null,
  _cameraPresets: new Map(),

  init(state) {
    this._state = state;
    this._initCameraPresets();
    this._setupEventListeners();
  },

  _initCameraPresets() {
    this._cameraPresets.set('perspective', {
      position: { x: 6, y: 5, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      fov: 75
    });
    this._cameraPresets.set('top', {
      position: { x: 0, y: 15, z: 0.1 },
      target: { x: 0, y: 0, z: 0 },
      fov: 75
    });
    this._cameraPresets.set('front', {
      position: { x: 0, y: 3, z: 15 },
      target: { x: 0, y: 0, z: 0 },
      fov: 75
    });
    this._cameraPresets.set('right', {
      position: { x: 15, y: 3, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: 75
    });
  },

  _setupEventListeners() {
    window.addEventListener('setCameraView', (e) => this.setCameraView(e.detail.view));
    window.addEventListener('resetView', () => this.setCameraView('perspective'));
    window.addEventListener('frameSelected', () => this.frameSelected());
    window.addEventListener('frameAll', () => this.frameAll());
    window.addEventListener('applyLightingPreset', (e) => this.applyLightingPreset(e.detail.preset));
  },

  /** Smoothly animate camera to a named preset. */
  setCameraView(presetName) {
    const preset = this._cameraPresets.get(presetName);
    if (!preset) return;

    const camera = this._state.data.camera;
    const controls = this._state.data.controls;
    if (!camera || !controls) return;

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPos = new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z);
    const endTarget = new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z);

    if (preset.fov) {
      camera.fov = preset.fov;
      camera.updateProjectionMatrix();
    }

    // Simple linear interpolation over ~0.5s
    const duration = 400; // ms
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out
      const ease = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(startPos, endPos, ease);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      controls.update();

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
    this._state.emit('camera:view:changed', { preset: presetName });
  },

  /** Frame the selected objects in view. */
  frameSelected() {
    const selected = this._state.data.selectedObjects;
    if (!selected || selected.length === 0) return;
    const box = new THREE.Box3();
    selected.forEach(obj => box.expandByObject(obj));
    this._frameBox(box);
  },

  /** Frame all managed objects in view. */
  frameAll() {
    const scene = this._state.data.scene;
    if (!scene) return;
    const box = new THREE.Box3();
    scene.traverse(obj => {
      if (obj.userData?.isManagedObject) {
        box.expandByObject(obj);
      }
    });
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
    const fov = camera.fov * (Math.PI / 180);
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.5;

    // Position camera back along current direction from center
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.length() < 0.01) dir.set(0, 0, 1);
    camera.position.copy(center).addScaledVector(dir, dist);
    controls.target.copy(center);
    controls.update();
  },

  /**
   * Delegates lighting preset changes to the LightingPlugin
   * (which has the full light management system).
   */
  applyLightingPreset(presetName) {
    const pluginManager = this._state.data.pluginManager;
    const lighting = pluginManager?._plugins?.get('Lighting');
    if (lighting?.applyPreset) {
      lighting.applyPreset(presetName);
      logger.log(`[LightingCamera] Lighting preset → ${presetName}`);
      return;
    }

    // Fallback: direct scene manipulation if LightingPlugin is unavailable
    const scene = this._state.data.scene;
    if (!scene) return;

    const fallbackPresets = {
      studio: { ambient: 0x444444, bg: 0x1a1a1a },
      outdoor: { ambient: 0x88aacc, bg: 0x87ceeb },
      night:   { ambient: 0x112244, bg: 0x0a0a1a },
      dramatic:{ ambient: 0x111111, bg: 0x000000 },
    };
    const fb = fallbackPresets[presetName];
    if (fb) {
      scene.traverse(obj => {
        if (obj.isAmbientLight) {
          obj.color.set(fb.ambient);
        }
      });
      scene.background = new THREE.Color(fb.bg);
    }
  },

  update(deltaTime) {},

  // ── Visual Nodes ──
  nodes: {
    'Camera/SetViewNode': (x, y) =>
      createNodeCard(x, y, 'Set Camera View', ['View'], []),

    'Camera/FrameSelectedNode': (x, y) =>
      createNodeCard(x, y, 'Frame Selected', [], []),

    'Camera/FrameAllNode': (x, y) =>
      createNodeCard(x, y, 'Frame All', [], []),
  }
};