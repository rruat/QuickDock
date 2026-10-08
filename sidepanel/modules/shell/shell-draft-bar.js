// ── shell-draft-bar.js ──────────────────────────────────────────────────────
// Barra "modificada" do cabeçalho da Base (padrão do mockup): alterar tipo, filtros ou
// ordenação mexe só no RASCUNHO (workspace-base.js). Enquanto ele difere da Base salva o
// cabeçalho mostra um ponto e os botões Salvar / Salvar como nova / Descartar.

import {
  isWorkspaceDraftModified, commitWorkspaceDraft, discardWorkspaceDraft, saveDraftAsNewWorkspaceView,
} from '../workspace-base.js';

/** Antes de uma ação estrutural (criar, duplicar, renomear, excluir): resolve o rascunho. */
export function resolveDraftBeforeAction() {
  if (!isWorkspaceDraftModified()) return true;
  if (!window.confirm('Há alterações não salvas nas views. Salvar e continuar?')) return false;
  commitWorkspaceDraft();
  return true;
}

export function initDraftBar() {
  const actions = document.querySelector('#basesSectionHeader .section-header-actions');
  if (!actions) return;

  const bar = document.createElement('div');
  bar.className = 'draft-bar';
  bar.id = 'draftBar';
  bar.hidden = true;
  bar.innerHTML = `
    <span class="draft-bar-dot" aria-hidden="true"></span>
    <span class="draft-bar-label">Modificada</span>
    <button type="button" class="draft-bar-btn is-primary" data-draft="save">Salvar</button>
    <button type="button" class="draft-bar-btn" data-draft="new" title="Salvar a view ativa como uma nova view">Salvar como nova</button>
    <button type="button" class="draft-bar-btn" data-draft="discard">Descartar</button>`;
  actions.prepend(bar);

  bar.addEventListener('click', (e) => {
    e.stopPropagation(); // o cabeçalho expande o seletor de tipo ao ser clicado
    const act = e.target.closest('[data-draft]')?.dataset.draft;
    if (act === 'save') commitWorkspaceDraft();
    else if (act === 'new') saveDraftAsNewWorkspaceView();
    else if (act === 'discard') discardWorkspaceDraft();
  });

  const update = () => { bar.hidden = !isWorkspaceDraftModified(); };
  document.addEventListener('quickdock:workspace-draft-changed', update);
  update();
}
