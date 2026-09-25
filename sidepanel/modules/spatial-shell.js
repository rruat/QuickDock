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
import { switchToNote } from './note.js';

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

let openViewIds = ['notes'];
let focusedViewId = 'notes';
let layoutMode = 'side-by-side'; // 'side-by-side' ou 'stacked'
let searchActiveIdx = -1;
let searchCandidates = [];

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
      if (Array.isArray(parsed) && parsed.length > 0) {
        openViewIds = parsed.filter(id => SHELL_VIEWS.some(v => v.id === id));
        if (openViewIds.length === 0) openViewIds = ['notes'];
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
        if (type) openOrFocusView(type);
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

// ── Gestão de Views Abertas e Foco ────────────────────────────────────────────
export function openOrFocusView(viewId) {
  if (!SHELL_VIEWS.some(v => v.id === viewId)) return;

  if (!openViewIds.includes(viewId)) {
    openViewIds.push(viewId);
    try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}
  }
  focusedViewId = viewId;
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
  openViewIds = openViewIds.filter(id => id !== viewId);
  if (openViewIds.length === 0) {
    openViewIds = ['notes']; // Mantém ao menos a nota aberta
  }
  try { localStorage.setItem('quickdock:spatial:open-views', JSON.stringify(openViewIds)); } catch {}

  if (focusedViewId === viewId) {
    focusedViewId = openViewIds[openViewIds.length - 1];
  }
  applyViewVisibility();
  renderAsideViewList();
  setupSectionDividers();
  updateSectionMoveButtons();
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

  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    for (const id of openViewIds) {
      const sec = mainEl.querySelector(`.main-section[data-id="${id}"]`);
      if (sec) mainEl.appendChild(sec);
    }
  }

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

function setupSectionInteractions() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  mainEl.querySelectorAll('.main-section').forEach(sec => {
    const id = sec.dataset.id;
    if (!id) return;

    sec.addEventListener('pointerdown', () => {
      focusedViewId = id;
      updateSectionMoveButtons();
      renderAsideViewList();
    });

    sec.addEventListener('focusin', () => {
      focusedViewId = id;
      updateSectionMoveButtons();
      renderAsideViewList();
    });

    sec.querySelector('.section-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeView(id);
    });

    sec.querySelector('.btn-move-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      moveView(id, -1);
    });

    sec.querySelector('.btn-move-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      moveView(id, 1);
    });
  });
}

function applyViewVisibility() {
  const viewMap = {
    notes: document.querySelector('.note-section') || document.getElementById('section-note'),
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

  // Notifica os módulos correspondentes via evento de atualização nativo
  if (focusedViewId === 'board') window.dispatchEvent(new CustomEvent('quickdock:refresh-board-view'));
  if (focusedViewId === 'graph') window.dispatchEvent(new CustomEvent('quickdock:refresh-graph-view'));
  if (focusedViewId === 'calendar') window.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view'));
  if (focusedViewId === 'bases') window.dispatchEvent(new CustomEvent('quickdock:refresh-bases-view'));
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

      secA.style.flexGrow = newFlexA;
      secB.style.flexGrow = newFlexB;
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('is-resizing-col', 'is-resizing-row');
      window.dispatchEvent(new CustomEvent('resize'));
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
    { title: 'Abrir Todas as Views', desc: 'Espalhar todas as views no workspace', action: () => { openViewIds = SHELL_VIEWS.map(v => v.id); applyViewVisibility(); } }
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
                switchToNote(note.id);
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
