/**
 * wire-system.js
 *
 * Tracks connections between IO sockets in the brutalist node-graph UI and
 * draws dashed SVG lines between them in real time. The connections are
 * automatically redrawn on scroll/resize and on DOM mutation inside the
 * roots container.
 *
 * Self-contained concern. Lays on top of the brutalist `node-dot` sockets.
 * A logical connection record: `{ id, fromSocket, toSocket }` where each
 * `*Socket` is an HTMLElement exposed by the socket module.
 *
 * Usage:
 *   const sys = createWireSystem({ container, color: '#77ff61' });
 *   sys.connect(fromSocketEl, toSocketEl);
 *   sys.redraw();
 */

export function createWireSystem({ container, color = '#77ff61' } = {}) {
  if (!container) throw new Error('[wire-system] container is required');
  const wires = new Map();          // id → { fromSocket, toSocket }
  const dirty = { value: false };

  // Overlay SVG sits on top of the nodes and is positioned to span the
  // full container. Mutating elements within is cheap; the expensive
  // operation (read DOMRect for endpoints) is throttled via rAF.
  let svg = container.querySelector(':scope > .wire-system__svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wire-system__svg');
    Object.assign(svg.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '5',
    });
    container.appendChild(svg);
  }

  function path(fromSocket, toSocket) {
    const a = fromSocket?.getBoundingClientRect();
    const b = toSocket?.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    if (!a || !b) return '';
    const ax = (a.left + a.right) / 2 - c.left;
    const ay = (a.top + a.bottom) / 2 - c.top;
    const bx = (b.left + b.right) / 2 - c.left;
    const by = (b.top + b.bottom) / 2 - c.top;
    // Cubic Bézier with horizontal control points so the wire bends
    // gracefully across long distances.
    const dx = Math.max(40, Math.abs(bx - ax) * 0.5);
    return `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`;
  }

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    wires.forEach(({ fromSocket, toSocket }) => {
      if (!fromSocket.isConnected || !toSocket.isConnected) return;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', path(fromSocket, toSocket));
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '2');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-dasharray', '6 4');
      svg.appendChild(p);
    });
  }

  function scheduleRedraw() {
    if (dirty.value) return;
    dirty.value = true;
    requestAnimationFrame(() => {
      dirty.value = false;
      redraw();
    });
  }

  // Resize observer keeps wires glued to nodes when the viewport or
  // sidebar dimensions change (drag-resize, responsive collapse).
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(scheduleRedraw)
    : { observe() {}, disconnect() {} };
  ro.observe(container);

  // Mutation observer catches any DOM mutation inside the container.
  // This is the cheapest correct way to keep wires aligned as users drag /
  // resize / create nodes.
  const mo = new MutationObserver(scheduleRedraw);
  mo.observe(container, { childList: true, subtree: true, attributes: true });

  window.addEventListener('resize', scheduleRedraw);
  window.addEventListener('scroll', scheduleRedraw, { passive: true });

  let nextId = 1;

  return {
    container,
    connect(fromSocket, toSocket) {
      const id = nextId++;
      wires.set(id, { fromSocket, toSocket });
      scheduleRedraw();
      return id;
    },
    disconnect(id) {
      if (wires.delete(id)) scheduleRedraw();
    },
    disconnectAll() {
      wires.clear();
      scheduleRedraw();
    },
    count() { return wires.size; },
    redraw: scheduleRedraw,
    destroy() {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', scheduleRedraw);
      window.removeEventListener('scroll', scheduleRedraw);
      svg.remove();
      wires.clear();
    },
  };
}
