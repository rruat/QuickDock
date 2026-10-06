// ── notes-drawer-boards.js ──────────────────────────────────────────────────
// Linhas de Quadro Infinito ("Espaço") na árvore do Explorador (aside), ao lado
// de notas e bases. Clicar abre o quadro na view; "⋯" abre o menu (renomear, mover, excluir).

import { iconSvg } from '../icons.js';
import { loadAllBoards } from '../storage.js';
import { openBoardMenu } from './notes-board-menu.js';

const ACTIVE_BOARD_KEY = 'quickdock:active-board-uid';

export async function loadBoardsForDrawer() {
  try {
    return await loadAllBoards();
  } catch {
    return [];
  }
}

export function boardMatchesQuery(board, q) {
  return (board.title || '').toLowerCase().includes(q);
}

async function abrirQuadro(board, closeNotesAsideDrawer) {
  closeNotesAsideDrawer?.();
  const { flushBoardSave } = await import('../board-engine.js');
  const { switchView } = await import('../views.js');
  await flushBoardSave();
  try { localStorage.setItem(ACTIVE_BOARD_KEY, board.uid); } catch {}
  // Tanto a troca de view quanto o "já está nela" recarregam o quadro ativo
  switchView('board');
}

export function renderBoardRow(board, { indentPx = 0, showFolder = false, onRefresh, closeNotesAsideDrawer } = {}) {
  const isCurrent = localStorage.getItem(ACTIVE_BOARD_KEY) === board.uid
    && document.getElementById('board-view')?.hidden === false;

  const row = document.createElement('div');
  row.className = 'copy-opt notes-list-item board-list-item' + (isCurrent ? ' current' : '');
  row.dataset.boardUid = board.uid;
  if (indentPx > 0) row.style.paddingLeft = `${indentPx}px`;

  const icon = document.createElement('span');
  icon.className = 'board-list-item-icon';
  icon.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">space_dashboard</span>';

  const label = document.createElement('span');
  label.className = 'copy-opt-value';
  label.textContent = board.title || 'Espaço sem título';

  row.append(icon, label);

  if (showFolder && board.pasta) {
    const badge = document.createElement('span');
    badge.className = 'note-folder-badge';
    badge.textContent = board.pasta;
    badge.title = `Pasta: ${board.pasta}`;
    row.appendChild(badge);
  }

  // Mesmo "⋯" das notas; excluir mora dentro do menu, com confirmação
  const menuBtn = document.createElement('button');
  menuBtn.className = 'notes-list-edit-btn';
  menuBtn.innerHTML = iconSvg('more_horiz');
  menuBtn.title = 'Opções do espaço';
  menuBtn.setAttribute('aria-label', 'Opções do espaço');
  menuBtn.addEventListener('mousedown', e => e.stopPropagation());
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    openBoardMenu({
      board,
      anchorEl: menuBtn,
      onChanged: onRefresh,
      onOpen: () => abrirQuadro(board, closeNotesAsideDrawer),
    });
  });
  row.appendChild(menuBtn);

  row.addEventListener('mousedown', e => e.stopPropagation());
  row.addEventListener('click', () => abrirQuadro(board, closeNotesAsideDrawer));
  return row;
}
