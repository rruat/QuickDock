// Modos mês/semana/dia e título do header
// ── CONTROLE DO TIPO DE VISUALIZAÇÃO (MÊS, SEMANA, DIA) ──
function setCalendarViewMode(mode) {
  if (activeWeekCol) {
    // Troca de visão com coluna aberta: fecha sem esperar a animação
    activeWeekCol.dataset.noteText = notepadTextarea.value.trim();
    activeWeekCol.classList.remove('is-expanded', 'notepad-active');
    calendarWeekView.classList.remove('is-col-expanded');
    weekColumnsEl.style.gridTemplateColumns = '';
    weekHeaderEl.style.gridTemplateColumns = '';
    inCellNotepad.classList.remove('is-revealed');
    inCellNotepad.style.display = 'none';
    calendarView.appendChild(inCellNotepad);
    activeWeekCol = null;
    isWeekTransitioning = false;
  } else if (activeCell) {
    collapseCell();
  } else if (inCellNotepad.style.display !== 'none') {
    closeDirectNoteView();
  }

  currentViewMode = mode;

  // 1. Atualiza botões no switcher rápido da aside
  document.querySelectorAll('.view-type-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.viewMode === mode);
  });

  // 2. Atualiza itens no card detalhado da aside
  document.querySelectorAll('.view-type-item').forEach(item => {
    const isActive = item.dataset.viewMode === mode;
    item.classList.toggle('is-active', isActive);
    const badge = item.querySelector('.view-item-badge');
    if (badge) {
      badge.textContent = isActive ? 'Ativo' : 'Selecionar';
    }
  });

  // 3. Exibe a visualização correspondente
  // Escolher mês/semana/dia sempre volta para o calendário (altera o rascunho da view)
  setDraftType('calendar');
  syncViewSwitcher();
  applyPanelVisibility();

  // 4. Atualiza os títulos no Header e Footer
  updateHeaderForCurrentViewMode();
}

function updateHeaderForCurrentViewMode() {
  if (typeof renderDayNotes === 'function') renderDayNotes();
  const viewName = activeView().name;
  sectionHeaderIcon.textContent = VIEW_TYPES[dataView].icon;
  btnBackToCalendar.style.display = 'none';
  btnCloseNoteHeader.style.display = 'none';
  btnToggleRightAside.title = 'Configurações da view';

  // O header mostra o nome da view ativa; o rodapé, o nome + a forma de ver
  if (dataView !== 'calendar') {
    sectionHeaderTitle.textContent = viewName;
    if (footerActiveViewName) footerActiveViewName.textContent = `${viewName} (${VIEW_TYPES[dataView].label})`;
  } else if (currentViewMode === 'month') {
    sectionHeaderTitle.textContent = viewName;
    if (footerActiveViewName) footerActiveViewName.textContent = `${viewName} (Mês)`;
  } else if (currentViewMode === 'week') {
    sectionHeaderTitle.textContent = `${viewName} • Semana`;
    if (footerActiveViewName) footerActiveViewName.textContent = `${viewName} (Semana)`;
  } else {
    sectionHeaderTitle.textContent = `${viewName} • Dia ${activeDayNumber}`;
    if (footerActiveViewName) footerActiveViewName.textContent = `${viewName} (Dia)`;
  }
}


