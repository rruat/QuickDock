// Views salvas: modelo, filtros, ordenação, rascunho e persistência
// Uma view não guarda dados: é só uma consulta (filtros + ordenação) e uma forma de mostrar
// (calendário, tabela ou galeria) sobre a MESMA base de itens (FAKE_NOTES).
//
// Fluxo: a view salva fica em VIEWS; as alterações feitas na tela vão para o `draft`
// (rascunho). Se o rascunho difere da view salva, a view aparece como "modificada" e o
// usuário escolhe Salvar, Salvar como nova ou Descartar.

const VIEWS_STORAGE_KEY = 'qd-mock-cal-views-v1';
const DEFAULT_VIEW_ID = 'all';
const VIEW_TYPES = {
  calendar: { label: 'Calendário', icon: 'calendar_month' },
  table:    { label: 'Tabela',     icon: 'table_rows' },
  gallery:  { label: 'Galeria',    icon: 'grid_view' }
};
const KIND_LABEL = { nota: 'Nota', quadro: 'Quadro' };

const emptyFilters = () => ({ folders: [], kinds: [], groups: [], dayFrom: null, dayTo: null });
const newViewId = () => 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);

function seedViews() {
  return [
    { id: DEFAULT_VIEW_ID, name: 'Todos os itens', type: 'calendar', filters: emptyFilters(), sort: { by: 'date', dir: 'asc' } },
    { id: 'seed-reunioes', name: 'Agenda de reuniões', type: 'calendar',
      filters: { ...emptyFilters(), folders: ['Reuniões'] }, sort: { by: 'date', dir: 'asc' } },
    { id: 'seed-design', name: 'Galeria de design', type: 'gallery',
      filters: { ...emptyFilters(), folders: ['Design'] }, sort: { by: 'date', dir: 'asc' } },
    { id: 'seed-produto', name: 'Projetos e quadros do produto', type: 'table',
      filters: { ...emptyFilters(), folders: ['Produto'], kinds: ['nota', 'quadro'] }, sort: { by: 'title', dir: 'asc' } },
    { id: 'seed-quadros', name: 'Todos os quadros', type: 'gallery',
      filters: { ...emptyFilters(), kinds: ['quadro'] }, sort: { by: 'date', dir: 'desc' } }
  ];
}

// ── Persistência (só preferência de quem usa; o mockup funciona sem ela) ──
function loadViewsState() {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY));
    if (raw && Array.isArray(raw.views) && raw.views.length && raw.views.some(v => v.id === DEFAULT_VIEW_ID)) return raw;
  } catch (_) { /* sem storage: usa as views de exemplo */ }
  return { views: seedViews(), activeId: DEFAULT_VIEW_ID };
}

function persistViewsState() {
  try { localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify({ views: VIEWS, activeId: activeViewId })); } catch (_) { /* ignora */ }
}

// ── Estado ──
const _loaded = loadViewsState();
let VIEWS = _loaded.views;
let activeViewId = VIEWS.some(v => v.id === _loaded.activeId) ? _loaded.activeId : DEFAULT_VIEW_ID;

const getView = id => VIEWS.find(v => v.id === id);
const activeView = () => getView(activeViewId);

// Só o que entra no "modificada": tipo, filtros e ordenação (o nome salva na hora)
const settingsOf = v => JSON.parse(JSON.stringify({ type: v.type, filters: v.filters, sort: v.sort }));
let draft = settingsOf(activeView());
dataView = draft.type; // 01-state.js declara `dataView`: aqui ele passa a seguir o tipo da view

const isDraftModified = () => JSON.stringify(draft) !== JSON.stringify(settingsOf(activeView()));

// ── Filtros e ordenação ──
function itemMatches(n, f) {
  if (f.folders.length && !f.folders.includes(n.folder)) return false;
  if (f.kinds.length && !f.kinds.includes(n.kind)) return false;
  if (f.groups.length && !f.groups.includes(n.group)) return false;
  if (f.dayFrom != null && n.day < f.dayFrom) return false;
  if (f.dayTo != null && n.day > f.dayTo) return false;
  return true;
}

const visibleItems = () => FAKE_NOTES.filter(n => itemMatches(n, draft.filters));

function sortedVisible() {
  const { by, dir } = draft.sort;
  const sign = dir === 'desc' ? -1 : 1;
  const cmp = {
    date:   (a, b) => (a.day - b.day) || a.time.localeCompare(b.time),
    title:  (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
    folder: (a, b) => a.folder.localeCompare(b.folder, 'pt-BR') || (a.day - b.day)
  }[by] || (() => 0);
  return visibleItems().sort((a, b) => sign * cmp(a, b));
}

// Resumo curto para a lista: "Galeria • Design" / "Tabela • 3 filtros" / "Calendário • sem filtros"
function filterSummary(f) {
  const parts = [];
  if (f.folders.length) parts.push(f.folders.length === 1 ? f.folders[0] : `${f.folders.length} pastas`);
  if (f.kinds.length === 1) parts.push(KIND_LABEL[f.kinds[0]] + 's');
  else if (f.kinds.length > 1) parts.push(`${f.kinds.length} tipos`);
  if (f.groups.length) parts.push(f.groups.length === 1 ? GROUP_LABEL[f.groups[0]] : `${f.groups.length} grupos`);
  if (f.dayFrom != null || f.dayTo != null) parts.push(`dias ${f.dayFrom ?? 1}–${f.dayTo ?? 31}`);
  return parts.length ? parts.join(' + ') : 'sem filtros';
}

// ── Ações sobre as views ──
function itemOpenNow() {
  return !!(activeWeekCol || activeCell || inCellNotepad.style.display !== 'none');
}

// Aplica o rascunho na tela: itens, painel visível, header, lista e configurações
function refreshAfterViewChange() {
  dataView = draft.type;
  renderMonthNotes();
  renderWeekNotes();
  renderDayNotes();
  renderTableView();
  renderGalleryView();
  applyPanelVisibility();
  updateHeaderForCurrentViewMode();
  syncViewSwitcher();
  renderViewList();
  renderViewConfig();
  updateDirtyBar();
}

// Mudou só o rascunho (tipo/filtro/ordem): mostra o resultado sem trocar de view
function onDraftChanged() {
  refreshAfterViewChange();
}

function activateView(id) {
  if (!getView(id)) return;
  const apply = () => {
    activeViewId = id;
    draft = settingsOf(activeView());
    persistViewsState();
    refreshAfterViewChange();
  };
  // Se há nota/quadro aberto, fecha com a animação e só então troca de view
  if (itemOpenNow()) { handleCloseNote(); setTimeout(apply, 420); } else apply();
}

// Tipo escolhido no header ou na escala do calendário: altera o rascunho
function setDraftType(type) {
  if (draft.type === type) { dataView = type; return; }
  draft.type = type;
  dataView = type;
  updateDirtyBar();
  renderViewList();
  renderViewConfig();
}

function saveDraftToView() {
  Object.assign(activeView(), settingsOf({ type: draft.type, filters: draft.filters, sort: draft.sort }));
  persistViewsState();
  refreshAfterViewChange();
}

function discardDraft() {
  draft = settingsOf(activeView());
  refreshAfterViewChange();
}

function createView(partial = {}) {
  const v = {
    id: newViewId(),
    name: partial.name || 'Nova view',
    type: partial.type || 'table',
    filters: partial.filters || emptyFilters(),
    sort: partial.sort || { by: 'date', dir: 'asc' }
  };
  VIEWS.push(v);
  return v;
}

function saveDraftAsNewView() {
  const base = activeView();
  const v = createView({ name: `${base.name} (cópia)`, ...settingsOf({ type: draft.type, filters: draft.filters, sort: draft.sort }) });
  activateView(v.id);
  return v;
}

function duplicateView(id) {
  const src = getView(id);
  if (!src) return;
  const v = createView({ name: `${src.name} (cópia)`, ...settingsOf(src) });
  activateView(v.id);
}

function deleteView(id) {
  if (id === DEFAULT_VIEW_ID) return;
  VIEWS = VIEWS.filter(v => v.id !== id);
  if (activeViewId === id) activateView(DEFAULT_VIEW_ID);
  else { persistViewsState(); renderViewList(); }
}

function renameView(id, name) {
  const v = getView(id);
  if (!v) return;
  v.name = name.trim() || 'Sem nome';
  persistViewsState();
}
