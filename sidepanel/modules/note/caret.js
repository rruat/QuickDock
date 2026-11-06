// O marcador do destaque ("> [!NOTE]", classe callout-marker) é texto editável
// do bloco, mas não faz parte do conteúdo da citação: fica fora dos offsets do
// cursor e do texto usado pelos atalhos.
const ignorarMarcador = n => n.parentElement?.closest('.callout-marker')
  ? NodeFilter.FILTER_REJECT
  : NodeFilter.FILTER_ACCEPT;

export function textoVisivel(contentEl) {
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, { acceptNode: ignorarMarcador });
  let texto = '';
  for (let n; (n = walker.nextNode()); ) texto += n.data;
  return texto;
}

export function pointAtOffset(contentEl, offset) {
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, { acceptNode: ignorarMarcador });
  let node, acc = 0, last = null;
  while ((node = walker.nextNode())) {
    last = node;
    const len = node.data.length;
    if (acc + len >= offset) return { node, offset: offset - acc };
    acc += len;
  }
  if (last) return { node: last, offset: last.data.length };
  // sem texto: o cursor fica logo depois do marcador do destaque (se houver), não antes dele
  const marcador = contentEl.querySelector(':scope > .callout-marker');
  if (marcador) return { node: contentEl, offset: [...contentEl.childNodes].indexOf(marcador) + 1 };
  return { node: contentEl, offset: 0 };
}

export function rangeFromOffsets(contentEl, start, end) {
  const a = pointAtOffset(contentEl, start);
  const b = pointAtOffset(contentEl, end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

export function getCaretOffset(contentEl) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!contentEl.contains(range.startContainer)) return 0;
  const marcador = contentEl.querySelector(':scope > .callout-marker');
  if (marcador && marcador.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(contentEl);
  pre.setEnd(range.startContainer, range.startOffset);
  let texto = pre.toString();
  // o marcador é o primeiro filho: se o cursor está depois dele, tira o texto dele
  if (marcador && texto.startsWith(marcador.textContent)) texto = texto.slice(marcador.textContent.length);
  return texto.length;
}

export function setCaretOffset(contentEl, offset) {
  const p = pointAtOffset(contentEl, offset);
  const range = document.createRange();
  range.setStart(p.node, p.offset);
  range.collapse(true);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}