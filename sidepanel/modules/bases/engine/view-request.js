// ── view-request.js ─────────────────────────────────────────────────────────
// Pedidos de FORA do painel de Bases (aside esquerda do shell) para o painel dedicado:
// "abrir esta view" e "criar uma view nova". O painel (bases-view-container.js) escuta os
// eventos; se a Base ainda não estiver montada, o pedido fica guardado e vale na montagem.
// Sem DOM além do CustomEvent — fácil de testar.

export const EVT_SELECT_VIEW = 'quickdock:bases-select-view';
export const EVT_ADD_VIEW = 'quickdock:bases-add-view';
export const EVT_SET_TYPE = 'quickdock:bases-set-view-type';
export const EVT_SETTINGS_OPEN = 'quickdock:view-settings-open';
export const EVT_SETTINGS_CLOSED = 'quickdock:view-settings-closed';

let pending = null; // { baseNoteId, viewId }

/** Guarda a view a abrir quando a Base dessa nota for montada. */
export function requestBaseView(baseNoteId, viewId) {
  pending = { baseNoteId, viewId };
}

/**
 * Consome o pedido guardado se ele for desta Base e a view ainda existir.
 * @returns {string|null} id da view a ativar
 */
export function takePendingView(baseNoteId, views = []) {
  if (!pending || pending.baseNoteId !== baseNoteId) return null;
  const { viewId } = pending;
  pending = null;
  return views.some(v => v.id === viewId) ? viewId : null;
}

/** Base já montada: troca de view na hora. */
export function requestSelectViewNow(viewId) {
  document.dispatchEvent(new CustomEvent(EVT_SELECT_VIEW, { detail: { viewId } }));
}

/** Base já montada: cria uma view nova do tipo pedido e ativa. */
export function requestAddView(type = 'table') {
  document.dispatchEvent(new CustomEvent(EVT_ADD_VIEW, { detail: { type } }));
}
/** Base já montada: troca o TIPO da view ativa (calendário → tabela…), mantendo nome e filtros. */
export function requestSetViewType(type) {
  document.dispatchEvent(new CustomEvent(EVT_SET_TYPE, { detail: { type } }));
}

/** Abre/fecha o painel de configurações da view (que mora na aside direita do shell). */
export function requestViewSettings(open) {
  document.dispatchEvent(new CustomEvent(EVT_SETTINGS_OPEN, { detail: { open: !!open } }));
}