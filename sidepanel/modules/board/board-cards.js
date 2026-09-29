// ── board-cards.js ──────────────────────────────────────────────────────────
// Gestão, ciclo de vida e operações em lote de cartões no Quadro Infinito.
// Inclui alinhamento automático estilo Canva/Obsidian, cálculo de bounds para
// agrupamento e renderização da barra de ferramentas flutuante de seleção.

/**
 * Alinha um conjunto de cartões conforme o tipo solicitado.
 * Modifica as propriedades x ou y dos cartões diretamente.
 * @param {Array<Object>} cards Lista de cartões a alinhar
 * @param {'left'|'center-h'|'right'|'top'|'center-v'|'bottom'} type Tipo de alinhamento
 */
export function alignCards(cards, type) {
  if (!Array.isArray(cards) || cards.length <= 1) return;

  if (type === 'left') {
    const minX = Math.min(...cards.map(c => c.x));
    cards.forEach(c => { c.x = minX; });
  } else if (type === 'center-h') {
    const avgX = cards.reduce((acc, c) => acc + (c.x + (c.w || 220) / 2), 0) / cards.length;
    cards.forEach(c => { c.x = Math.round(avgX - (c.w || 220) / 2); });
  } else if (type === 'right') {
    const maxRight = Math.max(...cards.map(c => c.x + (c.w || 220)));
    cards.forEach(c => { c.x = maxRight - (c.w || 220); });
  } else if (type === 'top') {
    const minY = Math.min(...cards.map(c => c.y));
    cards.forEach(c => { c.y = minY; });
  } else if (type === 'center-v') {
    const avgY = cards.reduce((acc, c) => acc + (c.y + (c.h || 120) / 2), 0) / cards.length;
    cards.forEach(c => { c.y = Math.round(avgY - (c.h || 120) / 2); });
  } else if (type === 'bottom') {
    const maxBottom = Math.max(...cards.map(c => c.y + (c.h || 120)));
    cards.forEach(c => { c.y = maxBottom - (c.h || 120); });
  }
}

/**
 * Calcula os limites (bounding box) de um conjunto de cartões com espaçamento (padding).
 * @param {Array<Object>} cards
 * @param {Object} padding
 * @returns {{ x: number, y: number, w: number, h: number }|null}
 */
export function computeGroupBounds(cards, { padX = 24, padTop = 38, padBottom = 24 } = {}) {
  const eligibleCards = cards.filter(c => c && c.type !== 'group');
  if (eligibleCards.length === 0) return null;

  const minX = Math.min(...eligibleCards.map(c => c.x));
  const maxX = Math.max(...eligibleCards.map(c => c.x + (c.w || 220)));
  const minY = Math.min(...eligibleCards.map(c => c.y));
  const maxY = Math.max(...eligibleCards.map(c => c.y + (c.h || 120)));

  return {
    x: Math.round(minX - padX),
    y: Math.round(minY - padTop),
    w: Math.round((maxX - minX) + padX * 2),
    h: Math.round((maxY - minY) + padTop + padBottom)
  };
}

/**
 * Cria a estrutura de dados de um cartão de grupo contornando os cartões fornecidos.
 * @param {Array<Object>} cards
 * @param {string} label
 * @returns {Object|null}
 */
export function createGroupCardFromCards(cards, label = 'Novo Grupo') {
  const bounds = computeGroupBounds(cards);
  if (!bounds) return null;

  return {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    type: 'group',
    label,
    text: '',
    color: null
  };
}

/**
 * Monta o HTML interno da barra de ferramentas de seleção múltipla.
 * @param {number} count Quantidade de cartões selecionados
 * @returns {string}
 */
export function renderSelectionToolbarHtml(count) {
  return `
    <span style="font-size:11.5px;font-weight:600;color:var(--text-muted);padding:0 6px;">${count} selecionado${count > 1 ? 's' : ''}</span>
    <div class="board-toolbar-divider"></div>
    <div class="board-align-dropdown">
      <button type="button" class="board-toolbar-btn btn-toolbar-align" title="Alinhar cartões">
        <span class="qd-icon material-symbols-rounded">format_align_center</span>
        <span>Alinhar</span>
      </button>
      <div class="board-align-menu" hidden>
        <button type="button" class="board-align-item" data-align="left">
          <span class="qd-icon material-symbols-rounded">align_horizontal_left</span>
          <span>Esquerda</span>
        </button>
        <button type="button" class="board-align-item" data-align="center-h">
          <span class="qd-icon material-symbols-rounded">align_horizontal_center</span>
          <span>Centro H</span>
        </button>
        <button type="button" class="board-align-item" data-align="right">
          <span class="qd-icon material-symbols-rounded">align_horizontal_right</span>
          <span>Direita</span>
        </button>
        <div style="height:1px;background:var(--border);margin:2px 0;"></div>
        <button type="button" class="board-align-item" data-align="top">
          <span class="qd-icon material-symbols-rounded">align_vertical_top</span>
          <span>Topo</span>
        </button>
        <button type="button" class="board-align-item" data-align="center-v">
          <span class="qd-icon material-symbols-rounded">align_vertical_center</span>
          <span>Centro V</span>
        </button>
        <button type="button" class="board-align-item" data-align="bottom">
          <span class="qd-icon material-symbols-rounded">align_vertical_bottom</span>
          <span>Base</span>
        </button>
      </div>
    </div>
    <button type="button" class="board-toolbar-btn btn-toolbar-group" title="Criar grupo em torno dos selecionados">
      <span class="qd-icon material-symbols-rounded">crop_square</span>
      <span>Agrupar</span>
    </button>
    <button type="button" class="board-toolbar-btn btn-toolbar-color" title="Alterar cor de todos">
      <span class="qd-icon material-symbols-rounded">palette</span>
      <span>Cor</span>
    </button>
    <div class="board-toolbar-divider"></div>
    <button type="button" class="board-toolbar-btn is-danger btn-toolbar-delete" title="Excluir selecionados">
      <span class="qd-icon material-symbols-rounded">delete</span>
      <span>Excluir</span>
    </button>
  `;
}

/**
 * Retorna o rótulo do handle do cartão dependendo do tipo/forma.
 * @param {Object} card
 * @param {Array<Object>} flowchartShapes
 * @returns {string}
 */
export function getCardHandleLabel(card, flowchartShapes = []) {
  const tipo = card.type || 'text';
  if (tipo === 'group') return card.label || 'Grupo';
  if (tipo === 'image') return '⠿ Imagem';
  if (tipo === 'note') return '⠿ Nota';
  if (card.shape && card.shape !== 'rectangle' && card.shape !== 'process') {
    const s = flowchartShapes.find(it => it.id === card.shape);
    if (s) return `⠿ ${s.label}`;
  }
  return '⠿ Cartão';
}

/**
 * Aplica uma cor em lote aos cartões selecionados.
 * @param {Array<Object>} cards
 * @param {Set<string>} selectedIds
 * @param {string} color
 */
export function batchApplyColor(cards, selectedIds, color) {
  for (const card of cards) {
    if (selectedIds.has(card.id)) {
      card.color = (color === 'default') ? null : color;
    }
  }
}

