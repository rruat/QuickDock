// ── desktop-panels.js ──────────────────────────────────────────────────────
// Sistema de painéis simultâneos e redimensionáveis do modo desktop-web.
//
// O modelo antigo (views.js) é uma máquina de estado EXCLUSIVA: só existe uma
// "view atual", trocar de view esconde qualquer outra. Isso continua servindo
// mobile/extensão (que nunca chamam nada deste arquivo) e os modos
// tela-cheia/templates/editor em qualquer plataforma.
//
// No desktop, Quadro/Grafo/Calendário/Documentos agora podem ficar abertos ao
// mesmo tempo, cada um como uma coluna de largura própria ao lado da Nota.
// Este módulo é deliberadamente "de baixo nível" — só mexe em `platform.js`,
// `storage.js` e no DOM diretamente, nunca importa de `documents.js`/
// `views.js`/`graph-view.js`/`board-engine.js`/`calendar-view.js`, pra não
// criar ciclo de import. A comunicação com esses módulos é só por evento
// (`quickdock:refresh-<nome>-view`, que eles já escutam) — ver o plano em
// C:\Users\Apis\.claude\plans\majestic-enchanting-dewdrop.md.

import { isDesktopMode } from './platform.js';
import { loadDesktopPanelLayout, saveDesktopPanelLayout } from './storage.js';

// Ordem fixa da esquerda pra direita quando várias colunas estão abertas
// (a Nota fica implicitamente em 10 via CSS já existente). Os handles de
// redimensionar ficam em PANEL_ORDER-1, entre a coluna anterior e o painel.
const PANEL_ORDER = { board: 20, grafo: 30, calendar: 40, docs: 50 };
const PANEL_NAMES = Object.keys(PANEL_ORDER);
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 260;

const openPanels = new Set();
const panelWidths = {};
const handles = {};

function panelElement(name) {
  switch (name) {
    case 'board': return document.querySelector('.board-view');
    case 'grafo': return document.querySelector('.graph-view');
    case 'calendar': return document.querySelector('.calendar-view');
    case 'docs': return document.querySelector('.docs-section');
    default: return null;
  }
}

function setPanelVisible(name, visible) {
  const el = panelElement(name);
  if (!el) return;
  // .docs-section usa .is-collapsed (controlado por documents.js) pra
  // esconder, não [hidden] — é essa a classe que o CSS do desktop realmente
  // lê pra essa seção. Os outros três usam [hidden], igual ao modelo antigo.
  if (name === 'docs') {
    el.classList.toggle('is-collapsed', !visible);
  } else {
    el.hidden = !visible;
  }
}

function applyPanelWidth(name) {
  const el = panelElement(name);
  if (!el) return;
  el.style.setProperty('--panel-width', `${panelWidths[name] || DEFAULT_WIDTH}px`);
}

function persist() {
  saveDesktopPanelLayout({ open: [...openPanels], widths: { ...panelWidths } });
}

function notifyChanged() {
  document.dispatchEvent(new CustomEvent('quickdock:desktop-panels-changed', {
    detail: { open: [...openPanels] },
  }));
}

function createHandle(name) {
  const handle = document.createElement('div');
  handle.className = 'desktop-panel-handle';
  handle.dataset.panel = name;
  handle.style.order = String(PANEL_ORDER[name] - 1);
  handle.title = 'Arraste para redimensionar';
  handle.hidden = true;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startWidth = panelWidths[name] || DEFAULT_WIDTH;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // A alça fica na borda ESQUERDA do painel: arrastar pra direita encolhe,
    // pra esquerda cresce.
    const delta = e.clientX - startX;
    const maxWidth = Math.max(MIN_WIDTH, window.innerWidth * 0.7);
    const novaLargura = Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth - delta)));
    panelWidths[name] = novaLargura;
    applyPanelWidth(name);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    persist();
  });

  document.getElementById('app')?.appendChild(handle);
  return handle;
}

function applyLayout() {
  for (const name of PANEL_NAMES) {
    const isOpen = openPanels.has(name);
    setPanelVisible(name, isOpen);
    applyPanelWidth(name);
    if (handles[name]) handles[name].hidden = !isOpen;
  }
}

// Nome do painel → nome usado no evento de refresh de cada módulo (grafo é a
// exceção: o evento existente chama-se "graph", não "grafo").
const REFRESH_EVENT_NAME = { board: 'board', grafo: 'graph', calendar: 'calendar' };

function refreshPanelContent(name) {
  // 'docs' não precisa: o grid de documentos já se mantém em sincronia com a
  // nota ativa por conta própria, não existe um "refresh-docs-view".
  const eventName = REFRESH_EVENT_NAME[name];
  if (!eventName) return;
  document.dispatchEvent(new CustomEvent(`quickdock:refresh-${eventName}-view`));
}

export function isDesktopPanelOpen(name) {
  return openPanels.has(name);
}

export function toggleDesktopPanel(name) {
  if (!PANEL_ORDER[name]) return;
  const abrindo = !openPanels.has(name);
  if (abrindo) {
    openPanels.add(name);
  } else {
    openPanels.delete(name);
  }
  applyLayout();
  persist();
  notifyChanged();
  if (abrindo) {
    refreshPanelContent(name);
  } else {
    document.dispatchEvent(new CustomEvent('quickdock:panel-closed', { detail: { panel: name } }));
  }
}

export function initDesktopPanels() {
  if (!isDesktopMode()) return;

  for (const name of PANEL_NAMES) {
    panelWidths[name] = DEFAULT_WIDTH;
    handles[name] = createHandle(name);
  }
  // Estado inicial (tudo fechado) já aplicado de cara — initDocuments() pode
  // ter deixado .docs-section sem .is-collapsed por causa de uma chave antiga
  // compartilhada com o mobile; isto evita um flash antes do layout salvo
  // (assíncrono) carregar.
  applyLayout();

  loadDesktopPanelLayout().then(({ open, widths }) => {
    for (const name of open) {
      if (PANEL_ORDER[name]) openPanels.add(name);
    }
    Object.assign(panelWidths, widths);
    applyLayout();
    notifyChanged();
    for (const name of openPanels) {
      refreshPanelContent(name);
    }
  });

  // "Modelos" passa pelo switchView antigo, que esconde incondicionalmente
  // graph/board/calendar (e nada os restaura ao voltar) — sem isto, qualquer
  // painel que o usuário tinha aberto sumiria pra sempre ao visitar a galeria
  // de modelos e voltar.
  document.addEventListener('quickdock:view-changed', e => {
    if (e.detail?.previousView === 'templates') {
      applyLayout();
      for (const name of openPanels) {
        refreshPanelContent(name);
      }
    }
  });
}
