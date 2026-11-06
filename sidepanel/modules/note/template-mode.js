import { blocksToMarkdown, blocksToMarkdownForExport, parseMarkdownToBlocks } from '../blocks.js';
import { loadFileBlob, updateNoteBlocksById } from '../storage.js';
import { focusBlockStart } from './block-ops.js';
import { absorbDataUrls } from './images.js';
import { flushRescan } from './rescan.js';
import { serializeBlocks, showSaved } from './save.js';
import { S, root } from './state.js';
import { renderBlocks } from './switch-note.js';
import { resetUndoHistory } from './undo.js';
import { refreshTocs } from './toc.js';

export function isEditingTemplate() { return !!S.editingTemplate; }

export async function openTemplateInEditor(tpl) {
  await flushSave();                 // grava a nota que estava aberta
  S.editingTemplate = { id: tpl.id };
  renderBlocks(await absorbDataUrls(parseMarkdownToBlocks(tpl.content ?? '')));
  resetUndoHistory();
  focusBlockStart(root.firstElementChild);
}

export function currentTemplateMarkdown() {
  return blocksToMarkdown(serializeBlocks());
}

export async function blocksToExportMarkdown(blocks) {
  return blocksToMarkdownForExport(blocks, async fileId => {
    const blob = await loadFileBlob(fileId);
    if (!blob) return null;
    return new Promise(resolve => {
      const leitor = new FileReader();
      leitor.onload  = () => resolve(leitor.result);
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  });
}

export function clearTemplateEditing() { S.editingTemplate = null; }

export function scheduleSave() {
  if (S.editingTemplate) return;
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(flushSave, 800);
}

export async function flushSave() {
  clearTimeout(S.saveTimer);
  flushRescan();
  if (S.editingTemplate || S.currentNoteId == null) return;
  refreshTocs();
  const blocks = serializeBlocks();
  // Markdown completo (não só texto simples) — é o que permite recuperar
  // negrito/itálico/etc. se a nota precisar ser reconstruída a partir desse
  // campo (fallback de portabilidade).
  const content = blocksToMarkdown(blocks);
  await updateNoteBlocksById(S.currentNoteId, blocks, content);
  showSaved();
}

export async function clearCurrentNote() {
  clearTimeout(S.saveTimer);
  renderBlocks(parseMarkdownToBlocks(''));
  await flushSave();
}
