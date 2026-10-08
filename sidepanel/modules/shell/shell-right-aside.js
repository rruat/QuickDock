// ── shell-right-aside.js ────────────────────────────────────────────────────
// Aside DIREITA do shell (padrão do mockup MKP/CAL.HTML). Ela muda de conteúdo conforme a
// tela em foco, sempre pelo mesmo botão do cabeçalho:
//   • Base (views)  → configurações da view (o motor de Bases monta o painel dentro dela)
//   • Nota          → propriedades e sumário/backlinks da nota (shell-note-panel.js)
//   • Quadro        → propriedades, fundo e zoom do espaço infinito (shell-board-panel.js)
//   • Constelações → grafo de conexões (shell-graph-panel.js); botão `hub` alterna com as configurações
// Redimensiona pela alça no vão entre a tela e a aside e lembra a largura e se estava aberta.

import { requestViewSettings, EVT_SETTINGS_CLOSED } from '../bases/engine/view-request.js';
import { showNotePanel, hideNotePanel } from './shell-note-panel.js';
import { renderBoardPanel } from './shell-board-panel.js';
import { showGraphPanel, hideGraphPanel } from './shell-graph-panel.js';
import { slideIn } from './shell-motion.js';
import { isMobileMode } from '../platform.js';

const KEY_OPEN = 'quickdock:spatial:right-aside-open';
const KEY_MODE = 'quickdock:spatial:right-aside-mode'; // 'config' | 'graph'
const KEY_WIDTH = 'quickdock:spatial:right-aside-width';
export const RIGHT_ASIDE_MIN = 260;
export const RIGHT_ASIDE_MAX = 560;

/** Título da aside por tela em foco. Telas fora desta lista não têm aside direita. */
export const ASIDE_MODES = {
  bases: 'CONFIGURAÇÕES DA VIEW',
  notes: 'PAINEL DA NOTA',
  board: 'PAINEL DO QUADRO',
};

// Tela → seletor da seção onde o botão da aside é colocado (a Base já traz o dela no HTML)
const TOGGLE_SECTIONS = { notes: '#section-note', board: '#board-view' };

const GRAPH_TITLE = 'CONSTELAÇÕES';

const clampWidth = w => Math.min(RIGHT_ASIDE_MAX, Math.max(RIGHT_ASIDE_MIN, Math.round(w)));
const readStore = k => { try { return localStorage.getItem(k); } catch { return null; } };
const writeStore = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

// No mobile a aside direita é um DRAWER (estilo Obsidian): nasce fechada, abre pelo botão do cabeçalho
// ou pelo gesto da borda, e esse estado não se mistura com o do desktop (não é gravado).
let mobileOpen = false;
let api = null;
export const isRightAsideOpen = () => !!api && api.isOpen();
/** Abre/fecha a aside direita (no mobile, o drawer). */
export function setRightAsideOpen(open) { api?.setOpen(!!open); }

export function initRightAside() {
  const app = document.getElementById('app');
  const aside = document.getElementById('mRightAside');
  if (!app || !aside) return;
  const titleEl = document.getElementById('rightAsideTitle');
  const closeBtn = document.getElementById('btnCloseRightAside');
  const resizer = document.getElementById('rightAsideResizer');
  const hosts = {
    bases: document.getElementById('rightAsideViewHost'),
    tools: document.getElementById('rightAsideViewTools'),
    notes: document.getElementById('rightAsideNoteHost'),
    board: document.getElementById('rightAsideBoardHost'),
    graph: document.getElementById('rightAsideGraphHost'),
  };
  const shellFocus = () => document.documentElement.dataset.shellFocus;

  // Botão "configurações" também nos cabeçalhos da nota e do quadro (o da Base já existe)
  for (const sel of Object.values(TOGGLE_SECTIONS)) {
    const actions = document.querySelector(`${sel} > .section-header .section-header-actions`);
    if (!actions || actions.querySelector('[data-aside-toggle]')) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-btn btn-aside-toggle';
    btn.dataset.asideToggle = '';
    btn.title = 'Painel lateral';
    btn.setAttribute('aria-label', 'Painel lateral');
    btn.innerHTML = '<span class="material-symbols-rounded">tune</span>';
    actions.prepend(btn);
  }
  document.getElementById('btnViewSettings')?.setAttribute('data-aside-toggle', '');
  // Botão `hub` (Constelações) ao lado do `tune` em todos os cabeçalhos
  for (const tune of document.querySelectorAll('[data-aside-toggle]')) {
    const actions = tune.parentElement;
    if (!actions || actions.querySelector('[data-aside-graph]')) continue;
    const hub = document.createElement('button');
    hub.type = 'button';
    hub.className = 'section-btn btn-aside-graph';
    hub.dataset.asideGraph = '';
    hub.title = 'Constelações';
    hub.setAttribute('aria-label', 'Constelações');
    hub.innerHTML = '<span class="material-symbols-rounded">hub</span>';
    tune.after(hub);
  }
  // Mobile: os cabeçalhos (do app e das seções) somem; o `hub` (Constelações) fica no cabeçalho da própria aside
  const asideActions = aside.querySelector(':scope > .aside-header .aside-actions');
  if (asideActions && !asideActions.querySelector('[data-aside-graph]')) {
    const hub = document.createElement('button');
    hub.type = 'button';
    hub.className = 'aside-btn mobile-only-btn';
    hub.dataset.asideGraph = '';
    hub.title = 'Constelações';
    hub.setAttribute('aria-label', 'Constelações');
    hub.innerHTML = '<span class="material-symbols-rounded">hub</span>';
    asideActions.prepend(hub);
  }
  const toggles = () => document.querySelectorAll('[data-aside-toggle]');

  // Padrão: aberta (a navegação do calendário, a busca e os filtros moram nela)
  let wantOpen = readStore(KEY_OPEN) !== '0';
  let wasVisible = false;
  const mobile = () => isMobileMode();
  let asideMode = readStore(KEY_MODE) === 'graph' ? 'graph' : 'config'; // lembra o último modo

  // A aside só aparece nas telas que têm painel; trocar de tela troca o conteúdo, não o estado
  function apply() {
    const focus = shellFocus();
    const mode = ASIDE_MODES[focus];
    const visible = (mobile() ? mobileOpen : wantOpen) && !!mode;
    if (mobile()) {
      // drawer: a grade do desktop não muda; abrir é uma classe no próprio drawer (+ push do conteúdo)
      app.classList.add('is-right-aside-collapsed');
      aside.classList.toggle('is-open-mobile', visible);
      app.classList.toggle('has-right-drawer-open', visible);
      document.body.classList.toggle('has-right-drawer-open', visible);
    } else {
      aside.classList.remove('is-open-mobile');
      app.classList.remove('has-right-drawer-open');
      document.body.classList.remove('has-right-drawer-open');
      app.classList.toggle('is-right-aside-collapsed', !visible);
      if (visible && !wasVisible) slideIn(aside, 28); // abre deslizando da direita
    }
    wasVisible = visible;
    const graph = visible && asideMode === 'graph';
    const cfg = visible && !graph;
    if (mode && titleEl) titleEl.textContent = graph ? GRAPH_TITLE : mode;
    toggles().forEach(b => {
      b.classList.toggle('is-active', cfg);
      b.setAttribute('aria-pressed', String(cfg));
    });
    document.querySelectorAll('[data-aside-graph]').forEach(b => {
      b.classList.toggle('is-active', graph);
      b.setAttribute('aria-pressed', String(graph));
    });

    // Cada tela mostra só o seu painel (o modo Constelações cobre todos)
    requestViewSettings(cfg && focus === 'bases');
    if (focus !== 'bases' || graph) hosts.bases.hidden = true;
    if (hosts.tools) hosts.tools.hidden = !(cfg && focus === 'bases');
    hosts.notes.hidden = !(cfg && focus === 'notes');
    hosts.board.hidden = !(cfg && focus === 'board');
    if (cfg && focus === 'notes') showNotePanel(hosts.notes); else hideNotePanel(hosts.notes);
    if (cfg && focus === 'board') renderBoardPanel(hosts.board);
    if (graph) showGraphPanel(hosts.graph); else hideGraphPanel(hosts.graph);

    window.dispatchEvent(new CustomEvent('resize')); // motores canvas reencaixam na nova largura
  }

  function setOpen(open) {
    if (mobile()) {
      mobileOpen = open;
    } else {
      wantOpen = open;
      writeStore(KEY_OPEN, open ? '1' : '0');
    }
    apply();
  }
  api = { setOpen, isOpen: () => (mobile() ? mobileOpen : wantOpen) };
  function setMode(m) {
    asideMode = m;
    writeStore(KEY_MODE, m);
  }

  document.addEventListener('click', (e) => {
    const hub = e.target.closest?.('[data-aside-graph]');
    if (hub) { // hub: abre no grafo; se já está no grafo, recolhe
      e.stopPropagation();
      if (api.isOpen() && asideMode === 'graph') { setOpen(false); return; }
      setMode('graph');
      setOpen(true);
      return;
    }
    const btn = e.target.closest?.('[data-aside-toggle]');
    if (btn) { // tune: volta às configurações; se já está nelas, recolhe
      e.stopPropagation();
      if (api.isOpen() && asideMode === 'graph') { setMode('config'); apply(); return; }
      setOpen(!api.isOpen());
    }
  });
  closeBtn?.addEventListener('click', () => setOpen(false));
  // o "X" do painel de configurações da view também recolhe a aside
  document.addEventListener(EVT_SETTINGS_CLOSED, () => {
    if (asideMode === 'graph') return; // o "X" das configurações não deve fechar o grafo
    setOpen(false);
  });
  document.addEventListener('quickdock:shell-focus', apply);

  // ── Largura (alça entre a tela e a aside) ──
  const setWidth = w => document.documentElement.style.setProperty('--right-aside-width', clampWidth(w) + 'px');
  const saved = parseInt(readStore(KEY_WIDTH), 10);
  if (saved) setWidth(saved);

  resizer?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing-col');
    const startX = e.clientX;
    const startW = aside.getBoundingClientRect().width;
    app.style.transition = 'none';
    const onMove = ev => setWidth(startW + (startX - ev.clientX));
    const onUp = () => {
      resizer.removeEventListener('pointermove', onMove);
      resizer.removeEventListener('pointerup', onUp);
      resizer.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-resizing-col');
      app.style.transition = '';
      writeStore(KEY_WIDTH, String(parseInt(document.documentElement.style.getPropertyValue('--right-aside-width'), 10) || ''));
      window.dispatchEvent(new CustomEvent('resize'));
    };
    resizer.addEventListener('pointermove', onMove);
    resizer.addEventListener('pointerup', onUp);
    resizer.addEventListener('pointercancel', onUp);
  });
  resizer?.addEventListener('dblclick', () => {
    document.documentElement.style.removeProperty('--right-aside-width');
    writeStore(KEY_WIDTH, '');
    window.dispatchEvent(new CustomEvent('resize'));
  });

  apply();
}
