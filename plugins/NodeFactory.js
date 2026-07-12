/**
 * NodeFactory - Shared builder for visual node DOM cards.
 *
 * Every plugin's `nodes` map calls this to produce consistent cards for
 * the brutalist node graph UI (`.node-card` + `.pin-dot` rules live in
 * `index.html`).
 *
 * Design rules:
 *   - No inline styles — the brutalist CSS owns all colors / shadows / fonts.
 *   - Cards are absolutely positioned but laid out in a vertical list.
 *   - Drag support: pointerdown → switches to absolute positioning so
 *     the displacement persists, pointerup → clears zIndex/cursor.
 *
 * @param {number} x          Horizontal offset within `#node-graph-area`.
 * @param {number} y          Vertical offset within `#node-graph-area`.
 * @param {string} label      Header text shown on the top bar.
 * @param {string[]} [inputs] Pin names shown as green input dots.
 * @param {string[]} [outputs] Pin names shown as yellow output dots.
 * @param {Object} [opts]
 * @param {HTMLElement} [opts.body] Extra DOM to append in the body slot
 *   (between inputs and outputs). Used by Lua nodes for textareas, etc.
 * @param {string[]} [opts.extraClasses] Additional class names on the
 *   card root (e.g. `node-card-yellow` for Wasm/heavy nodes).
 */
export function createNodeCard(x, y, label, inputs = [], outputs = [], opts = {}) {
  const card = document.createElement('div');
  card.className = ['node-card', ...(opts.extraClasses || [])].join(' ').trim();
  // Absolute positioning lets (x, y) be a real coordinate inside the
  // #node-graph-area. Drag updates left/top; mouseup keeps `absolute` so
  // displacement persists across drags.
  card.style.position = 'absolute';
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'node-header';
  header.textContent = label;
  card.appendChild(header);

  // ── Input slots (traffic-light dots, green) ──
  if (inputs.length) {
    const block = document.createElement('div');
    block.className = 'node-inputs';
    block.innerHTML = inputs
      .map(name => `
        <div class="pin-row">
          <span class="pin-dot"></span>
          <span data-type="Object" data-prop="${name}">${name}</span>
        </div>
      `)
      .join('');
    card.appendChild(block);
  }

  // ── Custom body content (textareas, submits, etc.) ──
  if (opts.body) {
    const body = document.createElement('div');
    body.className = 'node-body';
    body.appendChild(opts.body);
    card.appendChild(body);
  }

  // ── Output slots (traffic-light dots, yellow) ──
  if (outputs.length) {
    const block = document.createElement('div');
    block.className = 'node-outputs';
    block.innerHTML = outputs
      .map(name => `
        <div class="pin-row">
          <span data-type="${name}">${name}</span>
          <span class="pin-dot out"></span>
        </div>
      `)
      .join('');
    card.appendChild(block);
  }

  _enableDrag(card);
  return card;
}

function _enableDrag(card) {
  // Pointer-based drag: Mousedown starts, mousemove updates left/top,
  // mouseup commits. Skips drag-from interactive controls so users can
  // still type into inputs/selects inside a card.
  let dragging = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;

  card.addEventListener('mousedown', e => {
    if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const cs = card.style;
    origLeft = parseInt(cs.left, 10) || 0;
    origTop = parseInt(cs.top, 10) || 0;
    card.style.cursor = 'grabbing';
    card.style.zIndex = '999';
    card.style.position = 'absolute';
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    card.style.left = (origLeft + e.clientX - startX) + 'px';
    card.style.top = (origTop + e.clientY - startY) + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    card.style.cursor = 'grab';
    card.style.zIndex = '';
  });
}
