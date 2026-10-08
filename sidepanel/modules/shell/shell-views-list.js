// ── shell-views-list.js ─────────────────────────────────────────────────────
// Lista de VIEWS na aside esquerda (Home), como no mockup: há uma Base só (todos os itens) e
// as views dela — calendário, tabela, galeria… — são o que se escolhe, cria, duplica e exclui.
// A Base e as views vivem em workspace-base.js; o painel (bases-view.js) mostra a ativa.

import { createBlankNote } from '../notes-tabs.js';
import { VIEW_TYPES } from '../bases/config/view-model.js';
import { requestSelectViewNow } from '../bases/engine/view-request.js';
import { loadWorkspaceDef, saveWorkspaceDef, getActiveViewId, setActiveViewId, getModifiedViewIds } from '../workspace-base.js';
import {
  NEW_VIEW_TYPES, filterWorkspaceViews, addWorkspaceView, duplicateWorkspaceView,
  deleteWorkspaceView, renameWorkspaceView,
} from '../workspace-base-model.js';
import { escapeHtml } from './shell-views.js';
import { resolveDraftBeforeAction } from './shell-draft-bar.js';

export function initAsideViewsList({ openView }) {
  const listEl = document.getElementById('asideViewsList');
  const searchEl = document.getElementById('asideViewsSearch');
  const addBtn = document.getElementById('btnNewBaseView');
  const typesEl = document.getElementById('asideNewViewTypes');
  if (!listEl) return;

  const shellFocus = () => document.documentElement.dataset.shellFocus;

  function render() {
    const def = loadWorkspaceDef();
    const activeId = getActiveViewId(def);
    const views = filterWorkspaceViews(def.views, searchEl?.value || '');
    if (!views.length) {
      listEl.innerHTML = '<div class="aside-views-empty">Nenhuma view encontrada.<br>Use <strong>+</strong> para criar uma.</div>';
      return;
    }
    const canDelete = def.views.length > 1;
    const modified = new Set(getModifiedViewIds());
    listEl.innerHTML = views.map(v => {
      const type = VIEW_TYPES[v.type] || { label: v.type, icon: 'table_chart' };
      const nome = v.name || type.label;
      return `
        <div class="aside-view-item${v.id === activeId ? ' is-active' : ''}" data-id="${escapeHtml(v.id)}">
          <button type="button" class="aside-view-main" data-act="open" title="Abrir ${escapeHtml(nome)}">
            <span class="material-symbols-rounded">${escapeHtml(v.icon || type.icon)}</span>
            <span class="aside-view-text">
              <strong>${escapeHtml(nome)}${modified.has(v.id) ? '<i class="aside-view-dirty" title="Alterações não salvas" aria-label="Modificada"></i>' : ''}</strong>
              <small>${escapeHtml(type.label)}</small>
            </span>
          </button>
          <span class="aside-view-actions">
            <button type="button" class="aside-btn" data-act="rename" title="Renomear" aria-label="Renomear view"><span class="material-symbols-rounded">edit</span></button>
            <button type="button" class="aside-btn" data-act="duplicate" title="Duplicar" aria-label="Duplicar view"><span class="material-symbols-rounded">content_copy</span></button>
            ${canDelete ? '<button type="button" class="aside-btn" data-act="delete" title="Excluir" aria-label="Excluir view"><span class="material-symbols-rounded">delete</span></button>' : ''}
          </span>
        </div>`;
    }).join('');
  }

  // Abre a tela da Base já na view escolhida (com a Base montada, a troca é por evento)
  function selectView(id) {
    setActiveViewId(id);
    if (shellFocus() !== 'bases') openView('bases');
    setTimeout(() => requestSelectViewNow(id), 0);
    render();
  }

  // Criar/duplicar/renomear/excluir regravam a Base e o painel remonta nela
  function commit(def, activeId) {
    if (activeId) setActiveViewId(activeId);
    saveWorkspaceDef(def);
    if (shellFocus() !== 'bases') openView('bases');
  }

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('.aside-view-item');
    if (!btn || !row) return;
    const id = row.dataset.id;
    if (btn.dataset.act !== 'open' && !resolveDraftBeforeAction()) return;
    const def = loadWorkspaceDef();
    const view = def.views.find(v => v.id === id);
    if (btn.dataset.act === 'open') selectView(id);
    else if (btn.dataset.act === 'duplicate') { const r = duplicateWorkspaceView(def, id); commit(r.baseDef, r.newId); }
    else if (btn.dataset.act === 'rename') {
      const nome = window.prompt('Nome da view:', view?.name || '');
      if (nome !== null) commit(renameWorkspaceView(def, id, nome), id);
    } else if (btn.dataset.act === 'delete') {
      if (!window.confirm(`Excluir a view "${view?.name || id}"?`)) return;
      const r = deleteWorkspaceView(def, id, getActiveViewId(def));
      commit(r.def, r.activeId);
    }
  });

  searchEl?.addEventListener('input', render);

  // Teclado: setas ↑/↓ percorrem as views (a busca desce para a primeira)
  const mains = () => [...listEl.querySelectorAll('.aside-view-main')];
  listEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const lista = mains(), i = lista.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    lista[Math.min(lista.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  });
  searchEl?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); mains()[0]?.focus(); }
  });

  // "+": escolhe o TIPO da nova view (calendário, tabela, galeria…)
  typesEl.innerHTML = NEW_VIEW_TYPES.map(t =>
    `<button type="button" class="aside-new-view-type" data-type="${t}"><span class="material-symbols-rounded">${VIEW_TYPES[t].icon}</span>${VIEW_TYPES[t].label}</button>`).join('');
  addBtn?.addEventListener('click', () => {
    typesEl.hidden = !typesEl.hidden;
    addBtn.setAttribute('aria-expanded', String(!typesEl.hidden));
  });
  typesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    typesEl.hidden = true;
    addBtn.setAttribute('aria-expanded', 'false');
    if (!resolveDraftBeforeAction()) return;
    const r = addWorkspaceView(loadWorkspaceDef(), btn.dataset.type);
    commit(r.def, r.id);
  });

  // Nota nova: o explorador antigo está desligado, então ela nasce por aqui
  document.getElementById('btnNewNoteAside')?.addEventListener('click', async () => {
    await createBlankNote();
    openView('notes');
  });

  // Quadro novo (espaço infinito): é um item da Base, como uma nota
  document.getElementById('btnNewBoardAside')?.addEventListener('click', async () => {
    const { createBlankBoard } = await import('../board-engine.js');
    await createBlankBoard('Novo quadro');
    openView('board');
  });

  ['quickdock:workspace-base-saved', 'quickdock:workspace-active-view-changed', 'quickdock:workspace-draft-changed'].forEach(ev =>
    document.addEventListener(ev, render));

  render();
}
