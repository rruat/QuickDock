// ── timeline-scale.js ───────────────────────────────────────────────────────
// Escala da linha do tempo: dia ↔ pixel, faixa visível, células do cabeçalho — PURO.
// Todas as datas são 'YYYY-MM-DD' LOCAIS (nunca toISOString).

import { addDays, diffDays, startOfWeek, startOfMonth, endOfMonth, addMonths, compareYMD } from '../engine/date-utils.js';

export const TIMELINE_SCALES = {
  day:     { label: 'Dias',       ppd: 44 },
  week:    { label: 'Semanas',    ppd: 18 },
  month:   { label: 'Meses',      ppd: 6 },
  quarter: { label: 'Trimestres', ppd: 2.2 },
  year:    { label: 'Anos',       ppd: 0.8 },
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ymdParts = y => y.split('-').map(Number);
const startOfQuarter = ymd => { const [a, m] = ymdParts(ymd); return `${a}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`; };
const startOfYear = ymd => `${ymdParts(ymd)[0]}-01-01`;
const endOfYear = ymd => `${ymdParts(ymd)[0]}-12-31`;

/** Início da unidade da escala que contém `ymd`. */
export function unitStart(ymd, scale) {
  switch (scale) {
    case 'week': return startOfWeek(ymd, 1);
    case 'month': return startOfMonth(ymd);
    case 'quarter': return startOfQuarter(ymd);
    case 'year': return startOfYear(ymd);
    default: return ymd;
  }
}

/** Último dia da unidade da escala que contém `ymd`. */
export function unitEnd(ymd, scale) {
  switch (scale) {
    case 'week': return addDays(startOfWeek(ymd, 1), 6);
    case 'month': return endOfMonth(ymd);
    case 'quarter': return endOfMonth(addMonths(startOfQuarter(ymd), 2));
    case 'year': return endOfYear(ymd);
    default: return ymd;
  }
}

/**
 * Faixa visível: do início do 1º item ao fim do último, com folga, alinhada à unidade.
 * Sem itens: ao redor de hoje.
 */
export function visibleRange(items, hoje, scale) {
  // hoje sempre cabe (a linha de "hoje" precisa aparecer)
  let ini = hoje, fim = hoje;
  for (const it of items) {
    if (compareYMD(it.startYmd, ini) < 0) ini = it.startYmd;
    if (compareYMD(it.endYmd, fim) > 0) fim = it.endYmd;
  }
  const folga = { day: 7, week: 14, month: 45, quarter: 120, year: 365 }[scale] ?? 14;
  const start = unitStart(addDays(ini, -folga), scale);
  const end = unitEnd(addDays(fim, folga), scale);
  return { start, end, days: diffDays(start, end) + 1 };
}

/** Posição X (px) do início de um dia. */
export const xOf = (ymd, range, ppd) => diffDays(range.start, ymd) * ppd;

/** Dia sob uma posição X (px), limitado à faixa. */
export function ymdAtX(x, range, ppd) {
  const d = Math.max(0, Math.min(range.days - 1, Math.floor(x / ppd)));
  return addDays(range.start, d);
}

/** Barra de um item: left/width em px (largura mínima para o item continuar clicável). */
export function barGeometry(item, range, ppd) {
  const left = xOf(item.startYmd, range, ppd);
  const dias = diffDays(item.startYmd, item.endYmd) + 1;
  return { left, width: Math.max(dias * ppd, Math.min(ppd, 6) + 6) };
}

function cells(range, rotulo, scaleKey) {
  const out = [];
  let d = unitStart(range.start, scaleKey);
  while (compareYMD(d, range.end) <= 0) {
    const fim = unitEnd(d, scaleKey);
    const from = compareYMD(d, range.start) < 0 ? range.start : d;
    const to = compareYMD(fim, range.end) > 0 ? range.end : fim;
    out.push({ label: rotulo(d), from, to, key: d });
    d = addDays(fim, 1);
  }
  return out;
}

/** Cabeçalho em dois níveis: { top:[…], bottom:[…] } — cada célula { label, from, to }. */
export function headerCells(range, scale) {
  const mesAno = d => `${MESES[ymdParts(d)[1] - 1]} ${ymdParts(d)[0]}`;
  switch (scale) {
    case 'day': return { top: cells(range, mesAno, 'month'), bottom: cells(range, d => String(ymdParts(d)[2]), 'day') };
    case 'week': return { top: cells(range, mesAno, 'month'), bottom: cells(range, d => String(ymdParts(d)[2]), 'week') };
    case 'month': return { top: cells(range, d => String(ymdParts(d)[0]), 'year'), bottom: cells(range, d => MESES[ymdParts(d)[1] - 1], 'month') };
    case 'quarter': return { top: cells(range, d => String(ymdParts(d)[0]), 'year'), bottom: cells(range, d => `T${Math.floor((ymdParts(d)[1] - 1) / 3) + 1}`, 'quarter') };
    default: return { top: [], bottom: cells(range, d => String(ymdParts(d)[0]), 'year') };
  }
}

/** Largura (px) de uma célula do cabeçalho. */
export const cellWidth = (cell, ppd) => (diffDays(cell.from, cell.to) + 1) * ppd;
