import { t as tr } from '../i18n.js';
// Áudio e vídeo na nota (blocos "audio" e "video"). Segue o mesmo caminho da
// imagem: o arquivo fica no banco de arquivos (saveFile / loadFileBlob) e o bloco
// guarda só o fileId. Na versão desktop o formato do arquivo é quickdock:audio/<id>
// e quickdock:video/<id>, lidos e escritos por blocks.js.
import { loadFileBlob, saveFile } from '../storage.js';
import { NO_TEXT_TYPES, createBlockEl, createBlockElFrom } from './block-model.js';
import { currentBlock, renumberLists } from './block-ops.js';
import { blockDepth, getContentEl } from './block-structure.js';
import { focusBlockEnd } from './images.js';
import { S, root } from './state.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export const MEDIA_TYPES = new Set(['audio', 'video']);

const mediaURLs = new Map(); // fileId → objectURL

export function revokeMediaURLs() {
  for (const url of mediaURLs.values()) URL.revokeObjectURL(url);
  mediaURLs.clear();
}

export function loadInlineMedia(mediaEl, fileId) {
  const cached = mediaURLs.get(fileId);
  if (cached) { mediaEl.src = cached; return; }

  loadFileBlob(fileId).then(blob => {
    if (!blob) {
      mediaEl.closest('.block-media')?.classList.add('block-media-missing');
      return;
    }
    const url = URL.createObjectURL(blob);
    // A nota pode ter mudado enquanto o banco respondia: não prende a URL num elemento que saiu da tela.
    if (!root.contains(mediaEl)) { URL.revokeObjectURL(url); return; }
    mediaURLs.set(fileId, url);
    mediaEl.src = url;
  });
}

export function setMediaData(el, { fileId, alt }) {
  const media = el.querySelector('audio, video');
  if (alt) el.dataset.alt = alt;
  else delete el.dataset.alt;
  if (fileId != null && Number.isFinite(Number(fileId))) {
    el.dataset.fileId = String(fileId);
    el.classList.remove('block-media-missing');
    if (media) loadInlineMedia(media, Number(fileId));
  } else {
    delete el.dataset.fileId;
    el.classList.add('block-media-missing');
  }
}

export function buildMediaTools() {
  const bar = document.createElement('div');
  bar.className = 'image-tools';
  bar.contentEditable = 'false';
  const btn = document.createElement('button');
  btn.className = 'image-btn';
  btn.dataset.act = 'remove-media';
  btn.textContent = tr('Remover');
  btn.title = tr('Remover da nota');
  bar.appendChild(btn);
  return bar;
}

// Elemento vazio do bloco de mídia; o arquivo entra depois, com setMediaData.
export function buildMediaEl(type) {
  const el = document.createElement('div');
  el.className = `block block-media block-${type}`;
  el.contentEditable = 'false';
  const media = document.createElement(type);
  media.controls = true;
  media.preload = 'metadata';
  el.append(media, buildMediaTools());
  return el;
}

// ── Escolha do arquivo ──────────────────────────────────────────────────────

const mediaPicker = document.createElement('input');
mediaPicker.type = 'file';
mediaPicker.hidden = true;
document.body.appendChild(mediaPicker);

let pendingMedia = null; // { tipo, inserirEm }

export function pedirMidia(intent) {
  pendingMedia = intent;
  mediaPicker.accept = intent.tipo === 'video' ? 'video/*' : 'audio/*';
  mediaPicker.value = '';
  mediaPicker.click();
}

mediaPicker.addEventListener('change', async () => {
  const file = mediaPicker.files?.[0];
  mediaPicker.value = '';
  const intent = pendingMedia;
  pendingMedia = null;
  if (!file || !intent) return;
  if (!file.type.startsWith(`${intent.tipo}/`)) return;
  await insertMediaFile(intent.tipo, file, intent.inserirEm);
});

export async function insertMediaFile(tipo, file, atBlock) {
  const fileId = await saveFile(file, S.currentNoteId, { inline: true });
  const bloco = atBlock ?? currentBlock() ?? root.lastElementChild;
  if (!bloco) return null;

  captureUndoPoint();
  const el = createBlockElFrom({ type: tipo, fileId, alt: '', depth: blockDepth(bloco) });

  const vazio = !NO_TEXT_TYPES.has(bloco.dataset.type) && !getContentEl(bloco).textContent.trim();
  if (vazio) bloco.replaceWith(el);
  else bloco.after(el);

  if (!el.nextElementSibling) el.after(createBlockEl('paragraph'));
  focusBlockEnd(el.nextElementSibling);
  renumberLists();
  scheduleSave();
  return el;
}

// Botão Remover da barra do bloco de mídia.
root.addEventListener('mousedown', e => {
  if (!e.target.closest('.block-media .image-btn')) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

root.addEventListener('click', e => {
  const btn = e.target.closest('.block-media .image-btn[data-act="remove-media"]');
  if (!btn) return;
  const bloco = btn.closest('.block-media');
  e.stopPropagation();
  captureUndoPoint();
  const seguinte = bloco.nextElementSibling ?? bloco.previousElementSibling;
  bloco.remove();
  if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));
  focusBlockEnd(seguinte ?? root.lastElementChild);
  renumberLists();
  scheduleSave();
});
