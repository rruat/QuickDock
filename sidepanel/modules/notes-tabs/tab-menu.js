import { blocksToPlainText } from '../blocks.js';
import { refreshDocuments } from '../documents.js';
import { blocksToExportMarkdown, clearCurrentNote } from '../note.js';
import { positionPopover } from '../popover.js';
import { deleteNoteRecordById, detachFilesFromNote, gcInlineFiles, updateNoteBlocksById, updateNoteMetaById } from '../storage.js';
import { renderAppearanceContent } from './appearance.js';
import { activateNote } from './lifecycle.js';
import { downloadText, getBlocksForNote, safeFilename } from './note-io.js';
import { S } from './state.js';
import { renderTabs } from './tab-strip.js';

export function closeTabMenu() {
  S.tabMenuEl?.remove();
  S.tabMenuEl = null;
  S.tabMenuAppearanceOpen = false;
}

export function renderTabMenu(meta, anchorEl) {
  const menu = S.tabMenuEl ?? document.createElement('div');
  menu.className = 'copy-menu tab-menu';
  menu.innerHTML = '';

  // Nome — o próprio input já dentro do menu, sem botão "Renomear" separado.
  const renameInput = document.createElement('input');
  renameInput.className = 'tab-menu-rename';
  renameInput.value = meta.title;
  renameInput.placeholder = 'Sem título';
  renameInput.addEventListener('mousedown', e => e.stopPropagation());
  renameInput.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  renameInput.blur();
    if (e.key === 'Escape') { renameInput.value = meta.title; renameInput.blur(); }
  });
  renameInput.addEventListener('blur', async () => {
    const val = renameInput.value.trim() || 'Sem título';
    if (val === meta.title) return;
    await updateNoteMetaById(meta.id, { title: val });
    meta.title = val;
    renderTabs();
  });
  // Campo com ícone de edição à esquerda, como nos campos da Apple.
  const renameWrap = document.createElement('div');
  renameWrap.className = 'tab-menu-rename-wrap';
  renameWrap.innerHTML = '<span class="tab-menu-rename-icon material-symbols-rounded">edit</span>';
  renameWrap.appendChild(renameInput);
  menu.appendChild(renameWrap);

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  // Ícone e cor — dropdown embutido no mesmo menu, em vez de abrir outro
  // popover por cima. Expande/recolhe sem fechar o menu.
  const appearanceToggle = document.createElement('button');
  appearanceToggle.className = 'copy-opt tab-menu-appearance-toggle';
  appearanceToggle.innerHTML =
    `<span class="copy-opt-icon material-symbols-rounded">palette</span><span class="copy-opt-value">Ícone e cor</span><span class="copy-opt-hint">${S.tabMenuAppearanceOpen ? '▲' : '▼'}</span>`;
  appearanceToggle.addEventListener('mousedown', e => e.stopPropagation());
  appearanceToggle.addEventListener('click', e => {
    e.stopPropagation();
    S.tabMenuAppearanceOpen = !S.tabMenuAppearanceOpen;
    renderTabMenu(meta, anchorEl);
  });
  menu.appendChild(appearanceToggle);

  if (S.tabMenuAppearanceOpen) {
    const wrap = document.createElement('div');
    wrap.className = 'tab-menu-appearance';
    renderAppearanceContent(wrap, meta);
    menu.appendChild(wrap);
  }

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  // Ícone à esquerda (Material Symbols), como nos menus da Apple.
  const addOpt = (icon, label, run) => {
    const btn = document.createElement('button');
    btn.className = 'copy-opt';
    btn.innerHTML = `<span class="copy-opt-icon material-symbols-rounded">${icon}</span><span class="copy-opt-value">${label}</span>`;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', async e => { e.stopPropagation(); closeTabMenu(); await run(); });
    menu.appendChild(btn);
  };

  addOpt('code', 'Copiar como Markdown', async () => {
    const text = await blocksToExportMarkdown(await getBlocksForNote(meta));
    await navigator.clipboard.writeText(text);
  });
  addOpt('content_copy', 'Copiar como texto', async () => {
    const text = blocksToPlainText(await getBlocksForNote(meta));
    await navigator.clipboard.writeText(text);
  });
  addOpt('download', 'Baixar .md', async () => {
    const text = await blocksToExportMarkdown(await getBlocksForNote(meta));
    downloadText(`${safeFilename(meta.title)}.md`, text);
  });
  addOpt('description', 'Baixar .txt', async () => {
    const text = blocksToPlainText(await getBlocksForNote(meta));
    downloadText(`${safeFilename(meta.title)}.txt`, text);
  });

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  addOpt('ink_eraser', 'Limpar conteúdo', async () => {
    if (!confirm(`Limpar o conteúdo de "${meta.title}"?\n\nO nome, a cor e os documentos da nota não mudam.`)) return;
    if (meta.id === S.activeId) await clearCurrentNote();
    else await updateNoteBlocksById(meta.id, [], '');
  });

  addOpt('delete', 'Excluir', async () => {
    if (S.notesMeta.length <= 1) { alert('Deve existir ao menos uma nota.'); return; }
    if (!confirm(`Excluir a nota "${meta.title}"?`)) return;
    // Os documentos vinculados viram gerais: some a nota, não os arquivos.
    await detachFilesFromNote(meta.id);
    await deleteNoteRecordById(meta.id);
    // Imagem inline só existe dentro daquela nota: sem a nota, é lixo.
    await gcInlineFiles();
    S.notesMeta = S.notesMeta.filter(n => n.id !== meta.id);
    if (S.activeId === meta.id) await activateNote(S.notesMeta[0].id);
    await refreshDocuments();
    renderTabs();
  });

  if (!S.tabMenuEl) {
    document.body.appendChild(menu);
    S.tabMenuEl = menu;
  }
  positionPopover(menu, anchorEl);
}

export function openTabMenu(meta, anchorEl) {
  closeTabMenu();
  renderTabMenu(meta, anchorEl);
  const renameInput = S.tabMenuEl.querySelector('.tab-menu-rename');
  renameInput?.focus();
  renameInput?.select();
}

document.addEventListener('mousedown', e => {
  if (S.tabMenuEl && !S.tabMenuEl.contains(e.target)) closeTabMenu();
});
