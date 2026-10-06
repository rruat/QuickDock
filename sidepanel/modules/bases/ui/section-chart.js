// ── section-chart.js ────────────────────────────────────────────────────────
// Configuração do Gráfico: tipo, eixos (X, Y/cálculo), série, estilo. Grava `chart`, `x`, `y`,
// `series`, `style` na view.

import { resolveChartConfig } from '../chart/chart-model.js';
import { aggregatesForType, AGG_LABELS } from '../engine/aggregate-engine.js';
import { section, row, selectControl, segmented, toggle } from './controls.js';

const NENHUMA = '__none__';
const ehData = t => ['date', 'datetime', 'daterange'].includes(t);

export function chartSections({ view, schema, memoria, patch }) {
  if (view.type !== 'chart') return [];
  const cfg = resolveChartConfig(view);
  const props = Object.entries(schema).map(([k, d]) => ({ value: d?.key || k, label: d?.label || k }));
  const numericas = Object.entries(schema).filter(([, d]) => d?.type === 'number').map(([k, d]) => ({ value: d.key || k, label: d.label || k }));
  const out = [];

  const tipo = section('Gráfico', { chave: 'ch-tipo', memoria });
  tipo.body.appendChild(row('Tipo', () => segmented({
    ariaLabel: 'Tipo de gráfico', value: cfg.kind,
    options: [{ value: 'bar', label: 'Barras' }, { value: 'line', label: 'Linha' }, { value: 'donut', label: 'Pizza' }, { value: 'number', label: 'Número' }],
    onChange: v => patch({ chart: { kind: v } }),
  })));
  if (cfg.kind === 'bar') {
    tipo.body.appendChild(row('Orientação', id => selectControl({ id, value: cfg.orientation, options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }], onChange: v => patch({ chart: { orientation: v } }) })));
    tipo.body.appendChild(row('Barras', id => selectControl({ id, value: cfg.stack, options: [{ value: 'grouped', label: 'Lado a lado' }, { value: 'stacked', label: 'Empilhadas' }, { value: 'percent', label: 'Empilhadas 100%' }], onChange: v => patch({ chart: { stack: v } }) })));
  }
  out.push(tipo.root);

  if (cfg.kind !== 'number') {
    const x = section('Eixo X (categorias)', { chave: 'ch-x', memoria });
    x.body.appendChild(row('Propriedade', id => selectControl({
      id, value: cfg.x.prop || NENHUMA, options: [{ value: NENHUMA, label: 'Escolher…' }, ...props],
      onChange: v => patch({ x: { prop: v === NENHUMA ? undefined : v } }),
    })));
    if (ehData(schema[cfg.x.prop]?.type)) {
      x.body.appendChild(row('Agrupar datas por', id => selectControl({ id, value: cfg.x.granularity, options: [{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }, { value: 'year', label: 'Ano' }], onChange: v => patch({ x: { granularity: v } }) })));
    }
    x.body.appendChild(row('Ordem', id => selectControl({ id, value: cfg.x.sort, options: [{ value: 'manual', label: 'Natural / das opções' }, { value: 'asc', label: 'A → Z' }, { value: 'desc', label: 'Z → A' }, { value: 'count', label: 'Mais notas primeiro' }, { value: 'value', label: 'Maior valor primeiro' }], onChange: v => patch({ x: { sort: v } }) })));
    x.body.appendChild(row('Omitir "Sem valor"', id => toggle({ id, value: cfg.x.omitEmpty, onChange: v => patch({ x: { omitEmpty: v } }) })));
    out.push(x.root);
  }

  const y = section('Eixo Y (valor)', { chave: 'ch-y', memoria });
  y.body.appendChild(row('Cálculo', id => selectControl({
    id, value: cfg.y.agg,
    options: [{ value: 'count', label: 'Contagem de notas' }, ...['sum', 'avg', 'median', 'min', 'max'].map(a => ({ value: a, label: AGG_LABELS[a] }))],
    onChange: v => patch({ y: { agg: v } }),
  })));
  if (cfg.y.agg !== 'count') {
    y.body.appendChild(row('Propriedade', id => selectControl({
      id, value: cfg.y.prop || NENHUMA, options: [{ value: NENHUMA, label: 'Escolher…' }, ...numericas],
      onChange: v => patch({ y: { prop: v === NENHUMA ? undefined : v } }),
    }), { dica: numericas.length ? '' : 'Crie uma propriedade numérica (ou fórmula com resultado número).' }));
  }
  if (cfg.kind === 'bar' || cfg.kind === 'line') {
    y.body.appendChild(row('Acumulado', id => toggle({ id, value: cfg.style.cumulative, onChange: v => patch({ style: { cumulative: v } }) })));
    y.body.appendChild(row('Linha de meta', id => {
      const inp = document.createElement('input');
      inp.id = id; inp.type = 'number'; inp.className = 'bset-input'; inp.style.maxWidth = '90px'; inp.placeholder = 'nenhuma';
      inp.value = cfg.style.goal ?? '';
      inp.addEventListener('change', () => patch({ style: { goal: inp.value === '' ? undefined : Number(inp.value) } }));
      return inp;
    }));
  }
  out.push(y.root);

  if (cfg.kind === 'bar' || cfg.kind === 'line') {
    const s = section('Séries', { chave: 'ch-series', memoria, dica: 'Divide cada categoria por uma segunda propriedade (até 8 séries; o resto vira "Outros").' });
    s.body.appendChild(row('Dividir por', id => selectControl({
      id, value: cfg.series?.prop || NENHUMA, options: [{ value: NENHUMA, label: 'Sem divisão' }, ...props],
      onChange: v => patch({ series: v === NENHUMA ? undefined : { prop: v } }),
    })));
    out.push(s.root);
  }

  const st = section('Estilo', { chave: 'ch-estilo', memoria, abertaPorPadrao: false });
  st.body.appendChild(row('Valores nas marcas', id => toggle({ id, value: cfg.style.labels, onChange: v => patch({ style: { labels: v } }) })));
  st.body.appendChild(row('Grade', id => toggle({ id, value: cfg.style.grid, onChange: v => patch({ style: { grid: v } }) })));
  st.body.appendChild(row('Omitir zeros', id => toggle({ id, value: cfg.style.omitZeros, onChange: v => patch({ style: { omitZeros: v } }) })));
  st.body.appendChild(row('Legenda', id => selectControl({ id, value: cfg.style.legend, options: [{ value: 'bottom', label: 'Embaixo' }, { value: 'right', label: 'À direita' }, { value: 'none', label: 'Sem legenda' }], onChange: v => patch({ style: { legend: v } }) })));
  st.body.appendChild(row('Altura', id => selectControl({ id, value: cfg.style.height, options: [200, 280, 360, 460].map(h => ({ value: h, label: `${h}px` })), onChange: v => patch({ style: { height: Number(v) } }) })));
  out.push(st.root);
  return out;
}

export { aggregatesForType };
