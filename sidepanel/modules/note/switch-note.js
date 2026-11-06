import { parseMarkdownToBlocks } from '../blocks.js';
import { getNoteById } from '../storage.js';
import { NO_DETECTION, createBlockEl, createBlockElFrom } from './block-model.js';
import { renumberLists } from './block-ops.js';
import { getContentEl } from './block-structure.js';
import { refreshChecklistStates } from './checklist.js';
import { applyDetectionMarks } from './detection.js';
import { revokeImageURLs } from './images.js';
import { revokeMediaURLs } from './media.js';
import { refreshTocs } from './toc.js';
import { S, root } from './state.js';
import { flushSave } from './template-mode.js';
import { resetUndoHistory } from './undo.js';

export function renderBlocks(blocks) {
  revokeImageURLs();
  revokeMediaURLs();
  root.innerHTML = '';
  for (const b of blocks) root.appendChild(createBlockElFrom(b));
  if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));
  renumberLists();
  refreshChecklistStates();
  refreshTocs();

  for (const block of root.children) {
    if (NO_DETECTION.has(block.dataset.type)) continue;
    applyDetectionMarks(getContentEl(block));
  }

  resetUndoHistory(); // histórico de undo é por nota, não deve vazar de uma pra outra
}

export async function switchToNote(id) {
  await flushSave();
  S.editingTemplate = null;            // trocar de nota abandona o modo modelo
  S.currentNoteId = id;
  const note = await getNoteById(id);
  const blocks = (note?.blocks?.length) ? note.blocks : parseMarkdownToBlocks(note?.content ?? '');
  renderBlocks(blocks);
}
