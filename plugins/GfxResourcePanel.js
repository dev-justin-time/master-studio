/**
 * GfxResourcePanel.js — Live GFX resource table + cleanup recommendations.
 *
 * Subscribes to the StateManager's `performance.gfxDelta` telemetry stream
 * and the AIAgent MemoryExpert's `water.recommendCleanup` recommendation
 * payload, then renders a live table inside the Properties panel of
 * scene.html / studio.html (and the state-debug panel of index.html) so
 * the user can see exactly which cubemap / texture is consuming GPU
 * memory without opening devtools.
 *
 * Table columns:
 *   • ID     — the resourceId (e.g. `water/<uuid>/cubemap`); truncated,
 *              full id on hover via `title=`
 *   • TYPE   — type tag with a per-type colored badge (water-cubemap, etc.)
 *   • BYTES  — formatted as B / KB / MB / GB, right-aligned, neon green
 *   • LABEL  — the human label (usually the mesh name); truncated, full on hover
 *   • AGE    — `Date.now() - allocatedAt`, formatted as ms/s/m/h/d, updated
 *              every time the table re-renders (i.e. on each gfxDelta event)
 *
 * Recommendation banner:
 *   • Shows when `state.water.recommendCleanup` is non-null
 *   • Displays the AI reason + the live count/bytes
 *   • Has a dismiss button that dispatches `WATER/RECOMMEND_CLEANUP` with
 *     `payload: null` to clear the state (the MemoryExpert's 30s cooldown
 *     will re-fire if water count is still above the threshold)
 *
 * Lifecycle (mirrors WaterDebugOverlay):
 *   • `init(state)` — looks up the StateManager via `state.data.pluginManager`,
 *     locates the DOM mount, allocates local state, subscribes to the two
 *     paths, does an initial snapshot via `getGfxResources()` + `getState()`
 *   • `update(dt)` — no-op (event-driven, no per-frame work)
 *   • `dispose()` — unsubscribes from the two state paths
 *
 * Graceful degradation:
 *   • No StateManager registered → warn + disable (other pages / tests)
 *   • No `#gfx-resource-panel-container` in DOM → warn + disable (other
 *     pages that don't include the mount, e.g. nodearchitect.html)
 */

import { logger } from '../core/Logger.js';

// ── Format helpers ────────────────────────────────────────────────────────

/**
 * Format a byte count as the largest sensible unit (B / KB / MB / GB).
 * Uses 1024-based units (matches the StateManager's byte accounting).
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format a millisecond duration as the largest sensible unit.
 * 500ms → "500ms", 5s → "5s", 2m → "2m", 1h → "1h", 3d → "3d".
 */
function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Truncate a string with a trailing ellipsis if it exceeds `n` chars. */
function truncate(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** HTML-escape a value for safe innerHTML insertion. */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Plugin ────────────────────────────────────────────────────────────────

export const GfxResourcePanel = {
  name: 'GfxResourcePanel',
  _state: null,           // MasterState (event bus)
  _sm: null,              // StateManager plugin instance
  _container: null,
  _tbody: null,
  _countEl: null,
  _totalEl: null,
  _recommendEl: null,
  _recommendMsgEl: null,
  _recommendDismissBtn: null,
  _resources: new Map(),  // id -> { type, label, bytes, allocatedAt }
  // Per-type recommendation state. Each key matches a dispatch path
  // the AIAgent MemoryExpert writes to (water.recommendCleanup,
  // shadows.recommendCleanup, hdri.recommendCleanup, etc.). The value
  // is the payload (or null) and drives the corresponding banner row.
  _recommendations: {
    'water.recommendCleanup':     null,
    'shadows.recommendCleanup':   null,
    'hdri.recommendCleanup':      null,
    'pointclouds.recommendCleanup': null,
    'cad.recommendCleanup':       null,
  },
  _mounted: false,
  _unsubs: [],
  // (legacy single-banner dismiss binding retained for compatibility
  //  with pages that still mount the original #gfx-recommend-dismiss;
  //  the per-type rows use inline handlers installed in _renderRecommend)
  _onDismissBound: null,

  init(state) {
    this._state = state;

    // The 'state' passed to plugins is the MasterState event bus. The
    // StateManager plugin is a separate object — we reach it through
    // the plugin manager (the same path WaterPlugin uses).
    this._sm = state && state.data && state.data.pluginManager
      ? state.data.pluginManager._plugins && state.data.pluginManager._plugins.get('StateManager')
      : null;
    if (!this._sm) {
      logger.warn('GfxResourcePanel', 'StateManager not found via state.data.pluginManager; panel disabled.');
      return;
    }

    // Look up the DOM mount. The mount is optional (other pages may not
    // include it) — the plugin should no-op gracefully like WaterDebugOverlay.
    this._container = typeof document !== 'undefined'
      ? document.getElementById('gfx-resource-panel-container')
      : null;
    if (!this._container) {
      logger.warn('GfxResourcePanel', 'No #gfx-resource-panel-container in DOM; panel disabled.');
      return;
    }

    this._tbody = this._container.querySelector('#gfx-tbody');
    this._countEl = this._container.querySelector('#gfx-count');
    this._totalEl = this._container.querySelector('#gfx-total');
    this._recommendEl = this._container.querySelector('#gfx-recommend');
    this._recommendMsgEl = this._container.querySelector('#gfx-recommend-msg');
    this._recommendDismissBtn = this._container.querySelector('#gfx-recommend-dismiss');
    // Per-type banner elements. Each path gets its own row in the
    // panel so multiple recommendations can show simultaneously
    // (e.g. "4 water surfaces" + "5 shadow maps" at once). The DOM
    // is optional — if a page only mounts some of them, the rest no-op.
    this._recommendRows = {
      'water.recommendCleanup':       this._container.querySelector('[data-rec="water"]'),
      'shadows.recommendCleanup':     this._container.querySelector('[data-rec="shadows"]'),
      'hdri.recommendCleanup':        this._container.querySelector('[data-rec="hdri"]'),
      'pointclouds.recommendCleanup': this._container.querySelector('[data-rec="pointclouds"]'),
      'cad.recommendCleanup':         this._container.querySelector('[data-rec="cad"]'),
    };

    if (!this._tbody) {
      logger.warn('GfxResourcePanel', 'Mount present but #gfx-tbody missing; panel disabled.');
      return;
    }

    // Wire up the legacy single-banner dismiss button (pages that
    // mount #gfx-recommend-dismiss).
    this._onDismissBound = () => this._onDismiss('water.recommendCleanup');
    if (this._recommendDismissBtn) {
      this._recommendDismissBtn.addEventListener('click', this._onDismissBound);
    }

    // Wire up per-type dismiss buttons ONCE at init. Per the DOM
    // spec, `EventTarget.cloneNode()` does NOT copy event listeners,
    // so the previous (re-)bind-on-every-render approach was
    // equivalent to this — just with extra GC churn from cloning
    // the button on every dispatch. Install once, render only
    // updates message text + show/hide.
    for (const path of Object.keys(this._recommendations)) {
      const row = this._recommendRows[path];
      if (!row) continue;
      const dismissBtn = row.querySelector('.gfx-rec-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => this._onDismiss(path));
      }
    }

    // Initial snapshot: pull the current resource registry + the current
    // recommendations from the StateManager. This covers the case where
    // resources were allocated before the panel mounted (e.g. a water
    // was created at startup, then the panel registered later).
    const initial = this._sm.getGfxResources();
    for (const r of initial) {
      this._resources.set(r.id, { ...r });
    }
    for (const path of Object.keys(this._recommendations)) {
      this._recommendations[path] = this._sm.getState(path);
    }
    this._mounted = true;

    // Subscribe to the gfxDelta stream + each per-type recommendation
    // path. `subscribe` returns an unsubscribe function; stash them in
    // `_unsubs` so `dispose()` can release them.
    this._unsubs.push(this._sm.subscribe('performance.gfxDelta', (value) => this._onGfxDelta(value)));
    for (const path of Object.keys(this._recommendations)) {
      this._unsubs.push(this._sm.subscribe(path, (value) => this._onRecommend(path, value)));
    }

    // First render so the table is populated immediately, not after the
    // first event tick.
    this._renderTable();
    this._renderRecommend();

    logger.log('GfxResourcePanel', `Initialized with ${this._resources.size} resource(s).`);
  },

  // ── Event handlers ─────────────────────────────────────────────────────

  /**
   * Handle a `performance.gfxDelta` patch. The StateManager's
   * `_setNestedState` stores the full payload as the value at the path,
   * so `value` IS the `{ event, resourceId, type, label, bytes, … }` object.
   */
  _onGfxDelta(payload) {
    if (!this._mounted || !payload) return;
    const { event, resourceId, type, label, bytes } = payload;
    if (event === 'allocate') {
      this._resources.set(resourceId, {
        type: type || 'unknown',
        label: label || '',
        bytes: typeof bytes === 'number' ? bytes : 0,
        allocatedAt: Date.now(),
      });
    } else if (event === 'update') {
      const existing = this._resources.get(resourceId);
      if (existing) {
        // Re-registration with new bytes — keep the original `allocatedAt`
        // so the age reflects the resource's lifetime, not the last update.
        existing.bytes = typeof bytes === 'number' ? bytes : existing.bytes;
        if (label) existing.label = label;
        if (type) existing.type = type;
      } else {
        // Update for a previously-released id — treat as a fresh allocate.
        this._resources.set(resourceId, {
          type: type || 'unknown',
          label: label || '',
          bytes: typeof bytes === 'number' ? bytes : 0,
          allocatedAt: Date.now(),
        });
      }
    } else if (event === 'release') {
      this._resources.delete(resourceId);
    }
    this._renderTable();
  },

  /**
   * Handle a `*.recommendCleanup` patch. The AIAgent MemoryExpert
   * dispatches `{ count, bytes, mb }` for whichever GFX type exceeded
   * its threshold; `null` clears the recommendation.
   *
   * @param {string} path   - the state path dispatched (e.g. 'shadows.recommendCleanup')
   * @param {object|null} value - the recommendation payload
   */
  _onRecommend(path, value) {
    if (!this._mounted) return;
    if (!Object.prototype.hasOwnProperty.call(this._recommendations, path)) return;
    this._recommendations[path] = value;
    this._renderRecommend(path);
  },

  /**
   * Dismiss a specific recommendation. Sets the state to `null` via
   * dispatch — the MemoryExpert's per-type cooldown will re-fire if
   * the underlying condition (too many of that type) still holds.
   */
  _onDismiss(path) {
    if (!this._sm) return;
    const DISPATCH_TYPE = {
      'water.recommendCleanup':       'WATER/RECOMMEND_CLEANUP',
      'shadows.recommendCleanup':     'SHADOW/RECOMMEND_CLEANUP',
      'hdri.recommendCleanup':        'HDRI/RECOMMEND_CLEANUP',
      'pointclouds.recommendCleanup': 'POINTCLOUD/RECOMMEND_CLEANUP',
      'cad.recommendCleanup':         'CAD/RECOMMEND_CLEANUP',
    };
    const type = DISPATCH_TYPE[path];
    if (!type) return;
    try {
      this._sm.dispatch({ type, payload: null, path });
    } catch (err) {
      logger.warn('GfxResourcePanel', 'Failed to dismiss recommendation:', err && err.message ? err.message : err);
    }
  },

  // ── Rendering ─────────────────────────────────────────────────────────

  _renderTable() {
    if (!this._tbody) return;

    const entries = Array.from(this._resources.entries())
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => b.bytes - a.bytes); // largest GPU consumers first

    if (entries.length === 0) {
      this._tbody.innerHTML = '<tr class="gfx-empty"><td colspan="5">No GFX resources tracked</td></tr>';
    } else {
      const now = Date.now();
      const rows = entries.map((e) => {
        const age = now - (e.allocatedAt || now);
        return (
          '<tr>' +
            '<td class="gfx-cell-id" title="' + escapeHtml(e.id) + '">' + escapeHtml(truncate(e.id, 28)) + '</td>' +
            '<td><span class="gfx-type-badge gfx-type-' + escapeHtml(e.type) + '">' + escapeHtml(e.type) + '</span></td>' +
            '<td class="gfx-cell-bytes">' + formatBytes(e.bytes) + '</td>' +
            '<td class="gfx-cell-label" title="' + escapeHtml(e.label || '') + '">' + escapeHtml(truncate(e.label || '—', 18)) + '</td>' +
            '<td class="gfx-cell-age">' + formatAge(age) + '</td>' +
          '</tr>'
        );
      });
      this._tbody.innerHTML = rows.join('');
    }

    // Footer: total resource count + total bytes (live)
    if (this._countEl) this._countEl.textContent = String(entries.length);
    if (this._totalEl) {
      const total = entries.reduce((sum, e) => sum + (e.bytes || 0), 0);
      this._totalEl.textContent = formatBytes(total);
    }
  },

  _renderRecommend(onlyPath) {
    // Render a single row (when called from _onRecommend) or all rows
    // (when called from init). The per-type approach lets multiple
    // recommendations show simultaneously without competing for the
    // same banner element. Dismiss listeners are installed ONCE in
    // init() — this method only updates the message text and
    // toggles visibility.
    const paths = onlyPath ? [onlyPath] : Object.keys(this._recommendations);
    for (const path of paths) {
      const row = this._recommendRows[path];
      const value = this._recommendations[path];
      if (!row) continue;
      if (value && typeof value === 'object') {
        const count = value.count;
        const mb = typeof value.mb === 'number' ? value.mb.toFixed(1) : '?';
        const msg = `${count} active (~${mb}MB GPU). Consider deleting unused entries to free GPU memory.`;
        const msgEl = row.querySelector('.gfx-rec-msg');
        if (msgEl) msgEl.textContent = msg;
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    }
  },

  // ── Per-frame (no-op, event-driven) ───────────────────────────────────

  update(dt) {
    // No per-frame work — the table re-renders on every gfxDelta event
    // and the recommendation banner on every recommendCleanup event.
  },

  dispose() {
    if (!this._mounted) return;
    for (const unsub of this._unsubs) {
      try { if (typeof unsub === 'function') unsub(); } catch (e) { /* ignore */ }
    }
    this._unsubs = [];
    if (this._recommendDismissBtn && this._onDismissBound) {
      this._recommendDismissBtn.removeEventListener('click', this._onDismissBound);
    }
    this._mounted = false;
    logger.log('GfxResourcePanel', 'Disposed.');
  },
};
