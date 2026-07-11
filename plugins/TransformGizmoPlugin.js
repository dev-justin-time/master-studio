/**
 * TransformGizmoPlugin - Three.js TransformControls wrapper for the plugin architecture.
 *
 * Responsibilities:
 *  - Create and manage a single TransformControls instance.
 *  - Attach/detach the gizmo based on selection changes.
 *  - Expose translate/rotate/scale modes and world/local spaces.
 *  - Disable OrbitControls while dragging to prevent camera fights.
 *  - Emit lifecycle events so other systems (undo, physics sync, etc.) can hook in.
 *  - Provide keyboard shortcuts: G (grab/translate), R (rotate), S (scale).
 */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createNodeCard } from './NodeFactory.js';

export const TransformGizmoPlugin = {
  name: 'TransformGizmo',
  _state: null,
  _controls: null,
  _orbitControls: null,
  _camera: null,
  _renderer: null,
  _scene: null,
  _mode: 'translate', // 'translate' | 'rotate' | 'scale'
  _space: 'world',    // 'world' | 'local'
  _dragging: false,
  _initialTransform: null,

  init(state) {
    this._state = state;

    // Defer actual TransformControls creation until renderer/camera are available.
    // MasterApp will call setup() after the renderer is initialized.
    this._state.on('selection:changed', (objects) => this._onSelectionChanged(objects));
  },

  /**
   * Must be called by MasterApp after the renderer and camera are ready.
   */
  setup(camera, renderer, orbitControls, scene) {
    this._camera = camera;
    this._renderer = renderer;
    this._orbitControls = orbitControls;
    this._scene = scene;

    this._controls = new TransformControls(camera, renderer.domElement);
    this._controls.setMode(this._mode);
    this._controls.setSpace(this._space);
    this._controls.addEventListener('dragging-changed', (e) => this._onDraggingChanged(e));
    this._controls.addEventListener('change', () => this._onChange());
    this._controls.addEventListener('mouseDown', () => this._onTransformStart());
    this._controls.addEventListener('mouseUp', () => this._onTransformEnd());

    scene.add(this._controls);

    // Reflect current selection if any
    const selected = this._state.data.selectedObjects || [];
    this._attachToSelection(selected);
  },

  // ── Mode / Space ──

  setMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode)) return;
    this._mode = mode;
    this._controls?.setMode(mode);
    this._state.emit('gizmo:mode:changed', { mode });
  },

  getMode() {
    return this._mode;
  },

  setSpace(space) {
    if (!['world', 'local'].includes(space)) return;
    this._space = space;
    this._controls?.setSpace(space);
    this._state.emit('gizmo:space:changed', { space });
  },

  getSpace() {
    return this._space;
  },

  toggleSpace() {
    this.setSpace(this._space === 'world' ? 'local' : 'world');
  },

  // ── Selection Handling ──

  _onSelectionChanged(objects) {
    this._attachToSelection(objects);
  },

  _attachToSelection(objects) {
    if (!this._controls) return;

    // Filter to a single valid target. TransformControls supports one object at a time.
    const target = objects?.length === 1 ? objects[0] : null;

    if (target && (target.isMesh || target.isGroup)) {
      this._controls.attach(target);
      this._controls.visible = true;
      this._controls.enabled = true;
    } else {
      this._controls.detach();
      this._controls.visible = false;
      this._controls.enabled = false;
    }
  },

  // ── Drag Lifecycle ──

  _onDraggingChanged(e) {
    // Disable/enable orbit controls while dragging the gizmo
    if (this._orbitControls) {
      this._orbitControls.enabled = !e.value;
    }
    this._dragging = e.value;
  },

  _onTransformStart() {
    const target = this._controls?.object;
    if (!target) return;

    this._initialTransform = {
      object: target,
      position: target.position.clone(),
      rotation: target.rotation.clone(),
      scale: target.scale.clone()
    };

    this._state.emit('gizmo:transform:start', {
      object: target,
      mode: this._mode
    });
  },

  _onChange() {
    // Fired continuously during drag; useful for live updates (e.g. physics sync).
    if (!this._dragging) return;
    const target = this._controls?.object;
    if (!target) return;

    this._state.emit('gizmo:transform:change', {
      object: target,
      mode: this._mode
    });
  },

  _onTransformEnd() {
    const target = this._controls?.object;
    if (!target || !this._initialTransform) return;

    const start = this._initialTransform;
    const changed =
      !start.position.equals(target.position) ||
      !start.rotation.equals(target.rotation) ||
      !start.scale.equals(target.scale);

    this._state.emit('gizmo:transform:end', {
      object: target,
      mode: this._mode,
      start: start,
      current: {
        position: target.position.clone(),
        rotation: target.rotation.clone(),
        scale: target.scale.clone()
      },
      changed
    });

    this._initialTransform = null;
  },

  // ── Keyboard Shortcuts ──

  handleKey(key, event) {
    // Avoid hijacking input fields
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return false;

    switch (key.toLowerCase()) {
      case 'g':
        this.setMode('translate');
        return true;
      case 'r':
        this.setMode('rotate');
        return true;
      case 's':
        this.setMode('scale');
        return true;
      case ' ': // Spacebar toggles world/local space
        this.toggleSpace();
        return true;
      default:
        return false;
    }
  },

  // ── Lifecycle ──

  update(deltaTime) {
    // TransformControls updates internally via its own event listeners.
  },

  dispose() {
    if (this._controls) {
      this._controls.detach();
      this._controls.dispose();
      this._controls = null;
    }
  },

  // ── Visual Nodes ──
  nodes: {
    'Transform/SetModeNode': (x, y) =>
      createNodeCard(x, y, 'Set Gizmo Mode', ['Mode'], []),

    'Transform/SetSpaceNode': (x, y) =>
      createNodeCard(x, y, 'Set Gizmo Space', ['Space'], []),
  }
};
