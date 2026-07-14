# UX Audit — Master Studio

## 0. Audit Closure Log

Resolutions applied incrementally. Each row cites the agent run that closed it.

| Date | Severity | Finding ref | Page | Fix |
|:--|:-:|:--|:--|:--|
| 2026-07-12 | 🟥 P0-7 / P0-8 / P0-9 | `node.html` carries Tailwind CDN + stale content-hashed `/assets/nodeArchitect-*.js` bundles + twin fixed `<nav>` that conflicts with `core/nav.js` | `node.html` | **Deleted `node.html`** + removed its `NAV_LINKS` entry from `core/nav.js`. Users go to `/nodearchitect.html` (already vite-registered, brutalist-clean, body id matches filename). The architect-orchestrator (`/core/nodes/architect-orchestrator.js`) now has a single import site. |
| 2026-07-12 | 🟥 P0-11 | `<body id="nodearchitect-page">` ↔ filename `node.html` mismatch | `node.html` ↔ `nodearchitect.html` | RESOLVED by the deletion. `nodearchitect.html` stands as the canonical file; body id, filename, and the brutalist.css §31 page-id scope all align. |
| 2026-07-12 | 🟦 P2-9 | `<html class="dark">` stale dark-mode stub | `node.html` | RESOLVED by the deletion. |
| 2026-07-13 | 🟦 P2 | Audit docs stale after `node.html` deletion — the audit itself listed stale refs that the closure did not auto-prune | `page.md`, `vite.config.js` | **A** — `vite.config.js` (the `input:` block, line ~141) still carries the multi-line comment "NOTE: do NOT register node.html here — it's a built dist artifact (its body hard-loads /assets/nodeArchitect-*.js bundles)…". Now that `node.html` is gone it describes a non-existent page. Rewrite to a single positive sentence covering the architect entry (`nodearchitect.html` / `nodeArchitect` bundle id / body id `nodearchitect-page`). **B** — §5.8 (the per-page findings block for `node.html`) AND §6 Prioritized Action Plan still enumerate findings against the deleted file: §5.8 keeps all 6 of the P0/P1 items it had at audit time, and §6 still lists `P0-7`, `P0-8`, `P0-9`, `P0-11`, `P2-9` as open even though every line traces back to §5.8 and every line is closed by the deletion. Prune §5.8 entirely (or convert it to a one-line "see Audit Closure Log" pointer), and prune the resolved rows from §6 so it mirrors §0. **C** — §8 roadmap item "Milestone 5 — node.html retirement" was logged as a future task but is now DONE; remove or relabel as a completed retrospective. |

**Audit closure**: `node.html` retired — one canonical file, no markup rewrite, zero new vite entries. Path A (delete + redirect) was chosen over Path B (re-register + re-import) because the alternative would have left two files doing the same thing in violation of the "no duplication" rule established in §9 of this audit.

> **Why one PR was enough**: the only source-side consumer of `/node.html` was this nav array (one line). After deletion, the architect-orchestrator is referenced from a single import site (the surviving `nodearchitect.html`), and any future user-visible change to the architect UX lives in one file.

---

**Generated**: 2026-07-12 (initial pass over 8 pages)
**Scope**: 8 HTML pages audited → 7 surviving pages after `node.html` retired on 2026-07-12 (see Audit Closure Log above). Surviving set: `index`, `main`, `scene`, `studio`, `nodearchitect`, `usecase`, `pipeline`.
**Method**: Read every page + `core/brutalist.css` + `core/nav.js` + `core/scene-utils.js`. Each finding cites the file + approximate line. Severity is graded against the rubric below, not against personal taste.

---

## 1. Severity Rubric

- **🟥 P0 — Critical / Active bug.** The user is blocked on first visit, the page won't load, or a primary action does the wrong thing. Fix before merging anything else.
- **🟧 P1 — Usability gap / severe inconsistency.** Workflow works but is confusing, requires workaround, or behaves differently from sibling pages. Fix in the same sprint.
- **🟦 P2 — Polish / tech-debt that bleeds into UX.** Visual irregularities, inline-style mutation where a class would do, miss-sized affordances. Opportunistic.

> Tech debt that doesn't affect the user (stale comments, dead `data-` attributes) is *not* P2 UX — it only counts when the user sees or feels it.

---

## 2. Audit Dimensions

Every finding below is tagged with one of these:

1. **Navigation & wayfinding** — Where am I? How do I get to the next module?
2. **Affordances & discoverability** — Is the clickable / draggable / executable surface obvious to a first-time user?
3. **Modal & popup behavior** — Focus, entrance animation re-fire, close affordances, ESC + click-outside.
4. **Empty & error states** — What does the page show when there's nothing to show? Is the destructive action gated?
5. **Visual hierarchy & alignment** — Spacing, z-indexing, type scaling. Does the brutalist palette stay consistent?
6. **Information architecture** — Where the Outliner / Properties / Tools live, and why.
7. **Cross-page consistency** — Shared components behave the same way regardless of URL.
8. **Performance / waste** — Wasted polling, idle timers, CSS that paints twice.

---

## 3. Cross-Cutting Patterns Matrix

A boolean view of which page carries which shared chrome. Empty cells are the audit's primary concern.

| Page | Top nav (.bs-nav) | Status bar (.bs-statusbar) | Gizmo toolbar (.bs-gizmo-toolbar) | Outliner (rows) | Drop zone | Controls hint (.bs-controls-hint) | Viewport label | Modal open | Theme source |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `index.html` | ✅ injected | ❌ has own debug panel | ⚠️ embed in sidebar toolbar | ❌ none | ✅ | ⚠️ inline-styled | ❌ | ❌ | **own inline `<style>` (pre-migration)** |
| `main.html` | ✅ injected | ✅ | ✅ floating | ⚠️ 5 static rows | ✅ | ✅ | ✅ | textgen (hidden) | `/core/brutalist.css` |
| `scene.html` | ✅ injected | ✅ | ✅ floating | ⚠️ 5 static rows | ✅ | ✅ | ✅ | **textgen OPEN BY DEFAULT** | `/core/brutalist.css` |
| `studio.html` | ✅ injected | ✅ | ✅ floating | 🔁 dynamic refresh (800 ms) | ✅ | ✅ | ✅ | primitive-menu (hidden) | `/core/brutalist.css` |
| `nodearchitect.html` | ✅ injected | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ "stub" | architect (always open) | brutalist.css + `/core/ui/brutalist/brutalist.css` concern |
| `usecase.html` | ✅ injected | ❌ (elements absent — silent no-op) | ❌ | ⚠️ 6-UC tab list | ❌ | ❌ | 🔁 dynamic per UC | ❌ | `/core/brutalist.css` |
| `pipeline.html` | ✅ **compact** (40 px) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | help overlay (inline) | `/core/brutalist.css` + own scoped CSS |

**Legend**: ✅ implemented • ⚠️ partial / inconsistent • 🔁 animated/dynamic • ❌ missing.

This matrix alone flags audit-worthy behavior on **all 7 surviving pages** — each row has at least one ⚠️ or a missing feature that the others have. `node.html` was retired on 2026-07-12 (see Audit Closure Log) and is therefore not represented here.

---

## 4. Existing UX Wins (preserve these)

These patterns are working — capture them before any refactor so we don't regress them:

- **Non-blocking inline help overlay** (`pipeline.html`, `#help-overlay`) — click the `?` footer button to reveal an inline panel; click anywhere on the backdrop or hit the close button to dismiss. Replaces `alert()`.
- **Modal entry animation re-firing** (`main.html` / `scene.html` / `studio.html`) — `remove('is-enter') → requestAnimationFrame → add('is-enter')` lets the same modal open many times and animate each time. Worth keeping when scaling to more modals.
- **Hot-pin proximity feedback during drag** (`pipeline.html`) — pins glow green when compatible neighbours are in range. Confirms the connection will fire on release.
- **`is-fresh` flash on console line** (`usecase.html` / `.bs-console__line`) — new log entries fade from neon to transparent over 0.8 s. Quietly reliable eye catch.
- **Shared top-nav injector** (`core/nav.js`) — every page hits one consistent chrome (~50 lines), no duplication. Current-page highlighting by pathname works across case-variation file systems.
- **CSS tokens via `:root` custom properties** (`core/brutalist.css` section 1) — every page could lean on these. Right now only 7 of 8 do.

---

## 5. Per-Page Findings

> Format: **🟥/🟧/🟦 P-LEVEL — Dimension**: Observation. *Recommendation.*
> Each page is ordered most-impactful → least.

### 🟥 5.1 `index.html` — Node Editor (entry page)

This is the URL the user lands on by default. It has the most UX exposure AND the most stacked issues.

- **🟥 P0 — Visual hierarchy / cross-page consistency**: The page has its own 400-line inline `<style>` block (`<head>` lines 6–363) and **does not consume `/core/brutalist.css`**. Every other migrated page uses the shared skin; this one runs on the pre-migration brutalist theme. *Fix*: load `<link rel="stylesheet" href="/core/brutalist.css">` and trim the inline `<style>` to deltas only (palette tokens already exist there).
- **🟥 P0 — Navigation / layout overlap**: `/core/nav.js` (line ~110) injects a fixed 56 px `.bs-nav`, then `applyLayoutAdjustments()` reduces `padding-top` only on `<main class="pt-N">`. `index.html` has **no `<main>`** (`#app` is `<div>`), so the injected bar **covers the top 56 px of `#sidebar` and `#viewport`**. The user sees the sidebar-header clipped by the new bar. *Fix*: wrap `#app` in `<main class="bs-page">` (or add `class="bs-page"` to `#app`) and inject `padding-top: 56px` so the flex layout starts below the chrome.
- **🟥 P0 — Empty states / discoverability**: The inline module script at the bottom (line ~720) **pre-renders 4 demo node cards** (Cube, Cone, Sphere → Merge) into `#node-graph-area` and draws 3 SVG noodles. The comment says these are "purely visual" `data-demo` decorations that **aren't registered in `nodeGraph.activeGraph`**. A first-time visitor sees a working pipeline that doesn't actually run anything, and may believe the system already wired their graph. *Fix*: gate the demo on a `?demo=1` query param OR a per-session flag in `localStorage` (skip re-render if user added real nodes first).
- **🟧 P1 — Affordances**: Two adjacent import buttons labelled **📥 Import** and **📦 3D Model** open different file pickers (`#import-file-input` go Wasm formats vs. `#model-file-input` 3D models). A new user cannot disambiguate. *Fix*: collapse into one button labelled `📥 IMPORT FILE…` plus a tiny dropdown of formats, OR add a `title` / `aria-label` that names the formats accepted.
- **🟧 P1 — Information architecture**: The sidebar has 13 buttons in one `#toolbar` flex-wrap row: play, + cube, select-all, deselect, lasso, move, rotate, scale, import, 3D-model, Wasm, undo, redo, save, load, clear. Visual density is too high and the toolbar scrolls vertically on shorter screens. *Fix*: split into 3 logical rows — **VIEW** (select-all, deselect, lasso), **TRANSFORM** (move/rotate/scale), **FILE** (import/3D-model/Wasm) — and move Save/Load/Clear (currently in `#history-actions` underneath) back into the main toolbar with a `divider`.
- **🟧 P1 — Cross-page consistency**: G/R/S gizmo controls live as three buttons (`#btn-translate`, `#btn-rotate`, `#btn-scale`) inside the sidebar toolbar, **NOT** as a floating `.bs-gizmo-toolbar` in the viewport (which `main.html` / `scene.html` / `studio.html` all do). The Visual Editor click handlers in the migrated pages dispatch to `master-app` events; here they don't. *Fix*: lift the three buttons into a `.bs-gizmo-toolbar` anchored to viewport bottom-center, matching the sibling pages — and the keyboard shortcut `G`/`R`/`S` becomes discoverable in the controls-hint.
- **🟧 P1 — Visual hierarchy / cross-page consistency**: `#controls-hint` (line ~412) uses `style="position:absolute; ..."` inline. `main.html` / `scene.html` / `studio.html` use the shared `.bs-controls-hint` class (`core/brutalist.css` §19). *Fix*: drop the inline style and `class="bs-controls-hint"`.
- **🟧 P1 — Tech-debt that bugs the user**: `#history-actions` row (line ~430) has 5 buttons, each with **fully replicated inline styles** for `background/border/color/padding/font/box-shadow`. Switching to `.toolbar-btn` / `.bs-cta-secondary` / `.bs-cta-ghost` cuts ~250 lines of HTML and gives every button hover/active feedback automatically. *Fix*: class hoist.
- **🟦 P2 — Affordances**: Uses emoji-only icons (`▶ 🎯 ↔ ↻ ⤢ 📥 📦 🧪 ↶ ↷ 💾 📂 🗑`). The other 7 pages load Material Symbols (e.g. `pan_tool`, `open_with`, `add_box`). Mixing emoji vs Material Symbols across the app hurts visual cohesion. *Fix*: pick Material Symbols for everything that ships to the canvas-adjacent neighbours.
- **🟦 P2 — Information architecture**: `#gfx-resource-panel-container` table has **5 columns** (ID/TYPE/BYTES/LABEL/AGE); `main.html` / `scene.html` / `studio.html` have only **4** (no AGE). Same panel plugin should produce the same shape on every page. *Fix*: standardise on 4 or 5 — pick one and update brutalist.css + the consumers.
- **🟦 P2 — Performance / waste**: The `#state-debug-panel` is collapsed by default but the toggle targets `#state-debug-body` which contains a `<canvas id="water-debug-canvas">` that runs even when invisible (when WaterDebugOverlay plugin fires). Closing the panel should also stop the canvas draw loop.

### 🟧 5.2 `main.html` — Projects

- **🟧 P1 — Affordances**: The "**ADD NODE**" CTA (`#btn-add-node`, line ~140) carries `data-primitive="cube"` — it dispatches the *one* primitive into the scene. Compare: `studio.html`'s "ADD NODE" opens an 8-primitive modal. Same label, two behaviours. *Fix*: either rename to "+ CUBE" here, or hoist the modal pattern so "ADD NODE" always presents a choice.
- **🟧 P1 — Cross-page consistency**: Outliner (`#left-sidebar`, line ~113) has **5 hard-coded rows** that mirror `scene.html` and never update when the user adds a new object via the canvas (MasterApp's `addPrimitive` listener bypasses the static list). Compare: `studio.html`'s `refreshOutliner()` re-renders rows from `window.__masterScene.children` every 800 ms. *Fix*: move the outliner population into a shared `core/outliner.js` module driven by `scene.children`, capped with an "isManagedObject" filter (this is what core/scene-utils.js already counts — keep the two consumers consistent).
- **🟧 P1 — Modal behavior**: The browser paste-fonts row in the textgen-modal has only `space_grotesk` + `roboto_mono` (line ~80). The italic caveat says both fall back to helvetiker — then picking the second option has **no observable visual effect on the created text**, which makes the second button feel broken. *Fix*: visually indicate "currently rendering = helvetiker" when input ≠ helvetiker; OR drop the second button until the font ships.
- **🟦 P2 — Tech-debt (inline-style mutation)**: `paintSelectedFont()` mutates four inline `style.*` properties on each font button on every select (line ~290). Migrate to a single `.is-active` class on the buttons with a `.textgen-font.is-active` rule in `brutalist.css`.
- **🟦 P2 — Performance / waste**: `core/scene-utils.js` runs `setInterval(refreshCoords, 400)` + `setInterval(refreshObjCount, 800)` always — even when the user is on a modally-blocked scene. With #status-coords / #status-obj / #status-verts present, the intervals paint every cycle. *Fix*: pause the intervals while `document.visibilityState !== 'visible'` (Page Visibility API) so a backgrounded tab isn't producing DOM writes.

### 🟥 5.3 `scene.html` — Text Gen

- **🟥 P0 — Modal behavior / empty states**: `<div class="bs-modal" id="textgen-modal">` (line ~26) is **rendered without `[hidden]`** — it appears over the canvas on first paint. Users opening this URL expect to see their scene, not a generator prompt. *Fix*: add `hidden` to the element and have the left sidebar's "GENERATE 3D TEXT" button open it. The user gets one click, on-purpose, instead of a modal ambush.
- **🟧 P1 — Cross-page consistency / affordances**: This page is the only place where the modal opens by default. The two "GENERATE 3D TEXT" button copies differ in inline `[data-open-modal]` data attr here vs. `data-primitive="cube"` attribute semantics on `main.html`. Make the open-modal convention identical across pages.
- **🟧 P1 — Visual hierarchy**: With the modal covering 480 px at `top: 0` on a 768 px+ desktop, the underlying viewport is fully obscured. Even after closing, the user has no breadcrumb back to the modal. *Fix*: add a small `Was: 3D TEXT GENERATOR → `[↻ Reopen]` chip on the viewport-label after first dismiss.
- **🟦 P2 — Same as main.html**: outliner-static + paintSelectedFont inline mutator + version-tag drifting (`v4.2.0-LFG` here vs. `v4.2.0-alpha` on `index.html`).

### 🟥 5.4 `studio.html` — Brutalist Editor

- **🟥 P0 — Affordances / cross-page consistency**: Gizmo toolbar `btn-click` mapping (line ~270): `pan → 'resetView'`. Clicking PAN clicks on the floating toolbar triggers `window.dispatchEvent(new CustomEvent('resetView'))` — i.e. **the camera resets to the default frame**, not into pan mode. This is wrong; "Pan" should dispatch `gizmo:set:pan` or similar. *Fix*: map `pan` to the actual pan event, leave resetView to its own button or `HOME` keystroke.
- **🟧 P1 — Discoverability**: `SHIFT+A` opens the Primitive Menu (line ~255). `main.html` and `scene.html` don't carry this shortcut even though they have "ADD NODE" affordances — keyboard parity missing. *Fix*: extract the SHIFT+A handler into `core/scene-utils.js` so any page with an add-node affordance gets it for free; OR document the shortcut in `core/nav.js`'s status region.
- **🟧 P1 — Performance / leak risk**: `refreshOutliner()` (line ~285) is called via `setInterval(refreshOutliner, 800)`. Each tick wipes `list.children` and re-creates buttons, attaching a fresh click listener to each. The old listeners are GC'd by the **closure over `obj`** but every cycle resubscribes events — and the interval is never cleared. *Fix*: rely on `selection:changed` + `selection:add/remove` CustomEvents that MasterApp already emits; only re-render on real events, not 1.25 Hz polling.
- **🟦 P2 — Visual hierarchy**: `#water-debug-container` is `display:none` by default (line ~145). The toggle to show it lives in the WaterDebugOverlay plugin (out of this file). Without a visible affordance, a first-time user has no idea the feature exists. *Fix*: add a row to `.bs-aside-section` like `🌊 WATER REFLECTION` that lights up when the overlay mounts.

### 🟥 5.5 `nodearchitect.html` — Architect

- **🟥 P0 — Navigation**: `<body id="nodearchitect-page">` (line ~14) — but the FILE is `node.html`, not `node-architect.html`. Grepping for `#nodearchitect-page` (the `brutalist.css` §31 page-id override) only finds one site, which is by convention broken. *Fix*: rename the body ID to `node-page` to match the filename, OR rename the file to `nodearchitect.html` to match the body — pick one.
- **🟥 P0 — Empty states**: Both sidebars are stubs: aside has only "ALPHA BUILD / version + a paragraph that's actually a developer note"; the viewport has only `.bs-grid-bg` and a "stub — this page demos the modal" label (line ~85). No `renderCanvas`, no Three.js, no interaction. Visitors see a self-aware empty page. *Fix*: either ship the modal as the page (cleanly) — drop the stub viewport + aside — OR add a real minimal scene wire-up.
- **🟧 P1 — Information architecture**: The aside paragraph (`This page is a demo of the brutalist concern refactor…`) reads like engineering documentation. Users won't gain context from it. *Fix*: move the demo context to a `?` HELP button (the pattern exists in `pipeline.html`) and let the aside hold real chrome.
- **🟧 P1 — Performance / waste**: `core/scene-utils.js` runs FPS + status polling even though there is no `<canvas id="renderCanvas">` to drive a frame rate. The poller writes to DOM elements that don't exist (silent no-op via `?.`), but the timers still fire. *Fix*: gate the poller on `document.querySelector('#renderCanvas')` being present.
- **🟧 P1 — Visual hierarchy**: This page loads **two** brutalist CSS files — `/core/brutalist.css` (shared app skin) AND `/core/ui/brutalist/brutalist.css` (concern CSS). When a concern (signal-indicator, node-socket) styles itself, it may conflict with the shared skin (z-index, palette). *Fix*: scope the concern CSS to a wrapper (`#architect-frame .signal-indicator { … }`) so it can't leak.
- **🟦 P2 — Visual hierarchy**: No material-symbols icons in the modal; the modal copy is the only chrome the user sees on this page. Lots of white space inside the architect-modal — consider an alpha-build tag (the `.bs-modal__alpha-tag` pattern).

### 🟧 5.6 `usecase.html` — Wasm Demos

- **🟧 P1 — Affordances / discoverability**: Each tab name has a numeric prefix hard-coded into the label: "1. CSG BOOLEAN", "2. DECIMATE MESH", "3. BVH BOUNDS", "4. PHYSICS STEP", "5. POINT CLOUD", "6. CAD IMPORT" (line ~30). The position is already conveyed by vertical order; the prefix is redundant noise. *Fix*: drop the `1.`, `2.`, … prefix.
- **🟧 P1 — Empty states**: The console carries exactly one startup line — `// Awaiting Wasm modules + first operation…` — and **never updates until a UC is run** (line ~268). Users who don't click any RUN button think the page is frozen. *Fix*: when Wasm modules finish loading (`window.__wasmReady`), emit `console: rust loaded`, `console: go loaded` to keep the line alive.
- **🟧 P1 — Information architecture**: Every UC has a "WHAT THIS DOES" card with the SAME structure: 1-line description + 2-line code reference. Six copies of equivalent boilerplate make the page feel templated, not informative. *Fix*: pick **one** UC (e.g. CSG BOOLEAN) to show the long form, others show just the parameter controls + a 1-sentence summary.
- **🟦 P2 — Cross-page consistency**: The viewport-label dynamically reflects the active UC name (good) but there's no corresponding STATUS readout inside the viewport-label — `WORLD_COORDS`, `FPS`, etc. are absent, so `core/scene-utils.js`'s status interval is a silent no-op. *Fix*: copy the status-bar chrome from `main.html` (`.bs-statusbar` + `bs-statusbar-fps-chip`) to the bottom of `usecase.html`.

### 🟧 5.7 `pipeline.html` — Pipeline

- **🟥 P0 — Modal & popup behavior** (blocking dialog): `document.getElementById('btn-clear').addEventListener('click', () => { if (!confirm('Clear all nodes and wires?')) return; … })` (line ~310). Native `confirm()` blocks the main thread, looks jarring against the brutalist aesthetic, and is hostile on mobile / in iframes. *Fix*: replace with the inline help-overlay pattern the page already uses — an `.is-confirm-overlay` div with two CTAs.
- **🟧 P1 — Empty states / discoverability**: Four nodes are pre-seeded on every page load (line ~430: `addNode('Cube Source'); addNode('Cone Source'); addNode('Merge'); addNode('Render to Scene');`). First-time visitors see a graph that they didn't build. *Fix*: same query-param / localStorage gate as `index.html` — non-empty `__pipelineGraph` skips the seed.
- **🟧 P1 — Cross-page consistency**: The whole page uses its own scoped `#pipeline-page` layout (palette column / workspace / footer with absolute-positioned overlays) rather than the shared `bs-page` + `bs-aside` + `bs-statusbar` primitives. Reasonable for the proximity-wiring UX, but means the `bs-grid-bg` background / `bs-radial-bg` etc. are absent here — visual cohesion with the rest of the app is lost. *Fix*: keep the bespoke layout for the drag affordances but pull the footer into `.bs-statusbar` so the wire count + clear/reset/help/run lives in the shared chrome.
- **🟧 P1 — Information architecture**: "Connections (0)" appears AS A HEADER label in the sidebar AND as "Wires: 0 active" in the bottom footer. Same concept, two visual styles, two locations. *Fix*: keep "Connections" list (interactive rows + delete button) in the sidebar; replace the footer's "Wires" with the runtime emit / receive badge only.
- **🟦 P2 — Affordances**: `.palette-item` (line ~62) declares `cursor: grab` but the only interaction is `click` on `addEventListener('click', ...)`. `cursor: grab` advertises drag-to-place, which doesn't exist. *Fix*: change to `cursor: pointer`, OR implement drag-to-place and dispatch the full palette taxonomy.
- **🟦 P2 — Tech-debt (inline-style)**: On RUN, `wire.style.transform = 'scale(1.4)'` + reset (line ~380). Same class-toggle pattern would suffice — `.bs-wires-count.is-flash { transform: scale(1.4); }`.

### 🟥 5.8 `node.html` — Architect 2 (legacy bundle)

- **🟥 P0 — Cross-page consistency**: Loads `<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>` (line ~9). Every other page in the repo dropped Tailwind during the 5-page migration in a prior round. Tailwind CDN fires on every visit, downloads ~90 KB of JS, and bypasses the shared brutalist palette via utility classes. *Fix*: remove the CDN link and rip all `class="flex flex-1 pt-16 overflow-hidden"`-style Tailwind chains; convert to `.bs-body-shell` + `.bs-page` etc.
- **🟥 P0 — Navigation / orphan code**: vite.config.js explicitly lists 7 multi-page entries (line ~95: `main/studio/scene/mainScene/nodeArchitect/usecase/pipeline`) — **node.html is NOT registered** because vite describes it as "a built dist artifact…its body hard-loads /assets/nodeArchitect-*.js bundles." Yet this file ships at project root and is reachable by URL. *Fix*: either register it in vite.config.js (and let Vite rebuild the assets) or stop serving the stale artifact — pick one.
- **🟥 P0 — Navigation conflict**: Has its own fixed `<nav class="fixed top-0 w-full z-40 …" id="MEME STUDIO">` (line ~52). `core/nav.js` injects `.bs-nav` BOTH above this nav and then hides `body > nav` via `el.style.display = 'none'`. So MEME STUDIO briefly flashes before being hidden — and when the user looks at DevTools, two navs exist. *Fix*: delete this `<nav>`. nav.js' injected bar already carries the brand.
- **🟥 P0 — Visual hierarchy**: `<body class="bg-surface text-on-surface …">` Tailwind classes assume a Tailwind runtime. Without the CDN link the page would be unstyled. *Fix*: replace Tailwind classes with `.bs-body-shell` and equivalences.
- **🟥 P0 — Stale asset references**: `nodeArchitect-ijP3goru.js` etc. — these are content-hashed filenames. They will not exist after a rebuild. *Fix*: drop the hard-coded asset paths and re-wire to vite-register the page; OR re-import the architect-orchestrator source directly as a module.
- **🟧 P1 — Stale build artifacts in markup**: `<html class="dark">` (line ~3) — leftover from a "dark mode" stub that no longer applies. *Fix*: drop `class="dark"`.
- **🟦 P2 — Cross-page consistency**: Architect modal uses raw Tailwind classes (`max-w-5xl`, `bg-surface-container-lowest`, `shadow-[0_0_40px_rgba(2,230,0,0.1)]`) instead of `.bs-modal` + `.bs-modal__panel--lg`. The brutalist.css entry-animation re-fire pattern won't apply. *This is the architect-modal that `#nodearchitect-page` was scoped for in brutalist.css — fix both pages together.*

---

## 6. Prioritized Action Plan

### 🟥 P0 — fix first, single PR

| # | File | Issue | Fix outline |
|:-:|:-:|:--|:--|
| P0-1 | `index.html` | Top-nav clips top 56 px of viewport/sidebar | add `class="bs-body-shell"` to `<body>` + wrap `#app` in `<main class="bs-page">` so nav.js's `has-bs-nav` body class + `padding-top: 56px` correctly clears the chrome (or pad `#app` directly) |
| P0-2 | `index.html` | Own 400-line inline `<style>` instead of shared skin | load `/core/brutalist.css` and remove token duplication |
| P0-3 | `index.html` | Pre-loaded demo cards masquerade as user data | gate on `?demo=1` / `localStorage.__sawDemo` so return visitors don't see fake pipelines |
| P0-4 | `scene.html` | textgen-modal blocks viewport on first paint | add `hidden` to `<div class="bs-modal" id="textgen-modal">`; rely on sidebar button to open |
| P0-5 | `studio.html` | Gizmo toolbar `pan → 'resetView'` misroutes | map `pan` to `gizmo:set:pan`; bind `resetView` to a `HOME` key or a different explicit button |
| P0-6 | `pipeline.html` | Blocking `confirm()` on Clear Canvas | swap for the inline help-overlay pattern (#help-overlay div with Cancel + Clear CTAs) |
| P0-7 | `node.html` | Tailwind CDN still loaded | drop the script tag; port markup to `.bs-*` |
| P0-8 | `node.html` | Stale hard-coded `/assets/nodeArchitect-*.js` bundles | Either re-register in `vite.config.js` so vite emits fresh hashes, or remove the page entirely and route users to `nodearchitect.html` |
| P0-9 | `node.html` | Twin `<nav>` conflict with shared nav.js | delete the inline `<nav>`; rely on `.bs-nav` from `core/nav.js` |
| P0-10 | `nodearchitect.html` | Stub aside + empty viewport expose the page as a demo for the developer, not the user | either ship the modal full-bleed (drop the stub chrome) OR add minimal Three.js wire-up |
| P0-11 | `nodearchitect.html` | `<body id="nodearchitect-page">` doesn't match filename `node.html` | rename body ID to `node-page`, OR rename `node.html` → `nodearchitect.html` |

### 🟧 P1 — same sprint

| # | File | Issue | Fix outline |
|:-:|:-:|:--|:--|
| P1-1 | `index.html` | Two adjacent import buttons with differing accept lists | collapse to one button + format dropdown OR keep two with explicit `(.)LAS/(.)STEP` `title` attributes |
| P1-2 | `index.html` | 13-button sidebar toolbar | split into VIEW / TRANSFORM / FILE rows; move Save/Load/Clear back into the main toolbar with a divider |
| P1-3 | `index.html` | Gizmo buttons live in sidebar | lift to floating `.bs-gizmo-toolbar` in viewport |
| P1-4 | `index.html` | `#controls-hint` uses inline `style=` | drop inline, apply `class="bs-controls-hint"` from brutalist.css §19 |
| P1-5 | `index.html` | `#history-actions` row of inline-styled buttons | class-hoist to `.toolbar-btn` / `.bs-cta-secondary` |
| P1-6 | `main.html` + `scene.html` | Static 5-row outliner never updates from scene | extract a `core/outliner.js` listener driven by `selection:changed` + scene mutations |
| P1-7 | `main.html` + `scene.html` | `ADD NODE` semantics diverge vs `studio.html` | either rename to `+ CUBE` everywhere OR move the primitive-menu modal pattern to all three |
| P1-8 | `scene.html` | textgen-modal opens BY DEFAULT | already covered by P0-4 — but on success, dismiss should leave a visible re-open affordance |
| P1-9 | `main.html` | textgen `roboto_mono` button has no observable effect | visualize "rendered = helvetiker" indicator when input ≠ chosen font, OR drop button until font ships |
| P1-10 | `studio.html` | `SHIFT+A` shortcut missing on sibling pages | lift to `core/scene-utils.js` so any page with add-node gets it |
| P1-11 | `studio.html` | `setInterval(refreshOutliner, 800)` re-attaches listeners | re-render only on `selection:changed` events |
| P1-12 | `usecase.html` | Numeric prefixes in tab labels | drop prefix |
| P1-13 | `usecase.html` | Console single stale line | emit `console: rust loaded`, `console: go loaded` on `__wasmReady` |
| P1-14 | `usecase.html` | 6-fold "WHAT THIS DOES" boilerplate | pick one (CSG) for long-form, others 1-sentence summary |
| P1-15 | `pipeline.html` | Pre-seeded 4-node starter pipeline | gate on `?demo=1` / localStorage |
| P1-16 | `pipeline.html` | Custom scoped layout, missing `bs-statusbar`, missing `bs-radial-bg` | refactor pre-seeded footer into `.bs-statusbar`; keep the bespoke drag UX for the workspace |
| P1-17 | `pipeline.html` | "Connections (0)" sidebar label + "Wires: 0 active" footer duplicate | keep list in sidebar; replace footer's count with event-stream badge only |
| P1-18 | `nodearchitect.html` | Aside paragraph is engineering doc-noise | move to a `?` HELP button (pattern already used on pipeline.html) |
| P1-19 | `nodearchitect.html` | WaterDebugOverlay + scene-utils page leaks (intervals on an empty canvas) | gate scene-utils on `querySelector('#renderCanvas')`; gate overlay only when scene has a water mesh |
| P1-20 | `nodearchitect.html` | Two brutalist CSS files fight on z-index / palette | scope concern CSS under `#architect-frame` |

### 🟦 P2 — opportunistic polish

| # | File | Issue | Fix outline |
|:-:|:-:|:--|:--|
| P2-1 | `index.html` | Emoji-only buttons; rest of app uses Material Symbols | convert all to `<span class="material-symbols-outlined">` |
| P2-2 | all GFX panels | Inconsistent column counts (4 vs 5) | pick 4 or 5, standardise the table |
| P2-3 | `index.html` | `#state-debug-panel` keeps water debug canvas drawing | stop draw loop when panel collapses |
| P2-4 | `main.html`, `scene.html` | `paintSelectedFont` inline-style mutator | migrate to `.is-active` class toggle |
| P2-5 | `main.html`, etc. | `core/scene-utils.js` keeps polling while backgrounded | pause intervals via `document.visibilityState` |
| P2-6 | `pipeline.html` | `palette-item` advertises `cursor: grab` | switch to `pointer` OR ship drag-to-place |
| P2-7 | `pipeline.html` | RUN wire scale flash is inline-style mutator | migrate to `.is-flash` class |
| P2-8 | `index.html` vs others | version strings drift (`-alpha` vs `-LFG`) | one source of truth — read from `package.json` at build |
| P2-9 | `node.html` | `<html class="dark">` stale | drop class |
| P2-10 | `nodearchitect.html` | Modal lacks an alpha-build tag (the `.bs-modal__alpha-tag` pattern) | add it so this page is recognisable as alpha |

---

## 7. Quick Wins (15-minute fixes, big visible impact)

1. `scene.html` — add `hidden` to `#textgen-modal` (P0, 30 s).
2. `studio.html` — fix gizmo `pan → 'resetView'` mapping (P0, 5 min).
3. `index.html` — wrap #app in `<main class="bs-page">` (P0, 1 min).
4. `pipeline.html` — replace `confirm()` with the inline overlay (P0, 10 min).
5. `usecase.html` — drop `1.`, `2.`, … `6.` prefix from tab labels (P2, 1 min).
6. `index.html` — `#controls-hint` → `class="bs-controls-hint"` (P1, 1 min).

That's 30 minutes of work for a measurable improvement on every page that matters most to first-time visitors.

---

## 8. Suggested UX Roadmap (sequenced)

1. **Milestone 1 — Surgical P0 sweep**: P0-1 through P0-11. One PR, do not change UX polish; just unblock the entry paths.
2. **Milestone 2 — Sidebar consolidation**: P1-2, P1-3, P1-4, P1-5, P1-6, P1-7, P1-20. Pull the scattered chrome into shared `.bs-*` classes. After this, 6 of 8 pages have a near-identical chrome.
3. **Milestone 3 — Inline dialogs to overlays**: P0-6, P1-17. Replace the native `confirm()` and the "Connections / Wires" duplicate.
4. **Milestone 4 — Onboarding signals**: P0-3, P1-15, P1-13. Visitors see only what they build (gated demo), the console stays alive, the pipeline starts empty.
5. **Milestone 5 — node.html retirement**: P0-7, P0-8, P0-9. Either ship a Vite-registered version OR delete the file and reroute to `nodearchitect.html`.
6. **Milestone 6 — Polish**: P2-1 through P2-10. Visual cohesion pass once the major flows stop diverging.

After milestone 2 the audit's "cross-page consistency" dimension drops from "every row has ⚠️/❌" to mostly ✅, and we can rerun the audit to find the next layer of issues (probably focus / tab order / colour contrast — none of which are visible in a code-only review).

---

## 9. Appendix — Recurring anti-patterns to retire

These appear 2+ times across the audit. Worth a project-level "don't do this" rule:

- **Inline `style="..."` on interactive elements**: prefer a class from `core/brutalist.css`. The class survives theme changes, the inline style doesn't.
- **Native `confirm()` / `alert()`**: use the brutalist overlay pattern (see `pipeline.html #help-overlay` for the canonical implementation).
- **Hard-coded demo data on page load**: gate on a `?demo=…` query and/or `localStorage` flag, never gratuitously seed the state for everyone.
- **Pre-populated static outliner rows**: drive from the scene graph, not from copy-pasted markup.
- **Mixed emoji + Material Symbols icons**: pick one consistent set.
- **Page-specific CSS that duplicates a shared CSS rule**: extend `core/brutalist.css` instead.
- **Two destructive buttons in adjacent slots**: never duplicate an Import / Save / Clear button without a clear domain split.

These rules alone would have prevented roughly half the findings in this audit.
