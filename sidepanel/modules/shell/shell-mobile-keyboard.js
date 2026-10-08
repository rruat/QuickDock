// ── shell-mobile-keyboard.js ────────────────────────────────────────────────
// Detecta o teclado virtual aberto no mobile e marca `html.is-keyboard-open`. Com ele aberto some a
// barra de navegação inferior (fica só a quickbar da nota, logo acima do teclado) e o gesto de abrir
// drawers é desligado (o toque é do texto). Dois sinais, qualquer um vale: foco num campo editável
// e encolhimento da altura da janela (o viewport do app usa interactive-widget=resizes-content).

import { isMobileMode } from '../platform.js';

const EDITABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable=""], [contenteditable="true"]';
const SHRINK_RATIO = 0.8; // janela < 80% da maior altura vista = teclado

export function initMobileKeyboard() {
  const root = document.documentElement;
  let focused = false;
  let shrunk = false;
  let maxH = window.innerHeight;
  let timer = null;

  const apply = () => root.classList.toggle('is-keyboard-open', isMobileMode() && (focused || shrunk));

  document.addEventListener('focusin', (e) => {
    clearTimeout(timer);
    focused = !!e.target.closest?.(EDITABLE);
    apply();
  });
  document.addEventListener('focusout', () => {
    clearTimeout(timer);
    // um foco que passa direto de um campo para outro não deve piscar a nav
    timer = setTimeout(() => { focused = !!document.activeElement?.closest?.(EDITABLE); apply(); }, 120);
  });

  const onResize = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    if (window.innerHeight > maxH) maxH = window.innerHeight; // girou a tela / barra do navegador sumiu
    shrunk = h < maxH * SHRINK_RATIO;
    apply();
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => { maxH = 0; setTimeout(() => { maxH = window.innerHeight; onResize(); }, 300); });
}
