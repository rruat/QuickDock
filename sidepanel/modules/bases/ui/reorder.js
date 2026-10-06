// ── reorder.js ──────────────────────────────────────────────────────────────
// Arrastar para reordenar itens de uma lista (lista, galeria, feed, tabela): grava a ordem
// manual na view (engine/manual-order.js). A ordem por propriedade fica desligada a partir daí.

import { moveInOrder, dropBeforeId, dropBeforeIdGrid, scopeKey, manualOrderActive } from '../engine/manual-order.js';

/**
 * @param {HTMLElement} box  contêiner dos itens
 * @param {{ itemSelector:string, scope:string, view:Object, onViewChange?:Function, grid?:boolean }} o  (grid: itens em várias colunas, como a galeria)
 * Cada item precisa de `data-note-id`.
 */
export function enableReorder(box, { itemSelector, scope = scopeKey(), view, onViewChange, grid = false }) {
  if (!onViewChange || !manualOrderActive(view)) return;
  let arrastado = null;
  const itens = () => [...box.querySelectorAll(itemSelector)];

  for (const it of itens()) {
    it.draggable = true;
    it.classList.add('is-reorderable');
    it.addEventListener('dragstart', e => {
      arrastado = it.dataset.noteId;
      it.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', arrastado);
    });
    it.addEventListener('dragend', () => {
      arrastado = null;
      it.classList.remove('is-dragging');
      box.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    });
  }

  const alvoDe = e => {
    const outros = itens().filter(i => i.dataset.noteId !== arrastado).map(i => { const r = i.getBoundingClientRect(); return { id: i.dataset.noteId, left: r.left, top: r.top, width: r.width, height: r.height, el: i }; });
    const antes = grid ? dropBeforeIdGrid(outros, e.clientX, e.clientY) : dropBeforeId(outros, e.clientY);
    return { outros, antes };
  };

  box.addEventListener('dragover', e => {
    if (arrastado === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { outros, antes } = alvoDe(e);
    box.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    const alvo = outros.find(o => o.id === antes);
    if (alvo) alvo.el.classList.add('drop-before');
    else if (outros.length) outros[outros.length - 1].el.classList.add('drop-after');
  });

  box.addEventListener('drop', e => {
    if (arrastado === null) return;
    e.preventDefault();
    const { outros, antes } = alvoDe(e);
    const ids = moveInOrder(outros.map(o => o.id), arrastado, antes);
    onViewChange({ manualOrder: { [scope]: ids }, sort: undefined });
  });
}
