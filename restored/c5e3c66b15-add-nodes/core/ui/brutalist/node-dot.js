/**
 * node-dot.js
 *
 * Brutalist node-graph socket: 8×8 green dot with shadow halo + optional
 * parent absolute connector wire (dashed rotated line). Used as the visual
 * primitive for IO sockets in the brutalist node-graph UI; coordinate-aware
 * so wires lay out along the user-defined angle.
 *
 * Usage:
 *   const socket = createNodeSocket({ type: 'output', label: 'TEXT' });
 *   container.appendChild(socket.element);
 */

const COLOR_INPUT  = '#77ff61'; // signal-green input socket
const COLOR_OUTPUT = '#ffe16d'; // warning-yellow output socket

/**
 * @param {{
 *   type?: 'input' | 'output',
 *   label?: string,
 *   withWire?: boolean,        // include the dashed connector line
 *   wireLength?: number,       // px length of the connector
 *   wireRotate?: number,       // deg; +12 = slight downward slope
 * }} opts
 */
export function createNodeSocket({
  type = 'input',
  label = '',
  withWire = false,
  wireLength = 80,
  wireRotate = 0,
} = {}) {
  const root = document.createElement('div');
  root.className = `node-socket node-socket--${type}`;

  if (withWire) {
    const wire = document.createElement('div');
    wire.className = 'node-socket__wire';
    wire.style.width = `${wireLength}px`;
    wire.style.transform = `rotate(${wireRotate}deg)`;
    root.appendChild(wire);
  }

  const dot = document.createElement('span');
  dot.className = 'node-socket__dot';
  dot.style.background = type === 'output' ? COLOR_OUTPUT : COLOR_INPUT;
  dot.style.boxShadow  = `0 0 6px ${type === 'output' ? COLOR_OUTPUT : COLOR_INPUT}`;
  root.appendChild(dot);

  if (label) {
    const text = document.createElement('span');
    text.className = 'node-socket__label';
    text.textContent = label;
    root.appendChild(text);
  }

  return { element: root, dot, type };
}
