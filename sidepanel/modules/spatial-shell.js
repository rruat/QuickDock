// ── spatial-shell.js ────────────────────────────────────────────────────────
// Controlador do Spatial Shell Workspace (Layout IDE inspirado no design-pattern)
// Gerencia:
// 1. Omnibar universal com busca multi-token, stopwords, autocomplete por Tab e notas
// 2. Activity Bar (#mNav) e Aside (#mAside) com redimensionamento de 3 pontos
// 3. Main Workspace (#mMain) com layouts Lado a Lado e Empilhado
// 4. Seções (.main-section) com cabeçalho, indicador 'Em Foco', reordenação e divisórias
// 5. Atalhos globais de teclado ('Mãos no Teclado': Ctrl+K, Alt+L, Alt+[], Alt+1..9)

import { isDesktopMode } from './platform.js';
import { loadAllNotesMeta } from './storage.js';
import { closeTab, getOpenTabsSnapshot } from './notes-tabs.js';

const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'com', 'por', 'para', 'pra', 'x', 'vs']);

// Views disponíveis no QuickDock
export const SHELL_VIEWS = [
  { id: 'notes', title: 'Notas', icon: 'description', desc: 'Editor de texto e sumário' },
  { id: 'bases', title: 'Bases', icon: 'table_rows', desc: 'Tabela, Kanban, Galeria e Lista' },
  { id: 'board', title: 'Espaço', icon: 'space_dashboard', desc: 'Quadro espacial infinito' },
  { id: 'graph', title: 'Constelações', icon: 'hub', desc: 'Grafo de conexões entre notas' },
  { id: 'calendar', title: 'Calendário', icon: 'calendar_today', desc: 'Visão temporal de eventos e notas' },
  { id: 'docs', title: 'Documentos', icon: 'attach_file', desc: 'Anexos e arquivos da nota' },
  { id: 'templates', title: 'Modelos', icon: 'auto_stories', desc: 'Galeria de modelos prontos' }
];

let openViewIds = [];
let focusedViewId = null;
let layoutMode = 'side-by-side'; // 'side-by-side' ou 'stacked'
let searchActiveIdx = -1;
let searchCandidates = [];
let draggedViewId = null; // reordenação de views por arrastar o .section-header

// Cada nota aberta é sua própria view no mosaico (data-id="note-<id>"), em vez
// de uma única view "notes" genérica — espelha openTabIds/activeId de
// notes-tabs.js (ver quickdock:notes-open-tabs-changed e getOpenTabsSnapshot).
let openNoteIds = [];
let activeNoteId = null;

// Utilitários de texto e regex
function normalizeStr(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeHtml(str) {
  return (str || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightTokens(text, tokens) {
  if (!text) return '';
  let safe = escapeHtml(text);
  if (!tokens || tokens.length === 0) return safe;

  for (const token of tokens) {
    if (!token) continue;
    const cleanToken = normalizeStr(token);
    if (!cleanToken) continue;
    const re = new RegExp(`(${escapeRegex(token)})`, 'gi');
    safe = safe.replace(re, '<mark>$1</mark>');
  }
  return safe;
}

// ── Inicialização do Spatial Shell ──────────────────────────────────────────
export function initSpatialShell() {
  if (typeof document === 'undefined') return;

  // Carrega preferências salvas (ids de notas são resolvidos à parte, a
  // partir do estado real de abas abertas em notes-tabs.js — ver abaixo).
  try {
    const savedLayout = localStorage.getItem('quickdock:spatial:layout-mode');
    if (savedLayout === 'stacked' || savedLayout === 'side-by-side') {
      layoutMode = savedLayout;
    }
    const savedOpenViews = localStorage.getItem('quickdock:spatial:open-views');
    if (savedOpenViews) {
      const parsed = JSON.parse(savedOpenViews);
      if (Array.isArray(parsed)) {
        openViewIds = parsed.filter(id => SHELL_VIEWS.some(v => v.id === id && v.id !== 'notes') || id.startsWith('note-'));
      }
    }
  } catch {}

  // Garante que todas as seções de view no mMain tenham a classe main-section
  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.querySelectorAll('[data-id]').forEach(sec => sec.classList.add('main-section'));
  }

  setupLayoutMode();
  setupActivityBar();
  setupHeaderMenu();
  setupAside();
  setupOmnibar();
  setupKeyboardShortcuts();
  setupSectionInteractions();

  // initSpatialShell() roda DEPOIS de initNotesTabs() (app.js) — o primeiro
  // quickdock:notes-open-tabs-changed já disparou e passou batido, então lê
  // o estado atual direto em vez de esperar o próximo evento.
  document.addEventListener('quickdock:notes-open-tabs-changed', e => syncNoteViews(e.detail || {}));
  syncNoteViews(getOpenTabsSnapshot());

  setAsideMode('notes');
  renderAsideViewList();
  applyViewVisibility();
  setupSectionDividers();
}

// ── Layout (Lado a Lado vs Empilhado) ─────────────────────────────────────────
function setupLayoutMode() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;
  mainEl.classList.toggle('is-side-by-side', layoutMode === 'side-by-side');

  const toggleBtn = document.getElementById('btnToggleLayout');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleLayout);
  }
}

export function toggleLayout() {
  layoutMode = layoutMode === 'side-by-side' ? 'stacked' : 'side-by-side';
  try { localStorage.setItem('quickdock:spatial:layout-mode', layoutMode); } catch {}

  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.classList.toggle('is-side-by-side', layoutMode === 'side-by-side');
  }

  // Notifica redimensionamento para os motores canvas (Board / Graph)
  window.dispatchEvent(new CustomEvent('resize'));
  setupSectionDividers();
  updateSectionMoveButtons();
}

// ── Activity Bar (#mNav) ──────────────────────────────────────────────────────
function setupActivityBar() {
  const navEl = document.getElementById('mNav');
  if (!navEl) return;

  navEl.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const viewId = item.dataset.navView;
      if (!viewId) return;

      navEl.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('is-active', i === item));
      if (viewId === 'notes') {
        setAsideMode('notes');
        const asideEl = document.getElementById('mAside');
        if (asideEl && window.innerWidth <= 768) {
          asideEl.classList.toggle('is-open-mobile');
        }
      }
      openOrFocusView(viewId);
    });
  });
}

// ── Header Menu (#mMenu) ──────────────────────────────────────────────────────
function setupHeaderMenu() {
  const menuEl = document.getElementById('mMenu');
  if (!menuEl) return;

  menuEl.querySelectorAll('li[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      const viewId = item.dataset.view;
      if (viewId) openOrFocusView(viewId);
    });
  });
}

// ── Aside (#mAside) e Menu + View ─────────────────────────────────────────────
function setupAside() {
  const asideEl = document.getElementById('mAside');
  if (!asideEl) return;

  const addBtn = document.getElementById('btnAddSection');
  const addMenu = document.getElementById('addViewMenu');
  if (addBtn && addMenu) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = addMenu.style.display === 'none' || !addMenu.style.display;
      addMenu.style.display = isHidden ? 'flex' : 'none';
    });

    document.addEventListener('click', () => {
      if (addMenu) addMenu.style.display = 'none';
    });

    addMenu.querySelectorAll('.add-view-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const type = opt.dataset.type;
        if (type === 'notes') {
          // "+ view" de Notas sempre cria uma view NOVA (uma nota nova), ao
          // contrário do clique em "Notas" no #mNav/#mMenu, que só foca a
          // que já estiver ativa.
          document.getElementById('btn-new-note')?.click();
        } else if (type) {
          openOrFocusView(type);
        }
        addMenu.style.display = 'none';
      });
    });
  }

  // Alça de redimensionamento da Aside (.aside-indicator)
  const asideIndicator = asideEl.querySelector('.aside-indicator');
  if (asideIndicator) {
    let isDragging = false;
    let startX = 0;
    let startWidth = 280;

    asideIndicator.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = asideEl.getBoundingClientRect().width;
      document.body.classList.add('is-resizing-col');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(180, Math.min(600, startWidth + deltaX));
      document.documentElement.style.setProperty('--aside-width', `${newWidth}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('is-resizing-col');
    });
  }

  // Mobile drawer toggle
  const closeAsideMobileBtn = document.getElementById('btnCloseAsideMobile');
  if (closeAsideMobileBtn) {
    closeAsideMobileBtn.addEventListener('click', () => {
      asideEl.classList.remove('is-open-mobile');
    });
  }
}

export function renderAsideViewList() {
  const listEl = document.getElementById('asideSectionList');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const v of SHELL_VIEWS) {
    // "Notas" não é uma view fixa própria — reflete o estado real de notas
    // abertas (cada uma é sua própria view, ver syncNoteViews).
    const isOpen = v.id === 'notes' ? openNoteIds.length > 0 : openViewIds.includes(v.id);
    const isFocused = v.id === 'notes' ? (activeNoteId != null && focusedViewId === `note-${activeNoteId}`) : focusedViewId === v.id;

    const item = document.createElement('div');
    item.className = `aside-section-item ${isOpen ? 'is-open' : ''} ${isFocused ? 'is-focused' : ''}`;
    item.innerHTML = `
      <div class="aside-item-icon">
        <span class="material-symbols-rounded">${v.icon}</span>
      </div>
      <span class="aside-item-title">${v.title}</span>
      <span class="aside-item-badge">${isOpen ? 'Aberta' : 'Abrir'}</span>
    `;

    item.addEventListener('click', () => {
      openOrFocusView(v.id);
    });

    listEl.appendChild(item);
  }
}

// ── Sub-painel do #mAside (Explorador de Notas vs Lista de Views) ────────────
// O #mAside funciona como um submenu dos itens do #mNav: "Notas" mostra o
// Explorador de Notas real do QuickDock (pastas/abas, montado por
// initDesktopNotesAsideDrawer em notes-tabs.js); qualquer outra view mostra a
// lista genérica de views abertas/disponíveis (#asideSectionList).
export function setAsideMode(mode) {
  const asideEl = document.getElementById('mAside');
  if (!asideEl) return;
  const isNotes = mode === 'notes';
  asideEl.classList.toggle('mode-notes', isNotes);
  asideEl.classList.toggle('mode-views', !isNotes);
}

// ── Notas como Views Dinâmicas do Mosaico ─────────────────────────────────────
// Cada nota aberta (openTabIds em notes-tabs.js) é sua própria view no
// mosaico, fechável/focável/reordenável como Bases/Espaço/etc — não uma view
// "notes" única genérica. O editor de blocos (note.js) é um singleton: só a
// nota ATIVA (activeId) realmente carrega o editor dentro de .note-section;
// as demais aparecem como tiles placeholder leves (buildNotePlaceholderSection)
// até serem clicadas, quando então viram a nota ativa de verdade.
function updateNoteSectionHeader(sectionEl, meta) {
  const title = (meta?.title || '').trim() || 'Sem título';
  const icon = meta?.icon || 'description';
  const iconEl = sectionEl.querySelector(':scope > .section-header .section-icon .material-symbols-rounded');
  const titleEl = sectionEl.querySelector(':scope > .section-header .section-title');
  const closeBtn = sectionEl.querySelector(':scope > .section-header .section-close');
  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (closeBtn) closeBtn.setAttribute('aria-label', `Fechar ${title}`);
}

function buildNotePlaceholderSection(id, meta) {
  const title = (meta?.title || '').trim() || 'Sem título';
  const icon = meta?.icon || 'description';
  const sec = document.createElement('section');
  sec.className = 'main-section note-placeholder-section';
  sec.dataset.id = `note-${id}`;
  sec.tabIndex = 0;
  sec.innerHTML = `
    <header class="section-header" draggable="true" title="Arraste para reordenar esta view">
      <div class="section-header-left">
        <span class="section-icon"><span class="material-symbols-rounded">${escapeHtml(icon)}</span></span>
        <span class="section-title">${escapeHtml(title)}</span>
        <span class="section-focus-indicator"><i class="focus-dot"></i>Em foco</span>
      </div>
      <div class="section-header-actions">
        <button class="section-btn btn-move-prev" type="button" title="Mover para antes (Alt + ←)"><span class="material-symbols-rounded">arrow_back</span></button>
        <button class="section-btn btn-move-next" type="button" title="Mover para depois (Alt + →)"><span class="material-symbols-rounded">arrow_forward</span></button>
        <button class="section-close" type="button" aria-label="Fechar ${escapeHtml(title)}" title="Fechar view (Alt + W)"><span class="material-symbols-rounded">close</span></button>
      </div>
    </header>
    <div class="note-placeholder-body">
      <span class="material-symbols-rounded note-placeholder-icon">${escapeHtml(icon)}</span>
      <p>${escapeHtml(title)}</p>
      <button type="button" class="note-placeholder-focus-btn">Clique para focar e editar</button>
    </div>
  `;
  sec.querySelector('.note-placeholder-body').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id } }));
  });
  bindSectionInteractions(sec);
  return sec;
}

function syncNoteSectionDOM(noteIds, activeId, notesById) {
  const mainEl = document.getElementById('mMain');
  const noteSectionEl = document.querySelector('.note-section');
  if (!mainEl || !noteSectionEl) return;

  // Remove placeholders de notas que fecharam de vez
  mainEl.querySelectorAll('.note-placeholder-section').forEach(sec => {
    const id = Number((sec.dataset.id || '').slice(5));
    if (!noteIds.includes(id)) sec.remove();
  });

  if (activeId != null) {
    noteSectionEl.dataset.id = `note-${activeId}`;
    noteSectionEl.hidden = false;
    updateNoteSectionHeader(noteSectionEl, notesById.get(activeId));
    // Se a nota ativa tinha um placeholder (era uma view em 2º plano até
    // agora), remove — .note-section passa a representá-la de verdade.
    mainEl.querySelector(`.note-placeholder-section[data-id="note-${activeId}"]`)?.remove();
  } else {
    noteSectionEl.dataset.id = 'notes';
  }

  // Garante uma tile placeholder pra cada nota aberta que não é a ativa
  for (const id of noteIds) {
    if (id === activeId) continue;
    if (mainEl.querySelector(`.note-placeholder-section[data-id="note-${id}"]`)) continue;
    mainEl.appendChild(buildNotePlaceholderSection(id, notesById.get(id)));
  }
}

function syncNoteViews(snapshot) {
  const { openIds = [], activeId = null, notes = [] } = snapshot || {};
  const wasActiveViewId = activeNoteId != null ? `note-${activeNoteId}` : null;
  openNoteIds = openIds;
  activeNoteId = activeId;

  const notesById = new Map(notes.map(n => [n.id, n]));
  const desiredNoteViewIds = openIds.map(id => `note-${id}`);

  // openViewIds guarda tanto ids fixos (bases/board/...) quanto note-<id>;
  // reconcilia só a parte de notas, preservando a ordem/posição das demais.
  openViewIds = openViewIds.filter(id => id !== 'notes' && (!id.startsWith('note-') || desiredNoteViewIds.includes(id)));
  for (const vid of desiredNoteViewIds) {
    if (!openViewIds.includes(vid)) openViewIds.push(vid);
  }
  try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}

  syncNoteSectionDOM(openIds, activeId, notesById);
  reorderMainSections();

  const activeViewId = activeId != null ? `note-${activeId}` : null;
  if (activeViewId && activeViewId !== wasActiveViewId) {
    // A nota ativa mudou (ou é a primeira sincronização) — o foco visual
    // acompanha, igual a clicar em qualquer outra view pra focá-la.
    focusedViewId = activeViewId;
    setAsideMode('notes');
  } else if (focusedViewId && !openViewIds.includes(focusedViewId)) {
    focusedViewId = openViewIds[openViewIds.length - 1] || null;
  }

  const navEl = document.getElementById('mNav');
  if (navEl) {
    const notesNavActive = focusedViewId === activeViewId || (focusedViewId || '').startsWith('note-');
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === 'notes' ? notesNavActive : item.dataset.navView === focusedViewId);
    });
  }

  applyViewVisibility();
  renderAsideViewList();
  setupSectionDividers();
  updateSectionMoveButtons();
}

// Só atualiza o foco visual (tile "Em foco") de uma view de nota já ativa —
// usado quando a nota pedida já é a activeNoteId, então não há troca de
// editor pra esperar (o round-trip por quickdock:activate-note não dispara
// nada nesse caso, já que activeId não muda).
function focusNoteViewId(viewId) {
  setAsideMode('notes');
  focusedViewId = viewId;
  applyViewVisibility();
  updateSectionMoveButtons();
  renderAsideViewList();
  const navEl = document.getElementById('mNav');
  if (navEl) {
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === 'notes');
    });
  }
}

// ── Gestão de Views Abertas e Foco ────────────────────────────────────────────
export function openOrFocusView(viewId) {
  if (viewId.startsWith('note-')) {
    setAsideMode('notes');
    // Notas são views dinâmicas (uma por nota aberta) — focar uma delas
    // significa ativá-la de verdade (troca o editor singleton), então o
    // caminho correto é pedir a ativação e deixar quickdock:notes-open-tabs-
    // changed (via syncNoteViews) terminar o trabalho de foco/visibilidade.
    // Exceção: se já é a nota ativa, só falta focar a tile visualmente — a
    // ativação não dispararia nada porque activeId não muda.
    const id = Number(viewId.slice(5));
    if (id === activeNoteId) {
      focusNoteViewId(viewId);
      return;
    }
    document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id } }));
    return;
  }

  if (viewId === 'notes') {
    setAsideMode('notes');
    // "Notas" no #mNav/#mMenu não é uma view fixa própria: foca a nota ativa
    // (ou a última aberta), garantindo que a aside mostre o explorador de notas.
    if (activeNoteId != null) {
      openOrFocusView('note-' + activeNoteId);
    } else if (openNoteIds.length > 0) {
      openOrFocusView('note-' + openNoteIds[openNoteIds.length - 1]);
    }
    return;
  }

  if (!SHELL_VIEWS.some(v => v.id === viewId)) return;

  if (!openViewIds.includes(viewId)) {
    openViewIds.push(viewId);
    try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}
  }
  focusedViewId = viewId;

  const navEl = document.getElementById('mNav');
  if (navEl) {
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === viewId);
    });
  }

  applyViewVisibility();
  renderAsideViewList();
  setupSectionDividers();
  updateSectionMoveButtons();

  // Atualiza rodapé
  const footerLabel = document.getElementById('footer-active-view-name');
  if (footerLabel) {
    const viewMeta = SHELL_VIEWS.find(v => v.id === viewId);
    footerLabel.textContent = viewMeta ? viewMeta.title : viewId;
  }
}

export function closeView(viewId) {
  if (viewId.startsWith('note-')) {
    // Fechar a view de uma nota é fechar a aba de verdade em notes-tabs.js —
    // closeTab() decide o que ativar em seguida (ou nada) e dispara
    // quickdock:notes-open-tabs-changed, que resincroniza as tiles.
    closeTab(Number(viewId.slice(5)));
    return;
  }

  openViewIds = openViewIds.filter(id => id !== viewId);
  try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}

  // Avisa os módulos de desligamento de recursos (ex: parar simulação física do grafo)
  const normPanel = (viewId === 'graph') ? 'grafo' : viewId;
  document.dispatchEvent(new CustomEvent('quickdock:panel-closed', { detail: { panel: normPanel } }));

  if (focusedViewId === viewId) {
    focusedViewId = openViewIds[openViewIds.length - 1] || null;
  }
  applyViewVisibility();
  renderAsideViewList();
  setupSectionDividers();
  updateSectionMoveButtons();
}

// Reordena os elementos .main-section dentro de #mMain pra bater com a ordem
// atual de openViewIds — compartilhado por moveView() e por syncNoteViews()
// (quando uma tile de nota some/aparece, as demais precisam se reacomodar).
function reorderMainSections() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;
  for (const id of openViewIds) {
    const sec = mainEl.querySelector(`.main-section[data-id="${id}"]`);
    if (sec) mainEl.appendChild(sec);
  }
}

export function moveView(viewId, direction) {
  const curIdx = openViewIds.indexOf(viewId);
  if (curIdx === -1) return;
  const newIdx = curIdx + direction;
  if (newIdx < 0 || newIdx >= openViewIds.length) return;

  const temp = openViewIds[curIdx];
  openViewIds[curIdx] = openViewIds[newIdx];
  openViewIds[newIdx] = temp;

  try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}

  reorderMainSections();
  setupSectionDividers();
  updateSectionMoveButtons();
}

function updateSectionMoveButtons() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  openViewIds.forEach((id, index) => {
    const sec = mainEl.querySelector(`.main-section[data-id="${id}"]`);
    if (!sec) return;

    const isFirst = index === 0;
    const isLast = index === openViewIds.length - 1;
    const isFocused = id === focusedViewId;

    sec.classList.toggle('is-focused', isFocused);

    const btnPrev = sec.querySelector('.btn-move-prev');
    if (btnPrev) {
      btnPrev.disabled = isFirst;
      btnPrev.style.opacity = isFirst ? '0.3' : '1';
      btnPrev.style.cursor = isFirst ? 'not-allowed' : 'pointer';
    }

    const btnNext = sec.querySelector('.btn-move-next');
    if (btnNext) {
      btnNext.disabled = isLast;
      btnNext.style.opacity = isLast ? '0.3' : '1';
      btnNext.style.cursor = isLast ? 'not-allowed' : 'pointer';
    }
  });
}

// Lê sec.dataset.id NA HORA de cada evento (não captura num closure) porque
// .note-section troca de data-id em tempo real conforme a nota ativa muda
// (syncNoteSectionDOM) — capturar o id no momento do bind ficaria obsoleto
// depois da primeira troca de nota.
function bindSectionInteractions(sec) {
  sec.addEventListener('pointerdown', () => {
    const id = sec.dataset.id;
    if (!id) return;
    focusedViewId = id;
    updateSectionMoveButtons();
    renderAsideViewList();
  });

  sec.addEventListener('focusin', () => {
    const id = sec.dataset.id;
    if (!id) return;
    focusedViewId = id;
    updateSectionMoveButtons();
    renderAsideViewList();
  });

  // Arrastar o cabeçalho reordena as views no mosaico (o próprio HTML já
  // avisa "Arraste para reordenar esta view" — faltava a implementação).
  const headerEl = sec.querySelector(':scope > .section-header');
  headerEl?.addEventListener('dragstart', (e) => {
    const id = sec.dataset.id;
    if (!id) return;
    draggedViewId = id;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    sec.style.opacity = '0.5';
  });

  headerEl?.addEventListener('dragend', () => {
    draggedViewId = null;
    sec.style.opacity = '';
    document.querySelectorAll('.main-section.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
  });

  sec.addEventListener('dragover', (e) => {
    const id = sec.dataset.id;
    if (!draggedViewId || !id || draggedViewId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    sec.classList.add('is-drag-over');
  });

  sec.addEventListener('dragleave', () => {
    sec.classList.remove('is-drag-over');
  });

  sec.addEventListener('drop', (e) => {
    e.preventDefault();
    sec.classList.remove('is-drag-over');
    const targetId = sec.dataset.id;
    if (!draggedViewId || !targetId || draggedViewId === targetId) return;

    const fromIndex = openViewIds.indexOf(draggedViewId);
    const toIndex = openViewIds.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    openViewIds.splice(fromIndex, 1);
    openViewIds.splice(toIndex, 0, draggedViewId);
    try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}

    reorderMainSections();
    setupSectionDividers();
    updateSectionMoveButtons();
  });

  sec.querySelector('.section-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sec.dataset.id) closeView(sec.dataset.id);
  });

  sec.querySelector('.btn-move-prev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sec.dataset.id) moveView(sec.dataset.id, -1);
  });

  sec.querySelector('.btn-move-next')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sec.dataset.id) moveView(sec.dataset.id, 1);
  });
}

function setupSectionInteractions() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  mainEl.querySelectorAll('.main-section').forEach(sec => {
    if (!sec.dataset.id) return;
    bindSectionInteractions(sec);
  });
}

function applyViewVisibility() {
  const viewMap = {
    bases: document.querySelector('.bases-view') || document.getElementById('section-bases'),
    board: document.querySelector('.board-view') || document.getElementById('section-board'),
    graph: document.querySelector('.graph-view') || document.getElementById('section-graph'),
    calendar: document.querySelector('.calendar-view') || document.getElementById('section-calendar'),
    docs: document.querySelector('.docs-section') || document.getElementById('section-docs'),
    templates: document.querySelector('.templates-gallery-view') || document.getElementById('section-templates')
  };

  for (const [id, el] of Object.entries(viewMap)) {
    if (!el) continue;
    const isSectionOpen = openViewIds.includes(id);

    if (isDesktopMode()) {
      el.hidden = !isSectionOpen;
      if (id === 'docs') el.classList.toggle('is-collapsed', !isSectionOpen);

      const sectionWrap = el.closest('.main-section') || el;
      if (sectionWrap && sectionWrap.classList.contains('main-section')) {
        sectionWrap.style.display = isSectionOpen ? 'flex' : 'none';
        sectionWrap.classList.toggle('is-focused', focusedViewId === id);
      }
    }
  }

  // Tiles de nota (a .note-section ativa + placeholders das demais abertas)
  // só existem no DOM enquanto abertas — sempre visíveis quando presentes,
  // só o foco visual varia.
  if (isDesktopMode()) {
    const noteSectionEl = document.querySelector('.note-section');
    if (noteSectionEl) {
      const hasActiveNote = activeNoteId != null;
      noteSectionEl.hidden = !hasActiveNote;
      noteSectionEl.style.display = hasActiveNote ? 'flex' : 'none';
      noteSectionEl.classList.toggle('is-focused', hasActiveNote && focusedViewId === noteSectionEl.dataset.id);
    }
    document.querySelectorAll('.note-placeholder-section').forEach(sec => {
      sec.hidden = false;
      sec.style.display = 'flex';
      sec.classList.toggle('is-focused', focusedViewId === sec.dataset.id);
    });
  }

  // Notifica os módulos correspondentes via evento de atualização nativo em document
  triggerOpenViewsRefresh();

  updateEmptyState();
}

export function triggerOpenViewsRefresh() {
  const notify = () => {
    if (openViewIds.includes('board')) {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-board-view'));
    }
    if (openViewIds.includes('graph')) {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-graph-view'));
    }
    if (openViewIds.includes('calendar')) {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view'));
    }
    if (openViewIds.includes('bases')) {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-bases-view'));
    }
    if (openViewIds.includes('templates')) {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-templates-gallery'));
    }
    if (openViewIds.includes('docs')) {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-documents'));
    }
    window.dispatchEvent(new CustomEvent('resize'));
  };

  notify();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      notify();
    });
  }
}

export function toggleView(viewId) {
  if (openViewIds.includes(viewId)) {
    closeView(viewId);
  } else {
    openOrFocusView(viewId);
  }
}

if (typeof window !== 'undefined') {
  window.quickdockToggleView = toggleView;
  window.quickdockOpenView = openOrFocusView;
}

// ── Estado Vazio (nenhuma view aberta) — igual ao design-pattern original ────
function updateEmptyState() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl || !isDesktopMode()) return;

  const hasAnythingOpen = openViewIds.length > 0 || activeNoteId != null;
  let emptyEl = mainEl.querySelector('.empty-state');

  if (hasAnythingOpen) {
    emptyEl?.remove();
    return;
  }
  if (emptyEl) return;

  emptyEl = document.createElement('div');
  emptyEl.className = 'empty-state';
  emptyEl.innerHTML = `
    <div class="empty-state-icon"><span class="material-symbols-rounded">layers_clear</span></div>
    <h2 class="empty-state-title">Nenhuma view aberta</h2>
    <p class="empty-state-desc">Escolha uma view no menu lateral ou crie uma nova nota pra começar.</p>
    <button id="btnOpenDefault" class="empty-state-btn" type="button">
      <span class="material-symbols-rounded">add</span> Nova nota
    </button>
  `;
  emptyEl.querySelector('#btnOpenDefault')?.addEventListener('click', () => {
    document.getElementById('btn-new-note')?.click();
  });
  mainEl.appendChild(emptyEl);
}

// ── Divisórias de Redimensionamento (.section-divider com 3 pontos) ───────────
function setupSectionDividers() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  // Remove divisórias anteriores
  mainEl.querySelectorAll('.section-divider').forEach(d => d.remove());

  const visibleSections = [...mainEl.querySelectorAll('.main-section')].filter(s => s.style.display !== 'none' && !s.hidden);
  if (visibleSections.length <= 1) return;

  for (let i = 0; i < visibleSections.length - 1; i++) {
    const secA = visibleSections[i];
    const secB = visibleSections[i + 1];

    const divider = document.createElement('div');
    divider.className = 'section-divider';
    divider.title = 'Arraste para redimensionar';
    divider.innerHTML = `<span class="indicator-dots"><i class="dot"></i><i class="dot"></i><i class="dot"></i></span>`;

    let isDragging = false;
    let startPos = 0;
    let startFlexA = 1;
    let startFlexB = 1;

    divider.addEventListener('mousedown', (e) => {
      isDragging = true;
      const isSide = layoutMode === 'side-by-side';
      startPos = isSide ? e.clientX : e.clientY;
      startFlexA = parseFloat(secA.style.flexGrow) || 1;
      startFlexB = parseFloat(secB.style.flexGrow) || 1;

      document.body.classList.add(isSide ? 'is-resizing-col' : 'is-resizing-row');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const isSide = layoutMode === 'side-by-side';
      const currentPos = isSide ? e.clientX : e.clientY;
      const delta = (currentPos - startPos) * 0.005;

      const newFlexA = Math.max(0.2, startFlexA + delta);
      const newFlexB = Math.max(0.2, startFlexB - delta);

      secA.style.setProperty('flex-grow', String(newFlexA), 'important');
      secB.style.setProperty('flex-grow', String(newFlexB), 'important');
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('is-resizing-col', 'is-resizing-row');
      window.dispatchEvent(new CustomEvent('resize'));
      triggerOpenViewsRefresh();
    });

    secA.after(divider);
  }
}

// ── Omnibar Universal de Busca Inteligente (Ctrl + K) ─────────────────────────
function setupOmnibar() {
  const searchBar = document.getElementById('smartSearchBar');
  const searchInput = document.getElementById('smartSearchInput');
  const dropdown = document.getElementById('searchDropdown');
  const resultsContainer = document.getElementById('searchResults');
  if (!searchBar || !searchInput || !dropdown || !resultsContainer) return;

  searchBar.addEventListener('click', () => searchInput.focus());

  searchInput.addEventListener('focus', () => {
    renderOmnibarResults(searchInput.value.trim());
    dropdown.style.display = 'block';
  });

  searchInput.addEventListener('input', () => {
    searchActiveIdx = -1;
    renderOmnibarResults(searchInput.value.trim());
    dropdown.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      searchActiveIdx = -1;
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      searchInput.blur();
      e.preventDefault();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (searchCandidates.length === 0) return;

      const direction = e.shiftKey ? -1 : 1;
      searchActiveIdx = (searchActiveIdx + direction + searchCandidates.length) % searchCandidates.length;
      updateActiveResultUI();

      const candidate = searchCandidates[searchActiveIdx];
      if (candidate && candidate.autocompleteTerm) {
        searchInput.value = candidate.autocompleteTerm;
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchCandidates.length === 0) return;
      searchActiveIdx = (searchActiveIdx + 1) % searchCandidates.length;
      updateActiveResultUI();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchCandidates.length === 0) return;
      searchActiveIdx = (searchActiveIdx - 1 + searchCandidates.length) % searchCandidates.length;
      updateActiveResultUI();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchCandidates.length > 0 && searchActiveIdx >= 0) {
        const item = searchCandidates[searchActiveIdx];
        if (item && item.action) {
          item.action();
          dropdown.style.display = 'none';
          searchInput.blur();
        }
      }
    }
  });
}

function updateActiveResultUI() {
  const container = document.getElementById('searchResults');
  if (!container) return;
  const items = container.querySelectorAll('.search-item');
  items.forEach((it, idx) => {
    it.classList.toggle('is-selected', idx === searchActiveIdx);
    if (idx === searchActiveIdx) {
      it.scrollIntoView({ block: 'nearest' });
    }
  });
}

async function renderOmnibarResults(query) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  container.innerHTML = '';
  searchCandidates = [];

  const rawTokens = query.split(/\s+/).filter(Boolean);
  const cleanTokens = rawTokens.filter(t => !STOPWORDS.has(normalizeStr(t)));

  const isCommandQuery = query.startsWith('>');
  const isViewQuery = query.startsWith('#');

  // 1. Categoria: Comandos do Workspace
  const commands = [
    { title: 'Alternar Layout (Lado a Lado / Empilhado)', desc: 'Alt + L', action: () => toggleLayout() },
    { title: 'Nova Nota', desc: 'Criar uma nova página de notas', action: () => document.getElementById('btn-new-note')?.click() },
    { title: 'Abrir Todas as Views', desc: 'Espalhar todas as views no workspace', action: () => {
        const noteIds = openViewIds.filter(id => id.startsWith('note-'));
        openViewIds = [...noteIds, ...SHELL_VIEWS.filter(v => v.id !== 'notes').map(v => v.id)];
        applyViewVisibility();
        renderAsideViewList();
        setupSectionDividers();
        updateSectionMoveButtons();
      } },
    { title: 'Fechar Todas as Views', desc: 'Mostrar o estado vazio (nenhuma view aberta)', action: async () => {
        for (const id of [...openNoteIds]) await closeTab(id);
        openViewIds = [];
        focusedViewId = null;
        applyViewVisibility();
        renderAsideViewList();
        setupSectionDividers();
        updateSectionMoveButtons();
      } }
  ];

  // 2. Categoria: Views
  const viewResults = SHELL_VIEWS.map(v => ({
    title: v.title,
    desc: v.desc,
    icon: v.icon,
    autocompleteTerm: `#${v.title.toLowerCase()}`,
    action: () => openOrFocusView(v.id)
  }));

  // Renderiza Comandos se aplicável
  if (isCommandQuery || !isViewQuery) {
    const matchingCmds = commands.filter(c => !query || normalizeStr(c.title).includes(normalizeStr(query.replace('>', ''))));
    if (matchingCmds.length > 0) {
      const cat = document.createElement('div');
      cat.className = 'search-category-title';
      cat.textContent = 'COMANDOS DO SISTEMA';
      container.appendChild(cat);

      for (const cmd of matchingCmds) {
        const itemEl = document.createElement('div');
        itemEl.className = 'search-item';
        itemEl.innerHTML = `
          <span class="search-item-icon material-symbols-rounded">terminal</span>
          <div class="search-item-info">
            <span class="search-item-title">${highlightTokens(cmd.title, cleanTokens)}</span>
            <span class="search-item-sub">${cmd.desc}</span>
          </div>
          <span class="search-item-hint">Executar</span>
        `;
        itemEl.addEventListener('click', () => {
          cmd.action();
          const dd = document.getElementById('searchDropdown');
          if (dd) dd.style.display = 'none';
        });
        container.appendChild(itemEl);
        searchCandidates.push(cmd);
      }
    }
  }

  // Renderiza Views
  const matchingViews = viewResults.filter(v => !query || normalizeStr(v.title).includes(normalizeStr(query.replace('#', ''))));
  if (matchingViews.length > 0) {
    const cat = document.createElement('div');
    cat.className = 'search-category-title';
    cat.textContent = 'VISUALIZAÇÕES (VIEWS)';
    container.appendChild(cat);

    for (const v of matchingViews) {
      const itemEl = document.createElement('div');
      itemEl.className = 'search-item';
      itemEl.innerHTML = `
        <span class="search-item-icon material-symbols-rounded">${v.icon}</span>
        <div class="search-item-info">
          <span class="search-item-title">${highlightTokens(v.title, cleanTokens)}</span>
          <span class="search-item-sub">${v.desc}</span>
        </div>
        <span class="search-item-hint">Focar</span>
      `;
      itemEl.addEventListener('click', () => {
        v.action();
        const dd = document.getElementById('searchDropdown');
        if (dd) dd.style.display = 'none';
      });
      container.appendChild(itemEl);
      searchCandidates.push(v);
    }
  }

  // 3. Categoria: Notas Salvas
  if (!isCommandQuery && !isViewQuery && query.length >= 1) {
    try {
      const notesMeta = await loadAllNotesMeta();
      if (Array.isArray(notesMeta)) {
        const matchingNotes = notesMeta.filter(n => {
          const title = normalizeStr(n.title || 'Sem título');
          return cleanTokens.every(tok => title.includes(normalizeStr(tok)));
        }).slice(0, 6);

        if (matchingNotes.length > 0) {
          const cat = document.createElement('div');
          cat.className = 'search-category-title';
          cat.textContent = 'NOTAS';
          container.appendChild(cat);

          for (const note of matchingNotes) {
            const noteObj = {
              title: note.title || 'Sem título',
              desc: note.pasta ? `Pasta: ${note.pasta}` : 'Nota',
              action: () => {
                document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: note.id } }));
              }
            };
            const itemEl = document.createElement('div');
            itemEl.className = 'search-item';
            itemEl.innerHTML = `
              <span class="search-item-icon material-symbols-rounded">${note.isBase ? 'table_rows' : 'description'}</span>
              <div class="search-item-info">
                <span class="search-item-title">${highlightTokens(noteObj.title, cleanTokens)}</span>
                <span class="search-item-sub">${noteObj.desc}</span>
              </div>
              <span class="search-item-hint">Abrir</span>
            `;
            itemEl.addEventListener('click', () => {
              noteObj.action();
              const dd = document.getElementById('searchDropdown');
              if (dd) dd.style.display = 'none';
            });
            container.appendChild(itemEl);
            searchCandidates.push(noteObj);
          }
        }
      }
    } catch {}
  }

  if (searchCandidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-no-results';
    empty.textContent = 'Nenhum resultado encontrado para a busca.';
    container.appendChild(empty);
  }
}

// ── Atalhos de Teclado Globais ("Mãos no Teclado") ───────────────────────────
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Ctrl + K ou Ctrl + P -> Focar Omnibar
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'p' || e.key === 'K' || e.key === 'P')) {
      e.preventDefault();
      const searchInput = document.getElementById('smartSearchInput');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // Alt + L -> Alternar Layout Empilhado vs Lado a Lado
    if (e.altKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      toggleLayout();
      return;
    }

    // Alt + W -> Fechar View em Foco
    if (e.altKey && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      closeView(focusedViewId);
      return;
    }

    // Alt + [ ou Alt + ] -> Ciclar Foco de View
    if (e.altKey && (e.key === '[' || e.key === ']')) {
      e.preventDefault();
      if (openViewIds.length === 0) return;
      const curIdx = openViewIds.indexOf(focusedViewId);
      const direction = e.key === ']' ? 1 : -1;
      const nextIdx = (curIdx + direction + openViewIds.length) % openViewIds.length;
      openOrFocusView(openViewIds[nextIdx]);
      return;
    }

    // Alt + 1..9 -> Focar View por Índice
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < openViewIds.length) {
        e.preventDefault();
        openOrFocusView(openViewIds[idx]);
      }
    }
  });
}
