import { t as tr } from '../i18n.js';
import { createBlockEl } from './block-model.js';
import { convertBlockType, currentBlock, focusBlockStart, getBlockFromNode, renumberLists } from './block-ops.js';
import { getContentEl, isBlockQuoted, setBlockQuoted } from './block-structure.js';
import { getCaretOffset, setCaretOffset } from './caret.js';
import { applyLink } from './links.js';
import { scheduleRescan } from './rescan.js';
import { root } from './state.js';
import { scheduleSave } from './template-mode.js';
import { ttBar } from './transforms.js';
import { captureUndoPoint } from './undo.js';

export function execFormat(command) {
  captureUndoPoint();
  document.execCommand(command, false, null);
  const block = currentBlock();
  if (block) scheduleRescan(block);
  scheduleSave();
}

export function wrapSelectionInTag(tag) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  captureUndoPoint();
  const el = document.createElement(tag);
  el.appendChild(range.extractContents());
  range.insertNode(el);

  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNode(el);
  sel.addRange(r);

  const block = getBlockFromNode(el);
  if (block) scheduleRescan(block);
  scheduleSave();
}

export function getSelectedBlocks() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return [];
  const range = sel.getRangeAt(0);
  const startBlock = getBlockFromNode(range.startContainer);
  const endBlock   = getBlockFromNode(range.endContainer);
  if (!startBlock) return [];
  if (!endBlock || startBlock === endBlock) return [startBlock];

  const blocks = [];
  for (let el = startBlock; el; el = el.nextElementSibling) {
    blocks.push(el);
    if (el === endBlock) break;
  }
  return blocks;
}

export function toggleQuotedOnSelection() {
  const blocks = getSelectedBlocks();
  if (blocks.length === 0) return;
  captureUndoPoint();
  const todosCitados = blocks.every(isBlockQuoted);
  for (const b of blocks) setBlockQuoted(b, !todosCitados);
  renumberLists();
  scheduleSave();
}

export function convertSelectedBlocks(type) {
  const blocks = getSelectedBlocks();
  if (blocks.length === 0) return;

  captureUndoPoint();

  if (blocks.length === 1) {
    const block   = blocks[0];
    const content = getContentEl(block);
    const offset  = getCaretOffset(content);

    const newBlock   = convertBlockType(block, type, block.dataset.checked === 'true');
    const newContent = getContentEl(newBlock);
    newContent.focus();
    setCaretOffset(newContent, offset);
  } else {
    const newBlocks  = blocks.map(b => convertBlockType(b, type, b.dataset.checked === 'true'));
    const lastContent = getContentEl(newBlocks[newBlocks.length - 1]);
    lastContent.focus();
    setCaretOffset(lastContent, lastContent.textContent.length);
  }

  renumberLists();
  scheduleSave();
}

export function insertDividerAtCursor() {
  const block = currentBlock();
  if (!block) return;
  captureUndoPoint();
  const divider = createBlockEl('divider');
  block.after(divider);
  const para = createBlockEl('paragraph');
  divider.after(para);
  focusBlockStart(para);
  renumberLists();
  scheduleSave();
}

// Ícones no estilo SF Symbols: traço fino e arredondado (24x24).
const ICONE = {
  bold:      "<path d='M6 4h7a4 4 0 0 1 0 8H6z'/><path d='M6 12h8a4 4 0 0 1 0 8H6z'/>",
  italic:    "<path d='M14 4h-4'/><path d='M14 20h-4'/><path d='M15 4L9 20'/>",
  strike:    "<path d='M4 12h16'/><path d='M16 7.5C16 5.6 14.2 4.5 12 4.5S8 5.6 8 7.6c0 4.4 8 3.2 8 7.4 0 2-1.8 3.5-4 3.5s-4-1.2-4-3.5'/>",
  code:      "<path d='M8 8l-4 4 4 4'/><path d='M16 8l4 4-4 4'/><path d='M13.5 5l-3 14'/>",
  link:      "<path d='M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1'/><path d='M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'/>",
  paragraph: "<path d='M5 6h14'/><path d='M5 10h14'/><path d='M5 14h9'/>",
  quote:     "<path d='M6 17h3l2-4V7H5v6h3z'/><path d='M14 17h3l2-4V7h-6v6h3z'/>",
  bullets:   "<path d='M9 6h11'/><path d='M9 12h11'/><path d='M9 18h11'/><path d='M4.5 6h.01'/><path d='M4.5 12h.01'/><path d='M4.5 18h.01'/>",
  numbers:   "<path d='M10 6h11'/><path d='M10 12h11'/><path d='M10 18h11'/><path d='M3.5 5.5L5 4.5v5'/><path d='M3.5 14.5h3l-3 3.5h3'/>",
  checklist: "<rect x='3.5' y='4' width='7' height='7' rx='2'/><path d='M5 7.5l1.5 1.5 2.5-2.5'/><path d='M13 7.5h8'/><path d='M3.5 15.5h7'/><path d='M13 17.5h8'/>",
  divider:   "<path d='M4 12h16'/>",
};

const svgDe = corpo => `<svg viewBox='0 0 24 24' aria-hidden='true'>${corpo}</svg>`;

export const MD_BUTTONS = [
  { icon: svgDe(ICONE.bold),   title: tr('Negrito (selecione o texto)'),   action: () => execFormat('bold') },
  { icon: svgDe(ICONE.italic), title: tr('Itálico (selecione o texto)'),   action: () => execFormat('italic') },
  { icon: svgDe(ICONE.strike), title: tr('Riscado (selecione o texto)'),   action: () => execFormat('strikeThrough') },
  { icon: svgDe(ICONE.code),   title: tr('Código (selecione o texto)'),     action: () => wrapSelectionInTag('code') },
  { icon: svgDe(ICONE.link),   title: tr('Link (Ctrl+K)'),                  action: () => applyLink() },
  null,
  { icon: svgDe(ICONE.paragraph), title: tr('Texto normal (remove a formatação do bloco)'), action: () => convertSelectedBlocks('paragraph') },
  { label: 'H1',  title: tr('Título 1'),                       action: () => convertSelectedBlocks('heading1') },
  { label: 'H2',  title: tr('Título 2'),                       action: () => convertSelectedBlocks('heading2') },
  { label: 'H3',  title: tr('Título 3'),                       action: () => convertSelectedBlocks('heading3') },
  null,
  { icon: svgDe(ICONE.bullets),   title: tr('Lista com marcadores'),           action: () => convertSelectedBlocks('bullet') },
  { icon: svgDe(ICONE.numbers),   title: tr('Lista numerada'),                 action: () => convertSelectedBlocks('number') },
  { icon: svgDe(ICONE.checklist), title: tr('Checklist'),                      action: () => convertSelectedBlocks('checklist') },
  null,
  { icon: svgDe(ICONE.quote),     title: tr('Citação (clique de novo pra tirar)'), action: toggleQuotedOnSelection },
  { icon: svgDe(ICONE.divider),   title: tr('Linha horizontal'),                action: () => insertDividerAtCursor() },
];

export const mdBar = ttBar;

{
  const groupSep = document.createElement('div');
  groupSep.className = 'tt-sep';
  mdBar.appendChild(groupSep);
}

for (const b of MD_BUTTONS) {
  if (b === null) {
    const sep = document.createElement('div');
    sep.className = 'tt-sep';
    mdBar.appendChild(sep);
    continue;
  }
  const btn = document.createElement('button');
  btn.className   = 'tt-btn' + (b.icon ? ' tt-btn-icon' : '');
  btn.title       = b.title;
  if (b.icon) btn.innerHTML = b.icon;
  else btn.textContent = b.label;
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', b.action);
  mdBar.appendChild(btn);
}
