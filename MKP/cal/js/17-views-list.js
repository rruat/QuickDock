// Lista de views na aside esquerda (Home): busca, abrir, criar, duplicar e excluir
// A barra "modificada" do header (Salvar / Descartar) também mora aqui.

const viewListEl = document.getElementById('viewList');
const viewSearchEl = document.getElementById('viewSearch');
const viewDirtyBar = document.getElementById('viewDirtyBar');

// Busca sem acento e sem diferenciar maiúsculas
const normalizeText = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function renderViewList() {
  const q = normalizeText(viewSearchEl.value.trim());
  const rows = VIEWS
    .filter(v => !q || normalizeText(v.name).includes(q))
    .map(v => {
      const type = VIEW_TYPES[v.type];
      const isActive = v.id === activeViewId;
      const canDelete = v.id !== DEFAULT_VIEW_ID;
      return `
        <div class="view-row${isActive ? ' is-active' : ''}" data-id="${v.id}">
          <button type="button" class="view-row-main" data-act="open" title="Abrir ${v.name}">
            <span class="material-symbols-rounded">${type.icon}</span>
            <span class="view-row-text">
              <strong>${escapeHtml(v.name)}</strong>
              <small>${type.label} • ${filterSummary(v.filters)}</small>
            </span>
            ${isActive && isDraftModified() ? '<span class="view-row-dot" title="Modificada"></span>' : ''}
          </button>
          <span class="view-row-actions">
            <button type="button" class="aside-btn" data-act="duplicate" title="Duplicar" aria-label="Duplicar view"><span class="material-symbols-rounded">content_copy</span></button>
            ${canDelete ? '<button type="button" class="aside-btn" data-act="delete" title="Excluir" aria-label="Excluir view"><span class="material-symbols-rounded">delete</span></button>' : ''}
          </span>
        </div>`;
    });
  viewListEl.innerHTML = rows.length
    ? rows.join('')
    : '<div class="view-list-empty">Nenhuma view encontrada.<br>Use <strong>+</strong> para criar uma.</div>';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Barra "modificada" no header: aparece só quando o rascunho difere da view salva
function updateDirtyBar() {
  viewDirtyBar.hidden = !isDraftModified();
  document.getElementById('btnViewSave')?.toggleAttribute('disabled', !isDraftModified());
  document.getElementById('btnViewDiscard')?.toggleAttribute('disabled', !isDraftModified());
}

viewListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  const row = e.target.closest('.view-row');
  if (!btn || !row) return;
  const id = row.dataset.id;
  if (btn.dataset.act === 'open') {
    activateView(id);
    if (mobileMQ.matches) setLeftPanel(null); // no mobile, abrir a view fecha o drawer
  } else if (btn.dataset.act === 'duplicate') {
    duplicateView(id);
  } else if (btn.dataset.act === 'delete') {
    deleteView(id);
  }
});

viewSearchEl.addEventListener('input', renderViewList);

// Nova view: cria, ativa e abre as configurações da view já com o nome selecionado
document.getElementById('btnNewView').addEventListener('click', () => {
  const v = createView();
  viewSearchEl.value = '';
  activateView(v.id);
  setTimeout(showViewConfig, itemOpenNow() ? 460 : 0);
});

document.getElementById('btnDirtySave').addEventListener('click', saveDraftToView);
document.getElementById('btnDirtyDiscard').addEventListener('click', discardDraft);

// Abre a aside direita no painel de configurações da view (e foca o nome)
function showViewConfig() {
  graphView = false;
  setAsideMode('calendar');
  openRightAside();
  const input = document.getElementById('viewNameInput');
  setTimeout(() => { input.focus(); input.select(); }, 60);
}
