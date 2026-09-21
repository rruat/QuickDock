// ── bases-table-view.js ───────────────────────────────────────────────────
// Visualização em Tabela interativa para o QuickDock Bases.
// Suporta colunas redimensionáveis, ordenação por clique no cabeçalho,
// edição inline direta de células e linha de rodapé com somatórios/médias.

import { formatPropertyValue } from './bases-schema.js';
import { getNotePropertyValue, queryBaseNotes, sortBaseNotes, calculateBaseSummaries } from './bases-engine.js';
import { activateCellEditor } from './bases-cell-editors.js';
import { createNoteRecord } from '../storage.js';

/**
 * Cria o elemento DOM completo da visualização em Tabela de uma Base.
 *
 * @param {Object} params
 * @param {Array<Object>} params.notes Coleção completa de notas do vault
 * @param {Object} params.baseDef Definição da Base (source, properties, views)
 * @param {Object} params.activeView Visualização ativa (tipo table)
 * @param {Object} params.schema Schema resolvido das propriedades
 * @param {Function} params.onDefChange Callback chamado ao alterar a configuração da Base
 * @returns {HTMLElement} Elemento container da Tabela
 */
export function createBaseTableView({ notes = [], baseDef = {}, activeView = {}, schema = {}, onDefChange = () => {}, showOwnToolbar = true }) {
  const container = document.createElement('div');
  container.className = 'base-view-container base-table-view';

  let currentNotes = [...notes];
  let quickSearchQuery = '';
  let activeSorts = Array.isArray(activeView.sort) ? [...activeView.sort] : [{ property: 'title', direction: 'asc' }];
  const columns = Array.isArray(activeView.columns) && activeView.columns.length > 0
    ? [...activeView.columns]
    : Object.keys(schema).slice(0, 6);

  if (!activeView.columnWidths) activeView.columnWidths = {};
  if (!activeView.summaries) activeView.summaries = { title: 'count' };

  // ── 1. Barra de ferramentas da Base ─────────────────────────────────────────
  // showOwnToolbar=false quando montada dentro de bases-view-container.js: a
  // barra de cima (base-header-bar) já dá busca + "Nova Nota" — sem isto,
  // apareciam duas de cada, uma embaixo da outra.
  let countBadge = null;
  if (showOwnToolbar) {
    const toolbar = document.createElement('div');
    toolbar.className = 'base-toolbar';

    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'base-toolbar-left';

    // Campo de busca rápida
    const searchInput = document.createElement('input');
    searchInput.className = 'base-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Buscar na base...';
    searchInput.addEventListener('input', () => {
      quickSearchQuery = searchInput.value;
      renderTableBody();
    });
    toolbarLeft.appendChild(searchInput);

    // Contador de notas
    countBadge = document.createElement('span');
    countBadge.className = 'base-count-badge';
    toolbarLeft.appendChild(countBadge);

    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'base-toolbar-right';

    // Botão Nova Nota
    const newNoteBtn = document.createElement('button');
    newNoteBtn.className = 'base-btn base-btn-primary';
    newNoteBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">add</span><span>Nova Nota</span>';
    newNoteBtn.onclick = async () => {
      const initialFolder = baseDef.source?.folder || '';
      const initialProps = {};
      if (baseDef.source?.tag) initialProps.tags = [baseDef.source.tag.replace(/^#/, '')];

      const nova = await createNoteRecord({
        title: 'Sem título',
        pasta: initialFolder,
        properties: initialProps,
      });

      currentNotes.unshift(nova);
      renderTableBody();

      // Notifica o app e abre a nova nota no editor se desejado
      document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: nova.id } }));
    };
    toolbarRight.appendChild(newNoteBtn);

    toolbar.append(toolbarLeft, toolbarRight);
    container.appendChild(toolbar);
  }

  // ── 2. Tabela de dados ──────────────────────────────────────────────────────
  const tableWrap = document.createElement('div');
  tableWrap.className = 'base-table-wrap';

  const table = document.createElement('table');
  table.className = 'base-table';

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const tfoot = document.createElement('tfoot');
  table.append(thead, tbody, tfoot);
  tableWrap.appendChild(table);
  container.appendChild(tableWrap);

  // ── 3. Renderização do Cabeçalho (com ordenação e redimensionamento) ─────────
  function renderTableHeader() {
    thead.innerHTML = '';
    const tr = document.createElement('tr');

    for (const colKey of columns) {
      const propDef = schema[colKey] || { key: colKey, label: colKey, type: 'text' };
      const th = document.createElement('th');
      th.className = 'base-th';
      th.dataset.col = colKey;

      const w = activeView.columnWidths[colKey] || propDef.width || 160;
      th.style.width = `${w}px`;
      th.style.minWidth = '80px';

      const content = document.createElement('div');
      content.className = 'base-th-content';

      const iconName = propDef.icon || getPropertyTypeIcon(propDef.type);
      const icon = document.createElement('span');
      icon.className = 'qd-icon material-symbols-rounded base-th-icon';
      icon.textContent = iconName;

      const label = document.createElement('span');
      label.className = 'base-th-label';
      label.textContent = propDef.label || colKey;

      content.append(icon, label);

      // Indicador de ordenação ativa
      const curSort = activeSorts.find(s => s.property === colKey);
      if (curSort) {
        const sortIcon = document.createElement('span');
        sortIcon.className = 'qd-icon material-symbols-rounded base-th-sort';
        sortIcon.textContent = curSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
        content.appendChild(sortIcon);
      }

      // Clique no cabeçalho alterna ordenação
      content.addEventListener('click', () => {
        if (!curSort) {
          activeSorts = [{ property: colKey, direction: 'asc' }];
        } else if (curSort.direction === 'asc') {
          curSort.direction = 'desc';
        } else {
          activeSorts = activeSorts.filter(s => s.property !== colKey);
        }
        activeView.sort = activeSorts;
        renderTableHeader();
        renderTableBody();
        onDefChange(baseDef);
      });

      th.appendChild(content);

      // Alça de redimensionamento da coluna
      const resizer = document.createElement('div');
      resizer.className = 'base-th-resizer';
      setupColumnResizer(resizer, th, colKey);
      th.appendChild(resizer);

      tr.appendChild(th);
    }

    thead.appendChild(tr);
  }

  // ── 4. Redimensionamento manual de colunas ───────────────────────────────────
  function setupColumnResizer(resizer, th, colKey) {
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = e => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(80, startWidth + delta);
      th.style.width = `${newWidth}px`;
      activeView.columnWidths[colKey] = newWidth;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('base-col-resizing');
      onDefChange(baseDef);
    };

    resizer.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      startX = e.clientX;
      startWidth = th.offsetWidth;
      document.body.classList.add('base-col-resizing');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ── 5. Renderização do Corpo da Tabela ───────────────────────────────────────
  function renderTableBody() {
    tbody.innerHTML = '';

    // Aplica consulta (source + filtros + busca rápida)
    const filtered = queryBaseNotes(currentNotes, {
      source: baseDef.source || {},
      filters: activeView.filters || [],
      filterMode: activeView.filterMode || 'and',
      quickSearch: quickSearchQuery,
    });

    // Aplica ordenação
    const sorted = sortBaseNotes(filtered, activeSorts, schema);

    if (countBadge) countBadge.textContent = `${sorted.length} ${sorted.length === 1 ? 'nota' : 'notas'}`;

    if (sorted.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyTd = document.createElement('td');
      emptyTd.className = 'base-td-empty';
      emptyTd.colSpan = columns.length;
      emptyTd.innerHTML = '<span class="qd-icon material-symbols-rounded">inbox</span><span>Nenhuma nota encontrada</span>';
      emptyRow.appendChild(emptyTd);
      tbody.appendChild(emptyRow);
      renderTableFooter(sorted);
      return;
    }

    for (const note of sorted) {
      const tr = document.createElement('tr');
      tr.className = 'base-tr';
      tr.dataset.noteId = note.id;

      for (const colKey of columns) {
        const propDef = schema[colKey] || { key: colKey, type: 'text' };
        const rawVal = getNotePropertyValue(note, colKey);

        const td = document.createElement('td');
        td.className = `base-td base-td-${propDef.type}`;
        td.dataset.col = colKey;

        renderCellContent(td, note, colKey, propDef, rawVal);

        // Clique simples ativa edição para checkbox; duplo clique ou clique para outros campos
        td.addEventListener('click', e => {
          if (propDef.type === 'checkbox' || propDef.type === 'select' || propDef.type === 'folder') {
            activateCellEditor(td, note, colKey, propDef, () => {
              renderTableBody();
            });
          }
        });

        td.addEventListener('dblclick', () => {
          if (propDef.type !== 'checkbox' && propDef.type !== 'select' && propDef.type !== 'folder') {
            activateCellEditor(td, note, colKey, propDef, () => {
              renderTableBody();
            });
          }
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    renderTableFooter(sorted);
  }

  // ── 6. Renderização de Célula Individual ────────────────────────────────────
  function renderCellContent(td, note, colKey, propDef, rawVal) {
    td.innerHTML = '';

    if (colKey === 'title') {
      const titleLink = document.createElement('a');
      titleLink.className = 'base-title-link';
      titleLink.href = '#';

      if (note.icon) {
        const icon = document.createElement('span');
        icon.className = 'qd-icon material-symbols-rounded base-title-icon';
        icon.textContent = note.icon;
        if (note.color) icon.style.color = note.color;
        titleLink.appendChild(icon);
      }

      const text = document.createElement('span');
      text.className = 'base-title-text';
      text.textContent = note.title || note.titulo || 'Sem título';
      titleLink.appendChild(text);

      titleLink.addEventListener('click', e => {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: note.id } }));
      });

      td.appendChild(titleLink);
      return;
    }

    if (propDef.type === 'checkbox') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'base-checkbox';
      cb.checked = rawVal === true || rawVal === 'true';
      cb.addEventListener('click', e => e.stopPropagation()); // Deixa o listener do TD tratar
      td.appendChild(cb);
      return;
    }

    if (propDef.type === 'select') {
      if (rawVal) {
        const opt = propDef.options?.find(o => (typeof o === 'string' ? o : o.label) === rawVal);
        const color = typeof opt === 'object' && opt?.color ? opt.color : 'var(--accent)';
        const badge = document.createElement('span');
        badge.className = 'base-select-badge';
        badge.style.background = `color-mix(in srgb, ${color} 18%, transparent)`;
        badge.style.color = color;
        badge.style.border = `1px solid color-mix(in srgb, ${color} 35%, transparent)`;
        badge.textContent = String(rawVal);
        td.appendChild(badge);
      } else {
        td.innerHTML = '<span class="base-empty-cell">—</span>';
      }
      return;
    }

    if (propDef.type === 'list' || colKey === 'tags') {
      const list = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
      if (list.length > 0) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'base-tags-wrap';
        for (const t of list) {
          const pill = document.createElement('span');
          pill.className = 'note-tag tag';
          pill.textContent = `#${String(t).replace(/^#/, '')}`;
          tagsWrap.appendChild(pill);
        }
        td.appendChild(tagsWrap);
      } else {
        td.innerHTML = '<span class="base-empty-cell">—</span>';
      }
      return;
    }

    if (propDef.type === 'tasks') {
      const tasks = rawVal || { total: 0, checked: 0 };
      if (tasks.total > 0) {
        const pct = Math.round((tasks.checked / tasks.total) * 100);
        td.innerHTML = `
          <div class="base-tasks-progress" title="${tasks.checked} de ${tasks.total} tarefas concluídas">
            <div class="base-tasks-bar"><div class="base-tasks-fill" style="width: ${pct}%"></div></div>
            <span class="base-tasks-text">${tasks.checked}/${tasks.total}</span>
          </div>
        `;
      } else {
        td.innerHTML = '<span class="base-empty-cell">—</span>';
      }
      return;
    }

    // Texto, número, data e outros tipos padrão
    const formatted = formatPropertyValue(rawVal, propDef.type, propDef);
    td.textContent = formatted || '—';
    if (!formatted) td.classList.add('base-cell-empty');
  }

  // ── 7. Renderização do Rodapé com Cálculos e Resumos ─────────────────────────
  function renderTableFooter(currentFilteredNotes) {
    tfoot.innerHTML = '';
    const tr = document.createElement('tr');
    tr.className = 'base-tfoot-tr';

    const summaries = calculateBaseSummaries(currentFilteredNotes, activeView.summaries, schema);

    for (const colKey of columns) {
      const propDef = schema[colKey] || { key: colKey, type: 'text' };
      const td = document.createElement('td');
      td.className = 'base-tfoot-td';
      td.dataset.col = colKey;

      const summary = summaries[colKey];
      if (summary) {
        td.innerHTML = `
          <div class="base-summary-content" title="${summary.metric}">
            <span class="base-summary-label">${summary.metric}:</span>
            <span class="base-summary-value">${typeof summary.value === 'number' ? summary.value.toLocaleString('pt-BR') : summary.value}</span>
          </div>
        `;
      } else {
        // Botão sutil para adicionar resumo se coluna numérica
        const addSummaryBtn = document.createElement('button');
        addSummaryBtn.className = 'base-add-summary-btn';
        addSummaryBtn.textContent = '+ Calcular';
        addSummaryBtn.onclick = () => {
          activeView.summaries[colKey] = propDef.type === 'number' ? 'sum' : 'count';
          onDefChange(baseDef);
          renderTableFooter(currentFilteredNotes);
        };
        td.appendChild(addSummaryBtn);
      }

      tr.appendChild(td);
    }

    tfoot.appendChild(tr);
  }

  // Inicializa componentes
  renderTableHeader();
  renderTableBody();

  // Reage a atualizações de notas disparadas de outros pontos do QuickDock
  const onNoteUpdated = e => {
    const updated = e.detail?.note;
    if (!updated) return;
    const idx = currentNotes.findIndex(n => n.id === updated.id);
    if (idx !== -1) {
      currentNotes[idx] = updated;
      renderTableBody();
    }
  };

  document.addEventListener('quickdock:note-updated', onNoteUpdated);
  container._cleanup = () => {
    document.removeEventListener('quickdock:note-updated', onNoteUpdated);
  };

  return container;
}

function getPropertyTypeIcon(type) {
  const map = {
    title: 'notes',
    text: 'notes',
    number: 'tag',
    checkbox: 'check_box',
    date: 'calendar_month',
    datetime: 'schedule',
    select: 'arrow_drop_down_circle',
    list: 'label',
    link: 'link',
    url: 'open_in_new',
    folder: 'folder',
    tasks: 'checklist_rtl',
  };
  return map[type] || 'notes';
}

/**
 * Renderiza a visualização em Tabela dentro de um contêiner DOM.
 * @param {HTMLElement} container
 * @param {Array<Object>} notes
 * @param {Object} schema
 * @param {Object} viewConfig
 * @param {Object} callbacks
 */
export function renderBaseTableView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  const tableEl = createBaseTableView({
    notes,
    baseDef: { properties: schema },
    activeView: viewConfig,
    schema,
    onDefChange: callbacks.onDefChange || (() => {}),
    showOwnToolbar: callbacks.showOwnToolbar,
  });
  container.appendChild(tableEl);
}

