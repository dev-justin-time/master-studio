/**
 * AIAgentPlugin - Agentic orchestrator with domain-specific expert agents.
 * Experts monitor telemetry, analyze performance, and self-optimize the studio.
 */
import { createNodeCard } from './NodeFactory.js';

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
    this.thresholds = { maxMemoryMB: 500, lastCleanup: 0 };
  }

  analyze(telemetry) {
    const memData = telemetry.filter(t => t.path === 'performance.memoryMB').slice(-1);
    if (memData.length === 0) return [];

    const currentMB = memData[0].value;
    const recommendations = [];

    if (currentMB > this.thresholds.maxMemoryMB) {
      recommendations.push({
        reason: `Memory usage high (${currentMB.toFixed(0)}MB). Triggering texture cleanup.`,
        action: { type: 'MEMORY/GC_TEXTURES', payload: Date.now(), path: 'memory.gc' }
      });
      this.thresholds.maxMemoryMB += 50;
    }

    return recommendations;
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

    console.log(`[AIAgents] Orchestrator initialized with ${this._experts.size} experts.`);
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
            console.log(`[AI Expert: ${domain}] ${rec.reason}`);
            expert.execute(rec, this._state);
          });
        }
      } catch (err) {
        console.error(`[AI Expert: ${domain}] Analysis failed:`, err);
      }
    });
  },

  // ── Visual Nodes ──
  nodes: {
    'AI/AgentDashboardNode': (x, y) =>
      createNodeCard(x, y, 'AI Agent Dashboard', [], ['System Healthy']),
  }
};
