// ── restored/_build.mjs ────────────────────────────────────────────────────
//
// One-shot restore: for every git commit that ever touched the project's
// HTML pages or the main app logic, extract a filtered snapshot into
// `restored/<sha>-<slug>/`. Each subfolder is a self-contained copy of
// that commit's tree minus heavy build artifacts.
//
// Run from the project root:
//   node restored/_build.mjs
//
// Idempotent: each per-commit subfolder is wiped + recreated.
//
// Excluded (path-component match — `distributor.js` is NOT excluded):
//   - dist/              (build output)
//   - node_modules/      (deps, can be re-installed)
//   - wasm/<x>/target/   (Rust/Go build artifacts; sources are kept)
//
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ── CWD safety ──────────────────────────────────────────────────────────────
if (!fs.existsSync('MasterApp.js')) {
  console.error(
    'ERROR: run this from the project root (cwd must contain MasterApp.js).\n' +
    '       From the project root:\n' +
    '         node restored/_build.mjs'
  );
  process.exit(1);
}

const here = process.cwd();
const restoredRoot = path.join(here, 'restored');

const excludeRe = /(?:^|\/)(?:dist|node_modules|wasm\/[^/]+\/target)(?:\/|$)/;

// Use execFileSync (array argv) instead of execSync (shell string), so cmd.exe
// on Windows doesn't reinterpret special characters like `|` / `||` in our
// git format strings. Returns a Buffer by default so binary blobs survive
// the round-trip without UTF-8 corruption.
function sh(cmd, args = []) {
  return execFileSync(cmd, args, {
    cwd: here,
    // No `encoding` — keeps output as a Buffer, safe for any file content.
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ── 1. Inventory ─────────────────────────────────────────────────────────────
// Format uses "@@@" as the separator — chosen because cmd.exe doesn't treat
// `@` as a metacharacter (unlike `|`, `&`, `^`) and it's unlikely in commit
// messages. We split on the same token in JS afterward.
const SEP = '@@@';
const logBuf = sh('git', [
  'log',
  '--all',
  '--no-merges',
  `--format=%H${SEP}%s`,
  '--',
  '*.html',
  'MasterApp.js',
  'bindings/*.js',
  'core/*.js',
  'plugins/*.js',
]);
const log = logBuf.toString('utf8').trim();

const seen = new Set();
const commits = [];
for (const raw of log.split('\n').reverse()) {
  const [sha, ...rest] = raw.split(SEP);
  if (!sha || seen.has(sha)) continue;
  seen.add(sha);
  commits.push({ sha, subject: (rest.join(SEP) || 'commit').slice(0, 60) });
}
if (commits.length === 0) {
  console.error('No commits matched. Aborting.');
  process.exit(1);
}
console.log(`Restoring ${commits.length} commits…\n`);

// ── 2. Per-commit extraction ───────────────────────────────────────────────
// `git ls-tree -r` returns one line per file:
//   "<mode> <type> <object-sha>\t<relative-path>"
const lsTreeBuf = (sha) => sh('git', ['ls-tree', '-r', sha]).toString('utf8').trim();
const showBlob  = (sha) => sh('git', ['show', sha]);

let grandTotal = 0;
for (const { sha, subject } of commits) {
  // 10-char short SHA — virtually collision-proof across branches, still
  // readable (cf. `git log --oneline` default).
  const short = sha.slice(0, 10);
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'commit';

  // Normalize the per-commit dir to forward-slash form before any posix.join()
  // — otherwise the outer dir carries Windows backslashes while the inner
  // paths carry forward slashes, producing mixed separator output.
  const dir = path.join(restoredRoot, `${short}-${slug}`).replace(/\\/g, '/');

  // Idempotency: wipe stale files from a prior run before recreating.
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const tree = lsTreeBuf(sha);
  let written = 0;
  let skipped = 0;

  for (const line of tree.split('\n')) {
    if (!line) continue;
    const tabAt = line.indexOf('\t');
    if (tabAt < 0) continue;
    const meta = line.slice(0, tabAt);
    const filePath = line.slice(tabAt + 1);
    if (!filePath) continue;
    if (excludeRe.test(filePath)) { skipped++; continue; }

    const objectSha = meta.split(' ').pop();
    const outPath = path.posix.join(dir, filePath);

    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const data = showBlob(objectSha); // Buffer — safe for binary content
      fs.writeFileSync(outPath, data);
      written++;
    } catch (err) {
      console.warn(`  ! ${short}: ${filePath} — ${err.message.split('\n')[0]}`);
    }
  }
  grandTotal += written;
  console.log(`  ${short} | ${subject.padEnd(50)} | ${String(written).padStart(4)} files, ${skipped} excluded`);
}

// ── 3. README ──────────────────────────────────────────────────────────────
// Plain array + .join('\n') + .replace(/__N__/g, ...) — template literals
// were rejected because embedded backticks in markdown can close the JS
// string. .replace(/.../g, ...) makes substitution order-independent.
const readmeLines = [
  '# restored/',
  '',
  'Every subfolder here is a self-contained snapshot of one git commit\'s',
  'working tree, extracted via `node restored/_build.mjs`.',
  '',
  '## Layout',
  '',
  '`restored/<short-sha>-<slug>/`',
  '',
  '- `<short-sha>` — first 10 chars of the commit hash',
  '- `<slug>`     — lowercase subject, non-alphanumeric replaced with `-`',
  '',
  'The folder mirrors the original project structure minus heavy build artifacts:',
  '',
  '- `dist/`              — build output (re-generable via `vite build`)',
  '- `node_modules/`      — installable via `npm install`',
  '- `wasm/<x>/target/`   — Rust/Go compile output (sources are kept)',
  '- Everything else is preserved (`src/`, `plugins/`, `core/`, `bindings/`,',
  '  all HTML, configs)',
  '',
  '## Re-running',
  '',
  '```bash',
  'node restored/_build.mjs',
  '```',
  '',
  'Re-creates the per-commit subfolders. Idempotent — wipes + recreates',
  'each subfolder; safe to re-run after new commits.',
  '',
  '## Total',
  '',
  '__COMMIT_COUNT__ commits, __FILE_COUNT__ files extracted.',
].join('\n');

const readme = readmeLines
  .replace(/__COMMIT_COUNT__/g, String(commits.length))
  .replace(/__FILE_COUNT__/g, String(grandTotal));

fs.writeFileSync(path.join(restoredRoot, 'README.md'), readme);
console.log(`\nDone. ${grandTotal} files across ${commits.length} commits. See restored/README.md for layout.`);
