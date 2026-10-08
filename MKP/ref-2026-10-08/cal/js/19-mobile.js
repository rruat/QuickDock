// Mobile: as asides viram drawers que empurram o conteúdo (estilo Obsidian)
// (mobileMQ, leftDrawer e mainEl vêm de 15-nav-left-aside.js)

// No mobile as asides começam fechadas; ao voltar para desktop a direita reabre
function syncAsidesToViewport() {
  setLeftPanel(null);
  if (mobileMQ.matches) closeRightAside(); else openRightAside();
  setAsideMode(currentAsideMode);
}
mobileMQ.addEventListener('change', syncAsidesToViewport);
if (mobileMQ.matches) syncAsidesToViewport();

// Abrir a aside direita fecha a esquerda (uma por vez)
new MutationObserver(() => {
  if (mobileMQ.matches && isRightAsideOpen()) setLeftPanel(null);
}).observe(appContainer, { attributes: true, attributeFilter: ['class'] });

// Tocar no conteúdo empurrado fecha o drawer aberto, sem acionar o que há embaixo
mainEl.addEventListener('click', (e) => {
  if (!mobileMQ.matches) return;
  if (leftPanel !== null || isRightAsideOpen()) {
    e.preventDefault();
    e.stopPropagation();
    setLeftPanel(null);
    closeRightAside();
    btnToggleGraph?.classList.remove('is-active');
  }
}, true);