import { t as traduzir } from '../i18n.js';
import { reorderNoteRecords } from '../storage.js';
import { activateNote } from './lifecycle.js';
import { asideEl, asideListEl, renderNotesListRows } from './notes-list.js';
import { S, tabsEl } from './state.js';
import { openTabMenu } from './tab-menu.js';

tabsEl.addEventListener('wheel', e => {
  if (e.deltaY === 0) return;
  e.preventDefault();
  tabsEl.scrollLeft += e.deltaY;
}, { passive: false });

export function cleanupTabDrag() {
  S.tabDropIndicatorEl?.remove();
  S.tabDropIndicatorEl = null;
  S.noteDragSrcId = null;
}

export async function reorderNotes(srcId, targetId, before) {
  if (srcId == null || srcId === targetId) return false;
  const from = S.notesMeta.findIndex(n => n.id === srcId);
  if (from === -1) return false;
  const [moved] = S.notesMeta.splice(from, 1);
  let to = S.notesMeta.findIndex(n => n.id === targetId);
  if (to === -1) to = S.notesMeta.length;
  else if (!before) to += 1;
  S.notesMeta.splice(to, 0, moved);
  await reorderNoteRecords(S.notesMeta.map(n => n.id));
  return true;
}

export function setAccent(color) {
  document.documentElement.style.setProperty(
    '--note-accent',
    color || 'color-mix(in srgb, var(--accent) 75%, #000)'
  );
}

export function renderTabs() {
  tabsEl.innerHTML = '';
  for (const meta of S.notesMeta) tabsEl.appendChild(buildTab(meta));
  // a aside mostra a mesma lista: se estiver aberta, acompanha a nota ativa
  if (asideEl?.classList.contains('open')) renderNotesListRows(asideListEl);
}

export function scrollTabIntoView(id) {
  const tab = tabsEl.querySelector(`.note-tab[data-id="${id}"]`);
  tab?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

export function buildTabIndicator(meta) {
  if (meta.icon) {
    const span = document.createElement('span');
    span.className = 'note-tab-icon material-symbols-rounded' + (meta.iconFilled ? ' icon-filled' : '');
    span.textContent = meta.icon;
    span.style.color = meta.color || 'var(--text-muted)';
    return span;
  }

  if (meta.color) {
    const dot = document.createElement('span');
    dot.className = 'note-tab-dot';
    dot.style.background = meta.color;
    return dot;
  }

  return null;
}

export function buildTab(meta) {
  const tab = document.createElement('div');
  tab.className = 'note-tab' + (meta.id === S.activeId ? ' active' : '');
  tab.draggable = true;
  tab.dataset.id = String(meta.id);
  tab.title = meta.title || traduzir('Sem título');

  const indicator = buildTabIndicator(meta);

  // Só oculta o nome se sobrar ícone ou cor pra identificar a aba — nunca os
  // três (ícone, cor e nome) somem ao mesmo tempo.
  const titleHidden = !!meta.titleHidden && !!(meta.icon || meta.color);

  const title = document.createElement('span');
  title.className   = 'note-tab-title';
  title.textContent = meta.title || traduzir('Sem título');
  title.hidden       = titleHidden;

  if (indicator) tab.appendChild(indicator);
  tab.appendChild(title);

  // Um clique só troca de nota (nunca abre menu, pra não abrir sem querer).
  // O clique duplo — em qualquer parte da aba: texto, ícone ou cor — abre o
  // mesmo menu de sempre (Renomear / Ícone e cor / Copiar / Baixar / Excluir),
  // sem precisar mais do botão "⋯" só pra isso, deixando a aba mais compacta.
  tab.addEventListener('click', async () => {
    if (meta.id === S.activeId) return;
    await activateNote(meta.id);
    renderTabs();
  });
  tab.addEventListener('dblclick', e => {
    e.preventDefault();
    openTabMenu(meta, tab);
  });

  tab.addEventListener('dragstart', e => {
    S.noteDragSrcId = meta.id;
    e.dataTransfer.effectAllowed = 'move';
    S.tabDropIndicatorEl = document.createElement('div');
    S.tabDropIndicatorEl.className = 'tab-drop-indicator';
  });
  tab.addEventListener('dragover', e => {
    if (S.noteDragSrcId == null || S.noteDragSrcId === meta.id || !S.tabDropIndicatorEl) return;
    e.preventDefault();
    const rect = tab.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    tab[before ? 'before' : 'after'](S.tabDropIndicatorEl);
  });
  tab.addEventListener('drop', async e => {
    e.preventDefault();
    if (S.noteDragSrcId == null) return;
    const rect = tab.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    const srcId = S.noteDragSrcId;
    cleanupTabDrag();
    const moved = await reorderNotes(srcId, meta.id, before);
    if (moved) { renderTabs(); scrollTabIntoView(srcId); }
  });
  tab.addEventListener('dragend', cleanupTabDrag);

  return tab;
}
