// ── board-thumb.js ──────────────────────────────────────────────────────────
// Miniatura de um quadro (padrão do mockup: boardThumb()) — PURA: recebe os cartões e as setas
// já "leves" (x, y, w, h, cor) e devolve o texto de um SVG. Sem fundo próprio: serve sobre o
// fundo claro e o escuro da galeria. Cores em OKLCH, com o matiz do cartão (docs/PADRAO-DE-CORES-OKLCH.md).

const HUES = { red: 25, orange: 48, yellow: 86, green: 150, blue: 260, indigo: 277, violet: 304 };
const MAX_CARDS = 60; // a miniatura é leve: quadros enormes mostram só os primeiros cartões
const W = 160, H = 100, PAD = 8;

const fmt = n => Math.round(n * 10) / 10;

/** Reduz cartão/seta do quadro ao necessário para a miniatura (vai dentro do item da lista). */
export function lightBoard(cards = [], arrows = []) {
  return {
    cards: cards.slice(0, MAX_CARDS).map(c => ({ id: c.id, x: +c.x || 0, y: +c.y || 0, w: +c.w || 200, h: +c.h || 100, color: c.color || null })),
    arrows: arrows.map(a => ({ from: a.from, to: a.to })),
  };
}

function paint(color) {
  const h = HUES[color];
  return h === undefined
    ? { fill: 'oklch(60% 0 0 / 0.22)', stroke: 'oklch(55% 0 0 / 0.7)' }
    : { fill: `oklch(70% 0.13 ${h} / 0.5)`, stroke: `oklch(58% 0.15 ${h})` };
}

/** SVG da miniatura; quadro vazio devolve um SVG sem retângulos. */
export function boardThumbSvg(thumb) {
  const cards = thumb?.cards || [];
  const head = `<svg class="board-thumb" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
  if (!cards.length) return `${head}</svg>`;

  const minX = Math.min(...cards.map(c => c.x)), minY = Math.min(...cards.map(c => c.y));
  const maxX = Math.max(...cards.map(c => c.x + c.w)), maxY = Math.max(...cards.map(c => c.y + c.h));
  const k = Math.min((W - PAD * 2) / Math.max(1, maxX - minX), (H - PAD * 2) / Math.max(1, maxY - minY));
  const ox = (W - (maxX - minX) * k) / 2 - minX * k;
  const oy = (H - (maxY - minY) * k) / 2 - minY * k;
  const at = new Map(cards.map(c => [c.id, { x: c.x * k + ox, y: c.y * k + oy, w: c.w * k, h: c.h * k }]));

  const lines = (thumb.arrows || []).map(a => {
    const p = at.get(a.from), q = at.get(a.to);
    if (!p || !q) return '';
    return `<line x1="${fmt(p.x + p.w / 2)}" y1="${fmt(p.y + p.h / 2)}" x2="${fmt(q.x + q.w / 2)}" y2="${fmt(q.y + q.h / 2)}" stroke="oklch(55% 0 0 / 0.65)" stroke-width="1"/>`;
  }).join('');
  const rects = cards.map(c => {
    const r = at.get(c.id), { fill, stroke } = paint(c.color);
    return `<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  }).join('');
  return `${head}${lines}${rects}</svg>`;
}
