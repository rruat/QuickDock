// ── shell-month-expand.js ───────────────────────────────────────────────────
// A animação do mockup (MKP/CAL.HTML) para a visão MÊS: ao abrir um item, a célula do dia
// clicado EXPANDE — as linhas e colunas da grade correm até as bordas, as outras células
// somem e o cabeçalho dos dias recolhe — e a célula vira a nova tela. Voltar faz o caminho
// inverso: a célula encolhe e as listras da grade voltam ao lugar.
//
// Mexe só no DOM da grade que o calendário das Bases já desenha (.bcal-month*): anima as
// trilhas do grid (grid-template-rows/columns, em px) e liga classes; nenhuma view é alterada.

import { MOTION_MS, MOTION_EASING } from './shell-motion.js';

const SEL_ROOT = '#bases-body .bcal-month';
let expandedYmd = null;   // dia que está "virando a tela" (para o voltar achar a célula)
let savedRows = '';        // grid-template-rows original da grade (a do renderer)

const px = list => list.map(n => `${n}px`).join(' ');

function parts(root) {
  const weekdays = root.querySelector('.bcal-month-weekdays');
  const weeksEl = root.querySelector('.bcal-month-weeks');
  const rows = [...weeksEl.children];
  return { weekdays, weeksEl, rows };
}

/** Liga o estado "expandido" (célula ocupa tudo) sem transição, partindo das medidas naturais. */
function applyExpandedTracks(root, cell, natural) {
  const { weekdays, weeksEl, rows } = parts(root);
  const row = cell.closest('.bcal-month-week');
  const r = rows.indexOf(row);
  const c = [...row.children].indexOf(cell);
  const H = natural.weeksH + natural.weekdaysH;   // o cabeçalho dos dias também vira espaço da célula
  const W = natural.cols.reduce((a, b) => a + b, 0);
  const targetRows = natural.rows.map((_, i) => (i === r ? H : 0));
  const targetCols = natural.cols.map((_, i) => (i === c ? W : 0));
  weeksEl.style.gridTemplateRows = px(targetRows);
  rows.forEach(rw => { rw.style.gridTemplateColumns = px(targetCols); });
  weekdays.style.gridTemplateColumns = px(targetCols);
  weekdays.style.height = '0px';
}

function measure(root, cell) {
  const { weekdays, weeksEl, rows } = parts(root);
  const row = cell.closest('.bcal-month-week');
  return {
    rows: rows.map(r => r.getBoundingClientRect().height),
    cols: [...row.children].map(c => c.getBoundingClientRect().width),
    weeksH: weeksEl.getBoundingClientRect().height,
    weekdaysH: weekdays.getBoundingClientRect().height,
  };
}

function setNaturalTracks(root, natural) {
  const { weekdays, weeksEl, rows } = parts(root);
  weeksEl.style.gridTemplateRows = px(natural.rows);
  rows.forEach(rw => { rw.style.gridTemplateColumns = px(natural.cols); });
  weekdays.style.gridTemplateColumns = px(natural.cols);
  weekdays.style.height = `${natural.weekdaysH}px`;
}

/** Remove qualquer marca da animação e devolve a grade ao que o renderer desenhou. */
export function resetMonthExpansion() {
  const root = document.querySelector(SEL_ROOT);
  expandedYmd = null;
  if (!root) return;
  const { weekdays, weeksEl, rows } = parts(root);
  root.classList.remove('is-cell-expanding', 'is-cell-animating', 'is-cell-revealing');
  root.querySelectorAll('.is-expanded-cell').forEach(c => c.classList.remove('is-expanded-cell'));
  if (savedRows) weeksEl.style.gridTemplateRows = savedRows;
  rows.forEach(rw => { rw.style.gridTemplateColumns = ''; });
  weekdays.style.gridTemplateColumns = '';
  weekdays.style.height = '';
}

/** A célula `cell` do mês existe e está na tela (dá para animar)? */
export function canExpandMonthCell(cell) {
  return !!cell?.isConnected && !!cell.closest(SEL_ROOT) && cell.getBoundingClientRect().width > 0;
}

/** Expande a célula até ocupar a grade inteira; `done()` quando termina (aí a tela troca). */
export function expandMonthCell(cell, done) {
  const root = cell.closest('.bcal-month');
  const { weeksEl } = parts(root);
  savedRows = weeksEl.style.gridTemplateRows;
  expandedYmd = cell.dataset.ymd || null;

  const natural = measure(root, cell);
  setNaturalTracks(root, natural);              // trilhas em px: ponto de partida animável
  root.classList.add('is-cell-expanding');
  cell.classList.add('is-expanded-cell');
  void root.offsetHeight;                        // fixa o ponto de partida antes de animar
  root.classList.add('is-cell-animating');
  applyExpandedTracks(root, cell, natural);
  // o conteúdo da célula some enquanto a tela real (nota/quadro) aparece por cima
  setTimeout(() => root.classList.add('is-cell-revealing'), 200);
  setTimeout(done, MOTION_MS + 20);
}

/** Voltar: reconstrói a grade já expandida (a tela pode ter sido redesenhada) e a encolhe. */
export function collapseMonthCell(done = () => {}) {
  const ymd = expandedYmd;
  const root = document.querySelector(SEL_ROOT);
  const cell = ymd && root?.querySelector(`.bcal-month-cell[data-ymd="${ymd}"]`);
  if (!cell || !canExpandMonthCell(cell)) { resetMonthExpansion(); done(); return; }

  // 0) tamanho NATURAL da grade: se ela ainda está expandida (não foi redesenhada), desfaz antes de medir
  const { weeksEl } = parts(root);
  if (!savedRows) savedRows = weeksEl.style.gridTemplateRows;
  resetMonthExpansion();
  void root.offsetHeight;
  const natural = measure(root, cell);
  expandedYmd = ymd;
  // 1) estado expandido, sem transição
  root.classList.remove('is-cell-animating');
  root.classList.add('is-cell-expanding', 'is-cell-revealing');
  cell.classList.add('is-expanded-cell');
  setNaturalTracks(root, natural);
  applyExpandedTracks(root, cell, natural);
  void root.offsetHeight;
  // 2) encolhe: o conteúdo volta e as trilhas retornam ao tamanho natural
  root.classList.add('is-cell-animating');
  root.classList.remove('is-cell-revealing');
  setNaturalTracks(root, natural);
  setTimeout(() => { resetMonthExpansion(); done(); }, MOTION_MS + 20);
}

export const monthExpansionActive = () => expandedYmd !== null;
export { MOTION_EASING };
