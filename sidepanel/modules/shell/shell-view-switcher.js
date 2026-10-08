// ── shell-view-switcher.js ──────────────────────────────────────────────────
// Clicar no cabeçalho da tela da Base expande as formas de ver os mesmos dados (calendário,
// tabela, galeria…), como no mockup. Escolher uma troca o TIPO da view ativa, mantendo o
// nome e os filtros dela; o painel de Bases (bases-view-container.js) faz a troca.

import { VIEW_TYPES } from '../bases/config/view-model.js';
import { requestSetViewType } from '../bases/engine/view-request.js';
import { NEW_VIEW_TYPES } from '../workspace-base-model.js';
import { loadWorkspaceDef, getActiveViewId } from '../workspace-base.js';

export function initViewSwitcher() {
  const section = document.getElementById('bases-view');
  const header = document.getElementById('basesSectionHeader');
  const list = document.getElementById('viewSwitcherList');
  if (!section || !header || !list) return;

  list.innerHTML = NEW_VIEW_TYPES.map(t => `
    <button type="button" class="view-switch-btn" data-type="${t}" role="tab">
      <span class="material-symbols-rounded">${VIEW_TYPES[t].icon}</span>
      <strong>${VIEW_TYPES[t].label}</strong>
    </button>`).join('');

  function sync() {
    const def = loadWorkspaceDef();
    const active = def.views.find(v => v.id === getActiveViewId(def));
    list.querySelectorAll('.view-switch-btn').forEach(b => {
      const on = b.dataset.type === active?.type;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  // Clique no cabeçalho (fora dos botões) abre/fecha o seletor
  header.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    section.classList.toggle('is-switcher-open');
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-switch-btn');
    if (btn) requestSetViewType(btn.dataset.type);
  });

  ['quickdock:workspace-base-saved', 'quickdock:workspace-active-view-changed'].forEach(ev =>
    document.addEventListener(ev, sync));
  sync();
}
