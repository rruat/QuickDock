// ── shell-mobile-gestures.js ────────────────────────────────────────────────
// Arrasto de borda para abrir/fechar os drawers mobile (esquerdo = navegação,
// direito = inspetor). Durante o arrasto só variáveis CSS (--push-x, --aside-x,
// --right-x) são escritas, no máximo 1x por frame (rAF). Ao soltar, a transição
// CSS parte da posição atual do dedo (sem salto). Ver docs/MOBILE-CORRECAO-LAG-GESTOS.md.

import { isMobileMode } from '../platform.js';
import {
  openMobileLeftDrawer,
  closeMobileLeftDrawer,
  openMobileRightDrawer,
  isRightAsideOpen,
  closeMobileRightDrawer,
  updateMobileCarouselPositions,
  getLeftDrawerWidth,
  getRightDrawerWidth
} from './shell-mobile.js';
import {
  AXIS_LOCK_PX,
  dragPositions,
  releaseVelocity,
  shouldComplete
} from './shell-mobile-gesture-math.js';

const OPEN_LOCK_PX = 16; // arrasto de abrir a partir do meio da tela pede um pouco mais de intenção horizontal

// Algo que rola na horizontal (tabela, semana do calendário, barra de ferramentas da nota…) fica com o gesto
function insideHorizontalScroller(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

// Áreas com gesto próprio (rolagem/arrasto): nunca iniciam abrir nem fechar drawer — quickbar das
// Constelações, o grafo (pan), a barra de ferramentas da nota e o menu de seleção do rodapé
const GESTURE_OWNERS = '.gq-bar, .graph-canvas-container, .mobile-notion-toolbar, .md-scope-menu';

// Telas que arrastam em qualquer direção (pan): o gesto é delas, a não ser que comece na borda
const PAN_OWNERS = '.board-canvas, .base-map, .code-block';
const EDGE_PX = 28; // faixa junto à borda da tela em que o arrasto SEMPRE abre o drawer

// Quem rola na horizontal só segura o gesto enquanto ainda tem pra onde rolar naquele sentido:
// tabela/kanban/semana no início do scroll deixam o arrasto pra direita abrir o drawer esquerdo
// (e no fim, o arrasto pra esquerda abrir o direito). `dx > 0` = dedo indo pra direita.
function scrollerConsumes(el, dx) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth <= n.clientWidth + 2) continue;
    const ox = getComputedStyle(n).overflowX;
    if (ox !== 'auto' && ox !== 'scroll') continue;
    if (dx > 0 ? n.scrollLeft > 1 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
  }
  return false;
}

const DRAG_VARS = ['--push-x', '--aside-x', '--right-x'];

export function setupMobileTouchGestures() {
  if (!document.getElementById('mMain')) return;

  window.addEventListener('resize', () => updateMobileCarouselPositions(false));

  let action = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastDx = 0;
  let samples = [];
  let raf = 0;
  let leftW = 0;
  let rightW = 0;
  let els = null;
  let scrollOwner = null;

  const isLeftOpen = () => document.getElementById('mAside')?.classList.contains('is-open-mobile') || document.body.classList.contains('has-left-drawer-open');
  const isRightOpen = () => isRightAsideOpen();

  function collectEls() {
    return {
      aside: document.getElementById('mAside'),
      right: document.getElementById('mRightAside'),
      header: document.getElementById('mHeader'),
      main: document.getElementById('mMain')
    };
  }

  function writeFrame() {
    raf = 0;
    if (!dragging || !els) return;
    const pos = dragPositions(action, lastDx, leftW, rightW);
    if (!pos) return;
    const px = (v) => `${v}px`;
    els.header?.style.setProperty('--push-x', px(pos.push));
    els.main?.style.setProperty('--push-x', px(pos.push));
    // scrim: fade proporcional ao quanto o drawer já abriu (o conteúdo não se mexe)
    const w = Math.max(1, action.endsWith('left') ? leftW : rightW);
    document.body.style.setProperty('--scrim-o', String(Math.min(1, Math.abs(pos.push) / w)));
    if (pos.aside !== null) els.aside?.style.setProperty('--aside-x', px(pos.aside));
    if (pos.right !== null) els.right?.style.setProperty('--right-x', px(pos.right));
  }

  function clearVars() {
    document.body.style.removeProperty('--scrim-o');
    if (!els) return;
    for (const el of [els.aside, els.right, els.header, els.main]) {
      if (!el) continue;
      for (const v of DRAG_VARS) el.style.removeProperty(v);
    }
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    action = null;
    dragging = false;
    samples = [];
    scrollOwner = null;
    document.body.classList.remove('is-dragging-drawer');
  }

  document.addEventListener('touchstart', (e) => {
    reset();
    if (window.innerWidth > 768 && !isMobileMode()) return;
    if (!e.touches || e.touches.length !== 1) return;

    const target = e.target;
    if (target.closest('input, textarea, select, .property-input, .property-select')) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;

    const x = e.touches[0].clientX;
    startX = x;
    startY = e.touches[0].clientY;
    lastDx = 0;
    samples = [{ x, t: e.timeStamp }];
    // Leituras de layout só aqui (1x por gesto)
    leftW = getLeftDrawerWidth();
    rightW = getRightDrawerWidth();

    const nearEdge = x < EDGE_PX || x > window.innerWidth - EDGE_PX;
    if (target.closest(GESTURE_OWNERS) && !nearEdge) return; // vale também para fechar
    if (isLeftOpen()) {
      if (insideHorizontalScroller(target)) return;
      action = 'close-left';
    } else if (isRightOpen()) {
      if (insideHorizontalScroller(target)) return;
      action = 'close-right';
    } else {
      // Como no Obsidian: arrastar de QUALQUER ponto da tela abre o drawer (sem precisar puxar da borda,
      // que o navegador usa para voltar no histórico). Para a direita → views; para a esquerda → configurações.
      // A direção só é decidida no 1º movimento (ver touchmove).
      if (document.documentElement.classList.contains('is-keyboard-open')) return; // editando: o toque é do texto
      if (!nearEdge && target.closest(PAN_OWNERS)) return;
      // Texto selecionado só segura o gesto se for de um campo/nota em edição; a seleção solta de uma
      // célula de tabela ou de um cartão não deve impedir o arrasto.
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.type === 'Range' && sel.anchorNode?.parentElement?.closest('[contenteditable="true"], input, textarea')) return;
      action = 'pending-open';
      // quem rola na horizontal decide no 1º movimento, quando o sentido do dedo já é conhecido
      scrollOwner = nearEdge ? null : target;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!action || !e.touches || e.touches.length === 0) return;
    const x = e.touches[0].clientX;
    const dx = x - startX;
    const dy = e.touches[0].clientY - startY;

    if (!dragging) {
      if (Math.abs(dy) > Math.abs(dx) + 6) { action = null; return; }
      if (Math.abs(dx) <= (action === 'pending-open' ? OPEN_LOCK_PX : AXIS_LOCK_PX)) return;
      if (action === 'pending-open') {
        if (scrollOwner && scrollerConsumes(scrollOwner, dx)) { action = null; return; }
        action = dx > 0 ? 'open-left' : 'open-right';
      }
      dragging = true;
      // o arrasto assume: tira o foco de célula/botão e qualquer seleção solta, para não competirem
      const ae = document.activeElement;
      if (ae && ae !== document.body && !ae.closest?.('input, textarea, [contenteditable="true"]')) ae.blur?.();
      window.getSelection?.()?.removeAllRanges?.();
      els = collectEls();
      document.body.classList.add('is-dragging-drawer');
    }

    lastDx = dx;
    samples.push({ x, t: e.timeStamp });
    if (samples.length > 8) samples.shift();
    if (!raf) raf = requestAnimationFrame(writeFrame);
  }, { passive: true });

  function finish(cancelled) {
    if (!action) return;
    const act = action;
    const wasDragging = dragging;
    const velocity = releaseVelocity(samples);
    const dx = lastDx;
    const width = act.endsWith('left') ? leftW : rightW;

    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (wasDragging) {
      // Aplica a posição final e força o estilo, para a transição partir daqui
      writeFrame_final();
    }
    const complete = wasDragging && !cancelled && shouldComplete(act, dx, velocity, width);
    const opening = act.startsWith('open');
    const target = act.endsWith('left') ? 'left' : 'right';
    // Estado final: concluir um "open" abre; concluir um "close" fecha; senão reverte.
    const wantOpen = opening ? complete : !complete;

    document.body.classList.remove('is-dragging-drawer');
    clearVars();
    action = null;
    dragging = false;
    samples = [];
    if (!wasDragging) return;

    if (target === 'left') (wantOpen ? openMobileLeftDrawer : closeMobileLeftDrawer)();
    else (wantOpen ? openMobileRightDrawer : closeMobileRightDrawer)();
  }

  function writeFrame_final() {
    const wasDragging = dragging;
    dragging = true;
    writeFrame();
    dragging = wasDragging;
    // Força recálculo de estilo com transition:none ainda ativo
    void document.getElementById('mMain')?.offsetWidth;
  }

  document.addEventListener('touchend', () => finish(false));
  document.addEventListener('touchcancel', () => finish(true));
}
