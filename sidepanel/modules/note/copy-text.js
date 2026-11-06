import { blocksToPlainText } from '../blocks.js';
import { NO_TEXT_TYPES } from './block-model.js';
import { getContentEl } from './block-structure.js';
import { getSelectedBlocks } from './formatting.js';
import { serializeBlockEl } from './save.js';
import { root } from './state.js';

export function textForBlockInSelection(block, isFirst, isLast, range) {
  // Tabela, imagem e divisor têm botões de ferramenta dentro do bloco. Ler o
  // "texto do bloco" traria "+ linha" e "Remover" junto com o conteúdo — o
  // texto certo desses é o que o serializador produz.
  if (NO_TEXT_TYPES.has(block.dataset.type)) {
    return blocksToPlainText([serializeBlockEl(block)]);
  }

  const content = getContentEl(block);
  const sub = document.createRange();

  // A faixa fica presa dentro do conteúdo do bloco. Vários blocos têm irmãos
  // fora do editável — o resultado da folha de cálculo, o marcador da lista, a
  // caixa da checklist — e arrastar a seleção por cima deles trazia esse texto
  // junto: copiar uma linha de cálculo dava "boleto = R$ 1.000,00R$ 1.000,00",
  // e copiar um item de lista vinha com o bolinha na frente.
  const dentro = no => no === content || content.contains(no);

  if (isFirst && dentro(range.startContainer)) sub.setStart(range.startContainer, range.startOffset);
  else                                         sub.setStart(content, 0);

  if (isLast && dentro(range.endContainer)) sub.setEnd(range.endContainer, range.endOffset);
  else                                      sub.setEnd(content, content.childNodes.length);

  if (block.dataset.type === 'code') {
    const frag = sub.cloneContents();
    frag.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return frag.textContent ?? '';
  }
  return sub.toString();
}

root.addEventListener('copy', e => {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== root) return;

  const blocks = getSelectedBlocks();
  if (blocks.length === 0) return;

  const text = blocks
    .map((b, i) => textForBlockInSelection(b, i === 0, i === blocks.length - 1, range))
    .join('\n');

  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
});
