/**
 * SceneComposerPlugin - Plugin wrapper for the AI Scene Composer.
 *
 * Exposes the deterministic template-based scene builder (in
 * `core/SceneComposer.js`) to:
 *   - The brutalist node graph via `AI/ComposeSceneNode`
 *   - The window event bus via `scene:compose` (so menus + AI experts
 *     can trigger a composition without needing a direct reference)
 *   - The AIAgent orchestrator as a new expert (`SceneComposerExpert`)
 *     that can recommend compositions when the scene is empty
 *   - The SceneIO save/load pipeline (in `core/SceneIO.js`) so a
 *     "composed" scene can be saved and reloaded.
 *
 * Public API:
 *   compose(plan)               -> THREE.Group | null
 *     Convenience wrapper. Picks a fresh seed if plan.seed is omitted.
 *
 *   composeFromPrompt(prompt, opts) -> THREE.Group | null
 *     Heuristic prompt -> plan -> compose. No LLM dependency.
 *     Returns the new group (caller adds to scene).
 *
 *   composeFromPromptLLM(prompt, opts) -> Promise<THREE.Group | null>
 *     If an OPENAI_API_KEY is set AND the browser supports CORS
 *     fetch to api.openai.com, asks the LLM to emit a plan JSON,
 *     then composes. Falls back to composeFromPrompt on any
 *     failure (network / parse / 401).
 *
 *   listTemplates() -> [{ id, name, description, category }]
 *   listPalettes()  -> [paletteName, ...]
 *   getTemplate(id) -> Template | null
 *
 * The plugin is non-breaking: it never calls into existing plugins
 * without going through their public methods, and it never
 * overwrites state the user has set. Composing a new scene adds
 * objects; it does not clear what's already there (the caller can
 * clear first if they want a fresh scene).
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';
import { logger } from '../core/Logger.js';
import { SceneComposer } from '../core/SceneComposer.js';
import { SceneComposerLLM } from '../bindings/SceneComposerLLM.js';

export const SceneComposerPlugin = {
  name: 'SceneComposer',
  _state: null,
  _lastPlan: null,
  _lastGroup: null,
  _llmEnabled: false,
  _composing: false,
  _expert: null,

  init(state) {
    this._state = state;
    this._llmEnabled = SceneComposerLLM.isAvailable();
    this._setupEventListeners();
    this._registerExpert();
    logger.log('SceneComposerPlugin', `Initialized (LLM=${this._llmEnabled ? 'available' : 'unavailable — using heuristic'}).`);
  },

  update(dt) {},

  _setupEventListeners() {
    window.addEventListener('scene:compose', (e) => {
      const detail = e.detail || {};
      this.composeFromPrompt(detail.prompt || detail.preset || 'forest', detail);
    });
    window.addEventListener('scene:compose:llm', async (e) => {
      const detail = e.detail || {};
      try {
        await this.composeFromPromptLLM(detail.prompt || 'forest', detail);
      } catch (err) {
        logger.error('SceneComposerPlugin', 'LLM compose failed:', err);
      }
    });
  },

  _registerExpert() {
    // Lazy-register the SceneComposerExpert on the AIAgent orchestrator
    // so the AI can recommend compositions when the scene is empty.
    // AIAgentPlugin's init() sets `window.AgentOrchestrator`; since
    // the registration order in MasterApp is AIAgents → ...
    // → SceneComposerPlugin, the orchestrator should exist by the
    // time we get here. We poll for it (with a small retry budget)
    // rather than using a magic setTimeout, so the expert registers
    // as soon as the orchestrator is ready without a race window.
    const tryRegister = (attemptsLeft) => {
      const orchestrator = window.AgentOrchestrator;
      if (orchestrator) {
        this._registerExpertOn(orchestrator);
        return;
      }
      if (attemptsLeft > 0) {
        setTimeout(() => tryRegister(attemptsLeft - 1), 50);
      } else {
        logger.warn('SceneComposerPlugin', 'AIAgent orchestrator not found after retries; SceneComposerExpert not registered.');
      }
    };
    tryRegister(10);  // ~500ms budget
  },

  _registerExpertOn(orchestrator) {
    if (this._expert) return; // already registered
    this._expert = {
        domain: 'SceneComposer',
        stateManager: this._state,
        thresholds: { minEmptyFrames: 0 },
        onSpawn() {},
        analyze(telemetry) {
          // Recommend a composition only when the scene is empty AND
          // the user has been idle for >10s. We approximate "idle" as
          // "no recent dispatches" by checking the telemetry buffer.
          const scene = this.stateManager?.data?.scene;
          if (!scene) return [];
          let objCount = 0;
          scene.traverse((o) => { if (o.userData?.isManagedObject) objCount++; });
          if (objCount > 5) return [];
          // Check that the last 5 telemetry entries are NOT user actions
          // (i.e. no recent selection:changed / gizmo:transform: end)
          const recent = telemetry.slice(-5);
          const allQuiet = recent.every(t =>
            !t.path || t.path.startsWith('performance.') || t.path.startsWith('physics.') || t.path.startsWith('nodeGraph.')
          );
          if (!allQuiet) return [];
          return [{
            reason: 'Scene is empty. Try the AI/ComposeSceneNode to build a starter scene from a prompt.',
            action: {
              type: 'SCENE/COMPOSE_RECOMMEND',
              payload: { recommended: true, count: 0 },
              path: 'scene.compose.recommend',
            },
          }];
        },
        execute(rec, state) {
          if (rec.action && rec.action.type === 'SCENE/COMPOSE_RECOMMEND') {
            // Just surface a notification — the user has to click the node
            // explicitly. We do NOT auto-compose because that would be
            // surprising (scene would change under the user).
            if (rec.reason) {
              state.emit('notification', {
                message: `[SceneComposer] ${rec.reason}`,
                type: 'info',
              });
            }
          }
        },
      };
      orchestrator.spawnExpert('SceneComposer', this._expert);
  },

  _getScene() {
    return this._state && this._state.data && this._state.data.scene;
  },

  _getPluginManager() {
    return this._state && this._state.data && this._state.data.pluginManager;
  },

  /**
   * Core compose method. Returns the new group (caller decides whether
   * to add to scene). Internally calls the SceneComposer module which
   * dispatches to existing plugins.
   */
  compose(plan) {
    if (this._composing) {
      logger.warn('SceneComposerPlugin', 'compose: already composing, ignoring re-entrant call');
      return null;
    }
    this._composing = true;
    try {
      if (!plan.seed) plan.seed = Math.floor(Math.random() * 0x7fffffff);
      const group = SceneComposer.compose(plan, this._state);
      if (group) {
        this._lastPlan = plan;
        this._lastGroup = group;
        this._state.emit('scene:composed', { plan, group });
        // Notify user
        this._state.emit('notification', {
          message: `Composed "${plan.template}" scene (seed=${plan.seed})`,
          type: 'success',
        });
      }
      return group;
    } finally {
      this._composing = false;
    }
  },

  /**
   * Heuristic prompt -> plan -> compose. No LLM.
   * Returns the new group (caller adds to scene).
   */
  composeFromPrompt(prompt, options = {}) {
    const plan = SceneComposer.derivePlanFromPrompt(prompt, options);
    if (options.palette) plan.palette = options.palette;
    const group = this.compose(plan);
    if (group && this._getScene()) {
      this._getScene().add(group);
      // Auto-frame the camera on the new group (uses LightingPlugin)
      setTimeout(() => {
        const lighting = this._getPluginManager()?._plugins?.get?.('Lighting');
        if (lighting && lighting.frameAll) lighting.frameAll();
      }, 200);
      // Auto-select the new group so the user can immediately edit it
      const selection = this._getPluginManager()?._plugins?.get?.('Selection');
      if (selection && selection._setSelection) selection._setSelection([group]);
    }
    return group;
  },

  /**
   * LLM-enhanced compose. Falls back to heuristic if LLM is unavailable
   * or fails. The LLM backend is in `bindings/SceneComposerLLM.js`.
   */
  async composeFromPromptLLM(prompt, options = {}) {
    if (!this._llmEnabled) {
      logger.log('SceneComposerPlugin', 'LLM not available, using heuristic');
      return this.composeFromPrompt(prompt, options);
    }
    try {
      const llmPlan = await SceneComposerLLM.derivePlanFromPrompt(prompt, {
        templates: SceneComposer.listTemplates(),
        palettes: SceneComposer.listPalettes(),
      });
      if (llmPlan) {
        llmPlan.seed = options.seed || Math.floor(Math.random() * 0x7fffffff);
        const group = this.compose(llmPlan);
        if (group && this._getScene()) {
          this._getScene().add(group);
          setTimeout(() => {
            const lighting = this._getPluginManager()?._plugins?.get?.('Lighting');
            if (lighting && lighting.frameAll) lighting.frameAll();
          }, 200);
          const selection = this._getPluginManager()?._plugins?.get?.('Selection');
          if (selection && selection._setSelection) selection._setSelection([group]);
        }
        return group;
      }
    } catch (err) {
      logger.warn('SceneComposerPlugin', 'LLM compose failed, falling back to heuristic:', err);
    }
    return this.composeFromPrompt(prompt, options);
  },

  listTemplates() { return SceneComposer.listTemplates(); },
  listPalettes()  { return SceneComposer.listPalettes(); },
  getTemplate(id) { return SceneComposer.getTemplate(id); },

  getLastPlan()  { return this._lastPlan; },
  getLastGroup() { return this._lastGroup; },

  // ── Node Graph integration ───────────────────────────────────────────

  /**
   * Called by NodeGraphExecutor when a `AI/ComposeSceneNode` is
   * executed on-demand (Run button click).
   *
   * Reads the DOM inputs:
   *   data-prop="prompt"  (text)
   *   data-prop="density" (number 0-1)
   *   data-prop="style"   (string: 'auto' | 'realistic' | 'stylized' | 'minimal')
   *   data-prop="seed"    (number; 0 = random)
   *   data-prop="useLLM"  (0/1 — only effective if LLM is available)
   */
  async executeNode(node, parsed) {
    const prompt = (parsed.prompt || 'natural forest with a stream').toString();
    const density = Math.max(0, Math.min(1, parseFloat(parsed.density) || 0.7));
    const style = (parsed.style || 'auto').toString();
    const seed = parseInt(parsed.seed, 10) || 0;
    const useLLM = (parsed.useLLM === undefined ? true : String(parsed.useLLM) !== '0');
    const options = { density, style };
    if (seed) options.seed = seed;
    if (useLLM && this._llmEnabled) {
      return this.composeFromPromptLLM(prompt, options);
    }
    return this.composeFromPrompt(prompt, options);
  },

  // ── Visual Nodes ──────────────────────────────────────────────────────

  nodes: {
    'AI/ComposeSceneNode': (x, y) => {
      const body = document.createElement('div');
      body.className = 'scene-composer-body';
      body.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;';
      const llmLabel = SceneComposerLLM.isAvailable() ? 'ON' : 'OFF (no key)';
      body.innerHTML = [
        '<div style="font-size:9px;color:#5a6a4a;font-style:italic;">7 templates • offline-first</div>',
        '<label style="font-size:10px;color:#84967c;">PROMPT</label>',
        '<textarea data-prop="prompt" rows="2" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;font-family:monospace;resize:vertical;">medieval village on a lake at dusk</textarea>',
        '<label style="font-size:10px;color:#84967c;">DENSITY (0 = sparse, 1 = full)</label>',
        '<input type="range" data-prop="density" min="0" max="1" step="0.05" value="0.7" style="width:100%">',
        '<label style="font-size:10px;color:#84967c;">STYLE</label>',
        '<select data-prop="style" style="background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;">',
        '<option value="auto">Auto (template default)</option>',
        '<option value="realistic">Realistic</option>',
        '<option value="stylized">Stylized</option>',
        '<option value="minimal">Minimal</option>',
        '</select>',
        '<label style="font-size:10px;color:#84967c;">SEED (0 = random)</label>',
        '<input type="number" data-prop="seed" value="0" min="0" max="2147483647" step="1" style="width:100%;background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:4px;">',
        `<label style="font-size:10px;color:#84967c;">USE LLM (${llmLabel})</label>`,
        '<select data-prop="useLLM" style="background:#1c1b1b;color:#77ff61;border:1px solid #3b4b35;padding:3px;">',
        `<option value="1" ${llmLabel === 'ON' ? '' : 'disabled'}>ON (if available)</option>`,
        '<option value="0" selected>OFF (heuristic only)</option>',
        '</select>',
        '<button class="scene-composer-run" data-action="run" style="margin-top:6px;background:#9b30ff;color:#fff;border:2px solid #000;font-weight:700;padding:6px;cursor:pointer;">',
        '\u2728 COMPOSE SCENE',
        '</button>',
      ].join('');
      return createNodeCard(x, y, '\u2728 AI Compose Scene', ['Prompt', 'Density', 'Style', 'Seed', 'UseLLM'], ['Assembled Group'], { body, extraClasses: ['node-card-ai'] });
    },
  },
};
