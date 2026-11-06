import { BULLET_GLYPHS } from '../blocks.js';
import { evaluateSheet } from '../calc.js';
import { createBlockEl } from './block-model.js';
import { blockDepth, getContentEl, isBlockQuoted, normalizeDepths, setBlockCallout, setBlockDepth, setBlockQuoted } from './block-structure.js';
import { setCaretOffset } from './caret.js';
import { root } from './state.js';
import { syncCalloutMarker } from './callout-marker.js';

export function clearContent(el) {
  el.innerHTML = '';
  el.appendChild(document.createElement('br'));
}

export function convertBlockType(blockEl, newType, checked = false) {
  // "Citação" não troca o tipo do bloco, liga a decoração: um título citado
  // continua sendo um título. É o que o menu "/" e o "Transformar em" acabam
  // pedindo quando se escolhe Citação.
  if (newType === 'quote') {
    setBlockQuoted(blockEl, true);
    return blockEl;
  }

  // Destaque também não troca o tipo: é decoração sobre a citação.
  if (newType.startsWith('callout:')) {
    setBlockCallout(blockEl, newType.slice('callout:'.length));
    return blockEl;
  }

  const oldContent = getContentEl(blockEl);
  const newBlock = createBlockEl(newType, oldContent.innerHTML, checked);
  setBlockDepth(newBlock, blockDepth(blockEl));
  setBlockQuoted(newBlock, isBlockQuoted(blockEl));
  setBlockCallout(newBlock, blockEl.dataset.callout);
  blockEl.replaceWith(newBlock);
  return newBlock;
}

export function getBlockFromNode(node) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== root && !el.classList?.contains('block')) el = el.parentElement;
  return el === root ? null : el;
}

export function currentBlock() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return getBlockFromNode(sel.anchorNode);
}

export function focusBlockStart(block) {
  const content = getContentEl(block);
  content.focus();
  setCaretOffset(content, 0);
}

export function markCalloutEdges() {
  const blocos = [...root.children];
  for (let i = 0; i < blocos.length; i++) {
    const tipo = blocos[i].dataset.callout ?? null;
    if (!tipo) {
      delete blocos[i].dataset.calloutFirst;
      delete blocos[i].dataset.calloutLast;
      syncCalloutMarker(blocos[i]);
      continue;
    }
    if (tipo !== (blocos[i - 1]?.dataset.callout ?? null)) blocos[i].dataset.calloutFirst = 'true';
    else delete blocos[i].dataset.calloutFirst;

    if (tipo !== (blocos[i + 1]?.dataset.callout ?? null)) blocos[i].dataset.calloutLast = 'true';
    else delete blocos[i].dataset.calloutLast;
    syncCalloutMarker(blocos[i]);
  }
}

export function recalcCalcSheets() {
  const blocos = [...root.children];

  for (let i = 0; i < blocos.length; i++) {
    if (blocos[i].dataset.type !== 'calc') continue;

    let fim = i;
    while (fim + 1 < blocos.length && blocos[fim + 1].dataset.type === 'calc') fim++;
    const folha = blocos.slice(i, fim + 1);

    const resultado = evaluateSheet(folha.map(b => getContentEl(b).textContent));

    folha.forEach((bloco, k) => {
      const r  = resultado[k];
      const el = bloco.querySelector(':scope > .calc-result');
      if (el) el.textContent = r.tipo === 'valor' ? r.fmt : (r.tipo === 'erro' ? r.erro : '');

      if (r.tipo === 'erro') bloco.dataset.calcErro = 'true';
      else delete bloco.dataset.calcErro;

      // Pontas da folha: é o que faz uma sequência ler como um quadro só.
      if (k === 0) bloco.dataset.calcFirst = 'true'; else delete bloco.dataset.calcFirst;
      if (k === folha.length - 1) bloco.dataset.calcLast = 'true'; else delete bloco.dataset.calcLast;
    });

    i = fim;
  }
}

export function renumberLists() {
  normalizeDepths();
  markCalloutEdges();
  recalcCalcSheets();

  // Um contador por nível: entrar num nível mais fundo não zera o de fora, e
  // sair dele recomeça o de dentro.
  const contadores = [];

  for (const block of root.children) {
    const depth  = blockDepth(block);
    const marker = block.querySelector(':scope > .block-marker');

    if (block.dataset.type === 'number') {
      const n = (contadores[depth] ?? 0) + 1;
      contadores[depth] = n;
      contadores.length = depth + 1;
      if (marker) marker.textContent = `${n}.`;
      continue;
    }

    contadores.length = depth;  // bloco não-numerado quebra a contagem dali pra dentro
    if (block.dataset.type === 'bullet' && marker) {
      marker.textContent = BULLET_GLYPHS[depth % BULLET_GLYPHS.length];
    }
  }
}
