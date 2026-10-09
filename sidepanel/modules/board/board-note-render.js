// ── board-note-render.js ────────────────────────────────────────────────────
// Renderização SOMENTE LEITURA de uma nota (lista de blocos) dentro do cartão de nota
// do Espaço. Monta o mesmo DOM que o editor monta (div.block.block-list…, h1.block…,
// data-depth/-quoted/-callout…) dentro de um contêiner `.note-editor-blocks`, então as
// regras de 03-blocks.css / 04-media-table.css valem sozinhas e o cartão fica com o
// visual dos blocos que você vê editando. Nada do editor real é reaproveitado: ele só
// roda numa instância por vez, e um cartão não pode roubar o foco/estado da nota aberta.

import { safeHref } from '../blocks.js';

const MAX_BLOCOS = 400;       // nota enorme não pode travar o quadro
const TAGS_PROIBIDAS = 'script, style, iframe, object, embed, link, meta, base, form, input, button, textarea, select';

const HEADINGS = { heading1: 'h1', heading2: 'h2', heading3: 'h3', heading4: 'h4', heading5: 'h5', heading6: 'h6' };
const CALLOUTS = ['note', 'tip', 'important', 'warning', 'caution'];

// HTML do bloco veio do editor (já saneado ao salvar), mas pode ter chegado por
// sincronização: limpa de novo antes de pôr no DOM.
function htmlSeguro(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  tpl.content.querySelectorAll(TAGS_PROIBIDAS).forEach(n => n.remove());
  tpl.content.querySelectorAll('*').forEach(n => {
    for (const attr of [...n.attributes]) {
      if (/^on/i.test(attr.name) || (attr.name === 'style' && /expression|url\(/i.test(attr.value))) n.removeAttribute(attr.name);
    }
  });
  tpl.content.querySelectorAll('a').forEach(a => {
    const href = safeHref(a.getAttribute('href'));
    if (!href) { a.replaceWith(...a.childNodes); return; }
    a.setAttribute('href', href);
    if (/^nota:/i.test(href)) {
      a.classList.add('note-internal-link');          // link interno: só aparência, não navega
    } else {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });
  tpl.content.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (!/^(https?:|blob:|data:image\/)/i.test(src)) img.remove();
  });
  return tpl.innerHTML;
}

function el(tag, className, html = null) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html != null) e.innerHTML = html;
  return e;
}

function decorar(bloco, b) {
  bloco.dataset.type = b.type;
  if (b.id) bloco.dataset.id = b.id;
  if (b.depth) bloco.dataset.depth = String(Math.min(Math.max(b.depth, 0), 5));
  if (b.quoted) bloco.dataset.quoted = 'true';
  if (b.callout && CALLOUTS.includes(b.callout)) { bloco.dataset.quoted = 'true'; bloco.dataset.callout = b.callout; }
  if (b.underlined && (b.type === 'heading1' || b.type === 'heading2')) bloco.dataset.underlined = 'true';
  if (b.type === 'bullet' && b.marker) bloco.dataset.marker = b.marker;
  if (b.type === 'code' && b.lang) bloco.dataset.lang = b.lang;
  return bloco;
}

// Primeiro/último de uma sequência do mesmo destaque (o editor usa isso pra desenhar a caixa)
function marcarCallouts(raiz) {
  const blocos = [...raiz.children];
  blocos.forEach((b, i) => {
    const c = b.dataset.callout;
    if (!c) return;
    if (blocos[i - 1]?.dataset.callout !== c) b.dataset.calloutFirst = '';
    if (blocos[i + 1]?.dataset.callout !== c) b.dataset.calloutLast = '';
  });
}

/**
 * @param {HTMLElement} raiz contêiner (recebe a classe note-editor-blocks)
 * @param {Array<object>} blocos blocos da nota
 * @param {{ urlDoArquivo:(fileId:number)=>Promise<string|null> }} deps
 */
export function renderNoteBlocks(raiz, blocos, { urlDoArquivo } = {}) {
  raiz.classList.add('note-editor-blocks', 'board-note-render');
  raiz.replaceChildren();

  const lista = (Array.isArray(blocos) ? blocos : []).slice(0, MAX_BLOCOS);
  const contadores = [];   // numeração por profundidade, reinicia quando a sequência quebra

  for (const b of lista) {
    let bloco;
    const depth = b.depth || 0;

    if (b.type !== 'number') contadores.length = 0;
    else {
      contadores.length = depth + 1;
      contadores[depth] = (contadores[depth] || 0) + 1;
    }

    if (HEADINGS[b.type]) {
      bloco = el(HEADINGS[b.type], 'block', htmlSeguro(b.html));
    } else if (b.type === 'bullet' || b.type === 'number' || b.type === 'checklist') {
      bloco = el('div', 'block block-list' + (b.type === 'checklist' ? ' block-checklist' : ''));
      const marcador = el('span', 'block-marker');
      if (b.type === 'checklist') {
        marcador.classList.add('cb-wrap');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!b.checked;
        cb.disabled = true;
        marcador.appendChild(cb);
        bloco.dataset.checked = b.checked ? 'true' : 'false';
      } else {
        marcador.textContent = b.type === 'bullet' ? (b.marker || '•') : `${contadores[depth]}.`;
      }
      bloco.append(marcador, el('span', 'block-content', htmlSeguro(b.html)));
    } else if (b.type === 'code') {
      bloco = el('div', 'block block-code');
      const conteudo = el('span', 'block-content');
      conteudo.textContent = el('div', '', htmlSeguro(b.html)).textContent;   // código é texto literal
      bloco.appendChild(conteudo);
    } else if (b.type === 'divider') {
      bloco = el('div', 'block block-divider');
      bloco.appendChild(document.createElement('hr'));
    } else if (b.type === 'table') {
      bloco = el('div', 'block block-table');
      const tabela = document.createElement('table');
      const corpo = document.createElement('tbody');
      for (const linha of b.rows || []) {
        const tr = document.createElement('tr');
        for (const celula of linha) tr.appendChild(el('td', '', htmlSeguro(celula)));
        corpo.appendChild(tr);
      }
      tabela.appendChild(corpo);
      bloco.appendChild(tabela);
    } else if (b.type === 'image' || b.type === 'video' || b.type === 'audio') {
      bloco = el('div', `block block-${b.type}`);
      const midia = document.createElement(b.type === 'image' ? 'img' : b.type);
      if (b.type !== 'image') { midia.controls = true; midia.preload = 'metadata'; } else { midia.alt = b.alt || ''; midia.draggable = false; }
      if (b.width && b.type !== 'audio') midia.style.maxWidth = '100%';
      const alvo = b.type === 'audio' ? bloco : el('div', 'image-frame');
      alvo.appendChild(midia);
      if (alvo !== bloco) bloco.appendChild(alvo);
      if (b.fileId != null && urlDoArquivo) {
        urlDoArquivo(b.fileId).then(url => { if (url) midia.src = url; else bloco.classList.add('is-missing'); }).catch(() => {});
      }
    } else if (b.type === 'base') {
      bloco = el('div', 'block block-base-aviso');
      bloco.textContent = 'Base de dados — abra a nota para ver';
    } else if (b.type === 'calc') {
      bloco = el('div', 'block block-calc');
      bloco.appendChild(el('span', 'block-content', htmlSeguro(b.html)));
    } else {
      bloco = el('p', 'block', htmlSeguro(b.html));
    }

    raiz.appendChild(decorar(bloco, b));
  }

  if (!raiz.children.length) {
    const vazio = el('p', 'block board-note-vazia');
    vazio.textContent = 'Nota vazia';
    raiz.appendChild(vazio);
  }
  marcarCallouts(raiz);
}
