// ── board-engine.js ───────────────────────────────────────────────────────
// Motor único do Quadro Infinito / Canvas Espacial — usado tanto pela aba
// cheia dedicada (board/board.js, `board/index.html`) quanto pela visão
// embutida no painel lateral (board-view.js, `sidepanel/index.html`).
//
// Existiam DUAS cópias divergentes desse motor: consertar uma nunca
// consertava a outra (setas antigas, cores em ciclo fixo, sem cartão de
// imagem/nota...). Este arquivo é a única fonte de verdade agora — cada
// tela só monta a interface e informa, via `options`, o que muda entre elas
// (o cabeçalho de aba cheia tem tema/exportar/abrir-em-nova-aba que a visão
// embutida não tem; a visão embutida sabe voltar pro editor de notas e abrir
// uma nota de verdade sem sair da mesma página).
//
// Zero frameworks, zero bundlers, 100% nativo.

import {
  saveBoardRecord, getBoardById, getBoardByUid, loadAllBoards,
  saveFile, loadFileBlob, deleteFile, loadAllNotesMeta, createNoteRecord,
} from './storage.js';
import { escHtml } from './blocks.js';

// ── Estado do Quadro ──────────────────────────────────────────────────────────
let currentBoard = {
  id: null,
  uid: null,
  title: 'Espaço Infinito',
  viewport: { x: 0, y: 0, zoom: 1 },
  bgMode: 'stars',
  cards: [],
  arrows: []
};

let activeTool = 'select'; // 'select' | 'card' | 'arrow'
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let saveTimer = null;
let engineOptions = { standalone: true };
let isInitialized = false;

// Rastreamento de Cartão
let draggedCard = null;
let dragCardOffset = { x: 0, y: 0 };
let resizingCard = null;
let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

// Rastreamento de Seta
let connectingFrom = null;
let connectingFromSide = null;
let connectingHandlePos = null;

// Elementos do DOM — atribuídos em `initBoardEngine`, nunca em `const` de
// topo de módulo: a visão embutida pode reinicializar contra o mesmo
// documento várias vezes (cada vez que a pessoa volta pra aba do quadro).
let container, worldEl, cardsLayer, svgLayer, arrowsGroup, draftArrow;
let guidesGroup, selectionBoxEl, selectionToolbarEl;
let titleInput, saveStatus, zoomText, rootSectionEl;

// Seleção múltipla e auto-alinhamento inteligente (Obsidian Canvas)
let selectedCardIds = new Set();
let isBoxSelecting = false;
let boxStartWorld = { x: 0, y: 0 };
let longPressTimer = null;
let isMobileSelectionMode = false;
const SNAP_THRESHOLD = 6; // pixels em coordenadas do mundo para atração magnética

// Cache de notas (cartões do tipo "note" mostram título/ícone/cor de uma nota
// de verdade — carregado uma vez e reaproveitado nos re-renders, evitando ir
// ao banco de dados a cada cartão).
let allNotesCache = [];
async function refreshNotesCache() {
  try {
    allNotesCache = await loadAllNotesMeta();
  } catch (err) {
    console.warn('Erro ao carregar notas para o quadro:', err);
  }
  return allNotesCache;
}

export function abrirQuadroInfinitoEmAba(boardId = null) {
  const targetId = boardId ?? currentBoard?.id;
  const query = targetId ? `?id=${encodeURIComponent(targetId)}` : '';
  const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL(`board/index.html${query}`)
    : `board/index.html${query}`;
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}

// Abre a nota de verdade a partir de um cartão de nota. A visão embutida no
// painel JÁ É a mesma página do editor de notas — não precisa de nenhuma
// ponte entre telas, só troca de nota e volta pra visão de editor
// (`options.onAbrirNota`, fornecido por board-view.js). Sem esse callback
// (aba cheia dedicada, `board/board.js`), roda a ponte entre contextos: na
// extensão isso NÃO pode ser "abrir index.html numa aba nova" — esse arquivo
// roda o mesmo app.js do painel lateral, que se conecta ao background como
// porta 'sidepanel', e uma aba comum se passando por painel bagunçaria o
// rastreamento de janela que o atalho Ctrl+Q usa (ver background.js). Em vez
// disso, foca o painel de verdade e avisa a nota por duas vias, porque o
// painel pode já estar aberto (mensagem ao vivo chega na hora) ou fechado
// (só lê o storage no boot):
async function abrirNotaDoQuadro(uid) {
  if (engineOptions.onAbrirNota) {
    await engineOptions.onAbrirNota(uid);
    return;
  }

  const naExtensao = typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.sidePanel && chrome.tabs?.getCurrent;
  if (naExtensao) {
    try { await chrome.storage.local.set({ quickdockAbrirNotaUid: uid }); } catch {}
    try { await chrome.runtime.sendMessage({ type: 'quickdock:abrir-nota', uid }); } catch {}
    chrome.tabs.getCurrent(tab => {
      if (tab?.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    });
    return;
  }
  // PWA / navegador comum: não existe painel lateral pra focar — abre a
  // página principal numa aba nova, com o parâmetro que ela lê no boot.
  window.open(`../index.html?abrirNota=${encodeURIComponent(uid)}`, '_blank');
}

// Ponto único de saída do "modo conectando" — usado pelo handle que soltou a
// conexão (com sucesso ou não) E pelas redes de segurança (pointerup/
// pointercancel na janela inteira, e o auto-cura no início de `renderArrows`
// mais abaixo).
function ocultarRastroDeConexao() {
  connectingFrom = null;
  connectingFromSide = null;
  connectingHandlePos = null;
  draftArrow.hidden = true;
  if (draftArrow) {
    draftArrow.setAttribute('hidden', '');
    draftArrow.setAttribute('d', '');
  }
}

// ── Transformações de Coordenadas Puras (com Cache Durante Arrasto) ───────────
let cachedContainerRect = null;
export function screenToWorld(screenX, screenY, viewport = currentBoard.viewport) {
  const rect = cachedContainerRect || (container ? container.getBoundingClientRect() : { left: 0, top: 0 });
  return {
    x: (screenX - rect.left - viewport.x) / viewport.zoom,
    y: (screenY - rect.top - viewport.y) / viewport.zoom
  };
}

export function worldToScreen(worldX, worldY, viewport = currentBoard.viewport) {
  const rect = cachedContainerRect || (container ? container.getBoundingClientRect() : { left: 0, top: 0 });
  return {
    x: worldX * viewport.zoom + viewport.x + rect.left,
    y: worldY * viewport.zoom + viewport.y + rect.top
  };
}

// ── Inicialização ─────────────────────────────────────────────────────────────
// `scope`: documento (ou objeto com `getElementById`) onde procurar os
// elementos do quadro — `document` na aba cheia, a seção `#board-view` (ou o
// próprio `document` do painel) na visão embutida.
// `options.standalone`: true = aba cheia dedicada (tema/exportar/atalho de
// teclado global própios). false = embutida no painel (volta pro editor,
// reaproveita o tema do painel, sabe abrir em aba cheia).
// `options.onAbrirNota(uid)`: só na visão embutida — troca de nota sem sair
// da página.
// `options.onBack()`: só na visão embutida — volta pro editor de notas.
export async function initBoardEngine(scope = document, options = {}) {
  engineOptions = { standalone: true, ...options };
  const getEl = id => (scope.getElementById ? scope.getElementById(id) : document.getElementById(id));

  container = getEl('board-container');
  if (!container) return;

  worldEl = getEl('board-world');
  cardsLayer = getEl('board-cards-layer');
  svgLayer = getEl('board-svg');
  arrowsGroup = getEl('board-svg-arrows');
  guidesGroup = getEl('board-svg-guides');
  draftArrow = getEl('board-draft-arrow');
  selectionBoxEl = getEl('board-selection-box');
  selectionToolbarEl = getEl('board-selection-toolbar');

  titleInput = getEl('board-title-input');
  saveStatus = getEl('board-save-status');
  zoomText = getEl('zoom-level-text');
  rootSectionEl = engineOptions.standalone ? null : getEl('board-view');

  if (engineOptions.standalone) initTheme();

  if (!isInitialized) {
    setupEventListeners(getEl);
    isInitialized = true;
  }

  await Promise.all([loadBoardFromUrlOrStorage(), refreshNotesCache()]);
  applyViewport();
  updateBgToggleButtons();
  renderCards();
  renderArrows();

  // Recarrega quando a pessoa volta pra esta visão (só faz sentido embutido —
  // a aba cheia nunca dispara esses eventos, não tem outras visões pra trocar).
  if (!engineOptions.standalone) {
    document.addEventListener('quickdock:view-changed', e => {
      if (e.detail?.view === 'board') {
        loadBoardFromUrlOrStorage().then(() => {
          applyViewport();
          updateBgToggleButtons();
          renderCards();
          renderArrows();
        });
      }
    });
    document.addEventListener('quickdock:refresh-board-view', () => {
      loadBoardFromUrlOrStorage().then(() => {
        applyViewport();
        updateBgToggleButtons();
        renderCards();
        renderArrows();
      });
    });
  }
}

function initTheme() {
  const saved = localStorage.getItem('quickdock:theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', current);
  localStorage.setItem('quickdock:theme', current);
  updateThemeIcon(current);
}

function updateBgToggleButtons() {
  const mode = currentBoard?.bgMode || 'stars';
  const info = {
    stars: { icon: 'auto_awesome', title: 'Fundo: Modo Estrelas (clique para alternar)' },
    dots:  { icon: 'grain',        title: 'Fundo: Modo Pontos (clique para alternar)' },
    none:  { icon: 'grid_off',     title: 'Fundo: Sem Grade (clique para alternar)' }
  }[mode] || { icon: 'auto_awesome', title: 'Fundo: Modo Estrelas (clique para alternar)' };

  const btns = [document.getElementById('btn-toggle-bg'), document.getElementById('btn-board-toggle-bg')];
  for (const btn of btns) {
    if (!btn) continue;
    btn.title = info.title;
    btn.setAttribute('aria-label', info.title);
    const icon = btn.querySelector('.material-symbols-rounded') || btn;
    if (icon) icon.textContent = info.icon;
  }
}

// ── Carregamento e Salvamento ─────────────────────────────────────────────────
async function loadBoardFromUrlOrStorage() {
  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');
  const uidParam = params.get('uid');

  let board = null;
  try {
    if (idParam) {
      board = await getBoardById(Number(idParam));
    } else if (uidParam) {
      board = await getBoardByUid(uidParam);
    } else {
      const all = await loadAllBoards();
      board = all[0] || null;
    }
  } catch (err) {
    console.warn('Erro ao carregar quadro do banco:', err);
  }

  if (board) {
    currentBoard = {
      id: board.id,
      uid: board.uid,
      title: board.title || 'Espaço Sem Título',
      viewport: board.viewport || { x: 0, y: 0, zoom: 1 },
      bgMode: board.bgMode || 'stars',
      cards: board.cards || [],
      arrows: (board.arrows || []).map(a => ({ ...a, lineStyle: a.lineStyle || 'straight' }))
    };
  } else {
    // Cria espaço padrão inicial com 2 cartões demonstrativos conectados
    const cw = container.clientWidth || window.innerWidth;
    const ch = container.clientHeight || window.innerHeight;
    const cx = Math.max(150, cw / 2);
    const cy = Math.max(100, ch / 2 - 50);

    currentBoard = {
      id: null,
      uid: `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title: 'Brainstorming Inicial',
      viewport: { x: cx - 200, y: cy - 100, zoom: 1 },
      bgMode: 'stars',
      cards: [
        { id: 'c1', x: 0, y: 0, w: 220, h: 120, text: '💡 Primeira Grande Ideia\nExplore livremente este espaço infinito.', color: 'yellow' },
        { id: 'c2', x: 300, y: 60, w: 220, h: 120, text: '🎯 Próximos Passos\nConecte cartões usando as alças de seta.', color: 'blue' }
      ],
      arrows: [
        { id: 'a1', from: 'c1', to: 'c2', style: 'solid', lineStyle: 'straight' }
      ]
    };
    await persistBoard();
  }

  if (titleInput) titleInput.value = currentBoard.title;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  if (saveStatus) {
    saveStatus.innerHTML = '<span class="status-icon">⏳</span> salvando...';
  }
  saveTimer = setTimeout(persistBoard, 600);
}

async function persistBoard() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const savedId = await saveBoardRecord(currentBoard);
    if (!currentBoard.id && savedId) currentBoard.id = savedId;
    if (saveStatus) {
      saveStatus.innerHTML = '<span class="qd-icon material-symbols-rounded status-icon">check</span> salvo';
    }
  } catch (err) {
    console.error('Erro ao salvar quadro:', err);
    if (saveStatus) {
      saveStatus.textContent = 'erro ao salvar';
    }
  }
}

// ── Câmera e Viewport ─────────────────────────────────────────────────────────
function applyViewport() {
  const { x, y, zoom } = currentBoard.viewport;
  worldEl.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;

  // Atualiza escala e posição do fundo espacial
  const bgSize = Math.max(12, Math.round(24 * zoom));
  const bgMode = currentBoard.bgMode || 'stars';

  if (bgMode === 'stars') {
    container.classList.remove('mode-dots', 'mode-none');
    container.classList.add('mode-stars');
    const s1 = bgSize;
    const s2 = bgSize * 2;
    const s3 = bgSize * 3;
    container.style.backgroundSize = `${s1}px ${s1}px, ${s2}px ${s2}px, ${s3}px ${s3}px`;
    container.style.backgroundPosition = `${x % s1}px ${y % s1}px, ${(x + s2 * 0.4) % s2}px ${(y + s2 * 0.6) % s2}px, ${(x + s3 * 0.7) % s3}px ${(y + s3 * 0.3) % s3}px`;
  } else if (bgMode === 'dots') {
    container.classList.remove('mode-stars', 'mode-none');
    container.classList.add('mode-dots');
    container.style.backgroundSize = `${bgSize}px ${bgSize}px`;
    container.style.backgroundPosition = `${x % bgSize}px ${y % bgSize}px`;
  } else {
    container.classList.remove('mode-stars', 'mode-dots');
    container.classList.add('mode-none');
  }

  if (zoomText) zoomText.textContent = `${Math.round(zoom * 100)}%`;
  renderArrows();
}

function zoomBy(factor, centerX = null, centerY = null) {
  const rect = container.getBoundingClientRect();
  const cx = centerX ?? (rect.width / 2);
  const cy = centerY ?? (rect.height / 2);

  const vp = currentBoard.viewport;
  const newZoom = Math.max(0.15, Math.min(3.0, vp.zoom * factor));
  vp.x = cx - (cx - vp.x) * (newZoom / vp.zoom);
  vp.y = cy - (cy - vp.y) * (newZoom / vp.zoom);
  vp.zoom = newZoom;

  applyViewport();
  scheduleSave();
}

function resetZoomAndCenter() {
  if (currentBoard.cards.length === 0) {
    currentBoard.viewport = { x: container.clientWidth / 2, y: container.clientHeight / 2, zoom: 1 };
    applyViewport();
    scheduleSave();
    return;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of currentBoard.cards) {
    if (c.x < minX) minX = c.x;
    if (c.x + c.w > maxX) maxX = c.x + c.w;
    if (c.y < minY) minY = c.y;
    if (c.y + c.h > maxY) maxY = c.y + c.h;
  }

  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const boundingW = Math.max(100, maxX - minX + 160);
  const boundingH = Math.max(100, maxY - minY + 160);

  const scale = Math.max(0.25, Math.min(1.2, Math.min(cw / boundingW, ch / boundingH)));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  currentBoard.viewport = {
    x: cw / 2 - centerX * scale,
    y: ch / 2 - centerY * scale,
    zoom: scale
  };
  applyViewport();
  scheduleSave();
}

// ── Gestão de Cartões ─────────────────────────────────────────────────────────
export function addCard(worldX, worldY, text = '', color = 'default') {
  const cardId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const newCard = {
    id: cardId,
    x: Math.round(worldX),
    y: Math.round(worldY),
    w: 220,
    h: 130,
    text,
    color
  };
  currentBoard.cards.push(newCard);
  renderCards();
  renderArrows();
  scheduleSave();

  // Foca imediatamente o corpo do novo cartão
  setTimeout(() => {
    const el = document.querySelector(`[data-card-id="${cardId}"] .board-card-body`);
    el?.focus();
  }, 50);
}

// Cartão de imagem: o Blob já foi salvo na tabela `files` do Dexie (mesmo
// mecanismo dos anexos de nota) — o cartão guarda só o `fileId`, nunca o
// conteúdo, pra um quadro cheio de fotos coladas não inchar o registro inteiro.
function addImageCard(worldX, worldY, fileId, alt = '') {
  const cardId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  currentBoard.cards.push({
    id: cardId, x: Math.round(worldX), y: Math.round(worldY),
    w: 260, h: 200, type: 'image', fileId, alt, color: null,
  });
  renderCards();
  renderArrows();
  scheduleSave();
}

// Cartão que referencia uma nota já existente — guarda só o `uid`, nunca uma
// cópia do conteúdo, pra não divergir da nota de verdade.
function addNoteCard(worldX, worldY, noteUid) {
  const cardId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  currentBoard.cards.push({
    id: cardId, x: Math.round(worldX), y: Math.round(worldY),
    w: 220, h: 90, type: 'note', noteUid, color: null,
  });
  renderCards();
  renderArrows();
  scheduleSave();
}

// Cartão de grupo (Obsidian Canvas Group) — delimita áreas com rótulo
export function addGroupCard(worldX, worldY, label = 'Novo Grupo') {
  const cardId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  currentBoard.cards.push({
    id: cardId, x: Math.round(worldX), y: Math.round(worldY),
    w: 380, h: 260, type: 'group', label, color: null,
  });
  renderCards();
  renderArrows();
  scheduleSave();
}

function renderCards() {
  cardsLayer.innerHTML = '';
  // Grupos devem ser renderizados antes (ficam no fundo)
  const sortedCards = [...currentBoard.cards].sort((a, b) => {
    if (a.type === 'group' && b.type !== 'group') return -1;
    if (a.type !== 'group' && b.type === 'group') return 1;
    return 0;
  });
  for (const card of sortedCards) {
    const cardEl = createCardElement(card);
    if (selectedCardIds.has(card.id)) {
      cardEl.classList.add('is-selected');
    }
    cardsLayer.appendChild(cardEl);
  }
}

// ── Auto-Alinhamento Inteligente (Smart Snapping & Guide Lines) ───────────────
function computeSnapping(card, rawX, rawY) {
  let snappedX = rawX;
  let snappedY = rawY;
  const guideLines = [];

  const myLeft = rawX;
  const myCenterX = rawX + card.w / 2;
  const myRight = rawX + card.w;

  const myTop = rawY;
  const myCenterY = rawY + card.h / 2;
  const myBottom = rawY + card.h;

  let minDiffX = Infinity;
  let targetX = null;
  let lineX = null;

  let minDiffY = Infinity;
  let targetY = null;
  let lineY = null;

  for (const other of currentBoard.cards) {
    if (other.id === card.id || selectedCardIds.has(other.id)) continue;
    const oLeft = other.x;
    const oCenterX = other.x + other.w / 2;
    const oRight = other.x + other.w;
    const oTop = other.y;
    const oCenterY = other.y + other.h / 2;
    const oBottom = other.y + other.h;

    const xChecks = [
      { my: myLeft, target: oLeft, pos: oLeft, line: oLeft },
      { my: myCenterX, target: oCenterX, pos: oCenterX - card.w / 2, line: oCenterX },
      { my: myRight, target: oRight, pos: oRight - card.w, line: oRight },
      { my: myLeft, target: oRight, pos: oRight, line: oRight },
      { my: myRight, target: oLeft, pos: oLeft - card.w, line: oLeft }
    ];

    for (const c of xChecks) {
      const diff = Math.abs(c.my - c.line);
      if (diff <= SNAP_THRESHOLD && diff < minDiffX) {
        minDiffX = diff;
        targetX = c.pos;
        lineX = c.line;
      }
    }

    const yChecks = [
      { my: myTop, target: oTop, pos: oTop, line: oTop },
      { my: myCenterY, target: oCenterY, pos: oCenterY - card.h / 2, line: oCenterY },
      { my: myBottom, target: oBottom, pos: oBottom - card.h, line: oBottom },
      { my: myTop, target: oBottom, pos: oBottom, line: oBottom },
      { my: myBottom, target: oTop, pos: oTop - card.h, line: oTop }
    ];

    for (const c of yChecks) {
      const diff = Math.abs(c.my - c.line);
      if (diff <= SNAP_THRESHOLD && diff < minDiffY) {
        minDiffY = diff;
        targetY = c.pos;
        lineY = c.line;
      }
    }
  }

  if (targetX !== null) {
    snappedX = targetX;
    guideLines.push({ type: 'v', val: lineX });
  }
  if (targetY !== null) {
    snappedY = targetY;
    guideLines.push({ type: 'h', val: lineY });
  }

  return { x: Math.round(snappedX), y: Math.round(snappedY), guideLines };
}

function renderGuideLines(guideLines) {
  if (!guidesGroup) return;
  guidesGroup.innerHTML = '';
  if (!guideLines || guideLines.length === 0) return;
  const bound = 20000;
  for (const g of guideLines) {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('class', 'board-guide-line');
    if (g.type === 'v') {
      line.setAttribute('x1', String(g.val));
      line.setAttribute('y1', String(-bound));
      line.setAttribute('x2', String(g.val));
      line.setAttribute('y2', String(bound));
    } else {
      line.setAttribute('x1', String(-bound));
      line.setAttribute('y1', String(g.val));
      line.setAttribute('x2', String(bound));
      line.setAttribute('y2', String(g.val));
    }
    guidesGroup.appendChild(line);
  }
}

function clearGuideLines() {
  if (guidesGroup) guidesGroup.innerHTML = '';
}

// ── Gestão de Seleção Múltipla (Obsidian Canvas Marquee Selection) ────────────
function selectCard(cardId, addToSelection = false) {
  if (!addToSelection) clearSelection();
  selectedCardIds.add(cardId);
  document.querySelector(`[data-card-id="${cardId}"]`)?.classList.add('is-selected');
  updateSelectionToolbar();
}

function clearSelection() {
  selectedCardIds.clear();
  document.querySelectorAll('.board-card.is-selected').forEach(c => c.classList.remove('is-selected'));
  updateSelectionToolbar();
}

function updateSelectionToolbar() {
  if (!selectionToolbarEl) return;
  if (selectedCardIds.size === 0) {
    selectionToolbarEl.setAttribute('hidden', '');
    selectionToolbarEl.innerHTML = '';
    return;
  }
  selectionToolbarEl.removeAttribute('hidden');
  const count = selectedCardIds.size;
  selectionToolbarEl.innerHTML = `
    <span style="font-size:11.5px;font-weight:600;color:var(--text-muted);padding:0 6px;">${count} selecionado${count > 1 ? 's' : ''}</span>
    <div class="board-toolbar-divider"></div>
    <div class="board-align-dropdown">
      <button type="button" class="board-toolbar-btn btn-toolbar-align" title="Alinhar cartões">
        <span class="qd-icon material-symbols-rounded">format_align_center</span>
        <span>Alinhar</span>
      </button>
      <div class="board-align-menu" hidden>
        <button type="button" class="board-align-item" data-align="left">
          <span class="qd-icon material-symbols-rounded">align_horizontal_left</span>
          <span>Esquerda</span>
        </button>
        <button type="button" class="board-align-item" data-align="center-h">
          <span class="qd-icon material-symbols-rounded">align_horizontal_center</span>
          <span>Centro H</span>
        </button>
        <button type="button" class="board-align-item" data-align="right">
          <span class="qd-icon material-symbols-rounded">align_horizontal_right</span>
          <span>Direita</span>
        </button>
        <div style="height:1px;background:var(--border);margin:2px 0;"></div>
        <button type="button" class="board-align-item" data-align="top">
          <span class="qd-icon material-symbols-rounded">align_vertical_top</span>
          <span>Topo</span>
        </button>
        <button type="button" class="board-align-item" data-align="center-v">
          <span class="qd-icon material-symbols-rounded">align_vertical_center</span>
          <span>Centro V</span>
        </button>
        <button type="button" class="board-align-item" data-align="bottom">
          <span class="qd-icon material-symbols-rounded">align_vertical_bottom</span>
          <span>Base</span>
        </button>
      </div>
    </div>
    <button type="button" class="board-toolbar-btn btn-toolbar-group" title="Criar grupo em torno dos selecionados">
      <span class="qd-icon material-symbols-rounded">crop_square</span>
      <span>Agrupar</span>
    </button>
    <button type="button" class="board-toolbar-btn btn-toolbar-color" title="Alterar cor de todos">
      <span class="qd-icon material-symbols-rounded">palette</span>
      <span>Cor</span>
    </button>
    <div class="board-toolbar-divider"></div>
    <button type="button" class="board-toolbar-btn is-danger btn-toolbar-delete" title="Excluir selecionados">
      <span class="qd-icon material-symbols-rounded">delete</span>
      <span>Excluir</span>
    </button>
  `;

  const btnAlign = selectionToolbarEl.querySelector('.btn-toolbar-align');
  const alignMenu = selectionToolbarEl.querySelector('.board-align-menu');
  btnAlign?.addEventListener('click', e => {
    e.stopPropagation();
    alignMenu.hidden = !alignMenu.hidden;
  });

  alignMenu?.querySelectorAll('[data-align]').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      alignMenu.hidden = true;
      alignSelectedCards(item.dataset.align);
    });
  });

  selectionToolbarEl.querySelector('.btn-toolbar-group')?.addEventListener('click', e => {
    e.stopPropagation();
    groupSelectedCards();
  });

  const btnColor = selectionToolbarEl.querySelector('.btn-toolbar-color');
  btnColor?.addEventListener('click', e => {
    e.stopPropagation();
    const selCards = currentBoard.cards.filter(c => selectedCardIds.has(c.id));
    toggleColorPopover(btnColor, selCards, null);
  });

  selectionToolbarEl.querySelector('.btn-toolbar-delete')?.addEventListener('click', e => {
    e.stopPropagation();
    deleteSelectedCards();
  });
}

function alignSelectedCards(type) {
  const cards = currentBoard.cards.filter(c => selectedCardIds.has(c.id));
  if (cards.length <= 1) return;
  if (type === 'left') {
    const minX = Math.min(...cards.map(c => c.x));
    cards.forEach(c => c.x = minX);
  } else if (type === 'center-h') {
    const avgX = cards.reduce((acc, c) => acc + (c.x + c.w / 2), 0) / cards.length;
    cards.forEach(c => c.x = Math.round(avgX - c.w / 2));
  } else if (type === 'right') {
    const maxRight = Math.max(...cards.map(c => c.x + c.w));
    cards.forEach(c => c.x = maxRight - c.w);
  } else if (type === 'top') {
    const minY = Math.min(...cards.map(c => c.y));
    cards.forEach(c => c.y = minY);
  } else if (type === 'center-v') {
    const avgY = cards.reduce((acc, c) => acc + (c.y + c.h / 2), 0) / cards.length;
    cards.forEach(c => c.y = Math.round(avgY - c.h / 2));
  } else if (type === 'bottom') {
    const maxBottom = Math.max(...cards.map(c => c.y + c.h));
    cards.forEach(c => c.y = maxBottom - c.h);
  }
  renderCards();
  renderArrows();
  scheduleSave();
}

function groupSelectedCards() {
  const cards = currentBoard.cards.filter(c => selectedCardIds.has(c.id) && c.type !== 'group');
  if (cards.length === 0) return;
  const minX = Math.min(...cards.map(c => c.x));
  const maxX = Math.max(...cards.map(c => c.x + (c.w || 220)));
  const minY = Math.min(...cards.map(c => c.y));
  const maxY = Math.max(...cards.map(c => c.y + (c.h || 120)));
  const padX = 24, padTop = 38, padBottom = 24;
  const groupCard = {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    x: Math.round(minX - padX),
    y: Math.round(minY - padTop),
    w: Math.round((maxX - minX) + padX * 2),
    h: Math.round((maxY - minY) + padTop + padBottom),
    type: 'group',
    label: 'Novo Grupo',
    text: '',
    color: null
  };
  currentBoard.cards.push(groupCard);
  clearSelection();
  selectedCardIds.add(groupCard.id);
  renderCards();
  renderArrows();
  scheduleSave();
}

function batchChangeColor(color) {
  for (const card of currentBoard.cards) {
    if (selectedCardIds.has(card.id)) {
      card.color = (color === 'default') ? null : color;
    }
  }
  renderCards();
  scheduleSave();
}

function deleteSelectedCards() {
  const ids = new Set(selectedCardIds);
  for (const cardId of ids) {
    const card = currentBoard.cards.find(c => c.id === cardId);
    if (card?.type === 'image' && card.fileId != null) {
      deleteFile(card.fileId).catch(err => console.warn('Erro ao excluir arquivo do cartão:', err));
    }
  }
  currentBoard.cards = currentBoard.cards.filter(c => !ids.has(c.id));
  currentBoard.arrows = currentBoard.arrows.filter(a => !ids.has(a.from) && !ids.has(a.to));
  clearSelection();
  renderCards();
  renderArrows();
  scheduleSave();
}

// ── Escolha de Cor (As 7 cores do arco-íris + Personalizada) ───────────────────
let openColorPopover = null;
function closeColorPopover() {
  openColorPopover?.remove();
  openColorPopover = null;
}

const NAMED_COLORS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']);

function applyCardColor(el, color) {
  if (!color || color === 'default') {
    delete el.dataset.color;
    delete el.dataset.customColor;
    el.style.removeProperty('--card-custom-color');
    return;
  }
  if (NAMED_COLORS.has(color)) {
    el.dataset.color = color;
    delete el.dataset.customColor;
    el.style.removeProperty('--card-custom-color');
  } else {
    delete el.dataset.color;
    el.dataset.customColor = '';
    el.style.setProperty('--card-custom-color', color);
  }
}

function toggleColorPopover(anchorBtn, cardOrCards, cardEl) {
  const isMultiple = Array.isArray(cardOrCards);
  const card = isMultiple ? cardOrCards[0] : cardOrCards;
  if (!card) return;

  const mesmoCartao = openColorPopover?.dataset.anchorCardId === card.id;
  closeColorPopover();
  if (mesmoCartao) return;

  const pop = document.createElement('div');
  pop.className = 'board-color-popover';
  pop.dataset.anchorCardId = card.id;

  const rainbowColors = [
    { name: 'Padrão', value: 'default', class: 'is-default' },
    { name: 'Vermelho', value: 'red', bg: '#ef4444' },
    { name: 'Laranja', value: 'orange', bg: '#f97316' },
    { name: 'Amarelo', value: 'yellow', bg: '#eab308' },
    { name: 'Verde', value: 'green', bg: '#22c55e' },
    { name: 'Azul', value: 'blue', bg: '#3b82f6' },
    { name: 'Índigo', value: 'indigo', bg: '#6366f1' },
    { name: 'Violeta', value: 'violet', bg: '#a855f7' }
  ];

  for (const c of rainbowColors) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `board-color-swatch ${c.class || ''} ${card.color === c.value ? 'is-active' : ''}`;
    swatch.title = c.name;
    if (c.bg) swatch.style.background = c.bg;
    swatch.addEventListener('click', () => {
      const colorVal = c.value === 'default' ? null : c.value;
      if (isMultiple) {
        batchChangeColor(c.value);
      } else {
        card.color = colorVal;
        if (cardEl) applyCardColor(cardEl, colorVal);
        renderCards();
        scheduleSave();
      }
      closeColorPopover();
    });
    pop.appendChild(swatch);
  }

  // Opção de cor personalizada (arco-íris com seletor nativo)
  const customSwatch = document.createElement('label');
  customSwatch.className = 'board-color-swatch is-custom';
  customSwatch.title = 'Personalizada';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = (card.color && !NAMED_COLORS.has(card.color)) ? card.color : '#3b82f6';
  colorInput.addEventListener('input', e => {
    const colorVal = e.target.value;
    if (isMultiple) {
      batchChangeColor(colorVal);
    } else {
      card.color = colorVal;
      if (cardEl) applyCardColor(cardEl, colorVal);
      renderCards();
      scheduleSave();
    }
  });
  colorInput.addEventListener('change', () => closeColorPopover());
  customSwatch.appendChild(colorInput);
  pop.appendChild(customSwatch);

  document.body.appendChild(pop);
  const r = anchorBtn.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 6;
  if (left + 160 > window.innerWidth - 8) left = window.innerWidth - 168;
  if (top + 100 > window.innerHeight - 8) top = r.top - 106;
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${Math.max(8, top)}px`;

  openColorPopover = pop;
}

// ── Vincular Nota Existente ───────────────────────────────────────────────────
let openNoteSearchPopover = null;

function closeNoteSearchPopover() {
  openNoteSearchPopover?.remove();
  openNoteSearchPopover = null;
}

async function toggleNoteSearchPopover(anchorBtn) {
  if (openNoteSearchPopover) { closeNoteSearchPopover(); return; }
  await refreshNotesCache();

  const pop = document.createElement('div');
  pop.className = 'board-note-search-popover';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Buscar nota pelo título...';
  input.className = 'board-note-search-input';
  pop.appendChild(input);

  const list = document.createElement('div');
  list.className = 'board-note-search-list';
  pop.appendChild(list);

  const renderList = filtro => {
    const termo = filtro.trim().toLowerCase();
    const notas = termo
      ? allNotesCache.filter(n => (n.title || '').toLowerCase().includes(termo))
      : allNotesCache;
    list.innerHTML = '';
    if (notas.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'board-note-search-empty';
      vazio.textContent = 'Nenhuma nota encontrada.';
      list.appendChild(vazio);
      return;
    }
    for (const nota of notas.slice(0, 50)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'board-note-search-item';
      item.innerHTML = `
        <span class="qd-icon material-symbols-rounded">${escHtml(nota.icon || 'description')}</span>
        <span>${escHtml(nota.title || 'Sem título')}</span>
      `;
      item.addEventListener('click', () => {
        closeNoteSearchPopover();
        const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
        addNoteCard(center.x - 110, center.y - 45, nota.uid);
      });
      list.appendChild(item);
    }
  };
  renderList('');
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('keydown', e => e.stopPropagation());

  document.body.appendChild(pop);
  const r = anchorBtn.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  let left = r.left;
  if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${r.bottom + 6}px`;

  openNoteSearchPopover = pop;
  input.focus();
}

// Popover genérico inline para entrada de texto (substitui window.prompt nativo)
let openInlineInputPopover = null;
function closeInlineInputPopover() {
  openInlineInputPopover?.remove();
  openInlineInputPopover = null;
}

function showInlineInputPopover(anchorEl, titleText, placeholder, onConfirm) {
  closeInlineInputPopover();
  closeColorPopover();
  closeArrowPopover();

  const pop = document.createElement('div');
  pop.className = 'board-inline-input-popover';
  pop.innerHTML = `
    <div class="board-popover-title">${escHtml(titleText)}</div>
    <input type="text" class="board-popover-input pop-inline-input" placeholder="${escHtml(placeholder)}" />
    <div class="board-popover-actions">
      <button type="button" class="board-btn pop-cancel-btn">Cancelar</button>
      <button type="button" class="board-btn pop-confirm-btn" style="background:var(--accent);color:#fff;border-color:var(--accent);">Criar</button>
    </div>
  `;

  const input = pop.querySelector('.pop-inline-input');
  const onCommit = () => {
    const val = input.value.trim();
    closeInlineInputPopover();
    if (val) onConfirm(val);
  };

  pop.querySelector('.pop-confirm-btn').addEventListener('click', onCommit);
  pop.querySelector('.pop-cancel-btn').addEventListener('click', closeInlineInputPopover);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') onCommit();
    if (ev.key === 'Escape') closeInlineInputPopover();
  });

  pop.addEventListener('click', ev => ev.stopPropagation());
  pop.addEventListener('pointerdown', ev => ev.stopPropagation());

  document.body.appendChild(pop);

  const r = anchorEl?.getBoundingClientRect?.() || { left: window.innerWidth / 2 - 125, bottom: window.innerHeight / 2 - 50 };
  let left = r.left;
  let top = r.bottom + 8;
  if (left + 250 > window.innerWidth - 12) left = window.innerWidth - 262;
  if (top + 130 > window.innerHeight - 12) top = window.innerHeight - 142;
  pop.style.left = `${Math.max(12, left)}px`;
  pop.style.top = `${Math.max(12, top)}px`;

  openInlineInputPopover = pop;
  setTimeout(() => input.focus(), 30);
}

// Cria a nota de verdade inline (sem window.prompt nativo)
async function criarNotaEAdicionar() {
  const anchorBtn = document.getElementById('tool-note-create');
  showInlineInputPopover(anchorBtn, 'Criar Nova Nota', 'Título da nova nota...', async titulo => {
    const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await createNoteRecord({ title: titulo, uid });
    await refreshNotesCache();
    const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
    addNoteCard(center.x - 110, center.y - 45, uid);
  });
}

// ── Menu Contextual da Conexão / Seta (Sem alert nem prompt) ───────────────────
let openArrowPopover = null;
function closeArrowPopover() {
  openArrowPopover?.remove();
  openArrowPopover = null;
}

function showArrowPopover(e, arrow) {
  closeArrowPopover();
  closeColorPopover();
  closeInlineInputPopover();

  const pop = document.createElement('div');
  pop.className = 'board-arrow-popover';

  const dir = arrow.direction || (arrow.bidirectional ? 'bidirectional' : (arrow.style === 'none' ? 'none' : 'forward'));
  const lineStyle = arrow.lineStyle || 'straight';
  const strokeStyle = arrow.style || 'solid';

  pop.innerHTML = `
    <div class="board-popover-title">Conexão</div>
    <input type="text" class="board-popover-input pop-arrow-label" placeholder="Rótulo da conexão..." value="${escHtml(arrow.label || '')}" />
    
    <div class="board-popover-row">
      <span style="font-size:11px;color:var(--text-muted);min-width:50px;">Direção:</span>
      <div class="board-popover-btn-group">
        <button type="button" class="board-popover-btn ${dir === 'forward' ? 'is-active' : ''}" data-dir="forward" title="Unidirecional">→</button>
        <button type="button" class="board-popover-btn ${dir === 'bidirectional' ? 'is-active' : ''}" data-dir="bidirectional" title="Bidirecional">↔</button>
        <button type="button" class="board-popover-btn ${dir === 'none' ? 'is-active' : ''}" data-dir="none" title="Sem ponta">—</button>
      </div>
    </div>

    <div class="board-popover-row">
      <span style="font-size:11px;color:var(--text-muted);min-width:50px;">Formato:</span>
      <div class="board-popover-btn-group">
        <button type="button" class="board-popover-btn ${lineStyle === 'straight' ? 'is-active' : ''}" data-line="straight">Reta</button>
        <button type="button" class="board-popover-btn ${lineStyle === 'curved' ? 'is-active' : ''}" data-line="curved">Curva</button>
      </div>
    </div>

    <div class="board-popover-row">
      <span style="font-size:11px;color:var(--text-muted);min-width:50px;">Estilo:</span>
      <div class="board-popover-btn-group">
        <button type="button" class="board-popover-btn ${strokeStyle !== 'dashed' ? 'is-active' : ''}" data-stroke="solid">Sólida</button>
        <button type="button" class="board-popover-btn ${strokeStyle === 'dashed' ? 'is-active' : ''}" data-stroke="dashed">Tracejada</button>
      </div>
    </div>

    <div class="board-popover-row">
      <span style="font-size:11px;color:var(--text-muted);min-width:50px;">Cor:</span>
      <div class="board-popover-colors">
        <button type="button" class="board-color-swatch is-default ${!arrow.color ? 'is-active' : ''}" data-color="default" title="Padrão"></button>
        <button type="button" class="board-color-swatch ${arrow.color === '#ef4444' ? 'is-active' : ''}" data-color="#ef4444" style="background:#ef4444" title="Vermelho"></button>
        <button type="button" class="board-color-swatch ${arrow.color === '#f97316' ? 'is-active' : ''}" data-color="#f97316" style="background:#f97316" title="Laranja"></button>
        <button type="button" class="board-color-swatch ${arrow.color === '#eab308' ? 'is-active' : ''}" data-color="#eab308" style="background:#eab308" title="Amarelo"></button>
        <button type="button" class="board-color-swatch ${arrow.color === '#22c55e' ? 'is-active' : ''}" data-color="#22c55e" style="background:#22c55e" title="Verde"></button>
        <button type="button" class="board-color-swatch ${arrow.color === '#3b82f6' ? 'is-active' : ''}" data-color="#3b82f6" style="background:#3b82f6" title="Azul"></button>
        <button type="button" class="board-color-swatch ${arrow.color === '#6366f1' ? 'is-active' : ''}" data-color="#6366f1" style="background:#6366f1" title="Índigo"></button>
        <button type="button" class="board-color-swatch ${arrow.color === '#a855f7' ? 'is-active' : ''}" data-color="#a855f7" style="background:#a855f7" title="Violeta"></button>
      </div>
    </div>

    <div class="board-popover-actions">
      <button type="button" class="board-toolbar-btn is-danger pop-delete-arrow">
        <span class="qd-icon material-symbols-rounded">delete</span>
        Excluir
      </button>
      <button type="button" class="board-btn pop-close-arrow">Concluir</button>
    </div>
  `;

  const inputLabel = pop.querySelector('.pop-arrow-label');
  inputLabel.addEventListener('input', () => {
    arrow.label = inputLabel.value.trim() || null;
    renderArrows();
    scheduleSave();
  });

  pop.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.direction = btn.dataset.dir;
      arrow.bidirectional = arrow.direction === 'bidirectional';
      if (arrow.direction === 'none') arrow.style = 'none';
      else if (arrow.style === 'none') arrow.style = 'solid';
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow);
    });
  });

  pop.querySelectorAll('[data-line]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.lineStyle = btn.dataset.line;
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow);
    });
  });

  pop.querySelectorAll('[data-stroke]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.style = btn.dataset.stroke;
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow);
    });
  });

  pop.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.color = btn.dataset.color === 'default' ? null : btn.dataset.color;
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow);
    });
  });

  pop.querySelector('.pop-delete-arrow').addEventListener('click', () => {
    currentBoard.arrows = currentBoard.arrows.filter(a => a.id !== arrow.id);
    renderArrows();
    scheduleSave();
    closeArrowPopover();
  });

  pop.querySelector('.pop-close-arrow').addEventListener('click', () => {
    closeArrowPopover();
  });

  pop.addEventListener('click', ev => ev.stopPropagation());
  pop.addEventListener('pointerdown', ev => ev.stopPropagation());

  document.body.appendChild(pop);

  const popW = 260, popH = 260;
  let left = e.clientX + 10;
  let top = e.clientY + 10;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (top + popH > window.innerHeight - 12) top = window.innerHeight - popH - 12;
  pop.style.left = `${Math.max(12, left)}px`;
  pop.style.top = `${Math.max(12, top)}px`;

  openArrowPopover = pop;
  setTimeout(() => inputLabel.focus(), 30);
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (openNoteSearchPopover && !openNoteSearchPopover.contains(e.target) && !e.target.closest('#tool-note-link')) {
      closeNoteSearchPopover();
    }
    if (openArrowPopover && !openArrowPopover.contains(e.target) && !e.target.closest('.board-arrow-path') && !e.target.closest('.board-arrow-hit-area')) {
      closeArrowPopover();
    }
    if (openInlineInputPopover && !openInlineInputPopover.contains(e.target) && !e.target.closest('#tool-note-create')) {
      closeInlineInputPopover();
    }
  }, true);
}

// Rótulo do cabeçalho e HTML do corpo variam por tipo de cartão — texto
// (padrão, cartões antigos sem `type` caem aqui), imagem colada e nota
// vinculada. O corpo de imagem/nota não é editável como texto solto.
function cardHandleLabel(card) {
  const tipo = card.type || 'text';
  if (tipo === 'group') return card.label || 'Grupo';
  if (tipo === 'image') return '⠿ Imagem';
  if (tipo === 'note') return '⠿ Nota';
  return '⠿ Cartão';
}

function noteCardBodyHtml(card) {
  const nota = allNotesCache.find(n => n.uid === card.noteUid);
  if (!nota) {
    return `
      <div class="board-card-body board-card-note-body is-missing" title="A nota vinculada não foi encontrada">
        <span class="qd-icon material-symbols-rounded board-card-note-icon">link_off</span>
        <span class="board-card-note-title">Nota não encontrada</span>
      </div>`;
  }
  return `
    <div class="board-card-body board-card-note-body" title="Abrir nota (duplo clique)">
      <span class="qd-icon material-symbols-rounded board-card-note-icon">${escHtml(nota.icon || 'description')}</span>
      <span class="board-card-note-title">${escHtml(nota.title || 'Sem título')}</span>
    </div>`;
}

function createCardElement(card) {
  const tipo = card.type || 'text';
  const el = document.createElement('div');
  el.className = 'board-card';
  el.dataset.cardId = card.id;
  el.dataset.cardType = tipo;

  const nota = tipo === 'note' ? allNotesCache.find(n => n.uid === card.noteUid) : null;
  applyCardColor(el, tipo === 'note' ? (nota?.color || null) : card.color);
  el.style.transform = `translate(${card.x}px, ${card.y}px)`;
  el.style.width = `${card.w}px`;
  el.style.height = `${card.h}px`;

  const bodyHtml = tipo === 'image'
    ? `<div class="board-card-body board-card-image-body"><img class="board-card-image-el" alt="${escHtml(card.alt || '')}" /></div>`
    : tipo === 'note'
      ? noteCardBodyHtml(card)
      : tipo === 'group'
        ? '<div class="board-card-body board-card-group-body" style="display:none;"></div>'
        : `<div class="board-card-body" contenteditable="true" spellcheck="false">${escHtml(card.text || '')}</div>`;

  // Nota já mostra a cor dela mesma (herdada, não escolhida aqui) — o botão
  // de paleta some pra não sugerir que dá pra repintar o cartão com uma cor
  // diferente da nota de verdade.
  const colorBtnHtml = tipo === 'note' ? '' :
    '<button class="card-action-btn btn-color" title="Alternar cor" aria-label="Alternar cor">🎨</button>';

  const handleHtml = tipo === 'group'
    ? `<span class="board-card-handle board-group-handle" contenteditable="true" spellcheck="false">${escHtml(card.label || 'Grupo')}</span>`
    : `<span class="board-card-handle">${cardHandleLabel(card)}</span>`;

  el.innerHTML = `
    <div class="board-card-header">
      ${handleHtml}
      <div class="board-card-actions">
        ${colorBtnHtml}
        <button class="card-action-btn btn-delete" title="Excluir cartão" aria-label="Excluir cartão">✕</button>
      </div>
    </div>
    ${bodyHtml}
    <div class="board-card-resizer" title="Redimensionar"></div>
    <div class="board-card-connect-handle top" data-handle="top" title="Puxar conexão"></div>
    <div class="board-card-connect-handle right" data-handle="right" title="Puxar conexão"></div>
    <div class="board-card-connect-handle bottom" data-handle="bottom" title="Puxar conexão"></div>
    <div class="board-card-connect-handle left" data-handle="left" title="Puxar conexão"></div>
  `;

  const bodyEl = el.querySelector('.board-card-body');

  if (tipo === 'text') {
    // Evento de Edição de Texto
    bodyEl.addEventListener('input', () => {
      card.text = bodyEl.innerText;
      scheduleSave();
    });
  } else if (tipo === 'image') {
    const imgEl = bodyEl.querySelector('.board-card-image-el');
    if (card.fileId != null) {
      loadFileBlob(card.fileId).then(blob => {
        if (!blob || !imgEl.isConnected) return;
        imgEl.src = URL.createObjectURL(blob);
      }).catch(err => console.warn('Erro ao carregar imagem do cartão:', err));
    }
  } else if (tipo === 'group') {
    const groupHandleEl = el.querySelector('.board-group-handle');
    groupHandleEl?.addEventListener('input', () => {
      card.label = groupHandleEl.innerText.trim() || 'Grupo';
      scheduleSave();
    });
    groupHandleEl?.addEventListener('pointerdown', e => e.stopPropagation());
  } else if (tipo === 'note') {
    // Duplo clique abre a nota de verdade — clique simples continua livre
    // pra arrastar/selecionar, igual aos outros cartões.
    bodyEl?.addEventListener('dblclick', e => {
      e.stopPropagation();
      if (nota) abrirNotaDoQuadro(nota.uid);
    });
  }

  // Escolher Cor (não existe em cartão de nota — ver colorBtnHtml acima)
  const btnColor = el.querySelector('.btn-color');
  btnColor?.addEventListener('click', e => {
    e.stopPropagation();
    toggleColorPopover(btnColor, card, el);
  });

  // Excluir Cartão
  const btnDel = el.querySelector('.btn-delete');
  btnDel.addEventListener('click', e => {
    e.stopPropagation();
    deleteCard(card.id);
  });

  // Clique no corpo/borda do cartão para seleção
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('input, [contenteditable="true"], .card-action-btn, .board-card-resizer, .board-card-connect-handle')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (selectedCardIds.has(card.id)) selectedCardIds.delete(card.id);
      else selectedCardIds.add(card.id);
      el.classList.toggle('is-selected', selectedCardIds.has(card.id));
      updateSelectionToolbar();
    } else if (!selectedCardIds.has(card.id)) {
      clearSelection();
      selectCard(card.id);
    }
  });

  // Arraste de Cartão pelo Cabeçalho com Auto-Alinhamento Inteligente
  const headerEl = el.querySelector('.board-card-header');
  headerEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    // Clique num botão de ação (cor, excluir) não é arrasto — sem isso o
    // header capturava o ponteiro antes do clique chegar ao botão.
    if (e.target.closest('.card-action-btn')) return;
    e.stopPropagation();

    if (!selectedCardIds.has(card.id) && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      clearSelection();
      selectCard(card.id);
    }

    headerEl.setPointerCapture(e.pointerId);
    cachedContainerRect = container.getBoundingClientRect();
    draggedCard = card;
    const worldPos = screenToWorld(e.clientX, e.clientY);
    dragCardOffset = { x: worldPos.x - card.x, y: worldPos.y - card.y };
  });

  headerEl.addEventListener('pointermove', e => {
    if (!draggedCard || draggedCard.id !== card.id) return;
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const rawX = worldPos.x - dragCardOffset.x;
    const rawY = worldPos.y - dragCardOffset.y;

    if (selectedCardIds.size > 1 && selectedCardIds.has(card.id)) {
      const dx = Math.round(rawX - card.x);
      const dy = Math.round(rawY - card.y);
      if (dx !== 0 || dy !== 0) {
        for (const c of currentBoard.cards) {
          if (selectedCardIds.has(c.id)) {
            c.x += dx;
            c.y += dy;
            const cEl = document.querySelector(`[data-card-id="${c.id}"]`);
            if (cEl) cEl.style.transform = `translate(${c.x}px, ${c.y}px)`;
          }
        }
        renderArrows();
      }
    } else {
      const snap = computeSnapping(card, rawX, rawY);
      card.x = snap.x;
      card.y = snap.y;
      el.style.transform = `translate(${card.x}px, ${card.y}px)`;
      renderGuideLines(snap.guideLines);
      renderArrows();
    }
  });

  headerEl.addEventListener('pointerup', e => {
    if (draggedCard && draggedCard.id === card.id) {
      draggedCard = null;
      cachedContainerRect = null;
      clearGuideLines();
      scheduleSave();
    }
  });

  // Redimensionamento de Cartão
  const resizerEl = el.querySelector('.board-card-resizer');
  resizerEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    resizerEl.setPointerCapture(e.pointerId);
    cachedContainerRect = container.getBoundingClientRect();
    resizingCard = card;
    resizeStart = { x: e.clientX, y: e.clientY, w: card.w, h: card.h };
  });

  resizerEl.addEventListener('pointermove', e => {
    if (!resizingCard || resizingCard.id !== card.id) return;
    const dw = (e.clientX - resizeStart.x) / currentBoard.viewport.zoom;
    const dh = (e.clientY - resizeStart.y) / currentBoard.viewport.zoom;
    card.w = Math.max(140, Math.round(resizeStart.w + dw));
    card.h = Math.max(90, Math.round(resizeStart.h + dh));
    el.style.width = `${card.w}px`;
    el.style.height = `${card.h}px`;
    renderArrows();
  });

  resizerEl.addEventListener('pointerup', e => {
    if (resizingCard && resizingCard.id === card.id) {
      resizingCard = null;
      cachedContainerRect = null;
      scheduleSave();
    }
  });

  // Puxar Conexão / Seta (Obsidian Canvas Arrow Dragging)
  el.querySelectorAll('.board-card-connect-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      cachedContainerRect = container.getBoundingClientRect();
      connectingFrom = card;
      connectingFromSide = handle.dataset.handle;
      const rect = handle.getBoundingClientRect();
      connectingHandlePos = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (draftArrow) {
        draftArrow.removeAttribute('hidden');
        draftArrow.setAttribute('marker-end', 'url(#arrowhead)');
      }
    });

    handle.addEventListener('pointermove', e => {
      if (!connectingFrom) return;
      const currentWorld = screenToWorld(e.clientX, e.clientY);
      const start = connectingHandlePos;
      const end = currentWorld;
      const bulge = Math.max(24, Math.min(100, Math.hypot(end.x - start.x, end.y - start.y) * 0.4));
      const off = controlOffset(connectingFromSide, bulge);
      const cx = start.x + off.dx;
      const cy = start.y + off.dy;
      draftArrow.setAttribute('d', `M ${start.x} ${start.y} Q ${cx} ${cy}, ${end.x} ${end.y}`);
      draftArrow.removeAttribute('hidden');
      draftArrow.setAttribute('marker-end', 'url(#arrowhead)');
    });

    handle.addEventListener('pointerup', e => {
      cachedContainerRect = null;
      if (!connectingFrom) return;
      const origem = connectingFrom;
      const origemLado = connectingFromSide;

      const targetCardEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.board-card');
      const targetId = targetCardEl?.dataset.cardId;
      if (targetId && targetId !== origem.id) {
        const toSide = sideTowards(targetCardEl.getBoundingClientRect(), { x: e.clientX, y: e.clientY });
        addArrow(origem.id, targetId, 'solid', origemLado, toSide);
      }
      ocultarRastroDeConexao();
    });
  });

  return el;
}

function deleteCard(cardId) {
  // Cartão de imagem guarda o Blob à parte, na tabela `files` — sem isso ele
  // ficaria órfão no banco pra sempre, sem nenhum cartão apontando pra ele.
  const card = currentBoard.cards.find(c => c.id === cardId);
  if (card?.type === 'image' && card.fileId != null) {
    deleteFile(card.fileId).catch(err => console.warn('Erro ao excluir arquivo do cartão:', err));
  }
  currentBoard.cards = currentBoard.cards.filter(c => c.id !== cardId);
  currentBoard.arrows = currentBoard.arrows.filter(a => a.from !== cardId && a.to !== cardId);
  renderCards();
  renderArrows();
  scheduleSave();
}

// ── Gestão de Setas / Conexões SVG ────────────────────────────────────────────
// Mesmo modelo do JSON Canvas (o formato aberto por trás do Obsidian Canvas):
// uma aresta grava `fromSide` E `toSide` explícitos, escolhidos no momento em
// que a pessoa desenha a conexão — nunca recalculados depois. Sem isso, cada
// render tinha que ADIVINHAR de qual lado a seta chega olhando só os centros
// dos dois cartões, e essa adivinhação podia mudar de resultado a cada
// render conforme os cartões se moviam, produzindo setas que pareciam
// "escorregar" pro lado errado ou apontar pro vazio.
function addArrow(fromId, toId, style = 'solid', fromSide = null, toSide = null) {
  const options = arguments[5] || {};
  // Evita aresta duplicada na mesma direção
  if (currentBoard.arrows.some(a => a.from === fromId && a.to === toId)) return;
  currentBoard.arrows.push({
    id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    from: fromId,
    to: toId,
    style: options.style || style || 'solid',
    fromSide: fromSide || null,
    toSide: toSide || null,
    direction: options.direction || 'forward',
    lineStyle: options.lineStyle || 'straight',
    color: options.color || null,
    label: options.label || null
  });
  renderArrows();
  scheduleSave();
}

// Ponto ao longo de um dos 4 lados do retângulo, numa fração de 0 a 1 (0.5
// é o meio). Várias setas no mesmo lado do mesmo cartão usam frações
// diferentes pra não nascer todas empilhadas no mesmo pixel — ver o passo 2
// de `renderArrows`.
function sidePointAt(rect, side, frac = 0.5) {
  switch (side) {
    case 'top':    return { x: rect.left + (rect.right - rect.left) * frac, y: rect.top };
    case 'bottom': return { x: rect.left + (rect.right - rect.left) * frac, y: rect.bottom };
    case 'left':   return { x: rect.left, y: rect.top + (rect.bottom - rect.top) * frac };
    case 'right':  return { x: rect.right, y: rect.top + (rect.bottom - rect.top) * frac };
    default:       return null;
  }
}

// Bounding box do cartão no espaço do mundo.
function worldRectOf(card) {
  return { left: card.x, right: card.x + card.w, top: card.y, bottom: card.y + card.h };
}

// Ponto num t (0 a 1) de uma curva Bézier cúbica — usado pra centralizar o
// rótulo da seta exatamente em cima da curva, não da reta entre as pontas.
function bezierPointAt(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y
  };
}

// De qual lado do retângulo um ponto está "na direção de" — teste normalizado.
function sideTowards(rect, point) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const halfW = (rect.right - rect.left) / 2 || 1;
  const halfH = (rect.bottom - rect.top) / 2 || 1;
  const nx = (point.x - cx) / halfW;
  const ny = (point.y - cy) / halfH;
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? 'right' : 'left';
  return ny > 0 ? 'bottom' : 'top';
}

// Distância entre os dois pontos só no eixo que o lado usa — horizontal
// pra esquerda/direita, vertical pra cima/baixo.
function axisDistance(side, p1, p2) {
  return (side === 'left' || side === 'right')
    ? Math.abs(p2.x - p1.x)
    : Math.abs(p2.y - p1.y);
}

// Deslocamento do ponto de controle da curva Bézier no espaço do mundo.
function controlOffset(side, amount) {
  switch (side) {
    case 'top':    return { dx: 0, dy: -amount };
    case 'bottom': return { dx: 0, dy: amount };
    case 'left':   return { dx: -amount, dy: 0 };
    case 'right':  return { dx: amount, dy: 0 };
    default:       return { dx: 0, dy: 0 };
  }
}

// Roteamento ortogonal inteligente (Obsidian Canvas) com cantos arredondados suaves
function getOrthogonalWaypoints(p1, p2, fromSide, toSide, r1, r2) {
  const margin = 28;

  // Caso 1: Lados iguais (ex: os dois conectam na direita)
  if (fromSide === 'right' && toSide === 'right') {
    const outX = Math.max(r1.right, r2.right) + margin;
    return [
      { x: p1.x, y: p1.y },
      { x: outX, y: p1.y },
      { x: outX, y: p2.y },
      { x: p2.x, y: p2.y }
    ];
  }
  if (fromSide === 'left' && toSide === 'left') {
    const outX = Math.min(r1.left, r2.left) - margin;
    return [
      { x: p1.x, y: p1.y },
      { x: outX, y: p1.y },
      { x: outX, y: p2.y },
      { x: p2.x, y: p2.y }
    ];
  }
  if (fromSide === 'top' && toSide === 'top') {
    const outY = Math.min(r1.top, r2.top) - margin;
    return [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: outY },
      { x: p2.x, y: outY },
      { x: p2.x, y: p2.y }
    ];
  }
  if (fromSide === 'bottom' && toSide === 'bottom') {
    const outY = Math.max(r1.bottom, r2.bottom) + margin;
    return [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: outY },
      { x: p2.x, y: outY },
      { x: p2.x, y: p2.y }
    ];
  }

  // Caso 2: Direita -> Esquerda
  if (fromSide === 'right' && toSide === 'left') {
    if (p2.x >= p1.x + 16) {
      if (Math.abs(p1.y - p2.y) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midX = (p1.x + p2.x) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: midX, y: p1.y },
        { x: midX, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outX1 = r1.right + margin;
      const outX2 = r2.left - margin;
      const routeY = (p1.y < p2.y)
        ? (Math.max(r1.bottom, r2.bottom) + margin)
        : (Math.min(r1.top, r2.top) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: outX1, y: p1.y },
        { x: outX1, y: routeY },
        { x: outX2, y: routeY },
        { x: outX2, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 3: Esquerda -> Direita
  if (fromSide === 'left' && toSide === 'right') {
    if (p1.x >= p2.x + 16) {
      if (Math.abs(p1.y - p2.y) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midX = (p1.x + p2.x) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: midX, y: p1.y },
        { x: midX, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outX1 = r1.left - margin;
      const outX2 = r2.right + margin;
      const routeY = (p1.y < p2.y)
        ? (Math.max(r1.bottom, r2.bottom) + margin)
        : (Math.min(r1.top, r2.top) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: outX1, y: p1.y },
        { x: outX1, y: routeY },
        { x: outX2, y: routeY },
        { x: outX2, y: p2.y },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 4: Baixo -> Topo
  if (fromSide === 'bottom' && toSide === 'top') {
    if (p2.y >= p1.y + 16) {
      if (Math.abs(p1.x - p2.x) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midY = (p1.y + p2.y) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: midY },
        { x: p2.x, y: midY },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outY1 = r1.bottom + margin;
      const outY2 = r2.top - margin;
      const routeX = (p1.x < p2.x)
        ? (Math.max(r1.right, r2.right) + margin)
        : (Math.min(r1.left, r2.left) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: outY1 },
        { x: routeX, y: outY1 },
        { x: routeX, y: outY2 },
        { x: p2.x, y: outY2 },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 5: Topo -> Baixo
  if (fromSide === 'top' && toSide === 'bottom') {
    if (p1.y >= p2.y + 16) {
      if (Math.abs(p1.x - p2.x) < 2) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
      const midY = (p1.y + p2.y) / 2;
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: midY },
        { x: p2.x, y: midY },
        { x: p2.x, y: p2.y }
      ];
    } else {
      const outY1 = r1.top - margin;
      const outY2 = r2.bottom + margin;
      const routeX = (p1.x < p2.x)
        ? (Math.max(r1.right, r2.right) + margin)
        : (Math.min(r1.left, r2.left) - margin);
      return [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: outY1 },
        { x: routeX, y: outY1 },
        { x: routeX, y: outY2 },
        { x: p2.x, y: outY2 },
        { x: p2.x, y: p2.y }
      ];
    }
  }

  // Caso 6: Lados perpendiculares
  if (fromSide === 'right' || fromSide === 'left') {
    return [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p1.y },
      { x: p2.x, y: p2.y }
    ];
  } else {
    return [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: p2.y },
      { x: p2.x, y: p2.y }
    ];
  }
}

function waypointsToSvgPath(points, radius = 12) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const vIn = { x: curr.x - prev.x, y: curr.y - prev.y };
    const vOut = { x: next.x - curr.x, y: next.y - curr.y };
    const lenIn = Math.hypot(vIn.x, vIn.y);
    const lenOut = Math.hypot(vOut.x, vOut.y);

    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    if (r < 1) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const startX = curr.x - (vIn.x / lenIn) * r;
    const startY = curr.y - (vIn.y / lenIn) * r;
    const endX = curr.x + (vOut.x / lenOut) * r;
    const endY = curr.y + (vOut.y / lenOut) * r;

    d += ` L ${startX} ${startY} Q ${curr.x} ${curr.y}, ${endX} ${endY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function waypointPathMidpoint(points) {
  if (points.length <= 2) {
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  }
  let totalLen = 0;
  const lens = [];
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lens.push(l);
    totalLen += l;
  }
  const target = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    if (acc + lens[i] >= target) {
      const segFrac = (target - acc) / (lens[i] || 1);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * segFrac,
        y: points[i].y + (points[i + 1].y - points[i].y) * segFrac
      };
    }
    acc += lens[i];
  }
  return { x: points[1].x, y: points[1].y };
}

const labelBBoxCache = new Map();
const arrowDomMap = new Map();

function renderArrows() {
  // Auto-cura: rastro tracejado
  if (!connectingFrom && !draftArrow.hidden) draftArrow.hidden = true;

  const cardMap = new Map(currentBoard.cards.map(c => [c.id, c]));
  const svgNS = 'http://www.w3.org/2000/svg';

  // Passo 1: resolve os lados usando diretamente coordenadas de mundo
  const resolved = [];
  const currentArrowIds = new Set();
  for (const arrow of currentBoard.arrows) {
    const c1 = cardMap.get(arrow.from);
    const c2 = cardMap.get(arrow.to);
    if (!c1 || !c2) continue;

    currentArrowIds.add(arrow.id);
    const r1 = worldRectOf(c1);
    const r2 = worldRectOf(c2);
    const s1 = { x: c1.x + c1.w / 2, y: c1.y + c1.h / 2 };
    const s2 = { x: c2.x + c2.w / 2, y: c2.y + c2.h / 2 };

    const fromSide = arrow.fromSide || sideTowards(r1, s2);
    const toSide = arrow.toSide || sideTowards(r2, s1);

    resolved.push({ arrow, c1, r1, r2, fromSide, toSide });
  }

  // Remove nós órfãos de conexões apagadas
  for (const [id, dom] of arrowDomMap.entries()) {
    if (!currentArrowIds.has(id)) {
      dom.hitArea?.remove();
      dom.path?.remove();
      dom.bg?.remove();
      dom.text?.remove();
      arrowDomMap.delete(id);
    }
  }

  // Passo 2: agrupa por (cartão, lado) para distribuir setas no mesmo lado
  const grupos = new Map();
  const chaveDe = (cardId, side) => `${cardId}:${side}`;
  for (const item of resolved) {
    const kFrom = chaveDe(item.c1.id, item.fromSide);
    const kTo = chaveDe(item.arrow.to, item.toSide);
    if (!grupos.has(kFrom)) grupos.set(kFrom, []);
    grupos.get(kFrom).push({ item, ponta: 'from' });
    if (!grupos.has(kTo)) grupos.set(kTo, []);
    grupos.get(kTo).push({ item, ponta: 'to' });
  }
  for (const entradas of grupos.values()) {
    entradas.forEach((entrada, i) => {
      const frac = (i + 1) / (entradas.length + 1);
      if (entrada.ponta === 'from') entrada.item.fracFrom = frac;
      else entrada.item.fracTo = frac;
    });
  }

  // Passo 3: desenha no SVG em coordenadas do mundo (Zero Jitter e Zero Delay!)
  for (const { arrow, r1, r2, fromSide, toSide, fracFrom, fracTo } of resolved) {
    const p1 = sidePointAt(r1, fromSide, fracFrom);
    const p2 = sidePointAt(r2, toSide, fracTo);

    const bulge1 = Math.max(28, Math.min(120, axisDistance(fromSide, p1, p2) * 0.5));
    const bulge2 = Math.max(28, Math.min(120, axisDistance(toSide, p1, p2) * 0.5));
    const o1 = controlOffset(fromSide, bulge1);
    const o2 = controlOffset(toSide, bulge2);

    const cx1 = p1.x + o1.dx;
    const cy1 = p1.y + o1.dy;
    const cx2 = p2.x + o2.dx;
    const cy2 = p2.y + o2.dy;

    if (!arrow.lineStyle) arrow.lineStyle = 'straight';
    const isStraight = arrow.lineStyle === 'straight';
    let pathD = '';
    let mid = null;
    if (isStraight) {
      const waypoints = getOrthogonalWaypoints(p1, p2, fromSide, toSide, r1, r2);
      pathD = (waypoints.length <= 2)
        ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
        : waypointsToSvgPath(waypoints, 12);
      mid = waypointPathMidpoint(waypoints);
    } else {
      pathD = `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;
      mid = bezierPointAt(p1, { x: cx1, y: cy1 }, { x: cx2, y: cy2 }, p2, 0.5);
    }

    const onArrowAction = e => {
      e.stopPropagation();
      e.preventDefault();
      showArrowPopover(e, arrow);
    };

    function syncArrowStyles(dom) {
      dom.hitArea.setAttribute('d', pathD);
      dom.path.setAttribute('d', pathD);

      const dir = arrow.direction || (arrow.bidirectional ? 'bidirectional' : (arrow.style === 'none' ? 'none' : 'forward'));
      if (dir === 'bidirectional') {
        dom.path.setAttribute('marker-start', 'url(#arrowhead-start)');
        dom.path.setAttribute('marker-end', 'url(#arrowhead)');
      } else if (dir === 'forward') {
        dom.path.removeAttribute('marker-start');
        dom.path.setAttribute('marker-end', 'url(#arrowhead)');
      } else if (dir === 'backward') {
        dom.path.setAttribute('marker-start', 'url(#arrowhead-start)');
        dom.path.removeAttribute('marker-end');
      } else {
        dom.path.removeAttribute('marker-start');
        dom.path.removeAttribute('marker-end');
      }

      if (arrow.style === 'dashed') {
        dom.path.setAttribute('stroke-dasharray', '6 6');
      } else {
        dom.path.removeAttribute('stroke-dasharray');
      }

      if (arrow.color) {
        dom.path.style.stroke = arrow.color;
        dom.path.style.color = arrow.color;
      } else {
        dom.path.style.removeProperty('stroke');
        dom.path.style.removeProperty('color');
      }

      if (arrow.label) {
        if (!dom.text || !dom.bg) {
          const textEl = document.createElementNS(svgNS, 'text');
          textEl.setAttribute('class', 'board-arrow-label-text');
          textEl.addEventListener('click', onArrowAction);
          textEl.addEventListener('contextmenu', onArrowAction);
          arrowsGroup.appendChild(textEl);

          const bgEl = document.createElementNS(svgNS, 'rect');
          bgEl.setAttribute('class', 'board-arrow-label-bg');
          bgEl.setAttribute('rx', '4');
          bgEl.addEventListener('click', onArrowAction);
          bgEl.addEventListener('contextmenu', onArrowAction);
          arrowsGroup.insertBefore(bgEl, textEl);

          dom.text = textEl;
          dom.bg = bgEl;
        }

        dom.text.textContent = arrow.label;
        dom.text.setAttribute('x', String(mid.x));
        dom.text.setAttribute('y', String(mid.y));

        let dim = labelBBoxCache.get(arrow.label);
        if (!dim) {
          try {
            const bbox = dom.text.getBBox();
            if (bbox.width > 0) {
              dim = { width: bbox.width, height: bbox.height };
              labelBBoxCache.set(arrow.label, dim);
            }
          } catch {}
          if (!dim) dim = { width: arrow.label.length * 7.5, height: 16 };
        }

        const padX = 6, padY = 3;
        const w = dim.width + padX * 2;
        const h = dim.height + padY * 2;
        dom.bg.setAttribute('x', String(mid.x - w / 2));
        dom.bg.setAttribute('y', String(mid.y - h / 2));
        dom.bg.setAttribute('width', String(w));
        dom.bg.setAttribute('height', String(h));
      } else {
        if (dom.text) { dom.text.remove(); dom.text = null; }
        if (dom.bg) { dom.bg.remove(); dom.bg = null; }
      }
    }

    const existingDom = arrowDomMap.get(arrow.id);
    if (existingDom && arrowsGroup.contains(existingDom.path)) {
      syncArrowStyles(existingDom);
      continue;
    }

    // Hit area transparente de 16px para facilitar o toque e clique
    const hitArea = document.createElementNS(svgNS, 'path');
    hitArea.setAttribute('class', 'board-arrow-hit-area');
    hitArea.addEventListener('click', onArrowAction);
    hitArea.addEventListener('contextmenu', onArrowAction);

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('class', 'board-arrow-path');
    path.addEventListener('click', onArrowAction);
    path.addEventListener('contextmenu', onArrowAction);

    arrowsGroup.appendChild(hitArea);
    arrowsGroup.appendChild(path);

    const newDom = { hitArea, path, text: null, bg: null };
    arrowDomMap.set(arrow.id, newDom);
    syncArrowStyles(newDom);
  }
}

// ── Eventos de Mouse e Teclado ────────────────────────────────────────────────
function setupEventListeners(getEl) {
  // Título do Espaço
  titleInput?.addEventListener('input', () => {
    currentBoard.title = titleInput.value.trim() || 'Espaço Sem Título';
    scheduleSave();
  });

  // Ferramentas da Barra
  getEl('tool-select')?.addEventListener('click', () => setTool('select'));
  getEl('tool-card')?.addEventListener('click', () => {
    const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
    addCard(center.x - 110, center.y - 65);
    setTool('select');
  });
  getEl('tool-arrow')?.addEventListener('click', () => setTool('arrow'));

  // Ferramenta de Imagem (clique abre seletor de arquivo)
  const imageInput = getEl('board-image-upload-input');
  getEl('tool-image')?.addEventListener('click', () => {
    imageInput?.click();
  });

  imageInput?.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    try {
      const fileId = await saveFile(file, null, { inline: true });
      const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
      addImageCard(center.x - 130, center.y - 100, fileId, file.name);
    } catch (err) {
      console.warn('Erro ao salvar imagem adicionada:', err);
    }
    imageInput.value = '';
  });

  // Ferramenta de Grupo (Obsidian Canvas Group)
  getEl('tool-group')?.addEventListener('click', () => {
    const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
    addGroupCard(center.x - 190, center.y - 130);
    setTool('select');
  });

  // Drag & Drop de arquivos de imagem diretamente no Canvas
  container.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  container.addEventListener('drop', async e => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    const worldPos = screenToWorld(e.clientX, e.clientY);
    let offsetX = 0;
    for (const file of files) {
      try {
        const fileId = await saveFile(file, null, { inline: true });
        addImageCard(worldPos.x - 130 + offsetX, worldPos.y - 100, fileId, file.name);
        offsetX += 40;
      } catch (err) {
        console.warn('Erro ao soltar imagem no canvas:', err);
      }
    }
  });

  // Vincular nota existente / Criar nota nova — ações imediatas, não modos
  // persistentes como os três botões acima: cada clique já resolve tudo
  // (busca e solta, ou cria e solta) no centro da tela.
  getEl('tool-note-link')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleNoteSearchPopover(e.currentTarget);
  });
  getEl('tool-note-create')?.addEventListener('click', criarNotaEAdicionar);

  // Colar Imagem — mesmo mecanismo dos anexos de nota (Blob na tabela
  // `files` do Dexie, nunca base64 solto no JSON do quadro), só que aqui
  // sempre vira um cartão de imagem novo em vez de um bloco dentro do texto.
  window.addEventListener('paste', async e => {
    if (rootSectionEl?.hidden) return;
    const item = [...(e.clipboardData?.items ?? [])].find(it => it.type.startsWith('image/'));
    if (!item) return;
    const blob = item.getAsFile();
    if (!blob) return;
    e.preventDefault();
    const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const ext = ({ jpeg: 'jpg' }[blob.type.split('/')[1]] ?? blob.type.split('/')[1] ?? 'png');
    const file = new File([blob], `colado_${carimbo}.${ext}`, { type: blob.type });
    const fileId = await saveFile(file, null, { inline: true });
    const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
    addImageCard(center.x - 130, center.y - 100, fileId);
  });

  // Zoom
  getEl('btn-zoom-in')?.addEventListener('click', () => zoomBy(1.2));
  getEl('btn-zoom-out')?.addEventListener('click', () => zoomBy(0.8));
  getEl('btn-zoom-reset')?.addEventListener('click', resetZoomAndCenter);

  // Voltar: aba cheia fecha/volta no histórico; embutida volta pro editor de
  // notas (função fornecida por quem montou — board-view.js sabe fazer isso,
  // este arquivo não precisa importar o resto do painel pra tanto).
  getEl('btn-board-back')?.addEventListener('click', () => {
    if (engineOptions.onBack) {
      engineOptions.onBack();
    } else if (window.opener || window.history.length <= 1) {
      window.close();
    } else {
      window.history.back();
    }
  });

  // Abrir em aba cheia (só existe embutido — a aba cheia já É a aba cheia)
  getEl('btn-board-open-tab')?.addEventListener('click', () => {
    abrirQuadroInfinitoEmAba(currentBoard?.id);
  });

  // Alternar Tema (só existe na aba cheia — embutido usa o tema do painel)
  getEl('btn-toggle-theme')?.addEventListener('click', toggleTheme);

  // Alternar Fundo: Estrelas / Pontos / Nenhum
  const cycleBgMode = () => {
    const modes = ['stars', 'dots', 'none'];
    const cur = currentBoard.bgMode || 'stars';
    const nextIdx = (modes.indexOf(cur) + 1) % modes.length;
    currentBoard.bgMode = modes[nextIdx];
    applyViewport();
    updateBgToggleButtons();
    scheduleSave();
  };
  getEl('btn-toggle-bg')?.addEventListener('click', cycleBgMode);
  getEl('btn-board-toggle-bg')?.addEventListener('click', cycleBgMode);

  // Exportar JSON
  getEl('btn-export-json')?.addEventListener('click', exportBoardAsJSON);

  // Pan na Área de Trabalho
  container.addEventListener('pointerdown', onContainerPointerDown);
  window.addEventListener('pointermove', onContainerPointerMove);
  window.addEventListener('pointerup', onContainerPointerUp);

  // Rede de segurança: se soltar fora do handle (ex.: fora da janela), o
  // 'pointerup' dele nunca dispara e o rastro tracejado fica preso na tela.
  window.addEventListener('pointerup', () => {
    if (connectingFrom) ocultarRastroDeConexao();
  });
  window.addEventListener('pointercancel', () => {
    if (connectingFrom) ocultarRastroDeConexao();
  });

  // Segunda rede de segurança, mais ampla: QUALQUER novo gesto que comece
  // fora de um handle de conexão enquanto `connectingFrom` ainda está setado
  // significa que um caminho de limpeza anterior falhou (perda de captura do
  // ponteiro, troca de aba no meio do arrasto, etc.) — ao vivo, captura fase
  // de captura na janela inteira, então roda antes de qualquer outro handler
  // decidir o que fazer com o clique novo.
  window.addEventListener('pointerdown', e => {
    if (connectingFrom && !e.target.closest('.board-card-connect-handle')) {
      ocultarRastroDeConexao();
    }
  }, true);

  // Zoom com Roda do Mouse
  container.addEventListener('wheel', onContainerWheel, { passive: false });

  // Duplo clique na tela vazia adiciona cartão
  container.addEventListener('dblclick', e => {
    if (e.target !== container && e.target !== svgLayer) return;
    const pos = screenToWorld(e.clientX, e.clientY);
    addCard(pos.x - 110, pos.y - 65);
  });

  // Atalhos de Teclado — embutido no painel, só responde se esta visão
  // estiver realmente visível (senão "c" numa nota comum tentaria criar
  // cartão num quadro escondido).
  window.addEventListener('keydown', e => {
    if (rootSectionEl?.hidden) return;
    if (e.target.matches('input, [contenteditable="true"]')) return;
    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'c' || e.key === 'C') {
      const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
      addCard(center.x - 110, center.y - 65);
    }
    if (e.key === 'g' || e.key === 'G') {
      const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
      addGroupCard(center.x - 190, center.y - 130);
    }
    if (e.key === '+' || e.key === '=') zoomBy(1.2);
    if (e.key === '-') zoomBy(0.8);
    if (e.key === '0') resetZoomAndCenter();
  });
}

function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll('.board-tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tool-${tool}`)?.classList.add('active');
}

function onContainerPointerDown(e) {
  // Ignora se o clique for dentro de um cartão ou popover interativo
  if (e.target.closest?.('.board-card') ||
      e.target.closest?.('.board-color-popover') ||
      e.target.closest?.('.board-arrow-popover') ||
      e.target.closest?.('.board-inline-input-popover') ||
      e.target.closest?.('.board-selection-toolbar') ||
      e.target.closest?.('.board-note-search-popover')) {
    return;
  }

  cachedContainerRect = container.getBoundingClientRect();

  // Marquee Box Selection: Ctrl+arraste (Desktop) ou modo seleção mobile
  if (e.button === 0 && (e.ctrlKey || e.metaKey || isMobileSelectionMode)) {
    isBoxSelecting = true;
    isPanning = false;
    const worldPos = screenToWorld(e.clientX, e.clientY);
    boxStartWorld = { x: worldPos.x, y: worldPos.y };
    if (selectionBoxEl) {
      selectionBoxEl.style.left = `${worldPos.x}px`;
      selectionBoxEl.style.top = `${worldPos.y}px`;
      selectionBoxEl.style.width = '0px';
      selectionBoxEl.style.height = '0px';
      selectionBoxEl.removeAttribute('hidden');
    }
    if (!e.shiftKey) clearSelection();
    container.setPointerCapture(e.pointerId);
    return;
  }

  // Toque longo no mobile para ativar seleção múltipla (Obsidian Mobile Canvas)
  if (e.button === 0 && e.pointerType === 'touch') {
    const touchX = e.clientX;
    const touchY = e.clientY;
    longPressTimer = setTimeout(() => {
      isMobileSelectionMode = true;
      isPanning = false;
      container.classList.remove('is-panning');
      isBoxSelecting = true;
      const worldPos = screenToWorld(touchX, touchY);
      boxStartWorld = { x: worldPos.x, y: worldPos.y };
      if (selectionBoxEl) {
        selectionBoxEl.style.left = `${worldPos.x}px`;
        selectionBoxEl.style.top = `${worldPos.y}px`;
        selectionBoxEl.style.width = '0px';
        selectionBoxEl.style.height = '0px';
        selectionBoxEl.removeAttribute('hidden');
      }
      clearSelection();
    }, 400);
  }

  // Arraste / Pan na área de trabalho com botão do meio ou botão esquerdo fora de cartões
  if (e.button === 1 || (e.button === 0 && (e.target === container || e.target === svgLayer || e.target === guidesGroup || e.target === arrowsGroup))) {
    isPanning = true;
    startPanX = e.clientX;
    startPanY = e.clientY;
    container.classList.add('is-panning');
    container.setPointerCapture(e.pointerId);
  }
}

function onContainerPointerMove(e) {
  // Live Draft Arrow: rastro tracejado ao vivo apontando para a posição do cursor
  if (connectingFrom && connectingHandlePos && draftArrow) {
    const currentWorld = screenToWorld(e.clientX, e.clientY);
    const start = connectingHandlePos;
    const end = currentWorld;
    const bulge = Math.max(24, Math.min(100, Math.hypot(end.x - start.x, end.y - start.y) * 0.4));
    const off = controlOffset(connectingFromSide, bulge);
    const cx = start.x + off.dx;
    const cy = start.y + off.dy;
    draftArrow.setAttribute('d', `M ${start.x} ${start.y} Q ${cx} ${cy}, ${end.x} ${end.y}`);
    draftArrow.removeAttribute('hidden');
    draftArrow.setAttribute('marker-end', 'url(#arrowhead)');
  }

  // Cancela o timer de toque longo se o dedo se mexer antes dos 400ms
  if (longPressTimer) {
    const moveDist = Math.hypot(e.clientX - startPanX, e.clientY - startPanY);
    if (moveDist > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // Seleção por retângulo (Marquee Box Selection)
  if (isBoxSelecting) {
    const currWorld = screenToWorld(e.clientX, e.clientY);
    const minX = Math.min(boxStartWorld.x, currWorld.x);
    const maxX = Math.max(boxStartWorld.x, currWorld.x);
    const minY = Math.min(boxStartWorld.y, currWorld.y);
    const maxY = Math.max(boxStartWorld.y, currWorld.y);
    const w = maxX - minX;
    const h = maxY - minY;

    if (selectionBoxEl) {
      selectionBoxEl.style.left = `${minX}px`;
      selectionBoxEl.style.top = `${minY}px`;
      selectionBoxEl.style.width = `${w}px`;
      selectionBoxEl.style.height = `${h}px`;
    }

    for (const card of currentBoard.cards) {
      const cardRight = card.x + card.w;
      const cardBottom = card.y + card.h;
      const intersects = (minX < cardRight && maxX > card.x && minY < cardBottom && maxY > card.y);
      const cardEl = document.querySelector(`[data-card-id="${card.id}"]`);
      if (intersects) {
        selectedCardIds.add(card.id);
        cardEl?.classList.add('is-selected');
      } else if (!e.shiftKey) {
        selectedCardIds.delete(card.id);
        cardEl?.classList.remove('is-selected');
      }
    }
    updateSelectionToolbar();
    return;
  }

  if (!isPanning) return;
  const dx = e.clientX - startPanX;
  const dy = e.clientY - startPanY;
  startPanX = e.clientX;
  startPanY = e.clientY;

  currentBoard.viewport.x += dx;
  currentBoard.viewport.y += dy;
  applyViewport();
}

function onContainerPointerUp(e) {
  cachedContainerRect = null;
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  // Soltar conexão de seta (rede de captura garantida)
  if (connectingFrom) {
    const origem = connectingFrom;
    const origemLado = connectingFromSide;
    const targetCardEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.board-card');
    const targetId = targetCardEl?.dataset.cardId;
    if (targetId && targetId !== origem.id) {
      const toSide = sideTowards(targetCardEl.getBoundingClientRect(), { x: e.clientX, y: e.clientY });
      addArrow(origem.id, targetId, 'solid', origemLado, toSide);
    }
    ocultarRastroDeConexao();
  }

  if (isBoxSelecting) {
    isBoxSelecting = false;
    isMobileSelectionMode = false;
    if (selectionBoxEl) {
      selectionBoxEl.setAttribute('hidden', '');
      selectionBoxEl.style.width = '0px';
      selectionBoxEl.style.height = '0px';
    }
    updateSelectionToolbar();
  }

  if (isPanning) {
    const dist = Math.hypot(e.clientX - startPanX, e.clientY - startPanY);
    isPanning = false;
    container.classList.remove('is-panning');
    if (dist < 5) {
      clearSelection();
      closeColorPopover();
      closeArrowPopover();
      closeInlineInputPopover();
      closeNoteSearchPopover();
    }
    scheduleSave();
  }
}

function onContainerWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 0.88;
  zoomBy(factor, e.clientX, e.clientY);
}

export function exportBoardAsJSON() {
  const json = JSON.stringify(currentBoard, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (currentBoard.title || 'quadro').toLowerCase().replace(/[^\w\d-]+/g, '-');
  a.href = url;
  a.download = `${slug}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
