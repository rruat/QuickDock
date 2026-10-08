// Eventos de clique do calendário e do painel da nota
// Delegação de cliques para a Grade Mensal
calendarGrid?.addEventListener('click', (e) => {
  if (activeCell) return;

  const addBtn = e.target.closest('.calendar-day-add-btn');
  if (addBtn) {
    e.stopPropagation();
    const cell = addBtn.closest('.calendar-day');
    if (cell) expandCell(cell);
    return;
  }

  const cell = e.target.closest('.calendar-day');
  if (cell) {
    expandCell(cell, itemFromChip(e.target));
  }
});

// Delegação de cliques para a Visão Semanal
calendarWeekView?.addEventListener('click', (e) => {
  if (activeWeekCol) return;
  const col = e.target.closest('.calendar-week-col');
  if (col) expandWeekCol(col, itemFromChip(e.target));
});

// Delegação de cliques para a Visão Diária
calendarDayView?.addEventListener('click', (e) => {
  const slot = e.target.closest('.day-timeline-hour');
  if (slot) {
    openDirectNoteForDay(activeDayNumber, `Dia ${activeDayNumber} de Outubro`, itemFromChip(e.target));
    return;
  }
  const quickAdd = e.target.closest('#btnDayQuickAdd');
  if (quickAdd) {
    openDirectNoteForDay(activeDayNumber, `Dia ${activeDayNumber} de Outubro`);
  }
});

// Navegação de dias na Visão Diária
document.getElementById('btnPrevDay')?.addEventListener('click', (e) => {
  e.stopPropagation();
  let n = parseInt(activeDayNumber, 10);
  if (n > 1) {
    activeDayNumber = String(n - 1);
    const titleEl = document.getElementById('dayViewCurrentTitle');
    if (titleEl) titleEl.textContent = `${activeDayNumber} de Outubro de 2026`;
    updateHeaderForCurrentViewMode();
  }
});

document.getElementById('btnNextDay')?.addEventListener('click', (e) => {
  e.stopPropagation();
  let n = parseInt(activeDayNumber, 10);
  if (n < 31) {
    activeDayNumber = String(n + 1);
    const titleEl = document.getElementById('dayViewCurrentTitle');
    if (titleEl) titleEl.textContent = `${activeDayNumber} de Outubro de 2026`;
    updateHeaderForCurrentViewMode();
  }
});

// Eventos do Seletor de Tipo de Visualização na Aside (Mês, Semana, Dia)
document.querySelectorAll('.view-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.getAttribute('data-view-mode');
    if (mode) setCalendarViewMode(mode);
  });
});

document.querySelectorAll('.view-type-item').forEach(item => {
  item.addEventListener('click', () => {
    const mode = item.getAttribute('data-view-mode');
    if (mode) setCalendarViewMode(mode);
  });
});

// Controles dos painéis laterais e botões de ação
btnToggleRightHeader?.addEventListener('click', toggleRightAsideForCurrentView);
btnToggleRightAside?.addEventListener('click', toggleRightAsideForCurrentView);
btnCloseRightAside?.addEventListener('click', () => { closeRightAside(); btnToggleGraph?.classList.remove('is-active'); });
btnToggleGraph?.addEventListener('click', toggleGraphFromButton);
btnSwapAsideGraph?.addEventListener('click', () => setGraphView(!graphView));


btnBackToCalendar?.addEventListener('click', handleCloseNote);
btnCloseNoteHeader?.addEventListener('click', handleCloseNote);
btnSaveNotepad?.addEventListener('click', handleCloseNote);
btnAsideDoneNote?.addEventListener('click', handleCloseNote);

btnAsideClearNote?.addEventListener('click', () => {
  notepadTextarea.value = '';
  updateNoteStats();
  if (activeCell) {
    activeCell.dataset.noteText = '';
    const previewEl = activeCell.querySelector('.calendar-day-note-preview');
    if (previewEl) previewEl.remove();
  }
});

notepadTextarea?.addEventListener('input', updateNoteStats);


