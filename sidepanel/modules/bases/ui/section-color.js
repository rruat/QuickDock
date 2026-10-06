// ── section-color.js ────────────────────────────────────────────────────────
// "Cor condicional": regras { quando condição → tom, aplicar na linha/cartão ou só na célula }.
// Grava `color.rules`.

import { TONES, normalizeColorRules } from '../engine/color-rules.js';
import { section, el, selectControl } from './controls.js';
import { operatorsForType, valueKindFor, defaultValueFor, newCondition, OPERATOR_LABELS } from './filter-operators.js';
import { campoValor } from './section-filter.js';

export function colorSection({ view, schema, memoria, patch }) {
  if (view.type === 'calendar' || view.type === 'chart') return null;
  const s = section('Cor condicional', { chave: 'color', memoria, dica: 'A primeira regra que casar colore a linha, o cartão ou a célula.' });
  const regras = normalizeColorRules(view);
  const props = Object.entries(schema).map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }));
  const tipoDe = k => schema[k]?.type || 'text';
  const grava = lista => patch({ color: { rules: lista.length ? lista : undefined } });
  const troca = (i, novo) => grava(regras.map((r, j) => (j === i ? novo : r)));

  regras.forEach((r, i) => {
    const caixa = el('div', 'bset-filter');
    const tipo = tipoDe(r.when.property);
    const topo = el('div', 'bset-rule');
    topo.appendChild(selectControl({ value: r.when.property, options: props, ariaLabel: 'Propriedade',
      onChange: v => troca(i, { ...r, when: newCondition(v, tipoDe(v)) }) }));
    topo.appendChild(selectControl({ value: r.when.operator, ariaLabel: 'Operador',
      options: operatorsForType(tipo, r.when.property).map(o => ({ value: o, label: OPERATOR_LABELS[o] || o })),
      onChange: v => {
        const w = { ...r.when, operator: v };
        if (valueKindFor(v, tipo) !== valueKindFor(r.when.operator, tipo)) {
          const val = defaultValueFor(v, tipo);
          if (val === undefined) delete w.value; else w.value = val;
        }
        troca(i, { ...r, when: w });
      } }));
    const rm = el('button', 'bset-icon-btn', '✕');
    rm.type = 'button'; rm.title = 'Remover regra'; rm.setAttribute('aria-label', 'Remover regra');
    rm.addEventListener('click', () => grava(regras.filter((_, j) => j !== i)));
    topo.appendChild(rm);
    caixa.appendChild(topo);
    const valor = campoValor(r.when, tipo, v => troca(i, { ...r, when: { ...r.when, value: v } }));
    if (valor) caixa.appendChild(valor);

    const baixo = el('div', 'bset-rule');
    baixo.appendChild(selectControl({ value: r.tone, ariaLabel: 'Cor', options: TONES.map(t => ({ value: t.id, label: t.label })), onChange: v => troca(i, { ...r, tone: v }) }));
    baixo.appendChild(selectControl({ value: r.apply, ariaLabel: 'Aplicar em',
      options: [{ value: 'row', label: view.type === 'table' ? 'Linha inteira' : 'Cartão/linha' }, ...(view.type === 'table' ? [{ value: 'cell', label: 'Só a célula' }] : [])],
      onChange: v => troca(i, { ...r, apply: v }) }));
    const amostra = el('span', `bset-tone-sample tone-${r.tone}`, 'Aa');
    baixo.appendChild(amostra);
    caixa.appendChild(baixo);
    s.body.appendChild(caixa);
  });
  if (!regras.length) s.body.appendChild(el('p', 'bset-hint', 'Nenhuma regra.'));

  const add = el('button', 'bset-btn', '+ Regra de cor');
  add.type = 'button';
  add.addEventListener('click', () => {
    const p = props.find(x => x.value !== 'title') ?? props[0];
    if (p) grava([...regras, { when: newCondition(p.value, tipoDe(p.value)), tone: 'red', apply: 'row' }]);
  });
  s.body.appendChild(add);
  return s.root;
}
