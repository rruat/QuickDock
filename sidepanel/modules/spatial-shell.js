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
import { setupOmnibar as _setupOmnibar } from './shell/shell-omnibar.js';
import {
  initShellMobile,
  updateMobileCarouselPositions,
  transitionToMobileCard,
  setupMobileTouchGestures
} from './shell/shell-mobile.js';
import {
  reorderMainSections as _reorderMainSections,
  updateSectionMoveButtons as _updateSectionMoveButtons,
  setupSectionDividers as _setupSectionDividers
} from './shell/shell-mosaic.js';

export { updateMobileCarouselPositions, transitionToMobileCard };

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
  { id: 'json', title: 'JSON', icon: 'data_object', desc: 'Visualizador, editor e criador de JSON' },
  { id: 'settings', title: 'Configurações', icon: 'settings', desc: 'Preferências do Spatial Shell' }
];

let openViewIds = [];
let focusedViewId = 'notes';
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
  if (!focusedViewId || !openViewIds.includes(focusedViewId)) {
    focusedViewId = openViewIds[0] || 'notes';
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
  initShellMobile({
    getOpenViewIds: () => openViewIds,
    getFocusedViewId: () => focusedViewId,
    setFocusedViewId: (id) => { focusedViewId = id; }
  });
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
  document.addEventListener('quickdock:open-view', e => {
    const asideEl = document.getElementById('mAside');
    if (asideEl && (window.innerWidth <= 768 || isMobileMode())) {
      asideEl.classList.remove('is-open-mobile');
      document.getElementById('mobileDrawerScrim')?.classList.remove('is-active');
    }
    const viewId = e.detail?.view;
    if (viewId) openOrFocusView(viewId);
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
  const addToggle = document.getElementById('settings-open-mode-add');
  if (!addToggle) return;

  addToggle.checked = openViewsMode === 'add';

  addToggle.addEventListener('change', () => {
    openViewsMode = addToggle.checked ? 'add' : 'replace';
    try { localStorage.setItem('quickdock:spatial:open-view-mode', openViewsMode); } catch {}
  });
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
  _reorderMainSections(openViewIds);
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
  _updateSectionMoveButtons(openViewIds, focusedViewId);
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
    json: document.querySelector('.json-view') || document.getElementById('json-view'),
    settings: document.querySelector('.settings-view') || document.getElementById('settings-view')
  };

  const isMobile = window.innerWidth <= 768 || isMobileMode();
  if (!focusedViewId || !openViewIds.includes(focusedViewId)) {
    focusedViewId = openViewIds[0] || 'notes';
  }
  for (const [id, el] of Object.entries(viewMap)) {
    if (!el) continue;
    const isSectionOpen = openViewIds.includes(id);

    el.hidden = !isSectionOpen;
    if (id === 'docs') el.classList.toggle('is-collapsed', !isSectionOpen);

    if (isSectionOpen) {
      if (!isMobile || focusedViewId === id) {
        el.style.setProperty('display', 'flex', 'important');
      } else {
        el.style.setProperty('display', 'none', 'important');
      }
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
    if (openViewIds.includes('json')) {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-json-view'));
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
  _setupSectionDividers({
    getOpenViewIds: () => openViewIds,
    getLayoutMode: () => layoutMode,
    onRefresh: triggerOpenViewsRefresh
  });
}

// ── Omnibar Universal de Busca Inteligente (Ctrl + K) (delegado para shell/shell-omnibar.js) ─
function setupOmnibar() {
  _setupOmnibar({
    onToggleLayout: toggleLayout,
    onOpenAllViews: () => {
      // title: 'Abrir Todas as Views'
      openViewIds = SHELL_VIEWS.map(v => v.id);
      applyViewVisibility();
      renderAsideViewList();
      setupSectionDividers();
      updateSectionMoveButtons();
    },
    onCloseAllViews: async () => {
      // title: 'Fechar Todas as Views'
      openViewIds = [];
      focusedViewId = null;
      applyViewVisibility();
      renderAsideViewList();
      setupSectionDividers();
      updateSectionMoveButtons();
    },
    onOpenOrFocusView: openOrFocusView
  });
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


