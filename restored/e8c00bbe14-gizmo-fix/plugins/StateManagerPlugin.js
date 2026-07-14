/**
 * StateManagerPlugin - High-performance, reactive state engine with middleware.
 * Acts as the central nervous system for the entire 3D studio.
 */
import { createNodeCard } from './NodeFactory.js';

export const StateManagerPlugin = {
  name: 'StateManager',
  _state: {},
  _listeners: new Map(),
  _middleware: [],
  _history: [],
  _isDispatching: false,
  _masterState: null,

  init(masterState) {
    this._masterState = masterState;

    // Initialize default state tree
    this._state = {
      scene: { objectCount: 0, selectedUUIDs: [] },
      performance: { fps: 60, frameTime: 16, memoryMB: 0 },
      plugins: {},
      render: { outlinePass: true },
      physics: { substeps: 10, stepTimeMS: 0 },
      memory: { gc: false },
      ui: { activeEditor: '3d-viewport', theme: 'dark' },
      nodeGraph: { cacheEnabled: false }
    };

    // Restore persisted state from localStorage
    this._restoreState();

    // Add default middleware
    this.addMiddleware(this._historyMiddleware.bind(this));
    this.addMiddleware(this._agentTelemetryMiddleware.bind(this));
    this.addMiddleware(this._persistenceMiddleware.bind(this));

    console.log('[StateManager] Engine initialized.');
  },

  getState(path = '') {
    if (!path) return this._state;
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  },

  dispatch(action) {
    if (this._isDispatching) {
      throw new Error('[StateManager] Reducers may not dispatch actions.');
    }

    try {
      this._isDispatching = true;

      let currentState = this._state;
      for (const mw of this._middleware) {
        currentState = mw(currentState, action) || currentState;
      }

      // Apply the action payload to the state tree
      if (action.path && action.payload !== undefined) {
        this._setNestedState(action.path, action.payload);
      }

      this._notifyListeners(action);
    } finally {
      this._isDispatching = false;
    }
  },

  _setNestedState(path, value) {
    const keys = path.split('.');
    let obj = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  },

  subscribe(path, callback) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }
    this._listeners.get(path).add(callback);

    return () => {
      this._listeners.get(path)?.delete(callback);
    };
  },

  addMiddleware(middlewareFn) {
    this._middleware.push(middlewareFn);
  },

  // ── Internal Middleware ──

  _historyMiddleware(state, action) {
    if (action.type.startsWith('SCENE/')) {
      this._history.push({ state: JSON.parse(JSON.stringify(state)), action });
      if (this._history.length > 50) this._history.shift();
    }
    return state;
  },

  _agentTelemetryMiddleware(state, action) {
    if (action.type.includes('METRIC') || action.type.includes('PERF')) {
      window.AgentOrchestrator?.ingestTelemetry(action);
    }
    return state;
  },

  // ── Internal Notifier ──

  _notifyListeners(action) {
    if (action.path && this._listeners.has(action.path)) {
      this._listeners.get(action.path).forEach(cb => cb(this.getState(action.path), action));
    }

    this._listeners.forEach((callbacks, path) => {
      if (path.endsWith('*')) {
        const base = path.slice(0, -1);
        if (action.path?.startsWith(base)) {
          callbacks.forEach(cb => cb(this.getState(base), action));
        }
      }
    });
  },

  // ── Persistence Middleware ──

  _STORAGE_KEY: 'masterstudio_state',

  _persistenceMiddleware(state, action) {
    // Persist on structural changes (skip per-frame telemetry)
    if (action.type.startsWith('SCENE/') || action.type.includes('SET_')) {
      try {
        const snapshot = {
          render: state.render,
          physics: state.physics,
          ui: state.ui,
          nodeGraph: state.nodeGraph,
          _ts: Date.now()
        };
        localStorage.setItem(this._STORAGE_KEY, JSON.stringify(snapshot));
      } catch (e) {
        // localStorage full or unavailable — silently ignore
      }
    }
    return state;
  },

  _restoreState() {
    try {
      const raw = localStorage.getItem(this._STORAGE_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      // Merge persisted values into current state (don't overwrite defaults entirely)
      if (snapshot.render) Object.assign(this._state.render, snapshot.render);
      if (snapshot.physics) Object.assign(this._state.physics, snapshot.physics);
      if (snapshot.ui) Object.assign(this._state.ui, snapshot.ui);
      if (snapshot.nodeGraph) Object.assign(this._state.nodeGraph, snapshot.nodeGraph);
      console.log('[StateManager] Restored persisted state from', new Date(snapshot._ts).toLocaleString());
    } catch (e) {
      // Corrupt data — ignore and start fresh
    }
  },

  // ── Visual Nodes ──
  nodes: {
    'State/ReadStateNode': (x, y) =>
      createNodeCard(x, y, 'Read State', ['State Path'], ['Value']),

    'State/DispatchActionNode': (x, y) =>
      createNodeCard(x, y, 'Dispatch Action', ['Action Type', 'Payload'], []),
  }
};
