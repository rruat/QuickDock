// ── timeline-bars.js ────────────────────────────────────────────────────────
// Barras da linha do tempo (DOM): desenhar, arrastar para mover, esticar as pontas.
// A matemática (px ↔ dias, patches) é de timeline-scale.js / timeline-actions.js (puros).

import { barGeometry } from './timeline-scale.js';
import { moveItemPatch, resizeEndPatch, resizeStartPatch, daysFromPixels } from './timeline-actions.js';
import { addDays } from '../engine/date-utils.js';

const LIMIAR_ARRASTO = 4;   // px antes de virar arrasto (abaixo disso é clique)

/**
 * @param {HTMLElement} linha  div da linha (position:relative)
 * @param {Object} item
 * @param {{ range, ppd, tom:string, canResizeEnd:boolean, onOpen(id), onCommit(item, resultado) }} o
 */
export function createBar(linha, item, o) {
  const { left, width } = barGeometry(item, o.range, o.ppd);
  const bar = document.createElement('div');
  bar.className = `btl-bar tone-${o.tom}` + (item.milestone ? ' is-milestone' : '');
  bar.style.left = `${left}px`;
  bar.style.width = `${width}px`;
  bar.dataset.noteId = item.id;
  bar.tabIndex = 0;
  bar.setAttribute('role', 'button');
  bar.setAttribute('aria-label', `${item.title}, de ${item.startYmd} a ${item.endYmd}`);
  bar.title = `${item.title}\n${item.startYmd}${item.endYmd !== item.startYmd ? ` → ${item.endYmd}` : ''}`;

  const rotulo = document.createElement('span');
  rotulo.className = 'btl-bar-label';
  rotulo.textContent = item.title;
  bar.appendChild(rotulo);

  const arrastavel = !item.milestone && !item.ev.fromFallback;
  const editavel = !!o.onCommit;
  if (editavel && arrastavel) {
    if (o.canResizeEnd) {
      for (const lado of ['start', 'end']) {
        const h = document.createElement('span');
        h.className = `btl-handle btl-handle-${lado}`;
        h.dataset.edge = lado;
        h.setAttribute('aria-hidden', 'true');
        bar.appendChild(h);
      }
    }
  }

  bar.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); o.onOpen(item.id); return; }
    // teclado: ←/→ move um dia; Shift+←/→ estica o fim
    if (!editavel || !arrastavel || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const d = e.key === 'ArrowRight' ? 1 : -1;
    o.onCommit(item, e.shiftKey && o.canResizeEnd ? resizeEndPatch(item, addDays(item.endYmd, d)) : moveItemPatch(item, d));
  });

  bar.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const borda = e.target.dataset?.edge || null;      // 'start' | 'end' | null (corpo)
    const x0 = e.clientX;
    let delta = 0, arrastou = false;
    const mover = ev => {
      const dx = ev.clientX - x0;
      if (!arrastou && Math.abs(dx) < LIMIAR_ARRASTO) return;
      if (!arrastou) { arrastou = true; bar.classList.add('is-dragging'); }
      delta = daysFromPixels(dx, o.ppd);
      // prévia: só deslocamento/largura visuais; nada é gravado até soltar
      if (borda === 'start') { bar.style.left = `${left + delta * o.ppd}px`; bar.style.width = `${Math.max(o.ppd, width - delta * o.ppd)}px`; }
      else if (borda === 'end') bar.style.width = `${Math.max(o.ppd, width + delta * o.ppd)}px`;
      else bar.style.left = `${left + delta * o.ppd}px`;
    };
    const soltar = () => {
      bar.removeEventListener('pointermove', mover);
      bar.removeEventListener('pointerup', soltar);
      bar.removeEventListener('pointercancel', soltar);
      bar.classList.remove('is-dragging');
      if (!arrastou) { o.onOpen(item.id); return; }
      o.suppressClick?.();
      if (!delta || !editavel || !arrastavel) { bar.style.left = `${left}px`; bar.style.width = `${width}px`; return; }
      const r = borda === 'start' ? resizeStartPatch(item, addDays(item.startYmd, delta))
        : borda === 'end' ? resizeEndPatch(item, addDays(item.endYmd, delta))
          : moveItemPatch(item, delta);
      if (!r) { bar.style.left = `${left}px`; bar.style.width = `${width}px`; return; }
      o.onCommit(item, r);
    };
    if (!editavel && !arrastavel) return;
    // captura já no clique: a borda tem 7px e o ponteiro sai dela logo ao arrastar
    try { bar.setPointerCapture(e.pointerId); } catch { /* sem captura: arrasto só enquanto o ponteiro estiver sobre a barra */ }
    bar.addEventListener('pointermove', mover);
    bar.addEventListener('pointerup', soltar);
    bar.addEventListener('pointercancel', soltar);
  });

  linha.appendChild(bar);
  return bar;
}
