// ── board-media.js ──────────────────────────────────────────────────────────
// Cartões de mídia do Quadro Infinito: imagem, vídeo, áudio, link e arquivo —
// cada um vindo de uma URL (`src`) ou de um arquivo local guardado na tabela
// `files` (`fileId`, mesmo mecanismo dos cartões de imagem colados).
//
// Cartão: { type:'media', kind:'image'|'video'|'audio'|'embed'|'link'|'file',
//           src?, embed?, fileId?, mime?, name?, title? }
//
// URLs nunca entram em innerHTML: o corpo é montado com DOM API e só
// http(s) é aceito — `javascript:`/`data:` viram "link inválido" em vez de
// executar. Vídeos de YouTube/Vimeo/Spotify viram iframe com sandbox.

import { buildLinkBody } from './board-link-card.js';

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i;

export const MEDIA_DEFAULT_SIZE = {
  image: { w: 280, h: 210 },
  video: { w: 360, h: 240 },
  embed: { w: 360, h: 240 },
  audio: { w: 300, h: 130 },
  link: { w: 280, h: 200 },
  file: { w: 240, h: 100 },
};

export const MEDIA_FILE_ACCEPT = 'image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';

// "youtube.com/..." sem esquema vira https://… ; qualquer outro esquema é recusado.
export function normalizeUrl(raw) {
  const texto = String(raw || '').trim();
  if (!texto || /\s/.test(texto)) return null;
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  try {
    const url = new URL(comEsquema);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

function embedFor(url) {
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
      if (m) id = m[1];
    }
  }
  if (id && /^[\w-]{6,}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;

  if (host === 'vimeo.com') {
    const m = url.pathname.match(/^\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  if (host === 'open.spotify.com') {
    const m = url.pathname.match(/^\/(track|episode|album|playlist|show)\/([\w]+)/);
    if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  }
  return null;
}

// URL → descrição do cartão (sem posição). `null` se a URL não é http(s).
export function mediaFromUrl(raw) {
  const href = normalizeUrl(raw);
  if (!href) return null;
  const url = new URL(href);
  const embed = embedFor(url);
  if (embed) return { kind: 'embed', src: href, embed };
  if (IMG_EXT.test(url.pathname)) return { kind: 'image', src: href };
  if (VIDEO_EXT.test(url.pathname)) return { kind: 'video', src: href };
  if (AUDIO_EXT.test(url.pathname)) return { kind: 'audio', src: href };
  return { kind: 'link', src: href };
}

export function kindFromFile(file) {
  const t = file?.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'file';
}

export function mediaHandleLabel(card) {
  const rotulos = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio', embed: 'Vídeo', link: 'Link', file: 'Arquivo' };
  return `⠿ ${rotulos[card.kind] || 'Mídia'}`;
}

// ── Object URLs dos arquivos locais ─────────────────────────────────────────
// Um por fileId, reaproveitado entre re-renders (renderCards recria todos os
// cartões a cada mudança — sem cache, cada render vazava um Blob URL).
const objectUrls = new Map();

export async function urlDoArquivo(fileId, loadFileBlob) {
  if (objectUrls.has(fileId)) return objectUrls.get(fileId);
  const blob = await loadFileBlob(fileId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(fileId, url);
  return url;
}

// Cartões vindos de outro aparelho (sincronização) trazem `arquivo` (caminho em imagens/)
// e nenhum fileId: o arquivo é baixado sob demanda por este resolvedor, injetado pelo app
// (que conhece o motor de sync). Sem sincronização configurada, o cartão fica "indisponível".
let resolvedorRemoto = null;
let aoResolverArquivo = null;

export function setRemoteFileResolver(resolver, aoResolver = null) {
  resolvedorRemoto = resolver;
  aoResolverArquivo = aoResolver;
}

export async function garantirFileId(card) {
  if (card.fileId != null || !card.arquivo || !resolvedorRemoto) return;
  try {
    const r = await resolvedorRemoto(card.arquivo);
    if (r?.fileId != null) {
      card.fileId = r.fileId;
      aoResolverArquivo?.(card);
    }
  } catch (err) {
    console.warn('Erro ao baixar arquivo do cartão:', err);
  }
}

export function releaseMediaFile(fileId) {
  const url = objectUrls.get(fileId);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(fileId);
}

function dominio(href) {
  try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return href; }
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function icone(nome) {
  return el('span', 'qd-icon material-symbols-rounded board-media-icon', nome);
}

/**
 * Monta o corpo do cartão (já com listeners). `loadFileBlob` vem do storage.
 * Devolve o elemento `.board-card-body`.
 */
export function buildMediaBody(card, { loadFileBlob, onMeta = null }) {
  const body = el('div', 'board-card-body board-card-media-body');
  body.dataset.mediaKind = card.kind;

  // Mídia pesada não deve capturar o arrasto: o cartão é movido pelo cabeçalho.
  const stop = e => e.stopPropagation();

  const setSource = async mediaEl => {
    await garantirFileId(card);
    if (card.fileId != null) {
      const url = await urlDoArquivo(card.fileId, loadFileBlob).catch(() => null);
      if (url) mediaEl.src = url; else body.classList.add('is-missing');
    } else if (card.src) {
      mediaEl.src = card.src;
    } else {
      body.classList.add('is-missing');
    }
  };

  if (card.kind === 'image') {
    const img = el('img', 'board-card-media-el');
    img.alt = card.title || card.name || '';
    img.draggable = false;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => body.classList.add('is-missing'));
    body.appendChild(img);
    setSource(img);
  } else if (card.kind === 'video') {
    const v = el('video', 'board-card-media-el');
    v.controls = true;
    v.preload = 'metadata';
    v.playsInline = true;
    v.addEventListener('pointerdown', stop);
    v.addEventListener('error', () => body.classList.add('is-missing'));
    body.appendChild(v);
    setSource(v);
  } else if (card.kind === 'audio') {
    body.appendChild(icone('graphic_eq'));
    body.appendChild(el('div', 'board-media-title', card.title || card.name || dominio(card.src || '') || 'Áudio'));
    const a = el('audio', 'board-card-media-audio');
    a.controls = true;
    a.preload = 'metadata';
    a.addEventListener('pointerdown', stop);
    a.addEventListener('error', () => body.classList.add('is-missing'));
    body.appendChild(a);
    setSource(a);
  } else if (card.kind === 'embed') {
    const f = el('iframe', 'board-card-media-el board-card-media-frame');
    f.src = card.embed;
    f.loading = 'lazy';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.allowFullscreen = true;
    f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
    f.title = card.title || 'Vídeo incorporado';
    body.appendChild(f);
  } else if (card.kind === 'link') {
    // Miniatura + favicon + título; o cartão todo é um link que abre em nova aba
    const href = normalizeUrl(card.src);
    if (href) {
      buildLinkBody(body, card, href, { onMeta });
    } else {
      body.classList.add('is-missing');
    }
  } else {
    // arquivo local sem pré-visualização (pdf, docs…)
    body.classList.add('is-clickable');
    body.appendChild(icone('draft'));
    const textos = el('div', 'board-media-texts');
    textos.appendChild(el('div', 'board-media-title', card.name || 'Arquivo'));
    textos.appendChild(el('div', 'board-media-sub', card.mime || 'arquivo'));
    body.appendChild(textos);
    body.addEventListener('dblclick', async e => {
      e.stopPropagation();
      await garantirFileId(card);
      const url = card.fileId != null ? await urlDoArquivo(card.fileId, loadFileBlob).catch(() => null) : null;
      if (url) window.open(url, '_blank', 'noopener');
    });
    body.appendChild(el('span', 'board-media-hint', 'Duplo clique para abrir'));
  }

  if (card.kind === 'embed' || card.kind === 'file') return body;
  if (card.kind === 'link') return body;
  body.appendChild(el('div', 'board-media-missing', 'Mídia indisponível'));
  return body;
}
