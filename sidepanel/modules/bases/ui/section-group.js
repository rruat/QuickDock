// ── section-group.js ────────────────────────────────────────────────────────
// "Agrupar por": hoje só o Quadro agrupa (colunas); grava `groupBy`.

import { section, row, selectControl } from './controls.js';

const NENHUM = '__none__';

export function groupSection({ view, schema, memoria, patch }) {
  if (view.type !== 'board') return null;
  const s = section('Agrupar', { chave: 'group', memoria, dica: 'Cada valor da propriedade vira uma coluna.' });
  const props = Object.entries(schema)
    .filter(([k, d]) => k !== 'title' && !['date', 'datetime', 'daterange', 'number', 'tasks'].includes(d?.type))
    .map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }));
  s.body.appendChild(row('Agrupar por', id => selectControl({
    id, value: view.groupBy || 'status', options: props,
    onChange: v => patch({ groupBy: v }),
  })));
  return s.root;
}
