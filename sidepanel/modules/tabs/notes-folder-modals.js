// ── notes-folder-modals.js ───────────────────────────────────────────────────
// Diálogos modais e menus de ação de pastas hierárquicas (QuickDock).
// Gerencia criação inline, renomeação, exclusão segura (com migração de notas)
// e popover seletor para mover notas entre pastas.

import {
  listarPastas,
  criarPasta,
  normalizarCaminhoPasta,
  excluirPasta,
  moverNotaParaPasta,
  loadAllNotesMeta
} from '../storage.js';
import { getOpenFolders, saveOpenFolders } from './notes-folders.js';

let folderModalEl = null;
export function closeFolderModal() {
  folderModalEl?.remove();
  folderModalEl = null;
}

let moveMenuEl = null;
export function closeMoveMenu() {
  moveMenuEl?.remove();
  moveMenuEl = null;
}

export let renamingFolderPath = null;
export function setRenamingFolderPath(val) {
  renamingFolderPath = val;
}

export async function startCreateFolderInline({
  parentPath = '',
  notesMeta = [],
  notesAsideDrawer = null,
  renderNotesListRows = null,
  openNotesAsideDrawer = null,
  onDone = null,
  closeFolderMenu = null
} = {}) {
  closeFolderModal();
  closeFolderMenu?.();
  const pastas = await listarPastas();
  const existentes = new Set(pastas.map(p => p.caminho));
  for (const n of notesMeta) if (n.pasta) existentes.add(n.pasta);

  const baseName = parentPath ? 'Nova subpasta' : 'Nova pasta';
  let candidate = parentPath ? `${parentPath}/${baseName}` : baseName;
  let counter = 2;
  while (existentes.has(candidate)) {
    candidate = parentPath ? `${parentPath}/${baseName} ${counter}` : `${baseName} ${counter}`;
    counter++;
  }

  try {
    normalizarCaminhoPasta(candidate);
  } catch (err) {
    alert(err.message || 'Caminho excede 3 níveis de profundidade.');
    return;
  }

  await criarPasta(candidate);
  const openSet = getOpenFolders() || new Set();
  openSet.add(candidate);
  if (parentPath) {
    const partes = parentPath.split('/');
    for (let i = 1; i <= partes.length; i++) {
      openSet.add(partes.slice(0, i).join('/'));
    }
  }
  saveOpenFolders(openSet);

  renamingFolderPath = candidate;

  if (notesAsideDrawer && notesAsideDrawer.classList.contains('open')) {
    const scroll = notesAsideDrawer.querySelector('.notes-list-scroll');
    const input = notesAsideDrawer.querySelector('.notes-search-input');
    const countEl = notesAsideDrawer.querySelector('.notes-search-count');
    const clearBtn = notesAsideDrawer.querySelector('.notes-search-clear');
    if (scroll && renderNotesListRows) await renderNotesListRows(scroll, input?.value || '', countEl, clearBtn);
  } else if (openNotesAsideDrawer) {
    openNotesAsideDrawer();
  }
  if (onDone) await onDone();
}

export async function startRenameFolderInline({
  caminho = '',
  notesAsideDrawer = null,
  renderNotesListRows = null,
  onDone = null,
  closeFolderMenu = null
} = {}) {
  closeFolderModal();
  closeFolderMenu?.();
  renamingFolderPath = caminho;
  if (notesAsideDrawer && notesAsideDrawer.classList.contains('open')) {
    const scroll = notesAsideDrawer.querySelector('.notes-list-scroll');
    const input = notesAsideDrawer.querySelector('.notes-search-input');
    const countEl = notesAsideDrawer.querySelector('.notes-search-count');
    const clearBtn = notesAsideDrawer.querySelector('.notes-search-clear');
    if (scroll && renderNotesListRows) await renderNotesListRows(scroll, input?.value || '', countEl, clearBtn);
  }
  if (onDone) await onDone();
}

export function promptExcluirPastaModal({
  caminho,
  totalNotas,
  onExcluirSucesso = null,
  onDone = null
} = {}) {
  closeFolderModal();
  const pop = document.createElement('div');
  pop.className = 'copy-menu folder-modal';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = `Excluir pasta "${caminho}"`;

  const desc = document.createElement('div');
  desc.className = 'folder-modal-desc';
  desc.textContent = totalNotas > 0
    ? `Esta pasta contém ${totalNotas} nota(s). O que deseja fazer com elas?`
    : 'Tem certeza que deseja excluir esta pasta vazia?';

  const btnRow = document.createElement('div');
  btnRow.className = 'folder-modal-actions-col';

  if (totalNotas > 0) {
    const btnMoverRaiz = document.createElement('button');
    btnMoverRaiz.className = 'copy-opt folder-action-opt';
    btnMoverRaiz.innerHTML = '<span class="copy-opt-value">Mover notas para a raiz e excluir pasta</span>';
    btnMoverRaiz.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderModal();
      await excluirPasta(caminho, { manterNotas: true });
      if (onExcluirSucesso) await onExcluirSucesso({ manterNotas: true, caminho });
      if (onDone) await onDone();
    });
    btnRow.appendChild(btnMoverRaiz);

    const btnApagarTudo = document.createElement('button');
    btnApagarTudo.className = 'copy-opt folder-action-opt folder-action-danger';
    btnApagarTudo.innerHTML = '<span class="copy-opt-value">Excluir pasta e todas as notas</span>';
    btnApagarTudo.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderModal();
      await excluirPasta(caminho, { manterNotas: false });
      if (onExcluirSucesso) await onExcluirSucesso({ manterNotas: false, caminho });
      if (onDone) await onDone();
    });
    btnRow.appendChild(btnApagarTudo);
  } else {
    const btnConfirmVazia = document.createElement('button');
    btnConfirmVazia.className = 'copy-opt folder-action-opt folder-action-danger';
    btnConfirmVazia.innerHTML = '<span class="copy-opt-value">Excluir pasta</span>';
    btnConfirmVazia.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderModal();
      await excluirPasta(caminho, { manterNotas: true });
      if (onExcluirSucesso) await onExcluirSucesso({ manterNotas: true, caminho });
      if (onDone) await onDone();
    });
    btnRow.appendChild(btnConfirmVazia);
  }

  const btnCancel = document.createElement('button');
  btnCancel.className = 'copy-opt folder-action-opt';
  btnCancel.innerHTML = '<span class="copy-opt-value">Cancelar</span>';
  btnCancel.addEventListener('click', e => { e.stopPropagation(); closeFolderModal(); });
  btnRow.appendChild(btnCancel);

  pop.append(head, desc, btnRow);
  pop.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(pop);
  folderModalEl = pop;

  pop.style.position = 'fixed';
  pop.style.top = '50%';
  pop.style.left = '50%';
  pop.style.transform = 'translate(-50%, -50%)';
  pop.style.zIndex = '2500';
}
