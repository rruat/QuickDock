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
    if (el?.getBoundingClientRect) {
      origin = { rect: el.getBoundingClientRect(), at: performance.now(), cell: e.target.closest?.('.bcal-month-cell[data-ymd]') || null,
        weekCol: e.target.closest?.('.bcal-col[data-ymd]') || null };
    }
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

/** Célula do mês de onde veio o clique (se for recente e a visão mês estiver na tela). */
export function getMonthOriginCell() {
  return hasFreshOrigin() && origin.cell?.isConnected ? origin.cell : null;
}

/** Coluna da semana/dia de onde veio o clique (se for recente e a visão estiver na tela). */
export function getWeekOriginCol() {
  return hasFreshOrigin() && origin.weekCol?.isConnected ? origin.weekCol : null;
}

export function hasFreshOrigin() {
  return !!origin && performance.now() - origin.at < FRESH_MS;
}

/** A tela `sectionEl` acabou de abrir: cresce do item clicado até ocupar tudo. */
export function playExpandOpen(sectionEl) {
  if (!sectionEl || reduceMotion() || !hasFreshOrigin() || !sectionEl.animate) return;
  origin.opened = true; // lembra que esta abertura veio de um item: o "voltar" encolhe até ele
  const from = insetFor(origin.rect, sectionEl.getBoundingClientRect());
  sectionEl.animate([{ clipPath: from, opacity: 0.4 }, { clipPath: FULL, opacity: 1 }], { duration: DURATION, easing: EASING });
  // o conteúdo (editor/quadro) já aparece desde o primeiro quadro: o recorte o vai revelando
  // enquanto a tela cresce, sem esperar a abertura terminar
}

/**
 * Abertura SOBRE a Base (célula do mês / coluna da semana): a nota ou o quadro já está montado
 * e é revelado por um recorte que cresce do item clicado, ao mesmo tempo em que a grade da Base
 * (por baixo) expande. `done` quando o recorte termina.
 */
export function playOverlayOpen(sectionEl, done = () => {}) {
  if (!sectionEl?.animate || !origin) { done(); return; }
  origin.opened = true;
  sectionEl.classList.add('is-expand-overlay');
  const from = insetFor(origin.rect, sectionEl.getBoundingClientRect());
  const anim = sectionEl.animate([{ clipPath: from, opacity: 0.5 }, { clipPath: FULL, opacity: 1 }], { duration: DURATION, easing: EASING });
  let acabou = false;
  const end = () => { if (acabou) return; acabou = true; sectionEl.classList.remove('is-expand-overlay'); done(); };
  anim.addEventListener('finish', end, { once: true });
  anim.addEventListener('cancel', end, { once: true });
}

/**
 * Fechamento SOBRE a Base: a nota/quadro continua visível e encolhe até o item de origem enquanto
 * a grade da Base (por baixo) volta ao tamanho normal. `done` ao terminar (aí a seção é escondida).
 */
export function playOverlayClose(sectionEl, done = () => {}) {
  if (!sectionEl?.animate || !origin) { done(); return; }
  origin.opened = false;
  sectionEl.classList.add('is-expand-overlay');
  const to = insetFor(origin.rect, sectionEl.getBoundingClientRect());
  const anim = sectionEl.animate([{ clipPath: FULL, opacity: 1 }, { clipPath: to, opacity: 0.5 }], { duration: DURATION, easing: EASING, fill: 'forwards' });
  let acabou = false;
  const end = () => { if (acabou) return; acabou = true; anim.cancel(); sectionEl.classList.remove('is-expand-overlay'); done(); };
  anim.addEventListener('finish', end, { once: true });
  anim.addEventListener('cancel', end, { once: true });
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