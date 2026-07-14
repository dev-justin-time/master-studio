
    const $ = (id) => document.getElementById(id);
    const textgenModal = $('textgen-modal');

    // Toggle .is-enter via remove→rAF→add so the CSS entry animation re-fires
    // on every open, not just the first. (modal.hidden alone leaves the panel
    // mounted, so re-adding the class the second time is a CSS no-op.)
    function openModal() {
      textgenModal.hidden = false;
      const panel = textgenModal.querySelector('.bs-modal__panel');
      panel.classList.remove('is-enter');
      requestAnimationFrame(() => panel.classList.add('is-enter'));
    }
    function closeModal() {
      textgenModal.hidden = true;
      textgenModal.querySelector('.bs-modal__panel').classList.remove('is-enter');
    }

    let selectedFont = 'space_grotesk';
    function paintSelectedFont() {
      document.querySelectorAll('.textgen-font').forEach(b => {
        const on = b.dataset.font === selectedFont;
        if (on) { b.style.background = 'var(--secondary-neon)'; b.style.color = 'var(--border)'; b.style.boxShadow = '4px 4px 0 0 var(--border)'; b.style.opacity = '1'; }
        else    { b.style.background = 'var(--surface-lowest)'; b.style.color = 'var(--primary-neon)'; b.style.boxShadow = '3px 3px 0 0 var(--primary-neon)'; b.style.opacity = '0.7'; }
      });
    }
    paintSelectedFont();
    document.querySelectorAll('.textgen-font').forEach(btn => {
      btn.addEventListener('click', () => { selectedFont = btn.dataset.font; paintSelectedFont(); });
    });
    $('textgen-size').addEventListener('input',   e => $('textgen-size-readout').textContent   = parseFloat(e.target.value).toFixed(1));
    $('textgen-depth').addEventListener('input',  e => $('textgen-depth-readout').textContent  = parseFloat(e.target.value).toFixed(1));
    $('textgen-roughness')?.addEventListener('input', e => $('textgen-roughness-readout').textContent = (e.target.value / 100).toFixed(2));

    $('textgen-create')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('generateText3D', {
        detail: {
          text:  $('textgen-content').value || 'HODL',
          font:  selectedFont,
          size:  parseFloat($('textgen-size').value),
          depth: parseFloat($('textgen-depth').value),
        }
      }));
      window.addEventListener('text3d:created', () => closeModal(), { once: true });
    });

    document.querySelectorAll('.bs-aside-row[data-outliner-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.outlinerName;
        document.querySelectorAll('.bs-aside-row[data-outliner-name]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        window.dispatchEvent(new CustomEvent('select:byName', { detail: { name } }));
      });
    });
    $('textgen-cancel')?.addEventListener('click', closeModal);
    $('textgen-close')?.addEventListener('click', closeModal);
    $('btn-reopen-modal')?.addEventListener('click', openModal);
    document.querySelectorAll('[data-open-modal]').forEach(el => el.addEventListener('click', openModal));

    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') closeModal();
    });

    const gizmoBtns = document.querySelectorAll('.bs-gizmo-btn');
    gizmoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        gizmoBtns.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });
  