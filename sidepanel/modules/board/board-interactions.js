// ── board-interactions.js ───────────────────────────────────────────────────
// Gerenciador de interações de ponteiro, seleção por caixa (Marquee Box Selection)
// e navegação espacial (Pan e gestos) para o Quadro Infinito.

/**
 * Calcula os limites no espaço do mundo de uma caixa de seleção a partir
 * de dois pontos do canvas.
 * @param {{ x: number, y: number }} startWorld
 * @param {{ x: number, y: number }} currWorld
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, w: number, h: number }}
 */
export function computeMarqueeBounds(startWorld, currWorld) {
  const minX = Math.min(startWorld.x, currWorld.x);
  const maxX = Math.max(startWorld.x, currWorld.x);
  const minY = Math.min(startWorld.y, currWorld.y);
  const maxY = Math.max(startWorld.y, currWorld.y);
  return {
    minX,
    maxX,
    minY,
    maxY,
    w: maxX - minX,
    h: maxY - minY
  };
}

/**
 * Encontra todos os cartões que intersectam uma caixa de seleção (AABB intersection).
 * @param {Array<Object>} cards
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @returns {Array<string>} Lista de IDs dos cartões intersectados
 */
export function getCardsIntersectingBox(cards, bounds) {
  if (!Array.isArray(cards) || !bounds) return [];
  const { minX, maxX, minY, maxY } = bounds;

  const intersectingIds = [];
  for (const card of cards) {
    const cardW = card.w || 220;
    const cardH = card.h || 120;
    const cardRight = card.x + cardW;
    const cardBottom = card.y + cardH;

    const intersects = (minX < cardRight && maxX > card.x && minY < cardBottom && maxY > card.y);
    if (intersects) {
      intersectingIds.push(card.id);
    }
  }
  return intersectingIds;
}

/**
 * Atualiza as coordenadas e dimensões do elemento visual da caixa de seleção.
 * @param {HTMLElement} boxEl
 * @param {{ minX: number, minY: number, w: number, h: number }} bounds
 */
export function updateMarqueeBoxElement(boxEl, bounds) {
  if (!boxEl || !bounds) return;
  boxEl.style.left = `${bounds.minX}px`;
  boxEl.style.top = `${bounds.minY}px`;
  boxEl.style.width = `${bounds.w}px`;
  boxEl.style.height = `${bounds.h}px`;
}

/**
 * Redefine e oculta o elemento visual da caixa de seleção.
 * @param {HTMLElement} boxEl
 */
export function resetMarqueeBoxElement(boxEl) {
  if (!boxEl) return;
  boxEl.setAttribute('hidden', '');
  boxEl.style.width = '0px';
  boxEl.style.height = '0px';
}

/**
 * Verifica se um target de clique de ponteiro pertence ao fundo do quadro
 * (área livre do canvas navegável por pan).
 * @param {EventTarget} target
 * @param {HTMLElement} container
 * @param {SVGElement} svgLayer
 * @param {SVGElement} guidesGroup
 * @param {SVGElement} arrowsGroup
 * @returns {boolean}
 */
export function isCanvasBackgroundTarget(target, container, svgLayer, guidesGroup, arrowsGroup) {
  return target === container || target === svgLayer || target === guidesGroup || target === arrowsGroup;
}
