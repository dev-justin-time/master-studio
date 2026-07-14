# restored/

Every subfolder here is a self-contained snapshot of one git commit's
working tree, extracted via `node restored/_build.mjs`.

## Layout

`restored/<short-sha>-<slug>/`

- `<short-sha>` — first 10 chars of the commit hash
- `<slug>`     — lowercase subject, non-alphanumeric replaced with `-`

The folder mirrors the original project structure minus heavy build artifacts:

- `dist/`              — build output (re-generable via `vite build`)
- `node_modules/`      — installable via `npm install`
- `wasm/<x>/target/`   — Rust/Go compile output (sources are kept)
- Everything else is preserved (`src/`, `plugins/`, `core/`, `bindings/`,
  all HTML, configs)

## Re-running

```bash
node restored/_build.mjs
```

Re-creates the per-commit subfolders. Idempotent — wipes + recreates
each subfolder; safe to re-run after new commits.

## Total

9 commits, 433 files extracted.