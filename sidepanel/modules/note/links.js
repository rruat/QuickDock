import { safeHref } from '../blocks.js';
import { getBlockFromNode } from './block-ops.js';
import { showFeedback } from './feedback-ctrl.js';
import { positionMenu } from './menus.js';
import { scheduleRescan } from './rescan.js';
import { S, root } from './state.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export function currentLinkEl() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const a = node?.closest?.('a');
  return a && root.contains(a) ? a : null;
}

export function closeLinkMenu() { S.linkMenuEl?.remove(); S.linkMenuEl = null; }

export function openLinkMenu(anchorRect, { href = '', canRemove = false, onApply, onRemove }) {
  closeLinkMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu link-menu';

  const header = document.createElement('div');
  header.className   = 'copy-menu-header';
  header.textContent = canRemove ? 'Editar link' : 'Novo link';

  const input = document.createElement('input');
  input.className   = 'link-input';
  input.type        = 'text';
  input.value       = href;
  input.placeholder = 'exemplo.com.br';

  const error = document.createElement('div');
  error.className   = 'link-error';
  error.textContent = 'Endereço inválido';
  error.hidden      = true;

  const apply = () => {
    const url = safeHref(input.value);
    if (!url) { error.hidden = false; input.focus(); return; }
    closeLinkMenu();
    onApply(url);
  };

  input.addEventListener('mousedown', e => e.stopPropagation());
  input.addEventListener('input', () => { error.hidden = true; });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); apply(); }
    if (e.key === 'Escape') { e.preventDefault(); closeLinkMenu(); }
  });

  const actions = document.createElement('div');
  actions.className = 'link-actions';

  const okBtn = document.createElement('button');
  okBtn.className   = 'link-btn link-apply';
  okBtn.textContent = 'Aplicar';
  okBtn.addEventListener('mousedown', e => e.preventDefault());
  okBtn.addEventListener('click', apply);
  actions.appendChild(okBtn);

  if (canRemove) {
    const rmBtn = document.createElement('button');
    rmBtn.className   = 'link-btn link-remove';
    rmBtn.textContent = 'Remover';
    rmBtn.addEventListener('mousedown', e => e.preventDefault());
    rmBtn.addEventListener('click', () => { closeLinkMenu(); onRemove(); });
    actions.appendChild(rmBtn);
  }

  menu.append(header, input, error, actions);
  document.body.appendChild(menu);
  S.linkMenuEl = menu;
  positionMenu(menu, anchorRect);
  input.focus();
  input.select();
}

document.addEventListener('mousedown', e => {
  if (S.linkMenuEl && !S.linkMenuEl.contains(e.target)) closeLinkMenu();
});

export function applyLink() {
  const sel      = document.getSelection();
  const existing = currentLinkEl();
  const hasText  = sel && sel.rangeCount > 0 && !sel.isCollapsed
                   && root.contains(sel.getRangeAt(0).commonAncestorContainer);

  if (!existing && !hasText) { showFeedback('Selecione o texto do link'); return; }

  // O range e o bloco são guardados agora: abrir o menu tira o foco do editor
  // e a seleção deixa de existir quando o callback roda.
  const range = hasText ? sel.getRangeAt(0).cloneRange() : null;
  const block = getBlockFromNode(existing ?? range.commonAncestorContainer);
  const rect  = (existing ?? range).getBoundingClientRect();

  const done = () => {
    if (block) scheduleRescan(block);
    scheduleSave();
  };

  openLinkMenu(rect, {
    href: existing?.getAttribute('href') ?? '',
    canRemove: !!existing,
    onApply: url => {
      captureUndoPoint();
      if (existing) {
        existing.setAttribute('href', url);
      } else {
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.appendChild(range.extractContents());
        range.insertNode(a);
      }
      done();
    },
    onRemove: () => {
      captureUndoPoint();
      existing.replaceWith(...existing.childNodes);
      done();
    },
  });
}
