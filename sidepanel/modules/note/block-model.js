import { t as tr } from '../i18n.js';
import { normalizeBlock, uid } from '../blocks.js';
import { getContentEl, setBlockCallout, setBlockDepth, setBlockQuoted } from './block-structure.js';
import { buildImageTools, setImageData } from './images.js';
import { buildMediaEl, setMediaData } from './media.js';
import { buildTableEl, buildTableTools } from './table.js';
import { renderToc } from './toc.js';

export const HEADING_TAGS = { heading1: 'h1', heading2: 'h2', heading3: 'h3', heading4: 'h4', heading5: 'h5', heading6: 'h6' };

export const NO_DETECTION = new Set(['code', 'divider', 'table', 'image', 'calc', 'audio', 'video', 'pagebreak', 'toc']);

// Blocos sem texto editável: o cursor não entra neles e Backspace não se funde a eles.
export const NO_TEXT_TYPES = new Set(['table', 'image', 'audio', 'video', 'pagebreak', 'toc']);

export const ANCORA = '​';

export function createBlockEl(type, innerHTML = '', checked = false, rows = null) {
  let el;

  // "quote" deixou de ser um tipo e virou decoração. Um registro antigo que
  // escape da normalização ainda chega aqui — vira parágrafo citado, que é a
  // forma nova do mesmo conteúdo.
  if (type === 'quote') {
    const p = createBlockEl('paragraph', innerHTML);
    setBlockQuoted(p, true);
    return p;
  }

  if (type === 'image') {
    el = document.createElement('div');
    el.className = 'block block-image';
    // Não editável, como a tabela e o divisor: o que se edita aqui é o texto
    // alternativo, por botão, não o conteúdo do bloco.
    el.contentEditable = 'false';
    const img = document.createElement('img');
    img.draggable = false;
    img.alt = '';
    el.append(img, buildImageTools());
    el.dataset.type = type;
    el.dataset.id = uid();
    return el;
  }

  if (type === 'table') {
    el = document.createElement('div');
    el.className = 'block block-table';
    // O bloco não é editável; cada célula é a sua própria ilha editável. É isso
    // que mantém a tabela fora das regras de Enter/Backspace dos outros blocos.
    el.contentEditable = 'false';
    el.append(buildTableEl(rows), buildTableTools());
    el.dataset.type = type;
    el.dataset.id = uid();
    return el;
  }

  if (HEADING_TAGS[type]) {
    el = document.createElement(HEADING_TAGS[type]);
    el.className = 'block';
    el.contentEditable = 'true';
    el.innerHTML = innerHTML;

  } else if (type === 'bullet' || type === 'number' || type === 'checklist') {
    el = document.createElement('div');
    el.className = 'block block-list' + (type === 'checklist' ? ' block-checklist' : '');
    const marker = document.createElement('span');
    marker.className = 'block-marker';
    marker.contentEditable = 'false';
    if (type === 'checklist') {
      marker.classList.add('cb-wrap');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!checked;
      marker.appendChild(cb);
      el.dataset.checked = checked ? 'true' : 'false';
    } else {
      marker.textContent = type === 'bullet' ? '•' : '1.';
    }
    const content = document.createElement('span');
    content.className = 'block-content';
    content.contentEditable = 'true';
    content.innerHTML = innerHTML;
    el.append(marker, content);

  } else if (type === 'calc') {
    el = document.createElement('div');
    el.className = 'block block-calc';
    const content = document.createElement('span');
    content.className = 'block-content';
    content.contentEditable = 'true';
    content.innerHTML = innerHTML;
    // O resultado fica fora do editável, na mesma estrutura de dois elementos
    // que lista e checklist usam. É o que impede o cursor de entrar nele ou de
    // apagá-lo sem querer — e o que faz getContentEl continuar valendo.
    const res = document.createElement('span');
    res.className = 'calc-result';
    res.contentEditable = 'false';
    el.append(content, res);

  } else if (type === 'code') {
    el = document.createElement('div');
    el.className = 'block block-code';
    const content = document.createElement('span');
    content.className = 'block-content';
    content.contentEditable = 'true';
    content.innerHTML = innerHTML;
    el.appendChild(content);

  } else if (type === 'divider') {
    // Editável, com a própria linha "---" como texto: quando o cursor não está
    // nele vira só a linha (CSS); quando o cursor entra, mostra o markdown.
    el = document.createElement('div');
    el.className = 'block block-divider';
    el.contentEditable = 'true';
    el.textContent = '---';

  } else if (type === 'pagebreak') {
    el = document.createElement('div');
    el.className = 'block block-pagebreak';
    el.contentEditable = 'false';
    el.innerHTML = '<span class="pagebreak-line" aria-hidden="true"></span>'
      + '<span class="pagebreak-label">' + tr('Quebra de página') + '</span>'
      + '<span class="pagebreak-line" aria-hidden="true"></span>';

  } else if (type === 'audio' || type === 'video') {
    el = buildMediaEl(type);

  } else if (type === 'toc') {
    el = document.createElement('div');
    el.className = 'block block-toc';
    el.contentEditable = 'false';
    renderToc(el);

  } else {
    el = document.createElement('p');
    el.className = 'block';
    el.contentEditable = 'true';
    el.innerHTML = innerHTML;
  }

  el.dataset.type = type;
  el.dataset.id = uid();

  // Um elemento editável totalmente vazio (sem nem um nó de texto) não fica
  // clicável/digitável de forma confiável em alguns navegadores — sobretudo
  // o <span> de conteúdo de listas/checklist/código, que colapsa a altura
  // zero quando vazio. Um <br> "segura" o espaço pro cursor.
  if (!NO_TEXT_TYPES.has(type)) {
    const contentEl = getContentEl(el);
    if (!contentEl.hasChildNodes()) contentEl.appendChild(document.createElement('br'));
  }

  return el;
}

/** "Página em branco" deixa uma página inteira vazia entre duas quebras. */
export function setPageBreakBlank(el, blank) {
  if (blank) el.dataset.blank = 'true';
  else delete el.dataset.blank;
  const rotulo = el.querySelector('.pagebreak-label');
  if (rotulo) rotulo.textContent = blank ? tr('Página em branco') : tr('Quebra de página');
}

/** Alinhamento do texto (left / center / right / justify), gravado no próprio bloco. */
export function setBlockAlign(el, align) {
  if (align && align !== 'left') {
    el.dataset.align = align;
    el.style.textAlign = align;
  } else {
    delete el.dataset.align;
    el.style.textAlign = '';
  }
}

export function createBlockElFrom(bruto) {
  const b  = normalizeBlock(bruto);
  const el = createBlockEl(b.type, b.html ?? '', b.checked ?? false, b.rows ?? null);
  if (b.id) el.dataset.id = b.id;
  setBlockDepth(el, b.depth ?? 0);
  setBlockQuoted(el, !!b.quoted);
  setBlockCallout(el, b.callout);
  if (b.textAlign) setBlockAlign(el, b.textAlign);
  if (b.type === 'image') setImageData(el, b);
  if (b.type === 'audio' || b.type === 'video') setMediaData(el, b);
  if (b.type === 'pagebreak') setPageBreakBlank(el, !!b.blank);
  return el;
}
