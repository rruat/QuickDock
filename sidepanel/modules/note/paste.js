import { escHtml, parseMarkdownToBlocks } from '../blocks.js';
import { NO_DETECTION, createBlockEl, createBlockElFrom } from './block-model.js';
import { currentBlock, getBlockFromNode, renumberLists } from './block-ops.js';
import { blockDepth, getContentEl } from './block-structure.js';
import { applyDetectionMarks } from './detection.js';
import { absorbDataUrls, focusBlockEnd } from './images.js';
import { scheduleRescan } from './rescan.js';
import { root } from './state.js';
import { focusCell } from './table.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export function cellText(el) {
  return escHtml(el.textContent.replace(/\s+/g, ' ').trim());
}

export function normalizeGrid(rows) {
  const cols = Math.max(...rows.map(r => r.length));
  const out = rows.map(r => [...r, ...Array(cols - r.length).fill('')]);
  if (out.length === 1) out.push(Array(cols).fill(''));
  return out;
}

export function parseClipboardTable(html) {
  if (!html || !/<table/i.test(html)) return null;
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
  if (!table) return null;
  const rows = [...table.rows].map(tr => [...tr.cells].map(cellText));
  if (!rows.length || !rows[0].length) return null;
  return normalizeGrid(rows);
}

export function parseTsvTable(text) {
  if (!text.includes('\t')) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.length > 0);
  if (lines.length < 2) return null;
  return normalizeGrid(lines.map(l => l.split('\t').map(c => escHtml(c.trim()))));
}

export function insertTableBlock(rows) {
  const block = currentBlock() ?? root.lastElementChild;
  if (!block) return;

  captureUndoPoint();
  const table = createBlockEl('table', '', false, rows);

  // Cola por cima do bloco atual quando ele está vazio, em vez de deixar uma
  // linha em branco órfã acima da tabela.
  const empty = block.dataset.type !== 'table' && !getContentEl(block).textContent.trim();
  if (empty) block.replaceWith(table);
  else block.after(table);

  if (!table.nextElementSibling) table.after(createBlockEl('paragraph'));
  focusCell(table.querySelector('.table-cell'));
  renumberLists();
  scheduleSave();
}

export function pasteLink(label, href) {
  const sel = document.getSelection();
  const range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;
  if (!range || !root.contains(range.commonAncestorContainer)) { pasteInlineText(label); return; }

  captureUndoPoint();

  const a = document.createElement('a');
  a.setAttribute('href', href);
  if (!range.collapsed) a.appendChild(range.extractContents());
  if (!a.textContent.trim()) a.textContent = label;
  range.insertNode(a);

  const after = document.createRange();
  after.setStartAfter(a);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);

  const block = getBlockFromNode(a);
  if (block) scheduleRescan(block);
  scheduleSave();
}

export function pasteInlineText(text) {
  const sel = document.getSelection();
  let range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;
  if (!range || !root.contains(range.commonAncestorContainer)) {
    const last = root.lastElementChild;
    if (!last) return;
    const c = getContentEl(last);
    c.focus();
    range = document.createRange();
    range.selectNodeContents(c);
    range.collapse(false);
  }

  const block = getBlockFromNode(range.commonAncestorContainer);
  captureUndoPoint();

  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);

  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);

  if (block) scheduleRescan(block);
  scheduleSave();
}

export async function pasteMultilineText(text) {
  const block = currentBlock() ?? root.lastElementChild;
  if (!block) return;

  // Imagem em base64 vira arquivo antes de entrar no DOM (ver absorbDataUrls).
  const parsed = await absorbDataUrls(parseMarkdownToBlocks(text));

  captureUndoPoint();
  const base = blockDepth(block);
  const newEls = parsed
    .map(b => createBlockElFrom(base ? { ...b, depth: (b.depth ?? 0) + base } : b));

  const content = block.dataset.type === 'table' ? null : getContentEl(block);
  const isEmpty = content ? content.textContent.trim() === '' : false;

  let anchor = block;
  for (const el of newEls) { anchor.after(el); anchor = el; }
  if (isEmpty && block.dataset.type === 'paragraph') block.remove();

  renumberLists();
  for (const el of newEls) {
    if (!NO_DETECTION.has(el.dataset.type)) applyDetectionMarks(getContentEl(el));
  }
  focusBlockEnd(newEls[newEls.length - 1]);
  scheduleSave();
}
