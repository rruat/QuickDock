// ── note-mobile-inspector.js ──────────────────────────────────────────────────
// Inspetor Lateral Direito para Mobile no estilo Obsidian Mobile
// Abas:
// 1. Sumário (Outline): árvore de títulos H1..H6 com navegação por clique suave
// 2. Backlinks: referências de outras notas apontando para a nota ativa
// 3. Constelações (Grafo Local): nó central da nota ativa + vizinhos conectados

import { extrairSumarioDaNota, irParaTitulo } from './note-outline.js';
import { loadAllNotesMeta, getNoteById, obterTodosLinks } from './storage.js';
import { calcularBacklinks, normalizarCaminhoNota, normalizarAlvoLink } from './links.js';
import { getCurrentNoteId } from './note.js';
import { escHtml } from './blocks.js';

let rightDrawerEl = null;
let scrimEl = null;
let activeTab = 'outline'; // 'outline' | 'backlinks' | 'graph'

// Elementos de abas e painéis
let tabOutline = null;
let tabBacklinks = null;
let tabGraph = null;
let panelOutline = null;
let panelBacklinks = null;
let panelGraph = null;
let outlineContainer = null;
let backlinksContainer = null;
let countBadgeOutline = null;
let countBadgeBacklinks = null;

// Elementos do grafo local
let graphCanvas = null;
let graphCtx = null;
let graphEmptyEl = null;
let graphNeighborsEl = null;
let localGraphNodes = [];
let localGraphEdges = [];
let localGraphAnimId = null;
let localGraphTransform = { x: 0, y: 0, scale: 1 };
let isGraphDragging = false;
let graphDragStart = { x: 0, y: 0 };
let currentNoteData = null;

export function initMobileInspector() {
  rightDrawerEl = document.getElementById('mobileRightDrawer');
  scrimEl = document.getElementById('mobileDrawerScrim');
  if (!rightDrawerEl) return;

  tabOutline = document.getElementById('mobile-tab-outline');
  tabBacklinks = document.getElementById('mobile-tab-backlinks');
  tabGraph = document.getElementById('mobile-tab-graph');

  panelOutline = document.getElementById('mobile-panel-outline');
  panelBacklinks = document.getElementById('mobile-panel-backlinks');
  panelGraph = document.getElementById('mobile-panel-graph');

  outlineContainer = document.getElementById('mobile-outline-container');
  backlinksContainer = document.getElementById('mobile-backlinks-container');
  countBadgeOutline = document.getElementById('mobile-tab-outline-count');
  countBadgeBacklinks = document.getElementById('mobile-tab-backlinks-count');

  graphCanvas = document.getElementById('mobile-graph-canvas');
  if (graphCanvas) graphCtx = graphCanvas.getContext('2d');
  graphEmptyEl = document.getElementById('mobile-graph-empty');
  graphNeighborsEl = document.getElementById('mobile-graph-neighbors-list');

  // Alternador de abas
  tabOutline?.addEventListener('click', () => switchInspectorTab('outline'));
  tabBacklinks?.addEventListener('click', () => switchInspectorTab('backlinks'));
  tabGraph?.addEventListener('click', () => switchInspectorTab('graph'));

  // Botão fechar drawer
  document.getElementById('btn-close-mobile-right')?.addEventListener('click', () => {
    closeMobileRightDrawer();
  });

  // Botão abrir grafo completo
  document.getElementById('btn-mobile-open-full-graph')?.addEventListener('click', () => {
    closeMobileRightDrawer();
    if (typeof window !== 'undefined' && typeof window.quickdockOpenView === 'function') {
      window.quickdockOpenView('graph');
    } else {
      document.querySelector('.nav-item[data-nav-view="graph"]')?.click();
    }
  });

  // Interações de toque no canvas do grafo local
  initLocalGraphInteractions();

  // Escuta troca de nota
  document.addEventListener('quickdock:active-note-changed', () => {
    refreshMobileInspector();
  });

  document.addEventListener('quickdock:note-title-committed', () => {
    refreshMobileInspector();
  });

  document.addEventListener('quickdock:open-mobile-inspector', (e) => {
    const tab = e.detail?.tab || activeTab || 'outline';
    switchInspectorTab(tab);
  });

  // Atualização periódica leve quando o editor é modificado
  document.addEventListener('input', (e) => {
    if (e.target?.closest('#note-editor-blocks, #note-header-title')) {
      scheduleInspectorRefresh();
    }
  });
}

let refreshTimer = null;
function scheduleInspectorRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshMobileInspector();
  }, 350);
}

export function switchInspectorTab(tab) {
  activeTab = tab;

  // Atualiza botões
  tabOutline?.classList.toggle('active', tab === 'outline');
  tabOutline?.setAttribute('aria-selected', tab === 'outline' ? 'true' : 'false');

  tabBacklinks?.classList.toggle('active', tab === 'backlinks');
  tabBacklinks?.setAttribute('aria-selected', tab === 'backlinks' ? 'true' : 'false');

  tabGraph?.classList.toggle('active', tab === 'graph');
  tabGraph?.setAttribute('aria-selected', tab === 'graph' ? 'true' : 'false');

  // Atualiza painéis
  if (panelOutline) {
    panelOutline.classList.toggle('active', tab === 'outline');
    panelOutline.hidden = tab !== 'outline';
  }
  if (panelBacklinks) {
    panelBacklinks.classList.toggle('active', tab === 'backlinks');
    panelBacklinks.hidden = tab !== 'backlinks';
  }
  if (panelGraph) {
    panelGraph.classList.toggle('active', tab === 'graph');
    panelGraph.hidden = tab !== 'graph';
  }

  if (tab === 'outline') renderMobileOutline();
  else if (tab === 'backlinks') renderMobileBacklinks();
  else if (tab === 'graph') renderMobileLocalGraph();
}

export function openMobileRightDrawer(initialTab) {
  if (!rightDrawerEl) return;
  // Fecha o drawer esquerdo caso esteja aberto
  document.getElementById('mAside')?.classList.remove('is-open-mobile');
  document.getElementById('app')?.classList.remove('has-left-drawer-open');
  document.body.classList.remove('has-left-drawer-open');

  rightDrawerEl.classList.add('is-open-mobile');
  document.getElementById('app')?.classList.add('has-right-drawer-open');
  document.body.classList.add('has-right-drawer-open');
  if (scrimEl) scrimEl.classList.add('is-active');

  const mHeader = document.getElementById('mHeader');
  const mMain = document.getElementById('mMain');
  if (mHeader) {
    mHeader.style.removeProperty('transform');
    mHeader.style.removeProperty('transition');
  }
  if (mMain) {
    mMain.style.removeProperty('transform');
    mMain.style.removeProperty('transition');
  }

  if (initialTab) {
    switchInspectorTab(initialTab);
  } else {
    refreshMobileInspector();
  }
}

export function closeMobileRightDrawer() {
  if (!rightDrawerEl) return;
  rightDrawerEl.classList.remove('is-open-mobile');
  document.getElementById('app')?.classList.remove('has-right-drawer-open');
  document.body.classList.remove('has-right-drawer-open');

  const mHeader = document.getElementById('mHeader');
  const mMain = document.getElementById('mMain');
  if (mHeader) {
    mHeader.style.removeProperty('transform');
    mHeader.style.removeProperty('transition');
  }
  if (mMain) {
    mMain.style.removeProperty('transform');
    mMain.style.removeProperty('transition');
  }

  // Só retira o scrim se o drawer da esquerda também estiver fechado
  const leftOpen = document.getElementById('mAside')?.classList.contains('is-open-mobile');
  if (!leftOpen && scrimEl) {
    scrimEl.classList.remove('is-active');
  }

  if (localGraphAnimId) {
    cancelAnimationFrame(localGraphAnimId);
    localGraphAnimId = null;
  }
}

export function toggleMobileRightDrawer(force) {
  if (!rightDrawerEl) return;
  const shouldOpen = force !== undefined ? Boolean(force) : !rightDrawerEl.classList.contains('is-open-mobile');
  if (shouldOpen) {
    openMobileRightDrawer();
  } else {
    closeMobileRightDrawer();
  }
}

export async function refreshMobileInspector() {
  const noteId = getCurrentNoteId();
  if (noteId == null) {
    if (outlineContainer) outlineContainer.innerHTML = '<div class="mobile-outline-empty"><span class="material-symbols-rounded">description</span><span>Nenhuma nota aberta</span></div>';
    if (backlinksContainer) backlinksContainer.innerHTML = '<div class="mobile-backlinks-empty"><span class="material-symbols-rounded">link</span><span>Nenhuma nota aberta</span></div>';
    if (countBadgeOutline) countBadgeOutline.textContent = '0';
    if (countBadgeBacklinks) countBadgeBacklinks.textContent = '0';
    return;
  }

  // Atualiza badges em background
  updateBadges(noteId);

  // Renderiza a aba ativa
  if (activeTab === 'outline') {
    renderMobileOutline();
  } else if (activeTab === 'backlinks') {
    await renderMobileBacklinks(noteId);
  } else if (activeTab === 'graph') {
    await renderMobileLocalGraph(noteId);
  }
}

async function updateBadges(noteId) {
  const headings = extrairSumarioDaNota();
  if (countBadgeOutline) countBadgeOutline.textContent = String(headings.length);

  try {
    const note = await getNoteById(noteId);
    if (note) {
      const [todasNotas, todosLinks] = await Promise.all([loadAllNotesMeta(), obterTodosLinks()]);
      const backlinks = calcularBacklinks(note, todasNotas, todosLinks);
      if (countBadgeBacklinks) countBadgeBacklinks.textContent = String(backlinks.length);
    }
  } catch (_) {}
}

// ── 1. Sumário (Outline) ──────────────────────────────────────────────────────
export function renderMobileOutline() {
  if (!outlineContainer) return;
  const headings = extrairSumarioDaNota();
  if (countBadgeOutline) countBadgeOutline.textContent = String(headings.length);

  outlineContainer.innerHTML = '';
  if (headings.length === 0) {
    outlineContainer.innerHTML = `
      <div class="mobile-outline-empty">
        <span class="material-symbols-rounded">notes</span>
        <span>Nenhum título nesta nota</span>
      </div>
    `;
    return;
  }

  for (const h of headings) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mobile-outline-item';
    item.dataset.slug = h.slug;
    item.style.paddingLeft = `${Math.max(8, (h.nivel - 1) * 12 + 8)}px`;
    item.innerHTML = `
      <span class="mobile-outline-badge">H${h.nivel}</span>
      <span class="mobile-outline-text" title="${escHtml(h.texto)}">${escHtml(h.texto)}</span>
    `;

    item.addEventListener('click', () => {
      irParaTitulo(h.slug);
      closeMobileRightDrawer();
    });

    outlineContainer.appendChild(item);
  }
}

// ── 2. Backlinks ─────────────────────────────────────────────────────────────
export async function renderMobileBacklinks(noteId = getCurrentNoteId()) {
  if (!backlinksContainer) return;
  if (noteId == null) return;

  backlinksContainer.innerHTML = '<div class="mobile-backlinks-loading">Carregando referências...</div>';

  try {
    const note = await getNoteById(noteId);
    if (!note) {
      backlinksContainer.innerHTML = `
        <div class="mobile-backlinks-empty">
          <span class="material-symbols-rounded">link_off</span>
          <span>Nota não encontrada</span>
        </div>
      `;
      return;
    }

    const [todasNotas, todosLinks] = await Promise.all([
      loadAllNotesMeta(),
      obterTodosLinks()
    ]);

    const backlinks = calcularBacklinks(note, todasNotas, todosLinks);
    if (countBadgeBacklinks) countBadgeBacklinks.textContent = String(backlinks.length);

    backlinksContainer.innerHTML = '';
    if (backlinks.length === 0) {
      backlinksContainer.innerHTML = `
        <div class="mobile-backlinks-empty">
          <span class="material-symbols-rounded">link</span>
          <span>Nenhuma outra nota menciona esta.</span>
          <span style="font-size: 0.74rem; opacity: 0.7;">Use [[${escHtml(note.title || 'Título')}]] em outras notas para conectar.</span>
        </div>
      `;
      return;
    }

    for (const bl of backlinks) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mobile-backlink-card';
      card.innerHTML = `
        <span class="material-symbols-rounded mobile-backlink-icon">description</span>
        <div class="mobile-backlink-info">
          <span class="mobile-backlink-title">${escHtml(bl.title || 'Sem título')}</span>
          ${bl.pasta ? `<span class="mobile-backlink-folder">${escHtml(bl.pasta)}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
          detail: { id: bl.id }
        }));
        closeMobileRightDrawer();
      });

      backlinksContainer.appendChild(card);
    }
  } catch (err) {
    backlinksContainer.innerHTML = `
      <div class="mobile-backlinks-empty">
        <span class="material-symbols-rounded">error</span>
        <span>Erro ao carregar backlinks</span>
      </div>
    `;
  }
}

// ── 3. Constelações (Grafo Local) ────────────────────────────────────────────
export async function renderMobileLocalGraph(noteId = getCurrentNoteId()) {
  if (!graphCanvas) return;
  if (noteId == null) {
    if (graphEmptyEl) graphEmptyEl.hidden = false;
    return;
  }

  try {
    const note = await getNoteById(noteId);
    if (!note) {
      if (graphEmptyEl) graphEmptyEl.hidden = false;
      return;
    }
    currentNoteData = note;

    const [todasNotas, todosLinks] = await Promise.all([
      loadAllNotesMeta(),
      obterTodosLinks()
    ]);

    // Backlinks da nota
    const backlinks = calcularBacklinks(note, todasNotas, todosLinks);

    // Links de saída da nota
    const outgoingTargets = new Set();
    const linksDaNota = todosLinks.filter(l => l.uidOrigem === note.uid);
    for (const l of linksDaNota) {
      if (l.uidDestino) outgoingTargets.add(l.uidDestino);
      else if (l.tituloAlvo) outgoingTargets.add(l.tituloAlvo.toLowerCase());
    }

    // Identifica vizinhos
    const neighborsMap = new Map();
    for (const bl of backlinks) {
      neighborsMap.set(bl.id, {
        id: bl.id,
        uid: bl.uid,
        title: bl.title || 'Sem título',
        pasta: bl.pasta || '',
        color: bl.color || null,
        type: 'backlink'
      });
    }

    for (const n of todasNotas) {
      if (n.id === note.id) continue;
      const matchUid = n.uid && outgoingTargets.has(n.uid);
      const matchTitle = n.title && outgoingTargets.has(n.title.toLowerCase());
      const matchPath = outgoingTargets.has(normalizarAlvoLink(normalizarCaminhoNota(n.pasta, n.title)));
      if (matchUid || matchTitle || matchPath) {
        if (!neighborsMap.has(n.id)) {
          neighborsMap.set(n.id, {
            id: n.id,
            uid: n.uid,
            title: n.title || 'Sem título',
            pasta: n.pasta || '',
            color: n.color || null,
            type: 'outgoing'
          });
        }
      }
    }

    const neighbors = [...neighborsMap.values()];

    // Renderiza lista de notas conectadas abaixo do grafo
    if (graphNeighborsEl) {
      graphNeighborsEl.innerHTML = '';
      if (neighbors.length === 0) {
        graphNeighborsEl.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted);">Nenhuma nota conectada diretamente.</span>';
      } else {
        for (const nb of neighbors) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'mobile-backlink-card';
          item.innerHTML = `
            <span class="material-symbols-rounded mobile-backlink-icon" style="${nb.color ? `color:${nb.color}` : ''}">description</span>
            <div class="mobile-backlink-info">
              <span class="mobile-backlink-title">${escHtml(nb.title)}</span>
              ${nb.pasta ? `<span class="mobile-backlink-folder">${escHtml(nb.pasta)}</span>` : ''}
            </div>
            <span class="material-symbols-rounded" style="font-size:16px; color:var(--text-muted);">arrow_forward</span>
          `;
          item.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
              detail: { id: nb.id }
            }));
            closeMobileRightDrawer();
          });
          graphNeighborsEl.appendChild(item);
        }
      }
    }

    // Configura nós e arestas para o Canvas
    const width = graphCanvas.clientWidth || 300;
    const height = graphCanvas.clientHeight || 220;
    const dpr = window.devicePixelRatio || 1;
    graphCanvas.width = width * dpr;
    graphCanvas.height = height * dpr;
    graphCtx.scale(dpr, dpr);

    if (neighbors.length === 0) {
      if (graphEmptyEl) graphEmptyEl.hidden = false;
      graphCtx.clearRect(0, 0, width, height);
      return;
    } else {
      if (graphEmptyEl) graphEmptyEl.hidden = true;
    }

    // Centro da nota ativa
    const centerX = width / 2;
    const centerY = height / 2;
    localGraphTransform = { x: 0, y: 0, scale: 1 };

    localGraphNodes = [
      {
        id: note.id,
        title: note.title || 'Sem título',
        x: centerX,
        y: centerY,
        vx: 0,
        vy: 0,
        radius: 14,
        isCenter: true,
        color: note.color || '#6366f1'
      }
    ];

    localGraphEdges = [];

    const angleStep = (Math.PI * 2) / neighbors.length;
    const orbitRadius = Math.min(centerX, centerY) * 0.72;

    neighbors.forEach((nb, i) => {
      const angle = i * angleStep;
      const nx = centerX + Math.cos(angle) * orbitRadius;
      const ny = centerY + Math.sin(angle) * orbitRadius;

      localGraphNodes.push({
        id: nb.id,
        title: nb.title,
        x: nx,
        y: ny,
        vx: 0,
        vy: 0,
        radius: 9,
        isCenter: false,
        color: nb.color || '#94a3b8'
      });

      localGraphEdges.push({
        source: note.id,
        target: nb.id
      });
    });

    startLocalGraphSimulation(width, height);
  } catch (err) {
    if (graphEmptyEl) graphEmptyEl.hidden = false;
  }
}

function startLocalGraphSimulation(width, height) {
  if (localGraphAnimId) cancelAnimationFrame(localGraphAnimId);

  let step = 0;
  const maxSteps = 120; // 2 segundos de amortecimento

  function tick() {
    drawLocalGraph(width, height);

    if (step < maxSteps) {
      // Força de repulsão simples
      for (let i = 0; i < localGraphNodes.length; i++) {
        for (let j = i + 1; j < localGraphNodes.length; j++) {
          const n1 = localGraphNodes[i];
          const n2 = localGraphNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < 80) {
            const force = (80 - dist) / dist * 0.2;
            if (!n1.isCenter) { n1.x -= dx * force; n1.y -= dy * force; }
            if (!n2.isCenter) { n2.x += dx * force; n2.y += dy * force; }
          }
        }
      }
      step++;
      localGraphAnimId = requestAnimationFrame(tick);
    } else {
      localGraphAnimId = null;
    }
  }

  localGraphAnimId = requestAnimationFrame(tick);
}

function drawLocalGraph(width, height) {
  if (!graphCtx) return;
  graphCtx.clearRect(0, 0, width, height);

  const { x: tx, y: ty, scale } = localGraphTransform;
  graphCtx.save();
  graphCtx.translate(tx, ty);
  graphCtx.scale(scale, scale);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const lineColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';

  // 1. Arestas
  graphCtx.lineWidth = 1.5;
  graphCtx.strokeStyle = lineColor;
  for (const edge of localGraphEdges) {
    const s = localGraphNodes.find(n => n.id === edge.source);
    const t = localGraphNodes.find(n => n.id === edge.target);
    if (s && t) {
      graphCtx.beginPath();
      graphCtx.moveTo(s.x, s.y);
      graphCtx.lineTo(t.x, t.y);
      graphCtx.stroke();
    }
  }

  // 2. Nós
  for (const node of localGraphNodes) {
    // Halo pulsante ou borda no nó central
    if (node.isCenter) {
      graphCtx.beginPath();
      graphCtx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
      graphCtx.fillStyle = 'rgba(99, 102, 241, 0.22)';
      graphCtx.fill();
    }

    graphCtx.beginPath();
    graphCtx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    graphCtx.fillStyle = node.color || '#6366f1';
    graphCtx.fill();
    graphCtx.lineWidth = 1.5;
    graphCtx.strokeStyle = isDark ? '#1e293b' : '#ffffff';
    graphCtx.stroke();

    // Rótulo de texto
    graphCtx.font = `${node.isCenter ? 'bold 11px' : '10px'} system-ui, sans-serif`;
    graphCtx.fillStyle = textColor;
    graphCtx.textAlign = 'center';
    const textY = node.y + node.radius + 12;

    const maxLen = 14;
    let label = node.title || 'Sem título';
    if (label.length > maxLen) label = label.slice(0, maxLen) + '…';
    graphCtx.fillText(label, node.x, textY);
  }

  graphCtx.restore();
}

function initLocalGraphInteractions() {
  if (!graphCanvas) return;

  let pointerStartX = 0;
  let pointerStartY = 0;
  let hasMoved = false;

  graphCanvas.addEventListener('pointerdown', (e) => {
    isGraphDragging = true;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    graphDragStart = { x: e.clientX - localGraphTransform.x, y: e.clientY - localGraphTransform.y };
    hasMoved = false;
    graphCanvas.setPointerCapture(e.pointerId);
  });

  graphCanvas.addEventListener('pointermove', (e) => {
    if (!isGraphDragging) return;
    const dx = Math.abs(e.clientX - pointerStartX);
    const dy = Math.abs(e.clientY - pointerStartY);
    if (dx > 4 || dy > 4) hasMoved = true;

    localGraphTransform.x = e.clientX - graphDragStart.x;
    localGraphTransform.y = e.clientY - graphDragStart.y;
    const w = graphCanvas.clientWidth || 300;
    const h = graphCanvas.clientHeight || 220;
    drawLocalGraph(w, h);
  });

  const onPointerUp = (e) => {
    if (!isGraphDragging) return;
    isGraphDragging = false;

    // Se foi apenas um toque sem arrasto, verifica se tocou em algum nó
    if (!hasMoved) {
      const rect = graphCanvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left - localGraphTransform.x) / localGraphTransform.scale;
      const clickY = (e.clientY - rect.top - localGraphTransform.y) / localGraphTransform.scale;

      for (const node of localGraphNodes) {
        const dist = Math.hypot(clickX - node.x, clickY - node.y);
        if (dist <= node.radius + 6) {
          if (!node.isCenter) {
            document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
              detail: { id: node.id }
            }));
            closeMobileRightDrawer();
          }
          break;
        }
      }
    }
  };

  graphCanvas.addEventListener('pointerup', onPointerUp);
  graphCanvas.addEventListener('pointercancel', onPointerUp);
}
