// ── explorer-view.js ────────────────────────────────────────────────────────
// View "Explorador": a árvore de pastas dos itens da Base (notas e quadros). Pastas abrem e
// fecham (estado lembrado por view neste navegador), clicar num item abre; arrastar um item
// para uma pasta (ou para "Todos os itens", a raiz) o move. A árvore sai dos itens já filtrados
// pela view — filtros e busca valem; com busca ativa tudo fica aberto.

import { buildFolderTree, allFolderPaths, canMoveToFolder } from './explorer-tree.js';

const keyOf = viewId => `quickdock:explorer-open:${viewId || 'x'}`;
const loadOpen = viewId => { try { const v = JSON.parse(localStorage.getItem(keyOf(viewId)) || 'null'); return Array.isArray(v) ? new Set(v) : null; } catch { return null; } };
const saveOpen = (viewId, set) => { try { localStorage.setItem(keyOf(viewId), JSON.stringify([...set])); } catch { /* sem storage */ } };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = name => { const s = el('span', 'material-symbols-rounded bex-icon', name); s.setAttribute('aria-hidden', 'true'); return s; };

export function renderBaseExplorerView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  container.className = 'base-view-container bex-container';

  const tree = buildFolderTree(notes);
  const searching = !!callbacks.isSearching?.(); // com busca ativa, tudo fica aberto
  let open = loadOpen(viewConfig.id) ?? new Set(allFolderPaths(tree)); // primeira vez: tudo aberto
  const toggle = (path) => { open.has(path) ? open.delete(path) : open.add(path); saveOpen(viewConfig.id, open); draw(); };

  const bar = el('div', 'bex-bar');
  const btnAll = el('button', 'bex-bar-btn', 'Expandir tudo'); btnAll.type = 'button';
  const btnNone = el('button', 'bex-bar-btn', 'Recolher tudo'); btnNone.type = 'button';
  btnAll.addEventListener('click', () => { open = new Set(allFolderPaths(tree)); saveOpen(viewConfig.id, open); draw(); });
  btnNone.addEventListener('click', () => { open = new Set(); saveOpen(viewConfig.id, open); draw(); });
  bar.append(el('span', 'bex-count', `${tree.count} ${tree.count === 1 ? 'item' : 'itens'}`), btnAll, btnNone);

  const list = el('div', 'bex-tree');
  list.setAttribute('role', 'tree');
  container.append(bar, list);

  const byId = new Map(notes.map(n => [String(n.id), n]));

  function dropTarget(row, path) {
    row.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-quickdock-item')) { e.preventDefault(); row.classList.add('is-drop'); } });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop'));
    row.addEventListener('drop', (e) => {
      e.preventDefault(); row.classList.remove('is-drop');
      const item = byId.get(e.dataTransfer?.getData('text/x-quickdock-item'));
      if (item && canMoveToFolder(item, path)) callbacks.onMoveToFolder?.(item, path);
    });
  }

  function itemRow(item, depth) {
    const row = el('div', 'bex-row bex-item');
    row.style.setProperty('--depth', String(depth));
    row.dataset.noteId = item.id;
    if (item.isBoard) row.dataset.kind = 'quadro';
    row.tabIndex = 0; row.setAttribute('role', 'treeitem'); row.draggable = true;
    row.append(icon(item.icon || (item.isBoard ? 'space_dashboard' : 'description')), el('span', 'bex-name', item.title || 'Sem título'));
    const abrir = () => callbacks.onOpenNote?.(item.id);
    row.addEventListener('click', abrir);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-quickdock-item', String(item.id)); e.dataTransfer.effectAllowed = 'move'; });
    return row;
  }

  function folderRows(node, depth, out) {
    for (const f of node.folders) {
      const isOpen = searching || open.has(f.path);
      const row = el('div', 'bex-row bex-folder' + (isOpen ? ' is-open' : ''));
      row.style.setProperty('--depth', String(depth));
      row.tabIndex = 0; row.setAttribute('role', 'treeitem'); row.setAttribute('aria-expanded', String(isOpen));
      row.append(icon(isOpen ? 'expand_more' : 'chevron_right'), icon(isOpen ? 'folder_open' : 'folder'), el('span', 'bex-name', f.name), el('span', 'bex-badge', String(f.count)));
      row.addEventListener('click', () => toggle(f.path));
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(f.path); } });
      dropTarget(row, f.path);
      out.push(row);
      if (isOpen) { folderRows(f, depth + 1, out); f.items.forEach(it => out.push(itemRow(it, depth + 1))); }
    }
  }

  function draw() {
    const rows = [];
    const rootRow = el('div', 'bex-row bex-root');
    rootRow.style.setProperty('--depth', '0');
    rootRow.append(icon('inventory_2'), el('span', 'bex-name', 'Todos os itens'), el('span', 'bex-badge', String(tree.count)));
    dropTarget(rootRow, '');
    rows.push(rootRow);
    folderRows(tree, 1, rows);
    tree.items.forEach(it => rows.push(itemRow(it, 1))); // itens sem pasta, logo abaixo da raiz
    if (!tree.count) rows.push(el('div', 'bex-empty', 'Nenhum item para mostrar.'));
    list.replaceChildren(...rows);
  }
  draw();
}
