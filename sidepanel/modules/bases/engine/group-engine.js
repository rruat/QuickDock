// ── group-engine.js ─────────────────────────────────────────────────────────
// Agrupamento de notas por propriedade (Apêndice/4.4) — PURO.
// groupNotes(notes, cfg, schema, getValue) → [{ key, label, notes, count, empty }]
//   cfg: { prop, granularity?: 'day'|'week'|'month'|'year', range?: {step},
//          order: 'manual'|'asc'|'desc'|'count', hideEmpty, hidden: [keys] }

import { toYMD, startOfWeek, startOfMonth } from './date-utils.js';

export const EMPTY_KEY = '__empty__';
const vazio = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const ehData = t => t === 'date' || t === 'datetime' || t === 'daterange';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Chave e rótulo do grupo de uma data, segundo a granularidade. */
export function dateBucket(valor, granularity = 'month') {
  const ymd = toYMD(valor);
  if (!ymd) return null;
  const [a, m, d] = ymd.split('-');
  switch (granularity) {
    case 'day': return { key: ymd, label: `${d}/${m}/${a}` };
    case 'week': { const s = startOfWeek(ymd, 1); const [sa, sm, sd] = s.split('-'); return { key: s, label: `Semana de ${sd}/${sm}/${sa}` }; }
    case 'year': return { key: a, label: a };
    default: { const s = startOfMonth(ymd); return { key: s.slice(0, 7), label: `${MESES[Number(m) - 1]}/${a}` }; }
  }
}

function numberBucket(valor, step) {
  const n = Number(valor);
  if (!Number.isFinite(n) || !(step > 0)) return null;
  const ini = Math.floor(n / step) * step;
  return { key: String(ini), label: `${ini} – ${ini + step}`, sort: ini };
}

/** Em quais grupos uma nota cai: lista de { key, label, sort? } (multisseleção = vários). */
function bucketsOf(raw, propDef, cfg) {
  if (vazio(raw)) return [{ key: EMPTY_KEY, label: 'Sem valor' }];
  // Status agrupado pelo GRUPO da opção (A fazer / Em andamento / Concluído)
  if (propDef?.isStatus && cfg.byStatusGroup) {
    const op = (propDef.options || []).find(o => (o.label ?? o.id) === raw || o.id === raw);
    const idx = Math.max(0, ['todo', 'progress', 'complete'].indexOf(op?.group));
    return [{ key: ['todo', 'progress', 'complete'][idx], label: ['A fazer', 'Em andamento', 'Concluído'][idx], sort: idx }];
  }
  const tipo = propDef?.type;
  if (ehData(tipo)) { const b = dateBucket(raw, cfg.granularity); return [b || { key: EMPTY_KEY, label: 'Sem valor' }]; }
  if (tipo === 'number' && cfg.range?.step) { const b = numberBucket(raw, Number(cfg.range.step)); return [b || { key: EMPTY_KEY, label: 'Sem valor' }]; }
  if (tipo === 'checkbox') { const on = raw === true || raw === 'true'; return [{ key: on ? 'true' : 'false', label: on ? 'Marcado' : 'Desmarcado' }]; }
  if (Array.isArray(raw)) return raw.map(v => ({ key: String(v), label: String(v) }));
  return [{ key: String(raw), label: String(raw) }];
}

export function groupNotes(notes, cfg = {}, schema = {}, getValue) {
  const prop = cfg.prop;
  if (!prop) return [{ key: '__all__', label: 'Todas as notas', notes: [...notes], count: notes.length, empty: false }];
  const propDef = schema[prop] || {};
  const mapa = new Map();

  for (const n of notes) {
    for (const b of bucketsOf(getValue(n, prop), propDef, cfg)) {
      if (!mapa.has(b.key)) mapa.set(b.key, { key: b.key, label: b.label, sort: b.sort, notes: [], empty: b.key === EMPTY_KEY });
      mapa.get(b.key).notes.push(n);
    }
  }

  // grupos "fantasma": opções declaradas que ninguém usa ainda (aparecem vazias no modo manual)
  const opcoes = (propDef.options || []).map(o => (typeof o === 'string' ? o : o?.label ?? o?.value)).filter(Boolean);
  if (!cfg.hideEmpty && !(propDef.isStatus && cfg.byStatusGroup)) for (const o of opcoes) if (!mapa.has(String(o))) mapa.set(String(o), { key: String(o), label: String(o), notes: [], empty: false });

  let grupos = [...mapa.values()].map(g => ({ ...g, count: g.notes.length }));
  const ordem = cfg.order || 'manual';
  const posOpcao = k => { const i = opcoes.map(String).indexOf(k); return i < 0 ? Infinity : i; };
  const vaziosNoFim = (a, b) => (a.empty === b.empty ? 0 : a.empty ? 1 : -1);
  const cmpNatural = (a, b) => (a.sort !== undefined ? a.sort - b.sort : a.key.localeCompare(b.key, 'pt-BR', { numeric: true, sensitivity: 'base' }));

  if (ordem === 'count') grupos.sort((a, b) => vaziosNoFim(a, b) || b.count - a.count);
  else if (ordem === 'asc') grupos.sort((a, b) => vaziosNoFim(a, b) || cmpNatural(a, b));
  else if (ordem === 'desc') grupos.sort((a, b) => vaziosNoFim(a, b) || cmpNatural(b, a));
  else grupos.sort((a, b) => vaziosNoFim(a, b) || (posOpcao(a.key) - posOpcao(b.key)) || (ehData(propDef.type) || propDef.type === 'number' ? cmpNatural(a, b) : 0));

  const ocultos = new Set((cfg.hidden || []).map(String));
  grupos = grupos.filter(g => !ocultos.has(g.key));
  if (cfg.hideEmpty) grupos = grupos.filter(g => g.count > 0);
  return grupos;
}
