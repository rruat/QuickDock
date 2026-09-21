// ── bases-board-view.js ───────────────────────────────────────────────────
// Visualização em Quadro Kanban para o QuickDock Bases.
// Suporta arrastar e soltar (Drag & Drop) de cards entre colunas,
// atualizando automaticamente a propriedade correspondente no frontmatter.

import { formatPropertyValue } from './bases-schema.js';
import { getNotePropertyValue, queryBaseNotes, sortBaseNotes } from './bases-engine.js';
import { createNoteRecord, updateNoteMetaById } from '../storage.js';

/**
 * Cria o elemento DOM da visualização em Quadro (Board / Kanban) de uma Base.
 *
 * @param {Object} params
 * @param {Array<Object>} params.notes Coleção de notas
 * @param {Object} params.baseDef Definição da Base
 * @param {Object} params.activeView Visualização ativa (tipo board)
 * @param {Object} params.schema Schema resolvido
 * @param {Function} params.onDefChange Callback ao alterar configuração
 * @returns {HTMLElement}
 */
export function createBaseBoardView({ notes = [], baseDef = {}, activeView = {}, schema = {}, onDefChange = () => {}, showOwnToolbar = true }) {
  const container = document.createElement('div');
  container.className = 'base-view-container base-board-view';

  let currentNotes = [...notes];
  let quickSearchQuery = '';
  const groupByProp = activeView.groupBy || 'status';
  const groupDef = schema[groupByProp] || { key: groupByProp, type: 'select', options: [] };
  const cardProps = Array.isArray(activeView.cardProperties) ? activeView.cardProperties : ['tags', 'prazo', 'prioridade'];

  // ── Barra de ferramentas do Kanban ──────────────────────────────────────────
  // showOwnToolbar=false quando montada dentro de bases-view-container.js —
  // a barra de cima (base-header-bar) já tem busca (ver bases-table-view.js).
  let countBadge = null;
  if (showOwnToolbar) {
    const toolbar = document.createElement('div');
    toolbar.className = 'base-toolbar';

    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'base-toolbar-left';

    const searchInput = document.createElement('input');
    searchInput.className = 'base-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Buscar no quadro...';
    searchInput.addEventListener('input', () => {
      quickSearchQuery = searchInput.value;
      renderBoard();
    });
    toolbarLeft.appendChild(searchInput);

    countBadge = document.createElement('span');
    countBadge.className = 'base-count-badge';
    toolbarLeft.appendChild(countBadge);

    toolbar.appendChild(toolbarLeft);
    container.appendChild(toolbar);
  }

  // ── Colunas do Kanban ───────────────────────────────────────────────────────
  const boardWrap = document.createElement('div');
  boardWrap.className = 'base-board-columns-wrap';
  container.appendChild(boardWrap);

  function getColumnsConfig() {
    const cols = [];

    // Colunas definidas nas opções de select
    if (Array.isArray(groupDef.options) && groupDef.options.length > 0) {
      for (const opt of groupDef.options) {
        const id = typeof opt === 'string' ? opt : (opt.id || opt.label);
        const label = typeof opt === 'string' ? opt : (opt.label || opt.id);
        const color = typeof opt === 'object' && opt.color ? opt.color : 'var(--accent)';
        cols.push({ id, label, color });
      }
    } else {
      // Descobre valores únicos presentes nas notas
      const uniqueVals = new Set();
      for (const n of currentNotes) {
        const v = getNotePropertyValue(n, groupByProp);
        if (v !== undefined && v !== null && v !== '') uniqueVals.add(String(v));
      }
      for (const val of uniqueVals) {
        cols.push({ id: val, label: val, color: 'var(--accent)' });
      }
    }

    // Coluna "Sem valor" sempre disponível
    cols.push({ id: '__empty__', label: 'Sem ' + (groupDef.label || groupByProp), color: 'var(--text-muted)' });
    return cols;
  }

  function renderBoard() {
    boardWrap.innerHTML = '';

    const filtered = queryBaseNotes(currentNotes, {
      source: baseDef.source || {},
      filters: activeView.filters || [],
      filterMode: activeView.filterMode || 'and',
      quickSearch: quickSearchQuery,
    });

    if (countBadge) countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'nota' : 'notas'}`;
    const columnsConfig = getColumnsConfig();

    for (const col of columnsConfig) {
      const colEl = document.createElement('div');
      colEl.className = 'base-board-column';
      colEl.dataset.colId = col.id;

      // Notas pertencentes a esta coluna
      const colNotes = filtered.filter(n => {
        const val = getNotePropertyValue(n, groupByProp);
        if (col.id === '__empty__') {
          return val === undefined || val === null || val === '';
        }
        return String(val) === col.id;
      });

      // Cabeçalho da coluna
      const colHeader = document.createElement('div');
      colHeader.className = 'base-column-header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'base-column-title-wrap';

      const badge = document.createElement('span');
      badge.className = 'base-column-badge';
      badge.style.background = `color-mix(in srgb, ${col.color} 20%, transparent)`;
      badge.style.color = col.color;
      badge.style.borderColor = `color-mix(in srgb, ${col.color} 40%, transparent)`;
      badge.textContent = col.label;

      const colCount = document.createElement('span');
      colCount.className = 'base-column-count';
      colCount.textContent = colNotes.length;

      titleWrap.append(badge, colCount);

      const addBtn = document.createElement('button');
      addBtn.className = 'base-column-add-btn';
      addBtn.title = 'Adicionar nota nesta coluna';
      addBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">add</span>';
      addBtn.onclick = async () => {
        const initialProps = {};
        if (col.id !== '__empty__') initialProps[groupByProp] = col.id;
        if (baseDef.source?.tag) initialProps.tags = [baseDef.source.tag.replace(/^#/, '')];

        const nova = await createNoteRecord({
          title: 'Sem título',
          pasta: baseDef.source?.folder || '',
          properties: initialProps,
        });

        currentNotes.unshift(nova);
        renderBoard();
        document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: nova.id } }));
      };

      colHeader.append(titleWrap, addBtn);
      colEl.appendChild(colHeader);

      // Lista de cards
      const cardsList = document.createElement('div');
      cardsList.className = 'base-column-cards';

      setupDropZone(cardsList, col.id);

      for (const note of colNotes) {
        const cardEl = renderBoardCard(note, cardProps, schema);
        cardsList.appendChild(cardEl);
      }

      colEl.appendChild(cardsList);
      boardWrap.appendChild(colEl);
    }
  }

  function renderBoardCard(note, visibleProps = [], schema = {}) {
    const card = document.createElement('div');
    card.className = 'base-board-card';
    card.draggable = true;
    card.dataset.noteId = note.id;

    // Cabeçalho do card: Ícone + Título
    const titleEl = document.createElement('div');
    titleEl.className = 'base-card-title';

    if (note.icon) {
      const icon = document.createElement('span');
      icon.className = 'qd-icon material-symbols-rounded base-card-icon';
      icon.textContent = note.icon;
      if (note.color) icon.style.color = note.color;
      titleEl.appendChild(icon);
    }

    const titleText = document.createElement('span');
    titleText.className = 'base-card-title-text';
    titleText.textContent = note.title || note.titulo || 'Sem título';
    titleEl.appendChild(titleText);
    card.appendChild(titleEl);

    titleEl.onclick = e => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: note.id } }));
    };

    // Propriedades exibidas no card
    const propsContainer = document.createElement('div');
    propsContainer.className = 'base-card-props';

    for (const propKey of visibleProps) {
      if (propKey === groupByProp) continue; // Não duplica o status
      const propDef = schema[propKey] || { key: propKey, type: 'text' };
      const rawVal = getNotePropertyValue(note, propKey);
      if (rawVal === undefined || rawVal === null || rawVal === '') continue;

      const propRow = document.createElement('div');
      propRow.className = 'base-card-prop-item';

      if (propDef.type === 'list' || propKey === 'tags') {
        const tags = Array.isArray(rawVal) ? rawVal : [rawVal];
        for (const t of tags) {
          const pill = document.createElement('span');
          pill.className = 'note-tag tag';
          pill.textContent = `#${String(t).replace(/^#/, '')}`;
          propRow.appendChild(pill);
        }
      } else {
        const text = formatPropertyValue(rawVal, propDef.type, propDef);
        propRow.textContent = text;
      }

      propsContainer.appendChild(propRow);
    }

    if (propsContainer.hasChildNodes()) {
      card.appendChild(propsContainer);
    }

    // Drag and Drop
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(note.id));
      card.classList.add('is-dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
    });

    return card;
  }

  function setupDropZone(cardsList, targetColId) {
    cardsList.addEventListener('dragover', e => {
      e.preventDefault();
      cardsList.classList.add('drag-over');
    });

    cardsList.addEventListener('dragleave', e => {
      if (!cardsList.contains(e.relatedTarget)) {
        cardsList.classList.remove('drag-over');
      }
    });

    cardsList.addEventListener('drop', async e => {
      e.preventDefault();
      cardsList.classList.remove('drag-over');

      const noteId = Number(e.dataTransfer.getData('text/plain'));
      if (!noteId) return;

      const note = currentNotes.find(n => n.id === noteId);
      if (!note) return;

      const newVal = targetColId === '__empty__' ? null : targetColId;
      if (!note.properties) note.properties = {};
      if (newVal === null) delete note.properties[groupByProp];
      else note.properties[groupByProp] = newVal;

      await updateNoteMetaById(note.id, { properties: { ...note.properties } });

      document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { id: note.id, note } }));
      renderBoard();
    });
  }

  renderBoard();

  const onNoteUpdated = e => {
    const updated = e.detail?.note;
    if (!updated) return;
    const idx = currentNotes.findIndex(n => n.id === updated.id);
    if (idx !== -1) {
      currentNotes[idx] = updated;
      renderBoard();
    }
  };

  document.addEventListener('quickdock:note-updated', onNoteUpdated);
  container._cleanup = () => {
    document.removeEventListener('quickdock:note-updated', onNoteUpdated);
  };

  return container;
}

/**
 * Renderiza a visualização em Quadro Kanban dentro de um contêiner DOM.
 * @param {HTMLElement} container
 * @param {Array<Object>} notes
 * @param {Object} schema
 * @param {Object} viewConfig
 * @param {Object} callbacks
 */
export function renderBaseBoardView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  const boardEl = createBaseBoardView({
    notes,
    baseDef: { properties: schema },
    activeView: viewConfig,
    schema,
    onDefChange: callbacks.onDefChange || (() => {}),
    showOwnToolbar: callbacks.showOwnToolbar,
  });
  container.appendChild(boardEl);
}

