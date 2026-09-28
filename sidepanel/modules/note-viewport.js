// Sincronização com o teclado virtual em mobile (VisualViewport API) e
// rolagem automática pra manter o cursor visível ao digitar.
import { root, noteEditorEl } from './note-state.js';
import { caretViewportRect, currentBlock } from './note-dom-utils.js';
import { getLastFocusedBlock } from './note.js';

// ── Sincronização do Teclado Virtual (Notion Mobile Toolbar & VisualViewport) ──
export function syncVisualViewport() {
  if (typeof window === 'undefined' || !window.visualViewport) return;
  const isMobile = typeof document !== 'undefined' && document.documentElement.dataset.platform === 'mobile';
  const app = document.getElementById('app');
  const vv = window.visualViewport;

  if (!isMobile) {
    if (app) {
      app.style.height = '';
      app.style.transform = '';
    }
    document.documentElement.style.removeProperty('--vv-height');
    document.documentElement.style.removeProperty('--keyboard-offset');
    return;
  }

  const vvHeight = vv.height;
  const keyboardOffset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));

  document.documentElement.style.setProperty('--vv-height', `${vvHeight}px`);
  document.documentElement.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);

  if (app) {
    app.style.height = `${vvHeight}px`;
    app.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
  }

  // Quando o teclado sobe, garante que o bloco em edição continue visível acima da barra
  if (document.activeElement && root && root.contains(document.activeElement)) {
    const blk = currentBlock() || getLastFocusedBlock();
    if (blk) {
      requestAnimationFrame(() => {
        blk.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }
}

if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncVisualViewport);
  window.visualViewport.addEventListener('scroll', syncVisualViewport);
  window.addEventListener('resize', syncVisualViewport);
  window.addEventListener('orientationchange', syncVisualViewport);
}

// ── Teclado virtual: rolar para manter o cursor visível ao digitar ───────────
export function scrollCursorIntoView() {
  const rect = caretViewportRect(window.getSelection());
  if (!rect || (rect.top === 0 && rect.bottom === 0)) return;

  const vpBottom = window.visualViewport
    ? window.visualViewport.offsetTop + window.visualViewport.height
    : window.innerHeight;

  const margin = 50;
  if (rect.bottom > vpBottom - margin) {
    const diff = rect.bottom - (vpBottom - margin);
    noteEditorEl.scrollTop += diff;
  }
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scrollCursorIntoView);
}
root.addEventListener('input', scrollCursorIntoView);
