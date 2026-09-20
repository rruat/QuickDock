// ── bases-calendar-view.js ───────────────────────────────────────────────────
// Visualização em Calendário Mensal para Bases do QuickDock.
// Agrupa notas por uma propriedade de data (ex: 'data', 'date', 'created_at', 'vencimento').

import { getNotePropertyValue } from './bases-engine.js';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Normaliza um valor de data para string YYYY-MM-DD
 */
function normalizeDateToYMD(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // YYYY-MM-DD...
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (iso) return iso[0];
  // DD/MM/YYYY
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/**
 * Renderiza a visualização em Calendário num contêiner DOM.
 * @param {HTMLElement} container
 * @param {Array<Object>} notes
 * @param {Object} schema
 * @param {Object} viewConfig - { dateProperty }
 * @param {Object} callbacks - { onOpenNote, onAddNote }
 */
export function renderBaseCalendarView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  container.className = 'base-view-container base-calendar-container';

  // Identifica a propriedade de data usada
  let dateProp = viewConfig.dateProperty;
  if (!dateProp) {
    // Procura a primeira propriedade de tipo date no schema ou usa 'date'/'data'
    const found = schema?.properties?.find(p => p.type === 'date' || p.type === 'datetime');
    dateProp = found ? found.name : 'data';
  }

  // Estado do mês sendo visualizado (armazenado no dataset do container para manter navegação)
  let curYear = container._calYear ?? new Date().getFullYear();
  let curMonth = container._calMonth ?? new Date().getMonth();

  // Cabeçalho de Navegação do Calendário
  const navBar = document.createElement('div');
  navBar.className = 'base-cal-nav';

  const titleEl = document.createElement('h3');
  titleEl.className = 'base-cal-month-title';
  titleEl.textContent = `${MESES[curMonth]} de ${curYear}`;

  const navBtns = document.createElement('div');
  navBtns.className = 'base-cal-nav-buttons';

  const btnPrev = document.createElement('button');
  btnPrev.className = 'base-cal-btn';
  btnPrev.title = 'Mês anterior';
  btnPrev.innerHTML = '‹';
  btnPrev.addEventListener('click', () => {
    curMonth--;
    if (curMonth < 0) { curMonth = 11; curYear--; }
    container._calYear = curYear;
    container._calMonth = curMonth;
    renderBaseCalendarView(container, notes, schema, viewConfig, callbacks);
  });

  const btnToday = document.createElement('button');
  btnToday.className = 'base-cal-btn base-cal-btn-today';
  btnToday.textContent = 'Hoje';
  btnToday.addEventListener('click', () => {
    const now = new Date();
    curYear = now.getFullYear();
    curMonth = now.getMonth();
    container._calYear = curYear;
    container._calMonth = curMonth;
    renderBaseCalendarView(container, notes, schema, viewConfig, callbacks);
  });

  const btnNext = document.createElement('button');
  btnNext.className = 'base-cal-btn';
  btnNext.title = 'Próximo mês';
  btnNext.innerHTML = '›';
  btnNext.addEventListener('click', () => {
    curMonth++;
    if (curMonth > 11) { curMonth = 0; curYear++; }
    container._calYear = curYear;
    container._calMonth = curMonth;
    renderBaseCalendarView(container, notes, schema, viewConfig, callbacks);
  });

  navBtns.append(btnPrev, btnToday, btnNext);
  navBar.append(titleEl, navBtns);
  container.appendChild(navBar);

  // Mapeia notas por data YYYY-MM-DD
  const notesByDate = new Map();
  notes.forEach(note => {
    const rawVal = getNotePropertyValue(note, dateProp);
    const ymd = normalizeDateToYMD(rawVal);
    if (ymd) {
      if (!notesByDate.has(ymd)) notesByDate.set(ymd, []);
      notesByDate.get(ymd).push(note);
    }
  });

  // Grade do Calendário
  const gridEl = document.createElement('div');
  gridEl.className = 'base-cal-grid';

  // Cabeçalhos dos dias da semana
  const daysHeader = document.createElement('div');
  daysHeader.className = 'base-cal-weekdays';
  DIAS_SEMANA.forEach(dia => {
    const dEl = document.createElement('div');
    dEl.className = 'base-cal-weekday-cell';
    dEl.textContent = dia;
    daysHeader.appendChild(dEl);
  });
  gridEl.appendChild(daysHeader);

  // Células dos dias
  const daysGrid = document.createElement('div');
  daysGrid.className = 'base-cal-days';

  const firstDayIndex = new Date(curYear, curMonth, 1).getDay();
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const prevMonthDays = new Date(curYear, curMonth, 0).getDate();

  const hoje = new Date();
  const hojeYMD = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  // Dias do mês anterior para preencher a primeira semana
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'base-cal-day-cell is-other-month';
    const dayNum = prevMonthDays - i;
    cell.innerHTML = `<span class="base-cal-day-num">${dayNum}</span>`;
    daysGrid.appendChild(cell);
  }

  // Dias do mês corrente
  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'base-cal-day-cell';
    if (ymd === hojeYMD) cell.classList.add('is-today');

    const header = document.createElement('div');
    header.className = 'base-cal-day-header';

    const numSpan = document.createElement('span');
    numSpan.className = 'base-cal-day-num';
    numSpan.textContent = day;

    const addBtn = document.createElement('button');
    addBtn.className = 'base-cal-day-add';
    addBtn.title = 'Adicionar nota nesta data';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onAddNote) callbacks.onAddNote({ [dateProp]: ymd });
    });

    header.append(numSpan, addBtn);
    cell.appendChild(header);

    // Notas deste dia
    const dayNotes = notesByDate.get(ymd) || [];
    if (dayNotes.length > 0) {
      const itemsList = document.createElement('div');
      itemsList.className = 'base-cal-items-list';

      dayNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'base-cal-item';
        item.textContent = note.title || 'Sem título';
        item.title = note.title || 'Sem título';
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (callbacks.onOpenNote) callbacks.onOpenNote(note.id);
        });
        itemsList.appendChild(item);
      });

      cell.appendChild(itemsList);
    }

    daysGrid.appendChild(cell);
  }

  // Preenche o final da última semana com dias do próximo mês
  const totalRendered = firstDayIndex + daysInMonth;
  const remaining = (7 - (totalRendered % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const cell = document.createElement('div');
    cell.className = 'base-cal-day-cell is-other-month';
    cell.innerHTML = `<span class="base-cal-day-num">${i}</span>`;
    daysGrid.appendChild(cell);
  }

  gridEl.appendChild(daysGrid);
  container.appendChild(gridEl);
}
