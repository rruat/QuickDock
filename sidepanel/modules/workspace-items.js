// ── workspace-items.js ──────────────────────────────────────────────────────
// Carrega os itens da Base do workspace: as notas (como o motor de Bases já lia) e os quadros
// infinitos, juntos. O mapeamento puro mora em workspace-items-model.js.
//
// Cada nota/quadro salvo dispara um evento e a Base relê TUDO; em rajada (importar, colar na
// tabela, sincronizar) isso empilhava leituras do banco. Aqui as chamadas simultâneas se
// fundem: no máximo uma leitura em andamento e UMA seguinte (que começa depois da atual,
// então enxerga qualquer gravação feita enquanto a primeira lia).

import { loadAllNotesMeta, loadAllBoards } from './storage.js';
import { mergeWorkspaceItems } from './workspace-items-model.js';

async function readItems() {
  const [notes, boards] = await Promise.all([
    loadAllNotesMeta(),
    loadAllBoards().catch(() => []), // sem tabela de quadros (ambiente antigo): só notas
  ]);
  return mergeWorkspaceItems(notes, boards);
}

let inflight = null;   // leitura em andamento
let followUp = null;   // a próxima leitura, compartilhada por todos que pediram durante a atual

function start() {
  inflight = readItems().finally(() => { inflight = null; });
  return inflight;
}

export function loadWorkspaceItems() {
  if (!inflight) return start();
  if (!followUp) {
    followUp = inflight.catch(() => {}).then(() => { followUp = null; return start(); });
  }
  return followUp;
}
