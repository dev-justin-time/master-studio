#!/usr/bin/env node
// ── restored/_make-runnable.mjs ────────────────────────────────────────────
//
// Turn every HTML under `restored/<commit>/` from a "snapshot that won't
// load" into a self-contained logic page that renders when its snapshot
// subfolder is the document root.
//
// Two passes per HTML:
//   1. Rewrite `src="/X"` and `href="/X"` to relative `./X` (or
//      `../../../X` — depending on the HTML's depth inside the snapshot).
//   2. Inject a page-scoped `<script type="importmap">` mapping the bare
//      `three` and `three/addons/` specifiers to unpkg — that lets
//      MasterApp.js's `import 'three'` resolve in a browser without
//      vite being involved.
//
// Idempotent: each rewrite is guarded by `<!-- RESTORED_RUNNABLE_MARKER -->`.
// Re-running is a safe no-op (skips already-processed files).
//
// Also generates a top-level launcher at `restored/index.html` listing every
// (snapshot, page) reachable.
//
// Run from the project root: `node restored/_make-runnable.mjs`.

import fs from 'node:fs';
import path from 'node:path';

// ── CWD safety ──────────────────────────────────────────────────────────────
if (!fs.existsSync('MasterApp.js')) {
  console.error(
    'ERROR: run this from the project root.\n' +
    '  node restored/_make-runnable.mjs'
  );
  process.exit(1);
}

const here = process.cwd();
const restoredRoot = path.join(here, 'restored');

const MARKER = '<!-- RESTORED_RUNNABLE_MARKER -->';

// Anchored to actual HTML element opening tags + space-prefixed `src`/`href`.
// Prevents accidental matches inside `<script>…</script>` JS string literals
// or `<script type="application/json">` payloads. Negative lookahead
// `(?!\/)` skips protocol-relative URLs (`//cdn.example.com/…`). The query
// and hash suffixes (`?v=1`, `#anchor`) are preserved by the trailing
// `[^"]*`.
//
// Scope: the tag enum `script|link|a` covers all HTMLs in the current
// snapshots. If a future commit uses `<img src="/X">`, `<iframe src="/X">`,
// `<area href="/X">`, `<use href="/X">`, or `<source src="/X">`, those
// tags will be silently skipped — the pages would render with broken
// images / broken iframes. Add those tags here if / when needed.
const PATH_REWRITE_RE =
  /(<(?:script|link|a)\b[^>]*\s(?:src|href))="\/(?!\/)([^"]*)"/gi;

// Matches a previously-injected importmap block from a prior run of this
// script. Used to replace JUST the block (not the whole file) when we want
// to refresh the three.js version in place. The regex is intentionally
// permissive about the `<script>` attributes — the marker is the only
// reliable anchor since we control it. The `[\s\S]*?` is non-greedy so
// the regex stops at the FIRST `</script>`. The trailing `\n?` swallows
// at most one newline so the indentation of the next HTML tag is preserved.
const IMPORTMAP_BLOCK_RE = /<!-- RESTORED_RUNNABLE_MARKER -->[\s\S]*?<\/script>\n?/i;

// Resolve the `three` pinned version for each snapshot from its own
// `package.json` (which IS tracked in the snapshot — `_build.mjs` only
// excludes the lockfile). Falls back to 0.155.0 when the package.json is
// missing, or when the pinned version can't be parsed.
//
// Anchored regex (`^…$`) so a tarball URL like
// `"https://x.com/foo.tgz#0.170.0"` no longer falsely extracts the
// fragment. Compound ranges like `"0.150 || 0.160"` or aliases like
// `"latest"`/`"2"` (just a major) also fall through to the conservative
// default. Optional range operator (`^` / `~` / `>=` / `<=`) is stripped,
// optional pre-release tag (`-beta`, `-canary.x`) is dropped.
function pinnedThreeVersion(snapshotName) {
  const FALLBACK = '0.155.0';
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(restoredRoot, snapshotName, 'package.json'), 'utf8')
    );
    const v = pkg && pkg.dependencies && pkg.dependencies.three;
    if (typeof v !== 'string') return FALLBACK;
    const m = v.match(/^(?:\^|~|>=?|<=?)?\s*(\d+\.\d+\.\d+)(?:-[a-zA-Z0-9.-]+)?\s*$/);
    return m ? m[1] : FALLBACK;
  } catch (_) {
    return FALLBACK;
  }
}

// Build the importmap block for a given snapshot's pinned three version.
// `three/addons/` trailing-slash prefix mapping so the importmap spec
// resolves subpath imports like `three/addons/controls/OrbitControls.js`.
function importMapFor(snapshotName) {
  const v = pinnedThreeVersion(snapshotName);
  return MARKER + '\n' +
    '<script type="importmap">\n' +
    '{\n' +
    '  "imports": {\n' +
    `    "three":         "https://unpkg.com/three@${v}/build/three.module.js",\n` +
    `    "three/addons/": "https://unpkg.com/three@${v}/examples/jsm/"\n` +
    '  }\n' +
    '}\n' +
    '</script>\n';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function snapshotSubfolderOf(htmlPath) {
  // restored/<subfolder>/<maybe-deeper>/<file>
  const rel = path.relative(restoredRoot, htmlPath).split(path.sep);
  return rel[0] || '';
}

function relPrefixFromSnapshotRoot(htmlPath) {
  // For `restored/<subfolder>/<file>`             prefix = './'
  // For `restored/<subfolder>/core/<file>`        prefix = './'  (file lives in same dir as referrer)
  // For `restored/<subfolder>/a/b/<file>`         prefix = './'  (file lives in same dir)
  //
  // The prefix is computed relative to the HTML's directory, so the
  // referrer HTML must reach `core/scene-utils.js` via `./core/...`
  // regardless of its OWN depth in the snapshot.
  const htmlDir = path.dirname(htmlPath);
  const snapshotRoot = path.join(restoredRoot, snapshotSubfolderOf(htmlPath));
  const rel = path.relative(snapshotRoot, htmlDir).split(path.sep).filter(Boolean);
  if (rel.length === 0) return './';
  return rel.map(() => '../').join('');
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const isHtml = (name) => /\.html?$/i.test(name);

// ── Pass 1 — rewrite every HTML under restored/ ────────────────────────────

let touched = 0;
let refreshedCount = 0;
let skippedIdempotent = 0;
let totalHtml = 0;
let rewriteCount = 0;
let importmapInjectedCount = 0;

// snapshotPages: snapshot-subfolder-name -> { commit, title, pages: [{name, rel}] }
const snapshotPages = new Map();

const launcherRelPath = path.join(restoredRoot, 'index.html');

for (const fpath of walk(restoredRoot)) {
  if (!isHtml(path.basename(fpath))) continue;

  // Skip the launcher itself — it has no imports and is generated below.
  if (path.resolve(fpath) === path.resolve(launcherRelPath)) continue;

  totalHtml++;
  const snapshotName = snapshotSubfolderOf(fpath);

  const original = fs.readFileSync(fpath, 'utf8');

  // Smart idempotency:
  //   - First run: paths are absolute (`/X`), so PATH_REWRITE_RE matches.
  //     We rewrite paths + inject the importmap. The marker is added.
  //   - Re-run: paths are already relative, so PATH_REWRITE_RE matches
  //     nothing. We instead refresh the importmap block in-place to keep
  //     `three` in sync with the snapshot's current `package.json` pin
  //     — without this, a snapshot's importmap would be stuck at whatever
  //     `three` version was current at the original first-run time.
  if (original.includes(MARKER)) {
    const refreshed = original.replace(IMPORTMAP_BLOCK_RE, importMapFor(snapshotName));
    if (refreshed !== original) {
      fs.writeFileSync(fpath, refreshed);
      refreshedCount++;
    } else {
      skippedIdempotent++;
    }
  } else {
    const prefix = relPrefixFromSnapshotRoot(fpath);

    // Count path rewrites on the ORIGINAL file (BEFORE the global replace),
    // so the printed number reflects actual work, not zero-post-replace matches.
    rewriteCount += (original.match(PATH_REWRITE_RE) || []).length;

    let rewritten = original.replace(
      PATH_REWRITE_RE,
      (_match, attrPrefix, rest) => `${attrPrefix}="${prefix}${rest}"`
    );

    // Inject importmap immediately after the first <head ...> OPENING tag.
    // The regex `<head(?![/])\b[^>]*>` requires a non-`/` character right
    // after `head` so it never matches the closing `</head>` tag even if
    // a malformed snapshot somehow placed `</head>` first in document
    // order. (`.replace` without the `g` flag also stops at the first
    // match, but this anchors the match for defence-in-depth.)
    const importMap = importMapFor(snapshotName);
    rewritten = rewritten.replace(/<head(?![/])\b[^>]*>/i, (m) => `${m}\n${importMap}`);
    if (rewritten.includes('type="importmap"')) importmapInjectedCount++;

    fs.writeFileSync(fpath, rewritten);
    touched++;

    // Track (snapshot -> page) for the launcher.
    const name = path.basename(fpath);
    // url-safe name for the relative path under launcher:
    const rel = path.relative(
      path.join(restoredRoot, snapshotName),
      fpath
    ).split(path.sep).join('/');
    if (!snapshotPages.has(snapshotName)) {
      snapshotPages.set(snapshotName, []);
    }
    snapshotPages.get(snapshotName).push({ name, rel });
  }
}

// ── Pass 2 — emit restored/index.html launcher ─────────────────────────────
//
// Group by snapshot subfolder; each card lists the HTML pages within it.
// The links are relative URLs back into the snapshot folder.
//
// Regenerated on every run — if you want a custom launcher page, fork this
// script. (Idempotency for the per-HTML rewrites is governed by the
// `RESTORED_RUNNABLE_MARKER` comment; the launcher is not marked because
// it has no scripts to wire up.)

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function launcherHtml() {
  const lines = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="en">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8" />');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0" />');
  lines.push('  <title>Restored Logic Pages</title>');
  lines.push('  <style>');
  lines.push('    :root { --bg:#131313; --panel:#1c1b1b; --neon:#02e600; --on:#e5e2e1; --muted:#b9ccaf; --warn:#ffe16d; }');
  lines.push('    * { box-sizing: border-box; }');
  lines.push('    body { font: 14px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--on); padding: 28px; margin: 0; min-height: 100vh; }');
  lines.push('    h1 { color: var(--neon); margin: 0 0 6px; font-size: 28px; letter-spacing: 0.05em; text-transform: uppercase; }');
  lines.push('    .subtitle { color: var(--muted); margin: 0 0 24px; max-width: 720px; }');
  lines.push('    .commit { background: var(--panel); border: 2px solid var(--neon); padding: 16px 18px; margin-bottom: 14px; box-shadow: 4px 4px 0 0 #000; }');
  lines.push('    .commit h2 { color: var(--warn); margin: 0 0 6px; font-size: 16px; font-family: monospace; }');
  lines.push('    .commit h2 .sha { color: var(--neon); }');
  lines.push('    .pages { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }');
  lines.push('    .pages a { background: var(--bg); border: 1px solid var(--neon); color: var(--neon); padding: 6px 12px; text-decoration: none; font-family: monospace; font-size: 12px; transition: background 0.1s, color 0.1s, transform 0.1s; }');
  lines.push('    .pages a:hover { background: var(--neon); color: #013a00; transform: translate(-1px, -1px); box-shadow: 2px 2px 0 0 #000; }');
  lines.push('    .empty { color: var(--muted); font-style: italic; }');
  lines.push('  </style>');
  lines.push('</head>');
  lines.push('<body>');
  lines.push('  <h1>Restored Logic Pages</h1>');
  lines.push('  <p class="subtitle">Every snapshot below is a self-contained git-commit extract under <code>restored/</code>. Click any page to open the rendered version. Each HTML has been rewritten so leading-<code>/</code> paths resolve relative to its snapshot folder, and a page-scoped importmap lets <code>import "three"</code> work without a bundler.</p>');

  if (snapshotPages.size === 0) {
    lines.push('  <p class="empty">No snapshots found. Run <code>node restored/_build.mjs</code> first to extract the historical commits.</p>');
  } else {
    // sort snapshots by their short SHA prefix (numeric/lexical on the dash-prefix slice).
    const ordered = Array.from(snapshotPages.keys()).sort();
    for (const snap of ordered) {
      const pages = snapshotPages.get(snap);
      const sha = snap.split('-')[0];
      const slug = snap.split('-').slice(1).join('-');
      lines.push('  <section class="commit">');
      lines.push('    <h2><span class="sha">' + escapeHtml(sha) + '</span> &middot; ' + escapeHtml(slug) + '</h2>');
      if (pages.length === 0) {
        lines.push('    <p class="empty">(no HTML pages)</p>');
      } else {
        lines.push('    <div class="pages">');
        for (const p of pages) {
          const href = encodeURIComponent(snap) + '/' + p.rel.split('/').map(encodeURIComponent).join('/');
          lines.push('      <a href="' + escapeHtml(href) + '">' + escapeHtml(p.name) + '</a>');
        }
        lines.push('    </div>');
      }
      lines.push('  </section>');
    }
  }

  lines.push('</body>');
  lines.push('</html>');
  return lines.join('\n') + '\n';
}

fs.writeFileSync(launcherRelPath, launcherHtml());

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`Scanned ${totalHtml} HTML files under restored/.`);
console.log(`  First run (path rewrite + inject):  ${touched}`);
console.log(`  Refreshed importmap in place:       ${refreshedCount}`);
console.log(`  Skipped (already up to date):       ${skippedIdempotent}`);
console.log(`  Importmaps newly injected:          ${importmapInjectedCount}`);
console.log(`  Snapshot launcher written:          ${path.relative(here, launcherRelPath)}`);
