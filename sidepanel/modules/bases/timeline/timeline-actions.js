// ── timeline-actions.js ─────────────────────────────────────────────────────
// Gestos da linha do tempo (mover a barra, esticar as pontas) → patches de propriedades.
// PURO: reaproveita os formatos do calendário (buildMovePatch/buildResizePatch).

import { addDays, diffDays, compareYMD } from '../engine/date-utils.js';
import { buildMovePatch, buildResizePatch, formatDateValue, isEditableDateProp } from '../calendar/calendar-actions.js';

/** Move o item `delta` dias (mantém a duração). */
export function moveItemPatch(item, delta) {
  if (!delta) return null;
  const ev = item.ev;
  return buildMovePatch(ev, { ymd: addDays(ev.startYmd, delta), minutes: ev.allDay ? null : ev.startMin });
}

/** Muda só o fim para `novoFim` (não antes do início). Exige propriedade "fim" na view. */
export function resizeEndPatch(item, novoFim) {
  const ev = item.ev;
  const fim = compareYMD(novoFim, ev.startYmd) < 0 ? ev.startYmd : novoFim;
  return buildResizePatch(ev, { ymd: fim, minutes: ev.allDay ? null : (ev.endMin ?? ev.startMin) });
}

/** Muda só o início (borda esquerda), com o fim fixo. */
export function resizeStartPatch(item, novoInicio) {
  const ev = item.ev;
  if (!isEditableDateProp(ev.startProp)) return null;
  const ini = compareYMD(novoInicio, ev.endYmd) > 0 ? ev.endYmd : novoInicio;
  const raw = ev.note?.properties?.[ev.startProp];
  const faixa = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.start ? raw : null;
  const valor = formatDateValue(ini, ev.allDay ? null : ev.startMin);
  if (faixa) return { patch: { [ev.startProp]: { ...faixa, start: valor } }, types: {} };
  return { patch: { [ev.startProp]: valor }, types: { [ev.startProp]: ev.allDay ? 'date' : 'datetime' } };
}

/** Quantos dias o ponteiro andou (arredondado para o dia mais próximo). */
export const daysFromPixels = (dx, ppd) => Math.round(dx / ppd);

export { diffDays };
