// ── note-history.js ──────────────────────────────────────────────────────────
// Gerenciamento de histórico próprio de Undo e Redo para o editor de blocos.
// O undo nativo do navegador só entende edição de texto simples — ele não
// sabe desfazer as trocas de tipo de bloco (viram elementos novos via
// replaceWith), então precisa de um histórico próprio por nota.

const UNDO_LIMIT = 100;
let undoStack = [];
let redoStack = [];
let pendingTypingSnapshot = null;
let typingSnapshotTimer = null;

let _callbacks = {
  getRoot: () => null,
  renumberLists: () => {},
  refreshChecklistStates: () => {},
  getContentEl: (el) => el,
  setCaretOffset: () => {},
  scheduleSave: () => {},
};

export function initNoteHistory(callbacks) {
  _callbacks = { ..._callbacks, ...callbacks };
}

export function getUndoStackLength() {
  return undoStack.length;
}

export function getRedoStackLength() {
  return redoStack.length;
}

export function snapshotState() {
  const root = _callbacks.getRoot();
  return root ? root.innerHTML : '';
}

function pushUndoSnapshot(html) {
  undoStack.push(html);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
}

// Chama antes de qualquer mudança estrutural (conversão de tipo, enter,
// backspace, colar, divisor…) — captura o estado imediatamente anterior.
export function captureUndoPoint(html = null) {
  clearTimeout(typingSnapshotTimer);
  pendingTypingSnapshot = null;
  pushUndoSnapshot(html ?? snapshotState());
}

// Para digitação contínua: grava só um ponto no início de cada "rajada" de
// teclas (debounce), não a cada caractere.
export function captureTypingUndoPoint() {
  if (pendingTypingSnapshot === null) {
    pendingTypingSnapshot = snapshotState();
    pushUndoSnapshot(pendingTypingSnapshot);
  }
  clearTimeout(typingSnapshotTimer);
  typingSnapshotTimer = setTimeout(() => {
    pendingTypingSnapshot = null;
  }, 600);
}

export function resetUndoHistory() {
  undoStack = [];
  redoStack = [];
  pendingTypingSnapshot = null;
  clearTimeout(typingSnapshotTimer);
}

function restoreSnapshot(html) {
  const root = _callbacks.getRoot();
  if (!root) return;

  root.innerHTML = html;

  // Sincroniza checked nos checkboxes
  root.querySelectorAll('.block-checklist').forEach(block => {
    const cb = block.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = block.dataset.checked === 'true';
  });

  _callbacks.renumberLists();
  _callbacks.refreshChecklistStates();

  const last = root.lastElementChild;
  if (last) {
    const c = _callbacks.getContentEl(last);
    if (c) {
      c.focus();
      _callbacks.setCaretOffset(c, c.textContent.length);
    }
  }
  _callbacks.scheduleSave();
}

export function performUndo() {
  if (undoStack.length === 0) return;
  pendingTypingSnapshot = null;
  clearTimeout(typingSnapshotTimer);
  const current = snapshotState();
  const prev = undoStack.pop();
  redoStack.push(current);
  restoreSnapshot(prev);
}

export function performRedo() {
  if (redoStack.length === 0) return;
  const current = snapshotState();
  const next = redoStack.pop();
  undoStack.push(current);
  restoreSnapshot(next);
}
