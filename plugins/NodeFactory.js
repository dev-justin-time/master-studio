/**
 * NodeFactory - Shared builder for visual node DOM cards.
 *
 * Every plugin's `nodes` map calls this to produce consistent,
 * styled node cards for the node graph UI.
 */
export function createNodeCard(x, y, label, inputs = [], outputs = []) {
  const card = document.createElement('div');
  card.className = 'node-card';
  card.style.cssText = `
    position: relative;
    background: #252525;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 8px 12px;
    min-width: 160px;
    font-size: 12px;
    color: #ddd;
    cursor: grab;
    user-select: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    transition: border-color 0.15s, box-shadow 0.15s;
  `;
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = '#00ff88';
    card.style.boxShadow = '0 2px 14px rgba(0,255,136,0.25)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = '#444';
    card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
  });

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = `
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.3px;
    margin-bottom: 6px;
    color: #00ff88;
    border-bottom: 1px solid #333;
    padding-bottom: 4px;
  `;
  header.textContent = label;
  card.appendChild(header);

  // ── Input slots ──
  inputs.forEach(name => {
    const slot = _buildSlot(name, 'input');
    card.appendChild(slot);
  });

  // ── Output slots ──
  outputs.forEach(name => {
    const slot = _buildSlot(name, 'output');
    card.appendChild(slot);
  });

  // Simple drag support
  _enableDrag(card);

  return card;
}

function _buildSlot(name, kind) {
  const row = document.createElement('div');
  row.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    font-size: 11px;
  `;

  const dot = document.createElement('span');
  dot.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${kind === 'input' ? '#ff8844' : '#44aaff'};
    border: 1px solid ${kind === 'input' ? '#aa5533' : '#3366aa'};
    flex-shrink: 0;
  `;

  const label = document.createElement('span');
  label.textContent = name;
  label.style.color = '#999';

  if (kind === 'input') {
    row.appendChild(dot);
    row.appendChild(label);
  } else {
    row.appendChild(label);
    row.appendChild(dot);
    row.style.justifyContent = 'flex-end';
  }

  return row;
}

function _enableDrag(card) {
  let dragging = false;
  let startX, startY, origLeft, origTop;

  card.addEventListener('mousedown', e => {
    // Don't drag when interacting with buttons, inputs, or selects
    if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = card.offsetLeft;
    origTop = card.offsetTop;
    card.style.cursor = 'grabbing';
    card.style.zIndex = '999';
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    card.style.left = (origLeft + dx) + 'px';
    card.style.top = (origTop + dy) + 'px';
    card.style.position = 'absolute';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    card.style.cursor = 'grab';
    card.style.zIndex = '';
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
  });
}
