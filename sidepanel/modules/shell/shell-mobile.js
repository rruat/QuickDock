// ── shell-mobile.js ─────────────────────────────────────────────────────────
// Gerenciador de Carrossel Infinito com Transição Unidirecional e Gestos de Toque
// para Mobile (Layout Spatial Shell em telas estreitas e PWA mobile).

import { isMobileMode } from '../platform.js';
import { loadAllNotesMeta } from '../storage.js';
import { SHELL_VIEWS } from './shell-views.js';

let _getOpenViewIds = () => [];
let _getFocusedViewId = () => null;
let _setFocusedViewId = () => {};

let mobileActiveIndex = 0;
let isMobileSwiping = false;
let isSwipingHorizontal = false;
let mobileTouchStartX = 0;
let mobileTouchStartY = 0;
let mobileCurrentDiffX = 0;
let mobileHasVibrated = false;
let mobileCurrentCard = null;
let mobileTargetCard = null;
let mobileIsAnimating = false;

export function initShellMobile(options = {}) {
  if (typeof options.getOpenViewIds === 'function') _getOpenViewIds = options.getOpenViewIds;
  if (typeof options.getFocusedViewId === 'function') _getFocusedViewId = options.getFocusedViewId;
  if (typeof options.setFocusedViewId === 'function') _setFocusedViewId = options.setFocusedViewId;
  setupMobileObsidianUI();
}

function triggerWallHaptic() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      // Impacto duplo firme: sensação física de colisão ("batendo em uma parede")
      navigator.vibrate([28, 14, 32]);
    } catch (_) {}
  }
}

function triggerSnapHaptic() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(20);
    } catch (_) {}
  }
}

function getOpenMobileSections() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return [];
  const openIds = typeof _getOpenViewIds === 'function' ? _getOpenViewIds() : ['notes'];
  return openIds
    .map(id => mainEl.querySelector(`:scope > [data-id="${id}"]`))
    .filter(Boolean);
}

export function syncMobileActiveViewUI(activeId) {
  if (!activeId) return;

  const navEl = document.getElementById('mNav');
  if (navEl) {
    navEl.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.navView === activeId);
    });
  }

  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.querySelectorAll('.main-section').forEach(sec => {
      sec.classList.toggle('is-focused', sec.dataset.id === activeId);
    });
  }

  const footerLabel = document.getElementById('footer-active-view-name');
  if (footerLabel) {
    const viewMeta = SHELL_VIEWS.find(v => v.id === activeId);
    footerLabel.textContent = viewMeta ? viewMeta.title : activeId;
  }
}

export function updateMobileCarouselPositions(animated = false) {
  if (window.innerWidth > 768 && !isMobileMode()) {
    const mainEl = document.getElementById('mMain');
    if (mainEl) {
      mainEl.querySelectorAll('.main-section').forEach(sec => {
        sec.style.removeProperty('transform');
        sec.style.removeProperty('transition');
        sec.style.removeProperty('visibility');
        sec.style.removeProperty('opacity');
        sec.style.removeProperty('z-index');
        sec.style.removeProperty('pointer-events');
        sec.style.removeProperty('display');
      });
    }
    return;
  }

  const sections = getOpenMobileSections();
  if (sections.length === 0) return;

  let focusedViewId = typeof _getFocusedViewId === 'function' ? _getFocusedViewId() : null;
  if (!focusedViewId && sections[0]?.dataset?.id) {
    focusedViewId = sections[0].dataset.id;
  }
  if (focusedViewId) {
    const idx = sections.findIndex(s => s.dataset.id === focusedViewId);
    if (idx !== -1) mobileActiveIndex = idx;
  }
  if (mobileActiveIndex < 0 || mobileActiveIndex >= sections.length) {
    mobileActiveIndex = 0;
  }

  sections.forEach((sec, idx) => {
    sec.style.removeProperty('transition');
    sec.style.removeProperty('transform');
    if (idx === mobileActiveIndex) {
      sec.style.setProperty('display', 'flex', 'important');
      sec.style.setProperty('opacity', '1');
      sec.style.setProperty('pointer-events', 'auto');
      sec.style.setProperty('z-index', '1');
      sec.style.setProperty('visibility', 'visible');
      sec.classList.add('is-focused');
    } else {
      sec.style.setProperty('display', 'none', 'important');
      sec.style.setProperty('opacity', '0');
      sec.style.setProperty('pointer-events', 'none');
      sec.style.setProperty('z-index', '0');
      sec.style.setProperty('visibility', 'hidden');
      sec.classList.remove('is-focused');
    }
  });

  const activeSec = sections[mobileActiveIndex];
  if (activeSec && activeSec.dataset.id) {
    _setFocusedViewId(activeSec.dataset.id);
    syncMobileActiveViewUI(activeSec.dataset.id);
  }
}

export function transitionToMobileCard(targetId, preferredDirection = 'auto') {
  if (window.innerWidth > 768 && !isMobileMode()) return;
  const sections = getOpenMobileSections();
  if (sections.length === 0) return;

  const targetIndex = sections.findIndex(s => s.dataset.id === targetId);
  if (targetIndex === -1) return;

  mobileActiveIndex = targetIndex;
  _setFocusedViewId(targetId);
  updateMobileCarouselPositions(false);
  window.dispatchEvent(new CustomEvent('resize'));
}

function onMobileTouchStart(e) {
  if (window.innerWidth > 768 && !isMobileMode()) return;
  if (mobileIsAnimating) return;

  const sections = getOpenMobileSections();
  if (sections.length <= 1) return;

  if (e.target.closest('input, textarea')) return;
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
  if (document.activeElement && document.activeElement.isContentEditable && e.target.closest('[contenteditable="true"]')) return;
  if (e.target.closest('#board-container, #graph-canvas-container, .kanban-board, .table-container, .note-properties-suggested-bar, .suggested-chips-scroll, .suggested-chips-container, .property-chip-list')) {
    if (!e.target.closest('.section-header')) return;
  }

  if (!e.touches || e.touches.length === 0) return;

  // Se o toque começou na borda da tela (gesto de abrir gavetas) ou se alguma gaveta já está aberta, não arrasta o carrossel
  const touchStartX = e.touches[0].clientX;
  if (touchStartX <= 35 || touchStartX >= window.innerWidth - 35) return;
  if (document.getElementById('mAside')?.classList.contains('is-open-mobile')) return;
  if (document.getElementById('mobileRightDrawer')?.classList.contains('is-open-mobile')) return;

  const focusedViewId = _getFocusedViewId();
  if (focusedViewId) {
    const idx = sections.findIndex(s => s.dataset.id === focusedViewId);
    if (idx !== -1) mobileActiveIndex = idx;
  }
  if (mobileActiveIndex < 0 || mobileActiveIndex >= sections.length) {
    mobileActiveIndex = 0;
  }

  mobileTouchStartX = e.touches[0].clientX;
  mobileTouchStartY = e.touches[0].clientY;
  mobileCurrentDiffX = 0;
  mobileHasVibrated = false;
  isMobileSwiping = true;
  isSwipingHorizontal = false;

  const activeSec = sections[mobileActiveIndex] || sections[0];
  mobileCurrentCard = activeSec;
  mobileTargetCard = null;
}

function onMobileTouchMove(e) {
  if (!isMobileSwiping || mobileIsAnimating || !mobileCurrentCard) return;
  if (!e.touches || e.touches.length === 0) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - mobileTouchStartX;
  const diffY = currentY - mobileTouchStartY;

  if (!isSwipingHorizontal) {
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 6) {
      isMobileSwiping = false;
      return;
    }
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
      isSwipingHorizontal = true;
    } else {
      return;
    }
  }

  mobileCurrentDiffX = diffX;
  const sections = getOpenMobileSections();
  const N = sections.length;
  if (N <= 1) return;

  const cardWidth = window.innerWidth;
  let targetIndex = -1;

  if (diffX < 0) {
    // Gesto para a esquerda -> Próximo card no sentido do carrossel (1 → 2 → 1)
    targetIndex = (mobileActiveIndex + 1) % N;
  } else if (diffX > 0) {
    // Gesto para a direita -> Card anterior no sentido reverso do carrossel (1 ← 2 ← 1)
    targetIndex = (mobileActiveIndex - 1 + N) % N;
  }

  if (targetIndex !== -1 && targetIndex !== mobileActiveIndex) {
    const newTarget = sections[targetIndex];
    if (mobileTargetCard && mobileTargetCard !== newTarget) {
      mobileTargetCard.style.visibility = 'hidden';
      mobileTargetCard.style.opacity = '0';
    }
    mobileTargetCard = newTarget;
    mobileTargetCard.style.visibility = 'visible';
    mobileTargetCard.style.opacity = '1';
    mobileTargetCard.style.zIndex = '2';
    mobileTargetCard.style.pointerEvents = 'none';
    mobileTargetCard.style.transition = 'none';

    // Se o dedo move para a esquerda (diffX < 0), o próximo card SEMPRE entra pela direita (cardWidth + diffX)
    // Se o dedo move para a direita (diffX > 0), o card anterior SEMPRE entra pela esquerda (-cardWidth + diffX)
    const offset = diffX < 0 ? (cardWidth + diffX) : (-cardWidth + diffX);
    mobileTargetCard.style.transform = `translate3d(${offset}px, 0, 0)`;
  }

  mobileCurrentCard.style.transition = 'none';
  mobileCurrentCard.style.transform = `translate3d(${diffX}px, 0, 0)`;

  // Haptic feedback de impacto firme ("batendo em uma parede") ao cruzar o limiar de 45px
  if (Math.abs(diffX) >= 45) {
    if (!mobileHasVibrated) {
      triggerWallHaptic();
      mobileHasVibrated = true;
    }
  } else {
    mobileHasVibrated = false;
  }
}

function onMobileTouchEnd() {
  if (!isMobileSwiping || mobileIsAnimating || !mobileCurrentCard) return;
  isMobileSwiping = false;

  const sections = getOpenMobileSections();
  const N = sections.length;
  const cardWidth = window.innerWidth;
  const diffX = mobileCurrentDiffX;

  if (N <= 1 || !mobileTargetCard) {
    if (mobileCurrentCard) {
      mobileCurrentCard.style.transition = 'transform 240ms cubic-bezier(0.25, 1, 0.5, 1)';
      mobileCurrentCard.style.transform = 'translate3d(0, 0, 0)';
    }
    mobileCurrentCard = null;
    mobileTargetCard = null;
    return;
  }

  const SWIPE_THRESHOLD = 45;

  if (Math.abs(diffX) >= SWIPE_THRESHOLD) {
    // Troca de card confirmada respeitando estritamente a direção do movimento!
    mobileIsAnimating = true;
    triggerSnapHaptic();

    const isNext = diffX < 0;
    const finalCurrentX = isNext ? -cardWidth : cardWidth;

    mobileCurrentCard.style.transition = 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1), opacity 260ms ease';
    mobileTargetCard.style.transition = 'transform 260ms cubic-bezier(0.25, 1, 0.5, 1), opacity 260ms ease';

    mobileCurrentCard.style.transform = `translate3d(${finalCurrentX}px, 0, 0)`;
    mobileTargetCard.style.transform = 'translate3d(0, 0, 0)';

    const newIndex = isNext ? (mobileActiveIndex + 1) % N : (mobileActiveIndex - 1 + N) % N;
    const newTargetId = sections[newIndex]?.dataset?.id;
    if (newTargetId) {
      _setFocusedViewId(newTargetId);
      syncMobileActiveViewUI(newTargetId);
    }

    setTimeout(() => {
      mobileActiveIndex = newIndex;
      if (newTargetId) {
        _setFocusedViewId(newTargetId);
      }
      mobileCurrentCard = null;
      mobileTargetCard = null;
      mobileIsAnimating = false;
      updateMobileCarouselPositions(false);
      window.dispatchEvent(new CustomEvent('resize'));
    }, 270);

  } else {
    // Não atingiu a distância mínima: cancela e retorna para a posição de repouso
    mobileIsAnimating = true;
    const resetTargetX = diffX < 0 ? cardWidth : -cardWidth;

    mobileCurrentCard.style.transition = 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)';
    mobileTargetCard.style.transition = 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)';

    mobileCurrentCard.style.transform = 'translate3d(0, 0, 0)';
    mobileTargetCard.style.transform = `translate3d(${resetTargetX}px, 0, 0)`;

    setTimeout(() => {
      mobileCurrentCard = null;
      mobileTargetCard = null;
      mobileIsAnimating = false;
      updateMobileCarouselPositions(false);
    }, 230);
  }
}

function getLeftDrawerWidth() {
  const aside = document.getElementById('mAside');
  return aside ? Math.min(window.innerWidth * 0.85, 320) : 300;
}

function getRightDrawerWidth() {
  const drawer = document.getElementById('mobileRightDrawer');
  return drawer ? Math.min(window.innerWidth * 0.85, 340) : 320;
}

export function openMobileLeftDrawer() {
  const mAside = document.getElementById('mAside');
  const rightDrawer = document.getElementById('mobileRightDrawer');
  const app = document.getElementById('app');

  closeMobileRightDrawer();

  if (mAside) {
    mAside.classList.add('is-open-mobile');
    mAside.style.removeProperty('transform');
    mAside.style.removeProperty('transition');
    mAside.style.removeProperty('pointer-events');
  }
  app?.classList.add('has-left-drawer-open');
  document.body.classList.add('has-left-drawer-open');

  const mHeader = document.getElementById('mHeader');
  const mMain = document.getElementById('mMain');
  if (mHeader) {
    mHeader.style.removeProperty('transform');
    mHeader.style.removeProperty('transition');
  }
  if (mMain) {
    mMain.style.removeProperty('transform');
    mMain.style.removeProperty('transition');
  }

  triggerSnapHaptic();
}

export function closeMobileLeftDrawer() {
  const mAside = document.getElementById('mAside');
  const app = document.getElementById('app');

  if (mAside) {
    mAside.classList.remove('is-open-mobile');
    mAside.style.removeProperty('transform');
    mAside.style.removeProperty('transition');
    mAside.style.removeProperty('pointer-events');
  }
  app?.classList.remove('has-left-drawer-open');
  document.body.classList.remove('has-left-drawer-open');

  const mHeader = document.getElementById('mHeader');
  const mMain = document.getElementById('mMain');
  if (mHeader) {
    mHeader.style.removeProperty('transform');
    mHeader.style.removeProperty('transition');
  }
  if (mMain) {
    mMain.style.removeProperty('transform');
    mMain.style.removeProperty('transition');
  }
}

export function toggleMobileLeftDrawer(force) {
  const mAside = document.getElementById('mAside');
  if (!mAside) return;
  const isCurrentlyOpen = mAside.classList.contains('is-open-mobile') || document.body.classList.contains('has-left-drawer-open');
  const shouldOpen = force !== undefined ? Boolean(force) : !isCurrentlyOpen;
  if (shouldOpen) openMobileLeftDrawer();
  else closeMobileLeftDrawer();
}

export function openMobileRightDrawer(tab) {
  const rightDrawer = document.getElementById('mobileRightDrawer');
  const app = document.getElementById('app');

  closeMobileLeftDrawer();

  if (rightDrawer) {
    rightDrawer.classList.add('is-open-mobile');
    rightDrawer.style.removeProperty('transform');
    rightDrawer.style.removeProperty('transition');
    rightDrawer.style.removeProperty('pointer-events');
  }
  app?.classList.add('has-right-drawer-open');
  document.body.classList.add('has-right-drawer-open');

  const mHeader = document.getElementById('mHeader');
  const mMain = document.getElementById('mMain');
  if (mHeader) {
    mHeader.style.removeProperty('transform');
    mHeader.style.removeProperty('transition');
  }
  if (mMain) {
    mMain.style.removeProperty('transform');
    mMain.style.removeProperty('transition');
  }

  triggerSnapHaptic();

  document.dispatchEvent(new CustomEvent('quickdock:open-mobile-inspector', {
    detail: { tab: tab || 'outline' }
  }));
}

export function closeMobileRightDrawer() {
  const rightDrawer = document.getElementById('mobileRightDrawer');
  const app = document.getElementById('app');

  if (rightDrawer) {
    rightDrawer.classList.remove('is-open-mobile');
    rightDrawer.style.removeProperty('transform');
    rightDrawer.style.removeProperty('transition');
    rightDrawer.style.removeProperty('pointer-events');
  }
  app?.classList.remove('has-right-drawer-open');
  document.body.classList.remove('has-right-drawer-open');

  const mHeader = document.getElementById('mHeader');
  const mMain = document.getElementById('mMain');
  if (mHeader) {
    mHeader.style.removeProperty('transform');
    mHeader.style.removeProperty('transition');
  }
  if (mMain) {
    mMain.style.removeProperty('transform');
    mMain.style.removeProperty('transition');
  }
}

export function toggleMobileRightDrawer(force) {
  const rightDrawer = document.getElementById('mobileRightDrawer');
  if (!rightDrawer) return;
  const isCurrentlyOpen = rightDrawer.classList.contains('is-open-mobile') || document.body.classList.contains('has-right-drawer-open');
  const shouldOpen = force !== undefined ? Boolean(force) : !isCurrentlyOpen;
  if (shouldOpen) openMobileRightDrawer();
  else closeMobileRightDrawer();
}

export function closeAllMobileDrawers() {
  closeMobileLeftDrawer();
  closeMobileRightDrawer();
}

export async function updateMobileHeaderNoteTitle(noteId) {
  const titleEl = document.getElementById('mobile-header-note-title');
  if (!titleEl) return;

  if (noteId == null) {
    const headerTitleEl = document.getElementById('note-header-title');
    const text = headerTitleEl?.textContent?.trim();
    titleEl.textContent = text || 'Sem título';
    return;
  }

  try {
    const notas = await loadAllNotesMeta();
    const meta = notas.find(n => n.id === noteId);
    titleEl.textContent = meta?.title || 'Sem título';
  } catch (_) {
    titleEl.textContent = 'Sem título';
  }
}

export function setupMobileObsidianUI() {
  const btnLeft = document.getElementById('btn-mobile-left-drawer');
  if (btnLeft) {
    btnLeft.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileLeftDrawer();
    });
  }

  const btnRight = document.getElementById('btn-mobile-right-drawer');
  if (btnRight) {
    btnRight.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileRightDrawer();
    });
  }

  const btnCloseAside = document.getElementById('btnCloseAsideMobile');
  if (btnCloseAside) {
    btnCloseAside.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMobileLeftDrawer();
    });
  }

  const scrim = document.getElementById('mobileDrawerScrim');
  if (scrim) {
    scrim.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMobileDrawers();
    });
  }

  const mainEl = document.getElementById('mMain');
  if (mainEl) {
    mainEl.addEventListener('click', (e) => {
      const isLeftOpen = document.body.classList.contains('has-left-drawer-open') || document.getElementById('mAside')?.classList.contains('is-open-mobile');
      const isRightOpen = document.body.classList.contains('has-right-drawer-open') || document.getElementById('mobileRightDrawer')?.classList.contains('is-open-mobile');
      if (isLeftOpen || isRightOpen) {
        e.stopPropagation();
        e.preventDefault();
        closeAllMobileDrawers();
      }
    }, true);
  }

  const noteInfoPill = document.getElementById('mobile-header-note-info');
  const headerEl = document.getElementById('mHeader');
  const searchInput = document.getElementById('smartSearchInput');

  if (noteInfoPill && headerEl && searchInput) {
    noteInfoPill.addEventListener('click', (e) => {
      e.stopPropagation();
      headerEl.classList.toggle('is-search-active');
      if (headerEl.classList.contains('is-search-active')) {
        searchInput.focus();
        document.dispatchEvent(new CustomEvent('quickdock:open-omnibar'));
      }
    });

    document.addEventListener('click', (e) => {
      if (!headerEl.classList.contains('is-search-active')) return;
      if (!headerEl.contains(e.target)) {
        headerEl.classList.remove('is-search-active');
      }
    });
  }

  document.addEventListener('quickdock:active-note-changed', (e) => {
    updateMobileHeaderNoteTitle(e.detail?.id);
  });

  document.addEventListener('quickdock:note-title-committed', (e) => {
    const titleEl = document.getElementById('mobile-header-note-title');
    if (titleEl && e.detail?.title !== undefined) {
      titleEl.textContent = e.detail.title || 'Sem título';
    }
  });

  updateMobileHeaderNoteTitle();
}

export function setupMobileTouchGestures() {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  window.addEventListener('resize', () => {
    updateMobileCarouselPositions(false);
  });

  // Gestos de arrasto e borda (Edge Swipe & Pull to Push) no padrão Obsidian Mobile
  let edgeStartX = 0;
  let edgeStartY = 0;
  let edgeStartTime = 0;
  let isDraggingDrawer = false;
  let activeDragAction = null;
  let lastDiffX = 0;

  document.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768 && !isMobileMode()) return;
    if (!e.touches || e.touches.length === 0) return;

    const target = e.target;
    // Ignora elementos interativos
    if (target.closest('input, textarea, select, .property-input, .property-select, button')) return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    edgeStartX = x;
    edgeStartY = y;
    edgeStartTime = Date.now();
    lastDiffX = 0;
    isDraggingDrawer = false;
    activeDragAction = null;

    const mAside = document.getElementById('mAside');
    const rightDrawer = document.getElementById('mobileRightDrawer');
    const isLeftOpen = mAside?.classList.contains('is-open-mobile') || document.body.classList.contains('has-left-drawer-open');
    const isRightOpen = rightDrawer?.classList.contains('is-open-mobile') || document.body.classList.contains('has-right-drawer-open');

    const leftWidth = getLeftDrawerWidth();
    const rightWidth = getRightDrawerWidth();

    if (isLeftOpen) {
      activeDragAction = 'close-left';
      if (x >= leftWidth) isDraggingDrawer = true;
    } else if (isRightOpen) {
      activeDragAction = 'close-right';
      if (x <= window.innerWidth - rightWidth) isDraggingDrawer = true;
    } else {
      // Zona de borda generosa (75px) ou toque no header
      if (x <= 75 || target.closest('#mHeader .header-left, #mHeader .header-center')) {
        activeDragAction = 'open-left';
      } else if (x >= window.innerWidth - 75 || target.closest('#mHeader .header-right')) {
        activeDragAction = 'open-right';
      }
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!activeDragAction || !e.touches || e.touches.length === 0) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - edgeStartX;
    const dy = currentY - edgeStartY;

    if (!isDraggingDrawer) {
      if (Math.abs(dy) > Math.abs(dx) + 6) {
        activeDragAction = null;
        return;
      }
      if (Math.abs(dx) > 10) {
        isDraggingDrawer = true;
      } else {
        return;
      }
    }

    lastDiffX = dx;
    const mAside = document.getElementById('mAside');
    const rightDrawer = document.getElementById('mobileRightDrawer');
    const mHeader = document.getElementById('mHeader');
    const mMain = document.getElementById('mMain');

    const leftWidth = getLeftDrawerWidth();
    const rightWidth = getRightDrawerWidth();

    if (activeDragAction === 'open-left') {
      const currentDx = Math.min(leftWidth, Math.max(0, dx));
      if (mAside) {
        mAside.style.transform = `translate3d(${currentDx - leftWidth}px, 0, 0)`;
        mAside.style.transition = 'none';
        mAside.style.pointerEvents = 'none';
      }
      if (mHeader) {
        mHeader.style.transform = `translate3d(${currentDx}px, 0, 0)`;
        mHeader.style.transition = 'none';
      }
      if (mMain) {
        mMain.style.transform = `translate3d(${currentDx}px, 0, 0)`;
        mMain.style.transition = 'none';
      }
    } else if (activeDragAction === 'open-right') {
      const currentDx = Math.max(-rightWidth, Math.min(0, dx));
      if (rightDrawer) {
        rightDrawer.style.transform = `translate3d(${rightWidth + currentDx}px, 0, 0)`;
        rightDrawer.style.transition = 'none';
        rightDrawer.style.pointerEvents = 'none';
      }
      if (mHeader) {
        mHeader.style.transform = `translate3d(${currentDx}px, 0, 0)`;
        mHeader.style.transition = 'none';
      }
      if (mMain) {
        mMain.style.transform = `translate3d(${currentDx}px, 0, 0)`;
        mMain.style.transition = 'none';
      }
    } else if (activeDragAction === 'close-left') {
      const currentDx = Math.max(-leftWidth, Math.min(0, dx));
      const shiftedPos = leftWidth + currentDx;
      if (mAside) {
        mAside.style.transform = `translate3d(${currentDx}px, 0, 0)`;
        mAside.style.transition = 'none';
      }
      if (mHeader) {
        mHeader.style.transform = `translate3d(${shiftedPos}px, 0, 0)`;
        mHeader.style.transition = 'none';
      }
      if (mMain) {
        mMain.style.transform = `translate3d(${shiftedPos}px, 0, 0)`;
        mMain.style.transition = 'none';
      }
    } else if (activeDragAction === 'close-right') {
      const currentDx = Math.min(rightWidth, Math.max(0, dx));
      const shiftedPos = -rightWidth + currentDx;
      if (rightDrawer) {
        rightDrawer.style.transform = `translate3d(${currentDx}px, 0, 0)`;
        rightDrawer.style.transition = 'none';
      }
      if (mHeader) {
        mHeader.style.transform = `translate3d(${shiftedPos}px, 0, 0)`;
        mHeader.style.transition = 'none';
      }
      if (mMain) {
        mMain.style.transform = `translate3d(${shiftedPos}px, 0, 0)`;
        mMain.style.transition = 'none';
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!activeDragAction) return;

    const dx = lastDiffX;
    const elapsed = Date.now() - edgeStartTime;
    const isFlick = elapsed < 260 && Math.abs(dx) > 25;
    const action = activeDragAction;
    const wasDragging = isDraggingDrawer;

    activeDragAction = null;
    isDraggingDrawer = false;

    const mAside = document.getElementById('mAside');
    const rightDrawer = document.getElementById('mobileRightDrawer');
    const mHeader = document.getElementById('mHeader');
    const mMain = document.getElementById('mMain');

    if (mAside) {
      mAside.style.removeProperty('transform');
      mAside.style.removeProperty('transition');
      mAside.style.removeProperty('pointer-events');
    }
    if (rightDrawer) {
      rightDrawer.style.removeProperty('transform');
      rightDrawer.style.removeProperty('transition');
      rightDrawer.style.removeProperty('pointer-events');
    }
    if (mHeader) {
      mHeader.style.removeProperty('transform');
      mHeader.style.removeProperty('transition');
    }
    if (mMain) {
      mMain.style.removeProperty('transform');
      mMain.style.removeProperty('transition');
    }

    if (action === 'open-left') {
      if (dx >= 50 || (isFlick && dx > 20)) {
        openMobileLeftDrawer();
      } else {
        closeMobileLeftDrawer();
      }
    } else if (action === 'open-right') {
      if (dx <= -50 || (isFlick && dx < -20)) {
        openMobileRightDrawer();
      } else {
        closeMobileRightDrawer();
      }
    } else if (action === 'close-left') {
      if (!wasDragging || dx <= -40 || (isFlick && dx < -20)) {
        closeMobileLeftDrawer();
      } else {
        openMobileLeftDrawer();
      }
    } else if (action === 'close-right') {
      if (!wasDragging || dx >= 40 || (isFlick && dx > 20)) {
        closeMobileRightDrawer();
      } else {
        openMobileRightDrawer();
      }
    }
  });
}
