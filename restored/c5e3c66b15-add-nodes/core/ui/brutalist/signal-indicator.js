/**
 * signal-indicator.js
 *
 * Brutalist status pill: 8px green pulse dot with shadow halo + uppercase
 * mono label (e.g. "SIGNAL: STABLE"). Mirrors the Node Architect template's
 * `SIGNAL: STABLE` pattern. Self-contained concern — owns its own classes,
 * animations, and colors. Does NOT depend on any other module.
 *
 * Usage:
 *   const pill = createSignalIndicator({ status: 'stable', label: 'NETLINK' });
 *   container.appendChild(pill.element);
 *   pill.setStatus('degraded'); // 'stable' | 'degraded' | 'down'
 */
const COLOR_BY_STATUS = {
  stable:    { dot: '#77ff61', glow: 'rgba(119,255,97,0.7)' },
  degraded:  { dot: '#ffe16d', glow: 'rgba(255,225,109,0.6)' },
  down:      { dot: '#ffb4ab', glow: 'rgba(255,180,171,0.7)' },
  idle:      { dot: '#84967c', glow: 'rgba(132,150,124,0.4)' },
};

/**
 * @param {{ status?: keyof COLOR_BY_STATUS, label?: string }} opts
 */
export function createSignalIndicator({ status = 'stable', label = 'SIGNAL' } = {}) {
  const root = document.createElement('div');
  root.className = 'signal-indicator';

  const dot = document.createElement('span');
  dot.className = 'signal-indicator__dot';
  const labelEl = document.createElement('span');
  labelEl.className = 'signal-indicator__label';
  labelEl.textContent = `${label}: ${status.toUpperCase()}`;

  root.appendChild(dot);
  root.appendChild(labelEl);

  function apply(statusName) {
    const c = COLOR_BY_STATUS[statusName] || COLOR_BY_STATUS.stable;
    dot.style.background = c.dot;
    dot.style.boxShadow = `0 0 8px ${c.glow}`;
    labelEl.textContent = `${label}: ${statusName.toUpperCase()}`;
  }

  apply(status);

  return {
    element: root,
    setStatus(nextStatus) { apply(nextStatus); },
    setLabel(nextLabel) { label = nextLabel; apply(status); },
  };
}
