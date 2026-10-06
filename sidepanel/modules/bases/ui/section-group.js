// ── section-group.js ────────────────────────────────────────────────────────
// "Agrupar": propriedade, granularidade (datas), faixas (números), ordem dos grupos,
// ocultar vazios e contagens. Grava `group` (e limpa o `groupBy` antigo do quadro).

import { resolveGroupConfig } from '../config/view-model.js';
import { section, row, selectControl, toggle } from './controls.js';

const NENHUM = '__none__';
const ehData = t => ['date', 'datetime', 'daterange'].includes(t);

export function groupSection({ view, schema, memoria, patch }) {
  if (!['table', 'board', 'list', 'gallery', 'timeline', 'feed'].includes(view.type)) return null;
  const cfg = resolveGroupConfig(view);
  const quadro = view.type === 'board';
  const s = section('Agrupar', { chave: 'group', memoria, dica: quadro ? 'Cada valor da propriedade vira uma coluna.' : 'Separa as notas em grupos recolhíveis.' });
  const props = Object.entries(schema)
    .filter(([k, d]) => k !== 'title' && (!quadro || !['date', 'datetime', 'daterange', 'number', 'tasks'].includes(d?.type)))
    .map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }));
  const opcoes = quadro ? props : [{ value: NENHUM, label: 'Sem agrupamento' }, ...props];
  const grava = g => patch({ group: g, groupBy: undefined });

  s.body.appendChild(row('Agrupar por', id => selectControl({
    id, value: cfg.prop || (quadro ? 'status' : NENHUM), options: opcoes,
    onChange: v => (v === NENHUM ? patch({ group: undefined, groupBy: undefined }) : grava({ prop: v })),
  })));
  if (!cfg.prop && !quadro) return s.root;

  const tipo = schema[cfg.prop || 'status']?.type;
  if (ehData(tipo)) {
    s.body.appendChild(row('Agrupar datas por', id => selectControl({
      id, value: cfg.granularity,
      options: [{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }, { value: 'year', label: 'Ano' }],
      onChange: v => grava({ prop: cfg.prop, granularity: v }),
    })));
  }
  if (schema[cfg.prop || 'status']?.isStatus) {
    s.body.appendChild(row('Agrupar pelo grupo do status', id => toggle({ id, value: cfg.byStatusGroup, onChange: v => grava({ prop: cfg.prop, byStatusGroup: v }) }), { dica: 'A fazer · Em andamento · Concluído, em vez de cada opção.' }));
  }
  s.body.appendChild(row('Ordem dos grupos', id => selectControl({
    id, value: cfg.order,
    options: [{ value: 'manual', label: 'Ordem das opções' }, { value: 'asc', label: 'A → Z' }, { value: 'desc', label: 'Z → A' }, { value: 'count', label: 'Mais itens primeiro' }],
    onChange: v => grava({ prop: cfg.prop, order: v }),
  })));
  s.body.appendChild(row('Ocultar grupos vazios', id => toggle({ id, value: cfg.hideEmpty, onChange: v => grava({ prop: cfg.prop, hideEmpty: v }) })));
  if (!quadro && view.type !== 'timeline') s.body.appendChild(row('Mostrar contagem', id => toggle({ id, value: cfg.showCounts, onChange: v => grava({ prop: cfg.prop, showCounts: v }) })));
  return s.root;
}
