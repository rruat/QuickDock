// ── aggregate-engine.js ─────────────────────────────────────────────────────
// Cálculos por coluna/grupo (Apêndice C do planejamento) — PURO.
// aggregate(values, agg, type) recebe os valores brutos já extraídos das notas.

import { toYMD, diffDays } from './date-utils.js';

const vazio = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

export const AGG_LABELS = {
  none: 'Nenhum', count: 'Contagem', filled: 'Preenchidos', empty: 'Vazios', unique: 'Únicos',
  pct_filled: '% preenchidos', pct_empty: '% vazios',
  sum: 'Soma', avg: 'Média', median: 'Mediana', min: 'Mínimo', max: 'Máximo', range: 'Intervalo',
  earliest: 'Mais antiga', latest: 'Mais recente', range_days: 'Intervalo (dias)',
  checked: 'Marcados', unchecked: 'Não marcados', pct_checked: '% marcados',
  tasks_total: 'Total de tarefas', tasks_done: 'Tarefas concluídas', tasks_pct: '% concluído',
};

const GERAIS = ['count', 'filled', 'empty', 'unique', 'pct_filled', 'pct_empty'];

/** Cálculos oferecidos para o tipo de propriedade (o primeiro depois de "none" é o sugerido). */
export function aggregatesForType(type) {
  switch (type) {
    case 'number': return ['none', 'sum', 'avg', 'median', 'min', 'max', 'range', ...GERAIS];
    case 'date': case 'datetime': case 'daterange': return ['none', 'earliest', 'latest', 'range_days', ...GERAIS];
    case 'checkbox': return ['none', 'checked', 'unchecked', 'pct_checked', 'count'];
    case 'tasks': return ['none', 'tasks_total', 'tasks_done', 'tasks_pct', 'count'];
    default: return ['none', ...GERAIS];
  }
}

const numeros = vals => vals.map(Number).filter(Number.isFinite);

/** @returns {{ agg:string, label:string, value:number|string|null }} (value null = sem dado) */
export function aggregate(values, agg, type = 'text') {
  const label = AGG_LABELS[agg] || agg;
  const total = values.length;
  const preenchidos = values.filter(v => !vazio(v));
  const out = value => ({ agg, label, value });

  switch (agg) {
    case 'count': return out(total);
    case 'filled': return out(preenchidos.length);
    case 'empty': return out(total - preenchidos.length);
    case 'unique': return out(new Set(preenchidos.flatMap(v => (Array.isArray(v) ? v : [v])).map(String)).size);
    case 'pct_filled': return out(total ? (preenchidos.length / total) * 100 : null);
    case 'pct_empty': return out(total ? ((total - preenchidos.length) / total) * 100 : null);
    case 'sum': return out(numeros(preenchidos).reduce((a, b) => a + b, 0));
    case 'avg': { const n = numeros(preenchidos); return out(n.length ? n.reduce((a, b) => a + b, 0) / n.length : null); }
    case 'median': {
      const n = numeros(preenchidos).sort((a, b) => a - b);
      if (!n.length) return out(null);
      const m = Math.floor(n.length / 2);
      return out(n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2);
    }
    case 'min': { const n = numeros(preenchidos); return out(n.length ? Math.min(...n) : null); }
    case 'max': { const n = numeros(preenchidos); return out(n.length ? Math.max(...n) : null); }
    case 'range': { const n = numeros(preenchidos); return out(n.length ? Math.max(...n) - Math.min(...n) : null); }
    case 'earliest': case 'latest': case 'range_days': {
      const d = preenchidos.map(toYMD).filter(Boolean).sort();
      if (!d.length) return out(null);
      if (agg === 'earliest') return out(d[0]);
      if (agg === 'latest') return out(d[d.length - 1]);
      return out(diffDays(d[0], d[d.length - 1]));
    }
    case 'checked': return out(values.filter(v => v === true || v === 'true').length);
    case 'unchecked': return out(values.filter(v => !(v === true || v === 'true')).length);
    case 'pct_checked': return out(total ? (values.filter(v => v === true || v === 'true').length / total) * 100 : null);
    case 'tasks_total': return out(values.reduce((t, v) => t + (v?.total || 0), 0));
    case 'tasks_done': return out(values.reduce((t, v) => t + (v?.checked || 0), 0));
    case 'tasks_pct': {
      const t = values.reduce((s, v) => s + (v?.total || 0), 0);
      const c = values.reduce((s, v) => s + (v?.checked || 0), 0);
      return out(t ? (c / t) * 100 : null);
    }
    default: return out(null);
  }
}

const PCT = new Set(['pct_filled', 'pct_empty', 'pct_checked', 'tasks_pct']);

/** Texto pronto pra exibir (pt-BR). */
export function formatAggregate(result) {
  if (result.value === null || result.value === undefined) return '—';
  if (typeof result.value === 'number') {
    const n = PCT.has(result.agg) ? Math.round(result.value) : Math.round(result.value * 100) / 100;
    return n.toLocaleString('pt-BR') + (PCT.has(result.agg) ? '%' : '');
  }
  return String(result.value);
}
