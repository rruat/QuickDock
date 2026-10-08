// Expansão da coluna (visão semanal)
// ── EXPANSÃO DA COLUNA (VISÃO SEMANAL) — mesma animação da célula do mês ──
const weekColumnsEl = document.querySelector('.calendar-week-columns');
const weekHeaderEl = document.querySelector('.calendar-week-header');
let activeWeekCol = null;
let isWeekTransitioning = false;

function setWeekTracks(openIndex) {
  const tracks = Array.from({ length: 7 }, (_, i) =>
    openIndex === null ? '14.2857%' : (i === openIndex ? '100%' : '0%')).join(' ');
  weekColumnsEl.style.gridTemplateColumns = tracks;
  weekHeaderEl.style.gridTemplateColumns = tracks;
}

function expandWeekCol(col, item = null) {
  if (isWeekTransitioning || activeWeekCol === col) return;
  isWeekTransitioning = true;
  activeWeekCol = col;

  const day = col.getAttribute('data-day') || '7';
  const dayName = col.getAttribute('data-day-name') || `Dia ${day} de Outubro`;
  activeDayNumber = day;

  setOpenItem(item, day, dayName);
  btnBackToCalendar.style.display = 'inline-flex';
  btnCloseNoteHeader.style.display = 'inline-flex';
  btnToggleRightAside.title = 'Painel da Nota';

  notepadTextarea.value = col.dataset.noteText || (day === '7' ? 'Reunião de alinhamento QuickDock Spatial Shell • Revisão das views de Mês, Semana e Dia.' : '');
  updateNoteStats();

  col.appendChild(inCellNotepad);
  inCellNotepad.style.display = 'flex';
  inCellNotepad.classList.remove('is-revealed');
  col.classList.remove('notepad-active');
  col.classList.add('is-expanded');
  calendarWeekView.classList.add('is-col-expanded');

  if (asideNoteDateBadge) asideNoteDateBadge.textContent = `Dia ${day} de Outubro`;
  if (asideNoteSubDate) asideNoteSubDate.textContent = dayName;
  setAsideMode(asideModeFor(item));

  setWeekTracks(Array.from(weekColumnsEl.children).indexOf(col));

  setTimeout(() => {
    if (activeWeekCol === col) {
      col.classList.add('notepad-active');
      inCellNotepad.classList.add('is-revealed');
    }
  }, 200);
  setTimeout(() => {
    isWeekTransitioning = false;
    notepadTextarea.focus();
  }, 350);
}

function collapseWeekCol() {
  if (!activeWeekCol || isWeekTransitioning) return;
  isWeekTransitioning = true;
  const col = activeWeekCol;
  col.dataset.noteText = notepadTextarea.value.trim();

  inCellNotepad.classList.remove('is-revealed');
  col.classList.remove('notepad-active');
  updateHeaderForCurrentViewMode();
  setAsideMode('calendar');

  setWeekTracks(null);
  calendarWeekView.classList.remove('is-col-expanded');

  setTimeout(() => {
    col.classList.remove('is-expanded');
    inCellNotepad.style.display = 'none';
    calendarView.appendChild(inCellNotepad);
    activeWeekCol = null;
    isWeekTransitioning = false;
  }, 350);
}


