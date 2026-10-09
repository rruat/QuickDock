// ── calendar-day-sheet.js ───────────────────────────────────────────────────
// Mobile: tocar numa célula do mês EXPANDE a própria célula (da posição dela até a área inteira do
// calendário) numa folha do dia — botões "Nova nota" e "Novo quadro" e a lista dos itens daquele
// dia. Escolher um botão ou item abre a tela correspondente; a folha já ocupa tudo, então a troca
// de tela continua o movimento. No desktop nada disso é usado (a célula expande pelo shell).

import { MOTION_MS } from '../../shell/shell-motion.js';
import { eventTimeLabel } from './calendar-event-el.js';

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function longDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dia = DIAS[new Date(y, m - 1, d).getDay()];
  return { weekday: dia, day: `${d} de ${MESES[m - 1]} de ${y}` };
}

/**
 * Cria um quadro datado de `ymd` (o calendário usa a data de criação dos quadros) e o abre.
 * Import dinâmico: o motor do quadro é pesado e só é preciso aqui, na hora do toque.
 */
export async function createBoardOnDay(ymd) {
  const { createBlankBoard, updateBoardMeta } = await import('../../board-engine.js');
  const { openNoteFromBase } = await import('../open-note.js');
  const board = await createBlankBoard('Novo quadro');
  const noon = new Date(`${ymd}T12:00:00`).getTime();
  if (Number.isFinite(noon)) await updateBoardMeta(board.uid, { createdAt: noon });
  document.dispatchEvent(new CustomEvent('quickdock:board-changed', { detail: { id: board.id, uid: board.uid } }));
  openNoteFromBase(`board-${board.id}`);
}

/** Retângulo da célula relativo ao `host` (a folha nasce exatamente em cima dela). */
function rectWithin(host, cell) {
  const h = host.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  return { top: c.top - h.top, left: c.left - h.left, width: c.width, height: c.height };
}

function setBox(sheet, box) {
  sheet.style.top = `${box.top}px`;
  sheet.style.left = `${box.left}px`;
  sheet.style.width = `${box.width}px`;
  sheet.style.height = `${box.height}px`;
}

/**
 * @param {HTMLElement} host   área do calendário (a folha cobre ela inteira)
 * @param {HTMLElement} cell   célula do dia tocada (origem da animação)
 * @param {{ ymd:string, items:Array<{ev:Object, seg?:Object}>, cfg:Object,
 *           onOpen:(id:any)=>void, onCreateNote:()=>any, onCreateBoard:(ymd:string)=>any }} opts
 */
export function openDaySheet(host, cell, { ymd, items, onOpen, onCreateNote, onCreateBoard }) {
  closeDaySheet(host, { instant: true });
  host.classList.add('has-day-sheet');

  const sheet = el('section', 'bcal-day-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Dia');
  const origin = rectWithin(host, cell);
  setBox(sheet, origin);

  const { weekday, day } = longDate(ymd);
  const head = el('header', 'bcal-sheet-head');
  const titles = el('div', 'bcal-sheet-titles');
  titles.append(el('span', 'bcal-sheet-weekday', weekday), el('span', 'bcal-sheet-date', day));
  const close = el('button', 'bcal-sheet-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar dia');
  close.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">close</span>';
  head.append(titles, close);

  const actions = el('div', 'bcal-sheet-actions');
  const mkAction = (icon, label, kind) => {
    const b = el('button', `bcal-sheet-action is-${kind}`);
    b.type = 'button';
    b.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span>${label}</span>`;
    return b;
  };
  const btnNote = mkAction('note_add', 'Nova nota', 'note');
  const btnBoard = mkAction('dashboard_customize', 'Novo quadro', 'board');
  actions.append(btnNote, btnBoard);

  const list = el('div', 'bcal-sheet-list');
  if (!items.length) list.appendChild(el('p', 'bcal-sheet-empty', 'Nada neste dia ainda.'));
  for (const { ev, seg } of items) {
    const row = el('button', 'bcal-sheet-item');
    row.type = 'button';
    if (ev.note?.isBoard) row.dataset.kind = 'quadro';
    const icon = el('span', 'material-symbols-rounded bcal-sheet-item-icon', ev.note?.isBoard ? 'space_dashboard' : 'description');
    icon.setAttribute('aria-hidden', 'true');
    const text = el('span', 'bcal-sheet-item-title', ev.title);
    row.append(icon, text);
    const hora = eventTimeLabel(ev, seg);
    if (hora) row.appendChild(el('span', 'bcal-sheet-item-time', hora));
    row.addEventListener('click', () => leave(() => onOpen(ev.note.id)));
    list.appendChild(row);
  }

  const body = el('div', 'bcal-sheet-body');
  body.append(actions, list);
  sheet.append(head, body);
  host.appendChild(sheet);

  // Depois de abrir uma tela por cima, a folha some sem animação (a Base fica por baixo, intacta)
  function leave(action) {
    Promise.resolve(action()).finally(() => setTimeout(() => closeDaySheet(host, { instant: true }), MOTION_MS + 120));
  }

  close.addEventListener('click', () => closeDaySheet(host));
  btnNote.addEventListener('click', () => leave(() => onCreateNote()));
  btnBoard.addEventListener('click', () => leave(() => onCreateBoard(ymd)));

  sheet._origin = origin;
  void sheet.offsetHeight;                 // fixa o ponto de partida antes de animar
  sheet.classList.add('is-open');
  setBox(sheet, { top: 0, left: 0, width: host.clientWidth, height: host.clientHeight });
  setTimeout(() => { // cola nas bordas (inset: 0), acompanhando girar a tela / teclado
    if (!sheet.isConnected || !sheet.classList.contains('is-open')) return;
    sheet.classList.add('is-settled');
    sheet.removeAttribute('style');
  }, MOTION_MS + 20);
  close.focus({ preventScroll: true });
  return sheet;
}

/** Fecha a folha encolhendo-a de volta à célula (ou na hora, sem animação). */
export function closeDaySheet(host, { instant = false } = {}) {
  const sheet = host.querySelector(':scope > .bcal-day-sheet');
  if (!sheet) { host.classList.remove('has-day-sheet'); return; }
  const done = () => { sheet.remove(); host.classList.remove('has-day-sheet'); };
  if (instant || !sheet._origin) { done(); return; }
  // volta do "inset: 0" para pixels, para a transição ter de onde partir
  const full = { top: 0, left: 0, width: host.clientWidth, height: host.clientHeight };
  setBox(sheet, full);
  sheet.classList.remove('is-settled');
  void sheet.offsetHeight;
  sheet.classList.remove('is-open');
  setBox(sheet, sheet._origin);
  setTimeout(done, MOTION_MS + 20);
}
