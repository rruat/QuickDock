// Quadro infinito (mock): pan, zoom, arrastar cartões, fundo, conexões
// ── Quadro infinito (mock): pan, zoom, arrastar cartões, fundo e conexões ──
const boardCanvas = document.getElementById('boardCanvas');
const boardWorld = document.getElementById('boardWorld');
const boardEdgesSvg = document.getElementById('boardEdges');
const boardZoomLabel = document.getElementById('boardZoomLabel');
const boardZoomText = document.getElementById('boardZoomText');
const boardZoomRange = document.getElementById('boardZoomRange');
const BOARD_MIN_Z = 0.25, BOARD_MAX_Z = 2;
let board = { cards: [], edges: [], x: 0, y: 0, z: 1, touched: false };

function applyBoardTransform() {
  boardWorld.style.transform = `translate(${board.x}px, ${board.y}px) scale(${board.z})`;
  boardCanvas.style.setProperty('--bz', board.z);
  boardCanvas.style.setProperty('--bx', board.x + 'px');
  boardCanvas.style.setProperty('--by', board.y + 'px');
  const pct = Math.round(board.z * 100);
  boardZoomLabel.textContent = pct + '%';
  boardZoomText.textContent = pct + '%';
  boardZoomRange.value = pct;
}

function drawBoardEdges() {
  boardEdgesSvg.innerHTML = board.edges.map(([a, b]) => {
    const A = board.cards[a], B = board.cards[b];
    const ax = A.x + CARD_W / 2, ay = A.y + CARD_H / 2, bx = B.x + CARD_W / 2, by = B.y + CARD_H / 2;
    const dx = (bx - ax) / 2;
    return `<path d="M${ax} ${ay} C${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}"/>`;
  }).join('');
}

function fitBoard() {
  const W = boardCanvas.clientWidth, H = boardCanvas.clientHeight;
  if (!W || !H || !board.cards.length) return;
  const minX = Math.min(...board.cards.map(c => c.x)), minY = Math.min(...board.cards.map(c => c.y));
  const maxX = Math.max(...board.cards.map(c => c.x + CARD_W)), maxY = Math.max(...board.cards.map(c => c.y + CARD_H));
  const bw = maxX - minX, bh = maxY - minY, pad = 48;
  const z = Math.max(BOARD_MIN_Z, Math.min(BOARD_MAX_Z, 1.2, (W - pad * 2) / bw, (H - pad * 2) / bh));
  board.z = z;
  board.x = (W - bw * z) / 2 - minX * z;
  board.y = (H - bh * z) / 2 - minY * z;
  applyBoardTransform();
}

function loadBoard(item) {
  const L = boardLayout(item);
  board = { cards: L.cards, edges: L.edges, x: 0, y: 0, z: 1, touched: false };
  boardWorld.querySelectorAll('.board-card').forEach(e => e.remove());
  L.cards.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'board-card';
    el.dataset.group = c.group;
    el.dataset.i = i;
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
    el.textContent = c.t;
    boardWorld.appendChild(el);
  });
  document.getElementById('asideBoardCount').textContent = `${L.cards.length} cartões • ${L.edges.length} conexões`;
  drawBoardEdges();
  fitBoard();
}

// A célula/coluna ainda está animando quando o quadro abre: reencaixa enquanto o usuário não mexeu
new ResizeObserver(() => { if (!board.touched) fitBoard(); }).observe(boardCanvas);

function zoomBoardAt(factor, cx, cy) {
  const z = Math.max(BOARD_MIN_Z, Math.min(BOARD_MAX_Z, board.z * factor));
  const k = z / board.z;
  board.x = cx - (cx - board.x) * k;
  board.y = cy - (cy - board.y) * k;
  board.z = z;
  board.touched = true;
  applyBoardTransform();
}

const boardCenter = () => [boardCanvas.clientWidth / 2, boardCanvas.clientHeight / 2];

boardCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = boardCanvas.getBoundingClientRect();
  zoomBoardAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

boardCanvas.addEventListener('pointerdown', (e) => {
  if (isEdgeSwipeStart(e)) return; // borda da tela é do gesto de abrir os drawers (20-gestures.js)
  const cardEl = e.target.closest('.board-card');
  const startX = e.clientX, startY = e.clientY;
  boardCanvas.setPointerCapture(e.pointerId);
  board.touched = true;
  if (cardEl) {
    const c = board.cards[Number(cardEl.dataset.i)];
    const ox = c.x, oy = c.y;
    const move = (ev) => {
      c.x = ox + (ev.clientX - startX) / board.z;
      c.y = oy + (ev.clientY - startY) / board.z;
      cardEl.style.left = c.x + 'px';
      cardEl.style.top = c.y + 'px';
      drawBoardEdges();
    };
    const up = () => { boardCanvas.removeEventListener('pointermove', move); boardCanvas.removeEventListener('pointerup', up); };
    boardCanvas.addEventListener('pointermove', move);
    boardCanvas.addEventListener('pointerup', up);
  } else {
    const ox = board.x, oy = board.y;
    boardCanvas.classList.add('is-panning');
    const move = (ev) => { board.x = ox + ev.clientX - startX; board.y = oy + ev.clientY - startY; applyBoardTransform(); };
    const up = () => {
      boardCanvas.classList.remove('is-panning');
      boardCanvas.removeEventListener('pointermove', move);
      boardCanvas.removeEventListener('pointerup', up);
    };
    boardCanvas.addEventListener('pointermove', move);
    boardCanvas.addEventListener('pointerup', up);
  }
});

document.getElementById('boardZoomIn').addEventListener('click', () => zoomBoardAt(1.2, ...boardCenter()));
document.getElementById('boardZoomOut').addEventListener('click', () => zoomBoardAt(1 / 1.2, ...boardCenter()));
document.getElementById('boardFit').addEventListener('click', () => { board.touched = false; fitBoard(); });
boardZoomRange.addEventListener('input', () => zoomBoardAt(boardZoomRange.value / 100 / board.z, ...boardCenter()));

document.getElementById('boardBgSegmented').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-bg]');
  if (!btn) return;
  document.querySelectorAll('#boardBgSegmented button').forEach(b => b.classList.toggle('is-active', b === btn));
  boardCanvas.classList.toggle('bg-grid', btn.dataset.bg === 'grid');
  boardCanvas.classList.toggle('bg-none', btn.dataset.bg === 'none');
});

document.getElementById('boardEdgesToggle').addEventListener('change', (e) => {
  boardEdgesSvg.classList.toggle('is-hidden-edges', !e.target.checked);
});


