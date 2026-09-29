// ── board-snapping.js ────────────────────────────────────────────────────────
// Sistema de alinhamento inteligente magnético (Smart Snapping & Guide Lines)
// estilo Canva/Figma para o Quadro Infinito. Calcula aproximação com bordas
// e centros de cartões vizinhos e desenha as guias com pontos de precisão.

export const SNAP_THRESHOLD = 8;
let hasSnappedHaptic = false;

export function computeSnapping(card, rawX, rawY, currentCards, selectedIds) {
  let snappedX = rawX;
  let snappedY = rawY;
  const guideLines = [];

  const myLeft = rawX;
  const myCenterX = rawX + card.w / 2;
  const myRight = rawX + card.w;

  const myTop = rawY;
  const myCenterY = rawY + card.h / 2;
  const myBottom = rawY + card.h;

  let minDiffX = Infinity;
  let targetX = null;
  let lineX = null;
  let refCardX = null;

  let minDiffY = Infinity;
  let targetY = null;
  let lineY = null;
  let refCardY = null;

  for (const other of currentCards) {
    if (other.id === card.id || selectedIds.has(other.id)) continue;
    const oLeft = other.x;
    const oCenterX = other.x + other.w / 2;
    const oRight = other.x + other.w;
    const oTop = other.y;
    const oCenterY = other.y + other.h / 2;
    const oBottom = other.y + other.h;

    const xChecks = [
      { my: myLeft, target: oLeft, pos: oLeft, line: oLeft },
      { my: myCenterX, target: oCenterX, pos: oCenterX - card.w / 2, line: oCenterX },
      { my: myRight, target: oRight, pos: oRight - card.w, line: oRight },
      { my: myLeft, target: oRight, pos: oRight, line: oRight },
      { my: myRight, target: oLeft, pos: oLeft - card.w, line: oLeft }
    ];

    for (const c of xChecks) {
      const diff = Math.abs(c.my - c.line);
      if (diff <= SNAP_THRESHOLD && diff < minDiffX) {
        minDiffX = diff;
        targetX = c.pos;
        lineX = c.line;
        refCardX = other;
      }
    }

    const yChecks = [
      { my: myTop, target: oTop, pos: oTop, line: oTop },
      { my: myCenterY, target: oCenterY, pos: oCenterY - card.h / 2, line: oCenterY },
      { my: myBottom, target: oBottom, pos: oBottom - card.h, line: oBottom },
      { my: myTop, target: oBottom, pos: oBottom, line: oBottom },
      { my: myBottom, target: oTop, pos: oTop - card.h, line: oTop }
    ];

    for (const c of yChecks) {
      const diff = Math.abs(c.my - c.line);
      if (diff <= SNAP_THRESHOLD && diff < minDiffY) {
        minDiffY = diff;
        targetY = c.pos;
        lineY = c.line;
        refCardY = other;
      }
    }
  }

  if (targetX !== null) {
    snappedX = targetX;
    const startY = Math.min(snappedY, refCardX ? refCardX.y : snappedY) - 24;
    const endY = Math.max(snappedY + card.h, refCardX ? refCardX.y + refCardX.h : snappedY + card.h) + 24;
    guideLines.push({ type: 'v', val: lineX, start: startY, end: endY });
  }
  if (targetY !== null) {
    snappedY = targetY;
    const startX = Math.min(snappedX, refCardY ? refCardY.x : snappedX) - 24;
    const endX = Math.max(snappedX + card.w, refCardY ? refCardY.x + refCardY.w : snappedX + card.w) + 24;
    guideLines.push({ type: 'h', val: lineY, start: startX, end: endX });
  }

  if (targetX !== null || targetY !== null) {
    if (!hasSnappedHaptic) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
      hasSnappedHaptic = true;
    }
  } else {
    hasSnappedHaptic = false;
  }

  return { x: Math.round(snappedX), y: Math.round(snappedY), guideLines };
}

export function renderGuideLines(guideLines, guidesGroup, svgNs) {
  if (!guidesGroup) return;
  guidesGroup.innerHTML = '';
  if (!guideLines || guideLines.length === 0) return;
  for (const g of guideLines) {
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('class', 'board-guide-line');
    const x1 = g.type === 'v' ? g.val : (g.start ?? -20000);
    const y1 = g.type === 'v' ? (g.start ?? -20000) : g.val;
    const x2 = g.type === 'v' ? g.val : (g.end ?? 20000);
    const y2 = g.type === 'v' ? (g.end ?? 20000) : g.val;

    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    guidesGroup.appendChild(line);

    // Pontos visuais de precisão nos extremos estilo Canva
    if (g.start != null && g.end != null) {
      const d1 = document.createElementNS(svgNs, 'circle');
      d1.setAttribute('class', 'board-guide-dot');
      d1.setAttribute('cx', String(x1));
      d1.setAttribute('cy', String(y1));
      d1.setAttribute('r', '3');
      guidesGroup.appendChild(d1);

      const d2 = document.createElementNS(svgNs, 'circle');
      d2.setAttribute('class', 'board-guide-dot');
      d2.setAttribute('cx', String(x2));
      d2.setAttribute('cy', String(y2));
      d2.setAttribute('r', '3');
      guidesGroup.appendChild(d2);
    }
  }
}

export function clearGuideLines(guidesGroup) {
  if (guidesGroup) guidesGroup.innerHTML = '';
  hasSnappedHaptic = false;
}
