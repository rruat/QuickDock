// ── shell-motion.js ─────────────────────────────────────────────────────────
// Animações do shell (abrir item, abrir aside, trocar de tela). Uma só chave liga/desliga todas:
// "Animações de abertura" em Configurações. Ela vale por si: não herda sozinha a preferência
// "reduzir movimento" do sistema (no Windows, "Mostrar animações" desligado a ativa e fazia a
// animação do app sumir sem a pessoa saber). Quem quiser sem movimento desliga aqui.

export const MOTION_KEY = 'quickdock:spatial:animations';
export const MOTION_MS = 340;
export const MOTION_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

export function motionEnabled() {
  try { return localStorage.getItem(MOTION_KEY) !== '0'; } catch { return true; }
}

export function setMotionEnabled(on) {
  try { localStorage.setItem(MOTION_KEY, on ? '1' : '0'); } catch { /* sem storage: vale só nesta sessão */ }
}

/** Entra deslizando de `dx` px para o lugar (asides). */
export function slideIn(el, dx = 28, ms = 240) {
  if (!el?.animate || !motionEnabled()) return;
  el.animate(
    [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'translateX(0)' }],
    { duration: ms, easing: MOTION_EASING },
  );
}

/** Aparece suavemente (troca de tela, troca de view). */
export function fadeIn(el, ms = 180) {
  if (!el?.animate || !motionEnabled()) return;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' });
}
