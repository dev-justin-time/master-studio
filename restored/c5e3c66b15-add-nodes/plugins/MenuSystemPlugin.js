import { logger } from '../core/Logger.js';
/**
 * MenuSystemPlugin - Professional menu bar with organized dropdowns.
 * Injects a fixed top menu bar and adjusts the app layout accordingly.
 */
export const MenuSystemPlugin = {
  name: 'MenuSystem',
  _state: null,
  _menuBar: null,
  _menus: new Map(),

  init(state) {
    this._state = state;
    this._createMenuBar();
    this._setupMenus();

    // Close menus when clicking elsewhere
    document.addEventListener('click', () => this._closeAllMenus());
  },

  _createMenuBar() {
    // Adjust app height so menu bar doesn't cause overflow
    const app = document.getElementById('app');
    if (app) {
      app.style.height = 'calc(100vh - 32px)';
      app.style.marginTop = '32px';
    }

    this._menuBar = document.createElement('div');
    this._menuBar.id = 'studio-menu-bar';
    this._menuBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 32px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      padding: 0 4px;
      z-index: 10000;
      font-family: system-ui, sans-serif;
      font-size: 13px;
    `;
    document.body.insertBefore(this._menuBar, document.body.firstChild);
  },

  _setupMenus() {
    this._addMenu('File', [
      { label: 'Import GLB/GLTF', shortcut: 'Ctrl+I', action: () => document.getElementById('file-input')?.click() },
      { label: 'Export GLB', action: () => this._dispatch('export', { format: 'glb' }) },
      { label: 'Export GLTF', action: () => this._dispatch('export', { format: 'gltf' }) },
      { type: 'separator' },
      { label: 'Save Scene', shortcut: 'Ctrl+S', action: () => logger.log('Menu', 'Save scene') },
      { label: 'Load Scene', shortcut: 'Ctrl+O', action: () => logger.log('Menu', 'Load scene') },
    ]);

    this._addMenu('Edit', [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: () => this._dispatch('undo') },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => this._dispatch('redo') },
      { type: 'separator' },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => this._dispatch('copy') },
      { label: 'Paste', shortcut: 'Ctrl+V', action: () => this._dispatch('paste') },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => this._dispatch('duplicate') },
      { label: 'Delete', shortcut: 'Delete', action: () => this._dispatch('delete') },
      { type: 'separator' },
      { label: 'Select All', shortcut: 'A', action: () => this._dispatch('selectAll') },
      { label: 'Deselect All', shortcut: 'Alt+A', action: () => this._dispatch('deselectAll') },
      { label: 'Invert Selection', action: () => this._dispatch('invertSelection') },
    ]);

    this._addMenu('Object', [
      { label: 'Add Primitive', submenu: [
        { label: 'Cube', action: () => this._dispatch('addPrimitive', { type: 'cube' }) },
        { label: 'UV Sphere', action: () => this._dispatch('addPrimitive', { type: 'uvsphere' }) },
        { label: 'Ico Sphere', action: () => this._dispatch('addPrimitive', { type: 'icosphere' }) },
        { label: 'Cone', action: () => this._dispatch('addPrimitive', { type: 'cone' }) },
        { label: 'Cylinder', action: () => this._dispatch('addPrimitive', { type: 'cylinder' }) },
        { label: 'Torus', action: () => this._dispatch('addPrimitive', { type: 'torus' }) },
        { label: 'Plane', action: () => this._dispatch('addPrimitive', { type: 'plane' }) },
      ]},
      { label: 'Add Water Surface', action: () => this._dispatch('addWater', {
        width: 200, height: 200, segments: 128,
        distortionScale: 3.7, alpha: 1.0,
        sunDirection: [0.7, 0.3, 0.7], sunColor: 0xffffff, waterColor: 0x001e0f,
        foamIntensity: 0.35,
      }) },
      { label: 'Add Buoyant Box', action: () => {
        this._dispatch('addPrimitive', { type: 'cube' });
        // Buoyancy attaches automatically because Water sets userData.isWater
        // on the mesh; PhysicsPlugin picks it up on the next step.
      } },
      { type: 'separator' },
      { label: 'Group', shortcut: 'Ctrl+G', action: () => this._dispatch('group') },
      { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', action: () => this._dispatch('ungroup') },
    ]);

    this._addMenu('View', [
      { label: 'Camera Views', submenu: [
        { label: 'Perspective', shortcut: '5', action: () => this._dispatch('setCameraView', { view: 'perspective' }) },
        { label: 'Top', shortcut: '7', action: () => this._dispatch('setCameraView', { view: 'top' }) },
        { label: 'Front', shortcut: '1', action: () => this._dispatch('setCameraView', { view: 'front' }) },
        { label: 'Right', shortcut: '3', action: () => this._dispatch('setCameraView', { view: 'right' }) },
        { type: 'separator' },
        { label: 'Reset View', shortcut: 'Home', action: () => this._dispatch('resetView') },
        { label: 'Frame Selected', shortcut: 'F', action: () => this._dispatch('frameSelected') },
        { label: 'Frame All', shortcut: 'Shift+F', action: () => this._dispatch('frameAll') },
      ]},
      { type: 'separator' },
      { label: 'Lighting Presets', submenu: [
        { label: 'Studio', action: () => this._dispatch('applyLightingPreset', { preset: 'studio' }) },
        { label: 'Outdoor Daylight', action: () => this._dispatch('applyLightingPreset', { preset: 'outdoor' }) },
        { label: 'Night Scene', action: () => this._dispatch('applyLightingPreset', { preset: 'night' }) },
        { label: 'Dramatic', action: () => this._dispatch('applyLightingPreset', { preset: 'dramatic' }) },
      ]},
    ]);

    this._addMenu('Render', [
      { label: 'Quality Presets', submenu: [
        { label: 'Draft', action: () => this._dispatch('setRenderPreset', { preset: 'draft' }) },
        { label: 'Preview', action: () => this._dispatch('setRenderPreset', { preset: 'preview' }) },
        { label: 'Production', action: () => this._dispatch('setRenderPreset', { preset: 'production' }) },
        { label: 'Cinematic', action: () => this._dispatch('setRenderPreset', { preset: 'cinematic' }) },
      ]},
      { type: 'separator' },
      { label: 'Screenshot', shortcut: 'F12', action: () => this._dispatch('captureScreenshot') },
    ]);

    this._addMenu('Window', [
      { label: 'Toggle Node Graph', action: () => this._dispatch('togglePanel', { panel: 'sidebar' }) },
      { label: 'Toggle Debug Panel', action: () => this._dispatch('togglePanel', { panel: 'debug' }) },
      { type: 'separator' },
      { label: 'Open Brutalist Editor →', action: () => { window.location.href = '/studio.html'; } },
      { label: 'Back to Node Editor ←', action: () => { window.location.href = '/index.html'; } },
      { label: 'Open Text Generator →', action: () => { window.location.href = '/scene.html'; } },
      { label: 'Open Main Scene →', action: () => { window.location.href = '/main.html'; } },
      { label: 'Open Node Architect →', action: () => { window.location.href = '/nodearchitect.html'; } },
      { type: 'separator' },
      { label: 'Brutalist Skin v4.2.0', shortcut: '✓', action: () => {
        this._dispatch('notification', { type: 'success', message: 'Brutalist skin active — drop nodes anywhere in the engine.' });
        logger.info('Menu', 'Brutalist skin confirmed active');
      } },
      { label: 'Add Node to Graph', action: () => document.getElementById('add-node-menu')?.firstElementChild?.click() },
    ]);

    this._addMenu('Help', [
      { label: 'Keyboard Shortcuts', action: () => logger.log('Menu', 'Keyboard shortcuts: L=Lasso G=Group U=Ungroup S=Sticky P=Debug 1-3=Color') },
      { label: 'About Master Studio', action: () => alert('Master Studio — 3D Studio Environment') },
    ]);
  },

  /**
   * Adds a dropdown menu to the bar. Dropdown is a child of the button
   * so CSS `position: absolute` positions relative to the button.
   */
  _addMenu(label, items) {
    const menuBtn = document.createElement('div');
    menuBtn.className = 'studio-menu-btn';
    menuBtn.textContent = label;
    menuBtn.style.cssText = `
      position: relative;
      padding: 6px 12px;
      cursor: pointer;
      color: #ccc;
      border-radius: 4px;
      user-select: none;
      white-space: nowrap;
    `;

    // Hover highlight
    menuBtn.addEventListener('mouseenter', () => { menuBtn.style.background = '#333'; });
    menuBtn.addEventListener('mouseleave', () => { menuBtn.style.background = 'transparent'; });

    // Dropdown — child of menuBtn, so position:absolute is relative to the button
    const dropdown = document.createElement('div');
    dropdown.className = 'studio-dropdown';
    dropdown.style.cssText = `
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      background: #2a2a2a;
      border: 1px solid #444;
      min-width: 210px;
      z-index: 10001;
      box-shadow: 0 6px 16px rgba(0,0,0,0.6);
      border-radius: 0 0 6px 6px;
      padding: 4px 0;
    `;

    this._buildMenuItems(dropdown, items);

    menuBtn.addEventListener('mouseenter', () => {
      this._closeAllMenus();
      dropdown.style.display = 'block';
    });

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display === 'block';
      this._closeAllMenus();
      if (!isOpen) dropdown.style.display = 'block';
    });

    // Keep dropdown open while hovering it
    dropdown.addEventListener('mouseenter', () => { dropdown.style.display = 'block'; });
    dropdown.addEventListener('mouseleave', () => { dropdown.style.display = 'none'; });

    menuBtn.appendChild(dropdown);
    this._menuBar.appendChild(menuBtn);
    this._menus.set(label, { button: menuBtn, dropdown });
  },

  /**
   * Recursively builds menu item rows. Submenus become child elements
   * with position:absolute for proper cascading alignment.
   */
  _buildMenuItems(container, items) {
    items.forEach(item => {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.style.cssText = 'height: 1px; background: #444; margin: 4px 8px;';
        container.appendChild(sep);
        return;
      }

      const menuItem = document.createElement('div');
      menuItem.style.cssText = `
        position: relative;
        padding: 7px 16px;
        cursor: pointer;
        color: #ccc;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      menuItem.appendChild(labelSpan);

      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.style.cssText = 'color: #666; font-size: 11px; margin-left: 24px;';
        shortcut.textContent = item.shortcut;
        menuItem.appendChild(shortcut);
      }

      // Hover effect
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = '#4a9eff';
        menuItem.style.color = '#fff';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
        menuItem.style.color = '#ccc';
      });

      if (item.submenu) {
        // Submenu indicator arrow
        const arrow = document.createElement('span');
        arrow.style.cssText = 'margin-left: 8px; color: #666;';
        arrow.textContent = '▶';
        menuItem.appendChild(arrow);

        // Submenu dropdown — child of menuItem for relative positioning
        const submenu = document.createElement('div');
        submenu.style.cssText = `
          display: none;
          position: absolute;
          left: 100%;
          top: -4px;
          background: #2a2a2a;
          border: 1px solid #444;
          min-width: 200px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          border-radius: 0 6px 6px 6px;
          padding: 4px 0;
          z-index: 10002;
        `;
        this._buildMenuItems(submenu, item.submenu);

        menuItem.addEventListener('mouseenter', () => {
          submenu.style.display = 'block';
        });
        menuItem.addEventListener('mouseleave', () => {
          submenu.style.display = 'none';
        });
        submenu.addEventListener('mouseenter', () => { submenu.style.display = 'block'; });
        submenu.addEventListener('mouseleave', () => { submenu.style.display = 'none'; });

        menuItem.appendChild(submenu);
      } else {
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.action) item.action();
          this._closeAllMenus();
        });
      }

      container.appendChild(menuItem);
    });
  },

  _closeAllMenus() {
    this._menus.forEach(menu => {
      menu.dropdown.style.display = 'none';
      // Also close any open submenus
      const submenus = menu.dropdown.querySelectorAll('.studio-dropdown');
      submenus.forEach(s => { s.style.display = 'none'; });
    });
  },

  /** Dispatch a CustomEvent so other plugins / MasterApp can handle the action. */
  _dispatch(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  },

  update(deltaTime) {},

  nodes: {}
};
