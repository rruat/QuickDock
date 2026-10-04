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
  const openIds = _getOpenViewIds();
  return openIds
    .map(id => mainEl.querySelector(`:scope > [data-id="${id}"]`))
    .filter(sec => sec && !sec.hidden && sec.style.display !== 'none');
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

  const focusedViewId = _getFocusedViewId();
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

export function openMobileLeftDrawer() {
  const mAside = document.getElementById('mAside');
  const scrim = document.getElementById('mobileDrawerScrim');
  const rightDrawer = document.getElementById('mobileRightDrawer');

  rightDrawer?.classList.remove('is-open-mobile');
  if (mAside) {
    mAside.classList.add('is-open-mobile');
  }
  if (scrim) {
    scrim.classList.add('is-active');
  }
  triggerSnapHaptic();
}

export function closeMobileLeftDrawer() {
  const mAside = document.getElementById('mAside');
  const scrim = document.getElementById('mobileDrawerScrim');
  const rightDrawer = document.getElementById('mobileRightDrawer');

  if (mAside) {
    mAside.classList.remove('is-open-mobile');
  }
  const isRightOpen = rightDrawer?.classList.contains('is-open-mobile');
  if (!isRightOpen && scrim) {
    scrim.classList.remove('is-active');
  }
}

export function toggleMobileLeftDrawer(force) {
  const mAside = document.getElementById('mAside');
  if (!mAside) return;
  const isCurrentlyOpen = mAside.classList.contains('is-open-mobile');
  const shouldOpen = force !== undefined ? Boolean(force) : !isCurrentlyOpen;
  if (shouldOpen) openMobileLeftDrawer();
  else closeMobileLeftDrawer();
}

export function openMobileRightDrawer(tab) {
  const mAside = document.getElementById('mAside');
  const scrim = document.getElementById('mobileDrawerScrim');
  const rightDrawer = document.getElementById('mobileRightDrawer');

  mAside?.classList.remove('is-open-mobile');
  if (rightDrawer) {
    rightDrawer.classList.add('is-open-mobile');
  }
  if (scrim) {
    scrim.classList.add('is-active');
  }
  triggerSnapHaptic();

  document.dispatchEvent(new CustomEvent('quickdock:open-mobile-inspector', {
    detail: { tab: tab || 'outline' }
  }));
}

export function closeMobileRightDrawer() {
  const mAside = document.getElementById('mAside');
  const scrim = document.getElementById('mobileDrawerScrim');
  const rightDrawer = document.getElementById('mobileRightDrawer');

  if (rightDrawer) {
    rightDrawer.classList.remove('is-open-mobile');
  }
  const isLeftOpen = mAside?.classList.contains('is-open-mobile');
  if (!isLeftOpen && scrim) {
    scrim.classList.remove('is-active');
  }
}

export function toggleMobileRightDrawer(force) {
  const rightDrawer = document.getElementById('mobileRightDrawer');
  if (!rightDrawer) return;
  const isCurrentlyOpen = rightDrawer.classList.contains('is-open-mobile');
  const shouldOpen = force !== undefined ? Boolean(force) : !isCurrentlyOpen;
  if (shouldOpen) openMobileRightDrawer();
  else closeMobileRightDrawer();
}

export function closeAllMobileDrawers() {
  closeMobileLeftDrawer();
  closeMobileRightDrawer();
  document.getElementById('mobileDrawerScrim')?.classList.remove('is-active');
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

  const scrim = document.getElementById('mobileDrawerScrim');
  if (scrim) {
    scrim.addEventListener('click', () => {
      closeAllMobileDrawers();
    });
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

  // Gestos de borda (Edge Swipe) no padrão Obsidian Mobile
  let edgeStartX = 0;
  let edgeStartY = 0;
  let isEdgeCandidate = false;
  let edgeAction = null;

  document.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768 && !isMobileMode()) return;
    if (!e.touches || e.touches.length === 0) return;

    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    edgeStartX = x;
    edgeStartY = y;
    isEdgeCandidate = false;
    edgeAction = null;

    const mAside = document.getElementById('mAside');
    const rightDrawer = document.getElementById('mobileRightDrawer');
    const isLeftOpen = mAside?.classList.contains('is-open-mobile');
    const isRightOpen = rightDrawer?.classList.contains('is-open-mobile');

    if (isLeftOpen) {
      isEdgeCandidate = true;
      edgeAction = 'close-left';
    } else if (isRightOpen) {
      isEdgeCandidate = true;
      edgeAction = 'close-right';
    } else if (x <= 35) {
      isEdgeCandidate = true;
      edgeAction = 'open-left';
    } else if (x >= window.innerWidth - 35) {
      isEdgeCandidate = true;
      edgeAction = 'open-right';
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isEdgeCandidate || !e.touches || e.touches.length === 0) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - edgeStartX;
    const dy = currentY - edgeStartY;

    if (Math.abs(dy) > Math.abs(dx) + 8) {
      isEdgeCandidate = false;
      return;
    }

    if (edgeAction === 'open-left' && dx > 40) {
      isEdgeCandidate = false;
      openMobileLeftDrawer();
    } else if (edgeAction === 'open-right' && dx < -40) {
      isEdgeCandidate = false;
      openMobileRightDrawer();
    } else if (edgeAction === 'close-left' && dx < -35) {
      isEdgeCandidate = false;
      closeMobileLeftDrawer();
    } else if (edgeAction === 'close-right' && dx > 35) {
      isEdgeCandidate = false;
      closeMobileRightDrawer();
    }
  }, { passive: true });
}
