// ── section-derived.js ──────────────────────────────────────────────────────
// "Propriedades calculadas da Base": fórmulas e rollups. Grava em `baseDef.properties`
// (valem para todas as views da Base). Chaves = nome da propriedade.

import { checkFormula, isDerivedDef } from '../engine/derived-columns.js';
import { aggregatesForType, AGG_LABELS } from '../engine/aggregate-engine.js';
import { section, row, el, selectControl } from './controls.js';

const RESULTADOS = [
  { value: 'number', label: 'Número' }, { value: 'text', label: 'Texto' },
  { value: 'date', label: 'Data' }, { value: 'checkbox', label: 'Sim/Não' },
];

export function derivedSection({ baseProps, schema, memoria, patchBase, fillIds }) {
  const s = section('Propriedades calculadas', { chave: 'derived', memoria,
    dica: 'Fórmulas (ex.: prop("custo") * prop("qtd")) e rollups. Valem para todas as views da Base.' });
  const derivadas = Object.entries(baseProps || {}).filter(([, d]) => isDerivedDef(d) || d?.type === 'button' || d?.type === 'uid');

  for (const [key, def] of derivadas) {
    const caixa = el('div', 'bset-filter');
    const topo = el('div', 'bset-rule');
    topo.appendChild(el('strong', 'bset-derived-name', `${{ rollup: '∑', button: '▣', uid: '#', reverse: '⇄' }[def.type] || 'ƒ'} ${key}`));
    const rm = el('button', 'bset-icon-btn', '✕');
    rm.type = 'button'; rm.title = 'Remover propriedade'; rm.setAttribute('aria-label', `Remover ${key}`);
    rm.addEventListener('click', () => { if (window.confirm(`Remover a propriedade calculada "${key}"?`)) patchBase({ [key]: undefined }); });
    topo.appendChild(rm);
    caixa.appendChild(topo);

    if (def.type === 'formula') {
      const campo = el('textarea', 'bset-input bset-formula');
      campo.rows = 2; campo.value = def.expr || ''; campo.spellcheck = false;
      campo.setAttribute('aria-label', `Fórmula de ${key}`);
      const msg = el('p', 'bset-hint bset-formula-msg');
      const valida = () => {
        const r = checkFormula(campo.value, { ...schema, ...baseProps }, key);
        msg.textContent = r.ok ? (r.desconhecidas.length ? `Propriedade não encontrada: ${r.desconhecidas.join(', ')}` : 'Fórmula válida') : `⚠ ${r.error}`;
        msg.classList.toggle('is-error', !r.ok || r.desconhecidas?.length > 0);
        return r.ok;
      };
      campo.addEventListener('input', valida);
      campo.addEventListener('change', () => { if (valida()) patchBase({ [key]: { ...def, expr: campo.value } }); });
      valida();
      caixa.append(campo, msg);
      caixa.appendChild(row('Resultado', id => selectControl({ id, value: def.result || 'text', options: RESULTADOS, onChange: v => patchBase({ [key]: { ...def, result: v } }) })));
    } else if (def.type === 'uid') {
      const pre = el('input', 'bset-input'); pre.value = def.prefix || ''; pre.maxLength = 12; pre.setAttribute('aria-label', 'Prefixo do ID');
      pre.addEventListener('change', () => patchBase({ [key]: { ...def, prefix: pre.value.trim().replace(/[^\w-]/g, '') || undefined } }));
      caixa.appendChild(row('Prefixo', () => pre));
      caixa.appendChild(row('Dígitos', id => selectControl({ id, value: def.digits || 0, options: [0, 2, 3, 4, 5].map(n => ({ value: n, label: n === 0 ? 'Sem zeros à esquerda' : String(n) })), onChange: v => patchBase({ [key]: { ...def, digits: Number(v) || undefined } }) })));
      const gera = el('button', 'bset-btn', 'Gerar IDs das notas sem ID'); gera.type = 'button';
      gera.addEventListener('click', () => fillIds?.(key, def));
      caixa.appendChild(gera);
      caixa.appendChild(el('p', 'bset-hint', 'Notas novas criadas por esta Base já recebem o próximo ID. O número nunca é reaproveitado.'));
    } else if (def.type === 'reverse') {
      const props = Object.entries(schema).filter(([k, d]) => !d?.isSystem && !d?.isDerived).map(([k, d]) => ({ value: d?.key || k, label: d?.label || k }));
      caixa.appendChild(row('Notas que citam esta em', id => selectControl({ id, value: def.relation || '', options: [{ value: '', label: 'Escolher…' }, ...props], onChange: v => patchBase({ [key]: { ...def, relation: v || '' } }) })));
    } else if (def.type === 'button') {
      const props = Object.entries(schema).filter(([k, d]) => !d?.isSystem && !d?.isDerived).map(([k, d]) => ({ value: d?.key || k, label: d?.label || k }));
      const rot = el('input', 'bset-input'); rot.value = def.label || ''; rot.maxLength = 30; rot.setAttribute('aria-label', 'Texto do botão');
      rot.addEventListener('change', () => patchBase({ [key]: { ...def, label: rot.value.trim() || 'Executar' } }));
      caixa.appendChild(row('Texto do botão', () => rot));
      caixa.appendChild(row('Define a propriedade', id => selectControl({ id, value: def.set?.prop || '', options: [{ value: '', label: 'Escolher…' }, ...props], onChange: v => patchBase({ [key]: { ...def, set: { ...(def.set || {}), prop: v || undefined } } }) })));
      const val = el('input', 'bset-input'); val.value = def.set?.value ?? ''; val.setAttribute('aria-label', 'Valor a gravar');
      val.addEventListener('change', () => patchBase({ [key]: { ...def, set: { ...(def.set || {}), value: val.value } } }));
      caixa.appendChild(row('Com o valor', () => val));
    } else {
      const props = Object.entries(schema).map(([k, d]) => ({ value: d?.key || k, label: d?.label || k }));
      caixa.appendChild(row('Relação', id => selectControl({ id, value: def.relation, options: props, onChange: v => patchBase({ [key]: { ...def, relation: v } }) })));
      caixa.appendChild(row('Propriedade alvo', id => selectControl({ id, value: def.target, options: props, onChange: v => patchBase({ [key]: { ...def, target: v, targetType: schema[v]?.type } }) })));
      caixa.appendChild(row('Cálculo', id => selectControl({
        id, value: def.agg || 'count',
        options: aggregatesForType(def.targetType || 'number').filter(a => a !== 'none').map(a => ({ value: a, label: AGG_LABELS[a] })),
        onChange: v => patchBase({ [key]: { ...def, agg: v } }),
      })));
    }
    s.body.appendChild(caixa);
  }
  if (!derivadas.length) s.body.appendChild(el('p', 'bset-hint', 'Nenhuma propriedade calculada.'));

  const nome = el('input', 'bset-input');
  nome.placeholder = 'Nome da nova propriedade'; nome.maxLength = 40;
  nome.setAttribute('aria-label', 'Nome da nova propriedade calculada');
  nome.style.maxWidth = '100%';
  s.body.appendChild(nome);
  const acoes = el('div', 'bset-actions');
  const cria = tipo => {
    const n = nome.value.trim();
    if (!n) { nome.focus(); return; }
    if (n in (baseProps || {}) || n in schema) { nome.setCustomValidity('Já existe uma propriedade com esse nome'); nome.reportValidity(); nome.setCustomValidity(''); return; }
    patchBase({ [n]: tipo === 'formula' ? { type: 'formula', expr: '', result: 'number' } : tipo === 'button' ? { type: 'button', label: 'Executar', set: { prop: '', value: '' } } : tipo === 'uid' ? { type: 'uid', prefix: n.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, ''), digits: 0 } : tipo === 'reverse' ? { type: 'reverse', relation: '' } : { type: 'rollup', agg: 'count', relation: '', target: '' } });
  };
  const f = el('button', 'bset-btn', '+ Fórmula'); f.type = 'button'; f.addEventListener('click', () => cria('formula'));
  const r = el('button', 'bset-btn', '+ Rollup'); r.type = 'button'; r.addEventListener('click', () => cria('rollup'));
  const bt = el('button', 'bset-btn', '+ Botão'); bt.type = 'button'; bt.addEventListener('click', () => cria('button'));
  const id = el('button', 'bset-btn', '+ ID único'); id.type = 'button'; id.addEventListener('click', () => cria('uid'));
  const rv = el('button', 'bset-btn', '+ Relação inversa'); rv.type = 'button'; rv.addEventListener('click', () => cria('reverse'));
  acoes.append(f, r, bt, id, rv);
  s.body.appendChild(acoes);
  return s.root;
}
