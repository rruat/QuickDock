// ── shell-view-groups.js ────────────────────────────────────────────────────
// Legenda "Grupos" no painel Home da aside esquerda: contagem por pasta dos itens da view
// ativa; clicar num grupo liga/desliga um filtro rápido por essa pasta (a barra de filtros
// rápidos da própria view mostra e remove o filtro). Os dados chegam do painel de Bases.

import { EVT_GROUPS, requestGroupFilter } from '../bases/engine/view-request.js';
import { escapeHtml } from './shell-views.js';

export function initViewGroups() {
  const host = document.getElementById('asideGroups');
  if (!host) return;

  document.addEventListener(EVT_GROUPS, (e) => {
    const { groups = [], active = null } = e.detail || {};
    host.hidden = groups.length === 0;
    host.innerHTML = groups.length ? `
      <div class="aside-model-group">Grupos</div>
      ${groups.map(g => `
        <button type="button" class="aside-group${active === g.key ? ' is-active' : ''}" data-key="${escapeHtml(g.key)}" title="Filtrar por ${escapeHtml(g.label)}">
          <i class="aside-group-dot${g.hue === null ? ' is-neutral' : ''}"${g.hue === null ? '' : ` style="--g-hue:${g.hue}"`}></i>
          <span class="aside-group-name">${escapeHtml(g.label)}</span>
          <span class="aside-group-count">${g.count}</span>
        </button>`).join('')}` : '';
  });

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.aside-group');
    if (btn) requestGroupFilter(btn.dataset.key);
  });
}
