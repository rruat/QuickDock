// ── note-page-view.js ───────────────────────────────────────────────────────
// "Ver como páginas": a nota em folhas A4 (ou do tamanho escolhido), só para ver — não é um modo de
// edição. Usa o Paged.js (CSS Paged Media, licença MIT, em vendor/pagedjs) para quebrar o texto em
// páginas de verdade, então o que se vê é o que sai na impressão: margens, orientação, tamanhos de fonte,
// quebras de página, numeração e o sumário com o número de cada página.
//
// O conteúdo vem do modo de impressão (note-print.js): os blocos que estão marcados, copiados do editor.
// A biblioteca só é carregada na primeira vez que a visualização abre.

import { githubSlugs, tocEntries, escHtml } from './blocks.js';
import { textCss } from './note-print-text.js';
import { numberingCss } from './note-page-numbering.js';
import { pageMarginValue } from './note-print-margins.js';
import { getTocData } from './note/note-toc.js';

const PAGED_SRC = 'vendor/pagedjs/paged.min.js';
const RAIZ_CSS = '.pagedjs_page_content';   // o Paged.js descarta o elemento de fora do conteúdo: a classe do editor entra na área de cada página

let pagedPromise = null;
function carregarPaged() {
  if (window.PagedModule?.Previewer) return Promise.resolve();
  if (!pagedPromise) {
    pagedPromise = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = PAGED_SRC;
      s.onload = () => (window.PagedModule?.Previewer ? ok() : erro(new Error('Paged.js sem Previewer')));
      s.onerror = () => { pagedPromise = null; erro(new Error('Não foi possível carregar o Paged.js')); };
      document.head.appendChild(s);
    });
  }
  return pagedPromise;
}

let overlay = null, host = null, statusEl = null, zoomEl = null;
let previewer = null;
let obterFonte = null;          // () => { title, blocks, orientation, margins, text, numbering }
let renderizando = false, renderPendente = false, timer = null;
let zoomModo = 'fit', zoom = 1;
let paginas = 0;
let observadorEstagio = null;       // refaz o ajuste de zoom quando a largura da aside muda (abre/alarga com animação)
let painelEl = null;               // painel de configurações da aside (some enquanto as folhas estão à vista)
let naAside = false;               // true: as folhas moram na aside direita; false: cobrem a nota (celular)
let visivel = true, sujo = false;  // aba Páginas à vista? / mudou algo enquanto estava na aba Configurações?

export const isPageViewOpen = () => !!overlay;
export const isPageViewShowing = () => !!overlay && visivel;

// ── Conteúdo ────────────────────────────────────────────────────────────────
const textoDe = el => (el.querySelector(':scope > .block-content') || el).textContent.replace(/\s+/g, ' ').trim();

// O Paged.js procura o destino do link com querySelector('#id'): um id que começa com número
// ("1-introdução") não é um seletor válido. Por isso todos ganham o prefixo "pg-".
const idDaPagina = slug => `pg-${slug}`;

function limparClone(bloco) {
  const c = bloco.cloneNode(true);
  [c, ...c.querySelectorAll('[contenteditable]')].forEach(x => x.removeAttribute('contenteditable'));
  c.querySelectorAll('.table-tools, .image-tools, .table-source, .image-source, .image-resize-handle, .code-copy-btn, .print-select-handle, .block-controls, [class*="md-syntax"]')
    .forEach(x => x.remove());
  c.classList.remove('is-active', 'is-source', 'print-selected', 'print-excluded', 'print-selectable-item', 'print-hover');
  c.removeAttribute('data-print-selected');
  return c;
}

function sumarioParaPagina(el, titulos, slugs) {
  const dados = getTocData(el);
  const lista = titulos.map(t => ({ type: t.dataset.type, html: escHtml(textoDe(t)) }));
  let entradas = tocEntries({ mode: 'auto', levels: dados.levels, numbered: dados.numbered }, lista);
  if (dados.mode === 'manual') {
    // itens da pessoa: o número da página vem do título que tem o mesmo texto (se existir)
    const porTexto = new Map(titulos.map((t, i) => [textoDe(t).toLowerCase(), slugs[i]]));
    entradas = dados.items.map(it => ({ text: it.text, level: it.level || 1, slug: porTexto.get(String(it.text).replace(/^\d+(\.\d+)*\.?\s+/, '').toLowerCase()) ?? porTexto.get(String(it.text).toLowerCase()) ?? '' }));
  }
  const raiz = document.createElement('div');
  raiz.className = 'block page-toc';
  if (dados.title) { const t = document.createElement('div'); t.className = 'page-toc-title'; t.textContent = dados.title; raiz.appendChild(t); }
  const base = entradas.length ? Math.min(...entradas.map(e => e.level)) : 1;
  for (const e of entradas) {
    const a = document.createElement(e.slug ? 'a' : 'div');
    a.className = 'page-toc-row';
    if (e.slug) a.setAttribute('href', `#${idDaPagina(e.slug)}`);
    a.style.setProperty('--lvl', String(e.level - base));
    const t = document.createElement('span'); t.className = 'page-toc-text'; t.textContent = e.text;
    const p = document.createElement('span'); p.className = 'page-toc-dots';
    a.append(t, p);
    raiz.appendChild(a);
  }
  return raiz;
}

function montarDocumento(fonte) {
  const doc = document.createElement('div');
  doc.className = 'note-editor-blocks page-doc';
  if (fonte.title) {
    const t = document.createElement('div');
    t.className = 'page-doc-title';
    t.textContent = fonte.title;
    doc.appendChild(t);
  }
  const blocos = fonte.blocks;
  const titulos = blocos.filter(b => /^heading[1-6]$/.test(b.dataset.type));
  const slugs = githubSlugs(titulos.map(textoDe));

  for (const b of blocos) {
    const tipo = b.dataset.type;
    if (tipo === 'pagebreak') {
      const m = document.createElement('div');
      m.className = 'page-break-marker';
      if (b.dataset.blank === 'true') m.dataset.blank = 'true';
      doc.appendChild(m);
      continue;
    }
    if (tipo === 'toc') { doc.appendChild(sumarioParaPagina(b, titulos, slugs)); continue; }
    const c = limparClone(b);
    const i = titulos.indexOf(b);
    if (i >= 0) c.id = idDaPagina(slugs[i]);
    doc.appendChild(c);
  }
  return doc;
}

// Regras que o Paged.js precisa ler ELE MESMO (quebras forçadas e número de página do sumário só valem
// se estiverem na folha de estilo entregue a ele; o resto do visual está em 40-page-view.css)
const CSS_DO_DOCUMENTO = `
.page-break-marker { break-after: page; height: 0; margin: 0; padding: 0; }
.page-break-marker[data-blank="true"] { break-before: page; height: 1px; }
.block-table, .block-code, .block-image img { break-inside: avoid; }
h1.block, h2.block, h3.block, h4.block { break-after: avoid; }
a.page-toc-row::after { content: target-counter(attr(href url), page); }
`;

function montarCss(fonte) {
  const orient = fonte.orientation === 'landscape' ? 'landscape' : 'portrait';
  return [
    `@page { size: A4 ${orient}; margin: ${pageMarginValue(fonte.margins)}; }`,
    CSS_DO_DOCUMENTO,
    numberingCss(fonte.numbering),
    textCss(fonte.text, RAIZ_CSS),
  ].filter(Boolean).join('\n');
}

// ── Desenho das páginas ─────────────────────────────────────────────────────
// Mídia que ainda está sendo carregada pelo editor (arquivo local ou imagem sincronizada): espera o src
// aparecer, com limite, para não travar a visualização se o arquivo não existir neste aparelho.
async function esperarMidias(blocos, limiteMs = 4000) {
  const pendentes = blocos
    .filter(b => (b.dataset?.fileId || b.dataset?.imagePath))
    .map(b => b.querySelector('img, video, audio'))
    .filter(m => m && !m.getAttribute('src'));
  if (!pendentes.length) return;
  const inicio = Date.now();
  await new Promise(ok => {
    const verificar = () => {
      if (!overlay || pendentes.every(m => m.getAttribute('src')) || Date.now() - inicio > limiteMs) return ok();
      setTimeout(verificar, 50);
    };
    verificar();
  });
}

function limparPaginas() {
  try { previewer?.polisher?.destroy?.(); } catch { /* já limpo */ }
  previewer = null;
  host?.replaceChildren();
}

async function renderizar() {
  if (!overlay || !visivel) return;
  if (renderizando) { renderPendente = true; return; }
  renderizando = true;
  overlay.classList.add('is-loading');
  statusEl.textContent = 'Gerando páginas…';
  try {
    await carregarPaged();
    if (!overlay) return;
    limparPaginas();
    const fonte = obterFonte();
    // imagens/áudio/vídeo da nota carregam em segundo plano (blob:); clonar antes deixaria o elemento sem arquivo
    await esperarMidias(fonte.blocks);
    if (!overlay) return;
    const doc = montarDocumento(fonte);
    previewer = new window.PagedModule.Previewer();
    // As regras do editor são .note-editor-blocks .block…; o Paged.js não leva esse elemento para as páginas,
    // então a classe vai na área de conteúdo de cada página, ANTES da quebra do texto (medida igual à do editor)
    previewer.on('page', (pagina) => pagina.area.classList.add('note-editor-blocks'));
    const fluxo = await previewer.preview(doc, [{ 'quickdock-pagina': montarCss(fonte) }], host);
    paginas = fluxo?.total ?? host.querySelectorAll('.pagedjs_page').length;
    statusEl.textContent = `${paginas} ${paginas === 1 ? 'página' : 'páginas'}`;
    aplicarZoom();
    // o guia de páginas do editor usa esta mesma contagem (é a conta exata do modo de impressão)
    document.dispatchEvent(new CustomEvent('quickdock:page-view-counted', { detail: { paginas } }));
  } catch (err) {
    console.error('Visualização em páginas:', err);
    statusEl.textContent = 'Não foi possível gerar as páginas';
  } finally {
    renderizando = false;
    overlay?.classList.remove('is-loading');
    if (renderPendente) { renderPendente = false; renderizar(); }
  }
}

/** Pede um novo desenho (as configurações de impressão mudaram); junta várias alterações seguidas. */
export function refreshPageView() {
  if (!overlay) return;
  if (!visivel) { sujo = true; return; }   // na aba Configurações o contêiner está escondido e o Paged.js não consegue medir
  clearTimeout(timer);
  timer = setTimeout(renderizar, 450);
}

// ── Zoom ────────────────────────────────────────────────────────────────────
function aplicarZoom() {
  const paginasEl = host?.querySelector('.pagedjs_pages');
  if (!paginasEl || !visivel) return;
  if (zoomModo === 'fit') {
    const folha = paginasEl.querySelector('.pagedjs_page');
    const larguraFolha = folha?.getBoundingClientRect().width / (Number(paginasEl.dataset.zoom) || 1) || 794;
    const area = overlay.querySelector('.page-view-stage').clientWidth - 48;
    zoom = Math.max(0.3, Math.min(1.5, area / larguraFolha));
  }
  paginasEl.style.zoom = String(zoom);
  paginasEl.dataset.zoom = String(zoom);
  if (zoomEl) zoomEl.textContent = `${Math.round(zoom * 100)}%`;
}

function mudarZoom(delta) {
  zoomModo = 'manual';
  zoom = Math.max(0.3, Math.min(2, Math.round((zoom + delta) * 100) / 100));
  aplicarZoom();
}

// ── Abrir e fechar ──────────────────────────────────────────────────────────
/**
 * @param fonte  () => conteúdo e configurações atuais (vem do note-print.js)
 * @param opcoes.parent  onde pôr as folhas: a aside direita (desktop). Sem isso cobrem a área da nota (celular).
 * @param opcoes.panel   o painel de configurações da aside, que alterna com as folhas
 */
export function openPageView(fonte, { parent = null, panel = null } = {}) {
  if (overlay) return;
  const area = parent ?? document.querySelector('#section-note .note-workspace-body');
  if (!area) return;
  obterFonte = fonte;
  naAside = !!parent;
  painelEl = naAside ? panel : null;
  visivel = true; sujo = false;
  overlay = document.createElement('div');
  overlay.id = 'note-page-view';
  overlay.classList.toggle('is-in-aside', naAside);
  overlay.innerHTML = (naAside
      ? '<div class="page-view-tabs" role="tablist"><button type="button" class="active" data-pv="tab-pages" role="tab">Páginas</button>'
        + '<button type="button" data-pv="tab-settings" role="tab">Configurações</button></div>'
      : '')
    + '<div class="page-view-bar">'
    + '<span class="page-view-status">…</span>'
    + '<span class="page-view-zoom"><button type="button" data-pv="out" title="Menos zoom" aria-label="Menos zoom">−</button>'
    + '<span class="page-view-zoom-value">100%</span>'
    + '<button type="button" data-pv="in" title="Mais zoom" aria-label="Mais zoom">+</button>'
    + '<button type="button" data-pv="fit" title="Ajustar à largura">Ajustar</button></span>'
    + '<span class="page-view-spacer"></span>'
    + '<button type="button" class="page-view-print" data-pv="print" title="Imprimir ou salvar em PDF as páginas">Imprimir / PDF</button>'
    + '<button type="button" data-pv="close" title="Fechar a visualização" aria-label="Fechar visualização">Fechar</button>'
    + '</div><div class="page-view-stage"><div class="page-view-pages"></div></div>';
  area.appendChild(overlay);
  if (painelEl) painelEl.hidden = true;
  host = overlay.querySelector('.page-view-pages');
  statusEl = overlay.querySelector('.page-view-status');
  zoomEl = overlay.querySelector('.page-view-zoom-value');
  document.body.classList.add('is-page-view');
  document.body.classList.toggle('is-page-view-wide', naAside);
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pv]');
    if (!b) return;
    const acao = b.dataset.pv;
    if (acao === 'in') mudarZoom(0.1);
    else if (acao === 'out') mudarZoom(-0.1);
    else if (acao === 'fit') { zoomModo = 'fit'; aplicarZoom(); }
    else if (acao === 'print') imprimirPaginas();
    else if (acao === 'close') closePageView();
    else if (acao === 'tab-settings') showPageViewSettings();
  });
  window.addEventListener('resize', aplicarZoomSeAjustado);
  observadorEstagio = new ResizeObserver(aplicarZoomSeAjustado);
  observadorEstagio.observe(overlay.querySelector('.page-view-stage'));
  renderizar();
}

const aplicarZoomSeAjustado = () => { if (zoomModo === 'fit') aplicarZoom(); };

/** Aba "Configurações": o painel volta à aside e as folhas ficam guardadas, escondidas. */
export function showPageViewSettings() {
  if (!overlay || !naAside) return;
  visivel = false;
  overlay.hidden = true;
  if (painelEl) painelEl.hidden = false;
  document.body.classList.remove('is-page-view-wide');
}

/** Aba "Páginas": redesenha se algo mudou nas configurações enquanto estava fora. */
export function showPageViewPages() {
  if (!overlay) return;
  visivel = true;
  overlay.hidden = false;
  if (painelEl) painelEl.hidden = true;
  document.body.classList.toggle('is-page-view-wide', naAside);
  // espera a aside alargar antes de medir
  setTimeout(() => { if (sujo || !host.querySelector('.pagedjs_page')) { sujo = false; renderizar(); } else aplicarZoom(); }, 260);
}

export function closePageView() {
  if (!overlay) return;
  clearTimeout(timer);
  limparPaginas();
  overlay.remove();
  if (painelEl) painelEl.hidden = false;
  overlay = host = statusEl = zoomEl = painelEl = null;
  obterFonte = null;
  naAside = false; visivel = true; sujo = false;
  paginas = 0;
  document.body.classList.remove('is-page-view', 'is-page-view-wide');
  window.removeEventListener('resize', aplicarZoomSeAjustado);
  observadorEstagio?.disconnect();
  observadorEstagio = null;
  document.dispatchEvent(new CustomEvent('quickdock:page-view-closed'));
  document.dispatchEvent(new CustomEvent('quickdock:page-view-counted', { detail: { paginas: null } }));
}
// ── Imprimir as páginas ─────────────────────────────────────────────────────
// As folhas do Paged.js já têm o tamanho do papel: elas vão para uma raiz própria, filha direta do body,
// que é a única coisa visível na impressão (ver 40-page-view.css), e voltam para o lugar depois.
export function printPageView() { imprimirPaginas(); }
function imprimirPaginas() {
  const paginasEl = host?.querySelector('.pagedjs_pages');
  if (!paginasEl) return;
  const raiz = document.createElement('div');
  raiz.id = 'note-page-print-root';
  document.body.appendChild(raiz);
  const zoomAntes = paginasEl.style.zoom;
  paginasEl.style.zoom = '1';
  raiz.appendChild(paginasEl);
  document.body.classList.add('is-page-printing');
  const voltar = () => {
    window.removeEventListener('afterprint', voltar);
    document.body.classList.remove('is-page-printing');
    paginasEl.style.zoom = zoomAntes;
    host?.appendChild(paginasEl);
    raiz.remove();
  };
  window.addEventListener('afterprint', voltar);
  setTimeout(() => window.print(), 60);
}
