// ── calendar-nav.js ─────────────────────────────────────────────────────────
// Navegação do calendário das Bases — PURO: qual intervalo de dias cada modo mostra,
// pra onde "anterior/próximo" leva e como o período se chama (pt-BR).

import {
  addDays, addMonths, weekDates, monthMatrix, weekdayOf, isoWeekNumber, parseDateValue,
} from '../engine/date-utils.js';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const partes = ymd => { const [y, m, d] = ymd.split('-').map(Number); return { y, m: m - 1, d }; };

/**
 * @param {'month'|'week'|'day'|'agenda'} mode
 * @param {string} anchor ymd âncora (qualquer dia do período)
 * @param {{ week: { firstDay:number, showWeekends:boolean } }} cfg
 * @returns {{ days: string[], weeks?: string[][], title: string }}
 */
export function visibleRange(mode, anchor, cfg) {
  const { firstDay, showWeekends } = cfg.week;

  if (mode === 'day') {
    return { days: [anchor], title: titleForDay(anchor) };
  }

  if (mode === 'week') {
    const days = weekDates(anchor, firstDay, { showWeekends });
    return { days, title: titleForSpan(days[0], days[days.length - 1]) };
  }

  if (mode === 'agenda') {
    const days = Array.from({ length: 14 }, (_, i) => addDays(anchor, i));
    return { days, title: titleForSpan(days[0], days[days.length - 1]) };
  }

  // month
  const weeks = monthMatrix(anchor, firstDay).map(sem =>
    showWeekends ? sem : sem.filter(d => { const w = weekdayOf(d); return w !== 0 && w !== 6; }));
  const { y, m } = partes(anchor);
  return { days: weeks.flat(), weeks, title: `${cap(MESES[m])} de ${y}` };
}

/** Âncora depois de "anterior" (-1) / "próximo" (+1). */
export function shiftAnchor(mode, anchor, direction) {
  if (mode === 'month') return addMonths(anchor, direction);
  if (mode === 'week') return addDays(anchor, 7 * direction);
  if (mode === 'agenda') return addDays(anchor, 14 * direction);
  return addDays(anchor, direction);
}

export function titleForDay(ymd) {
  const { y, m, d } = partes(ymd);
  return `${cap(DIAS_SEMANA[weekdayOf(ymd)])}, ${d} de ${MESES[m]} de ${y}`;
}

/** "5 – 11 de outubro de 2026" · "28 de set – 4 de out de 2026" · "29 de dez de 2026 – 4 de jan de 2027". */
export function titleForSpan(inicio, fim) {
  const a = partes(inicio), b = partes(fim);
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} de ${MESES[a.m]} de ${a.y}`;
  if (a.y === b.y) return `${a.d} de ${MESES_ABREV[a.m]} – ${b.d} de ${MESES_ABREV[b.m]} de ${a.y}`;
  return `${a.d} de ${MESES_ABREV[a.m]} de ${a.y} – ${b.d} de ${MESES_ABREV[b.m]} de ${b.y}`;
}

export function weekNumberOf(ymd) {
  return isoWeekNumber(ymd);
}

/** Âncora válida a partir de qualquer valor (volta pra hoje se vier lixo). */
export function sanitizeAnchor(valor, hoje) {
  const p = parseDateValue(valor);
  return p ? p.ymd : hoje;
}
