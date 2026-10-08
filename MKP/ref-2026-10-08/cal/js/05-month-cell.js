// Expansão da célula (visão mensal)
// ── EXPANSÃO DA CÉLULA (VISÃO MENSAL) ──
function expandCell(cell, item = null) {
  if (isTransitioning || activeCell === cell) return;
  isTransitioning = true;
  activeCell = cell;

  const dayIndex = dayCells.indexOf(cell);
  const colIndex = dayIndex % 7;
  const rowIndex = Math.floor(dayIndex / 7);

  const dayNum = cell.getAttribute('data-day') || cell.querySelector('.calendar-day-number')?.textContent || '';
  activeDayNumber = dayNum;
  const isOtherMonth = cell.classList.contains('calendar-day-other-month');

  // 1. O Header da view equipara ao cabeçalho da nota (ou do quadro)
  setOpenItem(item, dayNum, isOtherMonth ? 'Dia de outro mês' : 'Outubro de 2026');
  btnBackToCalendar.style.display = 'inline-flex';
  btnCloseNoteHeader.style.display = 'inline-flex';
  btnToggleRightAside.title = 'Painel da Nota';

  // 2. Prepara o conteúdo do bloco de notas dentro da célula
  notepadTextarea.value = cell.dataset.noteText || '';
  updateNoteStats();

  cell.appendChild(inCellNotepad);
  inCellNotepad.style.display = 'flex';
  inCellNotepad.classList.remove('is-revealed');
  cell.classList.remove('notepad-active');

  cell.classList.add('is-expanded');
  calendarGrid.classList.add('is-cell-expanded');
  calendarBody.classList.add('is-cell-expanded');

  // 3. Atualiza os dados na Aside da Nota e comuta o modo da aside
  if (asideNoteDateBadge) asideNoteDateBadge.textContent = `Dia ${dayNum} de Outubro`;
  if (asideNoteSubDate) asideNoteSubDate.textContent = isOtherMonth ? 'Dia de outro mês' : 'Outubro de 2026';
  setAsideMode(asideModeFor(item));

  // 4. Colunas e linhas expandem a 100%, empurrando as demais células até sumirem nas bordas
  const cols = Array.from({ length: 7 }, (_, i) => i === colIndex ? '100%' : '0%').join(' ');
  const rows = Array.from({ length: 5 }, (_, i) => i === rowIndex ? '100%' : '0%').join(' ');

  if (calendarWeekdays) calendarWeekdays.style.gridTemplateColumns = cols;
  calendarGrid.style.gridTemplateColumns = cols;
  calendarGrid.style.gridTemplateRows = rows;

  // Revela suavemente o conteúdo do editor à medida que os outlines atingem as bordas
  setTimeout(() => {
    if (activeCell === cell) {
      cell.classList.add('notepad-active');
      inCellNotepad.classList.add('is-revealed');
    }
  }, 200);

  setTimeout(() => {
    isTransitioning = false;
    notepadTextarea.focus();
  }, 350);
}

function collapseCell() {
  if (!activeCell || isTransitioning) return;
  isTransitioning = true;

  // 1. Salva a nota na célula e atualiza a prévia
  const noteText = notepadTextarea.value.trim();
  activeCell.dataset.noteText = noteText;

  let previewEl = activeCell.querySelector('.calendar-day-note-preview');
  if (noteText) {
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.className = 'calendar-day-note-preview';
      activeCell.appendChild(previewEl);
    }
    previewEl.textContent = noteText;
  } else if (previewEl) {
    previewEl.remove();
  }

  // Esconde o conteúdo do editor para que a contração mostre os outlines voltando à célula
  inCellNotepad.classList.remove('is-revealed');
  activeCell.classList.remove('notepad-active');

  // 2. Restaura o Header da view de volta para Calendário
  updateHeaderForCurrentViewMode();

  // 3. Retorna a Aside para o modo de configurações do Calendário
  setAsideMode('calendar');

  // 4. Restaura a grade e o cabeçalho dos dias para 7 colunas e 5 linhas iguais
  const defaultCols = Array.from({ length: 7 }, () => '14.2857%').join(' ');
  const defaultRows = Array.from({ length: 5 }, () => '20%').join(' ');

  if (calendarWeekdays) calendarWeekdays.style.gridTemplateColumns = defaultCols;
  calendarGrid.style.gridTemplateColumns = defaultCols;
  calendarGrid.style.gridTemplateRows = defaultRows;
  calendarGrid.classList.remove('is-cell-expanded');
  calendarBody.classList.remove('is-cell-expanded');

  setTimeout(() => {
    if (activeCell) {
      activeCell.classList.remove('is-expanded');
      inCellNotepad.style.display = 'none';
      calendarView.appendChild(inCellNotepad);
      activeCell = null;
    }
    isTransitioning = false;
  }, 350);
}


