// ── timeline-deps.js ────────────────────────────────────────────────────────
// Dependências entre itens da linha do tempo (etapa 2) — PURO.
// A propriedade escolhida lista os PREDECESSORES de cada nota ("depende de": [[Tarefa A]]).
// Seta: fim do predecessor → início da nota. Conflito: a nota começa antes do predecessor acabar.

import { addDays, diffDays, compareYMD } from '../engine/date-utils.js';

const norm = s => String(s ?? '').trim().toLowerCase();
const tituloDeLink = v => String(v ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();

/** @returns {Array<{ from:string, to:string }>} ids (do item) — predecessor → sucessor */
export function resolveDependencies(items, getValue, prop) {
  if (!prop) return [];
  const porTitulo = new Map(items.map(i => [norm(i.title), i]));
  const arestas = [];
  const vistas = new Set();
  for (const it of items) {
    const bruto = getValue(it.note, prop);
    const lista = Array.isArray(bruto) ? bruto : bruto ? String(bruto).split(',') : [];
    for (const t of lista) {
      const pred = porTitulo.get(norm(tituloDeLink(t)));
      if (!pred || pred.id === it.id) continue;
      const k = `${pred.id}>${it.id}`;
      if (!vistas.has(k)) { vistas.add(k); arestas.push({ from: pred.id, to: it.id }); }
    }
  }
  return arestas;
}

/** Aresta em conflito: o sucessor começa antes (ou no mesmo dia em que) o predecessor termina. */
export function isConflict(pred, succ) {
  return compareYMD(succ.startYmd, pred.endYmd) <= 0;
}

/**
 * Caminho ortogonal da seta entre duas barras. Cada barra: { left, width, row } (px; `row` = índice
 * da linha). rowTops[i] = y do topo da linha i; rowH = altura da barra (centro vertical = top + rowH/2).
 */
export function routeArrow(a, b, rowTops, rowH = 32) {
  const x0 = a.left + a.width, y0 = rowTops[a.row] + rowH / 2;
  const x1 = b.left, y1 = rowTops[b.row] + rowH / 2;
  const r = 6;
  if (x1 - x0 >= 2 * r + 4) {                        // sucessor começa depois: degrau suave
    const meio = x0 + Math.max(r, (x1 - x0) / 2);
    return `M ${x0} ${y0} H ${meio} V ${y1} H ${x1}`;
  }
  // sucessor começa antes do fim do predecessor: contorna pela esquerda da barra de destino
  const xv = Math.min(x1, x0) - 10;
  const yMeio = y1 > y0 ? y1 - rowH / 2 : y1 + rowH / 2;
  return `M ${x0} ${y0} H ${x0 + 8} V ${yMeio} H ${xv} V ${y1} H ${x1}`;
}

/**
 * Reagendamento em cascata: depois de um item mudar de posição, empurra os sucessores que ficaram
 * em conflito (mantendo a duração de cada um) e os sucessores deles. Nunca puxa para trás.
 * @param {Array} items  { id, startYmd, endYmd }
 * @param {Array} edges  { from, to }
 * @param {Record<string,{startYmd:string,endYmd:string}>} changes  novas datas já aplicadas
 * @returns {Record<string, number>} id → dias a mover (só quem precisa)
 */
export function cascadeShifts(items, edges, changes) {
  const pos = new Map(items.map(i => [i.id, { startYmd: i.startYmd, endYmd: i.endYmd }]));
  for (const [id, v] of Object.entries(changes)) pos.set(id, { ...v });
  const sucessores = new Map();
  for (const e of edges) { if (!sucessores.has(e.from)) sucessores.set(e.from, []); sucessores.get(e.from).push(e.to); }

  const deslocamento = {};
  const fila = Object.keys(changes);
  let passos = 0;
  while (fila.length && passos++ < 5000) {                // limite contra ciclos
    const id = fila.shift();
    const p = pos.get(id);
    for (const s of sucessores.get(id) || []) {
      const q = pos.get(s);
      if (!q || changes[s]) continue;                      // quem a pessoa moveu agora não é empurrado
      const exigido = addDays(p.endYmd, 1);
      if (compareYMD(q.startYmd, exigido) >= 0) continue;
      const delta = diffDays(q.startYmd, exigido);
      deslocamento[s] = (deslocamento[s] || 0) + delta;
      pos.set(s, { startYmd: addDays(q.startYmd, delta), endYmd: addDays(q.endYmd, delta) });
      if (deslocamento[s] > 3650) return deslocamento;     // ciclo que nunca converge
      fila.push(s);
    }
  }
  return deslocamento;
}
