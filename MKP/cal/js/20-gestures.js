// Mobile: gestos de borda, como no Obsidian
// Da borda esquerda para a direita abre a lista de views; da borda direita para a esquerda
// abre as configurações da view. Com um drawer aberto, arrastar no sentido contrário fecha.
// Só vale a partir da borda (EDGE_PX) para não brigar com a rolagem, o calendário e o quadro.

const EDGE_PX = 24;       // faixa de borda em que o gesto pode começar
const SWIPE_MIN_PX = 60;  // deslocamento horizontal mínimo para valer como gesto
let swipe = null;

function isEdgeSwipeStart(e) {
  return mobileMQ.matches && (e.clientX <= EDGE_PX || e.clientX >= window.innerWidth - EDGE_PX);
}

// Abre a aside direita no painel de configurações da view (ou do item aberto)
function openRightDrawerForCurrentView() {
  graphView = false;
  setAsideMode(itemOpenNow() ? asideModeFor(openItem) : 'calendar');
  openRightAside();
}

document.addEventListener('pointerdown', (e) => {
  if (!mobileMQ.matches) return;
  const leftOpen = leftPanel !== null, rightOpen = isRightAsideOpen();
  let zone = null;
  if (leftOpen) zone = 'close-left';
  else if (rightOpen) zone = 'close-right';
  else if (e.clientX <= EDGE_PX) zone = 'open-left';
  else if (e.clientX >= window.innerWidth - EDGE_PX) zone = 'open-right';
  swipe = zone ? { zone, x: e.clientX, y: e.clientY, done: false } : null;
});

document.addEventListener('pointermove', (e) => {
  if (!swipe || swipe.done) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  swipe.done = true;
  if (swipe.zone === 'open-left' && dx > 0) setLeftPanel('home');
  else if (swipe.zone === 'open-right' && dx < 0) openRightDrawerForCurrentView();
  else if (swipe.zone === 'close-left' && dx < 0) setLeftPanel(null);
  else if (swipe.zone === 'close-right' && dx > 0) closeRightAside();
});

['pointerup', 'pointercancel'].forEach(type => document.addEventListener(type, () => { swipe = null; }));