import { activateNote } from './lifecycle.js';
import { S, btnNotesList, tabsEl } from './state.js';
import { openTabMenu } from './tab-menu.js';
import { buildTabIndicator, renderTabs, reorderNotes, scrollTabIntoView } from './tab-strip.js';

export const asideEl     = document.getElementById('notes-aside');

export const asideListEl = document.getElementById('notes-aside-list');

export function setNotesAside(open) {
  asideEl.classList.toggle('open', open);
  btnNotesList.classList.toggle('active', open);
  if (open) renderNotesListRows(asideListEl);
}

export function closeNotesListPopover() { setNotesAside(false); }

export function openTabMenuForNote(meta) {
  closeNotesListPopover();
  const tabEl = tabsEl.querySelector(`.note-tab[data-id="${meta.id}"]`);
  if (!tabEl) return;
  // Sem "smooth" aqui: o menu abre logo em seguida e precisa da posição
  // final da aba, não de uma posição no meio de uma animação de rolagem.
  tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  openTabMenu(meta, tabEl);
}

export function cleanupListDrag() {
  S.listDropIndicatorEl?.remove();
  S.listDropIndicatorEl = null;
  S.noteDragSrcId = null;
}

export function renderNotesListRows(pop) {
  pop.querySelectorAll('.notes-list-item').forEach(el => el.remove());

  for (const meta of S.notesMeta) {
    const row = document.createElement('div');
    row.className = 'copy-opt notes-list-item' + (meta.id === S.activeId ? ' current' : '');
    row.draggable = true;
    row.dataset.id = String(meta.id);

    const indicator = buildTabIndicator(meta);
    const label = document.createElement('span');
    label.className = 'copy-opt-value';
    label.textContent = meta.title || 'Sem título';
    if (indicator) row.appendChild(indicator);
    row.appendChild(label);

    const editBtn = document.createElement('button');
    editBtn.className   = 'notes-list-edit-btn';
    editBtn.textContent = '⋯';
    editBtn.title       = 'Opções da nota';
    editBtn.addEventListener('mousedown', e => e.stopPropagation());
    editBtn.addEventListener('click', e => { e.stopPropagation(); openTabMenuForNote(meta); });
    row.appendChild(editBtn);

    row.addEventListener('mousedown', e => e.stopPropagation());
    row.addEventListener('click', async () => {
      closeNotesListPopover();
      if (meta.id !== S.activeId) { await activateNote(meta.id); renderTabs(); }
      scrollTabIntoView(meta.id);
    });

    row.addEventListener('dragstart', e => {
      e.stopPropagation();
      S.noteDragSrcId = meta.id;
      e.dataTransfer.effectAllowed = 'move';
      S.listDropIndicatorEl = document.createElement('div');
      S.listDropIndicatorEl.className = 'notes-list-drop-indicator';
    });
    row.addEventListener('dragover', e => {
      if (S.noteDragSrcId == null || S.noteDragSrcId === meta.id || !S.listDropIndicatorEl) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      row[before ? 'before' : 'after'](S.listDropIndicatorEl);
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (S.noteDragSrcId == null) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const srcId = S.noteDragSrcId;
      cleanupListDrag();
      const moved = await reorderNotes(srcId, meta.id, before);
      if (moved) { renderNotesListRows(pop); renderTabs(); }
    });
    row.addEventListener('dragend', e => { e.stopPropagation(); cleanupListDrag(); });

    pop.appendChild(row);
  }
}

btnNotesList.addEventListener('click', e => {
  e.stopPropagation();
  setNotesAside(!asideEl.classList.contains('open'));
});

document.getElementById('btn-notes-close')?.addEventListener('click', e => {
  e.stopPropagation();
  setNotesAside(false);
});

document.getElementById('notes-dim')?.addEventListener('click', e => {
  e.stopPropagation();
  setNotesAside(false);
});

document.addEventListener('mousedown', e => {
  if (!asideEl.classList.contains('open')) return;
  if (asideEl.contains(e.target) || btnNotesList.contains(e.target)) return;
  setNotesAside(false);
});
