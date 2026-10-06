// ── chart-model.js ──────────────────────────────────────────────────────────
// Notas → dados do gráfico (categorias × séries × valores). PURO.
//
// cfg (resolveChartConfig): { kind, orientation, stack, x:{prop,sort,omitEmpty,granularity},
//   y:{agg,prop}, series:{prop}|null, style:{cumulative,omitZeros,...} }

import { groupNotes } from '../engine/group-engine.js';
import { aggregate } from '../engine/aggregate-engine.js';
import { getNotePropertyValue } from '../bases-engine.js';

export const MAX_SERIES = 8;           // acima disso o excedente vira "Outros"
export const CHART_KINDS = ['bar', 'line', 'donut', 'number'];

/** Configuração efetiva do gráfico (padrões + o que a view define). */
export function resolveChartConfig(view = {}) {
  const c = view.chart && typeof view.chart === 'object' ? view.chart : {};
  const x = view.x && typeof view.x === 'object' ? view.x : {};
  const y = view.y && typeof view.y === 'object' ? view.y : {};
  const st = view.style && typeof view.style === 'object' ? view.style : {};
  const bool = (v, p) => (v === undefined ? p : v === true || v === 'true');
  return {
    kind: CHART_KINDS.includes(c.kind) ? c.kind : 'bar',
    orientation: c.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    stack: ['stacked', 'grouped', 'percent'].includes(c.stack) ? c.stack : 'grouped',
    x: {
      prop: x.prop || null,
      sort: ['manual', 'asc', 'desc', 'count', 'value'].includes(x.sort) ? x.sort : 'manual',
      omitEmpty: bool(x.omitEmpty, false),
      granularity: ['day', 'week', 'month', 'year'].includes(x.granularity) ? x.granularity : 'month',
    },
    y: { agg: y.agg || 'count', prop: y.prop || null },
    series: view.series?.prop ? { prop: view.series.prop } : null,
    style: {
      labels: bool(st.labels, true), grid: bool(st.grid, true), legend: ['right', 'bottom', 'none'].includes(st.legend) ? st.legend : 'bottom',
      cumulative: bool(st.cumulative, false), omitZeros: bool(st.omitZeros, false),
      goal: Number.isFinite(Number(st.goal)) && st.goal !== '' && st.goal != null ? Number(st.goal) : null,
      height: Math.min(600, Math.max(160, Number(st.height) || 280)),
    },
  };
}

function valorDaCelula(notas, y, schema) {
  if (y.agg === 'count' || !y.prop) return notas.length;
  const tipo = schema[y.prop]?.type || 'number';
  const r = aggregate(notas.map(n => getNotePropertyValue(n, y.prop)), y.agg, tipo);
  return typeof r.value === 'number' ? r.value : 0;
}

/**
 * @returns {{ categories:[{key,label,notes}], series:[{key,label}], values:number[][], total:number,
 *             single:number|null, cfg }}  values[s][c]
 */
export function buildChartData(notes, cfg, schema = {}) {
  // gráfico "número": um valor só, sem eixo
  if (cfg.kind === 'number') {
    const v = valorDaCelula(notes, cfg.y, schema);
    return { categories: [], series: [], values: [], total: v, single: v, cfg };
  }
  const xProp = cfg.x.prop;
  const gx = groupNotes(notes, {
    prop: xProp, granularity: cfg.x.granularity, hideEmpty: cfg.x.omitEmpty,
    order: cfg.x.sort === 'value' ? 'manual' : cfg.x.sort,
    // datas e números pedem ordem natural; sem escolha explícita, usa a ordem crescente
  }, schema, getNotePropertyValue);
  const ehOrdenavel = ['date', 'datetime', 'daterange', 'number'].includes(schema[xProp]?.type);
  let categorias = gx.map(g => ({ key: g.key, label: g.label, notes: g.notes }));
  if (!xProp) categorias = [{ key: '__all__', label: 'Todas', notes }];
  if (cfg.x.omitEmpty) categorias = categorias.filter(c => c.key !== '__empty__');
  if (ehOrdenavel && cfg.x.sort === 'manual') {
    categorias.sort((a, b) => (a.key === '__empty__') - (b.key === '__empty__') || String(a.key).localeCompare(String(b.key), 'pt-BR', { numeric: true }));
  }

  // séries (segunda propriedade): agrupa tudo e limita a MAX_SERIES (+ "Outros")
  let series = [{ key: '__y__', label: 'Total' }];
  let porSerie = null;
  if (cfg.series?.prop) {
    const gs = groupNotes(notes, { prop: cfg.series.prop, order: 'count', granularity: cfg.x.granularity }, schema, getNotePropertyValue);
    const principais = gs.slice(0, MAX_SERIES - (gs.length > MAX_SERIES ? 1 : 0));
    series = principais.map(g => ({ key: g.key, label: g.label }));
    porSerie = new Map(principais.map(g => [g.key, new Set(g.notes)]));
    if (gs.length > principais.length) {
      series.push({ key: '__others__', label: 'Outros' });
      const outros = new Set(gs.slice(principais.length).flatMap(g => g.notes));
      porSerie.set('__others__', outros);
    }
  }

  let values = series.map(s => categorias.map(c => {
    const nota = porSerie ? c.notes.filter(n => porSerie.get(s.key)?.has(n)) : c.notes;
    return valorDaCelula(nota, cfg.y, schema);
  }));

  if (cfg.x.sort === 'value') {
    const soma = i => values.reduce((t, ser) => t + ser[i], 0);
    const ordem = categorias.map((_, i) => i).sort((a, b) => soma(b) - soma(a));
    categorias = ordem.map(i => categorias[i]);
    values = values.map(ser => ordem.map(i => ser[i]));
  }
  if (cfg.style.omitZeros) {
    const manter = categorias.map((_, i) => values.some(ser => ser[i] !== 0));
    categorias = categorias.filter((_, i) => manter[i]);
    values = values.map(ser => ser.filter((_, i) => manter[i]));
  }
  if (cfg.style.cumulative) values = values.map(ser => ser.reduce((acc, v) => { acc.push((acc.length ? acc[acc.length - 1] : 0) + v); return acc; }, []));

  const total = values.reduce((t, ser) => t + ser.reduce((a, b) => a + b, 0), 0);
  return { categories: categorias, series, values, total, single: null, cfg };
}
