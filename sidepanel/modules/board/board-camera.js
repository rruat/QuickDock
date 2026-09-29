// ── board-camera.js ──────────────────────────────────────────────────────────
// Motor de câmera e transformações de coordenadas (Tela ↔ Mundo Canvas)
// do Quadro Infinito, com suporte a zoom focal no cursor e ajuste automático.

export function screenToWorld(screenX, screenY, viewport, containerRect) {
  const rect = containerRect || { left: 0, top: 0 };
  return {
    x: (screenX - rect.left - viewport.x) / viewport.zoom,
    y: (screenY - rect.top - viewport.y) / viewport.zoom
  };
}

export function worldToScreen(worldX, worldY, viewport, containerRect) {
  const rect = containerRect || { left: 0, top: 0 };
  return {
    x: worldX * viewport.zoom + viewport.x + rect.left,
    y: worldY * viewport.zoom + viewport.y + rect.top
  };
}

export function computeZoomBy(viewport, factor, cx, cy, minZoom = 0.15, maxZoom = 3.0) {
  const newZoom = Math.max(minZoom, Math.min(maxZoom, viewport.zoom * factor));
  const newX = cx - (cx - viewport.x) * (newZoom / viewport.zoom);
  const newY = cy - (cy - viewport.y) * (newZoom / viewport.zoom);
  return { x: newX, y: newY, zoom: newZoom };
}

export function computeFitAll(cards, containerWidth, containerHeight) {
  if (!cards || cards.length === 0) {
    return { x: containerWidth / 2, y: containerHeight / 2, zoom: 1 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cards) {
    if (c.x < minX) minX = c.x;
    if (c.x + c.w > maxX) maxX = c.x + c.w;
    if (c.y < minY) minY = c.y;
    if (c.y + c.h > maxY) maxY = c.y + c.h;
  }

  const boundingW = Math.max(100, maxX - minX + 160);
  const boundingH = Math.max(100, maxY - minY + 160);

  const scale = Math.max(0.25, Math.min(1.2, Math.min(containerWidth / boundingW, containerHeight / boundingH)));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: containerWidth / 2 - centerX * scale,
    y: containerHeight / 2 - centerY * scale,
    zoom: scale
  };
}
