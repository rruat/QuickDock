// ── board-link-card.js ──────────────────────────────────────────────────────
// Cartão de link do Espaço: miniatura da página, favicon, título e domínio. O cartão
// inteiro é um <a target="_blank"> — um clique abre a página em nova aba.
//
// Título/miniatura/ícone vêm de um serviço de metadados (Microlink): navegador comum não
// consegue ler outra página por causa do CORS. Isso significa que o ENDEREÇO do link é
// enviado a esse serviço, uma vez, quando o cartão é criado; o resultado fica guardado no
// cartão (`card.meta`) e nunca é buscado de novo. Sem rede ou se o serviço falhar, o
// cartão cai pro favicon (via o serviço de ícones do Google, que só recebe o domínio) e
// continua clicável.

const META_API = 'https://api.microlink.io/';
const TIMEOUT_MS = 8000;
const RETENTAR_APOS_MS = 5 * 60 * 1000;

const emVoo = new Map();   // href → Promise (vários cartões iguais, uma busca)
const falhas = new Map();  // href → quando falhou (sem martelar o serviço em cada render)

function dominio(href) {
  try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return href; }
}

function httpUrl(valor) {
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

function faviconDoDominio(href) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(href).hostname)}&sz=64`;
}

/** @returns {Promise<{title?:string,image?:string,logo?:string}|null>} */
export function fetchLinkMeta(href) {
  const quando = falhas.get(href);
  if (quando && Date.now() - quando < RETENTAR_APOS_MS) return Promise.resolve(null);
  if (emVoo.has(href)) return emVoo.get(href);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const promessa = fetch(`${META_API}?url=${encodeURIComponent(href)}`, { signal: ctrl.signal })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      const d = j?.status === 'success' ? j.data : null;
      if (!d) return null;
      return {
        title: typeof d.title === 'string' ? d.title.trim().slice(0, 200) : '',
        image: httpUrl(d.image?.url) || '',
        logo: httpUrl(d.logo?.url) || '',
      };
    })
    .catch(() => null)
    .finally(() => { clearTimeout(timer); emVoo.delete(href); });

  emVoo.set(href, promessa);
  promessa.then(m => { if (!m) falhas.set(href, Date.now()); });
  return promessa;
}

/**
 * Monta o conteúdo do cartão de link dentro de `body`.
 * @param {HTMLElement} body
 * @param {{src:string, meta?:object}} card
 * @param {string} href  URL já validada (http/https)
 * @param {{ onMeta?: (card:object) => void }} [opts]  chamado quando os metadados chegam (pra salvar)
 */
export function buildLinkBody(body, card, href, { onMeta } = {}) {
  const a = document.createElement('a');
  a.className = 'board-link';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = href;
  a.draggable = false;
  a.addEventListener('click', e => e.stopPropagation());

  const thumb = document.createElement('div');
  thumb.className = 'board-link-thumb';
  thumb.hidden = true;
  const thumbImg = document.createElement('img');
  thumbImg.alt = '';
  thumbImg.loading = 'lazy';
  thumbImg.draggable = false;
  thumbImg.referrerPolicy = 'no-referrer';
  thumbImg.addEventListener('error', () => { thumb.hidden = true; });
  thumb.appendChild(thumbImg);

  const info = document.createElement('div');
  info.className = 'board-link-info';

  const fav = document.createElement('img');
  fav.className = 'board-link-favicon';
  fav.alt = '';
  fav.width = 24;
  fav.height = 24;
  fav.draggable = false;
  fav.referrerPolicy = 'no-referrer';
  fav.addEventListener('error', () => { fav.hidden = true; });

  const textos = document.createElement('div');
  textos.className = 'board-media-texts';
  const titulo = document.createElement('div');
  titulo.className = 'board-media-title';
  const sub = document.createElement('div');
  sub.className = 'board-media-sub';
  sub.textContent = dominio(href);
  textos.append(titulo, sub);

  const abrir = document.createElement('span');
  abrir.className = 'qd-icon material-symbols-rounded board-link-open';
  abrir.setAttribute('aria-hidden', 'true');
  abrir.textContent = 'open_in_new';

  info.append(fav, textos, abrir);
  a.append(thumb, info);
  body.appendChild(a);

  const aplicar = meta => {
    titulo.textContent = meta?.title || dominio(href);
    const icone = httpUrl(meta?.logo) || faviconDoDominio(href);
    if (fav.src !== icone) { fav.hidden = false; fav.src = icone; }
    const imagem = httpUrl(meta?.image);
    if (imagem) { thumbImg.src = imagem; thumb.hidden = false; }
  };
  aplicar(card.meta);

  if (!card.meta) {
    fetchLinkMeta(href).then(meta => {
      if (!meta) return;
      card.meta = meta;
      aplicar(meta);
      onMeta?.(card);
    });
  }
}
