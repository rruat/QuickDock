// ── board-note-live.js ──────────────────────────────────────────────────────
// Ponte entre o Espaço (board-engine.js) e o editor de notas de verdade (note.js):
// um cartão de nota "ao vivo" é a própria nota sendo editada ali dentro, com todos os
// recursos do editor (menu "/", markdown, checklist, tabelas, colar imagem…).
//
// O editor é um só, então o cartão o toma emprestado (ver lendEditorTo em note.js): o
// elemento #note-editor-blocks muda de lugar, vai pro cartão, e volta quando a edição
// acaba. Só existe no app completo (desktop); a página do Espaço em aba cheia não carrega
// note.js e continua abrindo a nota em vez de editar no cartão.

import { lendEditorTo, returnLentEditor, isEditorLent } from '../note.js';
import { root, noteWorkspaceBodyEl } from '../note-state.js';

let marcador = null;   // comentário que guarda o lugar original do editor

function posicaoOriginal() {
  if (!marcador) marcador = document.createComment('editor-emprestado');
  if (!marcador.parentNode && root.parentNode) root.parentNode.insertBefore(marcador, root);
}

export const liveNote = {
  // O mosaico do desktop é onde o empréstimo faz sentido (editor e Espaço lado a lado)
  isAvailable() {
    return document.documentElement.dataset.platform === 'desktop' && !!root;
  },

  isLive() {
    return isEditorLent();
  },

  /**
   * Leva o editor pro `hostEl` com a nota `noteId` carregada.
   * @param {HTMLElement} hostEl
   * @param {number} noteId
   * @param {{ onReturned?: () => void }} [opts] chamado quando o editor volta (por qualquer motivo)
   * @returns {Promise<boolean>}
   */
  async mount(hostEl, noteId, { onReturned } = {}) {
    posicaoOriginal();
    return lendEditorTo(noteId, {
      moveIn: () => {
        hostEl.replaceChildren(root);
        root.classList.add('is-lent');
        noteWorkspaceBodyEl?.classList.add('editor-lent');
      },
      moveBack: () => {
        if (marcador?.parentNode) marcador.replaceWith(root);
        marcador = null;
        root.classList.remove('is-lent');
        noteWorkspaceBodyEl?.classList.remove('editor-lent');
        onReturned?.();
      },
    });
  },

  // renderCards() recria os cartões: o editor muda pro cartão novo sem fechar a edição
  moveTo(hostEl) {
    if (!isEditorLent()) return false;
    hostEl.replaceChildren(root);
    return true;
  },

  unmount() {
    return returnLentEditor();
  },
};
