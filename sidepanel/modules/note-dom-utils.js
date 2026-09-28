// Utilitários puros de cursor/seleção/offset de texto dentro de um bloco.
// Usados por praticamente todo o resto de note.js — sem estado próprio, só
// dependem do container raiz do editor (note-state.js).
import { root } from './note-state.js';

// ── Cursor / offsets de texto dentro de um bloco ──────────────────────────────
export function pointAtOffset(contentEl, offset) {
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  let node, acc = 0, last = null;
  while ((node = walker.nextNode())) {
    last = node;
    const len = node.data.length;
    if (acc + len >= offset) return { node, offset: offset - acc };
    acc += len;
  }
  if (last) return { node: last, offset: last.data.length };
  return { node: contentEl, offset: 0 };
}

export function rangeFromOffsets(contentEl, start, end) {
  const a = pointAtOffset(contentEl, start);
  const b = pointAtOffset(contentEl, end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

export function getCaretOffset(contentEl) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!contentEl.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(contentEl);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

export function setCaretOffset(contentEl, offset) {
  const p = pointAtOffset(contentEl, offset);
  const range = document.createRange();
  range.setStart(p.node, p.offset);
  range.collapse(true);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Posição do cursor na tela. Um Range colapsado bem na borda de uma linha às
// vezes devolve um retângulo de tamanho zero — cai pro retângulo do elemento
// em volta, que ao menos existe de verdade.
export function caretViewportRect(sel) {
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const el = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    if (el) rect = el.getBoundingClientRect();
  }
  return rect;
}

export function getContentEl(blockEl) {
  return blockEl.querySelector(':scope > .block-content') || blockEl;
}

export function getBlockFromNode(node) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== root && !el.classList?.contains('block')) el = el.parentElement;
  return el === root ? null : el;
}

export function currentBlock() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return getBlockFromNode(sel.anchorNode);
}

export function focusBlockStart(block) {
  const content = getContentEl(block);
  content.focus();
  setCaretOffset(content, 0);
}
