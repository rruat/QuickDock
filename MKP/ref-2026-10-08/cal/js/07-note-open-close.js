// Abrir e fechar a nota direta (semana, dia, tabela, galeria)
// ── NOTA DIRETA PARA VISÃO SEMANAL E DIÁRIA ──
function openDirectNoteForDay(dayNumber, dayTitle, item = null) {
  activeDayNumber = dayNumber;
  setOpenItem(item, dayNumber, dayTitle || 'Outubro de 2026');
  btnBackToCalendar.style.display = 'inline-flex';
  btnCloseNoteHeader.style.display = 'inline-flex';
  btnToggleRightAside.title = 'Painel da Nota';

  [calendarMonthView, calendarWeekView, calendarDayView, dataTableView, dataGalleryView]
    .forEach(p => p?.classList.add('is-hidden'));

  // Configura conteúdo da nota
  calendarView.appendChild(inCellNotepad);
  inCellNotepad.style.display = 'flex';
  inCellNotepad.classList.add('is-revealed');

  notepadTextarea.value = (dayNumber === '7') ? 'Reunião de alinhamento QuickDock Spatial Shell • Revisão das views de Mês, Semana e Dia.' : '';
  updateNoteStats();

  if (asideNoteDateBadge) asideNoteDateBadge.textContent = `Dia ${dayNumber} de Outubro`;
  if (asideNoteSubDate) asideNoteSubDate.textContent = dayTitle || 'Outubro de 2026';
  setAsideMode(asideModeFor(item));

  setTimeout(() => {
    if (!item || item.kind !== 'quadro') notepadTextarea.focus();
  }, 100);
}

function closeDirectNoteView() {
  inCellNotepad.classList.remove('is-revealed');
  inCellNotepad.style.display = 'none';
  calendarView.appendChild(inCellNotepad);

  // Restaura a visão ativa atual
  applyPanelVisibility();

  updateHeaderForCurrentViewMode();
  setAsideMode('calendar');
}

function handleCloseNote() {
  if (activeWeekCol) {
    collapseWeekCol();
  } else if (activeCell) {
    collapseCell();
  } else if (inCellNotepad.style.display !== 'none') {
    closeDirectNoteView();
  }
}


