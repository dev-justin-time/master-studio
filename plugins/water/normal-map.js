/**
 * water/normal-map.js
 *
 * Procedural water-normal-map texture generator. Pure function:
 *   - takes an optional size override (defaults to 512)
 *   - returns a configured `THREE.CanvasTexture`
 *   - throws if the underlying `getImageData` / `canvas` API fails
 *
 * No plugin state, no DOM side effects beyond the single transient
 * `<canvas>` element used as the painting surface. Texture parameters
 * (wrap, colorSpace) are baked in here so the caller never has to
 * remember them. Safe to import from `WaterPlugin` or from a future
 * test harness without triggering Three.js instantiation order bugs.
 *
 * Encoding (matches Three.js `Water` shader expectations):
 *   - red   = -dH/du  (X slope of the height field)
 *   - green = -dH/dv  (Y slope of the height field)
 *   - blue  = 255     (constant up-vector)
 *   - alpha = 255     (opaque)
 *
 * Two octaves of a rotating sine field combine for diagonal wave
 * motion rather than the perfectly-aligned stripes you'd get if both
 * channels encoded the same scalar. Derivatives are bounded via
 * `Math.tanh` so the final byte value never saturates regardless of
 * derivative magnitude (a plain linear multiplier would clamp most
 * pixels to 0 or 255).
 *
 * ── Conventions ──
 * This file lives under `plugins/water/` so future pure-helper
 * extractions (e.g. `plugins/water/refraction.js`, `plugins/rigging/
 * skinning.js`) copy the same pattern: reusable pure logic grouped
 * under its owning plugin in a subdirectory.
 *
 * ── Test environment ──
 * The generator uses `document.createElement('canvas')` so it requires
 * a browser-like environment. Node test harnesses must wire up
 * `global.document` first — `jsdom` or `happy-dom` both work. Pure
 * constant / encoder tests (`encodeBoundedNormal`, `WAVE_PARAMS`) do
 * NOT need a DOM.
 */

import * as THREE from 'three';

/** Default resolution for the generated normal map. Powers-of-two keep mipmaps cheap. */
export const WATER_NORMAL_MAP_SIZE = 512;

/**
 * Wave field parameters — exported so callers (and tests) can
 * override individual octaves without re-deriving the formula.
 *
 *   - freq1/freq2: spatial frequencies of the two octaves
 *   - amp1/amp2:   amplitude weights that sum to < 1 (prevents tanh saturation)
 *   - linearPreScale: soft scaler combined with `Math.tanh` to keep the
 *                     final byte value always smooth even when the raw
 *                     derivative is large.
 */
export const WAVE_PARAMS = Object.freeze({
  freq1: 6.0,
  freq2: 14.0,
  amp1: 0.4,
  amp2: 0.18,
  linearPreScale: 0.06,
});

/**
 * Encode a (possibly large) derivative scalar into an unsigned byte
 * via a centered `Math.tanh` curve. Always returns 0..255 — the
 * bounded curve guarantees no clamp saturation at either extreme.
 *
 * Exported so tests / alternate texture-painting passes can reuse
 * the same encoding conventions as the normal-map pass.
 *
 * @param {number} derivative
 * @returns {number} integer in [0, 255]
 */
export function encodeBoundedNormal(derivative, linearPreScale = WAVE_PARAMS.linearPreScale) {
  const bounded = Math.tanh(derivative * linearPreScale);
  return Math.round((bounded * 0.5 + 0.5) * 255);
}

/**
 * Build the procedural water-normal texture.
 *
 * @param {{ size?: number }} [opts]
 * @returns {THREE.CanvasTexture}
 * @throws {Error} if the canvas 2D context cannot be acquired or if
 *                 `getImageData` returns a zero-sized buffer.
 */
export function createWaterNormalTexture({ size = WATER_NORMAL_MAP_SIZE } = {}) {
  // Accept any finite positive integer (`256` and `256.0` are both
  // `Number.isInteger === true` in JS — typed numerics from test
  // helpers work). Fractional values REJECTED explicitly because
  // the canvas API silently coerces `canvas.width = 256.5` to `256`,
  // which would be a confusing no-error silent truncation. We want
  // the test author to know they passed a bad size.
  if (!(Number.isFinite(size) && size > 0 && Number.isInteger(size))) {
    throw new Error(`createWaterNormalTexture: size must be a finite positive integer (got ${size})`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('createWaterNormalTexture: could not acquire 2D context');
  }

  const img = ctx.createImageData(size, size);
  if (!img.data || img.data.length !== size * size * 4) {
    throw new Error(`createWaterNormalTexture: getImageData returned unexpected length (${img.data?.length})`);
  }

  const { freq1, freq2, amp1, amp2, linearPreScale } = WAVE_PARAMS;
  const step = 1 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * step;
      const v = y * step;

      // Height-field sample (no finite-difference shift)
      const h1_x0 = Math.sin((u * freq1 + v * freq1 * 0.66) * Math.PI * 2) * amp1;
      const h2_x0 = Math.sin((u * freq2 - v * freq2 * 0.64) * Math.PI * 2 + 0.4) * amp2;

      // X+epsilon sample → derivative in u
      const h1_dx = Math.sin(((u + step) * freq1 + v * freq1 * 0.66) * Math.PI * 2) * amp1;
      const h2_dx = Math.sin(((u + step) * freq2 - v * freq2 * 0.64) * Math.PI * 2 + 0.4) * amp2;

      // Y+epsilon sample → derivative in v
      const h1_dy = Math.sin((u * freq1 + (v + step) * freq1 * 0.66) * Math.PI * 2) * amp1;
      const h2_dy = Math.sin((u * freq2 - (v + step) * freq2 * 0.64) * Math.PI * 2 + 0.4) * amp2;

      const dhdu = ((h1_dx + h2_dx) - (h1_x0 + h2_x0)) / step;
      const dhdv = ((h1_dy + h2_dy) - (h1_x0 + h2_x0)) / step;

      const i = (y * size + x) * 4;
      img.data[i + 0] = encodeBoundedNormal(-dhdu, linearPreScale); // X slope → red
      img.data[i + 1] = encodeBoundedNormal(-dhdv, linearPreScale); // Y slope → green
      img.data[i + 2] = 255;                                       // constant up
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
