// ── shell-mobile-keyboard.js ────────────────────────────────────────────────
// Detecta o teclado virtual aberto no mobile e marca `html.is-keyboard-open`. Com ele aberto some a
// barra de navegação inferior (fica só a quickbar da nota, logo acima do teclado) e o gesto de abrir
// drawers é desligado (o toque é do texto).
//
// O sinal que vale é o teclado de verdade: o encolhimento da janela (o viewport do app usa
// interactive-widget=resizes-content). O foco num campo editável só conta nos instantes logo depois
// de focar, até o teclado terminar de subir — a nota (contenteditable) continua com foco depois que
// o teclado é recolhido, e isso não pode impedir o swipe dos drawers. Quando o teclado some, o campo
// perde o foco: sem teclado, a nota não está em edição.

import { isMobileMode } from '../platform.js';

const EDITABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable=""], [contenteditable="true"]';
const SHRINK_RATIO = 0.8; // janela < 80% da maior altura vista = teclado
const RISE_GRACE_MS = 900; // tempo em que o foco sozinho vale, enquanto o teclado sobe

export function initMobileKeyboard() {
  const root = document.documentElement;
  let focused = false;
  let shrunk = false;
  let maxH = window.innerHeight;
  let blurTimer = null;
  let graceTimer = null;

  const apply = () => root.classList.toggle('is-keyboard-open', isMobileMode() && (focused || shrunk));

  document.addEventListener('focusin', (e) => {
    clearTimeout(blurTimer);
    clearTimeout(graceTimer);
    focused = !!e.target.closest?.(EDITABLE);
    if (focused) graceTimer = setTimeout(() => { focused = false; apply(); }, RISE_GRACE_MS);
    apply();
  });
  document.addEventListener('focusout', () => {
    clearTimeout(blurTimer);
    // um foco que passa direto de um campo para outro não deve piscar a nav
    blurTimer = setTimeout(() => {
      focused = !!document.activeElement?.closest?.(EDITABLE);
      if (!focused) clearTimeout(graceTimer);
      apply();
    }, 120);
  });

  const onResize = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    if (window.innerHeight > maxH) maxH = window.innerHeight; // girou a tela / barra do navegador sumiu
    const wasShrunk = shrunk;
    shrunk = h < maxH * SHRINK_RATIO;
    // teclado recolhido pelo botão do sistema: o campo fica com foco, mas a edição acabou
    if (wasShrunk && !shrunk && isMobileMode() && document.activeElement?.closest?.(EDITABLE)) document.activeElement.blur();
    apply();
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => { maxH = 0; setTimeout(() => { maxH = window.innerHeight; onResize(); }, 300); });
}
