// ── explorer-tree.js ────────────────────────────────────────────────────────
// Modelo PURO da view "Explorador": os itens da Base (notas e quadros) organizados pela
// pasta (`pasta`, caminhos "a/b/c") numa árvore. Sem DOM. Pastas não existem como registro —
// existem enquanto algum item as usa —, então a árvore sai sempre dos próprios itens.

const normPath = p => String(p ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const cmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base', numeric: true });

/**
 * @param {Array<{id, title?, pasta?}>} items
 * @returns {{ path:'', name:'', folders:Array, items:Array, count:number }} raiz; cada pasta:
 *   { path, name, folders, items, count } — `count` = itens da pasta e de tudo abaixo dela.
 */
export function buildFolderTree(items = []) {
  const newNode = (path, name) => ({ path, name, folders: [], items: [], count: 0 });
  const root = newNode('', '');
  const byPath = new Map([['', root]]);

  const ensure = (path) => {
    if (byPath.has(path)) return byPath.get(path);
    const cut = path.lastIndexOf('/');
    const parent = ensure(cut < 0 ? '' : path.slice(0, cut));
    const node = newNode(path, cut < 0 ? path : path.slice(cut + 1));
    parent.folders.push(node);
    byPath.set(path, node);
    return node;
  };

  for (const it of items) {
    const node = ensure(normPath(it?.pasta));
    node.items.push(it);
    for (let n = node; n; ) { n.count++; const cut = n.path.lastIndexOf('/'); n = n.path === '' ? null : byPath.get(cut < 0 ? '' : n.path.slice(0, cut)); }
  }

  const sortNode = (n) => {
    n.folders.sort((a, b) => cmp(a.name, b.name));
    n.items.sort((a, b) => cmp(a.title || '', b.title || ''));
    n.folders.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

/** Caminhos de todas as pastas da árvore (para "expandir tudo"). */
export function allFolderPaths(root) {
  const out = [];
  (function walk(n) { for (const f of n.folders) { out.push(f.path); walk(f); } })(root);
  return out;
}

/** Soltar um item em `destino` muda alguma coisa? ('' = raiz). */
export function canMoveToFolder(item, destino) {
  return normPath(item?.pasta) !== normPath(destino);
}

export const folderOfItem = item => normPath(item?.pasta);
