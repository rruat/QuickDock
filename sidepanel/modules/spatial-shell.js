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
  setupMobileTouchGestures,
  openMobileLeftDrawer,
  closeMobileLeftDrawer
} from './shell/shell-mobile.js';
import { setupMobileBack } from './shell/shell-mobile-back.js';
import { initAsideViewsList } from './shell/shell-views-list.js';
import { initRightAside } from './shell/shell-right-aside.js';
import { initViewSwitcher } from './shell/shell-view-switcher.js';
import { setAsidePanel, toggleAsidePanel, getAsidePanel, NAV_TO_PANEL } from './shell/shell-aside-panels.js';
import { initModelsPanel } from './shell/shell-models-panel.js';
import { initViewGroups } from './shell/shell-view-groups.js';
import { initMobileKeyboard } from './shell/shell-mobile-keyboard.js';
import { initMobileTitle } from './shell/shell-mobile-title.js';
import { initDraftBar } from './shell/shell-draft-bar.js';
import { initFooterLabel } from './shell/shell-footer-label.js';
import { initEscapeBack } from './shell/shell-escape-back.js';
import { trackExpandOrigin, playExpandOpen, playCollapseClose, getMonthOriginCell, getWeekOriginCol, playOverlayOpen, playOverlayClose } from './shell/shell-expand-transition.js';
import { expandMonthCell, collapseMonthCell, resetMonthExpansion, canExpandMonthCell, monthExpansionActive } from './shell/shell-month-expand.js';
import { expandWeekColumn, collapseWeekColumn, resetWeekExpansion, canExpandWeekColumn, weekExpansionActive } from './shell/shell-week-expand.js';
import { fadeIn, slideIn, motionEnabled, setMotionEnabled } from './shell/shell-motion.js';
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
let focusedViewId = 'bases';
let layoutMode = 'side-by-side'; // 'side-by-side' ou 'stacked'
let searchActiveIdx = -1;
let searchCandidates = [];
let draggedViewId = null; // reordenação de views por arrastar o .section-header
let activeNoteId = null;

// Novo design (mockup MKP/CAL.HTML): uma view por vez. Clicar numa view SUBSTITUI
// a que estava aberta; não há mais mosaico lado a lado nem acrescentar com Shift.

// Aside esquerda recolhível (desktop). Recolhida, sobra só a #mNav como cartão
// arredondado. O estado fica salvo; o padrão é aberta para não esconder o explorador.
const ASIDE_COLLAPSED_KEY = 'quickdock:spatial:aside-collapsed';
let asideCollapsed = false;

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
        // Uma view por vez: de uma sessão antiga com várias abertas, fica a mais recente
        openViewIds = openViewIds.slice(-1);
      }
    }
    asideCollapsed = localStorage.getItem(ASIDE_COLLAPSED_KEY) === '1';
  } catch {}

  // A tela inicial é a Base do workspace (suas views); notas e quadros abrem a partir dela
  if (openViewIds.length === 0) {
    openViewIds = ['bases'];
  }
  if (!focusedViewId || !openViewIds.includes(focusedViewId)) {
    focusedViewId = openViewIds[0] || 'bases';
  }

  // Garante que todas as seções de view de primeiro nível no mMain tenham a classe main-section
  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.querySelectorAll(':scope > [data-id]').forEach(sec => sec.classList.add('main-section'));
  }

  setupLayoutMode();
  applyAsideCollapsed();
  setupActivityBar();
  setupHeaderMenu();
  setupAside();
  initAsideViewsList({ openView: (id) => openOrFocusView(id) });
  initRightAside();
  initViewSwitcher();
  initModelsPanel({ openView: (id) => openOrFocusView(id) });
  initSettingsPanelActions();
  initViewGroups();
  initMobileTitle();
  initMobileKeyboard();
  initDraftBar();
  initFooterLabel();
  initEscapeBack();
  trackExpandOrigin(document.getElementById('bases-body'));
  setupOmnibar();
  setupKeyboardShortcuts();
  setupSectionInteractions();
  setupBackToViews();
  setupSettingsView();
  initShellMobile({
    getOpenViewIds: () => openViewIds,
    getFocusedViewId: () => focusedViewId,
    setFocusedViewId: (id) => { focusedViewId = id; }
  });
  setupMobileTouchGestures();
  setupMobileBack();

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
  // Quadro aberto a partir da Base (item-quadro): troca para ele e mostra a tela do quadro
  document.addEventListener('quickdock:open-board', async e => {
    const id = e.detail?.id;
    if (id == null) return;
    const { switchBoard } = await import('./board-engine.js');
    await switchBoard(Number(id));
    openOrFocusView('board');
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

  const onNavItem = (item) => {
    const viewId = item.dataset.navView;
    if (!viewId) return;
    const asideEl = document.getElementById('mAside');
    const isMobile = window.innerWidth <= 768 || isMobileMode();

    // Home / Modelos / Configurações trocam o PAINEL da aside esquerda (no desktop ela abre/recolhe;
    // no mobile ela é o drawer), sem trocar a tela principal. Clicar no painel aberto fecha.
    if (NAV_TO_PANEL[viewId]) {
      setAsideMode('notes');
      toggleAsidePanel(NAV_TO_PANEL[viewId], isMobile
        ? { isCollapsed: () => !asideEl?.classList.contains('is-open-mobile'), setCollapsed: c => (c ? closeMobileLeftDrawer() : openMobileLeftDrawer()) }
        : { isCollapsed: () => asideCollapsed, setCollapsed: setAsideCollapsed });
      syncNavHome();
      return;
    }

    if (asideEl && isMobile) asideEl.classList.remove('is-open-mobile');
    openOrFocusView(viewId);
  };

  // no mobile o drawer abre/fecha por gesto e scrim também: o item ativo da nav acompanha
  const asideNode = document.getElementById('mAside');
  if (asideNode) new MutationObserver(() => syncNavHome()).observe(asideNode, { attributes: true, attributeFilter: ['class'] });

  navEl.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => onNavItem(item));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavItem(item); }
    });
  });
  syncNavHome();
}

// ── Aside esquerda recolhível (desktop) ──────────────────────────────────────
function applyAsideCollapsed() {
  document.getElementById('app')?.classList.toggle('is-aside-collapsed', asideCollapsed);
  // Os motores canvas (Quadro/Grafo) reencaixam quando a largura da view muda
  window.dispatchEvent(new CustomEvent('resize'));
}

export function setAsideCollapsed(collapsed) {
  asideCollapsed = !!collapsed;
  try { localStorage.setItem(ASIDE_COLLAPSED_KEY, asideCollapsed ? '1' : '0'); } catch {}
  applyAsideCollapsed();
  syncNavHome();
  if (!asideCollapsed) slideIn(document.getElementById('mAside'), -28); // a aside esquerda entra deslizando
  const toggle = document.getElementById('settings-aside-open');
  if (toggle) toggle.checked = !asideCollapsed;
}

// Home fica ativo enquanto a aside esquerda está aberta; Modelos/Configurações, quando são a view em foco
function syncNavHome() {
  const home = document.querySelector('#mNav .nav-item[data-nav-view="home"]');
  if (!home) return;
  const isMobile = window.innerWidth <= 768 || isMobileMode();
  const asideEl = document.getElementById('mAside');
  const open = isMobile ? !!asideEl?.classList.contains('is-open-mobile') : !asideCollapsed;
  // no desktop cada botão da nav acende com o painel que está aberto na aside esquerda
  const panel = getAsidePanel();
  document.querySelectorAll('#mNav .nav-item').forEach(item => {
    item.classList.toggle('is-active', open && NAV_TO_PANEL[item.dataset.navView] === panel);
  });
}

// Configurações (painel da aside): tema e sincronização reaproveitam os botões que já existem
function initSettingsPanelActions() {
  document.getElementById('asideSettingsTheme')?.addEventListener('click', () => document.getElementById('btn-header-theme')?.click());
  document.getElementById('asideSettingsSync')?.addEventListener('click', () => document.getElementById('btn-sync')?.click());
  document.addEventListener('quickdock:aside-panel-changed', syncNavHome);
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

// Notas (explorador logo abaixo), Modelos e Configurações já têm lugar na nav/aside
const ASIDE_LIST_HIDDEN = new Set(['notes', 'templates', 'settings']);

// ── Voltar às views: nota e quadro são itens da Base, abertos a partir dela ──────
function setupBackToViews() {
  for (const sel of ['#section-note', '#board-view']) {
    const left = document.querySelector(`${sel} > .section-header .section-header-left`);
    if (!left || left.querySelector('.btn-back-views')) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-btn btn-back-views';
    btn.title = 'Voltar às views';
    btn.setAttribute('aria-label', 'Voltar às views');
    btn.innerHTML = '<span class="material-symbols-rounded">arrow_back</span>';
    // volta encolhendo até o item de onde a nota/quadro saiu
    btn.addEventListener('click', () => {
      if (monthExpansionActive() && motionEnabled()) {
        // a célula do mês volta a ser célula: mostra a grade ainda expandida e a encolhe
        openOrFocusView('bases', { skipTransition: true, overlayClose: document.querySelector(sel) });
        collapseMonthCell(); // sem esperar quadro de animação: a função força o layout sozinha
      } else if (weekExpansionActive() && motionEnabled()) {
        openOrFocusView('bases', { skipTransition: true, overlayClose: document.querySelector(sel) });
        collapseWeekColumn(); // a coluna do dia volta a ser coluna
      } else {
        playCollapseClose(document.querySelector(sel), () => openOrFocusView('bases'));
      }
    });
    left.prepend(btn);
  }
}

// ── View "Configurações": liga/desliga o painel lateral esquerdo ───────────────
function setupSettingsView() {
  const toggle = document.getElementById('settings-aside-open');
  if (!toggle) return;
  toggle.checked = !asideCollapsed;
  toggle.addEventListener('change', () => setAsideCollapsed(!toggle.checked));

  const anim = document.getElementById('settings-animations');
  if (anim) {
    anim.checked = motionEnabled();
    anim.addEventListener('change', () => setMotionEnabled(anim.checked));
  }
}

export function renderAsideViewList() {
  const listEl = document.getElementById('asideSectionList');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const v of SHELL_VIEWS.filter(view => !ASIDE_LIST_HIDDEN.has(view.id))) {
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

    item.addEventListener('click', () => {
      openOrFocusView(v.id);
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
// Abrir um item a partir da célula do mês: a célula EXPANDE primeiro e só então a tela troca.
let monthExpanding = false;

// O cabeçalho da tela passa a "Nota"/"Quadro" já no INÍCIO da expansão (como no mockup)
function anticipateHeaderTitle(viewId) {
  const titulo = document.querySelector('#bases-view > .section-header .section-title');
  if (titulo) titulo.textContent = viewId === 'board' ? 'Quadro' : 'Nota';
}

// Seção (#section-note / #board-view) de um destino de item
const itemSectionOf = viewId => document.querySelector(viewId === 'board' ? '#board-view' : '#section-note');

// Durante a animação sobre a Base, a seção "de baixo" (a Base ao abrir; a nota/quadro ao voltar) NÃO
// pode ser escondida: display:none cancela as transições da grade. applyViewVisibility a mantém.
let keepVisibleIds = new Set();

// ponte para módulos que não importam o shell (voltar do mobile, gaveta antiga de notas)
if (typeof window !== 'undefined') window.quickdockOpenView = id => openOrFocusView(id);

export function openOrFocusView(viewId, { skipTransition = false, overlayOpen = false, overlayClose = null } = {}) {
  // Animação de abrir em andamento: pedidos repetidos (a ativação da nota dispara outro openOrFocusView)
  // não podem esconder a Base nem reordenar seções no meio — isso cancelaria a expansão da grade
  if (monthExpanding && !skipTransition && !overlayOpen && !overlayClose) return;
  const prevFocus = focusedViewId;
  const isItem = viewId === 'notes' || viewId === 'board' || (typeof viewId === 'string' && viewId.startsWith('note-'));
  const desktop = !(window.innerWidth <= 768 || isMobileMode());
  if (!skipTransition && desktop && prevFocus === 'bases' && isItem && motionEnabled()) {
    const cell = getMonthOriginCell();
    if (cell && canExpandMonthCell(cell)) {
      if (!monthExpanding) {
        monthExpanding = true;
        anticipateHeaderTitle(viewId);
        // a nota/quadro já abre agora, revelada pelo recorte, enquanto a célula expande por baixo
        expandMonthCell(cell, () => { monthExpanding = false; keepVisibleIds = new Set(); applyViewVisibility(); reorderMainSections(); });
        openOrFocusView(viewId, { skipTransition: true, overlayOpen: true });
      }
      return;
    }
    const col = getWeekOriginCol();
    if (col && canExpandWeekColumn(col)) {
      if (!monthExpanding) {
        monthExpanding = true;
        anticipateHeaderTitle(viewId);
        expandWeekColumn(col, () => { monthExpanding = false; keepVisibleIds = new Set(); applyViewVisibility(); reorderMainSections(); });
        openOrFocusView(viewId, { skipTransition: true, overlayOpen: true });
      }
      return;
    }
  }
  // voltar à Base por outro caminho (lista de views, Home…): a grade não pode ficar expandida
  if (!skipTransition && viewId === 'bases') { resetMonthExpansion(); resetWeekExpansion(); }
  if (viewId === 'bases') document.dispatchEvent(new CustomEvent('quickdock:workspace-title-refresh'));
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

  // Uma view por vez: abrir uma view substitui a anterior.
  openViewIds = [targetViewId];
  try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}
  focusedViewId = targetViewId;

  const navEl = document.getElementById('mNav');
  if (navEl) {
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === targetViewId);
    });
  }

  // reordenar move os nós no DOM e CANCELA as transições da grade que está expandindo por baixo
  if (!overlayOpen && !overlayClose) reorderMainSections();
  // a seção já nasce sobreposta (tamanho cheio) ANTES do foco mudar: os motores (quadro/editor) medem
  // o contêiner no evento de foco, e em fluxo normal ela dividiria o espaço com a Base (tamanho errado → salto)
  if (overlayOpen) itemSectionOf(targetViewId)?.classList.add('is-expand-overlay');
  if (overlayClose) overlayClose.classList.add('is-expand-overlay');
  keepVisibleIds = overlayOpen ? new Set(['bases']) : (overlayClose ? new Set([overlayClose.dataset.id]) : new Set());
  applyViewVisibility();
  renderAsideViewList();
  setupSectionDividers();
  updateSectionMoveButtons();

  // No mobile, transiciona suavemente o carrossel de cards até a view em foco
  if (window.innerWidth <= 768 || isMobileMode()) {
    transitionToMobileCard(targetViewId, 'auto');
  }

  syncNavHome();

  // Atualiza rodapé
  const footerLabel = document.getElementById('footer-active-view-name');
  if (footerLabel) {
    const viewMeta = SHELL_VIEWS.find(v => v.id === targetViewId);
    footerLabel.textContent = viewMeta ? viewMeta.title : targetViewId;
  }

  // Nota e quadro CRESCEM a partir do item clicado na view (animação do mockup)
  if (overlayOpen) {
    // sobre a grade que expande: mostra o conteúdo já, revelado dentro da célula
    playOverlayOpen(itemSectionOf(targetViewId));
  } else if (overlayClose) {
    // voltando: a nota/quadro encolhe junto com a célula enquanto a grade por baixo volta ao normal
    playOverlayClose(overlayClose, () => { keepVisibleIds = new Set(); applyViewVisibility(); reorderMainSections(); });
  } else if (skipTransition) {
    // a célula do mês já fez a animação (ou a Base voltou animada): nada a mais
  } else if (prevFocus === 'bases' && (targetViewId === 'notes' || targetViewId === 'board') && !(window.innerWidth <= 768 || isMobileMode())) {
    playExpandOpen(document.querySelector(targetViewId === 'notes' ? '#section-note' : '#board-view'));
  } else if (prevFocus !== targetViewId && !(window.innerWidth <= 768 || isMobileMode())) {
    // demais trocas de tela (Base, Modelos, Configurações…): aparece suavemente
    fadeIn(document.querySelector(`#mMain > .main-section[data-id="${targetViewId}"]`));
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
  syncNavHome();
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
  headerEl?.removeAttribute('draggable'); // uma view por vez: não há o que reordenar
  headerEl?.removeAttribute('title');
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
    const isSectionOpen = openViewIds.includes(id) || keepVisibleIds.has(id);

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

  document.documentElement.dataset.shellFocus = focusedViewId || '';
  document.dispatchEvent(new CustomEvent('quickdock:shell-focus', {
    detail: { viewId: focusedViewId, openViewIds: [...openViewIds] }
  }));

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


