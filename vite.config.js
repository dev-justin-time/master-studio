import { defineConfig } from 'vite';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { cpSync, existsSync } from 'fs';

/**
 * Custom Vite plugin that builds the Rust and Go WebAssembly modules AND
 * emits the produced `wasm/pkg/*` artifacts into `dist/wasm/pkg/*` so the
 * base-URL-aware `WasmBridge` (which resolves `../wasm/pkg/rust_core.js`
 * relative to its own bundle URL) can fetch them in production.
 *
 * - Runs once during `vite build` via the `buildStart` hook.
 * - Watches source files during `vite dev` and rebuilds on change.
 * - Debounces rapid changes and runs builds sequentially to avoid output races.
 */
function wasmBuilder() {
  const root = process.cwd();
  let building = false;
  let pending = null;

  const buildWasm = (type) => new Promise((res, rej) => {
    console.log(`[wasm-builder] Building ${type}...`);
    const scriptPath = resolve(root, `wasm/${type}/build.sh`);
    const child = spawn('bash', [scriptPath], {
      cwd: resolve(root, `wasm/${type}`),
      stdio: 'pipe',
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`[wasm-builder] ${type} build failed:\n${stderr || stdout}`);
        rej(new Error(`${type} build failed with code ${code}`));
      } else {
        console.log(`[wasm-builder] ${type} build succeeded.`);
        res();
      }
    });

    child.on('error', (err) => {
      console.error(`[wasm-builder] ${type} spawn error:`, err.message);
      rej(err);
    });
  });

  const buildAll = async () => {
    if (building) {
      pending = pending || (() => buildAll());
      return;
    }

    building = true;
    try {
      await buildWasm('rust_core');
      await buildWasm('go_engine');
    } catch (err) {
      console.error('[wasm-builder]', err.message);
    } finally {
      building = false;
      if (pending) {
        const next = pending;
        pending = null;
        next();
      }
    }
  };

  return {
    name: 'wasm-builder',

    // Build Wasm once before Vite starts bundling (dev + production)
    buildStart() {
      return buildAll();
    },

    // Watch source files during dev and rebuild on change
    configureServer(server) {
      const watchPaths = [
        resolve(root, 'wasm/rust_core/src/**/*.rs'),
        resolve(root, 'wasm/rust_core/Cargo.toml'),
        resolve(root, 'wasm/go_engine/**/*.go'),
        resolve(root, 'wasm/go_engine/go.mod'),
      ];

      server.watcher.add(watchPaths);

      let debounceTimer = null;
      server.watcher.on('change', (file) => {
        if (!file.includes('wasm/rust_core') && !file.includes('wasm/go_engine')) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          buildAll();
        }, 300);
      });
    },

    // After the JS bundle is written, copy `wasm/pkg/` into `dist/wasm/pkg/`
    // so WasmBridge's base-URL-aware fetcher resolves in production builds.
    // The dev server doesn't need this — Vite serves files from the project
    // root directly — but production bundles replace the entry HTML and we
    // need the Wasm artifacts at a stable relative path.
    closeBundle() {
      const pkgSrc = resolve(root, 'wasm/pkg');
      const pkgDest = resolve(root, 'dist/wasm/pkg');
      if (!existsSync(pkgSrc)) {
        console.warn('[wasm-builder] wasm/pkg/ not found — skipping copy. Did the build.sh scripts run?');
        return;
      }
      try {
        cpSync(pkgSrc, pkgDest, { recursive: true });
        console.log(`[wasm-builder] Copied wasm/pkg → dist/wasm/pkg`);
      } catch (err) {
        console.error('[wasm-builder] Failed to copy wasm/pkg:', err.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [wasmBuilder()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      // Multi-page setup: index.html (Node Editor) + studio.html (Brutalist Editor)
      input: {
        main: resolve(__dirname, 'index.html'),
        studio: resolve(__dirname, 'studio.html'),
        scene: resolve(__dirname, 'scene.html'),
        mainScene: resolve(__dirname, 'main.html'),
        nodeArchitect: resolve(__dirname, 'nodearchitect.html'),
      },
    },
  },
});
