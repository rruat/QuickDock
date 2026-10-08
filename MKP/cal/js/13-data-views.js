// Calendário/Tabela/Galeria: visibilidade, seletor no header, abrir da lista
// Visibilidade dos painéis conforme tipo de view (calendário/tabela/galeria) e modo (mês/semana/dia)
function applyPanelVisibility() {
  const cal = dataView === 'calendar';
  calendarMonthView.classList.toggle('is-hidden', !(cal && currentViewMode === 'month'));
  calendarWeekView.classList.toggle('is-hidden', !(cal && currentViewMode === 'week'));
  calendarDayView.classList.toggle('is-hidden', !(cal && currentViewMode === 'day'));
  dataTableView.classList.toggle('is-hidden', dataView !== 'table');
  dataGalleryView.classList.toggle('is-hidden', dataView !== 'gallery');
}

function syncViewSwitcher() {
  document.querySelectorAll('.view-switch-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.dataView === dataView));
  if (typeof syncLeftHome === 'function') syncLeftHome(); // painel Home da aside esquerda
}

function setDataView(next) {
  if (activeWeekCol || activeCell || inCellNotepad.style.display !== 'none') handleCloseNote();
  setDraftType(next); // o tipo vira parte do rascunho da view (aparece como modificada)
  syncViewSwitcher();
  applyPanelVisibility();
  updateHeaderForCurrentViewMode();
}

const dataTableView = document.getElementById('dataTableView');
const dataGalleryView = document.getElementById('dataGalleryView');
const calendarSection = document.getElementById('section-calendar');

// Clique no header expande/recolhe o seletor de tipo de view (não dispara com os botões nem com nota aberta)
sectionHeader.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  if (activeCell || activeWeekCol || inCellNotepad.style.display !== 'none') return;
  calendarSection.classList.toggle('is-switcher-open');
});

document.querySelectorAll('.view-switch-btn').forEach(btn =>
  btn.addEventListener('click', () => setDataView(btn.dataset.dataView)));

// Abrir nota a partir da tabela/galeria
const openFromData = (e) => {
  const row = e.target.closest('[data-id]');
  const item = row ? ITEM_BY_ID[row.dataset.id] : null;
  if (item) openDirectNoteForDay(String(item.day), item.title, item.kind === 'quadro' ? item : null);
};
dataTableView.addEventListener('click', openFromData);
dataGalleryView.addEventListener('click', openFromData);


