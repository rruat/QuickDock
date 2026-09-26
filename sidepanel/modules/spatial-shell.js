// ── spatial-shell.js ────────────────────────────────────────────────────────
// Controlador do Spatial Shell Workspace (Layout IDE inspirado no design-pattern)
// Gerencia:
// 1. Omnibar universal com busca multi-token, stopwords, autocomplete por Tab e notas
// 2. Activity Bar (#mNav) e Aside (#mAside) com redimensionamento de 3 pontos
// 3. Main Workspace (#mMain) com layouts Lado a Lado e Empilhado
// 4. Seções (.main-section) com cabeçalho, indicador 'Em Foco', reordenação e divisórias
// 5. Atalhos globais de teclado ('Mãos no Teclado': Ctrl+K, Alt+L, Alt+[], Alt+1..9)

import { isDesktopMode, isMobileMode } from './platform.js';
import { loadAllNotesMeta } from './storage.js';
import { getOpenTabsSnapshot, closeTab } from './notes-tabs.js';

const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'com', 'por', 'para', 'pra', 'x', 'vs']);

// Views disponíveis no QuickDock
export const SHELL_VIEWS = [
  { id: 'notes', title: 'Notas', icon: 'description', desc: 'Editor de texto e sumário' },
  { id: 'bases', title: 'Bases', icon: 'table_rows', desc: 'Tabela, Kanban, Galeria e Lista' },
  { id: 'board', title: 'Espaço', icon: 'space_dashboard', desc: 'Quadro espacial infinito' },
  { id: 'graph', title: 'Constelações', icon: 'hub', desc: 'Grafo de conexões entre notas' },
  { id: 'calendar', title: 'Calendário', icon: 'calendar_today', desc: 'Visão temporal de eventos e notas' },
  { id: 'docs', title: 'Documentos', icon: 'attach_file', desc: 'Anexos e arquivos da nota' },
  { id: 'templates', title: 'Modelos', icon: 'auto_stories', desc: 'Galeria de modelos prontos' },
  { id: 'settings', title: 'Configurações', icon: 'settings', desc: 'Preferências do Spatial Shell' }
];

let openViewIds = [];
let focusedViewId = null;
let layoutMode = 'side-by-side'; // 'side-by-side' ou 'stacked'
let searchActiveIdx = -1;
let searchCandidates = [];
let draggedViewId = null; // reordenação de views por arrastar o .section-header
let activeNoteId = null;

// 'add' (padrão): clicar numa view fechada ACRESCENTA às já abertas; segurar
// Shift inverte pra substituir. 'replace': clicar SUBSTITUI; Shift acrescenta.
// Configurável na view "Configurações" (id 'settings').
let openViewsMode = 'add';

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

  // Carrega preferências salvas
  try {
    const savedLayout = localStorage.getItem('quickdock:spatial:layout-mode');
    if (savedLayout === 'stacked' || savedLayout === 'side-by-side') {
      layoutMode = savedLayout;
    }
    const savedOpenViews = localStorage.getItem('quickdock:spatial:open-views');
    if (savedOpenViews) {
      const parsed = JSON.parse(savedOpenViews);
      if (Array.isArray(parsed)) {
        openViewIds = parsed
          .map(id => (typeof id === 'string' && id.startsWith('note-')) ? 'notes' : id)
          .filter(id => SHELL_VIEWS.some(v => v.id === id));
        openViewIds = [...new Set(openViewIds)];
      }
    }
    const savedOpenMode = localStorage.getItem('quickdock:spatial:open-view-mode');
    if (savedOpenMode === 'add' || savedOpenMode === 'replace') {
      openViewsMode = savedOpenMode;
    }
  } catch {}

  if (openViewIds.length === 0) {
    openViewIds = ['notes'];
  }

  // Garante que todas as seções de view de primeiro nível no mMain tenham a classe main-section
  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.querySelectorAll(':scope > [data-id]').forEach(sec => sec.classList.add('main-section'));
  }

  setupLayoutMode();
  setupActivityBar();
  setupHeaderMenu();
  setupAside();
  setupOmnibar();
  setupKeyboardShortcuts();
  setupSectionInteractions();
  setupSettingsView();
  setupMobileTouchGestures();

  document.addEventListener('quickdock:active-note-changed', e => {
    activeNoteId = e.detail?.id;
    updateNoteSectionHeader();
  });
  document.addEventListener('quickdock:notes-open-tabs-changed', e => {
    activeNoteId = e.detail?.activeId;
    updateNoteSectionHeader();
    syncNoteViews(e.detail || {});
  });
  document.addEventListener('quickdock:activate-note', () => {
    const asideEl = document.getElementById('mAside');
    if (asideEl && (window.innerWidth <= 768 || isMobileMode())) {
      asideEl.classList.remove('is-open-mobile');
    }
    openOrFocusView('notes');
  });
  document.addEventListener('click', (e) => {
    const asideEl = document.getElementById('mAside');
    if (!asideEl || !asideEl.classList.contains('is-open-mobile')) return;
    if (asideEl.contains(e.target) || e.target.closest('#mNav') || e.target.closest('#navItemExplorer')) return;
    asideEl.classList.remove('is-open-mobile');
  });
  syncNoteViews(typeof getOpenTabsSnapshot === 'function' ? getOpenTabsSnapshot() : {});

  setAsideMode('notes');
  updateNoteSectionHeader();
  applyViewVisibility();
  renderAsideViewList();
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
    item.addEventListener('click', (e) => {
      const viewId = item.dataset.navView;
      if (!viewId) return;

      navEl.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('is-active', i === item));
      const asideEl = document.getElementById('mAside');
      if (viewId === 'notes') {
        setAsideMode('notes');
        if (asideEl && (window.innerWidth <= 768 || isMobileMode())) {
          asideEl.classList.toggle('is-open-mobile');
        }
      } else {
        if (asideEl && (window.innerWidth <= 768 || isMobileMode())) {
          asideEl.classList.remove('is-open-mobile');
        }
      }
      openOrFocusView(viewId, { invertMode: e.shiftKey });
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
          openOrFocusView('notes');
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

// ── View "Configurações" (Mosaico de Views: acrescentar vs substituir) ──────
function setupSettingsView() {
  const addRadio = document.getElementById('settings-open-mode-add');
  const replaceRadio = document.getElementById('settings-open-mode-replace');
  if (!addRadio || !replaceRadio) return;

  addRadio.checked = openViewsMode === 'add';
  replaceRadio.checked = openViewsMode === 'replace';

  const applyMode = (mode) => {
    openViewsMode = mode;
    try { localStorage.setItem('quickdock:spatial:open-view-mode', mode); } catch {}
  };

  addRadio.addEventListener('change', () => { if (addRadio.checked) applyMode('add'); });
  replaceRadio.addEventListener('change', () => { if (replaceRadio.checked) applyMode('replace'); });
}

export function renderAsideViewList() {
  const listEl = document.getElementById('asideSectionList');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const v of SHELL_VIEWS) {
    const isOpen = openViewIds.includes(v.id);
    const isFocused = focusedViewId === v.id;

    const item = document.createElement('div');
    item.className = `aside-section-item ${isOpen ? 'is-open' : ''} ${isFocused ? 'is-focused' : ''}`;
    item.innerHTML = `
      <div class="aside-item-icon">
        <span class="material-symbols-rounded">${v.icon}</span>
      </div>
      <span class="aside-item-title">${v.title}</span>
      <span class="aside-item-badge">${isOpen ? 'Aberta' : 'Abrir'}</span>
    `;

    item.addEventListener('click', (e) => {
      openOrFocusView(v.id, { invertMode: e.shiftKey });
    });

    listEl.appendChild(item);
  }
}

// ── Sub-painel do #mAside (Explorador de Notas vs Lista de Views) ────────────
export function setAsideMode(mode) {
  const asideEl = document.getElementById('mAside');
  if (!asideEl) return;
  const isNotes = mode === 'notes';
  asideEl.classList.toggle('mode-notes', isNotes);
  asideEl.classList.toggle('mode-views', !isNotes);
}

// ── Atualização do cabeçalho da seção de Notas ──────────────────────────────
export function updateNoteSectionHeader() {
  const noteSectionEl = document.getElementById('section-note') || document.querySelector('.note-section');
  if (!noteSectionEl) return;
  noteSectionEl.dataset.id = 'notes';

  const titleEl = document.getElementById('note-header-title');
  const noteTitle = (titleEl?.textContent || '').trim() || 'Notas';
  const secTitleEl = noteSectionEl.querySelector(':scope > .section-header .section-title');
  if (secTitleEl) secTitleEl.textContent = noteTitle;
}

export function focusNoteViewId(viewId) {
  setAsideMode('notes');
  openOrFocusView(viewId);
}

export function syncNoteViews(snapshot = {}) {
  updateNoteSectionHeader();
}

export function syncNoteSectionDOM() {}

export function buildNotePlaceholderSection() {}

// ── Gestão de Views Abertas e Foco ────────────────────────────────────────────
export function openOrFocusView(viewId, { invertMode = false } = {}) {
  let targetViewId = viewId;
  let targetNoteId = null;

  if (viewId && viewId.startsWith('note-')) {
    setAsideMode('notes');
    targetViewId = 'notes';
    targetNoteId = Number(viewId.slice(5));
    document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: targetNoteId } }));
  }

  if (targetViewId === 'notes') {
    setAsideMode('notes');
    if (targetNoteId != null) {
      document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: targetNoteId } }));
    }
  }

  if (!SHELL_VIEWS.some(v => v.id === targetViewId)) return;

  // Mosaico multi-view: por padrão ('add'), abrir uma view ACRESCENTA às já
  // abertas; segurar Shift (invertMode) troca pra substituir só desta vez.
  // Com o modo 'replace' escolhido em Configurações, a lógica se inverte:
  // clique normal substitui, Shift acrescenta. Uma versão anterior sempre
  // substituía no clique normal (só acrescentava com Shift) sem nenhuma
  // forma de mudar isso — um atalho invisível que na prática deixava só uma
  // view abrir por vez.
  if (!openViewIds.includes(targetViewId)) {
    const wantsAdd = invertMode ? openViewsMode === 'replace' : openViewsMode === 'add';
    if (wantsAdd) {
      openViewIds.push(targetViewId);
    } else {
      openViewIds = [targetViewId];
    }
  }
  try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}
  focusedViewId = targetViewId;

  const navEl = document.getElementById('mNav');
  if (navEl) {
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === targetViewId);
    });
  }

  reorderMainSections();
  applyViewVisibility();
  renderAsideViewList();
  setupSectionDividers();
  updateSectionMoveButtons();

  // No mobile, transiciona suavemente o carrossel de cards até a view em foco
  if (window.innerWidth <= 768 || isMobileMode()) {
    transitionToMobileCard(targetViewId, 'auto');
  }

  // Atualiza rodapé
  const footerLabel = document.getElementById('footer-active-view-name');
  if (footerLabel) {
    const viewMeta = SHELL_VIEWS.find(v => v.id === targetViewId);
    footerLabel.textContent = viewMeta ? viewMeta.title : targetViewId;
  }
}

export function closeView(viewId) {
  let targetId = viewId;
  if (viewId && viewId.startsWith('note-')) {
    if (typeof closeTab === 'function') closeTab(Number(viewId.slice(5)));
    targetId = 'notes';
  }

  openViewIds = openViewIds.filter(id => id !== targetId);
  try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}

  const normPanel = (targetId === 'graph') ? 'grafo' : targetId;
  document.dispatchEvent(new CustomEvent('quickdock:panel-closed', { detail: { panel: normPanel } }));

  if (focusedViewId === targetId) {
    focusedViewId = openViewIds[openViewIds.length - 1] || null;
  }
  const navEl = document.getElementById('mNav');
  if (navEl && focusedViewId) {
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === focusedViewId);
    });
  }

  applyViewVisibility();
  renderAsideViewList();
  setupSectionDividers();
  updateSectionMoveButtons();
}

function reorderMainSections() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;
  const currentSections = Array.from(mainEl.querySelectorAll(':scope > [data-id]'));
  const currentOrder = currentSections.map(s => s.dataset.id).filter(id => openViewIds.includes(id));
  const isSameOrder = openViewIds.length === currentOrder.length && openViewIds.every((id, idx) => currentOrder[idx] === id);
  if (isSameOrder) return;

  const savedScroll = mainEl.scrollLeft;
  for (const id of openViewIds) {
    const sec = mainEl.querySelector(`:scope > [data-id="${id}"]`);
    if (sec) mainEl.appendChild(sec);
  }
  mainEl.scrollLeft = savedScroll;
}

export function moveView(viewId, direction) {
  let targetId = viewId;
  if (viewId && viewId.startsWith('note-')) {
    targetId = 'notes';
  }
  const curIdx = openViewIds.indexOf(targetId);
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
    const sec = mainEl.querySelector(`:scope > [data-id="${id}"]`);
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
    if (window.innerWidth <= 768 || isMobileMode()) return;
    const id = sec.dataset.id;
    if (!id) return;
    focusedViewId = id;
    updateSectionMoveButtons();
    renderAsideViewList();
  });

  sec.addEventListener('focusin', () => {
    if (window.innerWidth <= 768 || isMobileMode()) return;
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
    notes: document.getElementById('section-note') || document.querySelector('.note-section'),
    bases: document.querySelector('.bases-view') || document.getElementById('section-bases'),
    board: document.querySelector('.board-view') || document.getElementById('section-board'),
    graph: document.querySelector('.graph-view') || document.getElementById('section-graph'),
    calendar: document.querySelector('.calendar-view') || document.getElementById('section-calendar'),
    docs: document.querySelector('.docs-section') || document.getElementById('section-docs'),
    templates: document.querySelector('.templates-gallery-view') || document.getElementById('section-templates'),
    settings: document.querySelector('.settings-view') || document.getElementById('settings-view')
  };

  for (const [id, el] of Object.entries(viewMap)) {
    if (!el) continue;
    const isSectionOpen = openViewIds.includes(id);

    el.hidden = !isSectionOpen;
    if (id === 'docs') el.classList.toggle('is-collapsed', !isSectionOpen);

    if (isSectionOpen) {
      el.style.setProperty('display', 'flex', 'important');
    } else {
      el.style.setProperty('display', 'none', 'important');
    }
    el.classList.toggle('is-focused', focusedViewId === id);
  }

  // Remove qualquer placeholder residual de nota caso exista
  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.querySelectorAll('.note-placeholder-section').forEach(sec => sec.remove());
    if (openViewIds.length <= 1) {
      mainEl.querySelectorAll('.main-section').forEach(s => {
        s.style.removeProperty('flex');
        s.style.removeProperty('flex-grow');
        s.style.removeProperty('width');
      });
    }
  }

  triggerOpenViewsRefresh();
  updateEmptyState();
  if (window.innerWidth <= 768 || isMobileMode()) {
    updateMobileCarouselPositions(false);
  } else {
    const mainEl = document.getElementById('mMain');
    if (mainEl) {
      mainEl.querySelectorAll('.main-section').forEach(sec => {
        sec.style.removeProperty('transform');
        sec.style.removeProperty('transition');
        sec.style.removeProperty('visibility');
        sec.style.removeProperty('opacity');
        sec.style.removeProperty('z-index');
        sec.style.removeProperty('pointer-events');
      });
    }
  }
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
  if (!mainEl) return;

  const hasAnythingOpen = openViewIds.length > 0;
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
    openOrFocusView('notes');
  });
  mainEl.appendChild(emptyEl);
}

// ── Divisórias de Redimensionamento (.section-divider com 3 pontos) ───────────
function setupSectionDividers() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  // Remove divisórias anteriores
  mainEl.querySelectorAll('.section-divider').forEach(d => d.remove());

  // Apenas as seções que estão REALMENTE abertas em openViewIds
  // e presentes como filhas diretas visíveis de #mMain
  const visibleSections = openViewIds
    .map(id => mainEl.querySelector(`:scope > [data-id="${id}"]`))
    .filter(sec => {
      if (!sec || sec.hidden || sec.classList.contains('is-collapsed')) return false;
      const compDisplay = (typeof window !== 'undefined' && window.getComputedStyle)
        ? window.getComputedStyle(sec).display
        : sec.style.display;
      return compDisplay !== 'none' && sec.style.display !== 'none';
    });

  if (visibleSections.length <= 1) {
    visibleSections.forEach(s => {
      s.style.removeProperty('flex');
      s.style.removeProperty('flex-grow');
      s.style.removeProperty('width');
    });
    return;
  }

  for (let i = 0; i < visibleSections.length - 1; i++) {
    const secA = visibleSections[i];
    const secB = visibleSections[i + 1];

    const divider = document.createElement('div');
    divider.className = 'section-divider';
    divider.title = 'Arraste para redimensionar';
    divider.innerHTML = `<span class="indicator-dots"><i class="dot"></i><i class="dot"></i><i class="dot"></i></span>`;

    divider.addEventListener('mousedown', (e) => {
      const isSide = layoutMode === 'side-by-side';
      const startPos = isSide ? e.clientX : e.clientY;
      const rectA = secA.getBoundingClientRect();
      const rectB = secB.getBoundingClientRect();
      const startDimA = isSide ? rectA.width : rectA.height;
      const startDimB = isSide ? rectB.width : rectB.height;
      const totalDim = startDimA + startDimB;

      document.body.classList.add(isSide ? 'is-resizing-col' : 'is-resizing-row');
      e.preventDefault();

      const onMouseMove = (ev) => {
        const currentPos = isSide ? ev.clientX : ev.clientY;
        const delta = currentPos - startPos;
        const minDim = 120;
        const newDimA = Math.max(minDim, Math.min(totalDim - minDim, startDimA + delta));
        const newDimB = totalDim - newDimA;

        secA.style.setProperty('flex', `${newDimA} ${newDimA} 0px`, 'important');
        secB.style.setProperty('flex', `${newDimB} ${newDimB} 0px`, 'important');
      };

      const onMouseUp = () => {
        document.body.classList.remove('is-resizing-col', 'is-resizing-row');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.dispatchEvent(new CustomEvent('resize'));
        triggerOpenViewsRefresh();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
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
        openViewIds = SHELL_VIEWS.map(v => v.id);
        applyViewVisibility();
        renderAsideViewList();
        setupSectionDividers();
        updateSectionMoveButtons();
      } },
    { title: 'Fechar Todas as Views', desc: 'Mostrar o estado vazio (nenhuma view aberta)', action: async () => {
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
                openOrFocusView('notes');
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

// ── Gerenciador de Carrossel Infinito com Transição Unidirecional no Mobile ─
let mobileActiveIndex = 0;
let isMobileSwiping = false;
let isSwipingHorizontal = false;
let mobileTouchStartX = 0;
let mobileTouchStartY = 0;
let mobileCurrentDiffX = 0;
let mobileHasVibrated = false;
let mobileCurrentCard = null;
let mobileTargetCard = null;
let mobileIsAnimating = false;

function triggerWallHaptic() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      // Impacto duplo firme: sensação física de colisão ("batendo em uma parede")
      navigator.vibrate([28, 14, 32]);
    } catch (_) {}
  }
}

function triggerSnapHaptic() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(20);
    } catch (_) {}
  }
}

function getOpenMobileSections() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return [];
  return openViewIds
    .map(id => mainEl.querySelector(`:scope > [data-id="${id}"]`))
    .filter(sec => sec && !sec.hidden && sec.style.display !== 'none');
}

function syncMobileActiveViewUI(activeId) {
  if (!activeId) return;

  const navEl = document.getElementById('mNav');
  if (navEl) {
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === activeId);
    });
  }

  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.querySelectorAll('.main-section').forEach(sec => {
      sec.classList.toggle('is-focused', sec.dataset.id === activeId);
    });
  }

  const footerLabel = document.getElementById('footer-active-view-name');
  if (footerLabel) {
    const viewMeta = SHELL_VIEWS.find(v => v.id === activeId);
    footerLabel.textContent = viewMeta ? viewMeta.title : activeId;
  }
}

export function updateMobileCarouselPositions(animated = false) {
  if (window.innerWidth > 768 && !isMobileMode()) {
    const mainEl = document.getElementById('mMain');
    if (mainEl) {
      mainEl.querySelectorAll('.main-section').forEach(sec => {
        sec.style.removeProperty('transform');
        sec.style.removeProperty('transition');
        sec.style.removeProperty('visibility');
        sec.style.removeProperty('opacity');
        sec.style.removeProperty('z-index');
        sec.style.removeProperty('pointer-events');
      });
    }
    return;
  }

  const sections = getOpenMobileSections();
  if (sections.length === 0) return;

  if (focusedViewId) {
    const idx = sections.findIndex(s => s.dataset.id === focusedViewId);
    if (idx !== -1) mobileActiveIndex = idx;
  }
  if (mobileActiveIndex < 0 || mobileActiveIndex >= sections.length) {
    mobileActiveIndex = 0;
  }

  sections.forEach((sec, idx) => {
    sec.style.transition = animated ? 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1), opacity 260ms ease' : 'none';
    if (idx === mobileActiveIndex) {
      sec.style.transform = 'translate3d(0, 0, 0)';
      sec.style.opacity = '1';
      sec.style.pointerEvents = 'auto';
      sec.style.zIndex = '2';
      sec.style.visibility = 'visible';
    } else {
      sec.style.transform = 'translate3d(100vw, 0, 0)';
      sec.style.opacity = '0';
      sec.style.pointerEvents = 'none';
      sec.style.zIndex = '1';
      sec.style.visibility = 'hidden';
    }
  });

  const activeSec = sections[mobileActiveIndex];
  if (activeSec && activeSec.dataset.id) {
    focusedViewId = activeSec.dataset.id;
    syncMobileActiveViewUI(focusedViewId);
  }
}

export function transitionToMobileCard(targetId, preferredDirection = 'auto') {
  if (window.innerWidth > 768 && !isMobileMode()) return;
  const sections = getOpenMobileSections();
  if (sections.length === 0) return;

  const targetIndex = sections.findIndex(s => s.dataset.id === targetId);
  if (targetIndex === -1) return;

  if (targetIndex === mobileActiveIndex) {
    updateMobileCarouselPositions(false);
    return;
  }

  if (mobileIsAnimating) {
    mobileActiveIndex = targetIndex;
    updateMobileCarouselPositions(false);
    return;
  }

  const currentCard = sections[mobileActiveIndex] || sections[0];
  const targetCard = sections[targetIndex];

  let isForward = true;
  if (preferredDirection === 'forward') {
    isForward = true;
  } else if (preferredDirection === 'backward') {
    isForward = false;
  } else {
    isForward = targetIndex > mobileActiveIndex || (mobileActiveIndex === sections.length - 1 && targetIndex === 0);
  }

  const cardWidth = window.innerWidth;
  const enterX = isForward ? cardWidth : -cardWidth;
  const exitX = isForward ? -cardWidth : cardWidth;

  mobileIsAnimating = true;

  targetCard.style.transition = 'none';
  targetCard.style.transform = `translate3d(${enterX}px, 0, 0)`;
  targetCard.style.visibility = 'visible';
  targetCard.style.opacity = '1';
  targetCard.style.zIndex = '2';
  targetCard.style.pointerEvents = 'none';

  void targetCard.offsetWidth; // Força reflow

  currentCard.style.transition = 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1), opacity 260ms ease';
  targetCard.style.transition = 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1), opacity 260ms ease';

  currentCard.style.transform = `translate3d(${exitX}px, 0, 0)`;
  targetCard.style.transform = 'translate3d(0, 0, 0)';

  setTimeout(() => {
    mobileActiveIndex = targetIndex;
    focusedViewId = targetId;
    mobileIsAnimating = false;
    updateMobileCarouselPositions(false);
    window.dispatchEvent(new CustomEvent('resize'));
  }, 270);
}

function onMobileTouchStart(e) {
  if (window.innerWidth > 768 && !isMobileMode()) return;
  if (mobileIsAnimating) return;

  const sections = getOpenMobileSections();
  if (sections.length <= 1) return;

  if (e.target.closest('input, textarea')) return;
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
  if (document.activeElement && document.activeElement.isContentEditable && e.target.closest('[contenteditable="true"]')) return;
  if (e.target.closest('#board-container, #graph-canvas-container, .kanban-board, .table-container')) {
    if (!e.target.closest('.section-header')) return;
  }

  if (!e.touches || e.touches.length === 0) return;

  if (focusedViewId) {
    const idx = sections.findIndex(s => s.dataset.id === focusedViewId);
    if (idx !== -1) mobileActiveIndex = idx;
  }
  if (mobileActiveIndex < 0 || mobileActiveIndex >= sections.length) {
    mobileActiveIndex = 0;
  }

  mobileTouchStartX = e.touches[0].clientX;
  mobileTouchStartY = e.touches[0].clientY;
  mobileCurrentDiffX = 0;
  mobileHasVibrated = false;
  isMobileSwiping = true;
  isSwipingHorizontal = false;

  const activeSec = sections[mobileActiveIndex] || sections[0];
  mobileCurrentCard = activeSec;
  mobileTargetCard = null;
}

function onMobileTouchMove(e) {
  if (!isMobileSwiping || mobileIsAnimating || !mobileCurrentCard) return;
  if (!e.touches || e.touches.length === 0) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - mobileTouchStartX;
  const diffY = currentY - mobileTouchStartY;

  if (!isSwipingHorizontal) {
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 6) {
      isMobileSwiping = false;
      return;
    }
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
      isSwipingHorizontal = true;
    } else {
      return;
    }
  }

  mobileCurrentDiffX = diffX;
  const sections = getOpenMobileSections();
  const N = sections.length;
  if (N <= 1) return;

  const cardWidth = window.innerWidth;
  let targetIndex = -1;

  if (diffX < 0) {
    // Gesto para a esquerda -> Próximo card no sentido do carrossel (1 → 2 → 1)
    targetIndex = (mobileActiveIndex + 1) % N;
  } else if (diffX > 0) {
    // Gesto para a direita -> Card anterior no sentido reverso do carrossel (1 ← 2 ← 1)
    targetIndex = (mobileActiveIndex - 1 + N) % N;
  }

  if (targetIndex !== -1 && targetIndex !== mobileActiveIndex) {
    const newTarget = sections[targetIndex];
    if (mobileTargetCard && mobileTargetCard !== newTarget) {
      mobileTargetCard.style.visibility = 'hidden';
      mobileTargetCard.style.opacity = '0';
    }
    mobileTargetCard = newTarget;
    mobileTargetCard.style.visibility = 'visible';
    mobileTargetCard.style.opacity = '1';
    mobileTargetCard.style.zIndex = '2';
    mobileTargetCard.style.pointerEvents = 'none';
    mobileTargetCard.style.transition = 'none';

    // Se o dedo move para a esquerda (diffX < 0), o próximo card SEMPRE entra pela direita (cardWidth + diffX)
    // Se o dedo move para a direita (diffX > 0), o card anterior SEMPRE entra pela esquerda (-cardWidth + diffX)
    const offset = diffX < 0 ? (cardWidth + diffX) : (-cardWidth + diffX);
    mobileTargetCard.style.transform = `translate3d(${offset}px, 0, 0)`;
  }

  mobileCurrentCard.style.transition = 'none';
  mobileCurrentCard.style.transform = `translate3d(${diffX}px, 0, 0)`;

  // Haptic feedback de impacto firme ("batendo em uma parede") ao cruzar o limiar de 45px
  if (Math.abs(diffX) >= 45) {
    if (!mobileHasVibrated) {
      triggerWallHaptic();
      mobileHasVibrated = true;
    }
  } else {
    mobileHasVibrated = false;
  }
}

function onMobileTouchEnd() {
  if (!isMobileSwiping || mobileIsAnimating || !mobileCurrentCard) return;
  isMobileSwiping = false;

  const sections = getOpenMobileSections();
  const N = sections.length;
  const cardWidth = window.innerWidth;
  const diffX = mobileCurrentDiffX;

  if (N <= 1 || !mobileTargetCard) {
    if (mobileCurrentCard) {
      mobileCurrentCard.style.transition = 'transform 240ms cubic-bezier(0.25, 1, 0.5, 1)';
      mobileCurrentCard.style.transform = 'translate3d(0, 0, 0)';
    }
    mobileCurrentCard = null;
    mobileTargetCard = null;
    return;
  }

  const SWIPE_THRESHOLD = 45;

  if (Math.abs(diffX) >= SWIPE_THRESHOLD) {
    // Troca de card confirmada respeitando estritamente a direção do movimento!
    mobileIsAnimating = true;
    triggerSnapHaptic();

    const isNext = diffX < 0;
    const finalCurrentX = isNext ? -cardWidth : cardWidth;

    mobileCurrentCard.style.transition = 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1), opacity 260ms ease';
    mobileTargetCard.style.transition = 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1), opacity 260ms ease';

    mobileCurrentCard.style.transform = `translate3d(${finalCurrentX}px, 0, 0)`;
    mobileTargetCard.style.transform = 'translate3d(0, 0, 0)';

    const newIndex = isNext ? (mobileActiveIndex + 1) % N : (mobileActiveIndex - 1 + N) % N;
    const newTargetId = sections[newIndex]?.dataset?.id;
    if (newTargetId) {
      focusedViewId = newTargetId;
      syncMobileActiveViewUI(focusedViewId);
    }

    setTimeout(() => {
      mobileActiveIndex = newIndex;
      if (newTargetId) {
        focusedViewId = newTargetId;
      }
      mobileCurrentCard = null;
      mobileTargetCard = null;
      mobileIsAnimating = false;
      updateMobileCarouselPositions(false);
      window.dispatchEvent(new CustomEvent('resize'));
    }, 270);

  } else {
    // Não atingiu a distância mínima: cancela e retorna para a posição de repouso
    mobileIsAnimating = true;
    const resetTargetX = diffX < 0 ? cardWidth : -cardWidth;

    mobileCurrentCard.style.transition = 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)';
    mobileTargetCard.style.transition = 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)';

    mobileCurrentCard.style.transform = 'translate3d(0, 0, 0)';
    mobileTargetCard.style.transform = `translate3d(${resetTargetX}px, 0, 0)`;

    setTimeout(() => {
      mobileCurrentCard = null;
      mobileTargetCard = null;
      mobileIsAnimating = false;
      updateMobileCarouselPositions(false);
    }, 230);
  }
}

function setupMobileTouchGestures() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  window.addEventListener('resize', () => {
    updateMobileCarouselPositions(false);
  });

  mainEl.addEventListener('touchstart', onMobileTouchStart, { passive: true });
  mainEl.addEventListener('touchmove', onMobileTouchMove, { passive: true });
  mainEl.addEventListener('touchend', onMobileTouchEnd, { passive: true });
  mainEl.addEventListener('touchcancel', onMobileTouchEnd, { passive: true });
}

