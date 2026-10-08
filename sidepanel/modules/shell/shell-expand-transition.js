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
  // cabeçalho e conteúdo vão aparecendo aos poucos enquanto o recorte cresce
  for (const filho of sectionEl.children) {
    if (!filho.animate) continue;
    const header = filho.classList.contains('section-header');
    filho.animate([{ opacity: 0 }, { opacity: 1 }], { duration: header ? DURATION * 0.7 : DURATION * 0.9, delay: header ? 0 : 30, easing: 'ease-out', fill: 'backwards' });
  }
}

// ── Abertura/fechamento SOBRE a Base (célula do mês / coluna da semana) ─────────────────────
// A nota ou o quadro é revelado DENTRO da célula (ou coluna) enquanto ela expande: a cada quadro o
// recorte acompanha o retângulo real da célula, então as linhas da grade e o contorno da célula
// continuam por fora, e as outras células vão sendo empurradas para todos os lados. O cabeçalho da
// nota/quadro e o conteúdo vão aparecendo aos poucos (e some do mesmo jeito ao voltar).
const EXPANDED_SEL = '#bases-body .is-expanded-cell, #bases-body .is-expanded-col';
const OUTLINE = 1; // px do contorno da célula que o recorte deixa à mostra
const smooth = p => p * p * (3 - 2 * p);

function trackReveal(sectionEl, { reverse, done }) {
  sectionEl.classList.add('is-expand-overlay');
  const start = performance.now();
  const kids = [...sectionEl.children];
  let lastRect = origin?.rect ?? null;
  let finished = false;

  const clear = () => {
    sectionEl.style.clipPath = ''; sectionEl.style.opacity = '';
    kids.forEach(k => { k.style.opacity = ''; });
    sectionEl.classList.remove('is-expand-overlay');
  };
  const finish = () => { if (finished) return; finished = true; clear(); done(); };

  const frame = (now) => {
    if (finished) return;
    const t = Math.min(1, (now - start) / DURATION);
    const p = reverse ? 1 - t : t;
    const target = document.querySelector(EXPANDED_SEL);
    if (target) lastRect = target.getBoundingClientRect();
    if (lastRect) {
      const box = sectionEl.getBoundingClientRect();
      const r = lastRect;
      const top = Math.max(0, r.top - box.top + OUTLINE), left = Math.max(0, r.left - box.left + OUTLINE);
      const right = Math.max(0, box.right - r.right + OUTLINE), bottom = Math.max(0, box.bottom - r.bottom + OUTLINE);
      sectionEl.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
    }
    kids.forEach((k, i) => {
      const header = k.classList.contains('section-header');
      // cabeçalho aparece primeiro; o conteúdo vem logo atrás
      k.style.opacity = String(smooth(Math.min(1, Math.max(0, header ? p * 1.4 : (p - 0.1) / 0.9))));
    });
    if (t < 1) requestAnimationFrame(frame); else finish();
  };
  requestAnimationFrame(frame);
  setTimeout(finish, DURATION + 80); // painel oculto não dispara quadros: nunca fica preso
}

/** `done` quando a revelação termina. */
export function playOverlayOpen(sectionEl, done = () => {}) {
  if (!sectionEl || !origin) { done(); return; }
  origin.opened = true;
  trackReveal(sectionEl, { reverse: false, done });
}

/** Fechamento: a nota/quadro vai sumindo e encolhendo junto com a célula; `done` ao terminar. */
export function playOverlayClose(sectionEl, done = () => {}) {
  if (!sectionEl || !origin) { done(); return; }
  origin.opened = false;
  trackReveal(sectionEl, { reverse: true, done });
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