/**
 * generator-core-node.js
 *
 * Brutalist central "3D GEN CORE" node. A square framed element with the
 * 4-corner-pin decoration (delegates to the corner-pins concern) + a
 * settings icon + label + sub-label, plus a single output socket on the
 * right edge. Mirrors the Node Architect template's central node.
 *
 * Self-contained concern. Returns
 *   `{ element, setSubLabel, setStatus, socketEl }`.
 *
 * Usage:
 *   const core = createGeneratorCoreNode(host, {
 *     label: '3D GEN CORE',
 *     subLabel: 'LATENCY: 12ms',
 *     icon: 'settings_input_component',
 *     pinColor: '#77ff61',
 *   });
 *   core.setSubLabel('LATENCY: 30ms');
 *   core.setStatus('degraded'); // updates pinColor + label color subtly
 */

import { addCornerPins } from '../ui/brutalist/corner-pins.js';
import { createNodeSocket } from '../ui/brutalist/node-dot.js';

const STATUS_PIN_COLOR = {
  stable:    '#77ff61',
  degraded:  '#ffe16d',
  down:      '#ffb4ab',
  idle:      '#84967c',
};

export function createGeneratorCoreNode(host, opts = {}) {
  const {
    label = 'GEN CORE',
    subLabel = '',
    icon = 'settings_input_component',
    pinColor = '#77ff61',
  } = opts;

  host.innerHTML = '';
  host.classList.add('node-generator-core');

  addCornerPins(host, { size: 8, color: pinColor });

  const inner = document.createElement('div');
  inner.className = 'node-generator-core__inner';

  const iconEl = document.createElement('span');
  iconEl.className = 'material-symbols-outlined node-generator-core__icon';
  iconEl.textContent = icon;

  const labelEl = document.createElement('div');
  labelEl.className = 'node-generator-core__label';
  labelEl.textContent = label;

  const subEl = document.createElement('div');
  subEl.className = 'node-generator-core__sub';
  subEl.textContent = subLabel;

  inner.appendChild(iconEl);
  inner.appendChild(labelEl);
  inner.appendChild(subEl);
  host.appendChild(inner);

  // Single output socket on the right edge.
  const socket = createNodeSocket({ type: 'output' });
  socket.element.classList.add('node-generator-core__socket');
  host.appendChild(socket.element);

  return {
    element: host,
    socketEl: socket.element,
    setSubLabel(text) { subEl.textContent = text; },
    setSubLabelFromSnapshot(snap) {
      if (!snap) return;
      subEl.textContent = `LOAD: ${snap.loadPct}% · LATENCY: ${snap.latencyMs}ms`;
    },
    setStatus(statusName) {
      const c = STATUS_PIN_COLOR[statusName];
      if (c) addCornerPins(host, { size: 8, color: c });
    },
  };
}
