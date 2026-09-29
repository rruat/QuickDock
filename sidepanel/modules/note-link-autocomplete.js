// Menu de autocomplete de links [[ — sugere notas existentes (ou criar uma
// nova) ao digitar [[ dentro de um bloco.
import { loadAllNotesMeta } from './storage.js';
import { escHtml } from './blocks.js';
import { getContentEl, getCaretOffset } from './note-dom-utils.js';
import { positionMenu } from './note-detection.js';
import {
  getCurrentNoteId, captureUndoPoint, scheduleSave, replaceRangeWithTag,
} from './note.js';

// ── Menu de Autocomplete de Links [[ ──────────────────────────────────────────
let linkAutocompleteEl = null;
let linkAutocompleteItems = [];
let linkAutocompleteIndex = 0;
let linkAutocompleteBlock = null;
let linkAutocompleteStartOffset = 0;
let linkAutocompleteEndOffset = 0;

export function closeLinkAutocomplete() {
  if (linkAutocompleteEl) {
    linkAutocompleteEl.remove();
    linkAutocompleteEl = null;
  }
  linkAutocompleteItems = [];
  linkAutocompleteBlock = null;
}

export async function checkLinkAutocomplete(block) {
  if (!block || block.dataset.type === 'code' || block.dataset.type === 'table') {
    closeLinkAutocomplete();
    return;
  }
  const contentEl = getContentEl(block);
  if (!contentEl) {
    closeLinkAutocomplete();
    return;
  }
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !contentEl.contains(sel.anchorNode)) {
    closeLinkAutocomplete();
    return;
  }

  const offset = getCaretOffset(contentEl);
  const before = contentEl.textContent.slice(0, offset);

  // Detecta [[ seguido de até 50 caracteres sem fechamento
  const m = /(?:^|[^\\])\[\[([^\]\n]{0,50})$/.exec(before);
  if (!m) {
    closeLinkAutocomplete();
    return;
  }

  const matchStr = m[0].startsWith('[[') ? m[0] : m[0].slice(1);
  const startOffset = offset - matchStr.length;
  const rawQuery = m[1];
  const query = rawQuery.trim().toLowerCase();

  let allNotes = [];
  try {
    allNotes = await loadAllNotesMeta();
  } catch (err) {
    console.warn('Erro ao carregar notas para autocomplete:', err);
  }

  const filtradas = allNotes.filter(n => {
    if (n.id === getCurrentNoteId()) return false;
    if (!query) return true;
    const t = (n.title || '').toLowerCase();
    const p = (n.pasta || '').toLowerCase();
    return t.includes(query) || p.includes(query);
  });

  const items = filtradas.slice(0, 7).map(n => ({
    type: 'note',
    id: n.id,
    uid: n.uid,
    title: n.title || 'Sem título',
    pasta: n.pasta || '',
    icon: n.icon || 'description',
    color: n.color
  }));

  const queryLimpo = rawQuery.trim();
  if (queryLimpo && !allNotes.some(n => (n.title || '').trim().toLowerCase() === queryLimpo.toLowerCase())) {
    items.push({
      type: 'create',
      title: queryLimpo
    });
  }

  if (items.length === 0) {
    closeLinkAutocomplete();
    return;
  }

  linkAutocompleteItems = items;
  linkAutocompleteBlock = block;
  linkAutocompleteStartOffset = startOffset;
  linkAutocompleteEndOffset = offset;
  if (linkAutocompleteIndex >= items.length) linkAutocompleteIndex = 0;

  renderLinkAutocomplete(block, items);
}

function renderLinkAutocomplete(block, items) {
  if (!linkAutocompleteEl) {
    linkAutocompleteEl = document.createElement('div');
    linkAutocompleteEl.className = 'link-autocomplete-menu';
    document.body.appendChild(linkAutocompleteEl);
  }

  linkAutocompleteEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'link-autocomplete-header';
  header.textContent = 'Conectar a uma nota';
  linkAutocompleteEl.appendChild(header);

  const list = document.createElement('div');
  list.className = 'link-autocomplete-list';

  items.forEach((item, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-autocomplete-item' + (index === linkAutocompleteIndex ? ' active' : '');
    if (item.type === 'create') {
      btn.classList.add('create-item');
      btn.innerHTML = `
        <span class="link-item-icon">➕</span>
        <span class="link-item-title">Criar nota "<strong>${escHtml(item.title)}</strong>"</span>
      `;
    } else {
      const folderBadge = item.pasta ? `<span class="link-item-folder">${escHtml(item.pasta)}</span>` : '';
      btn.innerHTML = `
        <span class="link-item-icon">📄</span>
        <span class="link-item-title">${escHtml(item.title)}</span>
        ${folderBadge}
      `;
    }

    btn.addEventListener('mousedown', e => {
      e.preventDefault();
    });

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      linkAutocompleteIndex = index;
      confirmLinkAutocompleteSelection();
    });

    list.appendChild(btn);
  });

  linkAutocompleteEl.appendChild(list);
  positionMenu(linkAutocompleteEl, block.getBoundingClientRect());
  highlightLinkAutocompleteItem();
}

function highlightLinkAutocompleteItem() {
  if (!linkAutocompleteEl) return;
  const items = linkAutocompleteEl.querySelectorAll('.link-autocomplete-item');
  items.forEach((it, i) => it.classList.toggle('active', i === linkAutocompleteIndex));
  items[linkAutocompleteIndex]?.scrollIntoView({ block: 'nearest' });
}

export function moveLinkAutocompleteSelection(delta) {
  if (!linkAutocompleteItems.length) return;
  linkAutocompleteIndex = (linkAutocompleteIndex + delta + linkAutocompleteItems.length) % linkAutocompleteItems.length;
  highlightLinkAutocompleteItem();
}

export async function confirmLinkAutocompleteSelection() {
  const item = linkAutocompleteItems[linkAutocompleteIndex];
  if (!item || !linkAutocompleteBlock) {
    closeLinkAutocomplete();
    return;
  }

  const contentEl = getContentEl(linkAutocompleteBlock);
  if (!contentEl) {
    closeLinkAutocomplete();
    return;
  }

  let allNotes = [];
  try {
    allNotes = await loadAllNotesMeta();
  } catch {}

  const duplicateTitle = item.type === 'note' && item.title && allNotes.filter(n => (n.title || '').trim().toLowerCase() === item.title.trim().toLowerCase()).length > 1;

  let targetPath = item.title;
  if (duplicateTitle && item.pasta) {
    const cleanPasta = String(item.pasta).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (cleanPasta) {
      targetPath = `${cleanPasta}/${item.title}`;
    }
  }

  const displayText = item.title;
  if (item.type === 'create') {
    document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
      detail: { title: item.title, createIfMissing: true }
    }));
  }

  captureUndoPoint();
  replaceRangeWithTag(
    contentEl,
    linkAutocompleteStartOffset,
    linkAutocompleteEndOffset,
    'a',
    displayText,
    {
      href: `nota:${encodeURIComponent(targetPath)}`,
      class: 'note-internal-link',
      'data-note-title': targetPath,
      'data-note-path': targetPath,
      ...(item.uid ? { 'data-note-uid': item.uid } : {}),
      title: `Ctrl+clique para abrir nota: ${targetPath}`
    }
  );

  closeLinkAutocomplete();
  scheduleSave();
}

export function closeLinkAutocompleteIfOutside(target) {
  if (linkAutocompleteEl && !linkAutocompleteEl.contains(target)) closeLinkAutocomplete();
}

export function isLinkAutocompleteOpen() {
  return !!linkAutocompleteEl;
}
