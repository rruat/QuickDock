// ── bases-table-view.js ───────────────────────────────────────────────────
// Visualização em Tabela interativa para o QuickDock Bases.
// Suporta colunas redimensionáveis, ordenação por clique no cabeçalho,
// edição inline direta de células e linha de rodapé com somatórios/médias.

import { formatPropertyValue } from './bases-schema.js';
import { getViewProps, resolveGroupConfig, resolveTableLayout, resolveCalc } from './config/view-model.js';
import { groupNotes } from './engine/group-engine.js';
import { renderTableFooter as desenhaRodape, calcCell } from './table/table-footer.js';
import { formatAggregate } from './engine/aggregate-engine.js';
import { flattenSubitems } from './engine/subitems.js';
import { parseClipboardGrid, planPaste, writesToPatches } from './engine/paste-grid.js';
import { progressPercent } from './engine/format.js';
import { getNotePropertyValue, queryBaseNotes, sortBaseNotes } from './bases-engine.js';
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
export function createBaseTableView({ notes = [], baseDef = {}, activeView = {}, schema = {}, onDefChange = () => {}, onViewChange = null, showOwnToolbar = true, rowTone = null, cellTone = null, selection = null, onSelectionChange = () => {}, onPasteWrites = null }) {
  const container = document.createElement('div');
  container.className = 'base-view-container base-table-view';

  let currentNotes = [...notes];
  let quickSearchQuery = '';
  let activeSorts = Array.isArray(activeView.sort) ? [...activeView.sort] : [{ property: 'title', direction: 'asc' }];
  const propsView = getViewProps(activeView);
  const columns = propsView.length > 0 ? propsView : Object.keys(schema).slice(0, 6);

  if (!activeView.columnWidths) activeView.columnWidths = {};
  // grava na Base quando há um callback (container); senão só muta o objeto (uso isolado/testes)
  const gravaView = patch => { if (onViewChange) onViewChange(patch); else onDefChange(baseDef); };
  const layout = resolveTableLayout(activeView);
  container.classList.add(`base-rows-${layout.rowHeight}`, `base-borders-${layout.borders}`);
  container.classList.toggle('base-wrap-cells', layout.wrapCells);
  // Colunas congeladas: deslocamento (px) de cada uma = soma das larguras das anteriores (+ coluna do nº da linha)
  const larguraDe = k => activeView.columnWidths?.[k] || schema[k]?.width || 160;
  const congeladas = columns.slice(0, layout.frozenColumns).reduce((acc, k, i) => {
    acc.push({ k, left: i === 0 ? (layout.selectable ? 32 : 0) + (layout.rowNumbers ? 36 : 0) : acc[i - 1].left + larguraDe(acc[i - 1].k) });
    return acc;
  }, []);
  const congelaCelula = (el, colKey) => {
    const i = congeladas.findIndex(c => c.k === colKey);
    if (i < 0) return;
    el.classList.add('base-frozen');
    if (i === congeladas.length - 1) el.classList.add('is-frozen-edge');
    el.style.left = `${congeladas[i].left}px`;
  };
  const congelaNumero = el => { if (congeladas.length && layout.rowNumbers) { el.classList.add('base-frozen'); el.style.left = `${layout.selectable ? 32 : 0}px`; } };
  const congelaSel = el => { if (congeladas.length && layout.selectable) { el.classList.add('base-frozen'); el.style.left = '0px'; } };

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
    if (layout.selectable && selection) {
      const ths = document.createElement('th'); ths.className = 'base-th base-th-sel';
      const todas = document.createElement('input'); todas.type = 'checkbox'; todas.setAttribute('aria-label', 'Selecionar todas as linhas visíveis');
      todas.addEventListener('change', () => {
        for (const id of visiveisIds) { if (todas.checked) selection.add(id); else selection.delete(id); }
        onSelectionChange(); renderTableBody();
      });
      congelaSel(ths);
      ths.appendChild(todas); tr.appendChild(ths);
      container._selectAll = todas;
    }
    if (layout.rowNumbers) { const thn = Object.assign(document.createElement('th'), { className: 'base-th base-th-num', textContent: '#' }); congelaNumero(thn); tr.appendChild(thn); }

    for (const colKey of columns) {
      const propDef = schema[colKey] || { key: colKey, label: colKey, type: 'text' };
      const th = document.createElement('th');
      th.className = 'base-th';
      th.dataset.col = colKey;
      congelaCelula(th, colKey);

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
        gravaView({ sort: activeSorts.length ? activeSorts : undefined });
        if (!onViewChange) { renderTableHeader(); renderTableBody(); }
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
      gravaView({ columnWidths: { ...activeView.columnWidths } });
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

  let visiveisIds = [];
  let celulaAtiva = null;        // { noteId, key } — onde o colar de planilha começa
  let linhasVisiveis = [];       // notas na ordem em que aparecem (colar mapeia linhas sobre elas)

  const TAMANHO_LOTE = 150;
  let observadorLotes = null;
  function desenhaEmLotes(entradas) {
    observadorLotes?.disconnect();
    observadorLotes = null;
    let i = 0;
    const colunasTotal = columns.length + (layout.rowNumbers ? 1 : 0) + (layout.selectable ? 1 : 0);
    const proximo = () => {
      const fim = Math.min(entradas.length, i + TAMANHO_LOTE);
      for (; i < fim; i++) tbody.appendChild(entradas[i]());
      if (i >= entradas.length) return;
      const sentinela = document.createElement('tr');
      sentinela.className = 'base-more-row';
      const td = document.createElement('td');
      td.colSpan = colunasTotal;
      td.textContent = `Mostrando ${i} de ${entradas.length} — role para ver mais`;
      sentinela.appendChild(td);
      tbody.appendChild(sentinela);
      if (typeof IntersectionObserver !== 'function') { sentinela.remove(); proximo(); return; }
      observadorLotes = new IntersectionObserver(es => {
        if (!es.some(e => e.isIntersecting)) return;
        observadorLotes.disconnect();
        sentinela.remove();
        proximo();
      }, { root: tableWrap, rootMargin: '600px 0px' });
      observadorLotes.observe(sentinela);
    };
    proximo();
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
    visiveisIds = sorted.map(n => n.id);
    linhasVisiveis = sorted;

    if (countBadge) countBadge.textContent = `${sorted.length} ${sorted.length === 1 ? 'nota' : 'notas'}`;

    if (sorted.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyTd = document.createElement('td');
      emptyTd.className = 'base-td-empty';
      emptyTd.colSpan = columns.length + (layout.rowNumbers ? 1 : 0) + (layout.selectable ? 1 : 0);
      emptyTd.innerHTML = '<span class="qd-icon material-symbols-rounded">inbox</span><span>Nenhuma nota encontrada</span>';
      emptyRow.appendChild(emptyTd);
      tbody.appendChild(emptyRow);
      renderTableFooter(sorted);
      return;
    }

    let contador = 0;
    const buildRow = (note, sub = null) => {
      const numero = ++contador;
      const tr = document.createElement('tr');
      tr.className = 'base-tr';
      tr.dataset.noteId = note.id;
      const tomLinha = rowTone?.(note);
      if (tomLinha) tr.classList.add(`tone-${tomLinha}`);
      if (layout.selectable && selection) {
        const tds = document.createElement('td'); tds.className = 'base-td base-td-sel';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selection.has(note.id);
        cb.setAttribute('aria-label', `Selecionar ${note.title || 'nota'}`);
        tr.classList.toggle('is-selected', cb.checked);
        cb.addEventListener('click', e => e.stopPropagation());
        cb.addEventListener('change', e => {
          // Shift+clique seleciona o intervalo desde a última marcada
          if (e.shiftKey && container._lastSel != null) {
            const a = visiveisIds.indexOf(container._lastSel), b2 = visiveisIds.indexOf(note.id);
            if (a >= 0 && b2 >= 0) for (const id of visiveisIds.slice(Math.min(a, b2), Math.max(a, b2) + 1)) selection.add(id);
          } else if (cb.checked) selection.add(note.id); else selection.delete(note.id);
          container._lastSel = note.id;
          tr.classList.toggle('is-selected', selection.has(note.id));
          onSelectionChange();
          if (e.shiftKey) renderTableBody();
        });
        congelaSel(tds);
        tds.appendChild(cb); tr.appendChild(tds);
      }
      if (layout.rowNumbers) { const tdn = Object.assign(document.createElement('td'), { className: 'base-td base-td-num', textContent: String(numero) }); congelaNumero(tdn); tr.appendChild(tdn); }

      for (const colKey of columns) {
        const propDef = schema[colKey] || { key: colKey, type: 'text' };
        const rawVal = getNotePropertyValue(note, colKey);

        const td = document.createElement('td');
        td.className = `base-td base-td-${propDef.type}`;
        td.dataset.col = colKey;
        congelaCelula(td, colKey);
        const tomCelula = cellTone?.(note, colKey);
        if (tomCelula) td.classList.add(`tone-${tomCelula}`);

        renderCellContent(td, note, colKey, propDef, rawVal);
        if (sub && colKey === columns[0]) decoraSubitem(td, note, sub);

        // Clique simples ativa edição para checkbox; duplo clique ou clique para outros campos
        td.tabIndex = -1;
        td.addEventListener('pointerdown', () => { celulaAtiva = { noteId: note.id, key: colKey }; container.querySelectorAll('.is-active-cell').forEach(x => x.classList.remove('is-active-cell')); td.classList.add('is-active-cell'); td.focus({ preventScroll: true }); });
        td.addEventListener('click', e => {
          if (propDef.isDerived) return;
          if (propDef.type === 'checkbox' || propDef.type === 'select' || propDef.type === 'folder') {
            activateCellEditor(td, note, colKey, propDef, () => {
              renderTableBody();
            });
          }
        });

        td.addEventListener('dblclick', () => {
          if (propDef.isDerived) return;
          if (propDef.type !== 'checkbox' && propDef.type !== 'select' && propDef.type !== 'folder') {
            activateCellEditor(td, note, colKey, propDef, () => {
              renderTableBody();
            });
          }
        });

        tr.appendChild(td);
      }

      return tr;
    };

    const grupoCfg = resolveGroupConfig(activeView);
    const calcCfg = resolveCalc(activeView);
    const getV = (n, p) => getNotePropertyValue(n, p);
    // Linhas entram em lotes (cada entrada é uma função que cria a <tr>): o primeiro desenho de
    // uma Base grande é rápido e o resto entra quando a pessoa chega perto do fim da tabela.
    const entradas = [];
    const paiProp = activeView.subItems?.parentProp;
    if (!grupoCfg.prop && paiProp) {
      // subitens: filhos indentados sob o pai, com recolher/expandir (guardado na view)
      const fechadosSub = new Set((activeView.subItems?.collapsed || []).map(String));
      for (const it of flattenSubitems(sorted, paiProp, getV, fechadosSub)) entradas.push(() => buildRow(it.note, it));
    } else if (!grupoCfg.prop) {
      for (const note of sorted) entradas.push(() => buildRow(note));
    } else {
      for (const g of groupNotes(sorted, grupoCfg, schema, getV)) {
        const fechado = grupoCfg.collapsed.includes(g.key);
        const gr = document.createElement('tr');
        gr.className = 'base-group-row' + (fechado ? ' is-collapsed' : '');
        gr.dataset.groupKey = g.key;
        const tdTitulo = document.createElement('td');
        tdTitulo.colSpan = 1 + (layout.rowNumbers ? 1 : 0) + (layout.selectable ? 1 : 0);
        const toggle = document.createElement('button');
        toggle.type = 'button'; toggle.className = 'base-group-toggle';
        toggle.setAttribute('aria-expanded', String(!fechado));
        toggle.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${fechado ? 'chevron_right' : 'expand_more'}</span>`;
        const nome = document.createElement('span'); nome.className = 'base-group-label'; nome.textContent = g.label;
        toggle.appendChild(nome);
        if (grupoCfg.showCounts) { const c = document.createElement('span'); c.className = 'base-group-count'; c.textContent = String(g.count); toggle.appendChild(c); }
        toggle.addEventListener('click', () => {
          const novo = fechado ? grupoCfg.collapsed.filter(k => k !== g.key) : [...grupoCfg.collapsed, g.key];
          activeView.group = { ...(activeView.group || {}), prop: grupoCfg.prop, collapsed: novo };
          gravaView({ group: { collapsed: novo } });
          if (!onViewChange) renderTableBody();
        });
        tdTitulo.appendChild(toggle);
        gr.appendChild(tdTitulo);
        // demais colunas: cálculo do grupo
        columns.slice(1).forEach(colKey => {
          const td = document.createElement('td');
          td.className = 'base-group-calc';
          if (calcCfg[colKey]) td.textContent = formatAggregate(calcCell(g.notes, colKey, calcCfg[colKey], schema));
          gr.appendChild(td);
        });
        entradas.push(() => gr);
        if (!fechado) for (const note of g.notes) entradas.push(() => buildRow(note));
      }
    }

    desenhaEmLotes(entradas);
    renderTableFooter(sorted);
  }

  // Subitens: recuo por nível + botão de recolher/expandir ao lado do título
  function decoraSubitem(td, note, sub) {
    td.style.paddingLeft = `${10 + sub.depth * 18}px`;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'base-sub-toggle' + (sub.hasChildren ? '' : ' is-leaf');
    if (sub.hasChildren) {
      botao.setAttribute('aria-expanded', String(!sub.collapsed));
      botao.setAttribute('aria-label', sub.collapsed ? 'Expandir subitens' : 'Recolher subitens');
      botao.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${sub.collapsed ? 'chevron_right' : 'expand_more'}</span>`;
      botao.addEventListener('click', e => {
        e.stopPropagation();
        const atual = new Set((activeView.subItems?.collapsed || []).map(String));
        if (atual.has(String(note.id))) atual.delete(String(note.id)); else atual.add(String(note.id));
        activeView.subItems = { ...(activeView.subItems || {}), collapsed: [...atual] };
        gravaView({ subItems: { collapsed: [...atual] } });
        if (!onViewChange) renderTableBody();
      });
    } else botao.disabled = true;
    td.insertBefore(botao, td.firstChild);
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
        badge.style.background = `color-mix(in oklch, ${color} 18%, transparent)`;
        badge.style.color = `color-mix(in oklch, ${color} 45%, var(--text))`;
        badge.style.border = `1px solid color-mix(in oklch, ${color} 35%, transparent)`;
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

    // Número com barra/anel de progresso (formato da propriedade)
    if (propDef.type === 'number' && rawVal !== undefined && rawVal !== null && rawVal !== ''
        && (propDef.format?.kind === 'progress-bar' || propDef.format?.kind === 'progress-ring')) {
      const pct = Math.round(progressPercent(rawVal, propDef.format));
      const caixa = document.createElement('div');
      caixa.className = 'base-tasks-progress';
      caixa.title = `${pct}%`;
      const barra = document.createElement('div'); barra.className = 'base-tasks-bar';
      const fill = document.createElement('div'); fill.className = 'base-tasks-fill'; fill.style.width = `${pct}%`;
      barra.appendChild(fill);
      const t = document.createElement('span'); t.className = 'base-tasks-text'; t.textContent = `${pct}%`;
      caixa.append(barra, t);
      td.appendChild(caixa);
      return;
    }

    // Texto, número, data e outros tipos padrão
    const formatted = formatPropertyValue(rawVal, propDef.type, propDef);
    td.textContent = formatted || '—';
    if (!formatted) td.classList.add('base-cell-empty');
  }

  // ── 7. Rodapé com cálculos por coluna (ver table/table-footer.js) ───────────
  function renderTableFooter(currentFilteredNotes) {
    desenhaRodape(tfoot, { notes: currentFilteredNotes, columns, schema, view: activeView, rowNumbers: layout.rowNumbers },
      patch => { gravaView(patch); if (!onViewChange) { activeView.calc = { ...resolveCalc(activeView), ...patch.calc }; renderTableFooter(currentFilteredNotes); } });
  }

  // Colar de planilha: a célula clicada é o canto superior esquerdo. Tudo ou nada.
  container.addEventListener('paste', async e => {
    if (!onPasteWrites || !celulaAtiva || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const texto = e.clipboardData?.getData('text/plain') ?? '';
    if (!texto.includes('\t') && !texto.includes('\n')) return;       // um valor só: deixa o fluxo normal
    const inicio = { row: linhasVisiveis.findIndex(n => n.id === celulaAtiva.noteId), col: columns.indexOf(celulaAtiva.key) };
    if (inicio.row < 0 || inicio.col < 0) return;
    e.preventDefault();
    const plano = planPaste(parseClipboardGrid(texto), inicio, linhasVisiveis, columns, schema);
    if (plano.errors.length) {
      // destaca as células com problema e NÃO grava nada
      for (const er of plano.errors) {
        const tr = tbody.querySelector(`tr[data-note-id="${linhasVisiveis[er.row]?.id}"]`);
        tr?.querySelector(`td[data-col="${er.key}"]`)?.classList.add('is-paste-error');
      }
      window.alert(`Nada foi colado: ${plano.errors.length} célula(s) com problema.\n\n${plano.errors.slice(0, 6).map(er => `• linha ${er.row + 1}, ${schema[er.key]?.label || er.key}: ${er.motivo}`).join('\n')}${plano.errors.length > 6 ? '\n…' : ''}`);
      return;
    }
    if (!plano.writes.length) return;
    await onPasteWrites(writesToPatches(plano.writes, linhasVisiveis));
  });

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
    observadorLotes?.disconnect();
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
    onViewChange: callbacks.onUpdateView || null,
    rowTone: callbacks.rowTone,
    cellTone: callbacks.cellTone,
    onPasteWrites: callbacks.onPasteWrites || null,
    selection: callbacks.selection || null,
    onSelectionChange: callbacks.onSelectionChange || (() => {}),
    showOwnToolbar: callbacks.showOwnToolbar,
  });
  container.appendChild(tableEl);
}

