// ── shell-floating-asides.js ────────────────────────────────────────────────
// Botões flutuantes nos cantos de cima da nota e do quadro (como o Obsidian mobile). Só mobile:
// lá o cabeçalho da view fica oculto; no desktop as asides têm os botões do cabeçalho e a nav.
//   esquerda: [voltar] [abrir/fechar drawer esquerdo]
//   direita:  [configurações da view] [constelações]
// Os dois da direita reaproveitam o contrato de shell-right-aside.js (`data-aside-toggle` e
// `data-aside-graph`): é ele quem abre o drawer, alterna o modo e acende o botão.

import { openMobileLeftDrawer, closeMobileLeftDrawer } from './shell-mobile.js';
import { isRightAsideOpen, getRightAsideMode } from './shell-right-aside.js';

const HOSTS = ['#section-note', '#board-view'];
const ROOT_VIEW = 'bases';

const isLeftOpen = () => !!document.getElementById('mAside')?.classList.contains('is-open-mobile');

function makeButton(icon, label, attrs) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'floating-aside-btn';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  for (const [k, v] of Object.entries(attrs)) btn.setAttribute(k, v);
  btn.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${icon}</span>`;
  return btn;
}

function makeGroup(side, buttons) {
  const group = document.createElement('div');
  group.className = `floating-aside-group floating-aside-group-${side}`;
  group.append(...buttons);
  return group;
}

function setActive(btn, active) {
  btn.classList.toggle('is-active', active);
  btn.setAttribute('aria-pressed', String(active));
}

function syncButtons() {
  const leftOpen = isLeftOpen();
  const rightOpen = isRightAsideOpen();
  const mode = getRightAsideMode();
  for (const btn of document.querySelectorAll('[data-floating-aside="left"]')) {
    const label = `${leftOpen ? 'Fechar' : 'Abrir'} painel esquerdo`;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    setActive(btn, leftOpen);
    btn.firstElementChild.textContent = leftOpen ? 'left_panel_close' : 'left_panel_open';
  }
  for (const btn of document.querySelectorAll('.floating-aside-group-right [data-aside-toggle]')) setActive(btn, rightOpen && mode === 'config');
  for (const btn of document.querySelectorAll('.floating-aside-group-right [data-aside-graph]')) setActive(btn, rightOpen && mode === 'graph');
}

function goBack() {
  const headerBack = document.getElementById('btn-mobile-back'); // trata o histórico do sistema
  if (headerBack) headerBack.click();
  else if (typeof window.quickdockOpenView === 'function') window.quickdockOpenView(ROOT_VIEW);
}

export function initFloatingAsides() {
  for (const sel of HOSTS) {
    const host = document.querySelector(sel);
    if (!host || host.querySelector(':scope > .floating-aside-group')) continue;
    host.append(
      makeGroup('left', [
        makeButton('arrow_back', 'Voltar', { 'data-floating-back': '' }),
        makeButton('left_panel_open', 'Abrir painel esquerdo', { 'data-floating-aside': 'left' }),
      ]),
      makeGroup('right', [
        makeButton('tune', 'Configurações', { 'data-aside-toggle': '' }),
        makeButton('hub', 'Constelações', { 'data-aside-graph': '' }),
      ]),
    );
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-floating-back], [data-floating-aside]');
    if (!btn) return;
    e.stopPropagation();
    if ('floatingBack' in btn.dataset) goBack();
    else (isLeftOpen() ? closeMobileLeftDrawer : openMobileLeftDrawer)();
    syncButtons();
  });

  const aside = document.getElementById('mAside');
  if (aside) new MutationObserver(syncButtons).observe(aside, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('quickdock:right-aside-mode', syncButtons);
  syncButtons();
}
