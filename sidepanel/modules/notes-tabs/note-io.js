import { buildBackup } from '../backup.js';
import { blocksToMarkdown, parseMarkdownToBlocks } from '../blocks.js';
import { absorbDataUrls, blocksToExportMarkdown, flushSave, getCurrentBlocks } from '../note.js';
import { createNoteRecord, getNoteById, updateNoteBlocksById } from '../storage.js';
import { S } from './state.js';

export async function getBlocksForNote(meta) {
  if (meta.id === S.activeId) {
    await flushSave();
    return getCurrentBlocks();
  }
  const note = await getNoteById(meta.id);
  return (note?.blocks?.length) ? note.blocks : parseMarkdownToBlocks(note?.content ?? '');
}

export async function createNoteFromMarkdown(title, md) {
  const brutos = parseMarkdownToBlocks(md);
  const id     = await createNoteRecord({ title, content: '', blocks: [] });
  const blocks = await absorbDataUrls(brutos, id);
  await updateNoteBlocksById(id, blocks, blocksToMarkdown(blocks));
  S.notesMeta.push({ id, title, color: null, icon: null, updatedAt: Date.now() });
  return id;
}

export function safeFilename(title) {
  return (title || 'nota').replace(/[\\/:*?"<>|]/g, '_').trim() || 'nota';
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAllNotes() {
  await flushSave();

  const notas = [];
  for (const meta of S.notesMeta) {
    notas.push({ title: meta.title, md: await blocksToExportMarkdown(await getBlocksForNote(meta)) });
  }

  const carimbo = new Date().toISOString().slice(0, 10);
  downloadText(`quickdock-backup-${carimbo}.md`, buildBackup(notas));
}
