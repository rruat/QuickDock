// ── shell-expand-transition.js ──────────────────────────────────────────────
// A animação do mockup: abrir um item (nota ou quadro) a partir da view faz o item CRESCER
// a partir de onde foi clicado até ocupar a tela; voltar faz o caminho inverso. Aqui isso é
// um recorte (clip-path) animado na tela que abre — funciona igual para a célula do
// calendário, a linha da tabela e o cartão da galeria, sem mexer nas views.

import { motionEnabled, MOTION_MS as DURATION, MOTION_EASING as EASING } from './shell-motion.js';

const FRESH_MS = 2500;   // o clique de origem só vale por alguns segundos
// o que conta como "o item clicado" dentro da view (senão, o próprio alvo do clique)
const ORIGIN_SELECTOR = 'tr, [class*="card"], [class*="event"], [class*="chip"], [class*="cell"], [data-note-id]';

let origin = null; // { rect, at }

const reduceMotion = () => !motionEnabled(); // ligado/desligado em Configurações > Animações de abertura (shell-motion.js)

/** Guarda o retângulo do item clicado dentro de `root` (a tela da Base). */
export function trackExpandOrigin(root) {
  root?.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.(ORIGIN_SELECTOR) || e.target;
    if (el?.getBoundingClientRect) origin = { rect: el.getBoundingClientRect(), at: performance.now() };
  }, true);
}

/** Recorte (inset) que deixa só `rect` visível dentro de `box`. Puro: recebe e devolve números. */
export function insetFor(rect, box) {
  const top = Math.max(0, rect.top - box.top);
  const left = Math.max(0, rect.left - box.left);
  const right = Math.max(0, box.right - rect.right);
  const bottom = Math.max(0, box.bottom - rect.bottom);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 10px)`;
}

const FULL = 'inset(0px 0px 0px 0px round 0px)';

export function hasFreshOrigin() {
  return !!origin && performance.now() - origin.at < FRESH_MS;
}

/** A tela `sectionEl` acabou de abrir: cresce do item clicado até ocupar tudo. */
export function playExpandOpen(sectionEl) {
  if (!sectionEl || reduceMotion() || !hasFreshOrigin() || !sectionEl.animate) return;
  origin.opened = true; // lembra que esta abertura veio de um item: o "voltar" encolhe até ele
  const from = insetFor(origin.rect, sectionEl.getBoundingClientRect());
  sectionEl.animate([{ clipPath: from, opacity: 0.4 }, { clipPath: FULL, opacity: 1 }], { duration: DURATION, easing: EASING });
  // o conteúdo (editor/quadro) aparece depois, enquanto a tela termina de crescer
  for (const filho of sectionEl.children) {
    if (filho.classList.contains('section-header') || !filho.animate) continue;
    filho.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 160, easing: 'ease', fill: 'backwards' });
  }
}

/** Voltar: a tela encolhe até o item de origem e então `done()` troca de tela. */
export function playCollapseClose(sectionEl, done) {
  if (!sectionEl || !origin?.opened || reduceMotion() || !sectionEl.animate) { done(); return; }
  origin.opened = false;
  const to = insetFor(origin.rect, sectionEl.getBoundingClientRect());
  const anim = sectionEl.animate([{ clipPath: FULL, opacity: 1 }, { clipPath: to, opacity: 0.4 }], { duration: DURATION, easing: EASING, fill: 'forwards' });
  let acabou = false;
  const end = () => { if (acabou) return; acabou = true; anim.cancel(); done(); };
  anim.addEventListener('finish', end, { once: true });
  anim.addEventListener('cancel', end, { once: true });
}