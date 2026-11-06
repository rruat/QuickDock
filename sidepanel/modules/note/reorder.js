import { renumberLists } from './block-ops.js';
import { targetBlocksFor } from './block-selection.js';
import { blockNearestToY } from './handle.js';
import { S, indicator, noteEditorEl } from './state.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export function startBlockReorderDrag(block) {
  const targets = targetBlocksFor(block);
  const indicator = document.createElement('div');
  indicator.className = 'block-drop-indicator';
  indicator.hidden = true;
  noteEditorEl.appendChild(indicator);
  targets.forEach(b => b.classList.add('block-dragging'));
  document.body.style.cursor = 'grabbing';
  S.reorderState = { targets, indicator, dropTarget: null, dropBefore: true };
}

export function updateBlockReorderDrag(e) {
  if (!S.reorderState) return;
  const { targets, indicator } = S.reorderState;
  const closest = blockNearestToY(e.clientY, targets);
  S.reorderState.dropTarget = closest;

  if (!closest) { indicator.hidden = true; return; }

  const rect = closest.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  S.reorderState.dropBefore = before;

  const containerRect = noteEditorEl.getBoundingClientRect();
  indicator.style.top = `${(before ? rect.top : rect.bottom) - containerRect.top}px`;
  indicator.hidden = false;
}

export function finishBlockReorderDrag() {
  if (!S.reorderState) return;
  const { targets, indicator, dropTarget, dropBefore } = S.reorderState;

  targets.forEach(b => b.classList.remove('block-dragging'));
  indicator.remove();
  document.body.style.cursor = '';

  if (dropTarget) {
    captureUndoPoint();
    if (dropBefore) {
      targets.forEach(b => dropTarget.before(b));
    } else {
      let anchor = dropTarget;
      for (const b of targets) { anchor.after(b); anchor = b; }
    }
    renumberLists();
    scheduleSave();
  }

  S.reorderState = null;
}
