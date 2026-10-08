// ── shell-right-aside.js ────────────────────────────────────────────────────
// Aside DIREITA do shell (padrão do mockup MKP/CAL.HTML). Ela muda de conteúdo conforme a
// tela em foco, sempre pelo mesmo botão do cabeçalho:
//   • Base (views)  → configurações da view (o motor de Bases monta o painel dentro dela)
//   • Nota          → propriedades e sumário/backlinks da nota (shell-note-panel.js)
//   • Quadro        → propriedades, fundo e zoom do espaço infinito (shell-board-panel.js)
// Redimensiona pela alça no vão entre a tela e a aside e lembra a largura e se estava aberta.

import { requestViewSettings, EVT_SETTINGS_CLOSED } from '../bases/engine/view-request.js';
import { showNotePanel, hideNotePanel } from './shell-note-panel.js';
import { renderBoardPanel } from './shell-board-panel.js';
import { slideIn } from './shell-motion.js';

const KEY_OPEN = 'quickdock:spatial:right-aside-open';
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

const clampWidth = w => Math.min(RIGHT_ASIDE_MAX, Math.max(RIGHT_ASIDE_MIN, Math.round(w)));
const readStore = k => { try { return localStorage.getItem(k); } catch { return null; } };
const writeStore = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

export function initRightAside() {
  const app = document.getElementById('app');
  const aside = document.getElementById('mRightAside');
  if (!app || !aside) return;
  const titleEl = document.getElementById('rightAsideTitle');
  const closeBtn = document.getElementById('btnCloseRightAside');
  const resizer = document.getElementById('rightAsideResizer');
  const hosts = {
    bases: document.getElementById('rightAsideViewHost'),
    notes: document.getElementById('rightAsideNoteHost'),
    board: document.getElementById('rightAsideBoardHost'),
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
  const toggles = () => document.querySelectorAll('[data-aside-toggle]');

  let wantOpen = readStore(KEY_OPEN) === '1';
  let wasVisible = false;

  // A aside só aparece nas telas que têm painel; trocar de tela troca o conteúdo, não o estado
  function apply() {
    const focus = shellFocus();
    const mode = ASIDE_MODES[focus];
    const visible = wantOpen && !!mode;
    app.classList.toggle('is-right-aside-collapsed', !visible);
    if (visible && !wasVisible) slideIn(aside, 28); // abre deslizando da direita
    wasVisible = visible;
    if (mode && titleEl) titleEl.textContent = mode;
    toggles().forEach(b => {
      b.classList.toggle('is-active', visible);
      b.setAttribute('aria-pressed', String(visible));
    });

    // Cada tela mostra só o seu painel
    requestViewSettings(visible && focus === 'bases');
    if (focus !== 'bases') hosts.bases.hidden = true;
    hosts.notes.hidden = !(visible && focus === 'notes');
    hosts.board.hidden = !(visible && focus === 'board');
    if (visible && focus === 'notes') showNotePanel(hosts.notes); else hideNotePanel(hosts.notes);
    if (visible && focus === 'board') renderBoardPanel(hosts.board);

    window.dispatchEvent(new CustomEvent('resize')); // motores canvas reencaixam na nova largura
  }

  function setOpen(open) {
    wantOpen = open;
    writeStore(KEY_OPEN, open ? '1' : '0');
    apply();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-aside-toggle]');
    if (btn) { e.stopPropagation(); setOpen(!wantOpen); }
  });
  closeBtn?.addEventListener('click', () => setOpen(false));
  // o "X" do painel de configurações da view também recolhe a aside
  document.addEventListener(EVT_SETTINGS_CLOSED, () => {
    wantOpen = false;
    writeStore(KEY_OPEN, '0');
    apply();
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
