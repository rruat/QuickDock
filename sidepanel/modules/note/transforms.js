import { t as tr } from '../i18n.js';
import { getBlockFromNode } from './block-ops.js';
import { scheduleRescan } from './rescan.js';
import { root } from './state.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export const EMAIL_RE_GLOBAL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export function applySkipEmails(s, fn) {
  const segments = [];
  let pos = 0;
  EMAIL_RE_GLOBAL.lastIndex = 0;
  let m;
  while ((m = EMAIL_RE_GLOBAL.exec(s)) !== null) {
    if (m.index > pos) segments.push({ text: s.slice(pos, m.index), isEmail: false });
    segments.push({ text: m[0], isEmail: true });
    pos = m.index + m[0].length;
  }
  if (pos < s.length) segments.push({ text: s.slice(pos), isEmail: false });
  return segments.map(seg => seg.isEmail ? seg.text : fn(seg.text)).join('');
}

export function ttTitleCase(s)    { return s.replace(/(?<!\p{L})\p{L}/gu, c => c.toUpperCase()); }

export function ttSentenceCase(s) { return s.toLowerCase().replace(/(^|[.!?…]\s+)(\p{L})/gu, (_, p, c) => p + c.toUpperCase()); }

export function ttParaCase(s)     { return s.replace(/(^|\n)([ \t]*)(\p{L})/gu, (_, nl, sp, c) => nl + sp + c.toUpperCase()); }

export function ttInvertCase(s)   { return [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(''); }

export function ttNoAccents(s)    { return s.normalize('NFD').replace(/\p{Mn}/gu, ''); }

export function ttCleanSpaces(s)  { return s.replace(/[^\S\n]+/g, ' '); }

export function applyTransformToSelection(fn) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  captureUndoPoint();
  const block = getBlockFromNode(range.commonAncestorContainer);
  const transformed = applySkipEmails(range.toString(), fn);

  range.deleteContents();
  const textNode = document.createTextNode(transformed);
  range.insertNode(textNode);

  const newRange = document.createRange();
  newRange.selectNode(textNode);
  sel.removeAllRanges();
  sel.addRange(newRange);

  if (block) scheduleRescan(block);
  scheduleSave();
}

export const TRANSFORMS = [
  { label: 'AA', title: tr('MAIÚSCULO'),                      fn: s => s.toUpperCase() },
  { label: 'aa', title: tr('minúsculo'),                      fn: s => s.toLowerCase() },
  { label: 'Aa', title: tr('Primeira letra de cada palavra'), fn: ttTitleCase          },
  null,
  { label: 'A.', title: tr('Após pontuação'),                 fn: ttSentenceCase       },
  { label: '¶A', title: tr('Primeira letra do parágrafo'),    fn: ttParaCase           },
  null,
  { label: 'aA', title: tr('Inverter maiúsculas/minúsculas'), fn: ttInvertCase         },
  { label: 'Á',  title: tr('Remover acentos'),                fn: ttNoAccents          },
  { label: '⎵',  title: tr('Limpar espaços duplicados'),      fn: ttCleanSpaces        },
];

export const ttBar = document.createElement('div');

ttBar.className = 'quick-note-bar';

ttBar.addEventListener('wheel', e => {
  if (e.deltaY === 0) return;
  e.preventDefault();
  ttBar.scrollLeft += e.deltaY;
}, { passive: false });

document.querySelector('.note-section .note-main').appendChild(ttBar);

for (const t of TRANSFORMS) {
  if (t === null) {
    const sep = document.createElement('div');
    sep.className = 'tt-sep';
    ttBar.appendChild(sep);
    continue;
  }
  const btn = document.createElement('button');
  btn.className   = 'tt-btn';
  btn.title       = t.title;
  btn.textContent = t.label;
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => applyTransformToSelection(t.fn));
  ttBar.appendChild(btn);
}
