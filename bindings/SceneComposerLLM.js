/**
 * SceneComposerLLM - Optional LLM backend for the AI Scene Composer.
 *
 * Reads `window.OPENAI_API_KEY` (a build-time / runtime env var
 * convention) and, if present, asks an OpenAI chat-completions model
 * to convert a natural-language prompt into a plan JSON that
 * matches `core/SceneComposer.js`'s template schema.
 *
 * If the key is missing OR fetch fails OR the response is not
 * valid JSON, the SceneComposerPlugin's caller (composeFromPromptLLM)
 * falls back to the deterministic heuristic composer. The demo
 * works offline and without an API key.
 *
 * Why not bundle a local LLM? Bundling a model would push the
 * bundle past 100MB and require WebGPU/WASM support. A thin HTTP
 * client with graceful degradation is the right trade-off for a
 * single demo feature.
 *
 * Public API:
 *   isAvailable() -> bool
 *     True iff `window.OPENAI_API_KEY` is a non-empty string AND
 *     the runtime supports fetch + ReadableStream.
 *
 *   derivePlanFromPrompt(prompt, options) -> Promise<Plan | null>
 *     - options.templates: [{ id, name, description, category, ... }]
 *       The list of available templates (we send id+name+description
 *       so the LLM knows the menu).
 *     - options.palettes: [paletteName, ...]
 *     - Returns a plan object { template, density, seed, palette? } or
 *       null if the LLM is unavailable or returned invalid JSON.
 *
 * The plan schema is intentionally identical to the heuristic
 * composer's output so the two paths are interchangeable.
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

// System prompt sent to the LLM. Tight enough that a "medieval
// village on a lake at sunset" reliably maps to the right template,
// and the response is always valid JSON.
function buildSystemPrompt(templates, palettes) {
  const templateList = templates
    .map(t => `  - ${t.id}: ${t.name} — ${t.description} [category=${t.category}, density=${t.densityRange[0]}-${t.densityRange[1]}]`)
    .join('\n');
  const paletteList = palettes.join(', ');
  return `You are a scene-plan generator for a 3D studio. Convert a natural-language prompt into a JSON plan that selects one of the available templates + a density + an optional palette.

AVAILABLE TEMPLATES:
${templateList}

AVAILABLE PALETTES: ${paletteList}

OUTPUT FORMAT (strict JSON, no markdown fence, no prose):
{
  "template": "<template id from the list above>",
  "density": <number 0-1, where 0.3 = sparse, 0.7 = full, 1.0 = crowded>,
  "palette": "<palette id from the list, or omit for template default>"
}

RULES:
1. Pick the template whose description best matches the prompt.
2. The "density" should reflect the prompt's intensity: a "sparse desert" → 0.3, a "crowded cyberpunk street" → 0.9.
3. If the prompt mentions a time of day (dusk, dawn, night), the template's default palette is usually fine — but you may override to "desert_sunset" or "cyber_punk" if it strongly matches.
4. Always output a single JSON object on a single line, no comments, no trailing whitespace.
5. NEVER invent a template id or palette that isn't in the lists above. If nothing matches, pick the closest template.`;
}

export const SceneComposerLLM = {

  /**
   * Returns true if the LLM is configured (key present) AND the
   * runtime supports fetch. The SceneComposerPlugin uses this to
   * decide whether to expose the "Use LLM" toggle in the node.
   */
  isAvailable() {
    if (typeof window === 'undefined') return false;
    if (typeof fetch !== 'function') return false;
    const key = window.OPENAI_API_KEY;
    return typeof key === 'string' && key.length > 0;
  },

  /**
   * Ask the LLM to convert a prompt into a plan. Returns the plan
   * object (compatible with the heuristic composer's output) or
   * null on any error.
   *
   * Errors are NOT thrown — they return null. The caller (plugin)
   * falls back to the heuristic composer in that case.
   */
  async derivePlanFromPrompt(prompt, options = {}) {
    if (!this.isAvailable()) return null;
    const key = window.OPENAI_API_KEY;
    const systemPrompt = buildSystemPrompt(
      options.templates || [],
      options.palettes || [],
    );
    const userPrompt = (prompt || '').toString().trim() || 'a peaceful natural forest';
    try {
      const controller = new AbortController();
      // 15s timeout — long enough for slow connections, short enough
      // that the user doesn't wait forever if the API is down.
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        }),
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        // 401 = bad key, 429 = rate-limit, 5xx = API down. We don't
        // surface the reason to the user — the plugin's caller will
        // fall back to heuristic.
        return null;
      }
      const json = await response.json();
      const text = json?.choices?.[0]?.message?.content;
      if (!text) return null;
      const plan = this._parseAndValidate(text, options);
      return plan;
    } catch (err) {
      // Network error, timeout, or JSON parse failure. Caller falls back.
      return null;
    }
  },

  /**
   * Parse the LLM's response text + validate against the template
   * and palette whitelists. Returns the plan object or null.
   *
   * Defense in depth: the LLM might emit invalid JSON (rare with
   * `response_format: json_object`, but possible), or invent a
   * template id (impossible if the system prompt is followed, but
   * cheap to guard).
   */
  _parseAndValidate(text, options = {}) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.template !== 'string') return null;
    const validTemplates = (options.templates || []).map(t => t.id);
    if (!validTemplates.includes(parsed.template)) return null;
    let density = parseFloat(parsed.density);
    if (!Number.isFinite(density)) density = 0.7;
    density = Math.max(0, Math.min(1, density));
    const plan = { template: parsed.template, density };
    if (typeof parsed.palette === 'string') {
      const validPalettes = options.palettes || [];
      if (validPalettes.includes(parsed.palette)) plan.palette = parsed.palette;
    }
    return plan;
  },
};
