import { blockAddBtn, blockHandleBtn, hideBlockControls } from './block-controls.js';
import { closeBlockMenu } from './block-menu.js';
import { getSelectedBlocks } from './formatting.js';
import { blockNearestToY, handleHandleClick } from './handle.js';
import { finishBlockReorderDrag, startBlockReorderDrag, updateBlockReorderDrag } from './reorder.js';
import { S, root } from './state.js';

export function findBlockById(id) {
  return [...root.children].find(el => el.classList?.contains('block') && el.dataset.id === id) || null;
}

export function orderedBlocks() {
  return [...root.children].filter(el => el.classList?.contains('block'));
}

export function setBlockSelection(ids) {
  root.querySelectorAll('.block.block-selected').forEach(b => b.classList.remove('block-selected'));
  S.selectedBlockIds = new Set(ids);
  for (const b of orderedBlocks()) {
    if (S.selectedBlockIds.has(b.dataset.id)) b.classList.add('block-selected');
  }
  // Com o bloco inteiro realçado, o realce nativo do texto por baixo vira um
  // borrão duplo. A classe apaga só o desenho dele — a seleção de texto
  // continua existindo, que é o que a barra de formatação usa.
  root.classList.toggle('blocks-selected', S.selectedBlockIds.size > 1);
}

export function clearBlockSelection() {
  setBlockSelection([]);
  S.lastHandleClickedId = null;
  S.selecaoEspelhada = false;
}

export function selectBlockRange(fromBlock, toBlock) {
  const all = orderedBlocks();
  const a = all.indexOf(fromBlock), b = all.indexOf(toBlock);
  if (a === -1 || b === -1) return;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  setBlockSelection(all.slice(lo, hi + 1).map(el => el.dataset.id));
}

export function targetBlocksFor(block) {
  if (S.selectedBlockIds.size > 1 && S.selectedBlockIds.has(block.dataset.id)) {
    return orderedBlocks().filter(el => S.selectedBlockIds.has(el.dataset.id));
  }
  return [block];
}

document.addEventListener('mousedown', e => {
  if (S.selectedBlockIds.size === 0) return;
  if (S.blockMenuEl && S.blockMenuEl.contains(e.target)) return;
  if (e.target === blockHandleBtn || e.target === blockAddBtn) return;
  clearBlockSelection();
});

export function startRangeSelectDrag(block) {
  S.rangeSelectState = { anchorBlock: block };
  S.selecaoEspelhada = false;          // esta veio do Ctrl, não de seleção de texto
  setBlockSelection([block.dataset.id]);
}

export function updateRangeSelectDrag(e) {
  if (!S.rangeSelectState) return;
  const target = blockNearestToY(e.clientY);
  if (!target) return;
  selectBlockRange(S.rangeSelectState.anchorBlock, target);
}

export function finishRangeSelectDrag() {
  if (!S.rangeSelectState) return;
  S.lastHandleClickedId = S.rangeSelectState.anchorBlock.dataset.id;
  S.rangeSelectState = null;
}

blockHandleBtn.addEventListener('mousedown', e => {
  if (!S.hoveredBlock) return;
  e.preventDefault();
  S.pointerDown = { block: S.hoveredBlock, startX: e.clientX, startY: e.clientY, ctrl: e.ctrlKey || e.metaKey, moved: false };
});

export function finishPointerGesture() {
  if (!S.pointerDown) return;
  if (S.pointerDown.moved) {
    if (S.pointerDown.ctrl) finishRangeSelectDrag();
    else                  finishBlockReorderDrag();
  } else {
    handleHandleClick(S.pointerDown.block, S.pointerDown.ctrl);
  }
  S.pointerDown = null;
}

document.addEventListener('mousemove', e => {
  if (!S.pointerDown) return;

  // Botão já não está mais pressionado (ex.: soltou fora da janela, que é
  // bem fácil de acontecer num painel lateral estreito) — o 'mouseup' pode
  // nunca chegar; encerra o gesto aqui em vez de deixar preso.
  if (e.buttons === 0) { finishPointerGesture(); return; }

  if (!S.pointerDown.moved) {
    const dx = Math.abs(e.clientX - S.pointerDown.startX);
    const dy = Math.abs(e.clientY - S.pointerDown.startY);
    if (dx < 4 && dy < 4) return;
    S.pointerDown.moved = true;
    hideBlockControls();
    if (S.pointerDown.ctrl) startRangeSelectDrag(S.pointerDown.block);
    else                  startBlockReorderDrag(S.pointerDown.block);
  }

  if (S.pointerDown.ctrl) updateRangeSelectDrag(e);
  else                  updateBlockReorderDrag(e);
});

document.addEventListener('mouseup', finishPointerGesture);

root.addEventListener('mousedown', e => {
  if (S.pointerDown) return; // já é um gesto iniciado pela alça
  if (!(e.ctrlKey || e.metaKey)) return;
  const target = e.target.closest('.block');
  if (!target) return;
  // Evita que o navegador comece a selecionar texto nativamente enquanto
  // arrasta; não afeta o Ctrl+clique parado em cima de um <mark> (CPF/data/
  // cálculo) — aquele menu depende do evento 'click', que ainda dispara normalmente.
  e.preventDefault();
  S.ctrlPointerDown = { startX: e.clientX, startY: e.clientY, moved: false, anchorBlock: target };
});

document.addEventListener('mousemove', e => {
  if (!S.ctrlPointerDown) return;

  if (e.buttons === 0) { S.ctrlPointerDown = null; return; }

  if (!S.ctrlPointerDown.moved) {
    const dx = Math.abs(e.clientX - S.ctrlPointerDown.startX);
    const dy = Math.abs(e.clientY - S.ctrlPointerDown.startY);
    if (dx < 4 && dy < 4) return;
    S.ctrlPointerDown.moved = true;
    hideBlockControls();
    startRangeSelectDrag(S.ctrlPointerDown.anchorBlock);
  }

  updateRangeSelectDrag(e);
});

document.addEventListener('mouseup', () => {
  if (!S.ctrlPointerDown) return;
  if (S.ctrlPointerDown.moved) finishRangeSelectDrag();
  S.ctrlPointerDown = null;
});

document.addEventListener('mousedown', e => {
  if (S.blockMenuEl && !S.blockMenuEl.contains(e.target) && e.target !== blockHandleBtn) closeBlockMenu();
});

document.addEventListener('selectionchange', () => {
  // Gesto de arrastar em andamento tem dono — não mexe na seleção no meio dele.
  if (S.pointerDown || S.ctrlPointerDown || S.reorderState) return;

  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  if (!root.contains(sel.getRangeAt(0).commonAncestorContainer)) return;

  const blocos = sel.isCollapsed ? [] : getSelectedBlocks();

  if (blocos.length > 1) {
    const ids = blocos.map(b => b.dataset.id);
    // selectionchange dispara a cada pixel do arraste; só repinta se mudou.
    const mudou = ids.length !== S.selectedBlockIds.size || ids.some(id => !S.selectedBlockIds.has(id));
    if (mudou) setBlockSelection(ids);
    S.selecaoEspelhada = true;
    return;
  }

  // Voltou a ser um bloco só (ou um cursor): o grupo deixa de existir. Uma
  // seleção feita com Ctrl+arrastar não é espelhada e não se desfaz aqui —
  // ela tem os próprios caminhos de saída (Esc, clique fora).
  if (S.selecaoEspelhada) clearBlockSelection();
});
