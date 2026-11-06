import { NO_TEXT_TYPES, createBlockEl } from './block-model.js';
import { convertBlockType, focusBlockStart, renumberLists } from './block-ops.js';
import { blockDepth, getContentEl, indentBlocks, isBlockQuoted, setBlockCallout, setBlockDepth, setBlockQuoted } from './block-structure.js';
import { getCaretOffset, pointAtOffset, setCaretOffset } from './caret.js';
import { captureUndoPoint } from './undo.js';

export function htmlOfFragment(fragment) {
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

export function handleEnter(block) {
  captureUndoPoint();
  const content  = getContentEl(block);
  const offset   = getCaretOffset(content);
  const type     = block.dataset.type;
  const isListish = type === 'bullet' || type === 'number' || type === 'checklist';
  // A folha de cálculo se repete no Enter como uma lista se repete, e sai pelo
  // mesmo gesto: Enter numa linha vazia.
  const repete    = isListish || type === 'calc';
  const isEmpty   = content.textContent.trim() === '';

  if (repete && isEmpty) {
    // Indentado, o Enter num item vazio sai um nível — só no nível 0 é que
    // ele desiste da lista e vira parágrafo. É o caminho de saída natural de
    // uma lista aninhada, sem precisar de Shift+Tab.
    if (blockDepth(block) > 0) {
      indentBlocks([block], -1);
      renumberLists();
      focusBlockStart(block);
      return;
    }
    const para = convertBlockType(block, 'paragraph');
    focusBlockStart(para);
    renumberLists();
    return;
  }

  // Enter numa linha citada vazia sai da citação, do mesmo jeito que sai de
  // uma lista — é o caminho de saída sem precisar procurar menu.
  if (isBlockQuoted(block) && isEmpty) {
    setBlockQuoted(block, false);
    renumberLists();
    focusBlockStart(block);
    return;
  }

  const start = pointAtOffset(content, offset);
  const afterRange = document.createRange();
  afterRange.setStart(start.node, start.offset);
  afterRange.setEndAfter(content.lastChild ?? content.firstChild ?? content);
  const afterHTML = htmlOfFragment(afterRange.extractContents());

  const nextType = repete ? type : 'paragraph';
  const newBlock = createBlockEl(nextType, afterHTML, false);
  setBlockDepth(newBlock, blockDepth(block));
  setBlockQuoted(newBlock, isBlockQuoted(block));
  setBlockCallout(newBlock, block.dataset.callout);   // Enter continua dentro do destaque
  block.after(newBlock);
  focusBlockStart(newBlock);
  renumberLists();
}

export function handleBackspaceAtStart(block) {
  captureUndoPoint();
  const type    = block.dataset.type;
  const content = getContentEl(block);
  const isEmpty = content.textContent.trim() === '';

  // Citado: o primeiro Backspace tira a citação, sem mexer no conteúdo — o
  // mesmo gesto que já tirava qualquer outra formatação de bloco.
  if (isBlockQuoted(block)) {
    setBlockQuoted(block, false);
    renumberLists();
    focusBlockStart(block);
    return;
  }

  // Indentado: o Backspace seguinte sai um nível. É o inverso do Tab e evita
  // que apagar no início engula o bloco de cima.
  if (blockDepth(block) > 0) {
    indentBlocks([block], -1);
    renumberLists();
    focusBlockStart(block);
    return;
  }

  // Bloco especial COM texto: primeiro Backspace só tira a formatação
  // (volta a parágrafo), preserva o conteúdo — evita apagar sem querer.
  // Já vazio (ex.: checklist sem texto), pula direto pra mesclar/remover —
  // não faz sentido exigir um Backspace a mais só pra "desformatar o nada".
  if (type !== 'paragraph' && !isEmpty) {
    const para = convertBlockType(block, 'paragraph');
    focusBlockStart(para);
    renumberLists();
    return;
  }

  const prev = block.previousElementSibling;
  if (!prev) {
    if (type !== 'paragraph') {
      const para = convertBlockType(block, 'paragraph');
      focusBlockStart(para);
      renumberLists();
    }
    return;
  }

  if (prev.dataset.type === 'divider' || prev.dataset.type === 'pagebreak') {
    prev.remove();
    renumberLists();
    return;
  }

  // Tabela e imagem não têm um texto único onde este bloco possa ser fundido —
  // seguir daqui despejaria o conteúdo dentro da tabela. Backspace no começo da
  // linha simplesmente não faz nada aqui; pra apagar a tabela ou a imagem
  // existem o menu do bloco e o botão Remover.
  if (NO_TEXT_TYPES.has(prev.dataset.type)) return;

  const prevContent = getContentEl(prev);
  const joinOffset  = prevContent.textContent.length;

  if (!isEmpty) {
    while (content.firstChild) prevContent.appendChild(content.firstChild);
  }
  block.remove();

  prevContent.focus();
  setCaretOffset(prevContent, joinOffset);
  renumberLists();
}
