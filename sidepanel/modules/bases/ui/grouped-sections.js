// ── grouped-sections.js ─────────────────────────────────────────────────────
// Agrupamento recolhível reaproveitado por Lista e Galeria (a tabela tem o próprio,
// em linhas). Sem grupo configurado, só chama `renderItems` com todas as notas.

import { resolveGroupConfig } from '../config/view-model.js';
import { groupNotes } from '../engine/group-engine.js';
import { getNotePropertyValue } from '../bases-engine.js';

/**
 * @param {HTMLElement} host
 * @param {{ notes, schema, view }} o
 * @param {(box:HTMLElement, notes:Array)=>void} renderItems  desenha os itens de um grupo em `box`
 * @param {(patch:Object)=>void} [onViewChange]
 */
export function renderGrouped(host, { notes, schema, view }, renderItems, onViewChange) {
  const cfg = resolveGroupConfig(view);
  if (!cfg.prop) { renderItems(host, notes); return; }

  for (const g of groupNotes(notes, cfg, schema, getNotePropertyValue)) {
    const fechado = cfg.collapsed.includes(g.key);
    const sec = document.createElement('section');
    sec.className = 'base-group' + (fechado ? ' is-collapsed' : '');
    sec.dataset.groupKey = g.key;

    const cab = document.createElement('button');
    cab.type = 'button';
    cab.className = 'base-group-header';
    cab.setAttribute('aria-expanded', String(!fechado));
    cab.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${fechado ? 'chevron_right' : 'expand_more'}</span>`;
    const nome = document.createElement('span');
    nome.className = 'base-group-label';
    nome.textContent = g.label;
    cab.appendChild(nome);
    if (cfg.showCounts) {
      const c = document.createElement('span');
      c.className = 'base-group-count';
      c.textContent = String(g.count);
      cab.appendChild(c);
    }
    cab.addEventListener('click', () => {
      const novo = fechado ? cfg.collapsed.filter(k => k !== g.key) : [...cfg.collapsed, g.key];
      onViewChange?.({ group: { collapsed: novo } });
    });
    sec.appendChild(cab);

    if (!fechado) {
      const corpo = document.createElement('div');
      corpo.className = 'base-group-body';
      renderItems(corpo, g.notes);
      sec.appendChild(corpo);
    }
    host.appendChild(sec);
  }
}
