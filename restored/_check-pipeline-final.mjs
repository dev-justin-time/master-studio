
    /**
     * pipeline.html — full-screen proximity-wiring node connection page.
     *
     * Responsibilities:
     *   1. Render the palette + workspace + connections list using the brutalist
     *      shared skin (core/brutalist.css).
     *   2. Allow the user to click a palette item to drop a new node card
     *      onto the workspace (auto-arranged when > 6 cards exist).
     *   3. Allow dragging cards by their .node-header.
     *   4. While dragging, recompute per-frame the closest compatible
     *      output→input pin pair across the workspace and:
     *        - Draw a live temp cable (high z-index) if within 80px.
     *        - Light up the involved pins as `.is-hot` for visual confirmation.
     *   5. On mouseup within range, persist the closest pair as a permanent
     *      wire in the connections list + render it in the SVG noodle-layer.
     *   6. Provide RUN PIPELINE: dispatches `pipeline:run` CustomEvent with
     *      `{nodes: [...], edges: [...]}` payload (topological-friendly),
     *      capturing current graph state for downstream scene tooling.
     */

    import { createNodeCard } from '/plugins/NodeFactory.js';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const PROX_NEAR = 60;   // px — "hot" highlight + green snap
    const PROX_FAR  = 80;   // px — temp cable still drawn
    const EDGE_GAP  = 4;    // px — minimum gap to draw

    // ─── Palette: node taxonomy ────────────────────────────────────────────────
    const PALETTE = [
      { type: 'Cube Source',    kind: 'src',  inputs: [],                  outputs: ['Mesh'] },
      { type: 'Cone Source',    kind: 'src',  inputs: [],                  outputs: ['Mesh'] },
      { type: 'Sphere Source',  kind: 'src',  inputs: [],                  outputs: ['Mesh'] },
      { type: 'Decimate',       kind: 'proc', inputs: ['Mesh'],            outputs: ['Mesh'] },
      { type: 'Merge',          kind: 'proc', inputs: ['Mesh','Mesh'],     outputs: ['Scene'] },
      { type: 'Render to Scene',kind: 'sink', inputs: ['Scene'],           outputs: [] },
    ];

    const PALETTE_BY_TYPE = Object.fromEntries(PALETTE.map(p => [p.type, p]));

    // ─── Palette DOM ───────────────────────────────────────────────────────────
    const paletteList = document.getElementById('palette-list');
    for (const def of PALETTE) {
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.dataset.type = def.type;
      item.tabIndex = 0;
      item.innerHTML = `<span class="lbl">+ ${def.type}</span><span class="kind ${def.kind}">${def.kind}</span>`;
      item.addEventListener('click', () => addNode(def.type));
      paletteList.appendChild(item);
    }

    // ─── Workspace + helpers ───────────────────────────────────────────────────
    const workspace    = document.getElementById('pipeline-workspace');
    const cardsHost    = document.getElementById('cards-host');
    const permLayer    = workspace.querySelector('.noodle-layer');
    const tempLayer    = workspace.querySelector('.temp-layer');

    /** @type {Map<string, {card: HTMLElement, def: object}>} */
    const nodes = new Map();
    /** @type {Array<{edgeId: string, sourceId: string, sourceOutputIdx: number, targetId: string, targetInputIdx: number}>} */
    const edges = [];

    let nextCardX = 60, nextCardY = 60;
    let dragging = null;   // {card, def, offsetX, offsetY, nodesByIdSnapshot}

    function uuid() {
      return crypto.randomUUID ? crypto.randomUUID() : `n-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    }

    function placeNodeAtFreeSpot(card, def) {
      // Simple auto-arrange: if default would overlap an existing card, offset.
      const rect = card.getBoundingClientRect();
      const w = rect.width  || 240;
      const h = rect.height || 200;
      let x = nextCardX, y = nextCardY;
      while ([...nodes.values()].some(other => {
        const o = other.card.getBoundingClientRect();
        return !(other.card === card) &&
          Math.abs((o.left + o.width/2)  - (workspace.getBoundingClientRect().left + x + w/2))  < w &&
          Math.abs((o.top  + o.height/2) - (workspace.getBoundingClientRect().top  + y + h/2))  < h;
      })) {
        x += 32; y += 32;
      }
      card.style.left = x + 'px';
      card.style.top  = y + 'px';
      nextCardX += 32; nextCardY += 32;
      if (nextCardX > 600) { nextCardX = 60; nextCardY = 60; }
    }

    function addNode(type) {
      const def = PALETTE_BY_TYPE[type];
      if (!def) return;
      const card = createNodeCard(nextCardX, nextCardY, def.type, def.inputs, def.outputs);
      card.id = `card-${uuid()}`;
      card.style.position = 'absolute';
      card.style.minWidth = '180px';
      // ID container for the runner payload
      const idTag = document.createElement('div');
      idTag.style.cssText = 'padding:4px 8px;font-size:9px;color:var(--on-surface-variant);border-top:1px solid var(--outline-variant);font-family:"Space Grotesk",monospace;text-transform:uppercase;letter-spacing:0.05em;';
      idTag.textContent = `NodeID: ${card.id.slice(0,8)}\u2026`;
      card.appendChild(idTag);

      cardsHost.appendChild(card);
      placeNodeAtFreeSpot(card, def);
      nodes.set(card.id, { card, def });

      // Repaint noodle layer
      redrawPermanentWires();
      autoRemoveEmptyHint();
    }

    function autoRemoveEmptyHint() {
      if (cardsHost.children.length > 0) {
        workspace.classList.remove('no-cards');
      } else {
        workspace.classList.add('no-cards');
      }
    }

    function clearAllHot() {
      workspace.querySelectorAll('.pin-dot.is-hot').forEach(el => el.classList.remove('is-hot'));
    }

    // ─── Pin distance math ─────────────────────────────────────────────────────
    function pinCenter(pin, rectOfWorkspace) {
      const r = pin.getBoundingClientRect();
      return {
        cx:    r.left + r.width  / 2 - rectOfWorkspace.left,
        cy:    r.top  + r.height / 2 - rectOfWorkspace.top,
        right: r.right - rectOfWorkspace.left,
        left:  r.left  - rectOfWorkspace.left,
      };
    }

    /**
     * Returns { bestPair: {srcCardId, srcOutIdx, tgtCardId, tgtInIdx, distance}
     *         , allInRange: number }
     */
    function findProximityToCards(draggedCardId) {
      const all = [...nodes.entries()];
      const others = all.filter(([id]) => id !== draggedCardId);
      if (!others.length) return { bestPair: null, allInRange: 0 };

      const src = nodes.get(draggedCardId);
      const wsR = workspace.getBoundingClientRect();
      const srcOutputs = src.card.querySelectorAll('.node-outputs .pin-dot');
      let bestPair = null;
      let inRange = 0;
      const pairsClosest = []; // collect for highlight + cable

      for (const outIdxEl of [...srcOutputs].entries()) {
        const [outIdx, outPin] = outIdxEl;
        const oCenter = pinCenter(outPin, wsR);
        for (const [tgtId, tgt] of others) {
          const tgtInputs = tgt.card.querySelectorAll('.node-inputs .pin-dot');
          for (const [inIdx, inPin] of [...tgtInputs].entries()) {
            const iCenter = pinCenter(inPin, wsR);
            const dx = oCenter.cx - iCenter.cx;
            const dy = oCenter.cy - iCenter.cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < PROX_FAR) {
              inRange++;
              pairsClosest.push({ outPin, inPin, dist, tgtId, tgtCard: tgt.card, tgtInIdx: inIdx, srcOutIdx: outIdx });
              if (!bestPair || dist < bestPair.dist) {
                bestPair = { outPin, inPin, dist, tgtId, tgtInIdx: inIdx, srcOutIdx: outIdx };
              }
            }
          }
        }
      }
      return { bestPair, allInRange: inRange, candidates: pairsClosest };
    }

    // ─── Cable drawing ─────────────────────────────────────────────────────────
    function cablePath(x1, y1, x2, y2) {
      const dx = Math.max(EDGE_GAP * 2, Math.min(60, (x2 - x1) / 2));
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }

    function svgPath(layer, x1, y1, x2, y2, className, stroke, opacity, dash) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('class', className);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', stroke);
      p.setAttribute('stroke-width', '2');
      if (opacity != null) p.setAttribute('opacity', String(opacity));
      if (dash) p.setAttribute('stroke-dasharray', dash);
      p.setAttribute('d', cablePath(x1, y1, x2, y2));
      layer.appendChild(p);
      return p;
    }

    function drawTempWireForPair(srcCard, srcOutIdx, tgtCard, tgtInIdx) {
      const wsR = workspace.getBoundingClientRect();
      const srcOutPin = srcCard.querySelectorAll('.node-outputs .pin-dot')[srcOutIdx];
      const tgtInPin  = tgtCard.querySelectorAll('.node-inputs .pin-dot')[tgtInIdx];
      if (!srcOutPin || !tgtInPin) return;
      const s = pinCenter(srcOutPin, wsR);
      const t = pinCenter(tgtInPin,  wsR);
      tempLayer.innerHTML = '';   // single cable at a time
      svgPath(tempLayer, s.right, s.cy, t.left, t.cy, 'noodle-path', '#02e600', 0.9, '6 4');
    }

    function clearTempWires() {
      tempLayer.innerHTML = '';
    }

    /**
     * For every currently-persisted edge ({id, sourceId, sourceOutputIdx,
     * targetId, targetInputIdx}), draw a permanent bezier in the .noodle-layer.
     * Called on every mutation of `edges` or node positions.
     */
    function redrawPermanentWires() {
      permLayer.innerHTML = '';
      const wsR = workspace.getBoundingClientRect();
      for (const edge of edges) {
        const src = nodes.get(edge.sourceId);
        const tgt = nodes.get(edge.targetId);
        if (!src?.card || !tgt?.card) continue;
        const outPin = src.card.querySelectorAll('.node-outputs .pin-dot')[edge.sourceOutputIdx];
        const inPin  = tgt.card.querySelectorAll('.node-inputs  .pin-dot')[edge.targetInputIdx];
        if (!outPin || !inPin) continue;
        const s = pinCenter(outPin, wsR);
        const t = pinCenter(inPin,  wsR);
        svgPath(permLayer, s.right, s.cy, t.left, t.cy, 'noodle-path', '#02e600', 0.6, null);
      }
    }

    // ─── Connections list UI ───────────────────────────────────────────────────
    const connList = document.getElementById('connections-list');
    function refreshConnectionsList() {
      connList.innerHTML = '';
      if (!edges.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No connections yet. Drag two nodes close.';
        connList.appendChild(li);
      } else {
        for (const edge of edges) {
          const src = nodes.get(edge.sourceId);
          const tgt = nodes.get(edge.targetId);
          const li = document.createElement('li');
          const outLabel = src.def.outputs[edge.sourceOutputIdx] || '?';
          const inLabel  = tgt.def.inputs[edge.targetInputIdx]  || '?';
          li.innerHTML = `
            <span><strong>${src.def.type}</strong>.<span style="color:var(--secondary-neon)">${outLabel}</span><span class="arrow">→</span><strong>${tgt.def.type}</strong>.<span style="color:var(--primary-neon)">${inLabel}</span></span>
            <button type="button" title="Disconnect" data-edgeid="${edge.edgeId}">×</button>
          `;
          li.querySelector('button').addEventListener('click', () => removeEdge(edge.edgeId));
          connList.appendChild(li);
        }
      }
      const n = edges.length;
      const wire = document.querySelector('#wire-count .n');
      if (wire) wire.textContent = String(n);
      const mini = document.getElementById('wire-count-mini');
      if (mini) mini.textContent = `(${n})`;
    }

    function removeEdge(edgeId) {
      const idx = edges.findIndex(e => e.edgeId === edgeId);
      if (idx === -1) return;
      edges.splice(idx, 1);
      redrawPermanentWires();
      refreshConnectionsList();
    }

    function findEdgeIntoInput(targetId, targetInputIdx) {
      // Input slots are exclusive — at most one wire per input. We match
      // ONLY on the (target, targetInput) pair so dragging a second source
      // onto the same pin correctly refuses to add a duplicate.
      return edges.find(e => e.targetId === targetId && e.targetInputIdx === targetInputIdx);
    }

    function addEdge(sourceId, sourceOutputIdx, targetId, targetInputIdx) {
      if (findEdgeIntoInput(targetId, targetInputIdx)) return;
      edges.push({
        edgeId: `e-${uuid()}`,
        sourceId, sourceOutputIdx,
        targetId, targetInputIdx,
      });
      redrawPermanentWires();
      refreshConnectionsList();
    }

    // ─── Drag handling ─────────────────────────────────────────────────────────
    workspace.addEventListener('mousedown', (e) => {
      const header = e.target.closest('.node-header');
      if (!header) return;
      const card = header.closest('.node-card, .shader-node');
      if (!card || !nodes.has(card.id)) return;
      e.preventDefault();
      const rectCard = card.getBoundingClientRect();
      dragging = {
        card,
        def: nodes.get(card.id).def,
        offsetX: e.clientX - rectCard.left,
        offsetY: e.clientY - rectCard.top,
      };
      card.style.zIndex = 999;
      drawTempCables();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const wsR = workspace.getBoundingClientRect();
      const x = Math.max(0, Math.min(wsR.width  - 40, e.clientX - wsR.left - dragging.offsetX));
      const y = Math.max(0, Math.min(wsR.height - 40, e.clientY - wsR.top  - dragging.offsetY));
      dragging.card.style.left = x + 'px';
      dragging.card.style.top  = y + 'px';
      drawTempCables();
    });

    document.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      const { card, def, offsetX, offsetY } = dragging;
      card.style.zIndex = '';     // drop back to idle layer

      // Final position
      const wsR = workspace.getBoundingClientRect();
      const x = Math.max(0, Math.min(wsR.width  - 40, e.clientX - wsR.left - offsetX));
      const y = Math.max(0, Math.min(wsR.height - 40, e.clientY - wsR.top  - offsetY));
      card.style.left = x + 'px';
      card.style.top  = y + 'px';

      const { bestPair } = findProximityToCards(card.id);
      if (bestPair && bestPair.dist < PROX_FAR) {
        addEdge(card.id, bestPair.srcOutIdx, bestPair.tgtId, bestPair.tgtInIdx);
      }
      clearTempWires();
      clearAllHot();
      dragging = null;
    });

    function drawTempCables() {
      if (!dragging) { clearTempWires(); clearAllHot(); return; }
      const { bestPair, candidates } = findProximityToCards(dragging.card.id);
      clearAllHot();
      if (!candidates || candidates.length === 0) { clearTempWires(); return; }
      // Light up each pin that has at least one neighbour in range
      for (const c of candidates) { c.outPin.classList.add('is-hot'); c.inPin.classList.add('is-hot'); }
      if (bestPair) {
        drawTempWireForPair(dragging.card, bestPair.srcOutIdx, candidates.find(x => x.dist === bestPair.dist).tgtCard, bestPair.tgtInIdx);
      }
    }

    // ─── Toolbar buttons ──────────────────────────────────────────────────────
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (!nodes.size) return;
      if (!confirm('Clear all nodes and wires?')) return;
      cardsHost.innerHTML = '';
      nodes.clear();
      edges.length = 0;
      permLayer.innerHTML = '';
      tempLayer.innerHTML = '';
      refreshConnectionsList();
      autoRemoveEmptyHint();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      edges.length = 0;
      permLayer.innerHTML = '';
      refreshConnectionsList();
    });

    // Inline help panel — overlay shown/hidden on the help-button click.
    // We avoid `alert()` because it blocks the main thread and is hostile on mobile.
    const helpOverlay = document.createElement('div');
    helpOverlay.id = 'help-overlay';
    helpOverlay.style.cssText = [
      'position:absolute','inset:0','display:none','align-items:center','justify-content:center',
      'background:rgba(2,230,0,0.06)','z-index:50','padding:24px','pointer-events:auto',
    ].join(';');
    helpOverlay.innerHTML = `
      <div style="max-width:520px;background:var(--surface-container);border:2px solid var(--primary-neon);box-shadow:8px 8px 0 0 var(--border);padding:20px 24px;font-family:'Space Grotesk',monospace;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="color:var(--secondary-neon);font-size:12px;letter-spacing:0.05em;text-transform:uppercase;font-weight:700;">PIPELINE — PROXIMITY NODE WIRING</h2>
          <button id=\"help-close\" type=\"button\" style=\"background:transparent;border:2px solid var(--error-neon);color:var(--error-neon);width:24px;height:24px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px;\">×</button>
        </div>
        <ul style=\"font-size:11px;color:var(--on-surface);line-height:1.7;list-style:none;padding:0;\">
          <li>• Click a palette item to drop a node card.</li>
          <li>• Drag the card by its header bar.</li>
          <li>• Move an <span style=\"color:var(--secondary-neon)\">output pin</span> of one card within <b>80px</b> of an <span style=\"color:var(--primary-neon)\">input pin</span> of another — the closest pair auto-wires on release.</li>
          <li>• Click × in the Connections list to disconnect.</li>
          <li>• Hit <b>RUN PIPELINE</b> to dispatch a <code>pipeline:run</code> CustomEvent with the current graph.</li>
          <li>• Input slots are exclusive — only one wire per input pin.</li>
        </ul>
      </div>
    `;
    workspace.appendChild(helpOverlay);
    helpOverlay.querySelector('#help-close').addEventListener('click', () => { helpOverlay.style.display = 'none'; });
    helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) helpOverlay.style.display = 'none'; });
    document.getElementById('btn-help').addEventListener('click', () => { helpOverlay.style.display = 'flex'; });

    document.getElementById('btn-run').addEventListener('click', () => {
      // Build the dispatch payload. We resolve pin labels (not just indices)
      // so downstream scene tooling can read `edge.sourceOutput` /
      // `edge.targetInput` directly without re-looking-up nodes by id.
      const detail = {
        nodes: [...nodes.entries()].map(([id, { def }]) => ({
          id, type: def.type, kind: def.kind, inputs: def.inputs, outputs: def.outputs,
        })),
        edges: edges.map(e => {
          const s = nodes.get(e.sourceId);
          const t = nodes.get(e.targetId);
          return {
            edgeId: e.edgeId,
            sourceId:     e.sourceId,
            sourceOutput: s?.def.outputs[e.sourceOutputIdx] || `#${e.sourceOutputIdx}`,
            sourceOutputIdx: e.sourceOutputIdx,
            targetId:     e.targetId,
            targetInput:  t?.def.inputs[e.targetInputIdx]   || `#${e.targetInputIdx}`,
            targetInputIdx:  e.targetInputIdx,
          };
        }),
      };
      const evt = new CustomEvent('pipeline:run', { detail });
      window.dispatchEvent(evt);
      // Stash the latest graph on window so plugins that boot AFTER the
      // pipeline page can read state without a live listener (brute force
      // backward-compat path; live addEventListener is preferred).
      window.__pipelineGraph = detail;
      // Visual confirmation: pulse the wire icon briefly
      const wire = document.querySelector('#wire-count .n');
      wire.style.transition = 'transform 0.2s';
      wire.style.transform = 'scale(1.4)';
      wire.style.color = 'var(--secondary-neon)';
      setTimeout(() => { wire.style.transform = ''; wire.style.color = ''; }, 220);
      console.log('[Pipeline] dispatched pipeline:run', detail);
    });

    // No local diagnostic listener — the click handler above already dumps
    // the full payload via console.log. Plugins that want to react live
    // should addEventListener('pipeline:run', ...) on window themselves.

    // ─── Lifecycle ─────────────────────────────────────────────────────────────
    // Re-render permanent wires whenever the window resizes (BCR math
    // depends on absolute positions).
    window.addEventListener('resize', () => { redrawPermanentWires(); });

    // Pre-seed a tiny starter pipeline so first-time visitors see something.
    addNode('Cube Source');
    addNode('Cone Source');
    addNode('Merge');
    addNode('Render to Scene');

    autoRemoveEmptyHint();
    refreshConnectionsList();
    redrawPermanentWires();
  