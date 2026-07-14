/**
 * Logger - selectively DEV-gated console wrapper.
 *
 * In Vite dev mode every call passes through to the underlying `console.*`
 * with an auto-formatted `[Tag]` prefix, so browser/tool devtools keep their
 * "filter by tag" workflow.
 *
 * In production builds the gating is *per-level*:
 *   - `log` / `info` → no-op (noise suppression)
 *   - `warn` / `error` → still pass through (a real user hitting a bug
 *     must see something in their devtools; removing all warnings would be
 *     hostile)
 *
 * API
 *   logger.log(tag, ...args)
 *   logger.warn(tag, ...args)
 *   logger.error(tag, ...args)
 *   logger.info(tag, ...args)
 *
 *   createLogger(tag) → fixed-tag variant: scoped.log/.warn/.error/.info
 *   logger.raw        → raw console (escape hatch for `.catch` handlers etc.)
 *   logger.enabled    → true iff dev mode is active (useful for tests)
 *
 * Tags may be passed with or without square brackets — both forms are
 * normalized via `formatTag`.
 */

const enabled = Boolean(import.meta.env?.DEV);

function formatTag(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return '[log]';
  return tag.startsWith('[') ? tag : `[${tag}]`;
}

function emit(level, tag, args) {
  // log/info → noise suppression in prod. warn/error → always pass through
  // so actual bugs remain visible to end users investigating their own issue.
  if (!enabled && (level === 'log' || level === 'info')) return;
  // Forward directly to the host console so devtools still see source maps
  // pointing at the caller, not at this helper.
  console[level](formatTag(tag), ...args);
}

export const logger = {
  log:   (tag, ...args) => emit('log',   tag, args),
  warn:  (tag, ...args) => emit('warn',  tag, args),
  error: (tag, ...args) => emit('error', tag, args),
  info:  (tag, ...args) => emit('info',  tag, args),
  /** Escape hatch — raw console when a downstream API needs the reference. */
  raw: console,
  /** True when the logger is passing through; useful for tests. */
  enabled,
};

/**
 * Build a fixed-tag logger for repeated calls from the same module.
 * Avoids re-stating the tag at every call site.
 */
export function createLogger(tag) {
  const t = formatTag(tag);
  return {
    log:   (...args) => emit('log',   t, args),
    warn:  (...args) => emit('warn',  t, args),
    error: (...args) => emit('error', t, args),
    info:  (...args) => emit('info',  t, args),
  };
}
