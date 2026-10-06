// ── table-footer.js ─────────────────────────────────────────────────────────
// Rodapé da tabela com cálculo por coluna (menu de agregações por tipo).

import { aggregate, aggregatesForType, formatAggregate, AGG_LABELS } from '../engine/aggregate-engine.js';
import { getNotePropertyValue } from '../bases-engine.js';
import { resolveCalc } from '../config/view-model.js';

/** Resultado do cálculo de uma coluna sobre um conjunto de notas ('' se a coluna não tem cálculo). */
export function calcCell(notes, colKey, agg, schema) {
  const tipo = schema[colKey]?.type || 'text';
  return aggregate(notes.map(n => getNotePropertyValue(n, colKey)), agg, tipo);
}

/**
 * @param {HTMLElement} tfoot
 * @param {{ notes, columns, schema, view, rowNumbers:boolean }} o
 * @param {(patch:Object)=>void} onViewChange
 */
export function renderTableFooter(tfoot, { notes, columns, schema, view, rowNumbers }, onViewChange) {
  tfoot.replaceChildren();
  const tr = document.createElement('tr');
  tr.className = 'base-tfoot-tr';
  const calc = resolveCalc(view);
  if (rowNumbers) tr.appendChild(Object.assign(document.createElement('td'), { className: 'base-tfoot-td base-td-num' }));

  for (const colKey of columns) {
    const td = document.createElement('td');
    td.className = 'base-tfoot-td';
    td.dataset.col = colKey;
    const tipo = schema[colKey]?.type || 'text';
    const atual = calc[colKey] || 'none';

    const sel = document.createElement('select');
    sel.className = 'base-calc-select' + (atual === 'none' ? ' is-none' : '');
    sel.setAttribute('aria-label', `Cálculo de ${schema[colKey]?.label || colKey}`);
    for (const a of aggregatesForType(tipo)) {
      const o = document.createElement('option');
      o.value = a; o.textContent = a === 'none' ? 'Calcular' : AGG_LABELS[a];
      if (a === atual) o.selected = true;
      sel.appendChild(o);
    }
    // grava tudo em `calc` (migra o `summaries` antigo junto)
    sel.addEventListener('change', () => onViewChange({ calc: { ...calc, [colKey]: sel.value === 'none' ? undefined : sel.value }, summaries: undefined }));
    td.appendChild(sel);

    if (atual !== 'none') {
      const r = calcCell(notes, colKey, atual, schema);
      const v = document.createElement('span');
      v.className = 'base-summary-value';
      v.textContent = formatAggregate(r);
      td.appendChild(v);
    }
    tr.appendChild(td);
  }
  tfoot.appendChild(tr);
}
