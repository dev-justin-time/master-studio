/**
 * AIAgentPlugin - Agentic orchestrator with domain-specific expert agents.
 * Experts monitor telemetry, analyze performance, and self-optimize the studio.
 */
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';

// ═══════════════════════════════════════════════════════════════════════════
// BASE EXPERT
// ═══════════════════════════════════════════════════════════════════════════

class BaseExpert {
  constructor() {
    this.thresholds = {};
    this.domain = '';
    this.stateManager = null;
  }
  onSpawn(state) {}
  analyze(telemetry) { return []; }
  execute(recommendation, state) {
    if (recommendation.action) {
      state.dispatch(recommendation.action);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE EXPERT - Monitors FPS, toggles heavy effects
// ═══════════════════════════════════════════════════════════════════════════

class PerformanceExpert extends BaseExpert {
  constructor() {
    super();
    this.thresholds = { minFPS: 50, outlinePassEnabled: true };
  }

  analyze(telemetry) {
    const fpsData = telemetry.filter(t => t.path === 'performance.fps').slice(-10);
    if (fpsData.length === 0) return [];

    const avgFPS = fpsData.reduce((sum, t) => sum + (t.value ?? 0), 0) / fpsData.length;
    const recommendations = [];

    if (avgFPS < this.thresholds.minFPS && this.thresholds.outlinePassEnabled) {
      recommendations.push({
        reason: `FPS dropped to ${avgFPS.toFixed(1)}. Disabling Outline Pass.`,
        action: { type: 'RENDER/SET_OUTLINE_PASS', payload: false, path: 'render.outlinePass' }
      });
      this.thresholds.outlinePassEnabled = false;
    } else if (avgFPS > 58 && !this.thresholds.outlinePassEnabled) {
      recommendations.push({
        reason: `FPS recovered to ${avgFPS.toFixed(1)}. Re-enabling Outline Pass.`,
        action: { type: 'RENDER/SET_OUTLINE_PASS', payload: true, path: 'render.outlinePass' }
      });
      this.thresholds.outlinePassEnabled = true;
    }

    return recommendations;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY EXPERT - Monitors memory, triggers GC
// ═══════════════════════════════════════════════════════════════════════════

class MemoryExpert extends BaseExpert {
  constructor() {
    super();
    this.thresholds = {
      maxMemoryMB: 500,
      lastCleanup: 0,
      // Per-type GPU accumulation thresholds + cooldowns. The defaults
      // are "you probably have a few experimental lights/imports you
      // forgot about". 30s cooldowns match the water-cubemap pattern
      // (long enough to be quiet while the user is actively creating,
      // short enough to re-fire after a clean).
      gfx: {
        'water-cubemap':          { maxCount: 4, cooldownMS: 30000, lastRecommend: 0 },
        'shadow-map':             { maxCount: 6, cooldownMS: 30000, lastRecommend: 0 },
        'hdri-envmap':            { maxCount: 3, cooldownMS: 30000, lastRecommend: 0 },
        'pointcloud-geometry':    { maxCount: 3, cooldownMS: 30000, lastRecommend: 0 },
        'cad-geometry':           { maxCount: 3, cooldownMS: 30000, lastRecommend: 0 },
      },
    };
  }

  analyze(telemetry) {
    const recommendations = [];

    // 1) CPU-side memory pressure (existing behaviour, unchanged).
    const memData = telemetry.filter(t => t.path === 'performance.memoryMB').slice(-1);
    if (memData.length > 0) {
      const currentMB = memData[0].value;
      if (currentMB > this.thresholds.maxMemoryMB) {
        recommendations.push({
          reason: `Memory usage high (${currentMB.toFixed(0)}MB). Triggering texture cleanup.`,
          action: { type: 'MEMORY/GC_TEXTURES', payload: Date.now(), path: 'memory.gc' },
        });
        this.thresholds.maxMemoryMB += 50;
      }
    }

    // 2) GPU-side accumulation across 5 resource types. We process
    // each type independently (per-type thresholds + cooldowns) so
    // one busy type doesn't suppress recommendations for the others.
    // The dispatch path follows the type's domain (e.g. `shadows.
    // recommendCleanup`, `hdri.recommendCleanup`) which mirrors the
    // existing `water.recommendCleanup` contract — the GfxResourcePanel
    // subscribes to each path independently.
    for (const [type, cfg] of Object.entries(this.thresholds.gfx)) {
      const rec = this._analyzeGfxType(telemetry, type, cfg);
      if (rec) {
        recommendations.push(rec);
        cfg.lastRecommend = Date.now();
      }
    }

    return recommendations;
  }

  /**
   * Per-type GFX accumulation check. Walks the telemetry stream to
   * rebuild a `Map<resourceId, bytes>` for the type, sums current
   * live count + bytes, and emits a recommendation if the count
   * exceeds the configured threshold AND the cooldown has elapsed.
   *
   * Why rebuild the Map every cycle instead of trusting a running
   * total? The StateManager only maintains running totals for
   * `waterCount` / `waterBytes` (the first tracked type). For the
   * other 4 types we have to tally from the 500-entry telemetry
   * buffer, which is the single source of truth and works regardless
   * of whether telemetry was truncated.
   *
   * @param {Array} telemetry     - the AIAgent telemetry buffer
   * @param {string} type         - the gfxDelta.type to tally
   * @param {{maxCount: number, cooldownMS: number, lastRecommend: number}} cfg
   * @returns {object|null}       - recommendation or null
   */
  _analyzeGfxType(telemetry, type, cfg) {
    const deltas = telemetry.filter(
      (t) => t.path === 'performance.gfxDelta' && t.value && t.value.type === type
    );
    if (deltas.length === 0) return null;

    // Walk the buffer in chronological order, building the live-set.
    // `allocate` adds, `update` replaces bytes, `release` removes.
    const byId = new Map();
    for (const d of deltas) {
      const { event, resourceId, bytes } = d.value;
      if (event === 'allocate') byId.set(resourceId, typeof bytes === 'number' ? bytes : 0);
      else if (event === 'update') {
        if (byId.has(resourceId)) byId.set(resourceId, typeof bytes === 'number' ? bytes : byId.get(resourceId));
      } else if (event === 'release') {
        byId.delete(resourceId);
      }
    }

    const currentCount = byId.size;
    if (currentCount < cfg.maxCount) return null;
    if (Date.now() - cfg.lastRecommend < cfg.cooldownMS) return null;

    const currentBytes = Array.from(byId.values()).reduce((a, b) => a + b, 0);
    const mb = currentBytes / (1024 * 1024);

    // Map each type to a human-readable noun + dispatch path. The
    // path mirrors the type's domain so subscribers (GfxResourcePanel)
    // can filter naturally (`shadows.recommendCleanup`,
    // `pointclouds.recommendCleanup`, etc.).
    const META = {
      'water-cubemap':       { noun: 'water surfaces',    type: 'WATER/RECOMMEND_CLEANUP',      path: 'water.recommendCleanup' },
      'shadow-map':          { noun: 'shadow maps',       type: 'SHADOW/RECOMMEND_CLEANUP',     path: 'shadows.recommendCleanup' },
      'hdri-envmap':         { noun: 'HDRI env maps',     type: 'HDRI/RECOMMEND_CLEANUP',       path: 'hdri.recommendCleanup' },
      'pointcloud-geometry': { noun: 'point cloud meshes', type: 'POINTCLOUD/RECOMMEND_CLEANUP', path: 'pointclouds.recommendCleanup' },
      'cad-geometry':        { noun: 'CAD models',        type: 'CAD/RECOMMEND_CLEANUP',        path: 'cad.recommendCleanup' },
    };
    const meta = META[type];
    if (!meta) return null;

    return {
      reason: `${currentCount} ${meta.noun} active (~${mb.toFixed(1)}MB GPU). Consider deleting unused ${meta.noun} to free GPU memory.`,
      action: {
        type: meta.type,
        payload: { count: currentCount, bytes: currentBytes, mb },
        path: meta.path,
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICS EXPERT - Monitors step time, adjusts substeps
// ═══════════════════════════════════════════════════════════════════════════

class PhysicsExpert extends BaseExpert {
  constructor() {
    super();
    this.thresholds = { maxPhysicsTimeMS: 8, currentSubsteps: 10 };
  }

  analyze(telemetry) {
    const physData = telemetry.filter(t => t.path === 'physics.stepTimeMS').slice(-5);
    if (physData.length === 0) return [];

    const avgTime = physData.reduce((sum, t) => sum + (t.value ?? 0), 0) / physData.length;
    const recommendations = [];

    if (avgTime > this.thresholds.maxPhysicsTimeMS && this.thresholds.currentSubsteps > 4) {
      recommendations.push({
        reason: `Physics step ${avgTime.toFixed(1)}ms. Reducing substeps.`,
        action: { type: 'PHYSICS/SET_SUBSTEPS', payload: this.thresholds.currentSubsteps - 2, path: 'physics.substeps' }
      });
      this.thresholds.currentSubsteps -= 2;
    }

    return recommendations;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE GRAPH EXPERT - Monitors node evaluation time
// ═══════════════════════════════════════════════════════════════════════════

class NodeGraphExpert extends BaseExpert {
  constructor() {
    super();
    this.thresholds = { maxNodeEvalTimeMS: 5 };
  }

  analyze(telemetry) {
    const nodeData = telemetry.filter(t => t.type === 'NODE_GRAPH/EVAL_TIME').slice(-1);
    if (nodeData.length === 0) return [];

    const evalTime = nodeData[0].value;
    const recommendations = [];

    if (evalTime > this.thresholds.maxNodeEvalTimeMS) {
      recommendations.push({
        reason: `Node graph eval ${evalTime.toFixed(1)}ms. Enabling aggressive caching.`,
        action: { type: 'NODE_GRAPH/ENABLE_CACHE', payload: true, path: 'nodeGraph.cacheEnabled' }
      });
    }

    return recommendations;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI AGENT PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

export const AIAgentPlugin = {
  name: 'AIAgents',
  _experts: new Map(),
  _telemetryBuffer: [],
  _analysisInterval: 2000,
  _lastAnalysis: 0,
  _state: null,

  init(stateManager) {
    this._state = stateManager;
    window.AgentOrchestrator = this;

    // Spawn default experts
    this.spawnExpert('Performance', new PerformanceExpert());
    this.spawnExpert('Memory', new MemoryExpert());
    this.spawnExpert('Physics', new PhysicsExpert());
    this.spawnExpert('NodeGraph', new NodeGraphExpert());

    logger.log(`[AIAgents] Orchestrator initialized with ${this._experts.size} experts.`);
  },

  update(deltaTime) {
    const now = performance.now();
    if (now - this._lastAnalysis > this._analysisInterval) {
      this._runAnalysisCycle();
      this._lastAnalysis = now;
    }
  },

  ingestTelemetry(action) {
    this._telemetryBuffer.push({
      timestamp: performance.now(),
      type: action.type,
      path: action.path,
      value: action.payload
    });

    if (this._telemetryBuffer.length > 500) {
      this._telemetryBuffer.shift();
    }
  },

  spawnExpert(domain, expertInstance) {
    expertInstance.domain = domain;
    expertInstance.stateManager = this._state;
    this._experts.set(domain, expertInstance);
    expertInstance.onSpawn(this._state);
  },

  _runAnalysisCycle() {
    this._experts.forEach((expert, domain) => {
      try {
        const recommendations = expert.analyze(this._telemetryBuffer);
        if (recommendations && recommendations.length > 0) {
          recommendations.forEach(rec => {
            logger.log(`[AI Expert: ${domain}]`, rec.reason);
            expert.execute(rec, this._state);
            // Surface the recommendation to the user via the same
            // notification channel MasterApp uses (so toasts pop up).
            // Without this emit, recommendations would only show up in
            // the console — easy to miss in a busy session. Skipped for
            // noisy high-frequency recommendations (e.g. PERF/GFX tick)
            // by checking that the expert actually returns a reason.
            if (rec.reason) {
              this._state.emit('notification', {
                message: `[${domain}] ${rec.reason}`,
                type: 'info',
              });
            }
            // Wire WATER/RECOMMEND_CLEANUP to actual disposal via a
            // window event. WaterPlugin listens for `water:cleanup`
            // and runs `_autoCleanupWaters` (off-camera + budget),
            // which makes the AI's recommendation an action instead
            // of just a toast. Other GFX types (shadows, HDRIs,
            // point clouds, CAD) don't have a dedicated auto-cleanup
            // yet; their recommendations stay informational.
            if (rec.action && rec.action.type === 'WATER/RECOMMEND_CLEANUP') {
              window.dispatchEvent(new CustomEvent('water:cleanup', {
                detail: rec.action.payload || {},
              }));
            }
          });
        }
      } catch (err) {
        logger.error(`[AI Expert: ${domain}]`, 'Analysis failed:', err);
      }
    });
  },

  // ── Visual Nodes ──
  nodes: {
    'AI/AgentDashboardNode': (x, y) =>
      createNodeCard(x, y, 'AI Agent Dashboard', [], ['System Healthy']),
  }
};