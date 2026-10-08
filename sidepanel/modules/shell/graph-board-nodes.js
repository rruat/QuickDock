// ── graph-board-nodes.js ────────────────────────────────────────────────────
// Quadros como nós do grafo de Constelações (os itens da Base são notas E quadros). PURO.
// Quadros não têm [[links]], então entram sem arestas; clicar abre o quadro.

export function boardGraphNodes(boards = []) {
  return boards.map(b => ({
    id: b.uid || `board-${b.id}`,
    noteId: `board-${b.id}`,
    boardId: b.id,
    isBoard: true,
    title: b.title || 'Quadro sem título',
    pasta: b.pasta || '',
    color: null,
    icon: 'space_dashboard',
    degree: 0,
    radius: 6,
  }));
}
