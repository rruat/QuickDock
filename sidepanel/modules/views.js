// ── views.js ─────────────────────────────────────────────────────────────────
// Gerenciador de visões / telas do QuickDock (View Engine).
// Alterna entre a visão principal do editor de notas e outras telas completas,
// como a Galeria de Modelos (#templates-gallery-view).

let currentView = 'editor';
let previousView = 'editor';
const listeners = new Set();

export function getCurrentView() {
  return currentView;
}

export function onViewChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function switchView(viewName, params = {}) {
  if (!viewName) return;

  if (viewName === currentView) {
    if (viewName === 'templates') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-templates-gallery', { detail: params }));
    } else if (viewName === 'grafo') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-graph-view', { detail: params }));
    } else if (viewName === 'board') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-board-view', { detail: params }));
    } else if (viewName === 'calendar') {
      document.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view', { detail: params }));
    }
    return;
  }

  previousView = currentView;
  currentView = viewName;

  const noteSection = document.querySelector('.note-section');
  const templatesView = document.getElementById('templates-gallery-view');
  const graphView = document.getElementById('graph-view');
  const boardView = document.getElementById('board-view');
  const calendarView = document.getElementById('calendar-view');
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
  document.documentElement.classList.remove('view-templates', 'view-grafo', 'view-board', 'view-calendar');
  document.body.classList.remove('view-templates', 'view-grafo', 'view-board', 'view-calendar');
  if (btnNavTemplates) btnNavTemplates.classList.remove('active');
  if (btnNavGraph) btnNavGraph.classList.remove('active');
  if (btnNavBoard) btnNavBoard.classList.remove('active');
  if (btnNavCalendar) btnNavCalendar.classList.remove('active');

  if (viewName === 'templates') {
    if (noteSection) noteSection.hidden = true;
    if (templatesView) {
      templatesView.hidden = false;
      templatesView.classList.add('active');
    }
    document.documentElement.classList.add('view-templates');
    document.body.classList.add('view-templates');
    if (btnNavTemplates) btnNavTemplates.classList.add('active');
    document.dispatchEvent(new CustomEvent('quickdock:refresh-templates-gallery', { detail: params }));
  } else if (viewName === 'grafo') {
    if (noteSection) noteSection.hidden = true;
    if (graphView) {
      graphView.hidden = false;
      graphView.classList.add('active');
    }
    document.documentElement.classList.add('view-grafo');
    document.body.classList.add('view-grafo');
    if (btnNavGraph) btnNavGraph.classList.add('active');
    document.dispatchEvent(new CustomEvent('quickdock:refresh-graph-view', { detail: params }));
  } else if (viewName === 'board') {
    if (noteSection) noteSection.hidden = true;
    if (boardView) {
      boardView.hidden = false;
      boardView.classList.add('active');
    }
    document.documentElement.classList.add('view-board');
    document.body.classList.add('view-board');
    if (btnNavBoard) btnNavBoard.classList.add('active');
    document.dispatchEvent(new CustomEvent('quickdock:refresh-board-view', { detail: params }));
  } else if (viewName === 'calendar') {
    if (noteSection) noteSection.hidden = true;
    if (calendarView) {
      calendarView.hidden = false;
      calendarView.classList.add('active');
    }
    document.documentElement.classList.add('view-calendar');
    document.body.classList.add('view-calendar');
    if (btnNavCalendar) btnNavCalendar.classList.add('active');
    document.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view', { detail: params }));
  } else {
    // Visão padrão: editor de notas
    if (noteSection) {
      noteSection.hidden = false;
    }
  }

  listeners.forEach(fn => {
    try { fn(currentView, previousView, params); } catch (err) { console.error(err); }
  });

  document.dispatchEvent(new CustomEvent('quickdock:view-changed', {
    detail: { view: currentView, previousView, params },
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
}
