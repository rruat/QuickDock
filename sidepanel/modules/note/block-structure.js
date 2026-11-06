import { CALLOUT_TYPES, MAX_DEPTH } from '../blocks.js';
import { currentBlock } from './block-ops.js';
import { orderedBlocks } from './block-selection.js';
import { S, root } from './state.js';

export function isBlockQuoted(el) {
  return el?.dataset?.quoted === 'true';
}

export function setBlockQuoted(el, on) {
  if (on) el.dataset.quoted = 'true';
  else { delete el.dataset.quoted; delete el.dataset.callout; }
}

export function setBlockCallout(el, tipo) {
  if (tipo && CALLOUT_TYPES.includes(tipo)) {
    el.dataset.quoted  = 'true';
    el.dataset.callout = tipo;
  } else {
    delete el.dataset.callout;
  }
}

export function blockDepth(el) {
  const d = Number(el?.dataset?.depth) || 0;
  return Math.min(Math.max(d, 0), MAX_DEPTH);
}

export function setBlockDepth(el, depth) {
  const d = Math.min(Math.max(Math.round(depth) || 0, 0), MAX_DEPTH);
  if (d) el.dataset.depth = String(d);
  else delete el.dataset.depth;
}

export function normalizeDepths() {
  let anterior = -1;
  for (const block of root.children) {
    const d = Math.min(blockDepth(block), anterior + 1);
    setBlockDepth(block, d);
    anterior = d;
  }
}

export function indentBlocks(blocks, delta) {
  const selecionados = new Set(blocks);
  const novos = new Map();
  const depthDe = b => (novos.has(b) ? novos.get(b) : blockDepth(b));

  // Teto olhando a profundidade NOVA do bloco anterior: num grupo que desce
  // junto, o primeiro já desceu quando chega a vez do segundo.
  const tetoPara = b => {
    const prev = b.previousElementSibling;
    return prev ? Math.min(depthDe(prev) + 1, MAX_DEPTH) : 0;
  };

  let dono = null;
  let deslocamento = 0;

  for (const b of orderedBlocks()) {
    const atual = blockDepth(b);
    if (dono && atual <= blockDepth(dono)) dono = null;   // saiu de dentro do dono

    if (selecionados.has(b)) {
      const novo = delta > 0 ? Math.min(atual + 1, tetoPara(b)) : Math.max(atual - 1, 0);
      novos.set(b, novo);
      dono = b;
      deslocamento = novo - atual;
      continue;
    }

    if (dono && deslocamento !== 0) {
      novos.set(b, Math.min(Math.max(atual + deslocamento, 0), MAX_DEPTH));
    }
  }

  let mudou = false;
  for (const [b, novo] of novos) {
    if (novo === blockDepth(b)) continue;
    setBlockDepth(b, novo);
    mudou = true;
  }
  return mudou;
}

export function blocksForIndent() {
  if (S.selectedBlockIds.size > 0) {
    return orderedBlocks().filter(b => S.selectedBlockIds.has(b.dataset.id));
  }
  const block = currentBlock();
  return block ? [block] : [];
}

export function getContentEl(blockEl) {
  return blockEl.querySelector(':scope > .block-content') || blockEl;
}
