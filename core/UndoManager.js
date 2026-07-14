/**
 * UndoManager - Cmd+Z / Cmd+Shift+Z for the master studio.
 *
 * Hooks into the StateManager's `_historyMiddleware` (added in
 * `plugins/StateManagerPlugin.js` before this manager was written).
 * The middleware already maintains a chronological list of dispatch
 * actions; this manager just adds:
 *   - `undo()`: pops the most recent action + reverts by either
 *     reverting the state slice (if the action carries an `inverse`)
 *     OR deleting the most recently-added scene object (if the
 *     action is a `SCENE/ADD_OBJECT` style).
 *   - `redo()`: re-applies the most recently-undone action.
 *   - `bindKeyboard()`: Cmd+Z / Cmd+Shift+Z / Ctrl+Z / Ctrl+Shift+Z
 *     keyboard shortcuts. No-op if no actionable history exists.
 *   - `getHistory()`: snapshot of undo/redo stacks for the UI.
 *
 * The manager is intentionally NOT a plugin — it has no Three.js
 * state, no DOM, no render-loop participation. It's a thin layer
 * over the existing middleware. It IS still registered in the
 * PluginManager (see the export shape at the bottom) so MasterApp
 * can install the keyboard binding once during init.
 *
 * Non-breaking: this file adds new functionality. It does NOT
 * modify StateManager.js, MasterState.js, or any plugin.
 * If `_historyMiddleware` is missing (older StateManager versions),
 * the manager disables itself with a single warn.
 */
import { logger } from './Logger.js';

const MAX_HISTORY = 100;

export const UndoManager = {
  name: 'UndoManager',
  _stateManager: null,
  _undoStack: [],
  _redoStack: [],
  _enabled: true,
  _keyboardBound: false,
  _onUndoCallback: null,
  _onRedoCallback: null,
  // Optional UI panel. Set by `renderToDOM(container)` if the host
  // page has a mount point (#undo-history-container by convention).
  _panelContainer: null,
  _panelEl: null,
  // Toast callback (set by renderToDOM; defaults to console + emit
  // notification). The toast closes the loop on __UNDO_NOOP__
  // dispatches so the user gets feedback that "nothing happened".
  _toast: null,

  /**
   * Called by MasterApp during init. Pulls the live StateManager from
   * `state.data.pluginManager._plugins.get('StateManager')` and reads
   * its `_historyMiddleware` if present.
   */
  init(state) {
    const sm = state && state.data && state.data.pluginManager
      ? state.data.pluginManager._plugins && state.data.pluginManager._plugins.get('StateManager')
      : null;
    if (!sm) {
      logger.warn('UndoManager', 'StateManager not found — undo/redo disabled');
      this._enabled = false;
      return;
    }
    this._stateManager = sm;
    // The middleware is the source of truth for history. We mirror it
    // into our own undo/redo stacks so we can rewrite on undo/redo
    // without disturbing the middleware's chronological buffer.
    this._syncFromMiddleware();
    this._subscribeToMiddleware();
    logger.log('UndoManager', `Initialized (history: ${this._undoStack.length} entries)`);
  },

  _syncFromMiddleware() {
    if (!this._stateManager || !this._stateManager._historyMiddleware) {
      this._undoStack = [];
      this._redoStack = [];
      return;
    }
    const history = this._stateManager._historyMiddleware.getHistory
      ? this._stateManager._historyMiddleware.getHistory()
      : (this._stateManager._historyMiddleware.history || []);
    // The middleware's buffer is append-only and may include actions
    // that aren't undoable (e.g. PERF/GFX deltas). We filter to the
    // ones we know how to revert.
    this._undoStack = history
      .filter(h => this._isUndoable(h))
      .slice(-MAX_HISTORY);
    this._redoStack = [];
  },

  _subscribeToMiddleware() {
    // The middleware doesn't expose a subscribe API in this revision.
    // Rather than depend on plugins calling `recordX()` explicitly
    // (which they don't), we monkey-patch the StateManager's
    // `dispatch` once so every action that flows through the system
    // is captured automatically. This is a non-breaking change:
    //  - We wrap the existing dispatch, not replace it.
    //  - The wrapped dispatch still calls the original.
    //  - The wrapper just snapshots the action into _undoStack.
    //  - On undo, we pop the action and call dispatch with the
    //    inverse; the wrapper ignores the inverse (it has a marker).
    //  - On redo, we re-call dispatch; same skip.
    if (!this._stateManager || this._stateManager._undoManagerPatched) return;
    const originalDispatch = this._stateManager.dispatch.bind(this._stateManager);
    const self = this;
    this._stateManager.dispatch = function (action) {
      // Skip if this dispatch is from undo/redo itself (would cause
      // the inverse to be re-captured as a new action).
      if (action && action.__undoInternal) {
        return originalDispatch(action);
      }
      const result = originalDispatch(action);
      try {
        if (action && self._isUndoable({ type: action.type })) {
          // We don't have the original action object after middleware
          // runs; we capture the input action directly. This is the
          // best we can do without a subscribe API in the middleware.
          self._undoStack.push({
            type: action.type,
            payload: action.payload,
            inverse: self._deriveInverse(action),
          });
          if (self._undoStack.length > MAX_HISTORY) self._undoStack.shift();
          self._redoStack = [];
        }
      } catch (err) {
        // Never let undo tracking break the dispatch.
      }
      return result;
    };
    this._stateManager._undoManagerPatched = true;
  },

  /**
   * Heuristic inverse derivation. For each known action type, build
   * a "best guess" inverse. Plugins can override by calling
   * `recordX()` with an explicit `inverse` field BEFORE the action
   * is dispatched (the explicit inverse wins on undo).
   */
  _deriveInverse(action) {
    const t = action && action.type;
    const p = action && action.payload;
    switch (t) {
      case 'OBJECT/DELETE':
        // Inverse is "re-create" — but we don't have the serialized
        // object here, so the inverse is a no-op (undo of delete is
        // not supported without explicit recordCreation). Mark it so
        // undo() knows.
        return { type: '__UNDO_NOOP__', payload: { reason: 'delete-undo-not-supported' } };
      case 'OBJECT/CREATE':
        return { type: 'OBJECT/DELETE', payload: p };
      case 'TRANSFORM/SET':
        return { type: 'TRANSFORM/SET', payload: p && p.before ? { ...p, position: p.before.position, rotation: p.before.rotation, scale: p.before.scale } : null };
      case 'LIGHTING/REMOVE_LIGHT':
        return { type: 'LIGHTING/ADD_LIGHT', payload: p };
      case 'LIGHTING/ADD_LIGHT':
        return { type: 'LIGHTING/REMOVE_LIGHT', payload: p };
      case 'WATER/CREATE':
        return { type: 'WATER/DELETE', payload: p };
      case 'WATER/DELETE':
        return { type: '__UNDO_NOOP__', payload: { reason: 'water-delete-undo-not-supported' } };
      case 'ATMOSPHERE/SET_FOG':
        // No "previous fog" captured here. Plugins that want fog
        // undo should call recordMutation() explicitly.
        return { type: '__UNDO_NOOP__', payload: { reason: 'fog-undo-needs-recordMutation' } };
      case 'ATMOSPHERE/SET_GODRAYS':
        return { type: '__UNDO_NOOP__', payload: { reason: 'godrays-undo-needs-recordMutation' } };
      default:
        return { type: '__UNDO_NOOP__', payload: { reason: 'no-inverse-known' } };
    }
  },

  /**
   * Decide which actions are undoable. The list is conservative:
   * any action whose `type` starts with a known reversible domain
   * is undoable. Per-action inverses are stored in `_undoStack[i].inverse`
   * when known.
   */
  _isUndoable(historyEntry) {
    if (!historyEntry || !historyEntry.type) return false;
    const t = historyEntry.type;
    return t.startsWith('SCENE/') ||
           t.startsWith('LIGHTING/') ||
           t.startsWith('TRANSFORM/') ||
           t.startsWith('PHYSICS/') ||
           t === 'SELECTION/CLEAR' ||
           t === 'SELECTION/SET' ||
           t === 'OBJECT/DELETE' ||
           t === 'OBJECT/CREATE' ||
           t === 'WATER/CREATE' ||
           t === 'WATER/DELETE' ||
           t === 'ATMOSPHERE/SET_FOG' ||
           t === 'ATMOSPHERE/SET_GODRAYS';
  },

  /**
   * Take a snapshot of a "creation" action so we can undo it. The
   * middleware carries the action's `payload` which usually includes
   * the new object's uuid or name. The inverse for a creation is
   * "remove the object" — we re-construct that by capturing the
   * object's full state at create time.
   *
   * Plugins call this when they add a new object so the user can
   * undo the addition with Cmd+Z.
   */
  recordCreation(object3d, actionType) {
    if (!object3d || !this._enabled) return;
    const snapshot = {
      type: actionType || 'OBJECT/CREATE',
      uuid: object3d.uuid,
      name: object3d.name,
      inverse: { type: 'OBJECT/DELETE', payload: { uuid: object3d.uuid, name: object3d.name } },
    };
    this._undoStack.push(snapshot);
    if (this._undoStack.length > MAX_HISTORY) this._undoStack.shift();
    this._redoStack = [];
  },

  /**
   * Record a transformation (position/rotation/scale) so the user can
   * undo the most recent drag/rotate/scale operation.
   */
  recordTransform(object3d, before, after) {
    if (!object3d || !this._enabled) return;
    this._undoStack.push({
      type: 'TRANSFORM/SET',
      uuid: object3d.uuid,
      name: object3d.name,
      inverse: { type: 'TRANSFORM/SET', payload: { uuid: object3d.uuid, before, after } },
      payload: { uuid: object3d.uuid, before, after },
    });
    if (this._undoStack.length > MAX_HISTORY) this._undoStack.shift();
    this._redoStack = [];
  },

  /**
   * Record a property mutation (e.g. light intensity changed) so the
   * user can undo the last tweak.
   */
  recordMutation(actionType, payload, inversePayload) {
    if (!this._enabled) return;
    this._undoStack.push({
      type: actionType,
      payload,
      inverse: { type: actionType, payload: inversePayload },
    });
    if (this._undoStack.length > MAX_HISTORY) this._undoStack.shift();
    this._redoStack = [];
  },

  /**
   * Pop the most recent entry + apply its inverse via the state
   * manager's dispatch. Pushes the original onto the redo stack.
   */
  undo() {
    if (!this._enabled || this._undoStack.length === 0) {
      this._toast?.('Nothing to undo', 'info');
      return false;
    }
    const entry = this._undoStack.pop();
    this._redoStack.push(entry);
    if (entry.inverse) {
      const internalInverse = { ...entry.inverse, __undoInternal: true };
      try {
        if (entry.inverse.type === '__UNDO_NOOP__') {
          const reason = entry.inverse.payload?.reason || 'no inverse known';
          logger.log('UndoManager', `Undid ${entry.type}: no inverse (${reason})`);
          // Surface a user-visible toast so the user gets feedback
          // that the pop happened but nothing visually changed.
          // Closes the "I pressed Cmd+Z and nothing happened" UX gap
          // flagged in the code review.
          this._toast?.(`Cannot undo ${this._humanize(entry.type)}: ${this._humanizeNoOp(reason)}`, 'warning');
          this._onUndoCallback && this._onUndoCallback(entry);
          this._renderPanel();
          return true;
        }
        this._stateManager.dispatch(internalInverse);
        logger.log('UndoManager', `Undid ${entry.type}`);
        this._toast?.(`Undid ${this._humanize(entry.type)}`, 'success');
        this._onUndoCallback && this._onUndoCallback(entry);
        this._renderPanel();
        return true;
      } catch (err) {
        logger.error('UndoManager', 'undo dispatch failed:', err);
        this._toast?.(`Undo failed: ${err.message || err}`, 'error');
        return false;
      }
    }
    return false;
  },

  /**
   * Pop the most recently-undone entry + re-apply its original action.
   */
  redo() {
    if (!this._enabled || this._redoStack.length === 0) {
      this._toast?.('Nothing to redo', 'info');
      return false;
    }
    const entry = this._redoStack.pop();
    this._undoStack.push(entry);
    try {
      const internalAction = { type: entry.type, payload: entry.payload, __undoInternal: true };
      this._stateManager.dispatch(internalAction);
      logger.log('UndoManager', `Redid ${entry.type}`);
      this._toast?.(`Redid ${this._humanize(entry.type)}`, 'success');
      this._onRedoCallback && this._onRedoCallback(entry);
      this._renderPanel();
      return true;
    } catch (err) {
      logger.error('UndoManager', 'redo dispatch failed:', err);
      this._toast?.(`Redo failed: ${err.message || err}`, 'error');
      return false;
    }
  },

  /**
   * Friendly version of an action type for toasts/UI:
   *   OBJECT/DELETE  -> "delete"
   *   OBJECT/CREATE  -> "create"
   *   TRANSFORM/SET  -> "transform"
   *   LIGHTING/ADD_LIGHT -> "add light"
   *   WATER/CREATE  -> "create water"
   * Anything else: lowercase the suffix after the slash.
   */
  _humanize(type) {
    if (!type) return 'change';
    const slash = type.indexOf('/');
    if (slash < 0) return type.toLowerCase();
    const suffix = type.slice(slash + 1);
    // Common mappings
    const lower = suffix.toLowerCase();
    return lower.replace(/_/g, ' ');
  },

  _humanizeNoOp(reason) {
    if (!reason) return 'no inverse known';
    const map = {
      'delete-undo-not-supported': 'delete is not undoable (re-create needs the original object state)',
      'water-delete-undo-not-supported': 'water delete needs explicit recordDeletion() call',
      'fog-undo-needs-recordMutation': 'fog changes need explicit recordMutation() call',
      'godrays-undo-needs-recordMutation': 'god-rays changes need explicit recordMutation() call',
      'no-inverse-known': 'no inverse known for this action',
    };
    return map[reason] || reason;
  },

  /**
   * Hook for UIs (toast notifications) that want to react to undo/redo.
   */
  onUndo(cb) { this._onUndoCallback = cb; },
  onRedo(cb) { this._onRedoCallback = cb; },

  /**
   * Snapshot of both stacks for the UI ("Undo: add cube | Redo: change intensity")
   */
  getHistory() {
    return {
      undo: this._undoStack.slice(-10).map(e => ({ type: e.type, name: e.name, uuid: e.uuid })),
      redo: this._redoStack.slice(-10).map(e => ({ type: e.type, name: e.name, uuid: e.uuid })),
      canUndo: this._undoStack.length > 0,
      canRedo: this._redoStack.length > 0,
    };
  },

  clear() {
    this._undoStack = [];
    this._redoStack = [];
  },

  /**
   * Install Cmd+Z / Cmd+Shift+Z / Ctrl+Z / Ctrl+Shift+Z keyboard
   * shortcuts. Idempotent — safe to call multiple times.
   */
  bindKeyboard() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;
    window.addEventListener('keydown', (e) => {
      // Don't hijack while user is typing in inputs / textareas
      const t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        this.redo();
      }
    });
    logger.log('UndoManager', 'Keyboard shortcuts bound (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y)');
  },

  // ── UI Panel ─────────────────────────────────────────────────────────────

  /**
   * Mount the undo/redo panel into a DOM container. No-op if the
   * container doesn't exist. The panel renders the most-recent
   * undo/redo stack entries as clickable items; clicking an item
   * pops everything above it (multi-step undo/redo).
   *
   * The panel subscribes to its own undo/redo callbacks so it
   * re-renders after every action — the keyboard, the click, and
   * any external undo() call all keep the panel in sync.
   *
   * Toast: a function `(message, type) => void` that shows a
   * user-visible message. Defaults to a no-op + console.log.
   * MasterApp passes a function that uses the existing notification
   * system (state.emit('notification', ...)) for consistency.
   */
  renderToDOM(container, opts = {}) {
    // Always install the toast callback so undo()/redo() can give
    // user-visible feedback even if the panel is not mounted.
    this._toast = opts.toast || ((message, type) => {
      logger.log('UndoManager', `[${type}] ${message}`);
      if (this._stateManager && typeof this._stateManager.emit === 'function') {
        this._stateManager.emit('notification', { message, type });
      }
    });
    // Resolve the mount point: explicit > canonical element > auto-create.
    const resolved = this._resolveContainer(container);
    if (!resolved) {
      logger.log('UndoManager', 'renderToDOM: no DOM available, panel disabled (keyboard + toast still active)');
      return;
    }
    this._panelContainer = resolved;
    // Idempotency: if we already mounted a panel in this container,
    // just refresh and return. Prevents duplicate panels if
    // renderToDOM is called twice (e.g. HMR, devtools re-invoke).
    if (this._panelEl && this._panelContainer.contains(this._panelEl)) {
      this._renderPanel();
      logger.log('UndoManager', 'UI panel already mounted — refreshed');
      return;
    }
    // Detach any stale panel from a previous mount (e.g. container
    // changed) so we don't end up with two panels on screen.
    if (this._panelEl && this._panelEl.parentNode) {
      this._panelEl.parentNode.removeChild(this._panelEl);
    }
    // Build the panel skeleton once; subsequent updates re-fill
    // the undo/redo lists.
    this._panelEl = document.createElement('div');
    this._panelEl.className = 'undo-history-panel';
    this._panelEl.style.cssText = [
      'background: rgba(0, 0, 0, 0.78)',
      'color: #77ff61',
      'font: 11px/1.4 "Courier New", monospace',
      'padding: 6px 8px',
      'border: 1px solid #3b4b35',
      'min-width: 180px',
      'user-select: none',
    ].join(';');
    this._panelEl.innerHTML = `
      <div style="font-weight:bold;color:#d4f5cd;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
        <span>HISTORY</span>
        <span style="font-size:9px;color:#84967c;">
          <span data-bind="undo-count">0</span> undo / <span data-bind="redo-count">0</span> redo
        </span>
      </div>
      <div data-bind="undo-list" style="margin-bottom:4px;"></div>
      <div data-bind="redo-list"></div>
      <div style="margin-top:6px;display:flex;gap:4px;">
        <button data-bind="undo-btn" style="flex:1;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;cursor:pointer;font-size:10px;">&larr; Undo</button>
        <button data-bind="redo-btn" style="flex:1;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;cursor:pointer;font-size:10px;">Redo &rarr;</button>
      </div>
      <div style="margin-top:4px;font-size:9px;color:#5a6a4a;font-style:italic;">Cmd/Ctrl+Z &middot; Cmd/Ctrl+Shift+Z</div>
    `;
    this._panelContainer.appendChild(this._panelEl);
    // Wire the two buttons
    this._panelEl.querySelector('[data-bind="undo-btn"]').addEventListener('click', () => this.undo());
    this._panelEl.querySelector('[data-bind="redo-btn"]').addEventListener('click', () => this.redo());
    // Auto-rebuild on every action
    this.onUndo(() => this._renderPanel());
    this.onRedo(() => this._renderPanel());
    this._renderPanel();
    logger.log('UndoManager', 'UI panel mounted');
  },

  /**
   * Resolve a mount point for the panel. Order:
   *   1. Explicit `container` argument
   *   2. Existing `#undo-history-container` element
   *   3. Auto-create a new container, inserted before `#state-debug-panel`
   *      (or at the end of `#sidebar`, or at the end of `body`)
   * Returns `null` if `document` is not available (SSR / Node test).
   */
  _resolveContainer(explicit) {
    if (explicit) return explicit;
    if (typeof document === 'undefined') return null;
    const existing = document.getElementById('undo-history-container');
    if (existing) return existing;
    const created = document.createElement('div');
    created.id = 'undo-history-container';
    created.setAttribute('data-auto-created', 'undo-manager');
    const statePanel = document.getElementById('state-debug-panel');
    if (statePanel?.parentNode) {
      statePanel.parentNode.insertBefore(created, statePanel);
      return created;
    }
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.appendChild(created);
      return created;
    }
    document.body.appendChild(created);
    return created;
  },

  _renderPanel() {
    if (!this._panelEl) return;
    const undoList = this._panelEl.querySelector('[data-bind="undo-list"]');
    const redoList = this._panelEl.querySelector('[data-bind="redo-list"]');
    const undoCount = this._panelEl.querySelector('[data-bind="undo-count"]');
    const redoCount = this._panelEl.querySelector('[data-bind="redo-count"]');
    if (undoCount) undoCount.textContent = this._undoStack.length;
    if (redoCount) redoCount.textContent = this._redoStack.length;
    // Render the last 5 entries in each stack (most recent first).
    // Clicking an entry pops everything above it (inclusive of the
    // clicked one) so the user can multi-undo with one click.
    if (undoList) {
      const entries = this._undoStack.slice(-5).reverse();
      if (entries.length === 0) {
        undoList.innerHTML = '<div style="color:#5a6a4a;font-style:italic;">(no undoable actions)</div>';
      } else {
        undoList.innerHTML = entries.map((e, i) => {
          const label = this._humanize(e.type);
          const target = e.name || e.uuid || '';
          const isLast = i === entries.length - 1;
          return `<div class="undo-entry" data-depth="${i}" style="cursor:${isLast ? 'default' : 'pointer'};padding:2px 4px;${isLast ? 'color:#5a6a4a;' : 'background:rgba(119,255,97,0.08);'}">
            <span style="color:#d4f5cd;">&larr;</span> ${label}${target ? ' <span style="color:#84967c;">' + this._escapeHtml(target) + '</span>' : ''}
          </div>`;
        }).join('');
        // Wire click handlers (last entry is already at the bottom of the stack; the most recent is on top)
        const that = this;
        undoList.querySelectorAll('.undo-entry').forEach((el) => {
          const depth = parseInt(el.dataset.depth, 10);
          if (depth === entries.length - 1) return; // already at the bottom
          el.addEventListener('click', () => {
            // Pop `depth + 1` entries (the clicked one + everything above it)
            for (let j = 0; j <= depth; j++) that.undo();
          });
        });
      }
    }
    if (redoList) {
      const entries = this._redoStack.slice(-5).reverse();
      if (entries.length === 0) {
        redoList.innerHTML = '<div style="color:#5a6a4a;font-style:italic;">(no redoable actions)</div>';
      } else {
        redoList.innerHTML = entries.map((e, i) => {
          const label = this._humanize(e.type);
          const target = e.name || e.uuid || '';
          const isLast = i === entries.length - 1;
          return `<div class="redo-entry" data-depth="${i}" style="cursor:${isLast ? 'default' : 'pointer'};padding:2px 4px;${isLast ? 'color:#5a6a4a;' : 'background:rgba(119,255,97,0.08);'}">
            <span style="color:#d4f5cd;">&rarr;</span> ${label}${target ? ' <span style="color:#84967c;">' + this._escapeHtml(target) + '</span>' : ''}
          </div>`;
        }).join('');
        const that = this;
        redoList.querySelectorAll('.redo-entry').forEach((el) => {
          const depth = parseInt(el.dataset.depth, 10);
          if (depth === entries.length - 1) return;
          el.addEventListener('click', () => {
            for (let j = 0; j <= depth; j++) that.redo();
          });
        });
      }
    }
  },

  _escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // ── Plugin contract (so it can be registered in the PluginManager) ─

  update(dt) {},

  nodes: {},
};
