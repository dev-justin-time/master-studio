/**
 * font-map-node.js
 *
 * Brutalist FONT_MAP node: small label + grid of two toggle buttons, with
 * the active button highlighted (used as a binary font picker). Mirrors
 * the FONT_MAP block from the Node Architect template (SPACE_GRT/RBTO).
 *
 * Self-contained concern. Returns `{ element, getValue, setValue, onChange }`
 * where `getValue` returns the currently selected option string.
 *
 * Usage:
 *   const node = createFontMapNode(host, {
 *     label: 'FONT_MAP',
 *     options: [
 *       { id: 'space_grotesk', label: 'SPACE_GRT' },
 *       { id: 'roboto_mono',   label: 'RBTO_MONO' },
 *     ],
 *     defaultId: 'space_grotesk',
 *     withWire: true,
 *   });
 *   node.onChange(id => console.log('font:', id));
 */

import { createNodeSocket } from '../ui/brutalist/node-dot.js';

export function createFontMapNode(host, opts = {}) {
  const {
    label = 'FONT_MAP',
    options = [{ id: 'opt_a', label: 'OPT_A' }, { id: 'opt_b', label: 'OPT_B' }],
    defaultId = null,
    withWire = false,
    wireLength = 64,
    wireRotate = -12,
  } = opts;

  host.innerHTML = '';
  host.classList.add('node-font-map');

  const labelEl = document.createElement('label');
  labelEl.className = 'node-font-map__label';
  labelEl.textContent = label;
  host.appendChild(labelEl);

  const row = document.createElement('div');
  row.className = 'node-font-map__row';

  const grid = document.createElement('div');
  grid.className = 'node-font-map__grid';

  const buttons = options.map(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = opt.id;
    btn.textContent = opt.label;
    btn.className = 'node-font-map__btn';
    btn.addEventListener('click', () => select(opt.id));
    grid.appendChild(btn);
    return btn;
  });

  row.appendChild(grid);

  const socket = createNodeSocket({ type: 'output', withWire, wireLength, wireRotate });
  row.appendChild(socket.element);

  host.appendChild(row);

  let current = defaultId || (options[0] && options[0].id) || null;
  const handlers = [];

  function paint() {
    buttons.forEach(b => {
      const on = b.dataset.id === current;
      b.classList.toggle('is-selected', on);
    });
  }
  function select(id) {
    current = id;
    paint();
    handlers.forEach(h => { try { h(id); } catch (_) {} });
  }
  paint();

  return {
    element: host,
    socketEl: socket.element,
    getValue: () => current,
    setValue: id => { if (options.some(o => o.id === id)) select(id); },
    onChange: h => handlers.push(h),
  };
}
