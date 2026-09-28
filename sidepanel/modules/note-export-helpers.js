// Helpers genéricos de exportação/download de blocos, usados pela toolbar
// mobile e pelo menu de contexto de bloco.
import { getContentEl } from './note-dom-utils.js';
import { NO_TEXT_TYPES, getSelectedBlockElements } from './note.js';

export function downloadTextFile(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getSuggestedBlockFilename(blocks, defaultName = 'nota') {
  const alvos = blocks && blocks.length > 0 ? blocks : getSelectedBlockElements();
  const text = alvos
    .filter(b => !NO_TEXT_TYPES.has(b.dataset.type))
    .map(b => getContentEl(b)?.textContent?.trim())
    .find(Boolean) ?? defaultName;
  return text.slice(0, 30).replace(/[\\/:*?"<>|]+/g, '-').trim() || defaultName;
}
