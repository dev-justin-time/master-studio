/**
 * scale-factor-node.js
 *
 * Brutalist SCALE_FACTOR node: label with embedded live readout (e.g.
 * `SCALE_FACTOR [42.0]`), single range input bound bidirectionally to that
 * readout, output socket with optional dashed connector. Mirrors the
 * SCALE_FACTOR block from the Node Architect template.
 *
 * Self-contained concern. Returns
 *   `{ element, getValue, setValue, onChange, socketEl }`.
 *
 * Usage:
 *   const node = createScaleFactorNode(host, {
 *     label: 'SCALE_FACTOR',
 *     min: 1, max: 100, defaultValue: 42, step: 1,
 *     withWire: true,
 *   });
 *   node.onChange(v => console.log('scale:', v));
 */

import { createNodeSocket } from '../ui/brutalist/node-dot.js';

export function createScaleFactorNode(host, opts = {}) {
  const {
    label = 'SCALE_FACTOR',
    min = 1,
    max = 100,
    defaultValue = 50,
    step = 1,
    withWire = false,
    wireLength = 96,
    wireRotate = 12,
  } = opts;

  host.innerHTML = '';
  host.classList.add('node-scale-factor');

  const labelEl = document.createElement('label');
  labelEl.className = 'node-scale-factor__label';
  const readout = document.createElement('span');
  readout.className = 'node-scale-factor__readout';

  const updateLabel = () => {
    labelEl.textContent = '';
    labelEl.append(`${label} `);
    labelEl.appendChild(readout);
  };

  const row = document.createElement('div');
  row.className = 'node-scale-factor__row';

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'node-scale-factor__slider';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(defaultValue);
  sliderWrap.appendChild(input);
  row.appendChild(sliderWrap);

  const socket = createNodeSocket({ type: 'output', withWire, wireLength, wireRotate });
  row.appendChild(socket.element);

  host.appendChild(labelEl);
  host.appendChild(row);
  updateLabel();

  const setReadout = v => { readout.textContent = `[${Number(v).toFixed(1)}]`; };
  setReadout(defaultValue);

  const handlers = [];
  input.addEventListener('input', () => {
    setReadout(input.value);
    handlers.forEach(h => { try { h(parseFloat(input.value)); } catch (_) {} });
  });

  return {
    element: host,
    socketEl: socket.element,
    getValue: () => parseFloat(input.value),
    setValue: v => {
      const clamped = Math.max(min, Math.min(max, Number(v)));
      input.value = String(clamped);
      setReadout(clamped);
    },
    onChange: h => handlers.push(h),
  };
}
