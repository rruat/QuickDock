// ── calendar-layout.js ──────────────────────────────────────────────────────
// Layout do calendário das Bases — PURO (sem DOM). Calcula posições; quem desenha é o DOM.

import { compareYMD, diffDays } from '../engine/date-utils.js';

export const DIA_MIN = 1440;

/** Arredonda `min` pro múltiplo de `snap` mais próximo. */
export function snapMinutes(min, snap) {
  return Math.round(min / snap) * snap;
}

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

/**
 * Eventos sobrepostos no mesmo dia dividem a largura (como no Google Agenda / Notion).
 * Agrupa em "clusters" (cadeias de eventos que se tocam) e dá a cada evento uma coluna;
 * a largura de cada um é 1 / (nº de colunas do cluster).
 * Mexe nos pedaços: acrescenta `col` e `cols`.
 * @param {Array<{startMin:number,endMin:number}>} pedacos
 */
export function layoutOverlaps(pedacos) {
  const ordenados = [...pedacos].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  let cluster = [];
  let fimDoCluster = -Infinity;

  const fecha = () => {
    const cols = cluster.reduce((m, p) => Math.max(m, p.col + 1), 1);
    for (const p of cluster) p.cols = cols;
    cluster = [];
  };

  for (const p of ordenados) {
    if (cluster.length && p.startMin >= fimDoCluster) { fecha(); fimDoCluster = -Infinity; }
    // primeira coluna livre (nenhum evento do cluster que ocupe a coluna termina depois do início)
    let col = 0;
    while (cluster.some(q => q.col === col && q.endMin > p.startMin)) col++;
    p.col = col;
    cluster.push(p);
    fimDoCluster = Math.max(fimDoCluster, p.endMin);
  }
  if (cluster.length) fecha();
  return ordenados;
}

/** Posição vertical (em %) de um intervalo dentro da janela [dayStart, dayEnd] do dia. */
export function verticalBox(startMin, endMin, dayStart, dayEnd, minHeightMin = 15) {
  const total = dayEnd - dayStart;
  const s = clamp(startMin, dayStart, dayEnd);
  const e = clamp(Math.max(endMin, startMin + minHeightMin), dayStart, dayEnd);
  return { top: ((s - dayStart) / total) * 100, height: Math.max(((e - s) / total) * 100, (minHeightMin / total) * 100) };
}

/** O pedaço está (pelo menos em parte) dentro da janela visível do dia? */
export function isInWindow(startMin, endMin, dayStart, dayEnd) {
  return endMin > dayStart && startMin < dayEnd;
}

/**
 * Faixa "dia inteiro": coloca cada evento numa linha (lane) e calcula de qual coluna a
 * qual coluna ele se estende dentro dos dias visíveis. Eventos de vários dias viram uma
 * barra contínua; `cutLeft/cutRight` indicam que o evento continua fora da janela.
 * @param {Array<Object>} eventos  eventos de dia inteiro
 * @param {string[]} dias  ymds visíveis, em ordem
 * @returns {Array<{ ev, colStart:number, colEnd:number, lane:number, cutLeft:boolean, cutRight:boolean }>}
 */
export function layoutAllDay(eventos, dias) {
  if (!dias.length) return [];
  const primeiro = dias[0], ultimo = dias[dias.length - 1];
  const barras = [];

  for (const ev of eventos) {
    if (compareYMD(ev.endYmd, primeiro) < 0 || compareYMD(ev.startYmd, ultimo) > 0) continue;
    const ini = compareYMD(ev.startYmd, primeiro) < 0 ? primeiro : ev.startYmd;
    const fim = compareYMD(ev.endYmd, ultimo) > 0 ? ultimo : ev.endYmd;
    // índice da coluna: com fins de semana ocultos os dias não são consecutivos
    const colStart = Math.max(0, dias.findIndex(d => compareYMD(d, ini) >= 0));
    let colEnd = dias.length - 1;
    for (let i = dias.length - 1; i >= 0; i--) { if (compareYMD(dias[i], fim) <= 0) { colEnd = i; break; } }
    if (colEnd < colStart) continue;
    barras.push({
      ev, colStart, colEnd, lane: 0,
      cutLeft: compareYMD(ev.startYmd, primeiro) < 0,
      cutRight: compareYMD(ev.endYmd, ultimo) > 0,
    });
  }

  // lanes: primeira linha onde nenhuma barra ocupa as mesmas colunas
  barras.sort((a, b) => a.colStart - b.colStart || (b.colEnd - b.colStart) - (a.colEnd - a.colStart));
  const ocupado = [];   // lane → colEnd da última barra
  for (const b of barras) {
    let lane = 0;
    while (ocupado[lane] !== undefined && ocupado[lane] >= b.colStart) lane++;
    b.lane = lane;
    ocupado[lane] = b.colEnd;
  }
  return barras;
}

/** Dias entre dois ymds (inclusivo) — usado pra "span" de eventos no mês. */
export function spanDays(startYmd, endYmd) {
  return diffDays(startYmd, endYmd) + 1;
}
