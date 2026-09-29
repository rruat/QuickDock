// ── note-media.js ────────────────────────────────────────────────────────────
// Manipulação de mídia (imagens, áudio, vídeo) no editor de blocos.
// Gerencia Blobs locais sob demanda, URLs de objeto com revogação automática,
// redimensionamento interativo e drag & drop de arquivos de imagem no editor.

import { saveFile, loadFileBlob, deleteFileRecord } from '../storage.js';
import { createIcon } from '../icons.js';

const imageURLs = new Map(); // fileId → objectURL
let imageResolver = null;

let _callbacks = {
  getRoot: () => null,
  getCurrentNoteId: () => null,
  captureUndoPoint: () => {},
  scheduleSave: () => {},
  createBlockEl: (type, html, checked, rows, media) => null,
  renumberLists: () => {},
};

export function initNoteMedia(callbacks) {
  _callbacks = { ..._callbacks, ...callbacks };
}

export function setImageResolver(fn) {
  imageResolver = fn;
}

export function revokeImageURLs() {
  for (const url of imageURLs.values()) URL.revokeObjectURL(url);
  imageURLs.clear();
}

export function loadInlineMedia(mediaEl, fileId) {
  const cached = imageURLs.get(fileId);
  if (cached) {
    mediaEl.src = cached;
    return;
  }

  loadFileBlob(fileId).then(blob => {
    if (!blob) {
      mediaEl.closest('.block')?.classList.add('block-image-missing');
      return;
    }
    const url = URL.createObjectURL(blob);
    const root = _callbacks.getRoot();
    if (root && !root.contains(mediaEl)) {
      URL.revokeObjectURL(url);
      return;
    }
    imageURLs.set(fileId, url);
    mediaEl.src = url;
  });
}

export function aplicarTamanhoImagem(el, width, height) {
  const frame = el.querySelector('.image-frame');
  const img   = el.querySelector('img');
  if (!frame || !img) return;

  if (width && Number.isFinite(Number(width))) {
    el.dataset.width   = String(width);
    frame.style.width  = `${width}px`;
    img.style.maxWidth = 'none';
  } else {
    delete el.dataset.width;
    frame.style.width  = '';
    img.style.maxWidth = '';
  }

  if (height && Number.isFinite(Number(height))) {
    el.dataset.height   = String(height);
    frame.style.height  = `${height}px`;
    img.style.maxHeight = 'none';
  } else {
    delete el.dataset.height;
    frame.style.height  = '';
    img.style.maxHeight = '';
  }
}

export function setImageData(el, { fileId, alt, dataUrl, imagePath, src, width, height }) {
  const img = el.querySelector('img');
  if (alt) el.dataset.alt = alt;
  else delete el.dataset.alt;
  if (img) img.alt = alt ?? '';
  aplicarTamanhoImagem(el, width, height);

  if (fileId != null && Number.isFinite(Number(fileId))) {
    el.dataset.fileId = String(fileId);
    delete el.dataset.imagePath;
    el.classList.remove('block-image-missing');
    if (img) loadInlineMedia(img, Number(fileId));
  } else if (dataUrl) {
    delete el.dataset.fileId;
    delete el.dataset.imagePath;
    el.classList.remove('block-image-missing');
    if (img) img.src = dataUrl;
  } else {
    delete el.dataset.fileId;
    const caminho = imagePath || (src && /^(\.\.\/)?imagens\//.test(src) ? src : null);
    if (caminho) {
      el.dataset.imagePath = caminho;
      el.classList.add('block-image-missing');
      if (typeof imageResolver === 'function') {
        const noteId = _callbacks.getCurrentNoteId();
        imageResolver(caminho, noteId).then(res => {
          const root = _callbacks.getRoot();
          if (root && !root.contains(el)) return;
          if (res && res.fileId != null) {
            const w = el.dataset.width ? Number(el.dataset.width) : undefined;
            const h = el.dataset.height ? Number(el.dataset.height) : undefined;
            setImageData(el, { fileId: res.fileId, alt: el.dataset.alt, width: w, height: h });
          }
        });
      }
    }
  }
}

export function buildImageTools() {
  const bar = document.createElement('div');
  bar.className = 'image-tools';
  bar.contentEditable = 'false';

  const btnReplace = document.createElement('button');
  btnReplace.className = 'image-btn';
  btnReplace.dataset.act = 'replace';
  btnReplace.title = 'Trocar imagem';
  btnReplace.appendChild(createIcon('cached'));

  const btnExtract = document.createElement('button');
  btnExtract.className = 'image-btn';
  btnExtract.dataset.act = 'extract';
  btnExtract.title = 'Mover para Documentos';
  btnExtract.appendChild(createIcon('drive_file_move'));

  const btnAlt = document.createElement('button');
  btnAlt.className = 'image-btn';
  btnAlt.dataset.act = 'alt';
  btnAlt.title = 'Texto alternativo';
  btnAlt.appendChild(createIcon('subtitles'));

  bar.append(btnReplace, btnExtract, btnAlt);
  return bar;
}

export function buildImageEl(media) {
  const wrap = document.createElement('div');
  wrap.className = 'image-wrap';
  wrap.contentEditable = 'false';

  const frame = document.createElement('div');
  frame.className = 'image-frame';

  const img = document.createElement('img');
  img.draggable = false;
  img.loading   = 'lazy';

  const missing = document.createElement('div');
  missing.className = 'image-missing-badge';
  missing.title     = 'Arquivo não encontrado neste dispositivo';
  missing.append(createIcon('broken_image'), document.createTextNode('Arquivo não encontrado'));

  const handle = document.createElement('div');
  handle.className = 'image-resize-handle';
  handle.title     = 'Arrastar para redimensionar (clique duplo restaura o tamanho original)';

  frame.append(img, missing, handle);
  wrap.append(frame, buildImageTools());
  return wrap;
}

export function buildAudioEl(media) {
  const wrap = document.createElement('div');
  wrap.className = 'media-wrap media-audio-wrap';
  wrap.contentEditable = 'false';
  const audio = document.createElement('audio');
  audio.controls = true;
  wrap.appendChild(audio);
  return wrap;
}

export function buildVideoEl(media) {
  const wrap = document.createElement('div');
  wrap.className = 'media-wrap media-video-wrap';
  wrap.contentEditable = 'false';
  const video = document.createElement('video');
  video.controls = true;
  wrap.appendChild(video);
  return wrap;
}

export async function insertImageFile(file, targetBlock) {
  const noteId = _callbacks.getCurrentNoteId();
  const fileId = await saveFile(file, noteId, { inline: true });
  _callbacks.captureUndoPoint();
  const newBlock = _callbacks.createBlockEl('image');
  setImageData(newBlock, { fileId, alt: file.name.replace(/\.[^.]+$/, '') });

  if (targetBlock && targetBlock.parentElement) {
    targetBlock.replaceWith(newBlock);
  } else {
    const root = _callbacks.getRoot();
    root?.appendChild(newBlock);
  }

  _callbacks.renumberLists();
  _callbacks.scheduleSave();
}

export async function insertMediaFile(file, targetBlock, tipo = 'audio') {
  const noteId = _callbacks.getCurrentNoteId();
  const fileId = await saveFile(file, noteId, { inline: true });
  _callbacks.captureUndoPoint();
  const newBlock = _callbacks.createBlockEl(tipo);
  newBlock.dataset.fileId = String(fileId);
  const mediaEl = newBlock.querySelector(tipo);
  if (mediaEl) loadInlineMedia(mediaEl, fileId);

  if (targetBlock && targetBlock.parentElement) {
    targetBlock.replaceWith(newBlock);
  } else {
    const root = _callbacks.getRoot();
    root?.appendChild(newBlock);
  }

  _callbacks.renumberLists();
  _callbacks.scheduleSave();
}

export async function absorbDataUrls() {
  const root = _callbacks.getRoot();
  if (!root) return;
  const blocks = root.querySelectorAll('.block-image');
  const noteId = _callbacks.getCurrentNoteId();

  for (const block of blocks) {
    const img = block.querySelector('img');
    const src = img?.src ?? '';
    if (!src.startsWith('data:')) continue;

    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] || 'png';
      const file = new File([blob], `imagem-${Date.now()}.${ext}`, { type: blob.type });
      const fileId = await saveFile(file, noteId, { inline: true });
      setImageData(block, { fileId, alt: block.dataset.alt ?? '' });
    } catch (err) {
      console.warn('QuickDock: erro ao absorver dataURL inline:', err);
    }
  }
}
