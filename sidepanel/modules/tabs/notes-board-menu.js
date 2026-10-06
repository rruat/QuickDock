// ── notes-board-menu.js ─────────────────────────────────────────────────────
// Menu "⋯" do Espaço (quadro infinito) na árvore do Explorador — mesmo visual e
// jeito do menu das notas, só com o que faz sentido pra um espaço: renomear,
// abrir, mover de pasta e excluir. Excluir pede confirmação (apaga os cartões e
// os arquivos de mídia do espaço); nada de clique duplo no ícone.

import { positionPopover } from '../popover.js';
import { listarPastas, loadAllBoards, loadAllNotesMeta } from '../storage.js';

let menuEl = null;

export function closeBoardMenu() {
  menuEl?.remove();
  menuEl = null;
}

function divider() {
  return Object.assign(document.createElement('div'), { className: 'math-divider' });
}

function option(label, run, className = '') {
  const btn = document.createElement('button');
  btn.className = `copy-opt ${className}`.trim();
  const span = document.createElement('span');
  span.className = 'copy-opt-value';
  span.textContent = label;
  btn.appendChild(span);
  btn.addEventListener('mousedown', e => e.stopPropagation());
  btn.addEventListener('click', async e => { e.stopPropagation(); await run(); });
  return btn;
}

// Pastas conhecidas: as criadas + as usadas por notas e espaços (e seus pais)
async function allFolderPaths() {
  const caminhos = new Set();
  for (const p of await listarPastas()) if (p.caminho) caminhos.add(p.caminho);
  for (const n of await loadAllNotesMeta()) if (n.pasta) caminhos.add(n.pasta);
  for (const b of await loadAllBoards()) if (b.pasta) caminhos.add(b.pasta);
  for (const c of [...caminhos]) {
    const partes = c.split('/');
    for (let i = 1; i < partes.length; i++) caminhos.add(partes.slice(0, i).join('/'));
  }
  return [...caminhos].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function renderFolderPicker(menu, board, { onPick, onBack }) {
  menu.replaceChildren();
  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = 'Mover para pasta';
  menu.appendChild(head);

  const atual = board.pasta || '';
  const item = (label, caminho, indent = 0) => {
    const opt = option('', () => onPick(caminho), caminho === atual ? 'current' : '');
    const value = opt.querySelector('.copy-opt-value');
    value.textContent = `${'  '.repeat(indent)}📁 ${label}`;
    if (caminho === atual) {
      const hint = document.createElement('span');
      hint.className = 'copy-opt-hint';
      hint.textContent = '✓';
      opt.appendChild(hint);
    }
    opt.title = caminho || 'Raiz';
    return opt;
  };

  menu.appendChild(item('Raiz (sem pasta)', ''));
  for (const caminho of await allFolderPaths()) {
    const partes = caminho.split('/');
    menu.appendChild(item(partes[partes.length - 1], caminho, partes.length - 1));
  }
  menu.appendChild(divider());
  menu.appendChild(option('← Voltar', onBack));
}

/**
 * @param {{ board: {uid:string,id:number,title:string,pasta?:string}, anchorEl: HTMLElement,
 *           onChanged?: () => (void|Promise<void>), onOpen?: () => void }} opts
 */
export function openBoardMenu({ board, anchorEl, onChanged, onOpen }) {
  closeBoardMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu tab-menu board-menu';
  menu.addEventListener('mousedown', e => e.stopPropagation());

  const done = async () => { closeBoardMenu(); await onChanged?.(); };
  const engine = () => import('../board-engine.js');

  const renderMain = () => {
    menu.replaceChildren();
    const head = document.createElement('div');
    head.className = 'copy-menu-header';
    head.textContent = 'Opções do espaço';
    menu.appendChild(head);

    // Renomear inline (mesmo campo do menu da nota)
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-menu-rename';
    input.value = board.title || '';
    input.placeholder = 'Nome do espaço';
    input.spellcheck = false;
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = board.title || ''; input.blur(); }
    });
    input.addEventListener('change', async () => {
      const titulo = input.value.trim() || 'Espaço sem título';
      input.value = titulo;
      if (titulo === board.title) return;
      board.title = titulo;
      await (await engine()).updateBoardMeta(board.uid, { title: titulo });
      await onChanged?.();
    });
    menu.appendChild(input);
    menu.appendChild(divider());

    menu.appendChild(option('Abrir espaço', async () => { closeBoardMenu(); onOpen?.(); }));
    menu.appendChild(option('Mover para pasta...', async () => {
      await renderFolderPicker(menu, board, {
        onPick: async caminho => {
          await (await engine()).updateBoardMeta(board.uid, { pasta: caminho });
          await done();
        },
        onBack: renderMain,
      });
      positionPopover(menu, anchorEl);
    }));
    menu.appendChild(divider());
    menu.appendChild(option('Excluir', async () => {
      closeBoardMenu();
      const ok = confirm(`Excluir o espaço "${board.title || 'Sem título'}"?\n\nTodos os cartões e os arquivos de mídia dele serão apagados. Isso não pode ser desfeito.`);
      if (!ok) return;
      await (await engine()).removeBoard(board.uid);
      await onChanged?.();
    }, 'folder-action-danger'));
  };

  renderMain();
  document.body.appendChild(menu);
  menuEl = menu;
  positionPopover(menu, anchorEl);
  menu.querySelector('.tab-menu-rename')?.focus();
}

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', e => {
    if (menuEl && !menuEl.contains(e.target)) closeBoardMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menuEl) closeBoardMenu();
  });
}
