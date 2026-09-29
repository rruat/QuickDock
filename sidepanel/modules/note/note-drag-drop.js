// ── note-drag-drop.js ────────────────────────────────────────────────────────
// Controles de bloco flutuantes (＋ e ⠿), menu de opções do bloco,
// arrastar para reordenar, arrastar com Ctrl para seleção múltipla e
// suporte a gestos de toque (touch / pointer: coarse).

import { iconSvg } from '../icons.js';
import { positionMenu } from '../note-detection.js';
import { blockTemplates, openSaveBlockTemplate } from '../templates.js';
import { blocksToMarkdown, blocksToPlainText } from '../blocks.js';
import { blocksToExportMarkdown } from '../note.js';
import { copyBlocksAsImage, downloadBlocksAsImage } from '../snapshot.js';

let _callbacks = {
  getRoot: () => null,
  getNoteEditorEl: () => null,
  getNoteSection: () => null,
  captureUndoPoint: () => {},
  scheduleSave: () => {},
  renumberLists: () => {},
  showFeedback: () => {},
  currentBlock: () => null,
  getLastFocusedBlock: () => null,
  getContentEl: (el) => el,
  createBlockEl: (type) => null,
  createBlockElFrom: (data) => null,
  convertBlockType: (block, type, checked) => null,
  serializeBlockEl: (el) => ({}),
  focusBlockStart: (block) => {},
  openSlashMenuForBlock: (block) => {},
  insertTemplateBlocks: (markdown, atBlock) => {},
  updateMobileToolbarState: () => {},
  isEventInsideMobileToolbar: (target) => false,
  closeCopyMenu: () => {},
  isBlockUnderlined: (block) => false,
  setBlockUnderlined: (block, val) => {},
  PODE_SUBLINHAR: new Set(['heading1', 'heading2']),
  NO_TEXT_TYPES: new Set(['divider', 'table', 'image', 'audio', 'video']),
  INSERTED_TYPES: new Set(['divider', 'table', 'image', 'base']),
  SLASH_ITEMS: [],
  buildTypeGrid: (items, cb) => document.createElement('div'),
};

// ── Seleção múltipla de blocos ────────────────────────────────────────────────
let selectedBlockIds    = new Set();
let lastHandleClickedId = null;
let selecaoEspelhada    = false;   // a seleção de blocos nasceu de uma seleção de texto
let isBlockSelectActive = false;   // modo de seleção explícito ativo no mobile

export function getSelectedBlockIds() { return selectedBlockIds; }
export function getIsBlockSelectActive() { return isBlockSelectActive; }
export function setIsBlockSelectActive(v) { isBlockSelectActive = v; }
export function getLastHandleClickedId() { return lastHandleClickedId; }
export function setLastHandleClickedId(id) { lastHandleClickedId = id; }
export function isSelecaoEspelhada() { return selecaoEspelhada; }
export function setSelecaoEspelhada(v) { selecaoEspelhada = v; }
export function isGestureActive() { return Boolean(pointerDown || ctrlPointerDown || reorderState); }

export function findBlockById(id) {
  const root = _callbacks.getRoot();
  if (!root) return null;
  return [...root.children].find(el => el.classList?.contains('block') && el.dataset.id === id) || null;
}

export function orderedBlocks() {
  const root = _callbacks.getRoot();
  if (!root) return [];
  return [...root.children].filter(el => el.classList?.contains('block'));
}

export function setBlockSelection(ids) {
  const root = _callbacks.getRoot();
  if (!root) return;
  root.querySelectorAll('.block.block-selected').forEach(b => b.classList.remove('block-selected'));
  selectedBlockIds = new Set(ids);
  for (const b of orderedBlocks()) {
    if (selectedBlockIds.has(b.dataset.id)) b.classList.add('block-selected');
  }
  root.classList.toggle('blocks-selected', selectedBlockIds.size > 1);
  _callbacks.updateMobileToolbarState();
}

export function clearBlockSelection() {
  isBlockSelectActive = false;
  setBlockSelection([]);
  lastHandleClickedId = null;
  selecaoEspelhada = false;
  const noteSection = _callbacks.getNoteSection();
  if (noteSection) noteSection.classList.remove('touch-selection-active');
}

export function selectBlockRange(fromBlock, toBlock) {
  const all = orderedBlocks();
  const a = all.indexOf(fromBlock), b = all.indexOf(toBlock);
  if (a === -1 || b === -1) return;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  setBlockSelection(all.slice(lo, hi + 1).map(el => el.dataset.id));
}

export function targetBlocksFor(block) {
  if (selectedBlockIds.size > 1 && selectedBlockIds.has(block.dataset.id)) {
    return orderedBlocks().filter(el => selectedBlockIds.has(el.dataset.id));
  }
  return [block];
}

export function getSelectedBlockElements() {
  if (selectedBlockIds.size > 0) {
    return orderedBlocks().filter(b => selectedBlockIds.has(b.dataset.id));
  }
  const curr = _callbacks.currentBlock() || _callbacks.getLastFocusedBlock();
  return curr ? [curr] : [];
}

// ── Controles de bloco ao passar o mouse (＋ / ⠿) ─────────────────────────────
let blockControls = null;
let blockAddBtn = null;
let blockHandleBtn = null;
let hoveredBlock = null;

let blockMenuEl = null;
let blockMenuBackdropEl = null;

let pointerDown     = null; // { block, startX, startY, ctrl, moved }
let reorderState    = null; // { targets, indicator, dropTarget, dropBefore }
let rangeSelectState = null; // { anchorBlock }
let ctrlPointerDown = null; // { startX, startY, moved, anchorBlock }

let touchDragTimer = null;
let touchDragState = null; // { block, startX, startY, moved, dragging }

export function hideBlockControls() {
  if (blockControls) blockControls.hidden = true;
  hoveredBlock = null;
}

let noteEditorEl = null;
let root = null;

export function positionBlockControls(block) {
  if (typeof document !== 'undefined' && document?.documentElement?.dataset?.platform === 'mobile') {
    blockControls.hidden = true;
    return;
  }
  hoveredBlock = block;

  const blockRect     = block.getBoundingClientRect();
  const containerRect = noteEditorEl.getBoundingClientRect();
  const viewRect      = root.getBoundingClientRect();   // área visível do editor (ele rola)

  // Bloco rolou pra fora da vista: esconde, em vez de deixar os ícones
  // encostados na borda apontando pra nada.
  if (blockRect.bottom < viewRect.top || blockRect.top > viewRect.bottom) {
    blockControls.hidden = true;
    return;
  }

  blockControls.hidden = false;   // precisa estar visível pra poder ser medido

  // Horizontal: os ícones acompanham a indentação do bloco. Com um `left`
  // fixo, um item aninhado ganhava ícones lá na margem esquerda, longe do
  // bloco a que se referem — e dois blocos de níveis diferentes ficavam
  // indistinguíveis, já que a escolha do bloco é só pela altura do cursor.
  const largura = blockControls.offsetWidth || 31;
  const left = Math.max(0, blockRect.left - containerRect.left - largura + 1);

  // Vertical: alinhado com a primeira linha do bloco, mas preso dentro da
  // área visível. Um bloco alto (imagem) costuma ter o topo fora da tela, e
  // sem o limite os ícones subiam por cima da barra de abas.
  const topoVisivel = viewRect.top - containerRect.top;
  const baseVisivel = viewRect.bottom - containerRect.top - blockControls.offsetHeight;
  const top = Math.min(
    Math.max(blockRect.top - containerRect.top, topoVisivel),
    Math.max(topoVisivel, baseVisivel),
  );

  blockControls.style.left = `${left}px`;
  blockControls.style.top  = `${top}px`;
}


function blockNearestToY(y, exclude = []) {
  let closest = null, closestDist = Infinity;
  for (const b of orderedBlocks()) {
    if (exclude.includes(b)) continue;
    const rect = b.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) return b;
    const dist = y < rect.top ? rect.top - y : y - rect.bottom;
    if (dist < closestDist) { closestDist = dist; closest = b; }
  }
  return closest;
}

function closeBlockMenuBackdrop() {
  blockMenuBackdropEl?.remove();
  blockMenuBackdropEl = null;
}

export function closeBlockMenu() {
  closeBlockMenuBackdrop();
  blockMenuEl?.remove();
  blockMenuEl = null;
}

function getTransformTypes() {
  return _callbacks.SLASH_ITEMS.filter(it => !_callbacks.INSERTED_TYPES.has(it.type));
}

export function openBlockMenu(block, anchorEl) {
  closeBlockMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu block-menu';

  const isMobile = document.documentElement.dataset.platform === 'mobile';
  if (isMobile) {
    menu.classList.add('is-bottom-sheet');
    blockMenuBackdropEl = document.createElement('div');
    blockMenuBackdropEl.className = 'bottom-sheet-backdrop';
    blockMenuBackdropEl.addEventListener('click', closeBlockMenu);
    document.body.appendChild(blockMenuBackdropEl);

    const pill = document.createElement('div');
    pill.className = 'bottom-sheet-drag-pill';
    const head = document.createElement('div');
    head.className = 'bottom-sheet-header';
    head.innerHTML = `<span class="bottom-sheet-title">Opções do bloco</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn bottom-sheet-close';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Fechar';
    closeBtn.setAttribute('aria-label', 'Fechar opções do bloco');
    closeBtn.addEventListener('click', closeBlockMenu);
    head.appendChild(closeBtn);
    menu.prepend(pill, head);
  }

  const scopeCount = (selectedBlockIds.size > 1 && selectedBlockIds.has(block.dataset.id))
    ? selectedBlockIds.size : 1;

  const barra = document.createElement('div');
  barra.className = 'block-menu-quickbar';

  const acaoRapida = (icone, titulo, run, extra = '') => {
    const btn = document.createElement('button');
    btn.className = `block-menu-quick ${extra}`.trim();
    btn.title = scopeCount > 1 ? `${titulo} (${scopeCount} blocos)` : titulo;
    btn.innerHTML = iconSvg(icone);
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); closeBlockMenu(); run(); });
    barra.appendChild(btn);
  };

  acaoRapida('content_copy', 'Copiar como texto', () => copyBlocksAs(block, 'text'));
  acaoRapida('image',        'Copiar imagem',     () => printBlocks(block, 'clipboard'));
  acaoRapida('library_add',  'Duplicar',          () => duplicateBlocks(block));
  acaoRapida('delete',       'Excluir',           () => deleteBlocksOrOne(block), 'is-danger');

  menu.appendChild(barra);

  const canTransform = !_callbacks.INSERTED_TYPES.has(block.dataset.type);

  if (canTransform) {
    const header = document.createElement('div');
    header.className   = 'copy-menu-header';
    header.textContent = scopeCount > 1 ? `Transformar em (${scopeCount} blocos)` : 'Transformar em';
    menu.appendChild(header);

    const tipos = getTransformTypes();
    menu.appendChild(_callbacks.buildTypeGrid(tipos, i => {
      closeBlockMenu();
      transformBlocks(block, tipos[i].type);
    }));

    menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  }

  if (_callbacks.PODE_SUBLINHAR.has(block.dataset.type)) {
    const sublinhado = _callbacks.isBlockUnderlined(block);
    const btn = document.createElement('button');
    btn.className = 'copy-opt';
    btn.innerHTML = `<span class="copy-opt-value">${sublinhado ? 'Tirar sublinhado' : 'Sublinhar título'}</span><span class="copy-opt-hint">${sublinhado ? '#' : '==='}</span>`;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.stopPropagation();
      closeBlockMenu();
      _callbacks.captureUndoPoint();
      for (const b of targetBlocksFor(block)) _callbacks.setBlockUnderlined(b, !sublinhado);
      _callbacks.scheduleSave();
    });
    menu.appendChild(btn);

    menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  }

  const tpls = blockTemplates();
  if (tpls.length > 0) {
    const tplHead = document.createElement('div');
    tplHead.className = 'copy-menu-header';
    tplHead.textContent = 'Inserir modelo';
    menu.appendChild(tplHead);

    for (const tpl of tpls) {
      const btn = document.createElement('button');
      btn.className = 'copy-opt';
      const span = document.createElement('span');
      span.className = 'copy-opt-value';
      span.textContent = tpl.name;
      btn.appendChild(span);
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('click', () => {
        closeBlockMenu();
        _callbacks.captureUndoPoint();
        _callbacks.insertTemplateBlocks(tpl.content, block);
      });
      menu.appendChild(btn);
    }

    menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  }

  const saveTplBtn = document.createElement('button');
  saveTplBtn.className = 'copy-opt';
  saveTplBtn.innerHTML = `<span class="copy-opt-value">Salvar como modelo de bloco${scopeCount > 1 ? ` (${scopeCount})` : ''}</span>`;
  saveTplBtn.addEventListener('mousedown', e => e.stopPropagation());
  saveTplBtn.addEventListener('click', () => {
    closeBlockMenu();
    const markdown = blocksToMarkdown(targetBlocksFor(block).map(_callbacks.serializeBlockEl));
    if (!markdown.trim()) { _callbacks.showFeedback('Nada para salvar'); return; }
    openSaveBlockTemplate(anchorEl, markdown, nome => _callbacks.showFeedback(`modelo "${nome}" salvo`));
  });
  menu.appendChild(saveTplBtn);

  const copyMdBtn = document.createElement('button');
  copyMdBtn.className = 'copy-opt';
  copyMdBtn.innerHTML = `<span class="copy-opt-value">Copiar como Markdown${scopeCount > 1 ? ` (${scopeCount})` : ''}</span>`;
  copyMdBtn.addEventListener('mousedown', e => e.stopPropagation());
  copyMdBtn.addEventListener('click', () => { closeBlockMenu(); copyBlocksAs(block, 'markdown'); });
  menu.appendChild(copyMdBtn);

  const saveImgBtn = document.createElement('button');
  saveImgBtn.className = 'copy-opt';
  saveImgBtn.innerHTML = `<span class="copy-opt-value">Baixar imagem (.png)${scopeCount > 1 ? ` (${scopeCount})` : ''}</span>`;
  saveImgBtn.addEventListener('mousedown', e => e.stopPropagation());
  saveImgBtn.addEventListener('click', () => { closeBlockMenu(); printBlocks(block, 'download'); });
  menu.appendChild(saveImgBtn);

  document.body.appendChild(menu);
  blockMenuEl = menu;
  if (!isMobile) {
    positionMenu(menu, anchorEl.getBoundingClientRect());
  }
}

export async function printBlocks(block, destino) {
  const alvos = targetBlocksFor(block);
  if (alvos.length === 0) return;

  clearBlockSelection();
  hideBlockControls();
  _callbacks.closeCopyMenu();

  const nome = alvos
    .filter(b => !_callbacks.NO_TEXT_TYPES.has(b.dataset.type))
    .map(b => _callbacks.getContentEl(b).textContent.trim())
    .find(Boolean) ?? 'nota';

  _callbacks.showFeedback('gerando imagem…');
  try {
    const ok = destino === 'clipboard'
      ? await copyBlocksAsImage(alvos)
      : await downloadBlocksAsImage(alvos, nome);
    _callbacks.showFeedback(ok
      ? (destino === 'clipboard' ? 'imagem copiada!' : 'imagem baixada!')
      : 'não deu pra gerar a imagem');
  } catch {
    _callbacks.showFeedback(destino === 'clipboard'
      ? 'não deu pra copiar — tente "Baixar imagem"'
      : 'não deu pra gerar a imagem');
  }
}

async function copyBlocksAs(block, format) {
  const targets = targetBlocksFor(block).map(_callbacks.serializeBlockEl);
  const text = format === 'markdown'
    ? await blocksToExportMarkdown(targets)
    : blocksToPlainText(targets);
  await navigator.clipboard.writeText(text);
  _callbacks.showFeedback('copiado!');
}

export function transformBlocks(block, type) {
  const targets = targetBlocksFor(block).filter(b => !_callbacks.INSERTED_TYPES.has(b.dataset.type));
  if (targets.length === 0) return;

  _callbacks.captureUndoPoint();
  const converted = targets.map(b => _callbacks.convertBlockType(b, type, b.dataset.checked === 'true'));
  _callbacks.renumberLists();
  clearBlockSelection();
  hideBlockControls();
  const lastContent = _callbacks.getContentEl(converted[converted.length - 1]);
  lastContent.focus();
  lastContent.selectionStart = lastContent.textContent.length;
  _callbacks.scheduleSave();
}

function duplicateBlocks(block) {
  const targets = targetBlocksFor(block);
  _callbacks.captureUndoPoint();
  let anchor = targets[targets.length - 1];
  for (const b of targets) {
    const clone = _callbacks.createBlockElFrom({ ..._callbacks.serializeBlockEl(b), id: null });
    anchor.after(clone);
    anchor = clone;
  }
  _callbacks.renumberLists();
  clearBlockSelection();
  hideBlockControls();
  _callbacks.scheduleSave();
}

export function deleteBlocksOrOne(block) {
  const targets = targetBlocksFor(block);
  _callbacks.captureUndoPoint();

  const root = _callbacks.getRoot();
  const prev = targets[0].previousElementSibling;
  targets.forEach(b => b.remove());
  if (root && root.children.length === 0) root.appendChild(_callbacks.createBlockEl('paragraph'));

  _callbacks.renumberLists();
  clearBlockSelection();
  hideBlockControls();

  const focusTarget = (prev && document.body.contains(prev)) ? prev : root?.firstElementChild;
  if (focusTarget) {
    const c = _callbacks.getContentEl(focusTarget);
    c.focus();
  }
  _callbacks.scheduleSave();
}

function handleHandleClick(block, ctrl) {
  if (ctrl) {
    if (lastHandleClickedId) {
      const anchor = findBlockById(lastHandleClickedId);
      if (anchor) selectBlockRange(anchor, block);
      else setBlockSelection([block.dataset.id]);
    } else {
      setBlockSelection([block.dataset.id]);
    }
    lastHandleClickedId = block.dataset.id;
    return;
  }

  if (!(selectedBlockIds.size > 1 && selectedBlockIds.has(block.dataset.id))) {
    setBlockSelection([block.dataset.id]);
  }
  lastHandleClickedId = block.dataset.id;
  openBlockMenu(block, blockHandleBtn);
}

function startBlockReorderDrag(block) {
  const targets = targetBlocksFor(block);
  const indicator = document.createElement('div');
  indicator.className = 'block-drop-indicator';
  indicator.hidden = true;
  const noteEditorEl = _callbacks.getNoteEditorEl();
  if (noteEditorEl) noteEditorEl.appendChild(indicator);
  targets.forEach(b => b.classList.add('block-dragging'));
  document.body.style.cursor = 'grabbing';
  reorderState = { targets, indicator, dropTarget: null, dropBefore: true };
}

function updateBlockReorderDrag(e) {
  if (!reorderState) return;
  const { targets, indicator } = reorderState;
  const closest = blockNearestToY(e.clientY, targets);
  reorderState.dropTarget = closest;

  if (!closest) { indicator.hidden = true; return; }

  const rect = closest.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  reorderState.dropBefore = before;

  const noteEditorEl = _callbacks.getNoteEditorEl();
  const containerRect = noteEditorEl.getBoundingClientRect();
  indicator.style.top = `${(before ? rect.top : rect.bottom) - containerRect.top}px`;
  indicator.hidden = false;
}

function finishBlockReorderDrag() {
  if (!reorderState) return;
  const { targets, indicator, dropTarget, dropBefore } = reorderState;

  targets.forEach(b => b.classList.remove('block-dragging'));
  indicator.remove();
  document.body.style.cursor = '';

  if (dropTarget) {
    _callbacks.captureUndoPoint();
    if (dropBefore) {
      targets.forEach(b => dropTarget.before(b));
    } else {
      let anchor = dropTarget;
      for (const b of targets) { anchor.after(b); anchor = b; }
    }
    _callbacks.renumberLists();
    _callbacks.scheduleSave();
  }

  reorderState = null;
}

function startRangeSelectDrag(block) {
  rangeSelectState = { anchorBlock: block };
  selecaoEspelhada = false;
  setBlockSelection([block.dataset.id]);
}

function updateRangeSelectDrag(e) {
  if (!rangeSelectState) return;
  const target = blockNearestToY(e.clientY);
  if (!target) return;
  selectBlockRange(rangeSelectState.anchorBlock, target);
}

function finishRangeSelectDrag() {
  if (!rangeSelectState) return;
  lastHandleClickedId = rangeSelectState.anchorBlock.dataset.id;
  rangeSelectState = null;
}

function finishPointerGesture() {
  if (!pointerDown) return;
  if (pointerDown.moved) {
    if (pointerDown.ctrl) finishRangeSelectDrag();
    else                  finishBlockReorderDrag();
  } else {
    handleHandleClick(pointerDown.block, pointerDown.ctrl);
  }
  pointerDown = null;
}

export function initNoteDragDrop(callbacks) {
  _callbacks = { ..._callbacks, ...callbacks };

  noteEditorEl = _callbacks.getNoteEditorEl();
  root = _callbacks.getRoot();
  if (!noteEditorEl || !root) return;

  blockControls = document.createElement('div');
  blockControls.className = 'block-controls';
  blockControls.hidden = true;

  blockAddBtn = document.createElement('button');
  blockAddBtn.className = 'block-add-btn';
  blockAddBtn.innerHTML = iconSvg('add');
  blockAddBtn.title = 'Adicionar bloco abaixo (Ctrl+clique: acima)';
  blockAddBtn.setAttribute('aria-label', 'Adicionar bloco');

  blockHandleBtn = document.createElement('button');
  blockHandleBtn.className = 'block-handle-btn';
  blockHandleBtn.innerHTML = iconSvg('drag_indicator');
  blockHandleBtn.title = 'Clique: opções do bloco · Arrastar: mover · Ctrl+arrastar (em qualquer lugar do bloco): selecionar vários';
  blockHandleBtn.setAttribute('aria-label', 'Opções e movimentação do bloco');

  blockControls.append(blockAddBtn, blockHandleBtn);
  noteEditorEl.appendChild(blockControls);

  root.addEventListener('mousemove', e => {
    if (pointerDown || ctrlPointerDown) return;
    const target = blockNearestToY(e.clientY);
    if (!target) return;
    if (target === hoveredBlock && !blockControls.hidden) return;
    positionBlockControls(target);
  });

  noteEditorEl.addEventListener('mouseleave', () => {
    if (!blockMenuEl) hideBlockControls();
  });

  root.addEventListener('scroll', () => {
    if (hoveredBlock && root.contains(hoveredBlock)) positionBlockControls(hoveredBlock);
    else blockControls.hidden = true;
  }, { passive: true });

  blockAddBtn.addEventListener('mousedown', e => e.preventDefault());
  blockAddBtn.addEventListener('click', e => {
    if (!hoveredBlock) return;
    _callbacks.captureUndoPoint();
    const newBlock = _callbacks.createBlockEl('paragraph');
    if (e.ctrlKey || e.metaKey) hoveredBlock.before(newBlock);
    else hoveredBlock.after(newBlock);
    _callbacks.renumberLists();
    _callbacks.focusBlockStart(newBlock);
    _callbacks.scheduleSave();

    if (window.innerWidth < 768) {
      _callbacks.openSlashMenuForBlock(newBlock);
    }
  });

  document.addEventListener('mousedown', e => {
    if (selectedBlockIds.size === 0) return;
    if (blockMenuEl && blockMenuEl.contains(e.target)) return;
    if (_callbacks.isEventInsideMobileToolbar(e.target)) return;
    if (isBlockSelectActive && root.contains(e.target)) return;
    if (blockHandleBtn.contains(e.target) || blockAddBtn.contains(e.target)) return;
    clearBlockSelection();
  });

  blockHandleBtn.addEventListener('mousedown', e => {
    if (!hoveredBlock) return;
    e.preventDefault();
    pointerDown = { block: hoveredBlock, startX: e.clientX, startY: e.clientY, ctrl: e.ctrlKey || e.metaKey, moved: false };
  });

  document.addEventListener('mousemove', e => {
    if (!pointerDown) return;
    if (e.buttons === 0) { finishPointerGesture(); return; }

    if (!pointerDown.moved) {
      const dx = Math.abs(e.clientX - pointerDown.startX);
      const dy = Math.abs(e.clientY - pointerDown.startY);
      if (dx < 4 && dy < 4) return;
      pointerDown.moved = true;
      hideBlockControls();
      if (pointerDown.ctrl) startRangeSelectDrag(pointerDown.block);
      else                  startBlockReorderDrag(pointerDown.block);
    }

    if (pointerDown.ctrl) updateRangeSelectDrag(e);
    else                  updateBlockReorderDrag(e);
  });

  document.addEventListener('mouseup', finishPointerGesture);

  // Touch
  blockHandleBtn.addEventListener('touchstart', e => {
    if (!hoveredBlock) return;
    const touch = e.touches[0];
    const block = hoveredBlock;
    touchDragState = {
      block,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false,
      dragging: false,
    };

    clearTimeout(touchDragTimer);
    touchDragTimer = setTimeout(() => {
      if (!touchDragState) return;
      touchDragState.dragging = true;
      hideBlockControls();
      startBlockReorderDrag(block);
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch (_) {}
      }
    }, 350);
  }, { passive: true });

  blockHandleBtn.addEventListener('touchmove', e => {
    if (!touchDragState) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchDragState.startX);
    const dy = Math.abs(touch.clientY - touchDragState.startY);

    if (!touchDragState.dragging) {
      if (dx > 8 || dy > 8) {
        clearTimeout(touchDragTimer);
        touchDragState = null;
      }
      return;
    }

    e.preventDefault();
    updateBlockReorderDrag(touch);
  }, { passive: false });

  const finishTouchDrag = () => {
    clearTimeout(touchDragTimer);
    if (!touchDragState) return;
    if (touchDragState.dragging) {
      finishBlockReorderDrag();
    } else {
      handleHandleClick(touchDragState.block, false);
    }
    touchDragState = null;
  };

  blockHandleBtn.addEventListener('touchend', finishTouchDrag);
  blockHandleBtn.addEventListener('touchcancel', () => {
    clearTimeout(touchDragTimer);
    if (touchDragState?.dragging) finishBlockReorderDrag();
    touchDragState = null;
  });

  // Ctrl+arrasto em qualquer parte do bloco
  root.addEventListener('mousedown', e => {
    if (pointerDown) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const target = e.target.closest('.block');
    if (!target) return;
    e.preventDefault();
    ctrlPointerDown = { startX: e.clientX, startY: e.clientY, moved: false, anchorBlock: target };
  });

  document.addEventListener('mousemove', e => {
    if (!ctrlPointerDown) return;
    if (e.buttons === 0) { ctrlPointerDown = null; return; }

    if (!ctrlPointerDown.moved) {
      const dx = Math.abs(e.clientX - ctrlPointerDown.startX);
      const dy = Math.abs(e.clientY - ctrlPointerDown.startY);
      if (dx < 4 && dy < 4) return;
      ctrlPointerDown.moved = true;
      hideBlockControls();
      startRangeSelectDrag(ctrlPointerDown.anchorBlock);
    }

    updateRangeSelectDrag(e);
  });

  document.addEventListener('mouseup', () => {
    if (!ctrlPointerDown) return;
    if (ctrlPointerDown.moved) finishRangeSelectDrag();
    ctrlPointerDown = null;
  });

  document.addEventListener('mousedown', e => {
    if (blockMenuEl && !blockMenuEl.contains(e.target) && e.target !== blockHandleBtn) closeBlockMenu();
  });
}
