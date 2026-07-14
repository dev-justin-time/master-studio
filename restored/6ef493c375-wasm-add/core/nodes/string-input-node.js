/**
 * string-input-node.js
 *
 * Brutalist STRING_INPUT node: small uppercase mono label + transparent
 * bordered text input + an output socket (with optional dashed connector).
 * Mirrors the STRING_INPUT block from the Node Architect template.
 *
 * Self-contained concern — receives an empty `<div>` host element and
 * fills it. Returns `{ element, getValue, setValue, onChange }`.
 *
 * Usage:
 *   const host = document.getElementById('slot-string-input');
 *   const node = createStringInputNode(host, {
 *     label: 'STRING_INPUT',
 *     placeholder: 'ENTER STRING...',
 *     defaultValue: 'HODL',
 *     withWire: true,
 *   });
 *   node.onChange(v => console.log('typed:', v));
 */

import { createNodeSocket } from '../ui/brutalist/node-dot.js';

export function createStringInputNode(host, opts = {}) {
  const {
    label = 'STRING_INPUT',
    placeholder = 'ENTER STRING...',
    defaultValue = '',
    withWire = false,
    wireLength = 80,
    wireRotate = 0,
  } = opts;

  host.innerHTML = '';
  host.classList.add('node-string-input');

  const labelEl = document.createElement('label');
  labelEl.className = 'node-string-input__label';
  labelEl.textContent = label;

  const row = document.createElement('div');
  row.className = 'node-string-input__row';

  const box = document.createElement('div');
  box.className = 'node-string-input__box';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = defaultValue;
  input.className = 'node-string-input__input';

  box.appendChild(input);
  row.appendChild(box);

  const socket = createNodeSocket({
    type: 'output',
    withWire,
    wireLength,
    wireRotate,
  });
  row.appendChild(socket.element);

  host.appendChild(labelEl);
  host.appendChild(row);

  const handlers = [];
  input.addEventListener('input', () => {
    handlers.forEach(h => { try { h(input.value); } catch (_) {} });
  });

  return {
    element: host,
    socketEl: socket.element,
    getValue: () => input.value,
    setValue: v => { input.value = String(v); },
    onChange: h => handlers.push(h),
  };
}
