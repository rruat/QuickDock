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

export function getOrthogonalWaypoints(p1, p2, fromSide, toSide, r1, r2) {
  const margin = 28;

  // Caso 1: Lados iguais (ex: os dois conectam na direita)
  if (fromSide === 'right' && toSide === 'right') {
    const outX = Math.max(r1.right, r2.right) + margin;
    return [
      { x: p1.x, y: p1.y },
      { x: outX, y: p1.y },
      { x: outX, y: p2.y },
      { x: p2.x, y: p2.y }
    ];
  }
  if (fromSide === 'left' && toSide === 'left') {
    const outX = Math.min(r1.left, r2.left) - margin;
    return [
      { x: p1.x, y: p1.y },
      { x: outX, y: p1.y },
      { x: outX, y: p2.y },
      { x: p2.x, y: p2.y }
    ];
  }
  if (fromSide === 'top' && toSide === 'top') {
    const outY = Math.min(r1.top, r2.top) - margin;
    return [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: outY },
      { x: p2.x, y: outY },
      { x: p2.x, y: p2.y }
    ];
  }
  if (fromSide === 'bottom' && toSide === 'bottom') {
    const outY = Math.max(r1.bottom, r2.bottom) + margin;
    return [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: outY },
      { x: p2.x, y: outY },
      { x: p2.x, y: p2.y }
    ];
  }

  // Caso 2: Direita -> Esquerda
  if (fromSide === 'right' && toSide === 'left') {
    if (p2.x >= p1.x + 16) {
      if (Math.abs(p1.y - p2.y) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midX = (p1.x + p2.x) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: midX, y: p1.y },
        { x: midX, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outX1 = r1.right + margin;
      const outX2 = r2.left - margin;
      const routeY = (p1.y < p2.y)
        ? (Math.max(r1.bottom, r2.bottom) + margin)
        : (Math.min(r1.top, r2.top) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: outX1, y: p1.y },
        { x: outX1, y: routeY },
        { x: outX2, y: routeY },
        { x: outX2, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 3: Esquerda -> Direita
  if (fromSide === 'left' && toSide === 'right') {
    if (p1.x >= p2.x + 16) {
      if (Math.abs(p1.y - p2.y) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midX = (p1.x + p2.x) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: midX, y: p1.y },
        { x: midX, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outX1 = r1.left - margin;
      const outX2 = r2.right + margin;
      const routeY = (p1.y < p2.y)
        ? (Math.max(r1.bottom, r2.bottom) + margin)
        : (Math.min(r1.top, r2.top) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: outX1, y: p1.y },
        { x: outX1, y: routeY },
        { x: outX2, y: routeY },
        { x: outX2, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 4: Baixo -> Topo
  if (fromSide === 'bottom' && toSide === 'top') {
    if (p2.y >= p1.y + 16) {
      if (Math.abs(p1.x - p2.x) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midY = (p1.y + p2.y) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: midY },
        { x: p2.x, y: midY },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outY1 = r1.bottom + margin;
      const outY2 = r2.top - margin;
      const routeX = (p1.x < p2.x)
        ? (Math.max(r1.right, r2.right) + margin)
        : (Math.min(r1.left, r2.left) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: outY1 },
        { x: routeX, y: outY1 },
        { x: routeX, y: outY2 },
        { x: p2.x, y: outY2 },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 5: Topo -> Baixo
  if (fromSide === 'top' && toSide === 'bottom') {
    if (p1.y >= p2.y + 16) {
      if (Math.abs(p1.x - p2.x) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midY = (p1.y + p2.y) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: midY },
        { x: p2.x, y: midY },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outY1 = r1.top - margin;
      const outY2 = r2.bottom + margin;
      const routeX = (p1.x < p2.x)
        ? (Math.max(r1.right, r2.right) + margin)
        : (Math.min(r1.left, r2.left) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: outY1 },
        { x: routeX, y: outY1 },
        { x: routeX, y: outY2 },
        { x: p2.x, y: outY2 },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 6: Roteamento em L simples (padrão quando os eixos são perpendiculares)
  if (fromSide === 'left' || fromSide === 'right') {
    return [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p1.y },
      { x: p2.x, y: p2.y }
    ];
  } else {
    return [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: p2.y },
      { x: p2.x, y: p2.y }
    ];
  }
}

export function waypointsToSvgPath(points, radius = 12) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const vIn = { x: curr.x - prev.x, y: curr.y - prev.y };
    const vOut = { x: next.x - curr.x, y: next.y - curr.y };
    const lenIn = Math.hypot(vIn.x, vIn.y);
    const lenOut = Math.hypot(vOut.x, vOut.y);

    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    if (r < 1) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const startX = curr.x - (vIn.x / lenIn) * r;
    const startY = curr.y - (vIn.y / lenIn) * r;
    const endX = curr.x + (vOut.x / lenOut) * r;
    const endY = curr.y + (vOut.y / lenOut) * r;

    d += ` L ${startX} ${startY} Q ${curr.x} ${curr.y}, ${endX} ${endY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function waypointPathMidpoint(points) {
  if (points.length <= 2) {
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  }
  let totalLen = 0;
  const lens = [];
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lens.push(l);
    totalLen += l;
  }
  const target = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    if (acc + lens[i] >= target) {
      const segFrac = (target - acc) / (lens[i] || 1);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * segFrac,
        y: points[i].y + (points[i + 1].y - points[i].y) * segFrac
      };
    }
    acc += lens[i];
  }
  return { x: points[1].x, y: points[1].y };
}

export function calculateArrowEndpoints(c1, c2, arrow = {}) {
  const r1 = worldRectOf(c1);
  const r2 = worldRectOf(c2);
  const fromSide = arrow.fromSide || sideTowards(r1, { x: (r2.left + r2.right) / 2, y: (r2.top + r2.bottom) / 2 });
  const toSide = arrow.toSide || sideTowards(r2, { x: (r1.left + r1.right) / 2, y: (r1.top + r1.bottom) / 2 });
  const p1 = sidePointAt(r1, fromSide);
  const p2 = sidePointAt(r2, toSide);
  return { r1, r2, fromSide, toSide, p1, p2 };
}

export function generateArrowPathD(p1, p2, fromSide, toSide, r1, r2, lineStyle = 'straight') {
  if (lineStyle === 'curved') {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const amount = Math.min(120, Math.max(30, dist * 0.4));
    const off1 = controlOffset(fromSide, amount);
    const off2 = controlOffset(toSide, amount);
    const c1 = { x: p1.x + off1.dx, y: p1.y + off1.dy };
    const c2 = { x: p2.x + off2.dx, y: p2.y + off2.dy };
    const path = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    const mid = bezierPointAt(p1, c1, c2, p2, 0.5);
    return { path, mid };
  }

  const waypoints = getOrthogonalWaypoints(p1, p2, fromSide, toSide, r1, r2);
  const path = (waypoints.length <= 2)
    ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
    : waypointsToSvgPath(waypoints, 12);
  const mid = waypointPathMidpoint(waypoints);
  return { path, mid, waypoints };
}
