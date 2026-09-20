// ── bases-list-view.js ───────────────────────────────────────────────────────
// Visualização em Lista compacta para Bases do QuickDock.
// Ideal para tarefas, itens curtos, inventários ou logs de notas.

import { getNotePropertyValue } from './bases-engine.js';
import { formatPropertyValue } from './bases-schema.js';
import { formatSelectBadge } from './bases-cell-editors.js';

/**
 * Renderiza a visualização em Lista num contêiner DOM.
 * @param {HTMLElement} container
 * @param {Array<Object>} notes
 * @param {Object} schema
 * @param {Object} viewConfig
 * @param {Object} callbacks
 */
export function renderBaseListView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  container.className = 'base-view-container base-list-container';

  const visibleProps = viewConfig.visibleProperties || [];

  const listEl = document.createElement('div');
  listEl.className = 'base-list-items';

  notes.forEach(note => {
    const row = document.createElement('div');
    row.className = 'base-list-row';
    row.dataset.noteId = note.id;

    // Ícone de documento
    const iconWrap = document.createElement('div');
    iconWrap.className = 'base-list-row-icon';
    iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>`;
    row.appendChild(iconWrap);

    // Título
    const titleEl = document.createElement('div');
    titleEl.className = 'base-list-row-title';
    titleEl.textContent = note.title || 'Sem título';
    titleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onOpenNote) callbacks.onOpenNote(note.id);
    });
    row.appendChild(titleEl);

    // Propriedades alinhadas à direita
    const propsWrap = document.createElement('div');
    propsWrap.className = 'base-list-row-props';

    visibleProps.forEach(propName => {
      if (propName === 'title') return;
      const propDef = schema?.properties?.find(p => p.name === propName) || { name: propName, type: 'text' };
      const rawVal = getNotePropertyValue(note, propName);
      if (rawVal == null || rawVal === '' || (Array.isArray(rawVal) && rawVal.length === 0)) return;

      const propBadge = document.createElement('div');
      propBadge.className = 'base-list-prop-badge';

      if (propDef.type === 'select') {
        propBadge.innerHTML = formatSelectBadge(rawVal, propDef.options);
      } else if (propDef.type === 'checkbox') {
        propBadge.className += rawVal ? ' checked' : '';
        propBadge.textContent = rawVal ? '✓ Sim' : '—';
      } else {
        propBadge.textContent = `${propDef.label || propDef.name}: ${formatPropertyValue(rawVal, propDef.type)}`;
      }

      propsWrap.appendChild(propBadge);
    });

    row.appendChild(propsWrap);
    listEl.appendChild(row);
  });

  // Linha "+ Adicionar nota"
  const addRow = document.createElement('div');
  addRow.className = 'base-list-row base-list-add-row';
  addRow.innerHTML = `
    <span class="base-list-add-icon">+</span>
    <span class="base-list-add-label">Adicionar nota</span>
  `;
  addRow.addEventListener('click', () => {
    if (callbacks.onAddNote) callbacks.onAddNote();
  });
  listEl.appendChild(addRow);

  container.appendChild(listEl);
}
