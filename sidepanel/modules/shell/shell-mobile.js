// ── shell-mobile.js ─────────────────────────────────────────────────────────
// Gerenciador de Carrossel Infinito com Transição Unidirecional e Gestos de Toque
// para Mobile (Layout Spatial Shell em telas estreitas e PWA mobile).

import { isMobileMode } from '../platform.js';
import { loadAllNotesMeta } from '../storage.js';
import { SHELL_VIEWS } from './shell-views.js';
import { setRightAsideOpen, isRightAsideOpen as isRightAsideOpenAny } from './shell-right-aside.js';

// no desktop a aside direita é uma coluna, não um drawer: só conta como "drawer aberto" no mobile
export const isRightAsideOpen = () => isMobileMode() && isRightAsideOpenAny();

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
}

export function getLeftDrawerWidth() {
  const aside = document.getElementById('mAside');
  return aside ? Math.min(window.innerWidth * 0.85, 320) : 300;
}

export function getRightDrawerWidth() {
  const drawer = document.getElementById('mRightAside');
  return drawer ? Math.min(window.innerWidth * 0.85, 340) : 320;
}

export function openMobileLeftDrawer() {
  const mAside = document.getElementById('mAside');
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

// A aside direita do shell (#mRightAside: configurações da view, painel da nota/quadro, constelações)
// é o drawer direito no mobile; quem guarda o estado é shell-right-aside.js.
export function openMobileRightDrawer() {
  if (!isMobileMode()) return;
  closeMobileLeftDrawer();
  clearPush();
  setRightAsideOpen(true);
  triggerSnapHaptic();
}

export function closeMobileRightDrawer() {
  if (isRightAsideOpen()) setRightAsideOpen(false); // (no desktop não faz nada)
  clearPush();
}

function clearPush() {
  for (const el of [document.getElementById('mHeader'), document.getElementById('mMain')]) {
    el?.style.removeProperty('transform');
    el?.style.removeProperty('transition');
  }
}

export function toggleMobileRightDrawer(force) {
  const isCurrentlyOpen = isRightAsideOpen();
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
      const isRightOpen = isRightAsideOpen();
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

export { setupMobileTouchGestures } from './shell-mobile-gestures.js';
