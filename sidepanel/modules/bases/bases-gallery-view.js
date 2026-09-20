// ── bases-gallery-view.js ────────────────────────────────────────────────────
// Visualização em Galeria (Cards/Grade) para Bases do QuickDock.
// Estilo Obsidian Bases / Notion Gallery: cartões visuais com capa, título e propriedades.

import { getNotePropertyValue } from './bases-engine.js';
import { formatPropertyValue } from './bases-schema.js';
import { formatSelectBadge } from './bases-cell-editors.js';

/**
 * Renderiza a visualização em Galeria num contêiner DOM.
 * @param {HTMLElement} container
 * @param {Array<Object>} notes - Lista de notas já filtradas e ordenadas
 * @param {Object} schema - Schema da base ({ properties: [...] })
 * @param {Object} viewConfig - Configuração da visão ({ coverProperty, visibleProperties, cardSize })
 * @param {Object} callbacks - { onOpenNote, onAddNote, onUpdateProperty }
 */
export function renderBaseGalleryView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  container.className = 'base-view-container base-gallery-container';

  const cardSize = viewConfig.cardSize || 'medium'; // 'small' | 'medium' | 'large'
  const visibleProps = viewConfig.visibleProperties || [];
  const coverProp = viewConfig.coverProperty || 'cover';

  const grid = document.createElement('div');
  grid.className = `base-gallery-grid base-gallery-${cardSize}`;

  // Renderiza cada cartão de nota
  notes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'base-gallery-card';
    card.dataset.noteId = note.id;

    // 1. Capa do Cartão (Cover)
    const coverEl = document.createElement('div');
    coverEl.className = 'base-gallery-cover';

    // Tenta obter imagem de capa: propriedade explícita, primeira imagem nos blocos, ou thumbnail
    let coverUrl = null;
    if (note.properties && note.properties[coverProp]) {
      coverUrl = note.properties[coverProp];
    } else if (note.blocks && Array.isArray(note.blocks)) {
      const imgBlock = note.blocks.find(b => b.type === 'image' && (b.dataUrl || b.src));
      if (imgBlock) coverUrl = imgBlock.dataUrl || imgBlock.src;
    }

    if (coverUrl) {
      coverEl.style.backgroundImage = `url("${coverUrl}")`;
      coverEl.classList.add('has-image');
    } else {
      // Capa padrão com gradiente sutil e ícone de nota
      coverEl.classList.add('cover-placeholder');
      coverEl.innerHTML = `<svg class="base-gallery-placeholder-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>`;
    }
    card.appendChild(coverEl);

    // 2. Corpo do Cartão
    const bodyEl = document.createElement('div');
    bodyEl.className = 'base-gallery-body';

    // Título
    const titleEl = document.createElement('div');
    titleEl.className = 'base-gallery-title';
    titleEl.textContent = note.title || 'Sem título';
    titleEl.title = note.title || 'Sem título';
    bodyEl.appendChild(titleEl);

    // Propriedades visíveis
    if (visibleProps.length > 0) {
      const propsEl = document.createElement('div');
      propsEl.className = 'base-gallery-props';

      visibleProps.forEach(propName => {
        if (propName === 'title' || propName === coverProp) return;
        const propDef = schema?.properties?.find(p => p.name === propName) || { name: propName, type: 'text' };
        const rawVal = getNotePropertyValue(note, propName);
        if (rawVal == null || rawVal === '' || (Array.isArray(rawVal) && rawVal.length === 0)) return;

        const propRow = document.createElement('div');
        propRow.className = 'base-gallery-prop-row';

        const label = document.createElement('span');
        label.className = 'base-gallery-prop-name';
        label.textContent = propDef.label || propDef.name;

        const valEl = document.createElement('span');
        valEl.className = 'base-gallery-prop-value';

        if (propDef.type === 'select') {
          valEl.innerHTML = formatSelectBadge(rawVal, propDef.options);
        } else if (propDef.type === 'checkbox') {
          valEl.textContent = rawVal ? '✓ Sim' : '—';
        } else {
          valEl.textContent = formatPropertyValue(rawVal, propDef.type);
        }

        propRow.append(label, valEl);
        propsEl.appendChild(propRow);
      });

      bodyEl.appendChild(propsEl);
    }

    card.appendChild(bodyEl);

    // Clique abre a nota
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onOpenNote) callbacks.onOpenNote(note.id);
    });

    grid.appendChild(card);
  });

  // Botão "+ Novo Cartão"
  const addCard = document.createElement('div');
  addCard.className = 'base-gallery-card base-gallery-add-card';
  addCard.innerHTML = `
    <div class="base-gallery-add-inner">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>Adicionar nota</span>
    </div>
  `;
  addCard.addEventListener('click', () => {
    if (callbacks.onAddNote) callbacks.onAddNote();
  });
  grid.appendChild(addCard);

  container.appendChild(grid);
}
