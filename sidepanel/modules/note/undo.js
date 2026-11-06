import { renumberLists } from './block-ops.js';
import { getContentEl } from './block-structure.js';
import { setCaretOffset } from './caret.js';
import { refreshChecklistStates } from './checklist.js';
import { S, root } from './state.js';
import { scheduleSave } from './template-mode.js';

export const UNDO_LIMIT = 100;

export function snapshotState() {
  return root.innerHTML;
}

export function pushUndoSnapshot(html) {
  S.undoStack.push(html);
  if (S.undoStack.length > UNDO_LIMIT) S.undoStack.shift();
  S.redoStack = [];
}

export function captureUndoPoint(html = null) {
  clearTimeout(S.typingSnapshotTimer);
  S.pendingTypingSnapshot = null;
  pushUndoSnapshot(html ?? snapshotState());
}

export function captureTypingUndoPoint() {
  if (S.pendingTypingSnapshot === null) {
    S.pendingTypingSnapshot = snapshotState();
    pushUndoSnapshot(S.pendingTypingSnapshot);
  }
  clearTimeout(S.typingSnapshotTimer);
  S.typingSnapshotTimer = setTimeout(() => { S.pendingTypingSnapshot = null; }, 600);
}

export function resetUndoHistory() {
  S.undoStack = [];
  S.redoStack = [];
  S.pendingTypingSnapshot = null;
  clearTimeout(S.typingSnapshotTimer);
}

export function restoreSnapshot(html) {
  root.innerHTML = html;

  // O atributo "checked" do <input> não acompanha sozinho o innerHTML (é uma
  // propriedade viva, não refletida) — sincroniza a partir do data-checked,
  // que é um atributo de verdade e volta certinho.
  root.querySelectorAll('.block-checklist').forEach(block => {
    const cb = block.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = block.dataset.checked === 'true';
  });

  renumberLists();
  refreshChecklistStates();   // o "meio marcado" também é propriedade viva

  const last = root.lastElementChild;
  if (last) {
    const c = getContentEl(last);
    c.focus();
    setCaretOffset(c, c.textContent.length);
  }
  scheduleSave();
}

export function performUndo() {
  if (S.undoStack.length === 0) return;
  S.pendingTypingSnapshot = null;
  clearTimeout(S.typingSnapshotTimer);
  const current = snapshotState();
  const prev = S.undoStack.pop();
  S.redoStack.push(current);
  restoreSnapshot(prev);
}

export function performRedo() {
  if (S.redoStack.length === 0) return;
  const current = snapshotState();
  const next = S.redoStack.pop();
  S.undoStack.push(current);
  restoreSnapshot(next);
}
