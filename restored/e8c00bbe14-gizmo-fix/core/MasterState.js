/**
 * MasterState - Centralized reactive state and event bus.
 * Plugins and Nodes communicate through this, ensuring zero tight coupling.
 */
export class MasterState {
  constructor() {
    this.data = {
      selectedObject: null,
      scene: null,
      camera: null,
      skeletons: new Map(),
      mixers: new Map(),
      clips: new Map(),
      physicsBodies: new Map(),
      timeline: { currentTime: 0, isPlaying: false, fps: 60, duration: 10 }
    };
    this._listeners = {};
  }

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  emit(event, payload) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => cb(payload));
    }
  }

  set(key, value) {
    this.data[key] = value;
    this.emit(`state:${key}:changed`, value);
  }
}
