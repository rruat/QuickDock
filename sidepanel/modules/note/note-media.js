// ── note-media.js ────────────────────────────────────────────────────────────
// Manipulação de mídia (imagens, áudio, vídeo) no editor de blocos.
// Gerencia Blobs locais sob demanda, URLs de objeto com revogação automática,
// redimensionamento interativo e ferramentas de imagem e áudio/vídeo.

import { loadFileBlob } from '../storage.js';

const imageURLs = new Map(); // fileId → objectURL
let imageResolver = null;

let _callbacks = {
  getRoot: () => null,
  getCurrentNoteId: () => null,
  captureUndoPoint: () => {},
  scheduleSave: () => {},
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

// Largura (e opcionalmente altura) explícitas, escritas pela alça de
// redimensionar ou lidas de "|320" / "|320x240" no markdown.
// Sem altura, só a largura é fixada — a altura segue sozinha (proporção
// preservada), e por isso o teto de 320px (CSS) precisa sair do caminho.
export function aplicarTamanhoImagem(el, width, height) {
  const img = el.querySelector('img, video');
  if (width) {
    el.dataset.width = String(width);
    if (img) {
      img.style.width = `${width}px`;
      img.style.maxHeight = 'none';
    }
  } else {
    delete el.dataset.width;
    if (img) { img.style.width = ''; img.style.maxHeight = ''; }
  }
  if (height) {
    el.dataset.height = String(height);
    if (img) img.style.height = `${height}px`;
  } else {
    delete el.dataset.height;
    if (img) img.style.height = '';
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
            setImageData(el, { fileId: res.fileId, alt, width: w, height: h });
          }
        }).catch(() => {});
      }
    } else {
      delete el.dataset.imagePath;
      el.classList.add('block-image-missing');
    }
  }
}

export function setMediaData(el, type, { fileId, alt, dataUrl, width, height }) {
  const media = el.querySelector(type);
  if (alt) el.dataset.alt = alt;
  else delete el.dataset.alt;
  if (type === 'video') aplicarTamanhoImagem(el, width, height);
  if (fileId != null && Number.isFinite(Number(fileId))) {
    el.dataset.fileId = String(fileId);
    el.classList.remove('block-image-missing');
    if (media) loadInlineMedia(media, Number(fileId));
  } else if (dataUrl) {
    delete el.dataset.fileId;
    el.classList.remove('block-image-missing');
    if (media) media.src = dataUrl;
  } else {
    delete el.dataset.fileId;
    el.classList.add('block-image-missing');
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

export function buildMediaTools() {
  const bar = document.createElement('div');
  bar.className = 'image-tools';
  bar.contentEditable = 'false';
  const btn = document.createElement('button');
  btn.className   = 'image-btn';
  btn.dataset.act = 'remove-media';
  btn.textContent = 'Remover';
  btn.title       = 'Remover da nota';
  bar.appendChild(btn);
  return bar;
}

export function buildImageResizeHandle(el) {
  const handle = document.createElement('div');
  handle.className = 'image-resize-handle';
  handle.contentEditable = 'false';
  handle.title = 'Arrastar para redimensionar';

  handle.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const img = el.querySelector('img, video');
    if (!img) return;

    const root = _callbacks.getRoot();
    const startX = e.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const larguraMaxima = Math.max(60, (root?.clientWidth ?? 400) - 8);
    _callbacks.captureUndoPoint();
    el.classList.add('is-resizing');

    const mover = ev => {
      const bruta = startWidth + (ev.clientX - startX);
      const tetoNatural = (img.tagName === 'VIDEO' ? img.videoWidth : img.naturalWidth) || Infinity;
      const largura = Math.round(Math.min(Math.max(60, bruta), larguraMaxima, tetoNatural));
      aplicarTamanhoImagem(el, largura, null);
    };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      el.classList.remove('is-resizing');
      _callbacks.scheduleSave();
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  });

  return handle;
}
