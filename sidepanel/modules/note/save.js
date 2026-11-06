import { t as traduzir } from '../i18n.js';
import { safeHref } from '../blocks.js';
import { ANCORA } from './block-model.js';
import { blockDepth, getContentEl, isBlockQuoted } from './block-structure.js';
import { S, indicator, root } from './state.js';

export function sanitizeForSave(html, keepBreaks = false) {
  const div = document.createElement('div');
  div.innerHTML = html;
  // Marcas de detecção (CPF, datas…) não são formatação: somem ao salvar.
  div.querySelectorAll('mark:not(.md-highlight)').forEach(m => m.replaceWith(...m.childNodes));
  // Marcado-texto fica, mas só com a classe: sem data-syntax nem outros atributos.
  div.querySelectorAll('mark.md-highlight').forEach(m => {
    for (const attr of [...m.attributes]) if (attr.name !== 'class') m.removeAttribute(attr.name);
  });
  // Marcador do destaque (callout-marker.js): o tipo já está em data-callout; o texto "> [!NOTE]" não é conteúdo.
  div.querySelectorAll('.callout-marker').forEach(m => m.remove());
  // Sintaxe ao vivo (live-syntax.js): o atributo que desenha o símbolo nunca vai pro arquivo.
  div.querySelectorAll('[data-md-open]').forEach(el => el.removeAttribute('data-md-open'));
  // Link é o único elemento que carrega dado do usuário num atributo. Aqui é o
  // funil por onde passa tudo que é persistido — inclusive HTML colado de fora
  // —, então é onde href hostil e atributos de evento morrem.
  div.querySelectorAll('a').forEach(a => {
    const href = safeHref(a.getAttribute('href'));
    if (!href) { a.replaceWith(...a.childNodes); return; }
    [...a.attributes].forEach(attr => a.removeAttribute(attr.name));
    a.setAttribute('href', href);
  });
  if (!keepBreaks) div.querySelectorAll('br').forEach(br => br.remove());
  // Âncora invisível da formatação ao digitar (ver replaceRangeWithTag): ela é
  // um detalhe do cursor e nunca pode virar conteúdo salvo. Aqui é o funil por
  // onde tudo passa, então é o lugar certo pra garantir isso.
  div.innerHTML = div.innerHTML.split(ANCORA).join('');
  div.normalize();
  return div.innerHTML;
}

export function serializeBlockEl(block) {
  const type = block.dataset.type;
  const b = { id: block.dataset.id, type };
  const depth = blockDepth(block);
  if (depth) b.depth = depth;   // ausente = nível 0, que é o formato de antes
  if (isBlockQuoted(block)) b.quoted = true;
  if (block.dataset.callout) b.callout = block.dataset.callout;
  if (block.dataset.align) b.textAlign = block.dataset.align;
  if (type === 'divider') {
    // O divisor é editável (mostra "---" com o cursor). Se a pessoa apagar a
    // linha e escrever outra coisa, o texto não pode sumir: vira parágrafo.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(block.textContent.trim())) return b;
    b.type = 'paragraph';
    b.html = sanitizeForSave(block.innerHTML);
    return b;
  }
  if (type === 'pagebreak') {
    if (block.dataset.blank === 'true') b.blank = true;
    return b;
  }
  if (type === 'toc') return b;   // sumário: as entradas são calculadas a partir dos títulos
  if (type === 'audio' || type === 'video') {
    const fileId = Number(block.dataset.fileId);
    if (Number.isFinite(fileId)) b.fileId = fileId;
    if (block.dataset.alt) b.alt = block.dataset.alt;
    return b;
  }
  if (type === 'image') {
    const fileId = Number(block.dataset.fileId);
    if (Number.isFinite(fileId)) b.fileId = fileId;
    if (block.dataset.alt) b.alt = block.dataset.alt;
    return b;
  }
  if (type === 'table') {
    b.rows = [...block.querySelectorAll('tr')].map(tr =>
      [...tr.children].map(cell => sanitizeForSave(cell.innerHTML)));
    return b;
  }
  b.html = sanitizeForSave(getContentEl(block).innerHTML, type === 'code');
  if (type === 'checklist') b.checked = block.dataset.checked === 'true';
  return b;
}

export function serializeBlocks() {
  return [...root.children].map(serializeBlockEl);
}

export function getCurrentBlocks() {
  return serializeBlocks();
}

export function showSaved() {
  indicator.textContent = traduzir('salvo ✓');
  indicator.classList.add('visible');
  clearTimeout(S.indicatorTimer);
  S.indicatorTimer = setTimeout(() => indicator.classList.remove('visible'), 2200);
}
