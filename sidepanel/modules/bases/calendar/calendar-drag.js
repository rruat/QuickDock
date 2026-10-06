// ── calendar-drag.js ────────────────────────────────────────────────────────
// Gesto de ponteiro genérico (mouse, caneta e toque) do calendário das Bases:
// separa "clique" de "arrasto" por um limiar, segue o ponteiro na janela inteira e
// cancela com Esc. Quem decide o que o arrasto significa são os módulos de grade.

const LIMIAR_PX = 4;

/**
 * @param {PointerEvent} down
 * @param {{ onStart?:(e)=>void, onMove?:(e)=>void, onEnd?:(e, moved:boolean)=>void, onCancel?:()=>void,
 *           threshold?: number }} h
 * @returns {() => void} cancela o gesto
 */
export function beginPointerGesture(down, h) {
  const limiar = h.threshold ?? LIMIAR_PX;
  const x0 = down.clientX, y0 = down.clientY;
  let moved = false;
  let ativo = true;

  const limpa = () => {
    ativo = false;
    window.removeEventListener('pointermove', mover, true);
    window.removeEventListener('pointerup', soltar, true);
    window.removeEventListener('pointercancel', cancelar, true);
    window.removeEventListener('keydown', tecla, true);
  };

  function mover(e) {
    if (!ativo || e.pointerId !== down.pointerId) return;
    if (!moved) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < limiar) return;
      moved = true;
      h.onStart?.(e);
    }
    e.preventDefault();
    h.onMove?.(e);
  }

  function soltar(e) {
    if (!ativo || e.pointerId !== down.pointerId) return;
    limpa();
    h.onEnd?.(e, moved);
  }

  function cancelar() {
    if (!ativo) return;
    limpa();
    h.onCancel?.();
  }

  function tecla(e) {
    if (e.key === 'Escape') { e.stopPropagation(); cancelar(); }
  }

  window.addEventListener('pointermove', mover, true);
  window.addEventListener('pointerup', soltar, true);
  window.addEventListener('pointercancel', cancelar, true);
  window.addEventListener('keydown', tecla, true);
  return cancelar;
}
