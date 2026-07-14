#!/usr/bin/env node
/**
 * migrate-logs.js - one-shot refactor script.
 *
 * For each target file:
 *   1. Adds `import { logger } from '<path>/core/Logger.js';` if missing
 *   2. Rewrites every `console.(log|warn|error|info)(...)` call to
 *      `logger.<level>(tag, ...rest)`, extracting the `[Tag]` prefix
 *      from the first string-literal argument and preserving any
 *      remaining args.
 *
 * Handles:
 *   - Single-quoted:   '  [MasterApp] Initialized successfully.  '
 *   - Double-quoted:   "  [WasmBridge] Rust module loaded  "
 *   - Template-static: `  [Foo] Rest with ${expr} inside  ` (dynamic body, static tag)
 *   - Template-dynamic:`  [Foo ${dyn}] Rest  ` (entire tag is a template)
 *   - Spread args:     console.log('[X] msg', ...args)
 *   - Empty body:      console.log('[Lua]', ...args) → logger.log('Lua', ...args)
 *
 * Does NOT handle (manual fix-up required):
 *   - console.X used as a method reference, e.g. `.catch(console.error)`
 *   - console.X attached to a non-string-first-arg context (re-raised as console)
 *
 * Idempotent: imports already present → file is skipped entirely.
 */
const fs = require('fs');

const FILES = [
  ['MasterApp.js', './core/Logger.js'],
  ['bindings/WasmBridge.js', '../core/Logger.js'],
  ['bindings/LuaBridge.js', '../core/Logger.js'],
  ['core/NodeGraphExecutor.js', './Logger.js'],
  ['core/PluginManager.js', './Logger.js'],
  ['plugins/StateManagerPlugin.js', '../core/Logger.js'],
  ['plugins/RustPlugin.js', '../core/Logger.js'],
  ['plugins/RiggingPlugin.js', '../core/Logger.js'],
  ['plugins/ProceduralPlugin.js', '../core/Logger.js'],
  ['plugins/PhysicsPlugin.js', '../core/Logger.js'],
  ['plugins/PhotorealisticRenderPlugin.js', '../core/Logger.js'],
  ['plugins/MenuSystemPlugin.js', '../core/Logger.js'],
  ['plugins/LuaPlugin.js', '../core/Logger.js'],
  ['plugins/LightingPlugin.js', '../core/Logger.js'],
  ['plugins/LightingCameraPlugin.js', '../core/Logger.js'],
  ['plugins/GoPlugin.js', '../core/Logger.js'],
  ['plugins/AnimationPlugin.js', '../core/Logger.js'],
  ['plugins/AIBehaviorPlugin.js', '../core/Logger.js'],
  ['plugins/AIAgentPlugin.js', '../core/Logger.js'],
];

const HANDLED_LEVELS = new Set(['log', 'warn', 'error', 'info']);

// ── Argument parsing (template-aware) ─────────────────────────────────────

function parseArgs(str) {
  const args = [];
  let depth = 0;
  let inStr = null;
  let templateDepth = 0;
  let buf = '';
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (inStr) {
      buf += ch;
      if (ch === '\\') { buf += str[i + 1] ?? ''; i += 2; continue; }
      if (ch === inStr) inStr = null;
    } else if (templateDepth > 0) {
      buf += ch;
      if (ch === '\\') { buf += str[i + 1] ?? ''; i += 2; continue; }
      if (ch === '`') templateDepth--;
      else if (ch === '$' && str[i + 1] === '{') {
        templateDepth++;
        buf += '{';
        i += 2;
        continue;
      }
    } else {
      if (ch === "'" || ch === '"') inStr = ch;
      else if (ch === '`') templateDepth = 1;
      else if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0 && templateDepth === 0) {
        args.push(buf.trim());
        buf = '';
        i++;
        continue;
      }
      buf += ch;
    }
    i++;
  }
  if (buf.trim()) args.push(buf.trim());
  return args;
}

// ── Tag extraction ───────────────────────────────────────────────────────

/**
 * If the first arg looks like '[Tag] rest' (or `"…"`, ``…``, `[Tag ${dyn}] rest``),
 * returns { tagName, rest, isDynamic }. Otherwise returns null.
 *
 * `rest` is wrapped in matching quotes/ticks; callers must check whether the
 * quoted body is empty to avoid emitting `logger.X('Tag', '', ...)`.
 */
function extractTag(str) {
  // Single-quoted: '[Tag] rest'
  {
    const m = str.match(/^'\[([^\]]+)\]\s?(.*)'$/s);
    if (m) {
      return {
        tagName: m[1],
        isDynamic: false,
        rest: `'${m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\')}'`,
      };
    }
  }
  // Double-quoted: "[Tag] rest"
  {
    const m = str.match(/^"\[([^\]]+)\]\s?(.*)"$/s);
    if (m) {
      return {
        tagName: m[1],
        isDynamic: false,
        rest: `"${m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')}"`,
      };
    }
  }
  // Template-static: `[Tag] rest`  (tag has no ${...})
  {
    const m = str.match(/^`\[([^\]`$]+)\]\s?(.*)`$/s);
    if (m) {
      return {
        tagName: m[1],
        isDynamic: false,
        rest: `\`${m[2]}\``,
      };
    }
  }
  // Template-dynamic: `[Tag ${dyn}] rest`   (whole tag is a template literal)
  {
    const m = str.match(/^`(\[[^`]*\$\{[^}]+\}[^`]*\])\s?(.*)`$/s);
    if (m) {
      return {
        tagName: null,
        isDynamic: true,
        tagLiteral: `\`${m[1]}\``,
        rest: `\`${m[2]}\``,
      };
    }
  }
  return null;
}

function isEmptyLiteral(s) {
  return s === "''" || s === '""' || s === '``';
}

// ── Walk-and-rewrite a single file's body ─────────────────────────────────

function rewriteBody(content) {
  let i = 0;
  let out = '';
  while (i < content.length) {
    const idx = content.indexOf('console.', i);
    if (idx === -1) {
      out += content.slice(i);
      break;
    }

    const afterDot = content.slice(idx + 'console.'.length);
    const head = afterDot.match(/^(\w+)\s*\(/);
    if (!head) {
      out += content.slice(i, idx + 1);
      i = idx + 1;
      continue;
    }

    const level = head[1];
    if (!HANDLED_LEVELS.has(level)) {
      out += content.slice(i, idx + head[0].length);
      i = idx + head[0].length;
      continue;
    }

    // Find matching close paren (depth-tracking + string + template awareness)
    const callStart = idx + 'console.'.length + head[0].length - 1; // index of '('
    let depth = 1;
    let j = callStart + 1;
    let inStr = null;
    let templateDepth = 0;
    while (j < content.length && depth > 0) {
      const ch = content[j];
      if (inStr) {
        if (ch === '\\') { j += 2; continue; }
        if (ch === inStr) inStr = null;
      } else if (templateDepth > 0) {
        if (ch === '\\') { j += 2; continue; }
        if (ch === '`') templateDepth--;
        else if (ch === '$' && content[j + 1] === '{') { templateDepth++; j += 2; continue; }
      } else {
        if (ch === "'" || ch === '"') inStr = ch;
        else if (ch === '`') templateDepth = 1;
        else if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      j++;
    }

    // Strip the original `console.X(...)` block. The matching `)` is at index
    // j — we emit the replacement WITHOUT `)` and leave j for the next loop
    // iteration to copy through. That preserves the original ) intact.
    out += content.slice(i, idx);

    const inner = content.slice(callStart + 1, j);
    const args = parseArgs(inner);

    let replacement;
    if (args.length === 0) {
      replacement = `logger.${level}()`;
    } else {
      const first = args[0];
      const extracted = extractTag(first);

      if (!extracted) {
        // No tag prefix — pass args through, just rename level.
        replacement = `logger.${level}(${args.join(', ')}`;
      } else {
        const newFirst = extracted.isDynamic
          ? extracted.tagLiteral
          : `'${extracted.tagName}'`;
        const hasBody = !isEmptyLiteral(extracted.rest);
        const tail = args.slice(1);

        if (!hasBody && tail.length === 0) {
          replacement = `logger.${level}(${newFirst}`;
        } else if (!hasBody) {
          replacement = `logger.${level}(${newFirst}, ${tail.join(', ')}`;
        } else if (tail.length === 0) {
          replacement = `logger.${level}(${newFirst}, ${extracted.rest}`;
        } else {
          replacement = `logger.${level}(${newFirst}, ${extracted.rest}, ${tail.join(', ')}`;
        }
      }
    }

    out += replacement;
    i = j; // copy the original `)` through on the next iteration
  }
  return out;
}

// ── Add import line ───────────────────────────────────────────────────────

/**
 * Only `import` lines and re-exports (`export { ... } from '...'`, `export *
 * from '...'`) qualify as import-like. Pure `export class/function/const/var`
 * lines are NOT imports; placing a literal `import` after them is a syntax
 * error (ES modules require all imports at the top).
 */
function isImportLike(line) {
  const l = line.trim();
  if (l.startsWith('import ')) return true;
  if (/^export\s+(?:\*|\{[^}]*\})\s+from\s+['"]/.test(l)) return true;
  return false;
}

function addImport(content, loggerPath) {
  if (content.includes(`from '${loggerPath}'`)) return content;

  const lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (isImportLike(l)) {
      lastImportIdx = i;
    } else if (
      l.length > 0 &&
      !l.startsWith('//') &&
      !l.startsWith('/*') &&
      !l.startsWith('*')
    ) {
      break;
    }
  }
  const newLine = `import { logger } from '${loggerPath}';`;
  if (lastImportIdx === -1) {
    return newLine + '\n' + content;
  }
  lines.splice(lastImportIdx + 1, 0, newLine);
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

let totalFiles = 0;
let totalCalls = 0;

for (const [relPath, loggerPath] of FILES) {
  if (!fs.existsSync(relPath)) {
    console.warn(`! missing: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(relPath, 'utf8');
  const beforeCalls = (content.match(/console\.(log|warn|error|info)\s*\(/g) || []).length;

  if (beforeCalls === 0 && content.includes(`from '${loggerPath}'`)) {
    console.log(`· ${relPath}  (no calls, already migrated)`);
    continue;
  }

  content = addImport(content, loggerPath);
  content = rewriteBody(content);

  fs.writeFileSync(relPath, content);

  const afterCalls = (content.match(/console\.(log|warn|error|info)\s*\(/g) || []).length;
  const migrated = beforeCalls - afterCalls;
  totalFiles++;
  totalCalls += migrated;
  console.log(`✓ ${relPath}  (-${migrated} console calls)`);
}

console.log(`\nDone: ${totalFiles} files, ${totalCalls} calls migrated.`);
console.log(`Hand-fix needed (manual rewrites, METHOD-REFERENCE not detected):`);
console.log(`  - MasterApp.js:   app.init().catch(console.error);  →  .catch((err) => logger.error('MasterApp', err));`);
