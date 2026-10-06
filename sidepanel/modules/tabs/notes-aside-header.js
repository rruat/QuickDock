// ── notes-aside-header.js ───────────────────────────────────────────────────
// Cabeçalho do Explorador ("Todos os arquivos"): ícone de pasta, ícone de
// arquivo e, ao clicar no de arquivo, um painel que expande logo abaixo do
// cabeçalho com todas as ações de criar/importar. Usado pelo drawer de desktop
// e pelo overlay mobile/extensão — mesma estrutura, um lugar só.

import { iconSvg } from '../icons.js';
import { loadBoardsForDrawer } from './notes-drawer-boards.js';

function actionButton(icon, title, onClick, extraClass = '') {
  const b = document.createElement('button');
  b.className = `icon-btn notes-aside-action-btn ${extraClass}`.trim();
  b.innerHTML = iconSvg(icon);
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', e => { e.stopPropagation(); onClick(e); });
  return b;
}

/**
 * @param {object} o
 * @param {number} o.count            quantidade inicial exibida no badge
 * @param {() => void} o.onNewFolder
 * @param {{icon:string,label:string,run:() => any}[]} o.quickActions  botões do painel expandido
 * @param {HTMLElement[]} [o.trailing] botões extras no fim (ex.: fechar no mobile)
 */
export function buildAsideHeader({ count, onNewFolder, quickActions, trailing = [] }) {
  const header = document.createElement('div');
  header.className = 'notes-aside-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'notes-aside-title-group';

  const titleIcon = document.createElement('span');
  titleIcon.className = 'notes-aside-title-icon';
  titleIcon.innerHTML = iconSvg('folder_open');

  const titleText = document.createElement('span');
  titleText.className = 'notes-aside-title-text';
  titleText.textContent = 'Todos os arquivos';

  const badge = document.createElement('span');
  badge.className = 'notes-aside-badge';
  badge.textContent = String(count);

  titleGroup.append(titleIcon, titleText, badge);

  const actions = document.createElement('div');
  actions.className = 'notes-aside-header-actions';

  const panel = document.createElement('div');
  panel.className = 'notes-aside-quick-panel';
  panel.hidden = true;

  const btnFolder = actionButton('create_new_folder', 'Nova pasta', onNewFolder);
  const btnFile = actionButton('note_add', 'Novo arquivo', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btnFile.classList.toggle('is-active', open);
    btnFile.setAttribute('aria-expanded', String(open));
  });
  btnFile.setAttribute('aria-expanded', 'false');

  for (const qa of quickActions) {
    const b = document.createElement('button');
    b.className = 'notes-quick-action-btn';
    b.innerHTML = `${iconSvg(qa.icon)}<span>${qa.label}</span>`;
    b.addEventListener('click', async e => {
      e.stopPropagation();
      panel.hidden = true;
      btnFile.classList.remove('is-active');
      btnFile.setAttribute('aria-expanded', 'false');
      await qa.run();
    });
    panel.appendChild(b);
  }

  actions.append(btnFolder, btnFile, ...trailing);
  header.append(titleGroup, actions);
  return { header, panel, badge };
}

// Badge = notas + quadros (a lista é "Todos os arquivos")
export async function refreshAsideBadge(drawer, notesCount) {
  const badge = drawer?.querySelector('.notes-aside-badge');
  if (!badge) return;
  const boards = await loadBoardsForDrawer();
  badge.textContent = String(notesCount + boards.length);
}
