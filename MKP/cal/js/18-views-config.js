// Configurações da view (aside direita): nome, tipo, filtros, ordenação e ações

const viewNameInput = document.getElementById('viewNameInput');
const filterDayFrom = document.getElementById('filterDayFrom');
const filterDayTo = document.getElementById('filterDayTo');

// Chips de múltipla escolha (vazio = sem filtro naquele campo)
function chipsHtml(field, options) {
  return options.map(([value, label]) => {
    const on = draft.filters[field].includes(value);
    return `<button type="button" class="filter-chip${on ? ' is-on' : ''}" data-field="${field}" data-value="${value}" aria-pressed="${on}">${label}</button>`;
  }).join('');
}

function renderViewConfig() {
  const v = activeView();
  // O nome só é reescrito quando não está sendo digitado (não perder o cursor)
  if (document.activeElement !== viewNameInput) viewNameInput.value = v.name;

  document.querySelectorAll('#viewTypeSegmented button').forEach(b =>
    b.classList.toggle('is-active', b.dataset.viewType === draft.type));

  document.getElementById('filterFolders').innerHTML = chipsHtml('folders', FOLDERS.map(f => [f, f]));
  document.getElementById('filterKinds').innerHTML = chipsHtml('kinds', [['nota', 'Notas'], ['quadro', 'Quadros']]);
  document.getElementById('filterGroups').innerHTML = chipsHtml('groups', GROUP_ORDER.map(g => [g, GROUP_LABEL[g]]));

  if (document.activeElement !== filterDayFrom) filterDayFrom.value = draft.filters.dayFrom ?? '';
  if (document.activeElement !== filterDayTo) filterDayTo.value = draft.filters.dayTo ?? '';

  document.getElementById('viewSortBy').value = draft.sort.by;
  document.getElementById('viewSortDir').value = draft.sort.dir;

  const shown = visibleItems().length;
  document.getElementById('viewResultCount').textContent = `${shown} de ${FAKE_NOTES.length} itens`;
  document.getElementById('btnViewDelete').hidden = v.id === DEFAULT_VIEW_ID;
  updateDirtyBar();
}

// Nome: salva na hora (renomear não é "modificação" da consulta)
viewNameInput.addEventListener('input', () => {
  renameView(activeViewId, viewNameInput.value);
  updateHeaderForCurrentViewMode();
  renderViewList();
});

document.getElementById('viewTypeSegmented').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view-type]');
  if (!btn || draft.type === btn.dataset.viewType) return;
  if (itemOpenNow()) handleCloseNote();
  draft.type = btn.dataset.viewType;
  onDraftChanged();
});

// Alterna um valor dentro de um filtro de chips
document.getElementById('asideCalendarMode').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  const list = draft.filters[chip.dataset.field];
  const i = list.indexOf(chip.dataset.value);
  if (i >= 0) list.splice(i, 1); else list.push(chip.dataset.value);
  onDraftChanged();
});

function onDayRangeInput() {
  const clamp = v => (v === '' ? null : Math.min(31, Math.max(1, parseInt(v, 10) || 1)));
  draft.filters.dayFrom = clamp(filterDayFrom.value);
  draft.filters.dayTo = clamp(filterDayTo.value);
  onDraftChanged();
}
filterDayFrom.addEventListener('change', onDayRangeInput);
filterDayTo.addEventListener('change', onDayRangeInput);

document.getElementById('viewSortBy').addEventListener('change', (e) => { draft.sort.by = e.target.value; onDraftChanged(); });
document.getElementById('viewSortDir').addEventListener('change', (e) => { draft.sort.dir = e.target.value; onDraftChanged(); });

document.getElementById('btnClearFilters').addEventListener('click', () => {
  draft.filters = emptyFilters();
  onDraftChanged();
});

document.getElementById('btnViewSave').addEventListener('click', saveDraftToView);
document.getElementById('btnViewDiscard').addEventListener('click', discardDraft);
document.getElementById('btnViewSaveAs').addEventListener('click', saveDraftAsNewView);
document.getElementById('btnViewDelete').addEventListener('click', () => deleteView(activeViewId));

renderViewList();
renderViewConfig();
