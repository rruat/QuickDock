// ── notes-drawer.js ─────────────────────────────────────────────────────────
// Renderização da árvore de pastas e lista de notas no painel Aside Drawer
// do QuickDock. Suporta busca com filtros, drag & drop de notas e pastas,
// renomeação inline e menu de contexto de pastas.

import { iconSvg } from '../icons.js';
import { positionPopover } from '../popover.js';
import { listarPastas, moverNotaParaPasta } from '../storage.js';
import { buildFolderTree, contarNotasTotal, getOpenFolders, saveOpenFolders } from './notes-folders.js';
import { startCreateFolderInline, startRenameFolderInline, renamingFolderPath } from './notes-folder-modals.js';
import { loadBoardsForDrawer, boardMatchesQuery, renderBoardRow } from './notes-drawer-boards.js';

let folderMenuEl = null;
export function closeFolderMenu() {
  folderMenuEl?.remove();
  folderMenuEl = null;
}

export function openFolderMenu({
  caminho,
  nivel,
  totalNotas,
  anchorEl,
  onRefresh,
  createNoteInFolder,
  promptExcluirPasta
}) {
  closeFolderMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu folder-context-menu';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = caminho;
  menu.appendChild(head);

  const btnNota = document.createElement('button');
  btnNota.className = 'copy-opt folder-add-note-btn';
  btnNota.innerHTML = '<span class="copy-opt-value">＋ Nova nota nesta pasta</span>';
  btnNota.addEventListener('click', async e => {
    e.stopPropagation();
    closeFolderMenu();
    if (createNoteInFolder) await createNoteInFolder(caminho, false);
    if (onRefresh) await onRefresh();
  });
  menu.appendChild(btnNota);

  const btnBase = document.createElement('button');
  btnBase.className = 'copy-opt';
  btnBase.innerHTML = '<span class="copy-opt-value">🗃️ Nova Base nesta pasta</span>';
  btnBase.addEventListener('click', async e => {
    e.stopPropagation();
    closeFolderMenu();
    if (createNoteInFolder) await createNoteInFolder(caminho, true);
    if (onRefresh) await onRefresh();
  });
  menu.appendChild(btnBase);

  const btnBoard = document.createElement('button');
  btnBoard.className = 'copy-opt';
  btnBoard.innerHTML = '<span class="copy-opt-value">🪐 Novo Espaço nesta pasta</span>';
  btnBoard.addEventListener('click', async e => {
    e.stopPropagation();
    closeFolderMenu();
    const titulo = prompt('Título do novo espaço:', 'Novo Espaço');
    if (titulo === null) return;
    const { createBlankBoard } = await import('../board-engine.js');
    const { switchView } = await import('../views.js');
    await createBlankBoard(titulo.trim() || 'Novo Espaço', caminho);
    switchView('board');
  });
  menu.appendChild(btnBoard);

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  if (nivel < 3) {
    const btnSub = document.createElement('button');
    btnSub.className = 'copy-opt';
    btnSub.innerHTML = '<span class="copy-opt-value">＋ Nova subpasta</span>';
    btnSub.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderMenu();
      await startCreateFolderInline({ parentPath: caminho, onDone: onRefresh });
    });
    menu.appendChild(btnSub);
  }

  const btnRenomear = document.createElement('button');
  btnRenomear.className = 'copy-opt';
  btnRenomear.innerHTML = '<span class="copy-opt-value">✎ Renomear pasta</span>';
  btnRenomear.addEventListener('click', async e => {
    e.stopPropagation();
    closeFolderMenu();
    await startRenameFolderInline({ caminho, onDone: onRefresh });
  });
  menu.appendChild(btnRenomear);

  const btnExcluir = document.createElement('button');
  btnExcluir.className = 'copy-opt folder-action-danger';
  btnExcluir.innerHTML = '<span class="copy-opt-value">🗑 Excluir pasta</span>';
  btnExcluir.addEventListener('click', e => {
    e.stopPropagation();
    closeFolderMenu();
    if (promptExcluirPasta) promptExcluirPasta(caminho, totalNotas, onRefresh);
  });
  menu.appendChild(btnExcluir);

  menu.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(menu);
  folderMenuEl = menu;
  positionPopover(menu, anchorEl);
}

let listDropIndicatorEl = null;
let currentDragSrcId = null;

export function cleanupListDrag() {
  listDropIndicatorEl?.remove();
  listDropIndicatorEl = null;
  currentDragSrcId = null;
  document.querySelectorAll('.folder-header.drag-over, .folder-children.drag-over').forEach(el => el.classList.remove('drag-over'));
}

export function ligarCliqueEDuploCliqueNaLinha(row, label, meta, aoAtivar, iniciarRenomeacao) {
  let timerClique = null;
  row.addEventListener('click', () => {
    if (timerClique) {
      clearTimeout(timerClique);
      timerClique = null;
      return;
    }
    timerClique = setTimeout(() => {
      timerClique = null;
      aoAtivar();
    }, 220);
  });
  label.addEventListener('dblclick', e => {
    e.stopPropagation();
    if (iniciarRenomeacao) iniciarRenomeacao(label, meta);
  });
}

export async function renderNotesListRowsCore({
  container,
  filterQuery = '',
  countEl = null,
  clearBtn = null,
  notesMeta = [],
  activeId = null,
  buildTabIndicator = null,
  openTabMenuForNote = null,
  activateNote = null,
  renderTabs = null,
  scrollTabIntoView = null,
  createNoteInFolder = null,
  updateNoteFolderBar = null,
  loadAllNotesMeta = null,
  promptExcluirPasta = null,
  closeNotesAsideDrawer = null
} = {}) {
  const allBoards = await loadBoardsForDrawer();
  const reRender = () => renderNotesListRowsCore({
    container, filterQuery, countEl, clearBtn, notesMeta, activeId,
    buildTabIndicator, openTabMenuForNote, activateNote, renderTabs,
    scrollTabIntoView, createNoteInFolder, updateNoteFolderBar,
    loadAllNotesMeta, promptExcluirPasta, closeNotesAsideDrawer
  });

  container.querySelectorAll('.notes-list-item, .folder-item, .notes-list-empty, .root-folder-header').forEach(el => el.remove());

  const q = filterQuery.trim().toLowerCase();
  const isSearching = !!q;
  const boardsFiltered = isSearching ? allBoards.filter(b => boardMatchesQuery(b, q)) : allBoards;

  if (countEl && clearBtn) {
    if (isSearching) {
      const filtered = notesMeta.filter(m => {
        const titleMatch = (m.title || '').toLowerCase().includes(q);
        const contentMatch = (m.content || '').toLowerCase().includes(q);
        return titleMatch || contentMatch;
      });
      const visible = filtered.length + boardsFiltered.length;
      const total = notesMeta.length + allBoards.length;
      const hidden = total - visible;
      countEl.textContent = `Mostrando ${visible} de ${total} notas (${hidden} oculta${hidden === 1 ? '' : 's'})`;
      countEl.hidden = false;
      clearBtn.hidden = false;
    } else {
      countEl.hidden = true;
      clearBtn.hidden = true;
    }
  }

  // Se estiver buscando, exibe notas correspondentes em lista plana com tag da pasta
  if (isSearching) {
    const filtered = notesMeta.filter(m => {
      const titleMatch = (m.title || '').toLowerCase().includes(q);
      const contentMatch = (m.content || '').toLowerCase().includes(q);
      return titleMatch || contentMatch;
    });

    if (filtered.length === 0 && boardsFiltered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'copy-opt notes-list-empty';
      empty.style.color = 'var(--text-muted)';
      empty.style.justifyContent = 'center';
      empty.textContent = 'Nenhuma nota encontrada';
      container.appendChild(empty);
      return;
    }

    for (const meta of filtered) {
      const isConflict = /conflito/i.test(meta.title ?? '');
      const row = document.createElement('div');
      row.className = 'copy-opt notes-list-item' + (meta.id === activeId ? ' current' : '') + (isConflict ? ' is-conflict' : '');
      row.dataset.id = String(meta.id);

      const indicator = buildTabIndicator ? buildTabIndicator(meta) : null;
      const label = document.createElement('span');
      label.className = 'copy-opt-value';
      label.textContent = meta.title || 'Sem título';

      if (indicator) row.appendChild(indicator);
      row.appendChild(label);

      if (meta.pasta) {
        const badge = document.createElement('span');
        badge.className = 'note-folder-badge';
        badge.textContent = meta.pasta;
        badge.title = `Pasta: ${meta.pasta}`;
        row.appendChild(badge);
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'notes-list-edit-btn';
      editBtn.innerHTML = iconSvg('more_horiz');
      editBtn.title = 'Opções da nota';
      editBtn.setAttribute('aria-label', 'Opções da nota');
      editBtn.addEventListener('mousedown', e => e.stopPropagation());
      editBtn.addEventListener('click', e => { e.stopPropagation(); openTabMenuForNote?.(meta); });
      row.appendChild(editBtn);

      row.addEventListener('mousedown', e => e.stopPropagation());
      ligarCliqueEDuploCliqueNaLinha(row, label, meta, async () => {
        closeNotesAsideDrawer?.();
        if (meta.id !== activeId) { if (activateNote) await activateNote(meta.id); renderTabs?.(); }
        if (typeof window !== 'undefined' && typeof window.quickdockOpenView === 'function') {
          window.quickdockOpenView('notes');
        }
        scrollTabIntoView?.(meta.id);
      }, null);

      container.appendChild(row);
    }
    for (const board of boardsFiltered) {
      container.appendChild(renderBoardRow(board, { showFolder: true, onRefresh: reRender, closeNotesAsideDrawer }));
    }
    return;
  }

  // Sem busca: Renderiza a árvore hierárquica completa de pastas, notas e quadros
  const pastas = await listarPastas();
  const tree = buildFolderTree(pastas, notesMeta, allBoards);
  const openFolders = getOpenFolders();

  const renderNoteRow = (meta, indentPx = 0) => {
    const isConflict = /conflito/i.test(meta.title ?? '');
    const row = document.createElement('div');
    row.className = 'copy-opt notes-list-item' + (meta.id === activeId ? ' current' : '') + (isConflict ? ' is-conflict' : '');
    row.draggable = true;
    row.dataset.id = String(meta.id);
    if (indentPx > 0) row.style.paddingLeft = `${indentPx}px`;

    const indicator = buildTabIndicator ? buildTabIndicator(meta) : null;
    const label = document.createElement('span');
    label.className = 'copy-opt-value';
    label.textContent = meta.title || 'Sem título';
    if (indicator) row.appendChild(indicator);
    row.appendChild(label);

    const editBtn = document.createElement('button');
    editBtn.className = 'notes-list-edit-btn';
    editBtn.innerHTML = iconSvg('more_horiz');
    editBtn.title = 'Opções da nota';
    editBtn.setAttribute('aria-label', 'Opções da nota');
    editBtn.addEventListener('mousedown', e => e.stopPropagation());
    editBtn.addEventListener('click', e => { e.stopPropagation(); openTabMenuForNote?.(meta); });
    row.appendChild(editBtn);

    row.addEventListener('mousedown', e => e.stopPropagation());
    ligarCliqueEDuploCliqueNaLinha(row, label, meta, async () => {
      closeNotesAsideDrawer?.();
      if (meta.id !== activeId) { if (activateNote) await activateNote(meta.id); renderTabs?.(); }
      if (typeof window !== 'undefined' && typeof window.quickdockOpenView === 'function') {
        window.quickdockOpenView('notes');
      }
      scrollTabIntoView?.(meta.id);
    }, null);

    return row;
  };

  const renderNode = (node, parentEl) => {
    for (const [subNome, sub] of node.subpastas.entries()) {
      const isOpen = openFolders ? openFolders.has(sub.caminho) : true;
      const totalNotas = contarNotasTotal(sub);

      const folderItem = document.createElement('div');
      folderItem.className = 'folder-item';

      const header = document.createElement('div');
      header.className = 'folder-header';
      header.style.paddingLeft = `${(sub.nivel - 1) * 14 + 8}px`;

      const chevron = document.createElement('span');
      chevron.className = 'folder-chevron' + (isOpen ? ' open' : '');
      chevron.innerHTML = iconSvg('chevron_right');

      const icon = document.createElement('span');
      icon.className = 'folder-icon';
      icon.innerHTML = iconSvg(isOpen ? 'folder_open' : 'folder');

      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = subNome;

      const count = document.createElement('span');
      count.className = 'folder-count';
      count.textContent = String(totalNotas);

      const actions = document.createElement('div');
      actions.className = 'folder-actions-wrap';

      const addNoteBtn = document.createElement('button');
      addNoteBtn.className = 'folder-add-note-btn icon-btn';
      addNoteBtn.innerHTML = iconSvg('add');
      addNoteBtn.title = 'Nova nota nesta pasta';
      addNoteBtn.setAttribute('aria-label', 'Nova nota nesta pasta');
      addNoteBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (createNoteInFolder) await createNoteInFolder(sub.caminho, false);
      });
      actions.appendChild(addNoteBtn);

      const menuBtn = document.createElement('button');
      menuBtn.className = 'folder-menu-btn icon-btn';
      menuBtn.innerHTML = iconSvg('more_vert');
      menuBtn.title = 'Opções da pasta';
      menuBtn.setAttribute('aria-label', 'Opções da pasta');
      menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        openFolderMenu({
          caminho: sub.caminho,
          nivel: sub.nivel,
          totalNotas,
          anchorEl: menuBtn,
          onRefresh: async () => {
            await renderNotesListRowsCore({
              container, filterQuery, countEl, clearBtn, notesMeta, activeId,
              buildTabIndicator, openTabMenuForNote, activateNote, renderTabs,
              scrollTabIntoView, createNoteInFolder, updateNoteFolderBar,
              loadAllNotesMeta, promptExcluirPasta, closeNotesAsideDrawer
            });
          },
          createNoteInFolder,
          promptExcluirPasta
        });
      });
      actions.appendChild(menuBtn);

      header.append(chevron, icon, name, count, actions);

      header.addEventListener('click', () => {
        const curOpen = getOpenFolders() || new Set();
        if (curOpen.has(sub.caminho)) curOpen.delete(sub.caminho);
        else curOpen.add(sub.caminho);
        saveOpenFolders(curOpen);
        renderNotesListRowsCore({
          container, filterQuery, countEl, clearBtn, notesMeta, activeId,
          buildTabIndicator, openTabMenuForNote, activateNote, renderTabs,
          scrollTabIntoView, createNoteInFolder, updateNoteFolderBar,
          loadAllNotesMeta, promptExcluirPasta, closeNotesAsideDrawer
        });
      });

      folderItem.appendChild(header);

      if (isOpen) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        const guideLeft = (sub.nivel - 1) * 14 + 17;
        childrenContainer.style.setProperty('--guide-left', `${guideLeft}px`);

        renderNode(sub, childrenContainer);
        for (const meta of sub.notas) {
          childrenContainer.appendChild(renderNoteRow(meta, sub.nivel * 14 + 18));
        }
        for (const board of sub.quadros) {
          childrenContainer.appendChild(renderBoardRow(board, { indentPx: sub.nivel * 14 + 18, onRefresh: reRender, closeNotesAsideDrawer }));
        }
        if (sub.subpastas.size === 0 && sub.notas.length === 0 && sub.quadros.length === 0) {
          const emptyRow = document.createElement('div');
          emptyRow.className = 'folder-empty-hint';
          emptyRow.style.paddingLeft = `${sub.nivel * 14 + 18}px`;
          emptyRow.textContent = 'Pasta vazia';
          childrenContainer.appendChild(emptyRow);
        }
        folderItem.appendChild(childrenContainer);
      }

      parentEl.appendChild(folderItem);
    }

    if (node === tree) {
      for (const meta of node.notas) {
        parentEl.appendChild(renderNoteRow(meta, tree.subpastas.size > 0 ? 20 : 8));
      }
      for (const board of node.quadros) {
        parentEl.appendChild(renderBoardRow(board, { indentPx: tree.subpastas.size > 0 ? 20 : 8, onRefresh: reRender, closeNotesAsideDrawer }));
      }
    }
  };

  renderNode(tree, container);
}
