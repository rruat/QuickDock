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
import { isDesktopMode } from './platform.js';
import { toggleDesktopPanel } from './desktop-panels.js';

export { abrirQuadroInfinitoEmAba };

export async function initBoardView(scope = document) {
  await initBoardEngine(scope, {
    standalone: false,
    // No desktop o Quadro é um painel que se liga/desliga (ver
    // desktop-panels.js), não uma tela cheia com histórico pra "voltar" — o
    // botão fecha o painel; fora do desktop continua voltando pro editor.
    onBack: () => {
      if (isDesktopMode()) toggleDesktopPanel('board');
      else goBack();
    },
    // A visão embutida JÁ É a mesma página do editor — abrir uma nota
    // referenciada por um cartão é só trocar de nota (no desktop a coluna da
    // nota já fica sempre visível ao lado, não precisa "voltar" pra ela).
    onAbrirNota: async uid => {
      const notas = await loadAllNotesMeta();
      const alvo = notas.find(n => n.uid === uid);
      if (alvo) await switchToNote(alvo.id);
      if (!isDesktopMode()) goBack();
    },
  });
}
