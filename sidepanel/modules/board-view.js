// ── board-view.js ──────────────────────────────────────────────────────────
// Bootstrap da visão de Quadro Infinito embutida no painel lateral. Toda a
// lógica de verdade mora em `board-engine.js` — o mesmo motor usado pela aba
// cheia dedicada (`board/board.js`). Duas cópias divergentes do motor era
// exatamente o problema antigo: uma recebia correção e a outra não. Agora
// corrigir o motor corrige as duas telas.

import { initBoardEngine, abrirQuadroInfinitoEmAba } from './board-engine.js';
import { loadAllNotesMeta } from './storage.js';
import { switchToNote } from './note.js';
import { goBack } from './views.js';

export { abrirQuadroInfinitoEmAba };

export async function initBoardView(scope = document) {
  await initBoardEngine(scope, {
    standalone: false,
    onBack: goBack,
    // A visão embutida JÁ É a mesma página do editor — abrir uma nota
    // referenciada por um cartão é só trocar de nota e voltar pra visão de
    // editor, sem nenhuma ponte entre abas/painel (comparar com a aba cheia,
    // que precisa de `chrome.sidePanel`/mensagens pra alcançar o painel).
    onAbrirNota: async uid => {
      const notas = await loadAllNotesMeta();
      const alvo = notas.find(n => n.uid === uid);
      if (alvo) await switchToNote(alvo.id);
      goBack();
    },
  });
}
