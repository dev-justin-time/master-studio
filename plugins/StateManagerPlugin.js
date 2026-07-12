/**
 * StateManagerPlugin - High-performance, reactive state engine with middleware.
 * Acts as the central nervous system for the entire 3D studio.
 */
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

export const StateManagerPlugin = {
  name: 'StateManager',
  _state: {},
  _listeners: new Map(),
  _middleware: [],
  _history: [],
  _isDispatching: false,
  _masterState: null,
  // GPU resource registry: resourceId -> { bytes, type, label, allocatedAt }.
  // Not part of the reactive state tree (the tree would trigger per-key
  // notifications on every allocation, which is too noisy for telemetry).
  // Instead, every change emits a single `PERF/GFX_DELTA` patch to
  // `performance.gfxDelta`; subscribers / AI experts consume the
  // telemetry stream instead of polling the Map. Aggregate totals are
  // exposed via getGfxTotalBytes() / getGfxResourceCount() / getGfxBytesByType().
  _gfxResources: typeof Map === 'function' ? new Map() : null,

  init(masterState) {
    this._masterState = masterState;

    // Initialize default state tree
    this._state = {
      scene: { objectCount: 0, selectedUUIDs: [] },
      performance: {
        fps: 60,
        frameTime: 16,
        memoryMB: 0,
        // Aggregate GPU counters (read via the getGfx*() methods).
        // Mirrored here for tools that read the state tree directly.
        gfxBytes: 0,
        gfxResources: 0,
        gfxWaterBytes: 0,
        gfxWaterCount: 0,
      },
      plugins: {},
      render: { outlinePass: true },
      physics: { substeps: 10, stepTimeMS: 0 },
      memory: { gc: false },
      water: { recommendCleanup: null },
      ui: { activeEditor: '3d-viewport', theme: 'dark' },
      nodeGraph: { cacheEnabled: false }
    };

    // Restore persisted state from localStorage
    this._restoreState();

    // Add default middleware
    this.addMiddleware(this._historyMiddleware.bind(this));
    this.addMiddleware(this._agentTelemetryMiddleware.bind(this));
    this.addMiddleware(this._persistenceMiddleware.bind(this));

    logger.log('StateManager', 'Engine initialized.');
  },

  getState(path = '') {
    if (!path) return this._state;
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  },

  /**
   * Pass-through emit to the underlying MasterState (the simple event
   * bus MasterApp and other plugins listen on for `state.on(...)`).
   * Lets plugins that hold a StateManager reference (e.g. AIAgentPlugin
   * via MasterApp's wiring) still fire notifications / custom events
   * without needing a direct MasterState handle.
   */
  emit(event, payload) {
    if (this._masterState && typeof this._masterState.emit === 'function') {
      this._masterState.emit(event, payload);
    }
  },

  // ── GPU Resource Tracking ───────────────────────────────────────────────
  // Plugins (WaterPlugin, future Wasm allocations, etc.) call these to
  // register / release GPU resources. Each call dispatches a single
  // `PERF/GFX_DELTA` action to `performance.gfxDelta` so the existing
  // _agentTelemetryMiddleware automatically feeds AIAgentPlugin's ring
  // buffer, and any subscriber to `performance.gfxDelta` (or the
  // wildcard `performance.*`) is notified. The data lives in this
  // plugin's private Map rather than the reactive state tree to keep
  // per-resource churn out of the global dispatch loop.

  /**
   * Register a GPU resource allocation. Overwrites the prior entry if
   * the same `id` is registered twice (idempotent update). Emits a
   * `PERF/GFX_DELTA` patch with `event: 'allocate'` (or `'update'` if
   * the id was already tracked) and the signed `deltaBytes` (positive
   * for an increase, negative for a decrease).
   *
   * @param {string} id      Unique resource id (e.g. `water/<uuid>/cubemap`).
   * @param {number} bytes   Approximate GPU bytes consumed.
   * @param {string} type    Resource type tag (e.g. `'water-cubemap'`).
   * @param {string} label   Human-readable label (e.g. the mesh name).
   * @returns {boolean}      True on success, false on invalid args.
   */
  trackGfxResource(id, bytes, type = 'unknown', label = '') {
    if (!id || typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
      logger.warn('StateManager', `trackGfxResource: invalid args id=${id} bytes=${bytes}`);
      return false;
    }
    if (!this._gfxResources) return false;
    const existing = this._gfxResources.get(id);
    const delta = existing ? bytes - existing.bytes : bytes;
    this._gfxResources.set(id, { bytes, type, label, allocatedAt: existing ? existing.allocatedAt : Date.now() });
    this._refreshGfxAggregates();
    this.dispatch({
      type: 'PERF/GFX_DELTA',
      path: 'performance.gfxDelta',
      payload: {
        event: existing ? 'update' : 'allocate',
        resourceId: id,
        type,
        label,
        bytes,
        deltaBytes: delta,
        totalBytes: this.getGfxTotalBytes(),
        waterCount: this.getGfxResourceCount('water-cubemap'),
        waterBytes: this.getGfxBytesByType('water-cubemap'),
        ts: Date.now(),
      },
    });
    return true;
  },

  /**
   * Release a previously-tracked GPU resource. Warns if `id` is not
   * currently tracked. Emits a `PERF/GFX_DELTA` patch with
   * `event: 'release'` and a negative `deltaBytes`.
   *
   * @param {string} id  Resource id returned at trackGfxResource time.
   * @returns {boolean}  True on success, false on unknown id.
   */
  releaseGfxResource(id) {
    if (!id) return false;
    if (!this._gfxResources) return false;
    const existing = this._gfxResources.get(id);
    if (!existing) {
      logger.warn('StateManager', `releaseGfxResource: unknown id "${id}"`);
      return false;
    }
    this._gfxResources.delete(id);
    this._refreshGfxAggregates();
    this.dispatch({
      type: 'PERF/GFX_DELTA',
      path: 'performance.gfxDelta',
      payload: {
        event: 'release',
        resourceId: id,
        type: existing.type,
        label: existing.label,
        bytes: 0,
        deltaBytes: -existing.bytes,
        totalBytes: this.getGfxTotalBytes(),
        waterCount: this.getGfxResourceCount('water-cubemap'),
        waterBytes: this.getGfxBytesByType('water-cubemap'),
        ts: Date.now(),
      },
    });
    return true;
  },

  /** Sum of all currently-tracked GPU bytes. */
  getGfxTotalBytes() {
    if (!this._gfxResources) return 0;
    let total = 0;
    for (const r of this._gfxResources.values()) total += r.bytes;
    return total;
  },

  /** Number of tracked resources, optionally filtered by `type`. */
  getGfxResourceCount(type) {
    if (!this._gfxResources) return 0;
    if (!type) return this._gfxResources.size;
    let count = 0;
    for (const r of this._gfxResources.values()) {
      if (r.type === type) count++;
    }
    return count;
  },

  /** Sum of bytes for all tracked resources of a given `type`. */
  getGfxBytesByType(type) {
    if (!this._gfxResources) return 0;
    let total = 0;
    for (const r of this._gfxResources.values()) {
      if (r.type === type) total += r.bytes;
    }
    return total;
  },

  /** Read-only snapshot of the current resource registry. */
  getGfxResources() {
    if (!this._gfxResources) return [];
    return Array.from(this._gfxResources.entries()).map(([id, info]) => ({ id, ...info }));
  },

  /** Mirror the aggregate counters into the reactive state tree. */
  _refreshGfxAggregates() {
    if (!this._gfxResources) return;
    this._setNestedState('performance.gfxBytes', this.getGfxTotalBytes());
    this._setNestedState('performance.gfxResources', this._gfxResources.size);
    this._setNestedState('performance.gfxWaterBytes', this.getGfxBytesByType('water-cubemap'));
    this._setNestedState('performance.gfxWaterCount', this.getGfxResourceCount('water-cubemap'));
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
      logger.log('StateManager', 'Restored persisted state from', new Date(snapshot._ts).toLocaleString());
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
