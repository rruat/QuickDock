// ── manual-order.js ─────────────────────────────────────────────────────────
// Ordem manual (arrastar para reordenar) — PURO. A ordem fica na VIEW (`manualOrder`):
//   { "<escopo>": [ids…] }   escopo = "__all__" (sem grupo) · valor do grupo/coluna · "raia/coluna"
// Não suja as notas e não regrava N notas a cada arrasto (decisão 11.4 do planejamento).

export const ALL_SCOPE = '__all__';

/** Ordem lembrada da view, sempre um mapa escopo → lista de ids (strings). */
export function resolveManualOrder(view = {}) {
  const m = view.manualOrder && typeof view.manualOrder === 'object' && !Array.isArray(view.manualOrder) ? view.manualOrder : {};
  const out = {};
  for (const [k, v] of Object.entries(m)) if (Array.isArray(v)) out[k] = v.map(String);
  return out;
}

/** Quando vale: só sem ordenação por propriedade (ordenar por propriedade "desliga" a manual). */
export const manualOrderActive = view => !(Array.isArray(view?.sort) && view.sort.length);

export const scopeKey = (...partes) => partes.filter(p => p !== null && p !== undefined && p !== '').join('/') || ALL_SCOPE;

/** Notas na ordem lembrada; as que não estão na lista (novas) ficam depois, na ordem original. */
export function applyManualOrder(notes, ids) {
  if (!ids?.length) return notes;
  const pos = new Map(ids.map((id, i) => [String(id), i]));
  const conhecidas = notes.filter(n => pos.has(String(n.id))).sort((a, b) => pos.get(String(a.id)) - pos.get(String(b.id)));
  return [...conhecidas, ...notes.filter(n => !pos.has(String(n.id)))];
}

/**
 * Nova lista de ids depois de mover `movedId` para antes de `beforeId` (null = fim).
 * `currentIds` = ids na ordem em que aparecem agora no escopo (inclui ou não o movido).
 */
export function moveInOrder(currentIds, movedId, beforeId = null) {
  const m = String(movedId), b = beforeId === null || beforeId === undefined ? null : String(beforeId);
  const sem = currentIds.map(String).filter(id => id !== m);
  const i = b === null ? -1 : sem.indexOf(b);
  if (i < 0) return [...sem, m];
  return [...sem.slice(0, i), m, ...sem.slice(i)];
}

/** Id do elemento antes do qual soltar, dado o Y do ponteiro e as caixas (top/height) dos itens. */
export function dropBeforeId(itens, y) {
  for (const it of itens) if (y < it.top + it.height / 2) return it.id;
  return null;
}

/**
 * Como dropBeforeId, mas para grade (galeria): itens com { id, left, top, width, height }.
 * O ponteiro dentro de uma linha decide pelo meio horizontal; acima de uma linha, antes do primeiro dela.
 */
export function dropBeforeIdGrid(itens, x, y) {
  for (const it of itens) {
    if (y < it.top) return it.id;                                  // ponteiro acima desta linha
    if (y <= it.top + it.height && x < it.left + it.width / 2) return it.id;
  }
  return null;
}
