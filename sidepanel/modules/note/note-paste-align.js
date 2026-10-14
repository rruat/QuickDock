// ── note-paste-align.js ─────────────────────────────────────────────────────
// Colar texto que veio de outro lugar (Word, Google Docs, páginas web) CENTRALIZADO, À DIREITA ou
// JUSTIFICADO mantém esse alinhamento nos blocos da nota. O alinhamento vem no HTML da área de
// transferência (`text-align:center`, `align="center"`, `class=MsoNormal align=justify`); aqui ele é
// lido por parágrafo/título e a colagem vira markdown com <div align="…"> (o formato que a nota grava,
// ver blocks.js), que o leitor de markdown já sabe transformar em blocos alinhados.
//
// Só entra em ação quando algum bloco colado tem alinhamento diferente do padrão (à esquerda); sem isso
// a colagem segue o caminho de sempre (texto puro), sem mudar nada.

import { normalizeTextAlign } from '../blocks.js';

/** Valor de `text-align` / `align` → center | right | justify, ou null (esquerda, start, vazio, lixo). */
export function alignFromCss(valor) {
  const v = String(valor ?? '').trim().toLowerCase().replace(/\s*!important$/, '');
  if (/^(-webkit-|-moz-)?center$/.test(v)) return 'center';
  if (/^(-webkit-|-moz-)?right$/.test(v) || v === 'end') return 'right';
  if (v === 'justify' || v === 'justify-all') return 'justify';
  return null;
}

// O alinhamento vale para o elemento e é herdado dos de fora (o Docs embrulha tudo num <b>; o Word, em <div align>).
function alignOf(el, limite) {
  for (let n = el; n && n !== limite; n = n.parentElement) {
    const a = alignFromCss(n.style?.textAlign) ?? alignFromCss(n.getAttribute?.('align'));
    if (a) return a;
    // um `text-align: left` explícito num elemento mais próximo encerra a herança
    if (/^(left|start)$/i.test(String(n.style?.textAlign ?? '').trim()) || /^left$/i.test(n.getAttribute?.('align') ?? '')) return null;
  }
  return null;
}

const BLOCOS = 'p, h1, h2, h3, h4, h5, h6, li, div, blockquote, pre';

/**
 * @param {string} html  text/html da área de transferência
 * @param {Document} [doc]  já lido (para teste); sem ele usa o DOMParser do navegador
 * @returns {string|null}  markdown com <div align> ou null se nada ali pede alinhamento
 */
export function htmlToAlignedMarkdown(html, doc) {
  if (!html || !/text-align|align\s*=/i.test(html)) return null;
  const d = doc ?? new DOMParser().parseFromString(html, 'text/html');
  const corpo = d.body;
  if (!corpo) return null;

  // só os blocos "folha" (sem outro bloco dentro) — são os parágrafos de verdade
  const folhas = [...corpo.querySelectorAll(BLOCOS)].filter(el => !el.querySelector(BLOCOS));
  const itens = [];
  for (const el of folhas) {
    const texto = el.textContent.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const tag = el.tagName.toLowerCase();
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) itens.push({ md: `${'#'.repeat(Number(heading[1]))} ${texto}`, align: alignOf(el, corpo) });
    else if (tag === 'li') itens.push({ md: `- ${texto}`, align: null });
    else if (tag === 'blockquote') itens.push({ md: `> ${texto}`, align: null });
    else itens.push({ md: texto, align: alignOf(el, corpo) });
  }
  if (!itens.some(i => normalizeTextAlign(i.align))) return null;

  const saida = [];
  for (let i = 0; i < itens.length; i++) {
    const { md, align } = itens[i];
    const a = normalizeTextAlign(align);
    const abre = a && itens[i - 1]?.align !== align;
    const fecha = a && itens[i + 1]?.align !== align;
    saida.push((abre ? `<div align="${a}">\n\n` : '') + md + (fecha ? '\n\n</div>' : ''));
  }
  return saida.join('\n');
}
