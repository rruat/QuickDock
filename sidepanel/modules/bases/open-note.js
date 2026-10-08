// ── open-note.js ────────────────────────────────────────────────────────────
// Abrir uma nota a partir de uma Base: usa o mesmo caminho do calendário, do grafo e dos
// backlinks (evento `quickdock:activate-note`), que ativa a aba, troca para a tela de notas e,
// no celular, vai para o editor. Chamar só `switchToNote` (note.js) trocava o editor por baixo
// mas deixava a tela da Base aberta — a nota "não abria".

import { isDesktopMode } from '../platform.js';
import { switchView } from '../views.js';
import { normalizeNoteId } from './engine/note-id.js';
import { isBoardItemId, boardIdFromItemId } from '../workspace-items-model.js';

export function openNoteFromBase(noteId, uid = null) {
  // Quadro (espaço infinito): abre o quadro, não o editor de notas
  if (isBoardItemId(noteId)) {
    document.dispatchEvent(new CustomEvent('quickdock:open-board', { detail: { id: boardIdFromItemId(noteId) } }));
    return;
  }
  document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: normalizeNoteId(noteId), uid } }));
  if (!isDesktopMode()) switchView('editor');
}
