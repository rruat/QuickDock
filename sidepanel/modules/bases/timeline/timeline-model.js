// ── timeline-model.js ───────────────────────────────────────────────────────
// Notas → itens da linha do tempo (início/fim em dias) e linhas (com grupos) — PURO.
// Reaproveita o modelo de eventos do calendário (mesmas propriedades de data/período).

import { buildCalendarEvents } from '../calendar/calendar-model.js';
import { groupNotes } from '../engine/group-engine.js';
import { resolveGroupConfig } from '../config/view-model.js';

export function resolveTimelineConfig(view = {}) {
  const d = view.date && typeof view.date === 'object' ? view.date : {};
  const t = view.table && typeof view.table === 'object' ? view.table : {};
  const bool = (v, p) => (v === undefined ? p : v === true || v === 'true');
  return {
    date: { start: d.start || null, end: d.end || null },
    scale: ['day', 'week', 'month', 'quarter', 'year'].includes(view.scale) ? view.scale : 'week',
    table: { visible: bool(t.visible, true), width: Math.min(600, Math.max(160, Number(t.width) || 280)) },
    colorBy: view.color?.by || null,
    today: bool(view.today, true),
  };
}

/**
 * @returns {{ items: Array<{ id, note, title, startYmd, endYmd, milestone, ev }>, noDate: Array<Object> }}
 * milestone = só início (sem fim): losango de 1 dia.
 */
export function buildTimelineItems(notes, cfg, getValue) {
  const evCfg = { date: { start: cfg.date.start, end: cfg.date.end, fallback: null, defaultDuration: 60 } };
  const evs = buildCalendarEvents(notes, evCfg, getValue);
  const comData = new Set(evs.map(e => e.id));
  const items = evs.map(ev => ({
    id: ev.id, note: ev.note, title: ev.title,
    startYmd: ev.startYmd,
    // com horário, só o dia importa aqui
    endYmd: ev.endYmd,
    milestone: !cfg.date.end && ev.startYmd === ev.endYmd,
    ev,
  }));
  const noDate = notes.filter(n => !comData.has(String(n.id)));
  return { items, noDate };
}

/**
 * Linhas para desenhar: itens sem grupo, ou cabeçalho de grupo + itens.
 * @returns {Array<{ type:'group', key, label, count } | { type:'item', item }>}
 */
export function buildRows(items, view, schema, getValue, collapsed = []) {
  const g = resolveGroupConfig(view);
  if (!g.prop) return items.map(item => ({ type: 'item', item }));
  const porNota = new Map(items.map(i => [i.note, i]));
  const rows = [];
  for (const grupo of groupNotes(items.map(i => i.note), g, schema, getValue)) {
    rows.push({ type: 'group', key: grupo.key, label: grupo.label, count: grupo.count });
    if (collapsed.includes(grupo.key)) continue;
    for (const n of grupo.notes) { const it = porNota.get(n); if (it) rows.push({ type: 'item', item: it }); }
  }
  return rows;
}
