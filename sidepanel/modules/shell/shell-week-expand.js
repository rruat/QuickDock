// ── shell-week-expand.js ────────────────────────────────────────────────────
// A animação do mockup para a visão SEMANA/DIA: ao abrir um item, a COLUNA do dia clicado
// expande — as demais colunas encolhem a zero, o cabeçalho dos dias e a faixa "dia inteiro"
// recolhem, o cabeçalho da tela é engolido — e a coluna vira a nova tela. Voltar faz o caminho
// inverso. Mesma API do shell-month-expand.js (expand / collapse / reset / active).
//
// Mexe só no DOM da grade que calendar-time-grid.js já desenha (.bcal-time*): anima as trilhas
// do grid (grid-template-columns, em px) e liga classes; nenhuma view é alterada.

import { MOTION_MS } from './shell-motion.js';
import { px, headerParts, setSection } from './shell-expand-shared.js';

const SEL_ROOT = '#bases-body .bcal-time';
let expandedYmd = null;   // dia que está "virando a tela" (para o voltar achar a coluna)
const saved = new WeakMap(); // faixa → grid-template-columns inline original (a do renderer)

function parts(root) {
  return {
    head: root.querySelector('.bcal-time-head'),
    allday: root.querySelector('.bcal-allday'),
    inner: root.querySelector('.bcal-time-inner'),
  };
}
const grids = root => { const { head, allday, inner } = parts(root); return [head, allday, inner].filter(Boolean); };

function setTracks(root, list) {
  const value = px(list);
  grids(root).forEach(g => { g.style.gridTemplateColumns = value; });
}

/** Larguras naturais (gutter + colunas) e alturas que recolhem junto. */
function measure(root) {
  const { head, allday, inner } = parts(root);
  const cols = [...inner.children].map(c => c.getBoundingClientRect().width);
  return {
    cols,
    total: Math.min(cols.reduce((a, b) => a + b, 0), root.clientWidth || Infinity),
    headH: head?.getBoundingClientRect().height ?? 0,
    alldayH: allday?.getBoundingClientRect().height ?? 0,
    screenH: (headerParts().header?.getBoundingClientRect().height ?? 0),
  };
}

const indexOfCol = (root, col) => [...parts(root).inner.children].indexOf(col);

function applyExpanded(root, idx, natural) {
  setTracks(root, natural.cols.map((_, i) => (i === idx ? natural.total : 0)));
  const { head, allday } = parts(root);
  if (head) head.style.height = '0px';
  if (allday) allday.style.height = '0px';
  const { header } = headerParts();
  if (header) header.style.height = '0px';
}

function setNatural(root, natural) {
  setTracks(root, natural.cols);
  const { head, allday } = parts(root);
  if (head) head.style.height = `${natural.headH}px`;
  if (allday) allday.style.height = `${natural.alldayH}px`;
  const { header } = headerParts();
  if (header) header.style.height = `${natural.screenH}px`;
}

/** Remove qualquer marca da animação e devolve a grade ao que o renderer desenhou. */
export function resetWeekExpansion() {
  const root = document.querySelector(SEL_ROOT);
  expandedYmd = null;
  ['is-month-expanding', 'is-month-animating'].forEach(c => setSection(c, false)); // mesmas regras do cabeçalho
  const { header } = headerParts();
  if (header) header.style.height = '';
  if (!root) return;
  root.classList.remove('is-col-expanding', 'is-col-animating', 'is-col-revealing');
  root.querySelectorAll('.is-expanded-col').forEach(c => c.classList.remove('is-expanded-col'));
  const { head, allday, inner } = parts(root);
  if (head) { head.style.gridTemplateColumns = ''; head.style.height = ''; }
  if (allday) { allday.style.gridTemplateColumns = saved.get(allday) ?? allday.style.gridTemplateColumns; allday.style.height = ''; }
  if (inner) inner.style.gridTemplateColumns = saved.get(inner) ?? inner.style.gridTemplateColumns;
}

/** A coluna `col` da semana/dia existe e está na tela (dá para animar)? */
export function canExpandWeekColumn(col) {
  return !!col?.isConnected && !!col.closest(SEL_ROOT) && col.getBoundingClientRect().width > 0;
}

function rememberOriginals(root) {
  const { allday, inner } = parts(root);
  [allday, inner].forEach(g => { if (g && !saved.has(g)) saved.set(g, g.style.gridTemplateColumns); });
}

/** Expande a coluna até ocupar a grade inteira; `done()` quando termina (aí a tela troca). */
export function expandWeekColumn(col, done) {
  const root = col.closest('.bcal-time');
  rememberOriginals(root);
  expandedYmd = col.dataset.ymd || null;
  const natural = measure(root);
  setNatural(root, natural);                     // trilhas em px: ponto de partida animável
  root.classList.add('is-col-expanding');
  setSection('is-month-expanding', true);        // o cabeçalho da tela recolhe como no mês
  col.classList.add('is-expanded-col');
  void root.offsetHeight;                         // fixa o ponto de partida antes de animar
  root.classList.add('is-col-animating');
  setSection('is-month-animating', true);
  applyExpanded(root, indexOfCol(root, col), natural);
  setTimeout(() => root.classList.add('is-col-revealing'), 200);
  setTimeout(done, MOTION_MS + 20);
}

/** Voltar: reconstrói a grade já expandida (a tela pode ter sido redesenhada) e a encolhe. */
export function collapseWeekColumn(done = () => {}) {
  const ymd = expandedYmd;
  const root = document.querySelector(SEL_ROOT);
  const col = ymd && root?.querySelector(`.bcal-col[data-ymd="${ymd}"]`);
  if (!col || !canExpandWeekColumn(col)) { resetWeekExpansion(); done(); return; }

  resetWeekExpansion();                           // tamanho NATURAL antes de medir
  void root.offsetHeight;
  rememberOriginals(root);
  const natural = measure(root);
  expandedYmd = ymd;
  // 1) estado expandido, sem transição
  root.classList.remove('is-col-animating');
  setSection('is-month-animating', false);
  root.classList.add('is-col-expanding', 'is-col-revealing');
  setSection('is-month-expanding', true);
  col.classList.add('is-expanded-col');
  setNatural(root, natural);
  applyExpanded(root, indexOfCol(root, col), natural);
  void root.offsetHeight;
  // 2) encolhe: o conteúdo volta e as trilhas retornam ao tamanho natural
  root.classList.add('is-col-animating');
  setSection('is-month-animating', true);
  root.classList.remove('is-col-revealing');
  setNatural(root, natural);
  setTimeout(() => { resetWeekExpansion(); done(); }, MOTION_MS + 20);
}

export const weekExpansionActive = () => expandedYmd !== null;
