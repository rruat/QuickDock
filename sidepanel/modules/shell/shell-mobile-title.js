// ── shell-mobile-title.js ───────────────────────────────────────────────────
// No mobile o cabeçalho (#mHeader) mostra uma "pílula" com o título do que está aberto. Com a Base em
// foco ela passa a dizer o nome da VIEW ativa (e não "Sem título" da nota); no quadro, o nome do quadro.
// Nota segue com o título da nota (shell-mobile.js). Também fecha o drawer esquerdo ao abrir algo.

import { isMobileMode } from '../platform.js';
import { loadWorkspaceDef, getActiveViewId } from '../workspace-base.js';
import { closeMobileLeftDrawer } from './shell-mobile.js';

export function initMobileTitle() {
  const titleEl = () => document.getElementById('mobile-header-note-title');

  async function update() {
    if (!isMobileMode() || !titleEl()) return;
    const focus = document.documentElement.dataset.shellFocus;
    if (focus === 'bases') {
      const def = loadWorkspaceDef();
      titleEl().textContent = def.views.find(v => v.id === getActiveViewId(def))?.name || 'Views';
    } else if (focus === 'board') {
      try {
        const { getBoardSummary } = await import('../board-engine.js');
        titleEl().textContent = getBoardSummary()?.title || 'Quadro';
      } catch { titleEl().textContent = 'Quadro'; }
    }
  }

  ['quickdock:shell-focus', 'quickdock:workspace-active-view-changed', 'quickdock:workspace-base-saved', 'quickdock:board-changed']
    .forEach(ev => document.addEventListener(ev, update));

  // escolher uma view, abrir um item ou usar um modelo fecha o drawer (o conteúdo é o que se queria ver)
  ['quickdock:shell-focus', 'quickdock:workspace-active-view-changed'].forEach(ev =>
    document.addEventListener(ev, () => { if (isMobileMode()) closeMobileLeftDrawer(); }));
  update();
}
