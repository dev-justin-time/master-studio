/**
 * blueprint-bg.js
 *
 * Brutalist blueprint background: CSS-driven light-on-dark grid overlay +
 * optional radial gradient center wash. Mirrors the Node Architect
 * `.blueprint-bg` pattern. Self-contained concern.
 *
 * Usage:
 *   const bg = createBlueprintBg({
 *     gridSize: 20,
 *     color: 'rgba(132, 150, 124, 0.1)',
 *     withRadial: true,
 *   });
 *   container.appendChild(bg.element);
 */
export function createBlueprintBg({
  gridSize = 20,
  color = 'rgba(132, 150, 124, 0.1)',
  withRadial = false,
  radialColor = '#1a2e1a',
  radialCenter = '#131313',
} = {}) {
  const root = document.createElement('div');
  root.className = 'blueprint-bg';
  root.style.backgroundImage = [
    `linear-gradient(to right, ${color} 1px, transparent 1px)`,
    `linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
  ].join(', ');
  root.style.backgroundSize = `${gridSize}px ${gridSize}px`;

  if (withRadial) {
    const wash = document.createElement('div');
    wash.className = 'blueprint-bg__radial';
    wash.style.background = `radial-gradient(circle_at_center, ${radialColor} 0%, ${radialCenter} 100%)`;
    root.appendChild(wash);
  }

  return { element: root };
}
