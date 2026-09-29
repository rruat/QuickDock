// ── shell-mosaic.js ─────────────────────────────────────────────────────────
// Layout em Mosaico, Divisórias de Redimensionamento (.section-divider)
// e Reordenação de Seções do Spatial Shell (#mMain).

export function reorderMainSections(openViewIds = []) {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;
  const currentSections = Array.from(mainEl.querySelectorAll(':scope > [data-id]'));
  const currentOrder = currentSections.map(s => s.dataset.id).filter(id => openViewIds.includes(id));
  const isSameOrder = openViewIds.length === currentOrder.length && openViewIds.every((id, idx) => currentOrder[idx] === id);
  if (isSameOrder) return;

  const savedScroll = mainEl.scrollLeft;
  for (const id of openViewIds) {
    const sec = mainEl.querySelector(`:scope > [data-id="${id}"]`);
    if (sec) mainEl.appendChild(sec);
  }
  mainEl.scrollLeft = savedScroll;
}

export function updateSectionMoveButtons(openViewIds = [], focusedViewId = null) {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  openViewIds.forEach((id, index) => {
    const sec = mainEl.querySelector(`:scope > [data-id="${id}"]`);
    if (!sec) return;

    const isFirst = index === 0;
    const isLast = index === openViewIds.length - 1;
    const isFocused = id === focusedViewId;

    sec.classList.toggle('is-focused', isFocused);

    const btnPrev = sec.querySelector('.btn-move-prev');
    if (btnPrev) {
      btnPrev.disabled = isFirst;
      btnPrev.style.opacity = isFirst ? '0.3' : '1';
      btnPrev.style.cursor = isFirst ? 'not-allowed' : 'pointer';
    }

    const btnNext = sec.querySelector('.btn-move-next');
    if (btnNext) {
      btnNext.disabled = isLast;
      btnNext.style.opacity = isLast ? '0.3' : '1';
      btnNext.style.cursor = isLast ? 'not-allowed' : 'pointer';
    }
  });
}

export function setupSectionDividers(options = {}) {
  const mainEl = document.getElementById('mMain');
  if (!mainEl) return;

  const openViewIds = typeof options.getOpenViewIds === 'function' ? options.getOpenViewIds() : [];
  const getLayoutMode = typeof options.getLayoutMode === 'function' ? options.getLayoutMode : () => 'side-by-side';
  const onRefresh = typeof options.onRefresh === 'function' ? options.onRefresh : () => {};

  // Remove divisórias anteriores
  mainEl.querySelectorAll('.section-divider').forEach(d => d.remove());

  // Apenas as seções que estão REALMENTE abertas em openViewIds
  // e presentes como filhas diretas visíveis de #mMain
  const visibleSections = openViewIds
    .map(id => mainEl.querySelector(`:scope > [data-id="${id}"]`))
    .filter(sec => {
      if (!sec || sec.hidden || sec.classList.contains('is-collapsed')) return false;
      const compDisplay = (typeof window !== 'undefined' && window.getComputedStyle)
        ? window.getComputedStyle(sec).display
        : sec.style.display;
      return compDisplay !== 'none' && sec.style.display !== 'none';
    });

  if (visibleSections.length <= 1) {
    visibleSections.forEach(s => {
      s.style.removeProperty('flex');
      s.style.removeProperty('flex-grow');
      s.style.removeProperty('width');
    });
    return;
  }

  for (let i = 0; i < visibleSections.length - 1; i++) {
    const secA = visibleSections[i];
    const secB = visibleSections[i + 1];

    const divider = document.createElement('div');
    divider.className = 'section-divider';
    divider.title = 'Arraste para redimensionar';
    divider.innerHTML = `<span class="indicator-dots"><i class="dot"></i><i class="dot"></i><i class="dot"></i></span>`;

    divider.addEventListener('mousedown', (e) => {
      const isSide = getLayoutMode() === 'side-by-side';
      const startPos = isSide ? e.clientX : e.clientY;
      const rectA = secA.getBoundingClientRect();
      const rectB = secB.getBoundingClientRect();
      const startDimA = isSide ? rectA.width : rectA.height;
      const startDimB = isSide ? rectB.width : rectB.height;
      const totalDim = startDimA + startDimB;

      document.body.classList.add(isSide ? 'is-resizing-col' : 'is-resizing-row');
      e.preventDefault();

      const onMouseMove = (ev) => {
        const currentPos = isSide ? ev.clientX : ev.clientY;
        const delta = currentPos - startPos;
        const minDim = 120;
        const newDimA = Math.max(minDim, Math.min(totalDim - minDim, startDimA + delta));
        const newDimB = totalDim - newDimA;

        secA.style.setProperty('flex', `${newDimA} ${newDimA} 0px`, 'important');
        secB.style.setProperty('flex', `${newDimB} ${newDimB} 0px`, 'important');
      };

      const onMouseUp = () => {
        document.body.classList.remove('is-resizing-col', 'is-resizing-row');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.dispatchEvent(new CustomEvent('resize'));
        onRefresh();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    secA.after(divider);
  }
}
