/**
 * corner-pins.js
 *
 * Brutalist corner-pin overlay: 4 small absolutely-positioned squares at
 * each corner of a target element. Mimics the Node Architect template's
 * "3D GEN CORE" central node where leaves get the small framing squares.
 * Self-contained concern. Idempotent (re-applying does not stack overlays).
 *
 * Usage:
 *   addCornerPins(centralNodeEl, { size: 8, color: '#77ff61' });
 */
export function addCornerPins(target, { size = 8, color = '#77ff61' } = {}) {
  if (!target) return null;

  // Idempotency: strip any previous overlay before reapplying so callers can
  // call addCornerPins() repeatedly during reactive re-renders without
  // stacking overlays.
  target.querySelectorAll('.corner-pin').forEach(el => el.remove());

  // Position container relatively so child pins can absolutely position.
  const cs = getComputedStyle(target);
  if (cs.position === 'static') target.style.position = 'relative';

  const pinStyle = (tlX, tlY, brX, brY) => {
    const pin = document.createElement('div');
    pin.className = 'corner-pin';
    Object.assign(pin.style, {
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      background: color,
      top: tlY,
      left: tlX,
      right: brX,
      bottom: brY,
    });
    target.appendChild(pin);
    return pin;
  };

  pinStyle('-2px',  '-2px',  'auto', 'auto');
  pinStyle('auto',  '-2px',  '-2px', 'auto');
  pinStyle('-2px',  'auto',  'auto', '-2px');
  pinStyle('auto',  'auto',  '-2px', '-2px');

  return {
    element: target,
    setColor(nextColor) {
      target.querySelectorAll('.corner-pin').forEach(p => {
        p.style.background = nextColor;
      });
    },
  };
}
