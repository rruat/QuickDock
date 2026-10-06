// ── quick-filters.js ────────────────────────────────────────────────────────
// Filtros rápidos: chips na barra, valem só para quem está olhando (não gravam na Base;
// ficam em localStorage por view). Sempre combinam com E sobre os filtros da view.

import { el, selectControl } from './controls.js';
import { operatorsForType, valueKindFor, defaultValueFor, newCondition, OPERATOR_LABELS } from './filter-operators.js';
import { campoValor } from './section-filter.js';

const chave = (baseId, viewId) => `qd-bases-qf:${baseId}:${viewId}`;

export function loadQuickFilters(baseId, viewId) {
  try {
    const v = JSON.parse(localStorage.getItem(chave(baseId, viewId)) || '[]');
    return Array.isArray(v) ? v.filter(c => c && c.property) : [];
  } catch { return []; }
}

export function saveQuickFilters(baseId, viewId, lista) {
  try {
    if (lista.length) localStorage.setItem(chave(baseId, viewId), JSON.stringify(lista));
    else localStorage.removeItem(chave(baseId, viewId));
  } catch { /* sem storage: vale só nesta sessão */ }
}

/** Desenha a barra em `host`; `onChange(lista)` recebe a lista nova. */
export function renderQuickFilters(host, { filters, schema, count }, onChange) {
  host.replaceChildren();
  const props = Object.entries(schema).map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }));
  const tipoDe = k => schema[k]?.type || 'text';
  host.hidden = !filters.length && !props.length;

  filters.forEach((c, i) => {
    const chip = el('div', 'bqf-chip');
    const tipo = tipoDe(c.property);
    chip.appendChild(selectControl({ value: c.property, options: props, ariaLabel: 'Propriedade do filtro rápido',
      onChange: v => onChange(filters.map((x, j) => (j === i ? newCondition(v, tipoDe(v)) : x))) }));
    chip.appendChild(selectControl({ value: c.operator, ariaLabel: 'Operador',
      options: operatorsForType(tipo, c.property).map(o => ({ value: o, label: OPERATOR_LABELS[o] || o })),
      onChange: v => {
        const novo = { ...c, operator: v };
        if (valueKindFor(v, tipo) !== valueKindFor(c.operator, tipo)) {
          const val = defaultValueFor(v, tipo);
          if (val === undefined) delete novo.value; else novo.value = val;
        }
        onChange(filters.map((x, j) => (j === i ? novo : x)));
      } }));
    const valor = campoValor(c, tipo, v => onChange(filters.map((x, j) => (j === i ? { ...c, value: v } : x))));
    if (valor) chip.appendChild(valor);
    const rm = el('button', 'bset-icon-btn', '✕');
    rm.type = 'button'; rm.title = 'Remover filtro rápido'; rm.setAttribute('aria-label', 'Remover filtro rápido');
    rm.addEventListener('click', () => onChange(filters.filter((_, j) => j !== i)));
    chip.appendChild(rm);
    host.appendChild(chip);
  });

  const add = el('button', 'bqf-add', '+ Filtro rápido');
  add.type = 'button';
  add.addEventListener('click', () => {
    const p = props.find(x => x.value !== 'title') ?? props[0];
    if (p) onChange([...filters, newCondition(p.value, tipoDe(p.value))]);
  });
  host.appendChild(add);
  if (filters.length) {
    const limpar = el('button', 'bqf-add', 'Limpar');
    limpar.type = 'button';
    limpar.addEventListener('click', () => onChange([]));
    host.appendChild(limpar);
  }
  const cont = el('span', 'bqf-count', `${count} ${count === 1 ? 'nota' : 'notas'}`);
  cont.setAttribute('aria-live', 'polite');
  host.appendChild(cont);
}
