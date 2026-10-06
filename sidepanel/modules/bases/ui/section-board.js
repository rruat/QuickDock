// ── section-board.js ────────────────────────────────────────────────────────
// Ajustes do Quadro: tamanho do cartão, coluna "Sem valor", limite por coluna (WIP)
// e cálculo no cabeçalho das colunas. Grava `card.size`, `group.hidden`, `wip`, `calc`.

import { resolveGroupConfig, resolveSubGroup, resolveCalc } from '../config/view-model.js';
import { EMPTY_KEY } from '../engine/group-engine.js';
import { aggregatesForType, AGG_LABELS } from '../engine/aggregate-engine.js';
import { section, row, selectControl, toggle } from './controls.js';

const NENHUM = 'none';

export function boardSection({ view, schema, memoria, patch }) {
  if (view.type !== 'board') return null;
  const cfg = resolveGroupConfig(view);
  const calc = resolveCalc(view);
  const s = section('Quadro', { chave: 'board', memoria });
  s.body.appendChild(row('Tamanho do cartão', id => selectControl({
    id, value: ['small', 'large'].includes(view.card?.size) ? view.card.size : 'medium',
    options: [{ value: 'small', label: 'Pequeno' }, { value: 'medium', label: 'Médio' }, { value: 'large', label: 'Grande' }],
    onChange: v => patch({ card: { size: v } }),
  })));
  const sub = resolveSubGroup(view);
  const candidatas = Object.entries(schema).filter(([k, d]) => k !== 'title' && k !== cfg.prop && !['date', 'datetime', 'daterange', 'number', 'tasks'].includes(d?.type)).map(([k, d]) => ({ value: d.key || k, label: d.label || k }));
  s.body.appendChild(row('Sub-grupo (raias)', id => selectControl({
    id, value: sub.prop || NENHUM, options: [{ value: NENHUM, label: 'Sem sub-grupo' }, ...candidatas],
    onChange: v => patch({ subGroup: v === NENHUM ? undefined : { prop: v } }),
  }), { dica: 'Divide o quadro em faixas horizontais. Soltar um cartão numa faixa muda os dois valores.' }));
  s.body.appendChild(row('Mostrar coluna "Sem valor"', id => toggle({
    id, value: !cfg.hidden.includes(EMPTY_KEY),
    onChange: v => patch({ group: { prop: cfg.prop, hidden: v ? cfg.hidden.filter(k => k !== EMPTY_KEY) : [...cfg.hidden, EMPTY_KEY] } }),
  })));
  s.body.appendChild(row('Limite por coluna', id => {
    const inp = document.createElement('input');
    inp.id = id; inp.type = 'number'; inp.min = '0'; inp.className = 'bset-input'; inp.style.maxWidth = '90px';
    inp.placeholder = 'sem limite'; inp.value = Number(view.wip) > 0 ? String(view.wip) : '';
    inp.addEventListener('change', () => patch({ wip: Number(inp.value) > 0 ? Math.round(Number(inp.value)) : undefined }));
    return inp;
  }, { dica: 'A coluna fica destacada quando passa do limite (WIP).' }));

  const numericas = Object.entries(schema).filter(([, d]) => d?.type === 'number').map(([k, d]) => ({ key: d.key || k, label: d.label || k }));
  for (const p of numericas) {
    s.body.appendChild(row(`Total de ${p.label}`, id => selectControl({
      id, value: calc[p.key] || NENHUM,
      options: aggregatesForType('number').map(a => ({ value: a, label: a === NENHUM ? 'Nenhum' : AGG_LABELS[a] })),
      onChange: v => patch({ calc: { ...calc, [p.key]: v === NENHUM ? undefined : v }, summaries: undefined }),
    })));
  }
  return s.root;
}
