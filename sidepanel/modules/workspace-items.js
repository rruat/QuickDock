// ── workspace-items.js ──────────────────────────────────────────────────────
// Carrega os itens da Base do workspace: as notas (como o motor de Bases já lia) e os quadros
// infinitos, juntos. O mapeamento puro mora em workspace-items-model.js.

import { loadAllNotesMeta, loadAllBoards } from './storage.js';
import { mergeWorkspaceItems } from './workspace-items-model.js';

export async function loadWorkspaceItems() {
  const [notes, boards] = await Promise.all([
    loadAllNotesMeta(),
    loadAllBoards().catch(() => []), // sem tabela de quadros (ambiente antigo): só notas
  ]);
  return mergeWorkspaceItems(notes, boards);
}
