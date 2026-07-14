/**
 * SelectionPlugin - Advanced selection tools including lasso, group,
 * sticky select, select-by-color, select-by-type, and bounding box.
 * Lasso draws on a 2D canvas overlay for clear visual feedback.
 */
import * as THREE from 'three';
import { createNodeCard } from './NodeFactory.js';

export const SelectionPlugin = {
  name: 'Selection',
  _state: null,
  _selectionMode: 'single',
  _isLassoActive: false,
  _lassoPoints: [],
  _overlayCanvas: null,
  _overlayCtx: null,
  _viewport: null,
  _stickySelect: false,
  _selectionHistory: [],

  init(state) {
    this._state = state;
    this._overlayCanvas = document.getElementById('lassoOverlay');
    this._viewport = document.getElementById('viewport');
    if (this._overlayCanvas) {
      this._overlayCtx = this._overlayCanvas.getContext('2d');
    }

    state.on('selection:mode:change', (mode) => {
      this._selectionMode = mode;
    });
  },

  startLassoSelect() {
    this._isLassoActive = true;
    this._lassoPoints = [];
    this._selectionMode = 'lasso';

    if (this._overlayCanvas) {
      this._overlayCanvas.style.display = 'block';
      const vw = this._viewport?.clientWidth ?? this._overlayCanvas.offsetWidth;
      const vh = this._viewport?.clientHeight ?? this._overlayCanvas.offsetHeight;
      this._overlayCanvas.width = vw;
      this._overlayCanvas.height = vh;
      this._overlayCtx?.clearRect(0, 0, vw, vh);
    }

    this._state.emit('selection:lasso:started');
  },

  addLassoPoint(screenX, screenY) {
    if (!this._isLassoActive) return;
    this._lassoPoints.push({ x: screenX, y: screenY });
    this._drawLassoOnOverlay();
  },

  completeLassoSelect() {
    if (!this._isLassoActive || this._lassoPoints.length < 3) {
      this.cancelLassoSelect();
      return;
    }

    const objects = this._getSelectableObjects();
    const selectedObjects = [];

    objects.forEach(obj => {
      const screenPos = this._getScreenPosition(obj);
      if (screenPos && this._isPointInPolygon(screenPos, this._lassoPoints)) {
        selectedObjects.push(obj);
      }
    });

    if (this._stickySelect) {
      this._addToSelection(selectedObjects);
    } else {
      this._setSelection(selectedObjects);
    }

    this.cancelLassoSelect();
    this._state.emit('selection:lasso:completed', { count: selectedObjects.length });
  },

  cancelLassoSelect() {
    this._isLassoActive = false;
    this._lassoPoints = [];

    if (this._overlayCanvas) {
      this._overlayCanvas.style.display = 'none';
      this._overlayCtx?.clearRect(0, 0, this._overlayCanvas.width, this._overlayCanvas.height);
    }

    this._selectionMode = 'single';
  },

  /** Draw the lasso polygon on the 2D overlay canvas */
  _drawLassoOnOverlay() {
    if (!this._overlayCtx || !this._overlayCanvas) return;
    const ctx = this._overlayCtx;
    const pts = this._lassoPoints;
    if (pts.length < 2) return;

    // Offset points to canvas-local coordinates
    const rect = this._overlayCanvas.getBoundingClientRect();
    const ox = rect.left;
    const oy = rect.top;

    // Clear and redraw
    ctx.clearRect(0, 0, this._overlayCanvas.width, this._overlayCanvas.height);

    // Draw filled polygon
    ctx.beginPath();
    ctx.moveTo(pts[0].x - ox, pts[0].y - oy);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x - ox, pts[i].y - oy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 255, 136, 0.12)';
    ctx.fill();

    // Draw dashed outline
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw vertex dots
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x - ox, p.y - oy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88';
      ctx.fill();
    });
  },

  groupSelected() {
    const selected = this._state.data.selectedObjects || [];
    if (selected.length < 2) {
      this._state.emit('notification', { message: 'Select at least 2 objects to group', type: 'warning' });
      return;
    }

    const group = new THREE.Group();
    group.name = 'Group_' + Date.now();
    group.userData.isGroup = true;
    group.userData.isManagedObject = true;

    const center = new THREE.Vector3();
    selected.forEach(obj => center.add(obj.position));
    center.divideScalar(selected.length);

    group.position.copy(center);

    selected.forEach(obj => {
      obj.parent.remove(obj);
      group.add(obj);
      obj.position.sub(center);
    });

    this._state.data.scene.add(group);
    this._setSelection([group]);

    this._state.emit('selection:grouped', { group });
    return group;
  },

  ungroupSelected() {
    const selected = this._state.data.selectedObjects || [];
    if (selected.length !== 1 || !selected[0].userData.isGroup) {
      this._state.emit('notification', { message: 'Select a single group to ungroup', type: 'warning' });
      return;
    }

    const group = selected[0];
    const children = [...group.children];

    children.forEach(child => {
      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      group.remove(child);
      this._state.data.scene.add(child);
      child.position.copy(worldPos);
    });

    this._state.data.scene.remove(group);
    this._setSelection(children);

    this._state.emit('selection:ungrouped', { count: children.length });
  },

  toggleStickySelect() {
    this._stickySelect = !this._stickySelect;
    this._state.emit('selection:sticky:toggled', { enabled: this._stickySelect });
    return this._stickySelect;
  },

  selectByColor(hexColor) {
    const color = new THREE.Color(hexColor);
    const objects = this._getSelectableObjects();
    const selectedObjects = [];

    objects.forEach(obj => {
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          if (mat.color && mat.color.equals(color)) {
            selectedObjects.push(obj);
            break;
          }
        }
      }
    });

    if (this._stickySelect) {
      this._addToSelection(selectedObjects);
    } else {
      this._setSelection(selectedObjects);
    }

    this._state.emit('selection:byColor', { color: hexColor, count: selectedObjects.length });
    return selectedObjects;
  },

  selectByType(typeName) {
    const selectedObjects = [];
    this._state.data.scene.traverse((obj) => {
      if (obj.type === typeName) {
        selectedObjects.push(obj);
      }
    });

    if (this._stickySelect) {
      this._addToSelection(selectedObjects);
    } else {
      this._setSelection(selectedObjects);
    }

    this._state.emit('selection:byType', { type: typeName, count: selectedObjects.length });
    return selectedObjects;
  },

  selectAll() {
    const objects = this._getSelectableObjects();
    this._setSelection(objects);
    this._state.emit('selection:all', { count: objects.length });
  },

  deselectAll() {
    this._setSelection([]);
    this._state.emit('selection:deselected');
  },

  invertSelection() {
    const allObjects = this._getSelectableObjects();
    const currentSelection = this._state.data.selectedObjects || [];
    const newSelection = allObjects.filter(obj => !currentSelection.includes(obj));

    this._setSelection(newSelection);
    this._state.emit('selection:inverted', { count: newSelection.length });
  },

  selectByBoundingBox(min, max) {
    const box = new THREE.Box3(min, max);
    const objects = this._getSelectableObjects();
    const selectedObjects = [];

    objects.forEach(obj => {
      const objBox = new THREE.Box3().setFromObject(obj);
      if (box.intersectsBox(objBox)) {
        selectedObjects.push(obj);
      }
    });

    if (this._stickySelect) {
      this._addToSelection(selectedObjects);
    } else {
      this._setSelection(selectedObjects);
    }

    this._state.emit('selection:byBoundingBox', { count: selectedObjects.length });
    return selectedObjects;
  },

  selectByNamePattern(pattern) {
    const regex = new RegExp(pattern, 'i');
    const objects = this._getSelectableObjects();
    const selectedObjects = [];

    objects.forEach(obj => {
      if (obj.name && regex.test(obj.name)) {
        selectedObjects.push(obj);
      }
    });

    if (this._stickySelect) {
      this._addToSelection(selectedObjects);
    } else {
      this._setSelection(selectedObjects);
    }

    this._state.emit('selection:byName', { pattern, count: selectedObjects.length });
    return selectedObjects;
  },

  // ── Helpers ──

  _getSelectableObjects() {
    const objects = [];
    this._state.data.scene.traverse((obj) => {
      if (obj.isMesh || obj.isGroup) {
        objects.push(obj);
      }
    });
    return objects;
  },

  _setSelection(objects) {
    this._state.data.selectedObjects = objects;
    this._state.set('selectedObjects', objects);
    this._state.set('selectedObject', objects.length === 1 ? objects[0] : null);
    this._selectionHistory.push([...objects]);
  },

  _addToSelection(objects) {
    const current = this._state.data.selectedObjects || [];
    const newSelection = [...current];

    objects.forEach(obj => {
      if (!newSelection.includes(obj)) {
        newSelection.push(obj);
      }
    });

    this._setSelection(newSelection);
  },

  _getScreenPosition(object) {
    const camera = this._state.data.camera;
    if (!camera) return null;
    const vector = new THREE.Vector3();
    object.getWorldPosition(vector);
    vector.project(camera);

    return {
      x: (vector.x + 1) / 2 * window.innerWidth,
      y: (-vector.y + 1) / 2 * window.innerHeight
    };
  },

  _isPointInPolygon(point, polygon) {
    if (!point) return false;
    let inside = false;
    const x = point.x;
    const y = point.y;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  },

  // ── Visual Nodes ──
  nodes: {
    'Selection/LassoSelectNode': (x, y) =>
      createNodeCard(x, y, 'Lasso Select', ['Sticky Mode'], ['Selected Objects']),

    'Selection/SelectByColorNode': (x, y) =>
      createNodeCard(x, y, 'Select by Color', ['Color'], ['Selected Objects']),

    'Selection/GroupNode': (x, y) =>
      createNodeCard(x, y, 'Group Objects', ['Objects'], ['Grouped Object']),
  }
};
