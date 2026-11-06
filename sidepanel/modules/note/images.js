import { loadFileBlob, saveFile } from '../storage.js';
import { NO_TEXT_TYPES, createBlockEl, createBlockElFrom } from './block-model.js';
import { currentBlock, renumberLists } from './block-ops.js';
import { blockDepth, getContentEl } from './block-structure.js';
import { setCaretOffset } from './caret.js';
import { S, root } from './state.js';
import { focusCell } from './table.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export const imageURLs = new Map();

export function revokeImageURLs() {
  for (const url of imageURLs.values()) URL.revokeObjectURL(url);
  imageURLs.clear();
}

export function loadInlineImage(imgEl, fileId) {
  const cached = imageURLs.get(fileId);
  if (cached) { imgEl.src = cached; return; }

  loadFileBlob(fileId).then(blob => {
    if (!blob) {
      imgEl.closest('.block-image')?.classList.add('block-image-missing');
      return;
    }
    const url = URL.createObjectURL(blob);
    // A nota pode ter mudado enquanto o banco respondia. Sem esta checagem, a
    // URL nova ficaria presa num elemento que já saiu da tela.
    if (!root.contains(imgEl)) { URL.revokeObjectURL(url); return; }
    imageURLs.set(fileId, url);
    imgEl.src = url;
  });
}

export function setImageData(el, { fileId, alt }) {
  const img = el.querySelector('img');
  if (alt) el.dataset.alt = alt;
  else delete el.dataset.alt;
  if (img) img.alt = alt ?? '';
  if (fileId != null && Number.isFinite(Number(fileId))) {
    el.dataset.fileId = String(fileId);
    if (img) loadInlineImage(img, Number(fileId));
  }
}

export function buildImageTools() {
  const bar = document.createElement('div');
  bar.className = 'image-tools';
  bar.contentEditable = 'false';
  const acts = [
    ['to-docs', 'Mover p/ Documentos', 'Tirar da nota e guardar na seção Documentos', 'image-btn-accent'],
    ['replace', 'Trocar',  'Trocar por outra imagem'],
    ['alt',     'Texto',   'Descrever a imagem (texto alternativo)'],
    ['remove',  'Remover', 'Remover a imagem da nota'],
  ];
  for (const [act, label, title, extra] of acts) {
    const btn = document.createElement('button');
    btn.className   = `image-btn ${extra ?? ''}`.trim();
    btn.dataset.act = act;
    btn.textContent = label;
    btn.title       = title;
    bar.appendChild(btn);
  }
  return bar;
}

export function dataUrlToFile(dataUrl, alt) {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl ?? '');
  if (!m) return null;
  const [, mime, base64, dados] = m;
  try {
    let bytes;
    if (base64) {
      const bin = atob(dados);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(dados));
    }
    const ext  = ({ jpeg: 'jpg' }[mime.split('/')[1]] ?? mime.split('/')[1] ?? 'png');
    const nome = `${(alt || 'imagem').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40)}.${ext}`;
    return new File([bytes], nome, { type: mime });
  } catch {
    return null;   // base64 truncado num .md editado à mão
  }
}

export async function absorbDataUrls(blocks, noteId = undefined) {
  if (!blocks.some(b => b.type === 'image' && b.dataUrl)) return blocks;

  const destino = noteId === undefined ? S.currentNoteId : noteId;
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'image' || !b.dataUrl) { out.push(b); continue; }
    const file = dataUrlToFile(b.dataUrl, b.alt);
    if (!file) { out.push({ ...b, dataUrl: undefined }); continue; }
    const fileId = await saveFile(file, destino, { inline: true });
    out.push({ type: 'image', alt: b.alt, fileId, depth: b.depth, quoted: b.quoted });
  }
  return out;
}

export async function insertImageFile(file, atBlock) {
  const fileId = await saveFile(file, S.currentNoteId, { inline: true });
  const bloco  = atBlock ?? currentBlock() ?? root.lastElementChild;
  if (!bloco) return null;

  captureUndoPoint();
  const el = createBlockElFrom({ type: 'image', fileId, alt: '', depth: blockDepth(bloco) });

  const vazio = !NO_TEXT_TYPES.has(bloco.dataset.type)
    && !getContentEl(bloco).textContent.trim();
  if (vazio) bloco.replaceWith(el);
  else bloco.after(el);

  // Sempre deixa uma linha logo abaixo: senão não há onde continuar a escrever
  // quando a imagem é o último bloco da nota.
  if (!el.nextElementSibling) el.after(createBlockEl('paragraph'));
  focusBlockEnd(el.nextElementSibling);
  renumberLists();
  scheduleSave();
  return el;
}

export function focusBlockEnd(block) {
  if (!block) return;
  if (block.dataset.type === 'table') {
    focusCell(block.querySelector('.table-cell'));
    return;
  }
  // Divisor e imagem não recebem cursor: o destino é a linha seguinte, e se
  // não houver uma, cria.
  if (NO_TEXT_TYPES.has(block.dataset.type)) {
    let next = block.nextElementSibling;
    if (!next || NO_TEXT_TYPES.has(next.dataset.type)) {
      next = createBlockEl('paragraph');
      block.after(next);
    }
    focusBlockEnd(next);
    return;
  }
  const content = getContentEl(block);
  content.focus();
  setCaretOffset(content, content.textContent.length);
}
