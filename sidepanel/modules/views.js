// ── views.js ─────────────────────────────────────────────────────────────────
// Gerenciador de visões / telas do QuickDock (View Engine).
// Alterna entre a visão principal do editor de notas e outras telas completas,
// como a Galeria de Modelos (#templates-gallery-view).

import { expandDocsToHalf } from './resizer.js';

let currentView = 'editor';
let previousView = 'editor';
let isSplitMode = false;
const listeners = new Set();

export function getCurrentView() {
  return currentView;
}

export function isViewSplit() {
  return isSplitMode && currentView !== 'editor';
}

export function isViewFullscreen() {
  return !isSplitMode && currentView !== 'editor';
}

export function onViewChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let isHalfHeightMode = false;

export function isViewHalfHeight() {
  return isHalfHeightMode;
}

export function setHalfHeightMode(half) {
  isHalfHeightMode = Boolean(half);
  if (typeof document !== 'undefined') {
    document.documentElement?.classList?.toggle('view-half-height', isHalfHeightMode);
    document.body?.classList?.toggle('view-half-height', isHalfHeightMode);
  }
  updateHeightButtons(isHalfHeightMode);
  document.dispatchEvent(new CustomEvent('quickdock:height-changed', {
    detail: { isHalfHeight: isHalfHeightMode },
  }));
}

export function toggleViewHeight() {
  setHalfHeightMode(!isHalfHeightMode);
}

export function updateHeightButtons(isHalf) {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
  const iconName = isHalf ? 'unfold_more' : 'unfold_less';
  const titleText = isHalf ? 'Expandir para altura toda (100%)' : 'Reduzir para metade da altura (50%)';

  const btnIds = [
    'btn-graph-toggle-height',
    'btn-board-toggle-height',
    'btn-calendar-toggle-height',
    'btn-docs-toggle-height',
    'btn-bases-toggle-height',
    'btn-json-toggle-height',
  ];

  for (const id of btnIds) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.title = titleText;
    btn.setAttribute('aria-label', titleText);
    const icon = typeof btn.querySelector === 'function' ? btn.querySelector('.qd-icon') : null;
    if (icon) icon.textContent = iconName;
  }
}

export function updateFullscreenButtons(isFullscreen) {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
  const iconName = isFullscreen ? 'fullscreen_exit' : 'fullscreen';
  const titleText = isFullscreen ? 'Dividir tela com a nota' : 'Expandir para tela cheia (100%)';

  const btnIds = [
    'btn-graph-toggle-fullscreen',
    'btn-board-toggle-fullscreen',
    'btn-calendar-toggle-fullscreen',
    'btn-bases-toggle-fullscreen',
    'btn-json-toggle-fullscreen',
  ];

  for (const id of btnIds) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.title = titleText;
    btn.setAttribute('aria-label', titleText);
    const icon = typeof btn.querySelector === 'function' ? btn.querySelector('.qd-icon') : null;
    if (icon) icon.textContent = iconName;
  }
}

export function toggleViewFullscreen() {
  if (currentView === 'editor' || currentView === 'templates') return;
  const targetFullscreen = isSplitMode;
  switchView(currentView, { fullscreen: targetFullscreen, split: !targetFullscreen });
}

export function switchView(viewName, params = {}) {
  if (!viewName) return;

  // Determina se a visão alvo deve ser em modo tela cheia (100%) ou dividida (split)
  let targetSplit = isSplitMode;
  if (params.split !== undefined) {
    targetSplit = Boolean(params.split);
  } else if (params.fullscreen !== undefined) {
    targetSplit = !params.fullscreen;
  } else if (viewName === 'templates') {
    targetSplit = false;
  } else if (viewName === 'editor') {
    targetSplit = false;
  } else if (viewName !== currentView) {
    // Ao abrir uma visão auxiliar sem especificar, default é 100% tela cheia
    targetSplit = false;
  }

  // Sem nota aberta não existe editor pra dividir a tela com — o CSS só sabe
  // mostrar Quadro/Grafo/Calendário nesse estado em tela cheia (ver a regra
  // "body.no-note-open .board-view" em style.css), então dividir aqui deixaria
  // a visão escolhida invisível mesmo com hidden=false, parecendo que o botão
  // não fez nada. O drawer permanente do desktop sempre pede split:true sem
  // saber se há nota aberta — é exatamente esse o caso que isto cobre.
  if (document.documentElement.classList.contains('no-note-open')
    && (viewName === 'grafo' || viewName === 'board' || viewName === 'calendar' || viewName === 'bases' || viewName === 'json')) {
    targetSplit = false;
  }

  const modeChanged = (targetSplit !== isSplitMode);

  if (viewName === currentView && !modeChanged) {
    if (viewName === 'templates') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-templates-gallery', { detail: params }));
    } else if (viewName === 'grafo') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-graph-view', { detail: params }));
    } else if (viewName === 'board') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-board-view', { detail: params }));
    } else if (viewName === 'calendar') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view', { detail: params }));
    } else if (viewName === 'bases') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-bases-view', { detail: params }));
    } else if (viewName === 'json') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-json-view', { detail: params }));
    }
    return;
  }

  previousView = currentView;
  currentView = viewName;
  isSplitMode = targetSplit;

  const noteSection = document.querySelector('.note-section');
  const resizeHandle = document.getElementById('resize-handle');
  const docsSection = document.querySelector('.docs-section');
  const templatesView = document.getElementById('templates-gallery-view');
  const graphView = document.getElementById('graph-view');
  const boardView = document.getElementById('board-view');
  const calendarView = document.getElementById('calendar-view');
  const basesView = document.getElementById('bases-view');
  const jsonView = document.getElementById('json-view');
  const btnNavTemplates = document.getElementById('btn-nav-templates');
  const btnNavGraph = document.getElementById('btn-nav-graph');
  const btnNavBoard = document.getElementById('btn-nav-board');
  const btnNavCalendar = document.getElementById('btn-nav-calendar');

  // Oculta todas as visões secundárias
  if (templatesView) {
    templatesView.hidden = true;
    templatesView.classList.remove('active');
  }
  if (graphView) {
    graphView.hidden = true;
    graphView.classList.remove('active');
  }
  if (boardView) {
    boardView.hidden = true;
    boardView.classList.remove('active');
  }
  if (calendarView) {
    calendarView.hidden = true;
    calendarView.classList.remove('active');
  }
  if (basesView) {
    basesView.hidden = true;
    basesView.classList.remove('active');
  }
  if (jsonView) {
    jsonView.hidden = true;
    jsonView.classList.remove('active');
  }

  document.documentElement.classList.remove(
    'view-templates', 'view-grafo', 'view-board', 'view-calendar', 'view-bases', 'view-json',
    'view-fullscreen', 'view-split'
  );
  document.body.classList.remove(
    'view-templates', 'view-grafo', 'view-board', 'view-calendar', 'view-bases', 'view-json',
    'view-fullscreen', 'view-split'
  );

  if (btnNavTemplates) btnNavTemplates.classList.remove('active');
  if (btnNavGraph) btnNavGraph.classList.remove('active');
  if (btnNavBoard) btnNavBoard.classList.remove('active');
  if (btnNavCalendar) btnNavCalendar.classList.remove('active');

  if (viewName === 'templates') {
    if (noteSection) noteSection.hidden = true;
    if (resizeHandle) resizeHandle.hidden = true;
    if (docsSection) docsSection.hidden = true;
    if (templatesView) {
      templatesView.hidden = false;
      templatesView.classList.add('active');
    }
    document.documentElement.classList.add('view-templates', 'view-fullscreen');
    document.body.classList.add('view-templates', 'view-fullscreen');
    if (btnNavTemplates) btnNavTemplates.classList.add('active');
    updateFullscreenButtons(true);
    document.dispatchEvent(new CustomEvent('quickdock:refresh-templates-gallery', { detail: params }));
  } else if (viewName === 'grafo') {
    if (graphView) {
      graphView.hidden = false;
      graphView.classList.add('active');
    }
    document.documentElement.classList.add('view-grafo');
    document.body.classList.add('view-grafo');
    if (btnNavGraph) btnNavGraph.classList.add('active');

    if (isSplitMode) {
      if (noteSection) noteSection.hidden = false;
      if (resizeHandle) resizeHandle.hidden = false;
      if (docsSection) docsSection.hidden = true;
      if (docsSection?.classList.contains('is-minimized')) {
        try { expandDocsToHalf(); } catch (_) {}
      }
      document.documentElement.classList.add('view-split');
      document.body.classList.add('view-split');
      updateFullscreenButtons(false);
    } else {
      if (noteSection) noteSection.hidden = true;
      if (resizeHandle) resizeHandle.hidden = true;
      if (docsSection) docsSection.hidden = true;
      document.documentElement.classList.add('view-fullscreen');
      document.body.classList.add('view-fullscreen');
      updateFullscreenButtons(true);
    }
    document.dispatchEvent(new CustomEvent('quickdock:refresh-graph-view', { detail: params }));
  } else if (viewName === 'board') {
    if (boardView) {
      boardView.hidden = false;
      boardView.classList.add('active');
    }
    document.documentElement.classList.add('view-board');
    document.body.classList.add('view-board');
    if (btnNavBoard) btnNavBoard.classList.add('active');

    if (isSplitMode) {
      if (noteSection) noteSection.hidden = false;
      if (resizeHandle) resizeHandle.hidden = false;
      if (docsSection) docsSection.hidden = true;
      if (docsSection?.classList.contains('is-minimized')) {
        try { expandDocsToHalf(); } catch (_) {}
      }
      document.documentElement.classList.add('view-split');
      document.body.classList.add('view-split');
      updateFullscreenButtons(false);
    } else {
      if (noteSection) noteSection.hidden = true;
      if (resizeHandle) resizeHandle.hidden = true;
      if (docsSection) docsSection.hidden = true;
      document.documentElement.classList.add('view-fullscreen');
      document.body.classList.add('view-fullscreen');
      updateFullscreenButtons(true);
    }
    document.dispatchEvent(new CustomEvent('quickdock:refresh-board-view', { detail: params }));
  } else if (viewName === 'calendar') {
    if (calendarView) {
      calendarView.hidden = false;
      calendarView.classList.add('active');
    }
    document.documentElement.classList.add('view-calendar');
    document.body.classList.add('view-calendar');
    if (btnNavCalendar) btnNavCalendar.classList.add('active');

    if (isSplitMode) {
      if (noteSection) noteSection.hidden = false;
      if (resizeHandle) resizeHandle.hidden = false;
      if (docsSection) docsSection.hidden = true;
      if (docsSection?.classList.contains('is-minimized')) {
        try { expandDocsToHalf(); } catch (_) {}
      }
      document.documentElement.classList.add('view-split');
      document.body.classList.add('view-split');
      updateFullscreenButtons(false);
    } else {
      if (noteSection) noteSection.hidden = true;
      if (resizeHandle) resizeHandle.hidden = true;
      if (docsSection) docsSection.hidden = true;
      document.documentElement.classList.add('view-fullscreen');
      document.body.classList.add('view-fullscreen');
      updateFullscreenButtons(true);
    }
    document.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view', { detail: params }));
  } else if (viewName === 'bases') {
    if (basesView) {
      basesView.hidden = false;
      basesView.classList.add('active');
    }
    document.documentElement.classList.add('view-bases');
    document.body.classList.add('view-bases');

    if (isSplitMode) {
      if (noteSection) noteSection.hidden = false;
      if (resizeHandle) resizeHandle.hidden = false;
      if (docsSection) docsSection.hidden = true;
      if (docsSection?.classList.contains('is-minimized')) {
        try { expandDocsToHalf(); } catch (_) {}
      }
      document.documentElement.classList.add('view-split');
      document.body.classList.add('view-split');
      updateFullscreenButtons(false);
    } else {
      if (noteSection) noteSection.hidden = true;
      if (resizeHandle) resizeHandle.hidden = true;
      if (docsSection) docsSection.hidden = true;
      document.documentElement.classList.add('view-fullscreen');
      document.body.classList.add('view-fullscreen');
      updateFullscreenButtons(true);
    }
    document.dispatchEvent(new CustomEvent('quickdock:refresh-bases-view', { detail: params }));
  } else if (viewName === 'json') {
    if (jsonView) {
      jsonView.hidden = false;
      jsonView.classList.add('active');
    }
    document.documentElement.classList.add('view-json');
    document.body.classList.add('view-json');

    if (isSplitMode) {
      if (noteSection) noteSection.hidden = false;
      if (resizeHandle) resizeHandle.hidden = false;
      if (docsSection) docsSection.hidden = true;
      if (docsSection?.classList.contains('is-minimized')) {
        try { expandDocsToHalf(); } catch (_) {}
      }
      document.documentElement.classList.add('view-split');
      document.body.classList.add('view-split');
      updateFullscreenButtons(false);
    } else {
      if (noteSection) noteSection.hidden = true;
      if (resizeHandle) resizeHandle.hidden = true;
      if (docsSection) docsSection.hidden = true;
      document.documentElement.classList.add('view-fullscreen');
      document.body.classList.add('view-fullscreen');
      updateFullscreenButtons(true);
    }
    document.dispatchEvent(new CustomEvent('quickdock:refresh-json-view', { detail: params }));
  } else {
    // Visão padrão: editor de notas + documentos
    if (noteSection) {
      noteSection.hidden = false;
    }
    if (resizeHandle) {
      resizeHandle.hidden = false;
    }
    if (docsSection) {
      docsSection.hidden = false;
    }
    updateFullscreenButtons(false);
  }

  listeners.forEach(fn => {
    try { fn(currentView, previousView, params); } catch (err) { console.error(err); }
  });

  document.dispatchEvent(new CustomEvent('quickdock:view-changed', {
    detail: { view: currentView, previousView, isSplit: isSplitMode, isFullscreen: !isSplitMode && currentView !== 'editor', params },
  }));
}

export function goBack() {
  if (currentView !== 'editor') {
    switchView('editor');
  }
}

// Tecla Escape retorna ao editor caso não haja modal aberto
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && currentView !== 'editor') {
      if (typeof document.querySelector === 'function' && document.querySelector('.modal:not(.hidden), .copy-menu')) return;
      goBack();
    }
  });

  const setupBtnListeners = () => {
    if (typeof document.getElementById !== 'function') return;
    document.getElementById('btn-graph-toggle-fullscreen')?.addEventListener('click', () => toggleViewFullscreen());
    document.getElementById('btn-board-toggle-fullscreen')?.addEventListener('click', () => toggleViewFullscreen());
    document.getElementById('btn-calendar-toggle-fullscreen')?.addEventListener('click', () => toggleViewFullscreen());
    document.getElementById('btn-bases-toggle-fullscreen')?.addEventListener('click', () => toggleViewFullscreen());
    document.getElementById('btn-json-toggle-fullscreen')?.addEventListener('click', () => toggleViewFullscreen());

    document.getElementById('btn-graph-toggle-height')?.addEventListener('click', () => toggleViewHeight());
    document.getElementById('btn-board-toggle-height')?.addEventListener('click', () => toggleViewHeight());
    document.getElementById('btn-calendar-toggle-height')?.addEventListener('click', () => toggleViewHeight());
    document.getElementById('btn-docs-toggle-height')?.addEventListener('click', () => toggleViewHeight());
    document.getElementById('btn-bases-toggle-height')?.addEventListener('click', () => toggleViewHeight());
    document.getElementById('btn-json-toggle-height')?.addEventListener('click', () => toggleViewHeight());
  };

  if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', setupBtnListeners);
  } else {
    setupBtnListeners();
  }
}
