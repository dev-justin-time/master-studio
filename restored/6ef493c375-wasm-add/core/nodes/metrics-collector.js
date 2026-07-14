/**
 * metrics-collector.js
 *
 * System metrics collector. Polls browser stats (heap memory, frame interval,
 * wire count) on a fixed cadence and emits snapshots via pub/sub. Mirrors the
 * Node Architect template's status display: `SYSTEM_LOAD`, `WIRES`, `LATENCY`.
 *
 * Self-contained concern. No external DOM or state dep — uses
 * `performance.memory` when available (Chromium) and falls back to NaN.
 *
 * Usage:
 *   const metrics = createMetricsCollector({ intervalMs: 1000 });
 *   metrics.subscribe(snap => renderStatusPanel(snap));
 *   metrics.setWireCount(getMyWireCount); // optional injector for wire count
 *   metrics.start();
 */
export function createMetricsCollector({ intervalMs = 1000 } = {}) {
  const subscribers = new Set();
  let timer = null;
  let wireCountInjector = () => 0;
  let frameSamples = [];

  function readMemoryUsagePct() {
    // performance.memory is Chromium-only; fall back to NaN so the UI
    // can render "—" without crashing.
    const m = performance && performance.memory;
    if (!m || typeof m.usedJSHeapSize !== 'number' || typeof m.jsHeapSizeLimit !== 'number') {
      return NaN;
    }
    return Math.round((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100);
  }

  function readFrameLatencyMs() {
    // Median RAF interval over the last ~1s ≈ true render latency once
    // the browser is warmed up.
    if (frameSamples.length < 2) return 0;
    const deltas = [];
    for (let i = 1; i < frameSamples.length; i++) {
      deltas.push(frameSamples[i] - frameSamples[i - 1]);
    }
    deltas.sort((a, b) => a - b);
    return Math.round(deltas[Math.floor(deltas.length / 2)] * 100) / 100;
  }

  function tick(now) {
    frameSamples.push(now);
    // Drop entries older than 1.5s.
    while (frameSamples.length && now - frameSamples[0] > 1500) frameSamples.shift();
  }

  function snapshot() {
    return {
      loadPct: readMemoryUsagePct(),
      latencyMs: readFrameLatencyMs(),
      wireCount: wireCountInjector(),
      ts: Date.now(),
    };
  }

  function publish() {
    const snap = snapshot();
    subscribers.forEach(cb => { try { cb(snap); } catch (_) {} });
  }

  function start() {
    if (timer) return;
    requestAnimationFrame(function loop(t) {
      tick(t);
      if (timer) requestAnimationFrame(loop);
    });
    timer = setInterval(publish, intervalMs);
    // Publish one snapshot immediately so listeners don't wait a full cycle.
    publish();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    subscribe(cb) { subscribers.add(cb); return () => subscribers.delete(cb); },
    setWireCount(fn) { wireCountInjector = typeof fn === 'function' ? fn : (() => 0); },
    snapshot,
  };
}
