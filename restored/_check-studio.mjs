
    const $ = (id) => document.getElementById(id);
    const primMenu = $('primitive-menu');

    // Toggle .is-enter via remove→rAF→add so the entry animation re-fires
    // every open. Naive add() is a no-op the second time because the panel
    // is still in the DOM and CSS animations only run on initial mount.
    function openMenu() {
      primMenu.hidden = false;
      const panel = primMenu.querySelector('.bs-modal__panel');
      panel.classList.remove('is-enter');
      requestAnimationFrame(() => panel.classList.add('is-enter'));
    }
    function closeMenu() {
      primMenu.hidden = true;
      primMenu.querySelector('.bs-modal__panel').classList.remove('is-enter');
    }

    $('add-node-btn')?.addEventListener('click', openMenu);
    $('cancel-primitive')?.addEventListener('click', closeMenu);

    document.querySelectorAll('[data-primitive]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.primitive;
        window.dispatchEvent(new CustomEvent('addPrimitive', { detail: { type } }));
        closeMenu();
      });
    });

    document.addEventListener('keydown', e => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') closeMenu();
      if (e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        openMenu();
      }
    });

    // Roughness slider live readout
    $('textgen-roughness')?.addEventListener('input', e => {
      $('textgen-roughness-readout').textContent = (e.target.value / 100).toFixed(2);
    });

    // Gizmo toolbar — visual state + MasterApp event mapping
    const gizmoBtns = document.querySelectorAll('.bs-gizmo-btn');
    gizmoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.gizmoMode;
        const mapping = { move: 'gizmo:set:translate', rotate: 'gizmo:set:rotate', scale: 'gizmo:set:scale', pan: 'resetView' };
        if (mapping[mode]) window.dispatchEvent(new CustomEvent(mapping[mode]));
        gizmoBtns.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });

    // Dynamic outliner — refresh when scene objects change
    // window.__masterScene is maintained by core/scene-utils.js
    function refreshOutliner() {
      const list = $('outliner-list');
      if (!list || !window.__masterScene) return;
      // Survive the OUTLINER section-title header
      const headerTitle = list.querySelector('.bs-aside-section-title');
      const rows = window.__masterScene.children.filter(o => o.userData?.isManagedObject);
      // Preserve the section title, drop the rest
      const allChildren = Array.from(list.children);
      allChildren.forEach(c => { if (!c.classList.contains('bs-aside-section-title')) c.remove(); });
      // Find header (move it to top again in case)
      // Append rows as bs-aside-row buttons
      rows.forEach((obj, i) => {
        const btn = document.createElement('button');
        btn.className = 'bs-aside-row' + (i === 0 ? ' is-active' : '');
        btn.dataset.outlinerName = obj.name;
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px;">view_in_ar</span>' + obj.name;
        btn.addEventListener('click', () => {
          list.querySelectorAll('.bs-aside-row').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          window.dispatchEvent(new CustomEvent('select:byName', { detail: { name: obj.name } }));
        });
        list.appendChild(btn);
      });
    }
    setInterval(refreshOutliner, 800);
  