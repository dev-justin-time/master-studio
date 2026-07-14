/**
 * core/nav.js — Shared brutalist top-nav injector.
 *
 * Mounts a fixed top nav bar at the top of <body> with consistent links that
 * work on every page of Master Studio. Hides any pre-existing top <nav>
 * element (Tailwind-flavored pages) so the shared one is the only chro-me.
 * Highlights the current page by matching the file name against the link's
 * data-page attribute.
 *
 * No exports; pure side-effect. Loaded with <script type="module"> on every
 * HTML page that wants the shared chrome.
 *
 * Usage from HTML:
 *   <link rel="stylesheet" href="/core/brutalist.css">
 *   <script type="module" src="/core/nav.js"></script>
 *
 * If a page already has <body class="bs-nav-compact-page">, the injected nav
 * gets the `bs-nav--compact` modifier so it shrinks to 40px and the page
 * body drops to padding-top: 40px.
 */

const NAV_LINKS = [
  { page: 'index.html',  label: 'Node Editor',   href: '/index.html' },
  { page: 'pipeline.html', label: 'Pipeline',    href: '/pipeline.html' },
  { page: 'studio.html', label: 'Brutalist',     href: '/studio.html' },
  { page: 'scene.html',  label: 'Text Gen',      href: '/scene.html' },
  { page: 'main.html',   label: 'Projects',      href: '/main.html' },
  { page: 'nodearchitect.html', label: 'Architect', href: '/nodearchitect.html' },
  { page: 'usecase.html',label: 'Wasm Demos',    href: '/usecase.html' },
];

function currentPageFile() {
  const path = window.location.pathname.split('/').filter(Boolean).pop() || 'index.html';
  // Lowercase normalize for case-insensitive hosts/filesystems (Linux
  // production deploys vs Windows dev where `Index.html` ≠ `index.html`).
  return path.toLowerCase();
}

function buildNav(isCompact) {
  const nav = document.createElement('nav');
  nav.className = 'bs-nav' + (isCompact ? ' bs-nav--compact' : '');

  const brand = document.createElement('a');
  brand.className = 'bs-nav__brand';
  brand.href = '/index.html';
  brand.textContent = 'MS';
  brand.title = 'Master Studio — home';
  nav.appendChild(brand);

  const links = document.createElement('div');
  links.className = 'bs-nav__links';
  const currentFile = currentPageFile();
  for (const item of NAV_LINKS) {
    const a = document.createElement('a');
    a.className = 'bs-nav__link';
    a.href = item.href;
    a.textContent = item.label;
    a.dataset.page = item.page;
    // Compare lowercase to tolerate case variation in pathname; treat the
    // document root `'/'` as `index.html` so the home link is highlighted
    // when serving from a static hosting root.
    const itemPage = item.page.toLowerCase();
    if (itemPage === currentFile || (currentFile === '' && itemPage === 'index.html')) {
      a.classList.add('is-current');
    }
    links.appendChild(a);
  }
  nav.appendChild(links);

  const action = document.createElement('a');
  action.className = 'bs-nav__action';
  action.href = '/pipeline.html';
  action.textContent = '⚡ Pipeline';
  action.title = 'Open the proximity-based node connection page';
  nav.appendChild(action);

  return nav;
}

function applyLayoutAdjustments(nav) {
  // body marker so the page-level CSS in brutalist.css lifts everything
  document.body.classList.add('has-bs-nav');
  if (nav.classList.contains('bs-nav--compact')) {
    document.body.classList.add('bs-nav-compact');
  }

  // Tailwind-flavored pages use `pt-16` on <main> to clear a fixed-top nav
  // (h-16 = 64px). Our nav is 56px (or 40px compact). Resize <main> to clear
  // the right amount so we don't get a dead 8/24px gap at the top.
  // Tailwind's pt-N === padding-top: N * 0.25rem; pt-16 === 64px.
  const navPx = nav.classList.contains('bs-nav--compact') ? 40 : 56;
  document.querySelectorAll('main[class*="pt-"]').forEach(el => {
    const classes = el.className.split(/\s+/);
    for (const c of classes) {
      const m = c.match(/^pt-(\d+)$/);
      if (m) {
        const rem = parseInt(m[1], 10) * 0.25;
        const ptPx = Math.round(rem * 16);
        if (ptPx > navPx) el.style.paddingTop = (ptPx - navPx) + 'px';
        else el.style.paddingTop = '0px';
      }
    }
  });

  // Hide any direct-child <nav> from body — Tailwind pages render their own
  // nav there and we want the shared one (just inserted at body[0]) to be
  // the only chrome. We do NOT hide unscoped <nav> deeper in the DOM (those
  // are sub-navs like the Brutalist "ADD PRIMITIVE" modal anchor, etc).
  document.querySelectorAll('body > nav').forEach(el => {
    el.style.display = 'none';
  });
}

function init() {
  if (document.body.querySelector(':scope > nav.bs-nav')) {
    // Idempotent — script can run more than once during HMR or double-attach.
    return;
  }
  const isCompact = document.body.classList.contains('bs-nav-compact-page');
  const nav = buildNav(isCompact);
  document.body.insertBefore(nav, document.body.firstChild);
  applyLayoutAdjustments(nav);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
