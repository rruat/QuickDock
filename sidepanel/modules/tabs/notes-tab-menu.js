// ── notes-tab-menu.js ────────────────────────────────────────────────────────
// Menu de contexto e opções da aba de nota ("⋯" ou botão direito contextmenu).
// Permite renomeação instantânea, alternância de ícone/cor, exportação (.md/.txt),
// mover para pastas e encerramento de abas.

import { positionPopover } from '../popover.js';

let tabMenuEl = null;
let tabMenuAppearanceOpen = false;

export function closeTabMenu() {
  tabMenuEl?.remove();
  tabMenuEl = null;
  tabMenuAppearanceOpen = false;
}

export function getTabMenuElement() {
  return tabMenuEl;
}

export function openTabMenu({
  meta,
  anchorEl,
  onRename = null,
  renderAppearanceContent = null,
  onCopyMarkdown = null,
  onCopyText = null,
  onDownloadMarkdown = null,
  onDownloadText = null,
  onMoveToFolder = null,
  onCloseTab = null,
  onCloseOtherTabs = null,
  onClearContent = null,
  onDeleteNote = null,
  hasMultipleTabs = false
}) {
  closeTabMenu();
  renderTabMenuInternal({
    meta,
    anchorEl,
    onRename,
    renderAppearanceContent,
    onCopyMarkdown,
    onCopyText,
    onDownloadMarkdown,
    onDownloadText,
    onMoveToFolder,
    onCloseTab,
    onCloseOtherTabs,
    onClearContent,
    onDeleteNote,
    hasMultipleTabs
  });

  const renameInput = tabMenuEl?.querySelector('.tab-menu-rename');
  renameInput?.focus();
  renameInput?.select();
}

function renderTabMenuInternal(ctx) {
  const {
    meta,
    anchorEl,
    onRename,
    renderAppearanceContent,
    onCopyMarkdown,
    onCopyText,
    onDownloadMarkdown,
    onDownloadText,
    onMoveToFolder,
    onCloseTab,
    onCloseOtherTabs,
    onClearContent,
    onDeleteNote,
    hasMultipleTabs
  } = ctx;

  const menu = tabMenuEl || document.createElement('div');
  menu.className = 'copy-menu tab-menu';
  menu.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = 'Opções da aba';
  menu.appendChild(head);

  // Renomear inline
  const renameInput = document.createElement('input');
  renameInput.type = 'text';
  renameInput.className = 'tab-menu-rename';
  renameInput.value = meta.title || '';
  renameInput.placeholder = 'Nome da nota';
  renameInput.spellcheck = false;
  renameInput.addEventListener('mousedown', e => e.stopPropagation());
  renameInput.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') renameInput.blur();
    if (e.key === 'Escape') {
      renameInput.value = meta.title || '';
      renameInput.blur();
    }
  });
  renameInput.addEventListener('change', async () => {
    const newTitle = renameInput.value.trim() || 'Sem título';
    renameInput.value = newTitle;
    if (onRename) await onRename(newTitle);
  });
  menu.appendChild(renameInput);

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  // Ícone e cor
  const appearanceToggle = document.createElement('button');
  appearanceToggle.className = 'copy-opt tab-menu-appearance-toggle';
  appearanceToggle.innerHTML =
    `<span class="copy-opt-value">Ícone e cor</span><span class="copy-opt-hint">${tabMenuAppearanceOpen ? '▲' : '▼'}</span>`;
  appearanceToggle.addEventListener('mousedown', e => e.stopPropagation());
  appearanceToggle.addEventListener('click', e => {
    e.stopPropagation();
    tabMenuAppearanceOpen = !tabMenuAppearanceOpen;
    renderTabMenuInternal(ctx);
  });
  menu.appendChild(appearanceToggle);

  if (tabMenuAppearanceOpen && renderAppearanceContent) {
    const wrap = document.createElement('div');
    wrap.className = 'tab-menu-appearance';
    renderAppearanceContent(wrap, meta);
    menu.appendChild(wrap);
  }

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  const addOpt = (label, run) => {
    if (!run) return;
    const btn = document.createElement('button');
    btn.className = 'copy-opt';
    btn.innerHTML = `<span class="copy-opt-value">${label}</span>`;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      closeTabMenu();
      await run();
    });
    menu.appendChild(btn);
  };

  addOpt('Copiar como Markdown', onCopyMarkdown);
  addOpt('Copiar como texto', onCopyText);
  addOpt('Baixar .md', onDownloadMarkdown);
  addOpt('Baixar .txt', onDownloadText);
  addOpt('Mover para pasta...', onMoveToFolder);

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  addOpt('Fechar aba', onCloseTab);

  if (hasMultipleTabs) {
    addOpt('Fechar outras abas', onCloseOtherTabs);
  }

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  addOpt('Limpar conteúdo', onClearContent);
  addOpt('Excluir', onDeleteNote);

  if (!tabMenuEl) {
    document.body.appendChild(menu);
    tabMenuEl = menu;
  }
  positionPopover(menu, anchorEl);
}
