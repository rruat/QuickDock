// ── section-status.js ───────────────────────────────────────────────────────
// Propriedades do tipo STATUS da Base: opções com grupo (A fazer · Em andamento · Concluído).
// Grava em baseDef.properties[chave] = { type:'status', options:[{ label, group }] }.

import { STATUS_GROUPS } from '../bases-schema.js';
import { section, el, selectControl } from './controls.js';

const PADRAO = [
  { label: 'Não iniciado', group: 'todo' },
  { label: 'Em andamento', group: 'progress' },
  { label: 'Concluído', group: 'complete' },
];

export function statusSection({ baseProps, schema, memoria, patchBase }) {
  const s = section('Status', { chave: 'status', memoria, abertaPorPadrao: false,
    dica: 'Um status é uma seleção cujas opções pertencem a grupos. Dá para agrupar por grupo (A fazer · Em andamento · Concluído).' });
  const status = Object.entries(baseProps || {}).filter(([, d]) => d?.type === 'status');

  for (const [key, def] of status) {
    const caixa = el('div', 'bset-filter');
    const topo = el('div', 'bset-rule');
    topo.appendChild(el('strong', 'bset-derived-name', `◐ ${key}`));
    const rm = el('button', 'bset-icon-btn', '✕');
    rm.type = 'button'; rm.title = 'Remover propriedade de status'; rm.setAttribute('aria-label', `Remover ${key}`);
    rm.addEventListener('click', () => { if (window.confirm(`Remover a definição de status "${key}"? Os valores nas notas continuam, mas voltam a ser uma seleção comum.`)) patchBase({ [key]: undefined }); });
    topo.appendChild(rm);
    caixa.appendChild(topo);

    const opcoes = Array.isArray(def.options) ? def.options : [];
    const grava = novas => patchBase({ [key]: { ...def, options: novas } });
    opcoes.forEach((o, i) => {
      const linha = el('div', 'bset-rule');
      const nome = el('input', 'bset-input'); nome.value = o.label || ''; nome.maxLength = 40;
      nome.setAttribute('aria-label', 'Nome da opção');
      nome.addEventListener('change', () => { const v = nome.value.trim(); if (v) grava(opcoes.map((x, j) => (j === i ? { ...x, id: v, label: v } : x))); });
      linha.appendChild(nome);
      linha.appendChild(selectControl({ value: o.group || 'todo', ariaLabel: 'Grupo da opção',
        options: STATUS_GROUPS.map(g => ({ value: g.id, label: g.label })),
        onChange: v => grava(opcoes.map((x, j) => (j === i ? { ...x, group: v } : x))) }));
      const x = el('button', 'bset-icon-btn', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Remover opção');
      x.addEventListener('click', () => grava(opcoes.filter((_, j) => j !== i)));
      linha.appendChild(x);
      caixa.appendChild(linha);
    });
    const add = el('button', 'bset-btn', '+ Opção'); add.type = 'button';
    add.addEventListener('click', () => grava([...opcoes, { label: `Opção ${opcoes.length + 1}`, group: 'todo' }]));
    caixa.appendChild(add);
    s.body.appendChild(caixa);
  }
  if (!status.length) s.body.appendChild(el('p', 'bset-hint', 'Nenhuma propriedade de status.'));

  // criar a partir de uma propriedade existente (mantém os valores das notas)
  const candidatas = Object.entries(schema).filter(([k, d]) => !d?.isSystem && !d?.isDerived && !baseProps?.[k] && ['select', 'text'].includes(d?.type));
  if (candidatas.length) {
    const sel = selectControl({ value: candidatas[0][0], ariaLabel: 'Propriedade a transformar em status', options: candidatas.map(([k, d]) => ({ value: d.key || k, label: d.label || k })), onChange: () => {} });
    const b = el('button', 'bset-btn', 'Transformar em status'); b.type = 'button';
    b.addEventListener('click', () => patchBase({ [sel.value]: { type: 'status', options: PADRAO } }));
    const acoes = el('div', 'bset-actions'); acoes.append(sel, b);
    s.body.appendChild(acoes);
  }
  return s.root;
}
