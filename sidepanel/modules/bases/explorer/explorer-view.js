// ── explorer-view.js ────────────────────────────────────────────────────────
// View "Explorador", no jeito do Explorador de Arquivos do Windows: você está DENTRO de uma pasta
// por vez. Barra de endereço (voltar/subir + caminho clicável), pastas primeiro, depois os itens
// (notas e quadros) em lista com Nome / Data de modificação / Tipo, ou em ícones. Um clique
// seleciona, duplo clique (ou Enter) abre a pasta ou o item, Backspace sobe um nível. Arrastar um
// item para uma pasta (ou para um trecho do caminho) o move. "Nova pasta" cria uma pasta vazia
// (guardada neste navegador até receber itens). Com busca ativa, mostra o resultado achatado.

import {
  buildFolderTree, folderAt, parentPath, breadcrumb, nearestExistingFolder, kindLabel, flattenItems, canMoveToFolder,
} from './explorer-tree.js';

const KEY_PATH = id => `quickdock:explorer-path:${id || 'x'}`;
const KEY_MODE = id => `quickdock:explorer-mode:${id || 'x'}`;
const KEY_FOLDERS = 'quickdock:explorer-folders';
const rd = k => { try { return localStorage.getItem(k); } catch { return null; } };
const wr = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const loadFolders = () => { try { const v = JSON.parse(rd(KEY_FOLDERS) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = (name, cls = '') => { const s = el('span', `material-symbols-rounded bex-icon ${cls}`.trim(), name); s.setAttribute('aria-hidden', 'true'); return s; };
const fmtDate = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

export function renderBaseExplorerView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  container.className = 'base-view-container bex-container';
  const viewId = viewConfig.id;
  const searching = !!callbacks.isSearching?.();
  const extra = loadFolders();
  const tree = buildFolderTree(notes, extra);
  const byId = new Map(notes.map(n => [String(n.id), n]));

  let path = nearestExistingFolder(tree, rd(KEY_PATH(viewId)) || '');
  let mode = rd(KEY_MODE(viewId)) === 'icons' ? 'icons' : 'list';
  const history = []; // pilha do "voltar"
  let selected = null; // { type:'folder'|'item', key }

  const go = (p, { push = true } = {}) => {
    if (p === path) return;
    if (push) history.push(path);
    path = p; selected = null; wr(KEY_PATH(viewId), path); draw();
  };

  // ── barra de endereço ──
  const bar = el('div', 'bex-bar');
  const btnBack = el('button', 'bex-nav', ''); btnBack.type = 'button'; btnBack.title = 'Voltar'; btnBack.append(icon('arrow_back'));
  const btnUp = el('button', 'bex-nav', ''); btnUp.type = 'button'; btnUp.title = 'Subir um nível (Backspace)'; btnUp.append(icon('arrow_upward'));
  const crumbs = el('div', 'bex-crumbs'); crumbs.setAttribute('aria-label', 'Caminho');
  const btnNew = el('button', 'bex-bar-btn', ''); btnNew.type = 'button'; btnNew.title = 'Nova pasta'; btnNew.append(icon('create_new_folder'), document.createTextNode(' Nova pasta'));
  const btnMode = el('button', 'bex-bar-btn', ''); btnMode.type = 'button';
  bar.append(btnBack, btnUp, crumbs, btnNew, btnMode);

  const head = el('div', 'bex-head');
  const body = el('div', 'bex-body'); body.tabIndex = 0; body.setAttribute('role', 'listbox');
  const status = el('div', 'bex-status');
  container.append(bar, head, body, status);

  btnBack.addEventListener('click', () => { if (history.length) go(history.pop(), { push: false }); });
  btnUp.addEventListener('click', () => go(parentPath(path)));
  btnMode.addEventListener('click', () => { mode = mode === 'list' ? 'icons' : 'list'; wr(KEY_MODE(viewId), mode); draw(); });
  btnNew.addEventListener('click', () => {
    const nome = (window.prompt('Nome da nova pasta:', 'Nova pasta') || '').trim().replace(/[\\/]+/g, ' ');
    if (!nome) return;
    const novo = path ? `${path}/${nome}` : nome;
    wr(KEY_FOLDERS, JSON.stringify([...new Set([...loadFolders(), novo])]));
    document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { folderCreated: true } })); // a Base se redesenha
  });

  function dropTarget(node, targetPath) {
    node.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-quickdock-item')) { e.preventDefault(); node.classList.add('is-drop'); } });
    node.addEventListener('dragleave', () => node.classList.remove('is-drop'));
    node.addEventListener('drop', (e) => {
      e.preventDefault(); node.classList.remove('is-drop');
      const item = byId.get(e.dataTransfer?.getData('text/x-quickdock-item'));
      if (item && canMoveToFolder(item, targetPath)) callbacks.onMoveToFolder?.(item, targetPath);
    });
  }

  const open = (entry) => {
    if (entry.type === 'folder') go(entry.folder.path);
    else callbacks.onOpenNote?.(entry.item.id);
  };

  // uma linha/ladrilho de pasta ou de item (list = linha com colunas; icons = ladrilho)
  function entryEl(entry) {
    const isFolder = entry.type === 'folder';
    const row = el('div', mode === 'list' ? 'bex-row' : 'bex-tile');
    row.tabIndex = -1; row.setAttribute('role', 'option');
    row.classList.add(isFolder ? 'bex-folder' : 'bex-item');
    if (!isFolder && entry.item.isBoard) row.dataset.kind = 'quadro';
    const key = isFolder ? `f:${entry.folder.path}` : `i:${entry.item.id}`;
    row.dataset.key = key;
    if (selected === key) row.classList.add('is-selected');

    const glyph = icon(isFolder ? 'folder' : (entry.item.icon || (entry.item.isBoard ? 'space_dashboard' : 'description')), 'bex-glyph');
    const name = el('span', 'bex-name', isFolder ? entry.folder.name : (entry.item.title || 'Sem título'));
    name.title = name.textContent;
    if (mode === 'list') {
      const nameCell = el('div', 'bex-cell bex-cell-name'); nameCell.append(glyph, name);
      const when = el('div', 'bex-cell bex-cell-date', isFolder ? '' : fmtDate(entry.item.updatedAt));
      const type = el('div', 'bex-cell bex-cell-type', isFolder ? 'Pasta' : kindLabel(entry.item));
      row.append(nameCell, when, type);
      if (searching && !isFolder) row.append(el('div', 'bex-cell bex-cell-where', entry.item.pasta || '—'));
    } else {
      row.append(glyph, name);
    }

    row.addEventListener('click', (e) => { e.stopPropagation(); selected = key; body.querySelectorAll('.is-selected').forEach(x => x.classList.remove('is-selected')); row.classList.add('is-selected'); });
    row.addEventListener('dblclick', () => open(entry));
    if (isFolder) dropTarget(row, entry.folder.path);
    else {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-quickdock-item', String(entry.item.id)); e.dataTransfer.effectAllowed = 'move'; });
    }
    row._entry = entry;
    return row;
  }

  function draw() {
    // endereço
    btnBack.disabled = history.length === 0;
    btnUp.disabled = path === '';
    btnMode.replaceChildren(icon(mode === 'list' ? 'grid_view' : 'view_list'), document.createTextNode(mode === 'list' ? ' Ícones' : ' Lista'));
    btnMode.title = mode === 'list' ? 'Ver em ícones' : 'Ver em lista';
    crumbs.replaceChildren(...breadcrumb(path).flatMap((c, i, all) => {
      const b = el('button', 'bex-crumb' + (i === all.length - 1 ? ' is-current' : ''), c.name); b.type = 'button';
      b.addEventListener('click', () => go(c.path));
      dropTarget(b, c.path);
      return i < all.length - 1 ? [b, icon('chevron_right', 'bex-sep')] : [b];
    }));

    // conteúdo da pasta atual (ou o resultado achatado da busca)
    const here = folderAt(tree, path) || tree;
    const folders = searching ? [] : here.folders;
    const items = searching ? flattenItems(tree) : here.items;
    const entries = [...folders.map(folder => ({ type: 'folder', folder })), ...items.map(item => ({ type: 'item', item }))];

    head.className = 'bex-head' + (mode === 'list' ? '' : ' is-hidden');
    head.replaceChildren(...['Nome', 'Data de modificação', 'Tipo', ...(searching ? ['Pasta'] : [])].map(t => el('div', 'bex-hcell', t)));
    body.className = 'bex-body ' + (mode === 'list' ? 'is-list' : 'is-icons');
    body.replaceChildren(...(entries.length ? entries.map(entryEl) : [el('div', 'bex-empty', searching ? 'Nada encontrado.' : 'Esta pasta está vazia.')]));
    dropTarget(body, path); // soltar no fundo move para a pasta aberta
    status.textContent = `${entries.length} ${entries.length === 1 ? 'item' : 'itens'}${selected ? ' • 1 selecionado' : ''}`;
  }

  // clicar no vazio limpa a seleção; teclado como no Windows
  body.addEventListener('click', () => { selected = null; body.querySelectorAll('.is-selected').forEach(x => x.classList.remove('is-selected')); });
  body.addEventListener('keydown', (e) => {
    const rows = [...body.querySelectorAll('[data-key]')];
    const i = rows.findIndex(r => r.dataset.key === selected);
    const select = (r) => { if (!r) return; selected = r.dataset.key; rows.forEach(x => x.classList.toggle('is-selected', x === r)); r.scrollIntoView?.({ block: 'nearest' }); };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); select(rows[Math.min(rows.length - 1, i + 1)]); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); select(rows[Math.max(0, i - 1)]); }
    else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); open(rows[i]._entry); }
    else if (e.key === 'Backspace') { e.preventDefault(); go(parentPath(path)); }
    else if (e.key === 'Delete' && i >= 0 && rows[i]._entry.type === 'folder' && rows[i]._entry.folder.count === 0) {
      const p = rows[i]._entry.folder.path; // só pasta vazia (as notas nunca são apagadas por aqui)
      wr(KEY_FOLDERS, JSON.stringify(loadFolders().filter(x => x !== p)));
      document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { folderRemoved: true } }));
    }
  });

  draw();
}
