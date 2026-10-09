// ── mobile-drawer-search.js ─────────────────────────────────────────────────
// Busca da barra lateral esquerda no MOBILE (estilo Obsidian): a barra de pesquisa do topo procura em
// um ESCOPO escolhido no seletor de baixo — views, notas e quadros, ou pastas. PURO (sem DOM).

export const SEARCH_SCOPES = [
  { id: 'views', label: 'Views', icon: 'view_list', placeholder: 'Buscar views…' },
  { id: 'items', label: 'Notas e quadros', icon: 'description', placeholder: 'Buscar notas e quadros…' },
  { id: 'folders', label: 'Pastas', icon: 'folder', placeholder: 'Buscar pastas…' },
];

export const norm = s => (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Notas e quadros cujo título, pasta ou (nas notas) conteúdo contém o texto; título primeiro. */
export function searchItems(items = [], query = '', limit = 60) {
  const q = norm(query);
  if (!q) return [];
  const hits = [];
  for (const it of items) {
    const title = norm(it?.title);
    const pasta = norm(it?.pasta);
    let rank = -1;
    if (title.startsWith(q)) rank = 0;
    else if (title.includes(q)) rank = 1;
    else if (pasta.includes(q)) rank = 2;
    else if (!it?.isBoard && norm(typeof it?.content === 'string' ? it.content.slice(0, 4000) : '').includes(q)) rank = 3;
    if (rank >= 0) hits.push({ it, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || norm(a.it.title).localeCompare(norm(b.it.title), 'pt-BR'));
  return hits.slice(0, limit).map(h => h.it);
}

/** Pastas (com as ancestrais) que contêm o texto no caminho: [{ path, name, count }], por caminho. */
export function searchFolders(items = [], query = '') {
  const q = norm(query);
  const counts = new Map();
  for (const it of items) {
    const parts = String(it?.pasta ?? '').split('/').map(p => p.trim()).filter(Boolean);
    let acc = '';
    for (const part of parts) { acc = acc ? `${acc}/${part}` : part; counts.set(acc, (counts.get(acc) || 0) + 1); }
  }
  return [...counts.entries()]
    .filter(([path]) => !q || norm(path).includes(q))
    .map(([path, count]) => ({ path, name: path.slice(path.lastIndexOf('/') + 1), count }))
    .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
}
