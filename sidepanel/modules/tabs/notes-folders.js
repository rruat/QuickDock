// ── notes-folders.js ─────────────────────────────────────────────────────────
// Estrutura de dados e árvore de pastas hierárquicas (Fase 2) para o QuickDock.
// Organiza notas e subpastas em múltiplos níveis com ordenação alfabética
// e contagem agregada de itens.

export const FOLDERS_OPEN_KEY = 'quickdock:folders:open';

export function getOpenFolders() {
  try {
    const raw = localStorage.getItem(FOLDERS_OPEN_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return null;
}

export function saveOpenFolders(set) {
  try {
    localStorage.setItem(FOLDERS_OPEN_KEY, JSON.stringify([...set]));
  } catch {}
}

export function buildFolderTree(pastas, notes) {
  const root = {
    caminho: '',
    nome: '',
    nivel: 0,
    subpastas: new Map(),
    notas: [],
  };

  const todosCaminhos = new Set();
  for (const p of (pastas || [])) if (p.caminho) todosCaminhos.add(p.caminho);
  for (const n of (notes || [])) if (n.pasta) todosCaminhos.add(n.pasta);

  for (const c of [...todosCaminhos]) {
    const partes = c.split('/');
    for (let i = 1; i <= partes.length; i++) {
      todosCaminhos.add(partes.slice(0, i).join('/'));
    }
  }

  const caminhosOrdenados = [...todosCaminhos].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  function getNode(caminho) {
    if (!caminho) return root;
    const partes = caminho.split('/');
    let cur = root;
    for (let i = 0; i < partes.length; i++) {
      const subCaminho = partes.slice(0, i + 1).join('/');
      if (!cur.subpastas.has(partes[i])) {
        cur.subpastas.set(partes[i], {
          caminho: subCaminho,
          nome: partes[i],
          nivel: i + 1,
          subpastas: new Map(),
          notas: [],
        });
      }
      cur = cur.subpastas.get(partes[i]);
    }
    return cur;
  }

  for (const c of caminhosOrdenados) getNode(c);

  for (const n of notes) {
    const node = getNode(n.pasta || '');
    node.notas.push(n);
  }

  return root;
}

export function contarNotasTotal(node) {
  let count = node.notas.length;
  for (const sub of node.subpastas.values()) {
    count += contarNotasTotal(sub);
  }
  return count;
}
