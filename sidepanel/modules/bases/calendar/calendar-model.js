// ── calendar-model.js ───────────────────────────────────────────────────────
// Modelo de EVENTOS do calendário das Bases — PURO (sem DOM, sem Dexie).
// Transforma notas em eventos (início/fim, dia inteiro ou com horário) a partir das
// propriedades escolhidas na view, e responde "o que cai em cada dia".
//
// Evento:
//   { id, note, title, startYmd, startMin|null, endYmd, endMin|null, allDay,
//     fromFallback, startProp, endProp, canResize }
//   startMin/endMin = minutos desde a meia-noite local; null quando é dia inteiro.
//   Evento com horário que passa da meia-noite tem endYmd > startYmd.

import { parseDateValue, addDays, compareYMD, diffDays } from '../engine/date-utils.js';

const DIA_MIN = 1440;

/** Primeira propriedade de data DO USUÁRIO do schema (as de sistema só entram como reserva). */
export function pickDefaultDateProp(schema = {}) {
  const ehData = p => p && (p.type === 'date' || p.type === 'datetime' || p.type === 'daterange');
  const achada = Object.values(schema).find(p => ehData(p) && !p.isSystem)
    || schema?.properties?.find?.(ehData);
  return achada?.key || achada?.name || 'data';
}

function parseStart(raw) {
  // Propriedade de período (`daterange`): { start, end, allDay }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.start) {
    const s = parseDateValue(raw.start);
    if (!s) return null;
    const e = parseDateValue(raw.end ?? raw.start);
    return { s, e, allDay: raw.allDay !== false && !s.hasTime, fromRange: true };
  }
  const s = parseDateValue(raw);
  return s ? { s, e: null, allDay: !s.hasTime, fromRange: false } : null;
}

/**
 * @param {Array<Object>} notes
 * @param {Object} cfg  resultado de resolveCalendarConfig (+ date.start já resolvido)
 * @param {(note:Object, prop:string) => any} getValue  ex.: getNotePropertyValue
 * @returns {Array<Object>} eventos ordenados por início
 */
export function buildCalendarEvents(notes, cfg, getValue) {
  const { start: startProp, end: endProp, fallback, defaultDuration } = cfg.date;
  const eventos = [];

  for (const note of notes) {
    let p = parseStart(getValue(note, startProp));
    let fromFallback = false;

    if (!p && fallback && fallback !== startProp) {
      const f = parseDateValue(getValue(note, fallback));
      if (f) { p = { s: { ymd: f.ymd, minutes: null, hasTime: false }, e: null, allDay: true, fromRange: false }; fromFallback = true; }
    }
    if (!p) continue;

    let startYmd = p.s.ymd;
    let startMin = p.allDay ? null : p.s.minutes;
    let endYmd = startYmd;
    let endMin = null;
    let allDay = p.allDay;

    // Fim: o da propriedade de período, ou o da propriedade "fim" escolhida na view
    let fim = p.fromRange ? p.e : (endProp && !fromFallback ? parseDateValue(getValue(note, endProp)) : null);
    if (fim && compareYMD(fim.ymd, startYmd) < 0) fim = null;   // fim antes do início: ignora

    if (allDay) {
      if (fim) endYmd = fim.ymd;
    } else {
      endYmd = startYmd;
      if (fim && fim.hasTime && (compareYMD(fim.ymd, startYmd) > 0 || fim.minutes > startMin)) {
        endYmd = fim.ymd;
        endMin = fim.minutes;
      } else if (fim && !fim.hasTime && compareYMD(fim.ymd, startYmd) > 0) {
        endYmd = fim.ymd;
        endMin = DIA_MIN - 1;
      } else {
        const fimTotal = startMin + defaultDuration;     // sem fim: duração padrão
        if (fimTotal >= DIA_MIN) { endYmd = addDays(startYmd, Math.floor(fimTotal / DIA_MIN)); endMin = fimTotal % DIA_MIN; }
        else endMin = fimTotal;
      }
    }

    eventos.push({
      id: String(note.id),
      note,
      title: note.title || note.titulo || 'Sem título',
      startYmd, startMin, endYmd, endMin, allDay, fromFallback,
      startProp, endProp: endProp || null,
      canResize: !allDay && !!endProp && !fromFallback,
    });
  }

  return eventos.sort((a, b) =>
    compareYMD(a.startYmd, b.startYmd)
    || (a.startMin ?? -1) - (b.startMin ?? -1)
    || a.title.localeCompare(b.title, 'pt-BR'));
}

/** Duração em minutos de um evento com horário. */
export function eventDurationMin(ev) {
  if (ev.allDay) return 0;
  return diffDays(ev.startYmd, ev.endYmd) * DIA_MIN + (ev.endMin - ev.startMin);
}

/** Dias (ymd) que um evento ocupa, do início ao fim. */
export function eventDays(ev) {
  const n = diffDays(ev.startYmd, ev.endYmd);
  return Array.from({ length: n + 1 }, (_, i) => addDays(ev.startYmd, i));
}

/**
 * O que cai em cada dia visível.
 *  - `allDay`: eventos de dia inteiro (inclusive os de vários dias) — vão pra faixa de cima/células;
 *  - `timed`: pedaços de eventos com horário (um evento que atravessa a meia-noite vira dois pedaços).
 * @returns {Map<string, { allDay: Object[], timed: Array<{ ev, startMin, endMin, continuesBefore, continuesAfter }> }>}
 */
export function bucketEventsByDay(eventos, dias) {
  const mapa = new Map(dias.map(d => [d, { allDay: [], timed: [] }]));
  for (const ev of eventos) {
    for (const d of eventDays(ev)) {
      const balde = mapa.get(d);
      if (!balde) continue;
      if (ev.allDay) { balde.allDay.push(ev); continue; }
      balde.timed.push({
        ev,
        startMin: d === ev.startYmd ? ev.startMin : 0,
        endMin: d === ev.endYmd ? ev.endMin : DIA_MIN,
        continuesBefore: d !== ev.startYmd,
        continuesAfter: d !== ev.endYmd,
      });
    }
  }
  return mapa;
}
