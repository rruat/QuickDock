// ── board-arrows.js ──────────────────────────────────────────────────────────
// Motor geométrico de conexões e setas vetoriais (SVG) do Quadro Infinito.
// Suporta retas diretas, curvas de Bézier cúbicas e rotas ortogonais (Manhattan),
// com âncoras explícitas nos quatro lados (top, right, bottom, left).

export function worldRectOf(card) {
  return { left: card.x, right: card.x + card.w, top: card.y, bottom: card.y + card.h };
}

export function sidePointAt(rect, side, frac = 0.5) {
  switch (side) {
    case 'top':    return { x: (rect.left + rect.right) / 2, y: rect.top };
    case 'bottom': return { x: (rect.left + rect.right) / 2, y: rect.bottom };
    case 'left':   return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
    case 'right':  return { x: rect.right, y: (rect.top + rect.bottom) / 2 };
    default:       return null;
  }
}

export function bezierPointAt(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y
  };
}

export function sideTowards(rect, point) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const halfW = (rect.right - rect.left) / 2 || 1;
  const halfH = (rect.bottom - rect.top) / 2 || 1;
  const nx = (point.x - cx) / halfW;
  const ny = (point.y - cy) / halfH;
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? 'right' : 'left';
  return ny > 0 ? 'bottom' : 'top';
}

export function axisDistance(side, p1, p2) {
  return (side === 'left' || side === 'right')
    ? Math.abs(p2.x - p1.x)
    : Math.abs(p2.y - p1.y);
}

export function controlOffset(side, amount) {
  switch (side) {
    case 'top':    return { dx: 0, dy: -amount };
    case 'bottom': return { dx: 0, dy: amount };
    case 'left':   return { dx: -amount, dy: 0 };
    case 'right':  return { dx: amount, dy: 0 };
    default:       return { dx: 0, dy: 0 };
  }
}

export function computeArrowPoints(fromCard, toCard, fromSide = null, toSide = null, lineStyle = 'straight') {
  const r1 = worldRectOf(fromCard);
  const r2 = worldRectOf(toCard);

  const fSide = fromSide || sideTowards(r1, { x: (r2.left + r2.right) / 2, y: (r2.top + r2.bottom) / 2 });
  const tSide = toSide || sideTowards(r2, { x: (r1.left + r1.right) / 2, y: (r1.top + r1.bottom) / 2 });

  const p1 = sidePointAt(r1, fSide);
  const p2 = sidePointAt(r2, tSide);

  if (lineStyle === 'curved') {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const amount = Math.min(120, Math.max(30, dist * 0.4));
    const off1 = controlOffset(fSide, amount);
    const off2 = controlOffset(tSide, amount);
    const c1 = { x: p1.x + off1.dx, y: p1.y + off1.dy };
    const c2 = { x: p2.x + off2.dx, y: p2.y + off2.dy };
    const mid = bezierPointAt(p1, c1, c2, p2, 0.5);
    const path = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    return { p1, p2, c1, c2, mid, path, fromSide: fSide, toSide: tSide };
  }

  if (lineStyle === 'orthogonal') {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    let path = '';
    if (fSide === 'left' || fSide === 'right') {
      path = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    } else {
      path = `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    }
    const mid = { x: midX, y: midY };
    return { p1, p2, mid, path, fromSide: fSide, toSide: tSide };
  }

  // Straight por padrão
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  return { p1, p2, mid, path, fromSide: fSide, toSide: tSide };
}
