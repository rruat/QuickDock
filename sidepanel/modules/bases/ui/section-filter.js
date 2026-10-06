// ── section-filter.js ───────────────────────────────────────────────────────
// "Filtro": lista de condições (propriedade · operador · valor) combinadas por E/OU.
// Grava `filters` + `filterMode`. Grupos aninhados ficam para a próxima etapa.

import { section, el, selectControl, segmented } from './controls.js';
import { operatorsForType, valueKindFor, defaultValueFor, newCondition, OPERATOR_LABELS } from './filter-operators.js';

function campoValor(cond, tipo, onChange) {
  const kind = valueKindFor(cond.operator, tipo);
  if (kind === 'none') return null;
  const inp = el('input', 'bset-input');
  const ariaLabel = 'Valor do filtro';
  inp.setAttribute('aria-label', ariaLabel);
  if (kind === 'date2') {
    const par = el('div', 'bset-pair');
    const [a, b] = Array.isArray(cond.value) ? cond.value : ['', ''];
    [a, b].forEach((v, i) => {
      const d = el('input', 'bset-input'); d.type = 'date'; d.value = v || '';
      d.setAttribute('aria-label', i ? 'Data final' : 'Data inicial');
      d.addEventListener('change', () => { const novo = [a, b]; novo[i] = d.value; onChange(novo); });
      par.appendChild(d);
    });
    return par;
  }
  if (kind === 'options') {
    inp.type = 'text'; inp.placeholder = 'valor1, valor2';
    inp.value = Array.isArray(cond.value) ? cond.value.join(', ') : String(cond.value ?? '');
    inp.addEventListener('change', () => onChange(inp.value.split(',').map(x => x.trim()).filter(Boolean)));
    return inp;
  }
  inp.type = kind === 'date' ? 'date' : (kind === 'number' || kind === 'days') ? 'number' : 'text';
  if (kind === 'days') { inp.min = '0'; inp.placeholder = 'dias'; }
  inp.value = cond.value ?? '';
  inp.addEventListener('change', () => onChange(kind === 'number' || kind === 'days'
    ? (inp.value === '' ? '' : Number(inp.value)) : inp.value));
  return inp;
}

export function filterSection({ view, schema, memoria, patch }) {
  const s = section('Filtro', { chave: 'filter', memoria, dica: 'Mostra só as notas que atendem às regras.' });
  const conds = (Array.isArray(view.filters) ? view.filters : []).filter(c => c && typeof c === 'object' && !Array.isArray(c.conds));
  const props = Object.entries(schema).map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }));
  const tipoDe = k => schema[k]?.type || 'text';
  const grava = lista => patch({ filters: lista.length ? lista : undefined, ...(lista.length ? {} : { filterMode: undefined }) });
  const troca = (i, novo) => grava(conds.map((c, j) => (j === i ? novo : c)));

  if (conds.length > 1) {
    const modo = String(view.filterMode ?? view.filterOperator ?? 'and').toLowerCase() === 'or' ? 'or' : 'and';
    s.body.appendChild(segmented({
      ariaLabel: 'Combinar regras', value: modo,
      options: [{ value: 'and', label: 'Todas (E)' }, { value: 'or', label: 'Qualquer (OU)' }],
      onChange: v => patch({ filterMode: v, filterOperator: undefined }),
    }));
  }

  conds.forEach((c, i) => {
    const caixa = el('div', 'bset-filter');
    const topo = el('div', 'bset-rule');
    topo.appendChild(selectControl({
      value: c.property, options: props, ariaLabel: 'Propriedade',
      onChange: v => troca(i, newCondition(v, tipoDe(v))),
    }));
    const ops = operatorsForType(tipoDe(c.property), c.property);
    topo.appendChild(selectControl({
      value: c.operator, ariaLabel: 'Operador',
      options: ops.map(o => ({ value: o, label: OPERATOR_LABELS[o] || o })),
      onChange: v => {
        const novo = { ...c, operator: v };
        const val = defaultValueFor(v, tipoDe(c.property));
        if (valueKindFor(v, tipoDe(c.property)) !== valueKindFor(c.operator, tipoDe(c.property))) {
          if (val === undefined) delete novo.value; else novo.value = val;
        }
        troca(i, novo);
      },
    }));
    const rm = el('button', 'bset-icon-btn', '✕');
    rm.type = 'button'; rm.title = 'Remover'; rm.setAttribute('aria-label', 'Remover filtro');
    rm.addEventListener('click', () => grava(conds.filter((_, j) => j !== i)));
    topo.appendChild(rm);
    caixa.appendChild(topo);
    const valor = campoValor(c, tipoDe(c.property), v => troca(i, { ...c, value: v }));
    if (valor) caixa.appendChild(valor);
    s.body.appendChild(caixa);
  });
  if (!conds.length) s.body.appendChild(el('p', 'bset-hint', 'Nenhum filtro.'));

  const add = el('button', 'bset-btn', '+ Adicionar filtro');
  add.type = 'button';
  add.addEventListener('click', () => {
    const p = props.find(x => x.value !== 'title') ?? props[0];
    if (p) grava([...conds, newCondition(p.value, tipoDe(p.value))]);
  });
  s.body.appendChild(add);
  return s.root;
}
