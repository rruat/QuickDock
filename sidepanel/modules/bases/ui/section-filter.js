// ── section-filter.js ───────────────────────────────────────────────────────
// "Filtro": lista de condições (propriedade · operador · valor) combinadas por E/OU.
// Grupos E/OU aninhados (até 3 níveis). Grava `filters` (raiz) + `filterMode`; cada grupo é
// { op, conds }.

import { section, el, selectControl, segmented } from './controls.js';
import { isGroup, mapListAt, setGroupOpAt, treeDepth, MAX_DEPTH } from '../engine/filter-tree.js';
import { operatorsForType, valueKindFor, defaultValueFor, newCondition, OPERATOR_LABELS } from './filter-operators.js';

export function campoValor(cond, tipo, onChange) {
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
  const s = section('Filtro', { chave: 'filter', memoria, dica: 'Mostra só as notas que atendem às regras. Use grupos para combinar E/OU.' });
  const raiz = (Array.isArray(view.filters) ? view.filters : []).filter(n => n && typeof n === 'object');
  const modoRaiz = String(view.filterMode ?? view.filterOperator ?? 'and').toLowerCase() === 'or' ? 'or' : 'and';
  const props = Object.entries(schema).map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }));
  const tipoDe = k => schema[k]?.type || 'text';
  const grava = lista => patch({ filters: lista.length ? lista : undefined, ...(lista.length ? {} : { filterMode: undefined }) });
  const edita = (path, fn) => grava(mapListAt(raiz, path, fn));
  const condPadrao = () => { const p = props.find(x => x.value !== 'title') ?? props[0]; return p ? newCondition(p.value, tipoDe(p.value)) : null; };

  function seletorModo(valor, onChange) {
    return segmented({ ariaLabel: 'Combinar regras', value: valor,
      options: [{ value: 'and', label: 'Todas (E)' }, { value: 'or', label: 'Qualquer (OU)' }], onChange });
  }

  function desenhaLista(conds, path, destino) {
    conds.forEach((n, i) => {
      if (isGroup(n)) {
        const caixa = el('div', 'bset-group');
        const topo = el('div', 'bset-rule');
        topo.appendChild(el('span', 'bset-group-title', 'Grupo'));
        topo.appendChild(seletorModo(String(n.op).toLowerCase() === 'or' ? 'or' : 'and', v => grava(setGroupOpAt(raiz, [...path, i], v))));
        const rm = el('button', 'bset-icon-btn', '✕');
        rm.type = 'button'; rm.title = 'Remover grupo'; rm.setAttribute('aria-label', 'Remover grupo');
        rm.addEventListener('click', () => edita(path, l => l.filter((_, j) => j !== i)));
        topo.appendChild(rm);
        caixa.appendChild(topo);
        desenhaLista(n.conds, [...path, i], caixa);
        destino.appendChild(caixa);
        return;
      }
      const caixa = el('div', 'bset-filter');
      const topo = el('div', 'bset-rule');
      topo.appendChild(selectControl({ value: n.property, options: props, ariaLabel: 'Propriedade',
        onChange: v => edita(path, l => l.map((x, j) => (j === i ? newCondition(v, tipoDe(v)) : x))) }));
      const tipo = tipoDe(n.property);
      topo.appendChild(selectControl({
        value: n.operator, ariaLabel: 'Operador',
        options: operatorsForType(tipo, n.property).map(o => ({ value: o, label: OPERATOR_LABELS[o] || o })),
        onChange: v => {
          const novo = { ...n, operator: v };
          if (valueKindFor(v, tipo) !== valueKindFor(n.operator, tipo)) {
            const val = defaultValueFor(v, tipo);
            if (val === undefined) delete novo.value; else novo.value = val;
          }
          edita(path, l => l.map((x, j) => (j === i ? novo : x)));
        },
      }));
      const rm = el('button', 'bset-icon-btn', '✕');
      rm.type = 'button'; rm.title = 'Remover'; rm.setAttribute('aria-label', 'Remover filtro');
      rm.addEventListener('click', () => edita(path, l => l.filter((_, j) => j !== i)));
      topo.appendChild(rm);
      caixa.appendChild(topo);
      const valor = campoValor(n, tipo, v => edita(path, l => l.map((x, j) => (j === i ? { ...n, value: v } : x))));
      if (valor) caixa.appendChild(valor);
      destino.appendChild(caixa);
    });

    const acoes = el('div', 'bset-actions');
    const add = el('button', 'bset-btn', '+ Filtro');
    add.type = 'button';
    add.addEventListener('click', () => { const c = condPadrao(); if (c) edita(path, l => [...l, c]); });
    acoes.appendChild(add);
    if (path.length + 1 < MAX_DEPTH) {
      const g = el('button', 'bset-btn', '+ Grupo');
      g.type = 'button';
      g.addEventListener('click', () => { const c = condPadrao(); if (c) edita(path, l => [...l, { op: 'or', conds: [c] }]); });
      acoes.appendChild(g);
    }
    destino.appendChild(acoes);
  }

  if (raiz.length > 1) s.body.appendChild(seletorModo(modoRaiz, v => patch({ filterMode: v, filterOperator: undefined })));
  else if (!raiz.length) s.body.appendChild(el('p', 'bset-hint', 'Nenhum filtro.'));
  desenhaLista(raiz, [], s.body);
  return s.root;
}
