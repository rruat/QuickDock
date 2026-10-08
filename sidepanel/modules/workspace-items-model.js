// ── workspace-items-model.js ────────────────────────────────────────────────
// Os itens da Base do workspace são NOTAS e QUADROS (espaços infinitos), todos com data
// (padrão do mockup MKP/CAL.HTML). Um quadro vira um "item" com formato de nota para o motor
// de Bases (título, pasta, datas), com id `board-<id>` para nunca colidir com o id numérico
// das notas. PURO — a leitura do banco fica em workspace-items.js.

export const BOARD_ITEM_PREFIX = 'board-';

export const isBoardItemId = id => typeof id === 'string' && id.startsWith(BOARD_ITEM_PREFIX);

/** `board-12` → 12 (ou null se não for id de quadro). */
export function boardIdFromItemId(id) {
  if (!isBoardItemId(id)) return null;
  const n = Number(id.slice(BOARD_ITEM_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

/** Quadro (registro do banco) → item com formato de nota. */
export function boardToItem(board) {
  const updatedAt = board.updatedAt ?? board.createdAt ?? Date.now();
  return {
    id: `${BOARD_ITEM_PREFIX}${board.id}`,
    uid: board.uid ?? null,
    title: board.title || 'Quadro sem título',
    content: '',
    pasta: board.pasta || '',
    color: null,
    icon: 'space_dashboard',
    iconFilled: false,
    titleHidden: false,
    coverUrl: null,
    coverFileId: null,
    properties: {},
    propertyTypes: {},
    propertySelectOptions: {},
    createdAt: board.createdAt ?? updatedAt,
    updatedAt,
    isBoard: true,
    boardId: board.id,
    cardCount: Array.isArray(board.cards) ? board.cards.length : 0,
    arrowCount: Array.isArray(board.arrows) ? board.arrows.length : 0,
  };
}

/** Notas + quadros numa lista só (cada um já com formato de item). */
export const mergeWorkspaceItems = (notes = [], boards = []) => [...notes, ...boards.map(boardToItem)];
