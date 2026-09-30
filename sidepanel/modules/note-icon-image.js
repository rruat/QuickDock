// Ícone de nota feito de imagem (link ou arquivo enviado), cortado em quadrado.
//
// Modelo: nota.iconImage = { url | fileId, x, y, zoom }
//   x, y  — ponto de foco, de 0 a 100 (%): 0 alinha a imagem à esquerda/topo,
//           100 à direita/base, 50 centraliza.
//   zoom  — 1 (a imagem cobre o quadrado) até 4.
// O corte NÃO recodifica a imagem: é só CSS (ver iconImageStyle). Por isso serve
// também para link externo, que um canvas não conseguiria exportar (CORS), e a
// mesma regra desenha o ícone de 16px da aba e a prévia grande do editor.

import { saveFile, loadFileBlob } from './storage.js';
import { createIcon } from './icons.js';

const MAX_SIDE = 512;            // lado maior da imagem enviada, em pixels
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function hasIconImage(meta) {
  const ii = meta?.iconImage;
  return !!ii && (!!ii.url || ii.fileId != null);
}

// Só http/https.
export function normalizeImageUrl(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeIconImage(ii) {
  if (!ii || (!ii.url && ii.fileId == null)) return null;
  return {
    ...(ii.url ? { url: ii.url } : { fileId: ii.fileId }),
    x: clamp(Number.isFinite(+ii.x) ? +ii.x : 50, 0, 100),
    y: clamp(Number.isFinite(+ii.y) ? +ii.y : 50, 0, 100),
    zoom: clamp(Number.isFinite(+ii.zoom) ? +ii.zoom : 1, ZOOM_MIN, ZOOM_MAX),
  };
}

// CSS do <img>: uma caixa de zoom×100% do quadrado, com `object-fit: cover`
// (a imagem preenche a caixa sem distorcer) e o mesmo ponto de foco em duas
// frentes — `object-position` (qual parte da imagem aparece na caixa) e
// `left/top + translate` (qual parte da caixa cai dentro do quadrado). Somadas,
// é o mesmo que alinhar o ponto X%/Y% da imagem com o ponto X%/Y% do quadrado:
// 0 encosta à esquerda/topo, 100 à direita/base, 50 centraliza.
export function iconImageStyle(ii) {
  const { x, y, zoom } = normalizeIconImage({ url: 'x', ...ii });
  const size = `${(zoom * 100).toFixed(2)}%`;
  return `left:${x}%;top:${y}%;transform:translate(-${x}%,-${y}%);width:${size};height:${size};object-fit:cover;object-position:${x}% ${y}%;`;
}

// Arquivo guardado → URL de exibição, uma vez só por arquivo (são imagens
// pequenas, e a aba/lista redesenha o ícone o tempo todo).
const fileUrlCache = new Map();
export function getIconFileUrl(fileId) {
  if (!fileUrlCache.has(fileId)) {
    fileUrlCache.set(fileId, loadFileBlob(fileId).then(blob => (blob ? URL.createObjectURL(blob) : null)));
  }
  return fileUrlCache.get(fileId);
}

// Esquece o cache de um arquivo apagado (o id nunca volta a existir, mas a
// URL de blob segura memória).
export async function forgetIconFile(fileId) {
  const pending = fileUrlCache.get(fileId);
  fileUrlCache.delete(fileId);
  const url = await pending;
  if (url) URL.revokeObjectURL(url);
}

/**
 * Elemento do ícone: um quadrado com a imagem cortada dentro.
 * O tamanho vem do CSS de quem usa (classe extra) ou do `font-size` (1.25em).
 */
export function buildIconImageNode(ii, extraClass = '') {
  const norm = normalizeIconImage(ii);
  if (!norm) return null;
  const box = document.createElement('span');
  box.className = `note-icon-img ${extraClass}`.trim();
  box.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.style.cssText = iconImageStyle(norm);
  // Imagem que não abre deixa o quadrado vazio em vez de um ícone quebrado.
  img.addEventListener('error', () => img.remove());
  box.appendChild(img);

  if (norm.url) {
    img.src = norm.url;
  } else {
    getIconFileUrl(norm.fileId).then(src => { if (src) img.src = src; else img.remove(); });
  }
  return box;
}

// ── Imagem enviada: reduz antes de guardar ────────────────────────────────────
async function downscale(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (blob) return new File([blob], (file.name || 'icone').replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  } catch {}
  // Formato que o navegador não decodifica aqui (SVG, por ex.): guarda como veio.
  return file;
}

// ── Editor de corte ───────────────────────────────────────────────────────────
/**
 * Troca o conteúdo do popover pelo editor de imagem do ícone.
 * @param pop     elemento do popover
 * @param meta    nota (lê meta.iconImage)
 * @param hooks   { save(iconImage|null, arquivoNovo|null), back() }
 */
export function renderIconImageEditor(pop, meta, hooks) {
  pop.innerHTML = '';
  const existing = normalizeIconImage(meta.iconImage);

  const draft = {
    url: existing?.url ?? null,
    fileId: existing?.fileId ?? null,   // arquivo já guardado (não reenviar se não mudou)
    file: null,                          // arquivo novo, ainda não guardado
    previewSrc: null,
    x: existing?.x ?? 50,
    y: existing?.y ?? 50,
    zoom: existing?.zoom ?? 1,
  };
  let previewObjectUrl = null;

  const wrap = document.createElement('div');
  wrap.className = 'icon-image-editor';
  wrap.innerHTML = `
    <div class="icon-image-top">
      <button type="button" class="icon-image-back" aria-label="Voltar"><span class="qd-icon material-symbols-rounded" aria-hidden="true">arrow_back</span></button>
      <span class="icon-image-title">Ícone com imagem</span>
    </div>
    <div class="icon-image-source">
      <input type="url" class="icon-image-url" placeholder="Link da imagem (https://…)" spellcheck="false" autocomplete="off">
      <button type="button" class="icon-image-use-url">Usar</button>
    </div>
    <button type="button" class="icon-image-upload">
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">upload</span><span>Enviar uma imagem</span>
    </button>
    <input type="file" class="icon-image-file" accept="image/*" hidden>
    <div class="icon-image-stage-wrap">
      <div class="icon-image-stage" tabindex="0" role="img" aria-label="Prévia do ícone. Arraste para ajustar o corte."></div>
      <div class="icon-image-small" aria-hidden="true"></div>
    </div>
    <label class="icon-image-zoom">
      <span>Zoom</span>
      <input type="range" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="0.05" value="${draft.zoom}">
    </label>
    <div class="icon-image-hint">Arraste a imagem para escolher a parte que aparece no quadrado.</div>
    <div class="icon-image-message" role="status" hidden></div>
    <div class="icon-image-actions">
      <button type="button" class="icon-image-save">Salvar</button>
      <button type="button" class="icon-image-remove" hidden>Remover imagem</button>
    </div>
  `;
  pop.appendChild(wrap);

  const $ = (sel) => wrap.querySelector(sel);
  const urlInput = $('.icon-image-url');
  const stage = $('.icon-image-stage');
  const small = $('.icon-image-small');
  const zoomInput = $('.icon-image-zoom input');
  const messageEl = $('.icon-image-message');
  const saveBtn = $('.icon-image-save');
  const removeBtn = $('.icon-image-remove');
  const fileInput = $('.icon-image-file');

  removeBtn.hidden = !hasIconImage(meta);
  if (draft.url) urlInput.value = draft.url;

  const message = (text) => { messageEl.textContent = text || ''; messageEl.hidden = !text; };

  let stageImg = null;
  let smallImg = null;

  const applyTransform = () => {
    const style = iconImageStyle({ url: 'x', x: draft.x, y: draft.y, zoom: draft.zoom });
    if (stageImg) stageImg.style.cssText = style;
    if (smallImg) smallImg.style.cssText = style;
  };

  const paintPreview = () => {
    stage.innerHTML = '';
    small.innerHTML = '';
    stageImg = null;
    smallImg = null;
    if (!draft.previewSrc) {
      stage.classList.add('is-empty');
      stage.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">image</span>';
      saveBtn.disabled = true;
      return;
    }
    stage.classList.remove('is-empty');
    const make = (host, cls) => {
      const box = document.createElement('span');
      box.className = `note-icon-img ${cls}`;
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        message('Não foi possível carregar a imagem.');
        saveBtn.disabled = true;
      });
      img.addEventListener('load', () => { message(''); saveBtn.disabled = false; });
      img.src = draft.previewSrc;
      box.appendChild(img);
      host.appendChild(box);
      return img;
    };
    stageImg = make(stage, 'icon-image-stage-box');
    smallImg = make(small, 'icon-image-small-box');
    applyTransform();
  };

  const setPreviewFromBlob = (blob) => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(blob);
    draft.previewSrc = previewObjectUrl;
  };

  // Estado inicial: a imagem que a nota já tem.
  if (draft.url) {
    draft.previewSrc = draft.url;
  } else if (draft.fileId != null) {
    getIconFileUrl(draft.fileId).then(src => { draft.previewSrc = src; paintPreview(); });
  }
  paintPreview();

  // ── Origem da imagem ──
  $('.icon-image-use-url').addEventListener('click', () => {
    const url = normalizeImageUrl(urlInput.value);
    if (!url) { message('Digite um link http:// ou https:// válido.'); return; }
    message('');
    draft.url = url;
    draft.file = null;
    draft.fileId = null;
    draft.x = 50; draft.y = 50; draft.zoom = 1;
    zoomInput.value = 1;
    draft.previewSrc = url;
    paintPreview();
  });
  urlInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); $('.icon-image-use-url').click(); }
  });

  $('.icon-image-upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { message('Escolha um arquivo de imagem.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { message('A imagem passa de 8 MB. Escolha uma menor.'); return; }
    message('');
    const reduced = await downscale(file);
    draft.file = reduced;
    draft.url = null;
    draft.fileId = null;
    draft.x = 50; draft.y = 50; draft.zoom = 1;
    zoomInput.value = 1;
    urlInput.value = '';
    setPreviewFromBlob(reduced);
    paintPreview();
  });

  // ── Corte: arrastar e zoom ──
  zoomInput.addEventListener('input', () => {
    draft.zoom = clamp(parseFloat(zoomInput.value) || 1, ZOOM_MIN, ZOOM_MAX);
    applyTransform();
  });
  stage.addEventListener('wheel', (e) => {
    if (!draft.previewSrc) return;
    e.preventDefault();
    draft.zoom = clamp(draft.zoom - Math.sign(e.deltaY) * 0.1, ZOOM_MIN, ZOOM_MAX);
    zoomInput.value = draft.zoom;
    applyTransform();
  }, { passive: false });

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!stageImg) return;
    drag = { px: e.clientX, py: e.clientY, x: draft.x, y: draft.y };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || !stageImg) return;
    // "Sobra" = quanto a imagem passa do quadrado em cada direção; arrastar a
    // imagem pra direita traz a parte esquerda dela pra dentro (x diminui).
    // Tamanho que a imagem ocupa de fato: a caixa (quadrado × zoom) é coberta
    // pela imagem, então o lado maior dela vale caixa × proporção.
    const side = stage.getBoundingClientRect().width;
    const ratio = (stageImg.naturalWidth || 1) / (stageImg.naturalHeight || 1);
    const boxSide = side * draft.zoom;
    const slackX = boxSide * Math.max(1, ratio) - side;
    const slackY = boxSide * Math.max(1, 1 / ratio) - side;
    if (slackX > 0.5) draft.x = clamp(drag.x - ((e.clientX - drag.px) / slackX) * 100, 0, 100);
    if (slackY > 0.5) draft.y = clamp(drag.y - ((e.clientY - drag.py) / slackY) * 100, 0, 100);
    applyTransform();
  });
  const endDrag = () => { drag = null; stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // ── Ações ──
  $('.icon-image-back').addEventListener('click', () => { cleanup(); hooks.back(); });

  saveBtn.addEventListener('click', async () => {
    if (!draft.previewSrc) return;
    saveBtn.disabled = true;
    try {
      let image;
      if (draft.file) {
        const fileId = await saveFile(draft.file, meta.id, { inline: true });
        image = { fileId };
      } else if (draft.fileId != null) {
        image = { fileId: draft.fileId };
      } else {
        image = { url: draft.url };
      }
      await hooks.save(normalizeIconImage({ ...image, x: draft.x, y: draft.y, zoom: draft.zoom }));
    } finally {
      cleanup();
    }
  });

  removeBtn.addEventListener('click', async () => {
    await hooks.save(null);
    cleanup();
  });

  function cleanup() {
    if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
  }
}

// Miniatura pro botão do popover de aparência.
export function buildIconImageThumb(meta) {
  return hasIconImage(meta) ? buildIconImageNode(meta.iconImage, 'icon-image-thumb') : createIcon('image');
}
