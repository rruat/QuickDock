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

export const MD_BUTTONS = [
  { label: 'B',   title: 'Negrito (selecione o texto)',   action: () => execFormat('bold') },
  { label: 'I',   title: 'Itálico (selecione o texto)',   action: () => execFormat('italic') },
  { label: 'S',   title: 'Riscado (selecione o texto)',   action: () => execFormat('strikeThrough') },
  { label: '</>', title: 'Código (selecione o texto)',     action: () => wrapSelectionInTag('code') },
  { label: '🔗',  title: 'Link (Ctrl+K)',                  action: () => applyLink() },
  null,
  { label: 'T',   title: 'Texto normal (remove a formatação do bloco)', action: () => convertSelectedBlocks('paragraph') },
  { label: 'H1',  title: 'Título 1',                       action: () => convertSelectedBlocks('heading1') },
  { label: 'H2',  title: 'Título 2',                       action: () => convertSelectedBlocks('heading2') },
  { label: 'H3',  title: 'Título 3',                       action: () => convertSelectedBlocks('heading3') },
  null,
  { label: '•',   title: 'Lista com marcadores',           action: () => convertSelectedBlocks('bullet') },
  { label: '1.',  title: 'Lista numerada',                 action: () => convertSelectedBlocks('number') },
  { label: '☐',   title: 'Checklist',                      action: () => convertSelectedBlocks('checklist') },
  null,
  { label: '"',   title: 'Citação (clique de novo pra tirar)', action: toggleQuotedOnSelection },
  { label: '—',   title: 'Linha horizontal',                action: () => insertDividerAtCursor() },
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
  btn.className   = 'tt-btn';
  btn.title       = b.title;
  btn.textContent = b.label;
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', b.action);
  mdBar.appendChild(btn);
}
