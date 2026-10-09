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
  saveBoardRecord, getBoardById, getBoardByUid, loadAllBoards, deleteBoardRecord,
  saveFile, loadFileBlob, deleteFile, loadAllNotesMeta, createNoteRecord, getNoteById, updateNoteMetaById,
} from './storage.js';
import { escHtml, blocksOfNote } from './blocks.js';
import { renderNoteBlocks } from './board/board-note-render.js';
import { positionPopover } from './popover.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Submódulos de Formas, Snapping e Setas (Fase 3) ─────────────────────────
import { FLOWCHART_SHAPES, getShapeSvgBackgroundHtml as _getShapeSvgBackgroundHtml } from './board/board-shapes.js';
export { FLOWCHART_SHAPES };
import {
  computeSnapping as _computeSnapping,
  renderGuideLines as _renderGuideLines,
  clearGuideLines as _clearGuideLines,
  SNAP_THRESHOLD,
} from './board/board-snapping.js';
import {
  calculateArrowEndpoints,
  generateArrowPathD,
  getOrthogonalWaypoints as _getOrthogonalWaypoints,
  waypointsToSvgPath as _waypointsToSvgPath,
  waypointPathMidpoint as _waypointPathMidpoint,
} from './board/board-arrows.js';
import {
  screenToWorld as _screenToWorld,
  worldToScreen as _worldToScreen,
  computeZoomBy,
  computeFitAll,
} from './board/board-camera.js';
import {
  NAMED_COLORS,
  RAINBOW_COLORS,
  ARROW_COLORS,
  applyCardColor as _applyCardColor,
} from './board/board-colors.js';
import {
  alignCards as _alignCards,
  computeGroupBounds as _computeGroupBounds,
  renderSelectionToolbarHtml as _renderSelectionToolbarHtml,
  getCardHandleLabel as _getCardHandleLabel,
  batchApplyColor as _batchApplyColor,
} from './board/board-cards.js';
import {
  MEDIA_DEFAULT_SIZE, MEDIA_FILE_ACCEPT, mediaFromUrl, kindFromFile, mediaHandleLabel,
  buildMediaBody, releaseMediaFile, garantirFileId, setRemoteFileResolver, urlDoArquivo,
} from './board/board-media.js';
import { toggleQuickbarPanel, openQuickbarPanel, closeQuickbarPanel } from './board/board-quickbar-panel.js';
import { renderInsertPanel } from './board/board-insert-panel.js';
import { computeBeautifyLayout } from './board/board-beautify.js';
import { renderBeautifyPanel } from './board/board-beautify-panel.js';
import { syncArrowPulse, removeArrowPulse, renderPulsePanel } from './board/board-pulse.js';
import {
  computeMarqueeBounds as _computeMarqueeBounds,
  getCardsIntersectingBox as _getCardsIntersectingBox,
  updateMarqueeBoxElement as _updateMarqueeBoxElement,
  resetMarqueeBoxElement as _resetMarqueeBoxElement,
  isCanvasBackgroundTarget as _isCanvasBackgroundTarget,
} from './board/board-interactions.js';


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

// Rastreamento e Preview de Seta Magnética
let connectingFrom = null;
let connectingFromSide = null;
let connectingHandlePos = null;
let hoveredConnectTargetCard = null;
let hoveredConnectTargetSide = null;
let openShapePopover = null;
let openArrowPopover = null;

// Elementos do DOM — atribuídos em `initBoardEngine`, nunca em `const` de
// topo de módulo: a visão embutida pode reinicializar contra o mesmo
// documento várias vezes (cada vez que a pessoa volta pra aba do quadro).
let container, worldEl, cardsLayer, svgLayer, arrowsGroup, draftArrow;
let guidesGroup, selectionBoxEl, selectionToolbarEl;
let titleInput, saveStatus, zoomText, rootSectionEl;

// Seleção múltipla e auto-alinhamento inteligente estilo Canva
let selectedCardIds = new Set();
// Cartão de nota em edição de verdade (editor de notas emprestado ao cartão — ver board/board-note-live.js)
let liveCardId = null;
let isBoxSelecting = false;
let boxStartWorld = { x: 0, y: 0 };
let longPressTimer = null;
let isMobileSelectionMode = false;
// SNAP_THRESHOLD importado de board-snapping.js
let hasSnappedHaptic = false;

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

// Ponto único de saída do "modo conectando" e feedback visual magnético
function clearConnectTargetHighlights() {
  if (hoveredConnectTargetCard) {
    const el = document.querySelector(`.board-card[data-card-id="${hoveredConnectTargetCard}"]`);
    if (el) {
      el.classList.remove('is-connect-target');
      el.querySelectorAll('.board-card-connect-handle.is-target-port').forEach(h => h.classList.remove('is-target-port'));
    }
    hoveredConnectTargetCard = null;
    hoveredConnectTargetSide = null;
  }
  document.querySelectorAll('.is-connect-target').forEach(el => el.classList.remove('is-connect-target'));
  document.querySelectorAll('.is-target-port').forEach(el => el.classList.remove('is-target-port'));
}

function updateConnectingArrow(clientX, clientY) {
  if (!connectingFrom || !connectingHandlePos || !draftArrow) return;
  const currentWorld = screenToWorld(clientX, clientY);
  const start = connectingHandlePos;
  let end = currentWorld;

  let candidateCard = null;
  let candidateCardEl = null;
  let candidateSide = null;
  let candidatePortWorld = null;
  let minPortDist = Infinity;

  const hoveredEl = document.elementFromPoint(clientX, clientY);
  const targetCardEl = hoveredEl?.closest('.board-card');
  const targetId = targetCardEl?.dataset.cardId;

  for (const c of currentBoard.cards) {
    if (c.id === connectingFrom.id) continue;
    const cEl = document.querySelector(`.board-card[data-card-id="${c.id}"]`);
    if (!cEl) continue;

    const r = worldRectOf(c);
    const ports = [
      { side: 'top', pt: { x: (r.left + r.right) / 2, y: r.top } },
      { side: 'bottom', pt: { x: (r.left + r.right) / 2, y: r.bottom } },
      { side: 'left', pt: { x: r.left, y: (r.top + r.bottom) / 2 } },
      { side: 'right', pt: { x: r.right, y: (r.top + r.bottom) / 2 } }
    ];

    const pad = 45;
    const isInsideOrNear = (
      currentWorld.x >= r.left - pad &&
      currentWorld.x <= r.right + pad &&
      currentWorld.y >= r.top - pad &&
      currentWorld.y <= r.bottom + pad
    );

    if (isInsideOrNear || c.id === targetId) {
      for (const p of ports) {
        const d = Math.hypot(p.pt.x - currentWorld.x, p.pt.y - currentWorld.y);
        if (d < minPortDist) {
          minPortDist = d;
          candidateCard = c;
          candidateCardEl = cEl;
          candidateSide = p.side;
          candidatePortWorld = p.pt;
        }
      }
    }
  }

  const SNAP_CONNECT_RADIUS = 75;
  if (candidateCard && candidatePortWorld && minPortDist < SNAP_CONNECT_RADIUS) {
    end = candidatePortWorld;

    if (hoveredConnectTargetCard !== candidateCard.id || hoveredConnectTargetSide !== candidateSide) {
      clearConnectTargetHighlights();
      hoveredConnectTargetCard = candidateCard.id;
      hoveredConnectTargetSide = candidateSide;

      candidateCardEl.classList.add('is-connect-target');
      const handleEl = candidateCardEl.querySelector(`.board-card-connect-handle[data-handle="${candidateSide}"]`);
      if (handleEl) handleEl.classList.add('is-target-port');

      draftArrow.classList.add('is-snapped');
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(18);
    }
  } else {
    if (hoveredConnectTargetCard) {
      clearConnectTargetHighlights();
    }
    draftArrow.classList.remove('is-snapped');
  }

  const bulge = Math.max(24, Math.min(100, Math.hypot(end.x - start.x, end.y - start.y) * 0.4));
  const off = controlOffset(connectingFromSide, bulge);
  const cx = start.x + off.dx;
  const cy = start.y + off.dy;
  draftArrow.setAttribute('d', `M ${start.x} ${start.y} Q ${cx} ${cy}, ${end.x} ${end.y}`);
  draftArrow.removeAttribute('hidden');
  draftArrow.setAttribute('marker-end', 'url(#arrowhead)');
}

function finishConnectingArrow(clientX, clientY) {
  cachedContainerRect = null;
  if (!connectingFrom) return;
  const origem = connectingFrom;
  const origemLado = connectingFromSide;

  let targetId = hoveredConnectTargetCard;
  let toSide = hoveredConnectTargetSide;

  if (!targetId) {
    const targetCardEl = document.elementFromPoint(clientX, clientY)?.closest('.board-card');
    const tid = targetCardEl?.dataset.cardId;
    if (tid && tid !== origem.id) {
      targetId = tid;
      toSide = sideTowards(targetCardEl.getBoundingClientRect(), { x: clientX, y: clientY });
    }
  }

  if (targetId && targetId !== origem.id) {
    addArrow(origem.id, targetId, 'solid', origemLado, toSide);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
  }

  clearConnectTargetHighlights();
  ocultarRastroDeConexao();
}

function ocultarRastroDeConexao() {
  connectingFrom = null;
  connectingFromSide = null;
  connectingHandlePos = null;
  draftArrow.hidden = true;
  clearConnectTargetHighlights();
  container?.classList?.remove('is-connecting-arrow');
  if (draftArrow) {
    draftArrow.setAttribute('hidden', '');
    draftArrow.setAttribute('d', '');
    draftArrow.classList.remove('is-snapped');
  }
}

// ── Transformações de Coordenadas Puras (com Cache Durante Arrasto) ───────────
let cachedContainerRect = null;
export function screenToWorld(screenX, screenY, viewport = currentBoard.viewport) {
  const rect = cachedContainerRect || (container ? container.getBoundingClientRect() : { left: 0, top: 0 });
  return _screenToWorld(screenX, screenY, viewport, rect);
}

export function worldToScreen(worldX, worldY, viewport = currentBoard.viewport) {
  const rect = cachedContainerRect || (container ? container.getBoundingClientRect() : { left: 0, top: 0 });
  return _worldToScreen(worldX, worldY, viewport, rect);
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
      const activeUid = localStorage.getItem('quickdock:active-board-uid');
      if (activeUid) {
        board = await getBoardByUid(activeUid);
      }
      if (!board) {
        const all = await loadAllBoards();
        board = all[0] || null;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar quadro do banco:', err);
  }

  if (board) {
    currentBoard = {
      id: board.id,
      uid: board.uid,
      title: board.title || 'Espaço Sem Título',
      pasta: board.pasta || '',
      viewport: board.viewport || { x: 0, y: 0, zoom: 1 },
      bgMode: board.bgMode || 'stars',
      cards: board.cards || [],
      arrows: (board.arrows || []).map(a => ({ ...a, lineStyle: a.lineStyle || 'straight' }))
    };
    try { localStorage.setItem('quickdock:active-board-uid', currentBoard.uid); } catch {}
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
      pasta: '',
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

export async function flushBoardSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    await persistBoard();
  }
}

/** `inicial`: { cards, arrows } de um quadro modelo (sem ele, nasce com um cartão de ideia). */
export async function createBlankBoard(title = 'Novo Espaço', pasta = '', inicial = null) {
  await flushBoardSave();
  const cw = container?.clientWidth || window.innerWidth || 800;
  const ch = container?.clientHeight || window.innerHeight || 600;
  const cx = Math.max(150, cw / 2);
  const cy = Math.max(100, ch / 2 - 50);

  const novo = {
    id: null,
    uid: `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    pasta: pasta || '',
    viewport: { x: cx - 150, y: cy - 70, zoom: 1 },
    bgMode: 'stars',
    cards: inicial?.cards || [
      { id: 'c1', x: 0, y: 0, w: 220, h: 120, text: '💡 Nova Ideia\nEscreva seus pensamentos aqui.', color: 'yellow' }
    ],
    arrows: inicial?.arrows || []
  };

  const id = await saveBoardRecord(novo);
  novo.id = id;
  currentBoard = novo;
  try { localStorage.setItem('quickdock:active-board-uid', currentBoard.uid); } catch {}
  if (titleInput) titleInput.value = currentBoard.title;
  applyViewport();
  updateBgToggleButtons();
  renderCards();
  renderArrows();
  document.dispatchEvent(new CustomEvent('quickdock:board-changed', {
    detail: { id: novo.id, uid: novo.uid, board: novo }
  }));
  return novo;
}

export async function switchBoard(idOrUid) {
  await flushBoardSave();
  let board = null;
  if (typeof idOrUid === 'number') {
    board = await getBoardById(idOrUid);
  } else {
    board = (await getBoardByUid(idOrUid)) || (await getBoardById(Number(idOrUid)));
  }
  if (!board) return false;

  currentBoard = {
    id: board.id,
    uid: board.uid,
    title: board.title || 'Espaço Sem Título',
    pasta: board.pasta || '',
    viewport: board.viewport || { x: 0, y: 0, zoom: 1 },
    bgMode: board.bgMode || 'stars',
    cards: board.cards || [],
    arrows: (board.arrows || []).map(a => ({ ...a, lineStyle: a.lineStyle || 'straight' }))
  };

  try { localStorage.setItem('quickdock:active-board-uid', currentBoard.uid); } catch {}
  if (titleInput) titleInput.value = currentBoard.title;
  applyViewport();
  updateBgToggleButtons();
  renderCards();
  renderArrows();
  return true;
}

// ── Painel do quadro (aside direita do shell) ────────────────────────────────
// Resumo do quadro aberto e ajustes que o painel faz sem tocar nos elementos do motor.
export function getBoardSummary() {
  if (!currentBoard) return null;
  return {
    id: currentBoard.id,
    uid: currentBoard.uid,
    title: currentBoard.title || '',
    pasta: currentBoard.pasta || '',
    bgMode: currentBoard.bgMode || 'stars',
    zoom: currentBoard.viewport?.zoom ?? 1,
    cards: currentBoard.cards?.length ?? 0,
    arrows: currentBoard.arrows?.length ?? 0,
  };
}

export function setBoardBgMode(mode) {
  if (!currentBoard || !['stars', 'dots', 'none'].includes(mode)) return;
  currentBoard.bgMode = mode;
  applyViewport();
  updateBgToggleButtons();
  scheduleSave();
}

/** Leva o zoom para zoom (1 = 100%), em torno do centro da tela; o motor limita o intervalo. */
export function setBoardZoomTo(zoom) {
  if (!currentBoard?.viewport || !container) return;
  zoomBy(zoom / currentBoard.viewport.zoom);
}

export function fitBoardView() {
  if (currentBoard && container) resetZoomAndCenter();
}

// Edita título/pasta de um espaço pelo Explorador. Se for o espaço aberto, altera o
// estado em memória (senão o próximo salvamento sobrescreveria a mudança).
export async function updateBoardMeta(uid, patch) {
  if (currentBoard?.uid === uid) {
    Object.assign(currentBoard, patch);
    if (patch.title !== undefined && titleInput) titleInput.value = patch.title;
    await persistBoard();
    return;
  }
  const board = await getBoardByUid(uid);
  if (!board) return;
  await saveBoardRecord({ ...board, ...patch });
  document.dispatchEvent(new CustomEvent('quickdock:board-changed', { detail: { uid } }));
}

// Exclui um espaço e os arquivos de mídia dos cartões. Se era o aberto, passa pra outro
// (ou cria um novo, pra nunca ficar sem espaço).
export async function removeBoard(uid) {
  const board = await getBoardByUid(uid);
  if (!board) return;
  const eraOAberto = currentBoard?.uid === uid;
  if (eraOAberto) { clearTimeout(saveTimer); saveTimer = null; }

  for (const card of board.cards || []) {
    if ((card.type === 'image' || card.type === 'media') && card.fileId != null) {
      if (card.type === 'media') releaseMediaFile(card.fileId);
      await deleteFile(card.fileId).catch(err => console.warn('Erro ao excluir arquivo do espaço:', err));
    }
  }
  if (board.id != null) await deleteBoardRecord(board.id);
  try {
    if (localStorage.getItem('quickdock:active-board-uid') === uid) localStorage.removeItem('quickdock:active-board-uid');
  } catch {}

  if (eraOAberto) {
    const restantes = await loadAllBoards();
    if (restantes.length > 0) await switchBoard(restantes[0].uid);
    else await createBlankBoard('Espaço Inicial');
  }
  document.dispatchEvent(new CustomEvent('quickdock:board-changed', { detail: { deletedUid: uid } }));
  document.dispatchEvent(new CustomEvent('quickdock:refresh-board-view'));
}
// O app injeta como baixar um arquivo de cartão vindo da sincronização (ver app.js);
// quando chega, o cartão passa a ter fileId local e o quadro é salvo.
export function setBoardFileResolver(resolver) {
  setRemoteFileResolver(resolver, () => { if (currentBoard?.cards) scheduleSave(); });
}

let openBoardListPopover = null;

export function closeBoardListPopover() {
  if (openBoardListPopover) {
    openBoardListPopover.remove();
    openBoardListPopover = null;
  }
}

export async function toggleBoardListPopover(anchor) {
  if (openBoardListPopover) {
    closeBoardListPopover();
    return;
  }

  const allBoards = await loadAllBoards();
  const pop = document.createElement('div');
  pop.className = 'board-list-popover';
  pop.style.cssText = `
    position: fixed;
    z-index: 1000;
    min-width: 220px;
    max-width: 320px;
    background: var(--bg-card, oklch(23.5% 0 0));
    border: 1px solid var(--border, oklch(32.1% 0 0));
    border-radius: 10px;
    box-shadow: 0 10px 30px oklch(0% 0 0 / 0.3);
    padding: 6px;
    font-size: 13px;
    color: var(--text, oklch(94.9% 0 0));
  `;

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px 6px;font-weight:600;font-size:11px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);margin-bottom:4px;';
  head.innerHTML = `<span>Espaços Infinitos</span><span>${allBoards.length}</span>`;
  pop.appendChild(head);

  const list = document.createElement('div');
  list.style.cssText = 'max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;';
  for (const b of allBoards) {
    const item = document.createElement('button');
    item.type = 'button';
    const isCurrent = b.uid === currentBoard?.uid || b.id === currentBoard?.id;
    item.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 6px 8px;
      border-radius: 6px;
      background: ${isCurrent ? 'var(--bg-hover, oklch(100% 0 0 / 0.08))' : 'transparent'};
      border: none;
      color: var(--text);
      cursor: pointer;
      text-align: left;
      font-size: 13px;
    `;
    const label = document.createElement('span');
    label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:' + (isCurrent ? '600' : '400') + ';';
    label.textContent = (b.pasta ? `${b.pasta} / ` : '') + (b.title || 'Sem Título');
    item.appendChild(label);

    if (isCurrent) {
      const mark = document.createElement('span');
      mark.className = 'qd-icon material-symbols-rounded';
      mark.style.cssText = 'font-size:16px;color:var(--accent);';
      mark.textContent = 'check';
      item.appendChild(mark);
    }

    item.addEventListener('click', async () => {
      closeBoardListPopover();
      if (!isCurrent) {
        await switchBoard(b.uid);
      }
    });
    list.appendChild(item);
  }
  pop.appendChild(list);

  const hr = document.createElement('div');
  hr.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
  pop.appendChild(hr);

  const btnNew = document.createElement('button');
  btnNew.type = 'button';
  btnNew.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;border-radius:6px;background:transparent;border:none;color:var(--accent,oklch(62.3% 0.188 259.8));cursor:pointer;font-size:12px;font-weight:500;';
  btnNew.innerHTML = '<span class="qd-icon material-symbols-rounded" style="font-size:16px;">add</span><span>Novo Espaço</span>';
  btnNew.addEventListener('click', async () => {
    closeBoardListPopover();
    const titulo = prompt('Título do novo espaço:', 'Novo Espaço');
    if (titulo !== null) {
      await createBlankBoard(titulo.trim() || 'Novo Espaço');
    }
  });
  pop.appendChild(btnNew);

  if (allBoards.length > 1) {
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;border-radius:6px;background:transparent;border:none;color:var(--danger,oklch(63.7% 0.208 25.3));cursor:pointer;font-size:12px;';
    btnDel.innerHTML = '<span class="qd-icon material-symbols-rounded" style="font-size:16px;">delete</span><span>Excluir este espaço</span>';
    btnDel.addEventListener('click', async () => {
      if (!btnDel.dataset.confirming) {
        btnDel.dataset.confirming = '1';
        btnDel.innerHTML = '<span class="qd-icon material-symbols-rounded" style="font-size:16px;">warning</span><span>Confirmar exclusão?</span>';
        return;
      }
      closeBoardListPopover();
      if (currentBoard.id) {
        await deleteBoardRecord(currentBoard.id);
      }
      document.dispatchEvent(new CustomEvent('quickdock:board-changed', { detail: { deletedUid: currentBoard.uid } }));
      const restantes = await loadAllBoards();
      if (restantes.length > 0) {
        await switchBoard(restantes[0].uid);
      } else {
        await createBlankBoard('Espaço Inicial');
      }
    });
    pop.appendChild(btnDel);
  }

  document.body.appendChild(pop);
  positionPopover(pop, anchor);
  openBoardListPopover = pop;

  setTimeout(() => {
    const onOutside = e => {
      if (!pop.contains(e.target) && !anchor.contains(e.target)) {
        closeBoardListPopover();
        document.removeEventListener('pointerdown', onOutside);
      }
    };
    document.addEventListener('pointerdown', onOutside);
  }, 10);
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
    if (currentBoard.uid) {
      try { localStorage.setItem('quickdock:active-board-uid', currentBoard.uid); } catch {}
    }
    if (saveStatus) {
      saveStatus.innerHTML = '<span class="qd-icon material-symbols-rounded status-icon">check</span> salvo';
    }
    document.dispatchEvent(new CustomEvent('quickdock:board-changed', {
      detail: { id: currentBoard.id, uid: currentBoard.uid, board: currentBoard }
    }));
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
  const next = computeZoomBy(currentBoard.viewport, factor, cx, cy);
  currentBoard.viewport.x = next.x;
  currentBoard.viewport.y = next.y;
  currentBoard.viewport.zoom = next.zoom;
  applyViewport();
  scheduleSave();
}

function resetZoomAndCenter() {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  currentBoard.viewport = computeFitAll(currentBoard.cards, cw, ch);
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

// Cartão de mídia (imagem/vídeo/áudio/link/arquivo) — por URL (`src`) ou por
// arquivo local (`fileId`, Blob na tabela `files`). Ver board/board-media.js.
function addMediaCard(worldX, worldY, data) {
  const tam = MEDIA_DEFAULT_SIZE[data.kind] || { w: 260, h: 160 };
  const card = {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    x: Math.round(worldX - tam.w / 2), y: Math.round(worldY - tam.h / 2),
    w: tam.w, h: tam.h, type: 'media', color: null, ...data,
  };
  currentBoard.cards.push(card);
  renderCards();
  renderArrows();
  scheduleSave();
  return card;
}

function viewCenterWorld() {
  return screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
}

// Texto digitado/colado/arrastado → cartão. false se não for um link http(s).
function addMediaFromUrl(raw, at = viewCenterWorld()) {
  const info = mediaFromUrl(raw);
  if (!info) return false;
  addMediaCard(at.x, at.y, info);
  return true;
}

// Arquivos do computador → um cartão por arquivo, lado a lado.
async function addMediaFromFiles(files, at = viewCenterWorld()) {
  let dx = 0;
  for (const file of files) {
    try {
      const fileId = await saveFile(file, null, { inline: true });
      addMediaCard(at.x + dx, at.y, {
        kind: kindFromFile(file), fileId, mime: file.type || '', name: file.name,
      });
      dx += 40;
    } catch (err) {
      console.warn('Erro ao salvar arquivo no espaço:', err);
    }
  }
}

// Cartão que referencia uma nota já existente — guarda só o `uid`, nunca uma
// cópia do conteúdo, pra não divergir da nota de verdade.
function addNoteCard(worldX, worldY, noteUid) {
  const cardId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  currentBoard.cards.push({
    id: cardId, x: Math.round(worldX), y: Math.round(worldY),
    w: 320, h: 280, type: 'note', noteUid, color: null,
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
  restaurarEdicaoAoVivo();
}

// ── Auto-Alinhamento Inteligente (delegado para board/board-snapping.js) ──────
function computeSnapping(card, rawX, rawY) {
  return _computeSnapping(card, rawX, rawY, currentBoard.cards, selectedCardIds);
}

function renderGuideLines(guideLines) {
  // start: startY, end: endY | start: startX, end: endX | board-guide-dot
  _renderGuideLines(guideLines, guidesGroup, SVG_NS);
}

function clearGuideLines() {
  _clearGuideLines(guidesGroup);
}

// ── Gestão de Seleção Múltipla (Obsidian Canvas Marquee Selection) ────────────
function selectCard(cardId, addToSelection = false) {
  if (!addToSelection) clearSelection();
  selectedCardIds.add(cardId);
  document.querySelector(`[data-card-id="${cardId}"]`)?.classList.add('is-selected');
  updateSelectionToolbar();
}

function selectAllCards() {
  selectedCardIds = new Set(currentBoard.cards.map(c => c.id));
  document.querySelectorAll('.board-card').forEach(el => el.classList.toggle('is-selected', selectedCardIds.has(el.dataset.cardId)));
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
  selectionToolbarEl.innerHTML = _renderSelectionToolbarHtml(count);

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
  _alignCards(cards, type);
  renderCards();
  renderArrows();
  scheduleSave();
}

function groupSelectedCards() {
  const cards = currentBoard.cards.filter(c => selectedCardIds.has(c.id) && c.type !== 'group');
  if (cards.length === 0) return;
  const bounds = _computeGroupBounds(cards);
  if (!bounds) return;
  const groupCard = {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
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
  _batchApplyColor(currentBoard.cards, selectedCardIds, color);
  renderCards();
  scheduleSave();
}

function deleteSelectedCards() {
  const ids = new Set(selectedCardIds);
  if (liveCardId && ids.has(liveCardId)) pararEdicaoAoVivo();
  for (const cardId of ids) {
    const card = currentBoard.cards.find(c => c.id === cardId);
    if ((card?.type === 'image' || card?.type === 'media') && card.fileId != null) {
      if (card.type === 'media') releaseMediaFile(card.fileId);
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

// applyCardColor e NAMED_COLORS delegados para board/board-colors.js
function applyCardColor(el, color) {
  _applyCardColor(el, color);
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

  for (const c of RAINBOW_COLORS) {
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

// ── Painéis da quickbar que dependem dos dados do quadro ──────────────────────
// Vincular nota existente: busca por título e solta o cartão no centro da tela.
function openNoteSearchPanel(anchor) {
  refreshNotesCache().then(() => openQuickbarPanel('note-search', {
    title: 'Vincular nota', icon: 'link', anchor,
    render: (body, api) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Buscar nota pelo título...';
      input.className = 'board-note-search-input';
      const list = document.createElement('div');
      list.className = 'board-note-search-list';
      body.append(input, list);

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
            api.close();
            const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
            addNoteCard(center.x - 160, center.y - 140, nota.uid);
          });
          list.appendChild(item);
        }
      };
      renderList('');
      input.addEventListener('input', () => renderList(input.value));
      input.addEventListener('keydown', e => e.stopPropagation());
      setTimeout(() => input.focus(), 60);
    },
  }));
}

// Cria a nota de verdade pelo painel (sem window.prompt nativo)
async function criarNotaEAdicionar() {
  openQuickbarPanel('note-create', {
    title: 'Criar nota', icon: 'note_add', anchor: document.getElementById('tool-insert'),
    render: (body, api) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'board-popover-input';
      input.placeholder = 'Título da nova nota...';
      const confirmar = document.createElement('button');
      confirmar.type = 'button';
      confirmar.className = 'board-btn board-insert-url-ok';
      confirmar.textContent = 'Criar';
      const linha = document.createElement('div');
      linha.className = 'board-insert-url-row';
      linha.append(input, confirmar);
      body.appendChild(linha);

      const criar = async () => {
        const titulo = input.value.trim();
        if (!titulo) return;
        api.close();
        const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        await createNoteRecord({ title: titulo, uid });
        await refreshNotesCache();
        const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
        addNoteCard(center.x - 160, center.y - 140, uid);
      };
      confirmar.addEventListener('click', criar);
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') criar();
        if (e.key === 'Escape') api.close();
      });
      setTimeout(() => input.focus(), 60);
    },
  });
}
// ── Menu Contextual da Conexão / Seta (Sem alert nem prompt) ───────────────────
function closeArrowPopover() {
  openArrowPopover?.remove();
  openArrowPopover = null;
}

// Marcadores dinâmicos SVG com cor correspondente (corrige SVG marker fill no Chromium)
function getMarkerUrl(color, position = 'end') {
  if (!color || color === 'default') {
    return position === 'start' ? 'url(#arrowhead-start)' : 'url(#arrowhead)';
  }
  const cleanColor = color.replace(/[^a-zA-Z0-9]/g, '');
  const markerId = `arrowhead-${position}-${cleanColor}`;
  const defs = svgLayer?.querySelector('defs') || document.querySelector('#board-svg defs');
  if (defs && !document.getElementById(markerId)) {
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto-start-reverse');
    marker.setAttribute('markerUnits', 'strokeWidth');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 0 0 L 8 3 L 0 6 z');
    path.setAttribute('fill', color);
    marker.appendChild(path);
    defs.appendChild(marker);
  }
  return `url(#${markerId})`;
}

// Fundo vetorial SVG para formas geométricas de fluxogramas (delegado para board/board-shapes.js)
function getShapeSvgBackgroundHtml(shape) {
  return _getShapeSvgBackgroundHtml(shape);
}

function showArrowPopover(e, arrow) {
  const preservedPos = arguments[2] || null;
  const prevLeft = preservedPos?.left ?? openArrowPopover?.style.left;
  const prevTop = preservedPos?.top ?? openArrowPopover?.style.top;

  closeArrowPopover();
  closeColorPopover();
  closeShapePopover();

  const pop = document.createElement('div');
  pop.className = 'board-arrow-popover';
  pop.classList.add('board-theme-scope');

  const dir = arrow.direction || (arrow.bidirectional ? 'bidirectional' : ((arrow.style === 'none' || arrow.strokeStyle === 'none') ? 'none' : 'forward'));
  const lineStyle = arrow.lineStyle || 'straight';
  const strokeStyle = arrow.strokeStyle || (arrow.style !== 'none' && arrow.style ? arrow.style : 'solid');

  pop.innerHTML = `
    <div class="board-popover-title">Conexão</div>
    <input type="text" class="board-popover-input pop-arrow-label" placeholder="Rótulo da conexão..." value="${escHtml(arrow.label || '')}" />
    
    <div class="board-popover-chips">
      <button type="button" class="board-chip-btn" data-chip="Sim">Sim</button>
      <button type="button" class="board-chip-btn" data-chip="Não">Não</button>
      <button type="button" class="board-chip-btn" data-chip="OK">OK</button>
      <button type="button" class="board-chip-btn" data-chip="Erro">Erro</button>
    </div>

    <div class="board-popover-row">
      <span class="board-popover-label">Direção:</span>
      <div class="board-popover-btn-group">
        <button type="button" class="board-popover-btn ${dir === 'forward' ? 'is-active' : ''}" data-dir="forward" title="Unidirecional">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="12" x2="20" y2="12"></line>
            <polyline points="14 6 20 12 14 18"></polyline>
          </svg>
        </button>
        <button type="button" class="board-popover-btn ${dir === 'bidirectional' ? 'is-active' : ''}" data-dir="bidirectional" title="Bidirecional">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="12" x2="20" y2="12"></line>
            <polyline points="9 7 4 12 9 17"></polyline>
            <polyline points="15 7 20 12 15 17"></polyline>
          </svg>
        </button>
        <button type="button" class="board-popover-btn ${dir === 'none' ? 'is-active' : ''}" data-dir="none" title="Sem ponta">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="12" x2="20" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="board-popover-row">
      <span class="board-popover-label">Formato:</span>
      <div class="board-popover-btn-group">
        <button type="button" class="board-popover-btn ${lineStyle === 'straight' ? 'is-active' : ''}" data-line="straight">Reta</button>
        <button type="button" class="board-popover-btn ${lineStyle === 'curved' ? 'is-active' : ''}" data-line="curved">Curva</button>
      </div>
    </div>

    <div class="board-popover-row">
      <span class="board-popover-label">Traço:</span>
      <div class="board-popover-btn-group">
        <button type="button" class="board-popover-btn ${strokeStyle === 'solid' ? 'is-active' : ''}" data-stroke="solid">Sólido</button>
        <button type="button" class="board-popover-btn ${strokeStyle === 'dashed' ? 'is-active' : ''}" data-stroke="dashed">Tracejado</button>
        <button type="button" class="board-popover-btn ${strokeStyle === 'dotted' ? 'is-active' : ''}" data-stroke="dotted">Pontilhado</button>
      </div>
    </div>

    <div class="board-popover-row">
      <span class="board-popover-label">Cor:</span>
      <div class="board-popover-colors">
        <button type="button" class="board-color-swatch is-default ${!arrow.color ? 'is-active' : ''}" data-color="default" title="Padrão"></button>
        ${ARROW_COLORS.map(c => `<button type="button" class="board-color-swatch ${arrow.color === c.value ? 'is-active' : ''}" data-color="${c.value}" style="background:${c.value}" title="${c.name}"></button>`).join('')}
      </div>
    </div>

    <div class="board-popover-row">
      <span class="board-popover-label">Pulse:</span>
      <div class="board-popover-btn-group">
        <button type="button" class="board-popover-btn ${!arrow.pulse ? 'is-active' : ''}" data-pulse="off">Off</button>
        <button type="button" class="board-popover-btn ${arrow.pulse && arrow.pulseShape !== 'star' ? 'is-active' : ''}" data-pulse="circle">● Círculo</button>
        <button type="button" class="board-popover-btn ${arrow.pulse && arrow.pulseShape === 'star' ? 'is-active' : ''}" data-pulse="star">★ Estrela</button>
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

  pop.querySelectorAll('.board-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.label = btn.dataset.chip;
      inputLabel.value = arrow.label;
      renderArrows();
      scheduleSave();
    });
  });

  const getPopPos = () => ({ left: pop.style.left, top: pop.style.top });

  pop.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.direction = btn.dataset.dir;
      arrow.bidirectional = arrow.direction === 'bidirectional';
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow, getPopPos());
    });
  });

  pop.querySelectorAll('[data-line]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.lineStyle = btn.dataset.line;
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow, getPopPos());
    });
  });

  pop.querySelectorAll('[data-stroke]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.strokeStyle = btn.dataset.stroke;
      arrow.style = btn.dataset.stroke;
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow, getPopPos());
    });
  });

  pop.querySelectorAll('[data-pulse]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modo = btn.dataset.pulse;
      arrow.pulse = modo !== 'off';
      if (arrow.pulse) arrow.pulseShape = modo;
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow, getPopPos());
    });
  });

  pop.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      arrow.color = btn.dataset.color === 'default' ? null : btn.dataset.color;
      renderArrows();
      scheduleSave();
      showArrowPopover(e, arrow, getPopPos());
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

  if (prevLeft && prevTop) {
    pop.style.left = prevLeft;
    pop.style.top = prevTop;
  } else {
    const popW = pop.offsetWidth || 320;
    const popH = pop.offsetHeight || 260;
    let left = (e?.clientX ?? (window.innerWidth / 2 - popW / 2)) + 10;
    let top = (e?.clientY ?? (window.innerHeight / 2 - popH / 2)) + 10;
    if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
    if (top + popH > window.innerHeight - 12) top = window.innerHeight - popH - 12;
    pop.style.left = `${Math.max(12, left)}px`;
    pop.style.top = `${Math.max(12, top)}px`;
  }

  openArrowPopover = pop;
  setTimeout(() => inputLabel.focus(), 30);
}

// ── Popovers e Funções para Formas de Fluxograma ──────────────────────────────
function closeShapePopover() {
  openShapePopover?.remove();
  openShapePopover = null;
}

function toggleShapePopover(buttonEl, card, cardEl) {
  if (openShapePopover) {
    closeShapePopover();
    return;
  }
  closeColorPopover();
  closeArrowPopover();

  const pop = document.createElement('div');
  pop.className = 'board-shape-popover board-theme-scope';
  pop.innerHTML = `
    <div class="board-popover-title">Formato da Forma</div>
    <div class="board-shape-grid">
      ${FLOWCHART_SHAPES.map(s => `
        <button type="button" class="board-shape-item ${(card.shape || 'process') === s.id ? 'is-active' : ''}" data-shape="${s.id}" title="${s.desc}">
          <span class="qd-icon material-symbols-rounded">${s.icon}</span>
          <span class="board-shape-item-label">${s.label}</span>
        </button>
      `).join('')}
    </div>
  `;

  pop.querySelectorAll('[data-shape]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const newShape = btn.dataset.shape;
      card.shape = newShape;
      cardEl.dataset.shape = newShape;

      const existingSvg = cardEl.querySelector('.board-card-shape-svg');
      if (existingSvg) existingSvg.remove();
      const svgHtml = getShapeSvgBackgroundHtml(newShape);
      if (svgHtml) {
        cardEl.insertAdjacentHTML('afterbegin', svgHtml);
      }

      const handleEl = cardEl.querySelector('.board-card-handle');
      if (handleEl) handleEl.textContent = cardHandleLabel(card);

      if (newShape === 'decision' && card.w < 150) {
        card.w = 160; card.h = 120;
        cardEl.style.width = `${card.w}px`; cardEl.style.height = `${card.h}px`;
      } else if (newShape === 'terminal' && card.h > 90) {
        card.w = 160; card.h = 80;
        cardEl.style.width = `${card.w}px`; cardEl.style.height = `${card.h}px`;
      }

      renderArrows();
      scheduleSave();
      closeShapePopover();
    });
  });

  pop.addEventListener('pointerdown', ev => ev.stopPropagation());
  document.body.appendChild(pop);

  const rect = buttonEl.getBoundingClientRect();
  const popW = pop.offsetWidth || 240;
  const popH = pop.offsetHeight || 260;
  let left = rect.left - 40;
  let top = rect.bottom + 8;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (left < 12) left = 12;
  if (top + popH > window.innerHeight - 12) top = rect.top - popH - 8;
  if (top < 12) top = 12;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  openShapePopover = pop;
}

function toggleFlowchartPanel(anchor) {
  closeColorPopover();
  closeArrowPopover();
  closeShapePopover();
  toggleQuickbarPanel('flowchart', {
    title: 'Elementos de fluxo', icon: 'shapes', anchor,
    render: body => {
      const grid = document.createElement('div');
      grid.className = 'board-shape-grid';
      grid.innerHTML = FLOWCHART_SHAPES.map(s => `
        <button type="button" class="board-shape-item" data-shape="${s.id}" title="${s.desc}">
          <span class="qd-icon material-symbols-rounded">${s.icon}</span>
          <span class="board-shape-item-label">${s.label}</span>
        </button>
      `).join('');
      grid.querySelectorAll('[data-shape]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          addFlowchartCard(btn.dataset.shape);
          closeQuickbarPanel();
        });
      });
      body.appendChild(grid);
    },
  });
}
function addFlowchartCard(shapeId) {
  const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
  const shapeDef = FLOWCHART_SHAPES.find(s => s.id === shapeId) || FLOWCHART_SHAPES[0];

  let w = 160, h = 90;
  let defaultText = shapeDef.label;
  if (shapeId === 'decision') {
    w = 160; h = 120;
    defaultText = 'Decisão?';
  } else if (shapeId === 'terminal') {
    w = 160; h = 80;
    defaultText = 'Início / Fim';
  } else if (shapeId === 'data') {
    w = 170; h = 90;
    defaultText = 'Entrada / Saída';
  } else if (shapeId === 'document') {
    w = 160; h = 110;
    defaultText = 'Documento';
  } else if (shapeId === 'subprocess') {
    w = 160; h = 90;
    defaultText = 'Subprocesso';
  } else if (shapeId === 'database') {
    w = 150; h = 110;
    defaultText = 'Dados';
  }

  const newCard = {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'text',
    shape: shapeId,
    x: Math.round(center.x - w / 2),
    y: Math.round(center.y - h / 2),
    w,
    h,
    text: defaultText,
    color: null
  };

  currentBoard.cards.push(newCard);
  renderCards();
  renderArrows();
  scheduleSave();

  clearSelection();
  selectCard(newCard.id);

  const el = document.querySelector(`.board-card[data-card-id="${newCard.id}"] .board-card-body`);
  if (el) {
    el.focus();
    if (typeof window.getSelection !== 'undefined' && typeof document.createRange !== 'undefined') {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (openArrowPopover && !openArrowPopover.contains(e.target) && !e.target.closest('.board-arrow-path') && !e.target.closest('.board-arrow-hit-area')) {
      closeArrowPopover();
    }
    if (openShapePopover && !openShapePopover.contains(e.target) && !e.target.closest('.btn-shape')) {
      closeShapePopover();
    }
  }, true);
}

// Rótulo do cabeçalho e HTML do corpo variam por tipo de cartão — texto
// (padrão, cartões antigos sem `type` caem aqui), imagem colada e nota
// vinculada. O corpo de imagem/nota não é editável como texto solto.
function cardHandleLabel(card) {
  if (card.type === 'media') return mediaHandleLabel(card);
  return _getCardHandleLabel(card, FLOWCHART_SHAPES);
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
  // Cabeçalho (ícone + título) e o conteúdo da nota renderizado em blocos, com rolagem
  return `
    <div class="board-card-body board-card-note-body" title="Duplo clique para abrir a nota">
      <div class="board-note-head">
        <span class="qd-icon material-symbols-rounded board-card-note-icon">${escHtml(nota.icon || 'description')}</span>
        <span class="board-card-note-title">${escHtml(nota.title || 'Sem título')}</span>
      </div>
      <div class="board-note-content"></div>
      <div class="board-note-live-host" hidden></div>
    </div>`;
}

// ── Edição ao vivo do cartão de nota ──────────────────────────────────────────
// Duplo clique no cartão passa a editar a nota ali mesmo, com o editor de notas de
// verdade (o editor é emprestado ao cartão; ver board/board-note-live.js). Só no app
// completo (desktop): a página do Espaço em aba cheia continua abrindo a nota.
const LIVE_MIN_W = 340;
const LIVE_MIN_H = 320;

function podeEditarAoVivo() {
  return !!engineOptions.liveNote?.isAvailable();
}

function marcarCartaoAoVivo(cardEl, ligado, nota = null) {
  cardEl.classList.toggle('is-live-note', ligado);
  const content = cardEl.querySelector('.board-note-content');
  const host = cardEl.querySelector('.board-note-live-host');
  if (content) content.hidden = ligado;
  if (host) host.hidden = !ligado;
  const titulo = cardEl.querySelector('.board-card-note-title');
  if (titulo) {
    titulo.contentEditable = ligado ? 'plaintext-only' : 'false';
    titulo.onblur = null;
    titulo.onkeydown = null;
    titulo.onpointerdown = null;
    if (ligado && nota) {
      titulo.onpointerdown = e => e.stopPropagation();
      titulo.onkeydown = e => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); titulo.blur(); }
      };
      titulo.onblur = async () => {
        const novo = titulo.textContent.trim() || 'Sem título';
        titulo.textContent = novo;
        if (novo === nota.title) return;
        nota.title = novo;
        await updateNoteMetaById(nota.id, { title: novo });
        document.dispatchEvent(new CustomEvent('quickdock:note-title-preview', { detail: { noteId: nota.id, title: novo } }));
      };
    }
  }
}

// O editor voltou pro lugar (edição concluída, ou outra coisa tomou o editor de volta)
function aoDevolverEditor() {
  const id = liveCardId;
  liveCardId = null;
  if (!id || !cardsLayer) return;
  const cardEl = cardsLayer.querySelector(`.board-card[data-card-id="${id}"]`);
  if (!cardEl) return;
  marcarCartaoAoVivo(cardEl, false);
  const card = currentBoard.cards.find(c => c.id === id);
  const nota = allNotesCache.find(n => n.uid === card?.noteUid);
  if (nota) hidratarCartaoNota(cardEl, nota);
}

async function iniciarEdicaoAoVivo(card, cardEl, nota) {
  if (!podeEditarAoVivo() || !nota) return false;
  if (liveCardId === card.id) return true;
  if (liveCardId) await pararEdicaoAoVivo();
  const host = cardEl.querySelector('.board-note-live-host');
  if (!host) return false;

  // Cartão de nota antigo é pequeno (220×90): sobraria meia linha de editor. Cresce até caber.
  if (card.w < LIVE_MIN_W || card.h < LIVE_MIN_H) {
    card.w = Math.max(card.w, LIVE_MIN_W);
    card.h = Math.max(card.h, LIVE_MIN_H);
    cardEl.style.width = `${card.w}px`;
    cardEl.style.height = `${card.h}px`;
    renderArrows();
    scheduleSave();
  }

  liveCardId = card.id;
  marcarCartaoAoVivo(cardEl, true, nota);
  const ok = await engineOptions.liveNote.mount(host, nota.id, { onReturned: aoDevolverEditor });
  if (!ok) {
    liveCardId = null;
    marcarCartaoAoVivo(cardEl, false);
    return false;
  }
  document.getElementById('note-editor-blocks')?.focus();
  return true;
}

async function pararEdicaoAoVivo() {
  if (!liveCardId) return;
  await engineOptions.liveNote?.unmount();
  if (liveCardId) aoDevolverEditor();   // garantia: o estado não pode ficar preso
}

// renderCards recria todos os cartões: o editor emprestado vai pro cartão novo; se o
// cartão sumiu (excluído, outro espaço), a edição termina e o editor volta.
function restaurarEdicaoAoVivo() {
  if (!liveCardId) return;
  const cardEl = cardsLayer.querySelector(`.board-card[data-card-id="${liveCardId}"]`);
  const host = cardEl?.querySelector('.board-note-live-host');
  if (cardEl && host && engineOptions.liveNote?.moveTo(host)) {
    const card = currentBoard.cards.find(c => c.id === liveCardId);
    marcarCartaoAoVivo(cardEl, true, allNotesCache.find(n => n.uid === card?.noteUid));
    return;
  }
  pararEdicaoAoVivo();
}

// Preenche o cartão com o conteúdo da nota (somente leitura, mesmo visual do editor).
// Chamado ao criar o cartão e de novo quando as notas mudam.
async function hidratarCartaoNota(cardEl, nota) {
  const alvo = cardEl.querySelector('.board-note-content');
  if (!alvo || !nota || cardEl.classList.contains('is-live-note')) return;
  try {
    const completa = await getNoteById(nota.id);
    const blocos = blocksOfNote(completa);
    if (!alvo.isConnected) return;
    renderNoteBlocks(alvo, blocos, { urlDoArquivo: id => urlDoArquivo(id, loadFileBlob) });
  } catch (err) {
    console.warn('Erro ao renderizar nota no cartão:', err);
  }
}

// Notas editadas/renomeadas/excluídas: atualiza o que cada cartão de nota mostra
let atualizaCartoesNotaTimer = null;
function agendarAtualizacaoDosCartoesDeNota() {
  clearTimeout(atualizaCartoesNotaTimer);
  atualizaCartoesNotaTimer = setTimeout(async () => {
    if (!cardsLayer) return;
    await refreshNotesCache();
    for (const cardEl of cardsLayer.querySelectorAll('.board-card[data-card-type="note"]')) {
      const card = currentBoard.cards.find(c => c.id === cardEl.dataset.cardId);
      const nota = allNotesCache.find(n => n.uid === card?.noteUid);
      if (!nota || cardEl.classList.contains('is-live-note')) continue;
      const titulo = cardEl.querySelector('.board-card-note-title');
      if (titulo) titulo.textContent = nota.title || 'Sem título';
      const icone = cardEl.querySelector('.board-card-note-icon');
      if (icone) icone.textContent = nota.icon || 'description';
      await hidratarCartaoNota(cardEl, nota);
    }
  }, 400);
}

function createCardElement(card) {
  const tipo = card.type || 'text';
  const el = document.createElement('div');
  el.className = 'board-card';
  el.dataset.cardId = card.id;
  el.dataset.cardType = tipo;

  const shape = card.shape || (tipo === 'text' ? 'process' : null);
  if (shape) el.dataset.shape = shape;

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
        : tipo === 'media'
          ? '<div class="board-card-body board-card-media-slot"></div>'
          : `<div class="board-card-body" contenteditable="true" spellcheck="false">${escHtml(card.text || '')}</div>`;

  const colorBtnHtml = tipo === 'note' ? '' :
    '<button class="card-action-btn btn-color" title="Alternar cor" aria-label="Alternar cor">🎨</button>';

  const openBtnHtml = (tipo === 'note' && nota)
    ? '<button class="card-action-btn btn-note-done" title="Concluir edição" aria-label="Concluir edição"><span class="qd-icon material-symbols-rounded" aria-hidden="true">check</span></button>'
      + '<button class="card-action-btn btn-open-note" title="Abrir nota" aria-label="Abrir nota"><span class="qd-icon material-symbols-rounded" aria-hidden="true">open_in_new</span></button>'
    : '';

  const shapeBtnHtml = (tipo === 'text' || !tipo)
    ? '<button class="card-action-btn btn-shape" title="Alterar formato da forma" aria-label="Alterar formato">❖</button>'
    : '';

  const handleHtml = tipo === 'group'
    ? `<span class="board-card-handle board-group-handle" contenteditable="true" spellcheck="false">${escHtml(card.label || 'Grupo')}</span>`
    : `<span class="board-card-handle">${cardHandleLabel(card)}</span>`;

  const shapeSvgHtml = getShapeSvgBackgroundHtml(shape);

  el.innerHTML = `
    ${shapeSvgHtml}
    <div class="board-card-header">
      ${handleHtml}
      <div class="board-card-actions">
        ${openBtnHtml}
        ${shapeBtnHtml}
        ${colorBtnHtml}
        <button class="card-action-btn btn-delete" title="Excluir cartão" aria-label="Excluir cartão">✕</button>
      </div>
    </div>
    ${bodyHtml}
    <div class="board-card-resizer" title="Redimensionar"></div>
    <div class="board-card-connect-handle top" data-handle="top" title="Puxar conexão (Norte)"></div>
    <div class="board-card-connect-handle right" data-handle="right" title="Puxar conexão (Leste)"></div>
    <div class="board-card-connect-handle bottom" data-handle="bottom" title="Puxar conexão (Sul)"></div>
    <div class="board-card-connect-handle left" data-handle="left" title="Puxar conexão (Oeste)"></div>
  `;

  if (tipo === 'media') {
    el.querySelector('.board-card-media-slot').replaceWith(buildMediaBody(card, { loadFileBlob, onMeta: () => scheduleSave() }));
  }

  const bodyEl = el.querySelector('.board-card-body');

  if (tipo === 'text') {
    // Evento de Edição de Texto
    bodyEl.addEventListener('input', () => {
      card.text = bodyEl.innerText;
      scheduleSave();
    });
  } else if (tipo === 'image') {
    const imgEl = bodyEl.querySelector('.board-card-image-el');
    // Imagem vinda de outro aparelho (sync) traz só o caminho: baixa sob demanda
    garantirFileId(card).then(() => {
      if (card.fileId == null) return;
      return loadFileBlob(card.fileId).then(blob => {
        if (!blob || !imgEl.isConnected) return;
        imgEl.src = URL.createObjectURL(blob);
      });
    }).catch(err => console.warn('Erro ao carregar imagem do cartão:', err));  } else if (tipo === 'group') {
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
      if (el.classList.contains('is-live-note')) return;   // já editando: o duplo clique é do texto
      e.stopPropagation();
      if (!nota) return;
      if (podeEditarAoVivo()) iniciarEdicaoAoVivo(card, el, nota);
      else abrirNotaDoQuadro(nota.uid);
    });
    el.querySelector('.btn-open-note')?.addEventListener('click', e => {
      e.stopPropagation();
      if (nota) abrirNotaDoQuadro(nota.uid);
    });
    el.querySelector('.btn-note-done')?.addEventListener('click', e => {
      e.stopPropagation();
      pararEdicaoAoVivo();
    });
    hidratarCartaoNota(el, nota);
  }

  // Alterar Formato de Forma de Fluxograma
  const btnShape = el.querySelector('.btn-shape');
  btnShape?.addEventListener('click', e => {
    e.stopPropagation();
    toggleShapePopover(btnShape, card, el);
  });

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
    if (connectingFrom) return;
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
    if (connectingFrom) return;
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
    if (connectingFrom) return;
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
    if (connectingFrom) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    resizerEl.setPointerCapture(e.pointerId);
    cachedContainerRect = container.getBoundingClientRect();
    resizingCard = card;
    resizeStart = { x: e.clientX, y: e.clientY, w: card.w, h: card.h };
  });

  resizerEl.addEventListener('pointermove', e => {
    if (connectingFrom) return;
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

  // Puxar Conexão / Seta (Obsidian Canvas Arrow Dragging com Snap Magnético)
  el.querySelectorAll('.board-card-connect-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      cachedContainerRect = container.getBoundingClientRect();
      connectingFrom = card;
      connectingFromSide = handle.dataset.handle;
      container?.classList?.add('is-connecting-arrow');
      const rect = handle.getBoundingClientRect();
      connectingHandlePos = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (draftArrow) {
        draftArrow.removeAttribute('hidden');
        draftArrow.setAttribute('marker-end', 'url(#arrowhead)');
      }
    });

    handle.addEventListener('pointermove', e => {
      if (!connectingFrom) return;
      updateConnectingArrow(e.clientX, e.clientY);
    });

    handle.addEventListener('pointerup', e => {
      if (!connectingFrom) return;
      finishConnectingArrow(e.clientX, e.clientY);
    });
  });

  return el;
}

function deleteCard(cardId) {
  if (liveCardId === cardId) pararEdicaoAoVivo();
  // Cartão de imagem guarda o Blob à parte, na tabela `files` — sem isso ele
  // ficaria órfão no banco pra sempre, sem nenhum cartão apontando pra ele.
  const card = currentBoard.cards.find(c => c.id === cardId);
  if (card?.type === 'image' && card.fileId != null) {
    deleteFile(card.fileId).catch(err => console.warn('Erro ao excluir arquivo do cartão:', err));
  }
  if (card?.type === 'media' && card.fileId != null) {
    releaseMediaFile(card.fileId);
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
    strokeStyle: options.strokeStyle || options.style || style || 'solid',
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

// Ponto ao longo de um dos 4 lados do retângulo nos pontos cardeais estritos
// (Norte, Sul, Leste, Oeste). frac é fixado em 0.5 para conexões perfeitamente retas.
function sidePointAt(rect, side, frac = 0.5) {
  switch (side) {
    case 'top':    return { x: (rect.left + rect.right) / 2, y: rect.top };
    case 'bottom': return { x: (rect.left + rect.right) / 2, y: rect.bottom };
    case 'left':   return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
    case 'right':  return { x: rect.right, y: (rect.top + rect.bottom) / 2 };
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

// ── Roteamento ortogonal inteligente (delegado para board/board-arrows.js) ──
function getOrthogonalWaypoints(p1, p2, fromSide, toSide, r1, r2) {
  // Caso 1: Lados iguais (ex: fromSide === 'right' && toSide === 'right')
  return _getOrthogonalWaypoints(p1, p2, fromSide, toSide, r1, r2);
}

function waypointsToSvgPath(points, radius = 12) {
  return _waypointsToSvgPath(points, radius);
}

function waypointPathMidpoint(points) {
  return _waypointPathMidpoint(points);
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
      removeArrowPulse(dom);
      arrowDomMap.delete(id);
    }
  }

  // Passo 2: Todos os pontos de conexão saem e entram estritamente nos pontos cardeais (N/S/L/O)
  for (const item of resolved) {
    item.fracFrom = 0.5;
    item.fracTo = 0.5;
  }

  // Passo 3: desenha no SVG em coordenadas do mundo (Zero Jitter e Zero Delay!)
  for (const { arrow, r1, r2, fromSide, toSide } of resolved) {
    const p1 = sidePointAt(r1, fromSide, 0.5);
    const p2 = sidePointAt(r2, toSide, 0.5);

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
      // Os listeners nascem uma vez por seta, mas o quadro é recarregado (troca
      // de view/quadro) com objetos novos — o `arrow` capturado aqui ficaria
      // velho e o popover editaria uma cópia que ninguém renderiza.
      showArrowPopover(e, currentBoard.arrows.find(a => a.id === arrow.id) || arrow);
    };

    function syncArrowStyles(dom) {
      dom.hitArea.setAttribute('d', pathD);
      dom.path.setAttribute('d', pathD);

      const dir = arrow.direction || (arrow.bidirectional ? 'bidirectional' : ((arrow.style === 'none' || arrow.strokeStyle === 'none') ? 'none' : 'forward'));
      if (dir === 'bidirectional') {
        dom.path.setAttribute('marker-start', getMarkerUrl(arrow.color, 'start'));
        dom.path.setAttribute('marker-end', getMarkerUrl(arrow.color, 'end'));
      } else if (dir === 'forward') {
        dom.path.removeAttribute('marker-start');
        dom.path.setAttribute('marker-end', getMarkerUrl(arrow.color, 'end'));
      } else if (dir === 'backward') {
        dom.path.setAttribute('marker-start', getMarkerUrl(arrow.color, 'start'));
        dom.path.removeAttribute('marker-end');
      } else {
        dom.path.removeAttribute('marker-start');
        dom.path.removeAttribute('marker-end');
      }

      const strokeStyle = arrow.strokeStyle || (arrow.style !== 'none' && arrow.style ? arrow.style : 'solid');
      if (strokeStyle === 'dashed') {
        dom.path.setAttribute('stroke-dasharray', '8 6');
        dom.path.style.strokeLinecap = 'butt';
      } else if (strokeStyle === 'dotted') {
        dom.path.setAttribute('stroke-dasharray', '2 6');
        dom.path.style.strokeLinecap = 'round';
      } else {
        dom.path.removeAttribute('stroke-dasharray');
        dom.path.style.strokeLinecap = 'round';
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

      syncArrowPulse(dom, arrow, pathD, arrowsGroup);
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
  updatePulseButton();
}

// ── Eventos de Mouse e Teclado ────────────────────────────────────────────────
function setupEventListeners(getEl) {
  document.addEventListener('quickdock:notes-changed', agendarAtualizacaoDosCartoesDeNota);

  // Clicar no resto do quadro (fundo, outros cartões, barras) conclui a edição ao vivo.
  // Menus e popups do editor ficam fora do #board-container, então não contam.
  document.addEventListener('pointerdown', e => {
    if (!liveCardId) return;
    const cartaoAoVivo = cardsLayer?.querySelector(`.board-card[data-card-id="${liveCardId}"]`);
    if (cartaoAoVivo?.contains(e.target)) return;
    if (!e.target.closest?.('#board-container, #board-quickbar, #board-zoom-dock, .board-selection-toolbar')) return;
    pararEdicaoAoVivo();
  }, true);
  document.addEventListener('quickdock:view-changed', e => {
    if (liveCardId && e.detail?.view !== 'board') pararEdicaoAoVivo();
  });

  // Título do Espaço
  titleInput?.addEventListener('input', () => {
    currentBoard.title = titleInput.value.trim() || 'Espaço Sem Título';
    scheduleSave();
  });

  // Alternador de Espaços
  const switcherBtn = getEl('btn-board-switcher');
  switcherBtn?.addEventListener('click', e => {
    e.stopPropagation();
    toggleBoardListPopover(switcherBtn);
  });

  // Ferramentas da Barra
  getEl('tool-card')?.addEventListener('click', () => {
    const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
    addCard(center.x - 110, center.y - 65);
    setTool('select');
  });

  // Ferramenta de Fluxograma (Abre popover de formas de fluxo)
  getEl('tool-flowchart')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleFlowchartPanel(e.currentTarget);
  });

  // Inserir: link/vídeo/áudio/imagem por URL, arquivo local, nota existente
  // ou nota nova — tudo num painel só (ver board/board-insert-panel.js).
  const fileInput = getEl('board-image-upload-input');
  if (fileInput) {
    fileInput.multiple = true;
    fileInput.accept = MEDIA_FILE_ACCEPT;
  }
  getEl('tool-insert')?.addEventListener('click', e => {
    e.stopPropagation();
    const anchor = e.currentTarget;
    toggleQuickbarPanel('insert', {
      title: 'Adicionar ao espaço', icon: 'add_photo_alternate', anchor,
      render: (body, api) => renderInsertPanel(body, api, {
        onAddUrl: url => addMediaFromUrl(url),
        onPickFile: () => fileInput?.click(),
        onLinkNote: () => openNoteSearchPanel(anchor),
        onCreateNote: criarNotaEAdicionar,
      }),
    });
  });
  fileInput?.addEventListener('change', async () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    if (files.length) await addMediaFromFiles(files);
  });

  // Organizar fluxo (beautify) e Pulse
  getEl('tool-beautify')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleQuickbarPanel('beautify', {
      title: 'Organizar fluxo', icon: 'auto_fix_high', anchor: e.currentTarget,
      render: (body, api) => renderBeautifyPanel(body, api, {
        scopeLabel: beautifyScope().usarSelecao ? 'seleção' : 'todo o espaço',
        onApply: applyBeautify,
      }),
    });
  });
  getEl('tool-pulse')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleQuickbarPanel('pulse', {
      title: 'Pulse do fluxo', icon: 'radio_button_checked', anchor: e.currentTarget,
      render: body => renderPulsePanel(body, {
        getArrows: pulseScopeArrows,
        scopeLabel: () => (selectedCardIds.size > 0 ? 'seleção' : 'todo o espaço'),
        onChange: () => { renderArrows(); scheduleSave(); updatePulseButton(); },
      }),
    });
  });
  // Ferramenta de Grupo (Obsidian Canvas Group)
  getEl('tool-group')?.addEventListener('click', () => {
    const center = screenToWorld(container.clientWidth / 2, container.clientHeight / 2);
    addGroupCard(center.x - 190, center.y - 130);
    setTool('select');
  });

  // Drag & Drop de arquivos de imagem diretamente no Canvas
  container.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files') || e.dataTransfer?.types?.includes('text/uri-list')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  // Soltar: arquivos (imagem, vídeo, áudio, pdf…) ou um link arrastado do navegador
  container.addEventListener('drop', async e => {
    const files = [...(e.dataTransfer?.files || [])];
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      await addMediaFromFiles(files, worldPos);
      return;
    }
    const link = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split('\n')[0];
    if (link && addMediaFromUrl(link, worldPos)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Colar Imagem — mesmo mecanismo dos anexos de nota (Blob na tabela
  // `files` do Dexie, nunca base64 solto no JSON do quadro), só que aqui
  // sempre vira um cartão de imagem novo em vez de um bloco dentro do texto.
  window.addEventListener('paste', async e => {
    if (rootSectionEl?.hidden) return;
    const item = [...(e.clipboardData?.items ?? [])].find(it => it.type.startsWith('image/'));
    if (!item) {
      // Link colado (fora de qualquer campo de texto) vira cartão de mídia
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      const texto = (e.clipboardData?.getData('text/plain') || '').trim();
      if (texto && addMediaFromUrl(texto)) e.preventDefault();
      return;
    }
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

  // Rede de segurança: se soltar fora do handle (ex.: fora da janela), finaliza a conexão
  window.addEventListener('pointerup', e => {
    if (connectingFrom) {
      finishConnectingArrow(e.clientX, e.clientY);
      ocultarRastroDeConexao();
    }
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
    if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    // Com outra view em foco (mosaico do desktop), o atalho é dela, não do quadro
    const emFoco = document.querySelector('.main-section.is-focused');
    if (rootSectionEl && emFoco && emFoco !== rootSectionEl) return;

    // Ctrl/Cmd+A seleciona os cartões do quadro, não a página inteira
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      selectAllCards();
      return;
    }
    // Demais atalhos são de uma tecla só: Ctrl+C/V (copiar/colar) não podem criar cartão
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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

// ── Organizar (beautify) ──────────────────────────────────────────────────────
// Com 2+ cartões selecionados organiza só a seleção; senão, o espaço inteiro.
// As posições novas são aplicadas direto nos cartões e as setas ganham lados
// de entrada/saída coerentes com a direção (ver board/board-beautify.js).
function beautifyScope() {
  const sel = currentBoard.cards.filter(c => selectedCardIds.has(c.id) && c.type !== 'group');
  const usarSelecao = sel.length >= 2;
  const cards = usarSelecao ? sel : currentBoard.cards.filter(c => c.type !== 'group');
  return { cards, usarSelecao };
}

function applyBeautify(direction) {
  const { cards, usarSelecao } = beautifyScope();
  if (cards.length < 2) return;
  const ids = new Set(cards.map(c => c.id));
  const arrows = currentBoard.arrows.filter(a => ids.has(a.from) && ids.has(a.to));
  const { positions, sides } = computeBeautifyLayout(cards, arrows, direction);

  for (const card of cards) {
    const p = positions.get(card.id);
    if (p) { card.x = p.x; card.y = p.y; }
  }
  for (const arrow of arrows) {
    const s = sides.get(arrow.id);
    if (s) { arrow.fromSide = s.fromSide; arrow.toSide = s.toSide; }
  }

  renderCards();
  renderArrows();
  scheduleSave();
  if (!usarSelecao) resetZoomAndCenter();
}

// ── Pulse ─────────────────────────────────────────────────────────────────────
// Escopo: setas ligadas à seleção (se houver) ou todas as do espaço.
function pulseScopeArrows() {
  if (selectedCardIds.size === 0) return currentBoard.arrows;
  return currentBoard.arrows.filter(a => selectedCardIds.has(a.from) || selectedCardIds.has(a.to));
}

function updatePulseButton() {
  const btn = document.getElementById('tool-pulse');
  if (!btn) return;
  btn.classList.toggle('is-on', currentBoard.arrows.some(a => a.pulse));
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
  if (e.button === 1 || (e.button === 0 && _isCanvasBackgroundTarget(e.target, container, svgLayer, guidesGroup, arrowsGroup))) {
    isPanning = true;
    startPanX = e.clientX;
    startPanY = e.clientY;
    container.classList.add('is-panning');
    container.setPointerCapture(e.pointerId);
  }
}

function onContainerPointerMove(e) {
  // Live Draft Arrow: rastro tracejado ao vivo apontando para a posição do cursor com snap magnético
  if (connectingFrom && connectingHandlePos && draftArrow) {
    updateConnectingArrow(e.clientX, e.clientY);
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
    const bounds = _computeMarqueeBounds(boxStartWorld, currWorld);
    _updateMarqueeBoxElement(selectionBoxEl, bounds);

    const intersectingIds = new Set(_getCardsIntersectingBox(currentBoard.cards, bounds));
    for (const card of currentBoard.cards) {
      const cardEl = document.querySelector(`[data-card-id="${card.id}"]`);
      if (intersectingIds.has(card.id)) {
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
    finishConnectingArrow(e.clientX, e.clientY);
  }

  if (isBoxSelecting) {
    isBoxSelecting = false;
    isMobileSelectionMode = false;
    _resetMarqueeBoxElement(selectionBoxEl);
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
    }
    scheduleSave();
  }
}

function onContainerWheel(e) {
  // Sobre o conteúdo de um cartão de nota que tem rolagem, a roda rola a nota (Ctrl+roda ainda dá zoom)
  const rolavel = !e.ctrlKey && e.target.closest?.('.board-note-content, .board-note-live-host');
  if (rolavel && rolavel.scrollHeight > rolavel.clientHeight + 1) return;
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
