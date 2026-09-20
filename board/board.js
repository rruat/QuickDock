// ── board/board.js ──────────────────────────────────────────────────────────
// Bootstrap da aba cheia dedicada do Quadro Infinito. Toda a lógica de
// verdade mora em `sidepanel/modules/board-engine.js` — o mesmo motor usado
// pela visão embutida no painel lateral (`sidepanel/modules/board-view.js`).
// Duas cópias divergentes do motor era exatamente o problema antigo: uma
// recebia correção e a outra não. Agora corrigir aqui corrige as duas telas.

import { initBoardEngine } from '../sidepanel/modules/board-engine.js';

initBoardEngine(document, { standalone: true });
