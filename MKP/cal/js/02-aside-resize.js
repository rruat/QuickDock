// Redimensionar entre a view e a aside direita
// ── REDIMENSIONAR ENTRE A VIEW E A ASIDE DE CONFIGURAÇÕES ──
(function initRightAsideResize() {
  const handle = document.getElementById('rightAsideResizer');
  const MIN_W = 220, MAX_W = 560, KEY = 'qd-cal-right-aside-width';
  const setW = (w) => appContainer.style.setProperty('--right-aside-width', Math.min(MAX_W, Math.max(MIN_W, Math.round(w))) + 'px');
  try { const saved = parseInt(localStorage.getItem(KEY), 10); if (saved) setW(saved); } catch (_) {}

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    const startX = e.clientX, startW = rightAside.getBoundingClientRect().width;
    appContainer.style.transition = 'none';
    const onMove = (ev) => setW(startW + (startX - ev.clientX));
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      appContainer.style.transition = '';
      try { localStorage.setItem(KEY, parseInt(appContainer.style.getPropertyValue('--right-aside-width'), 10)); } catch (_) {}
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });

  handle.addEventListener('dblclick', () => {
    appContainer.style.removeProperty('--right-aside-width');
    try { localStorage.removeItem(KEY); } catch (_) {}
  });
})();

