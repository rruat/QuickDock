// ── notes-drawer-boards.js ──────────────────────────────────────────────────
// Linhas de Quadro Infinito ("Espaço") na árvore do Explorador (aside), ao lado
// de notas e bases. Clicar abre o quadro na view; "⋯" exclui (com confirmação).

import { iconSvg } from '../icons.js';
import { loadAllBoards, deleteBoardRecord } from '../storage.js';

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

  const delBtn = document.createElement('button');
  delBtn.className = 'notes-list-edit-btn';
  delBtn.innerHTML = iconSvg('delete');
  delBtn.title = 'Excluir espaço';
  delBtn.setAttribute('aria-label', 'Excluir espaço');
  delBtn.addEventListener('mousedown', e => e.stopPropagation());
  delBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!delBtn.dataset.confirming) {
      delBtn.dataset.confirming = '1';
      delBtn.title = 'Clique de novo para confirmar';
      delBtn.classList.add('is-confirming');
      setTimeout(() => {
        delete delBtn.dataset.confirming;
        delBtn.classList.remove('is-confirming');
        delBtn.title = 'Excluir espaço';
      }, 3000);
      return;
    }
    if (board.id != null) await deleteBoardRecord(board.id);
    if (localStorage.getItem(ACTIVE_BOARD_KEY) === board.uid) {
      try { localStorage.removeItem(ACTIVE_BOARD_KEY); } catch {}
    }
    document.dispatchEvent(new CustomEvent('quickdock:board-changed', { detail: { deletedUid: board.uid } }));
    document.dispatchEvent(new CustomEvent('quickdock:refresh-board-view'));
    await onRefresh?.();
  });
  row.appendChild(delBtn);

  row.addEventListener('mousedown', e => e.stopPropagation());
  row.addEventListener('click', () => abrirQuadro(board, closeNotesAsideDrawer));
  return row;
}
