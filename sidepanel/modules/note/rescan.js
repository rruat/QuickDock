import { NO_DETECTION } from './block-model.js';
import { getContentEl } from './block-structure.js';
import { getCaretOffset, setCaretOffset } from './caret.js';
import { applyDetectionMarks, unwrapMarks } from './detection.js';
import { S, root } from './state.js';

export function scheduleRescan(block) {
  S.rescanBlock = block;
  clearTimeout(S.rescanTimer);
  S.rescanTimer = setTimeout(flushRescan, 500);
}

export function flushRescan() {
  clearTimeout(S.rescanTimer);
  if (!S.rescanBlock) return;
  const block = S.rescanBlock;
  S.rescanBlock = null;
  if (!document.body.contains(block)) return;
  if (NO_DETECTION.has(block.dataset.type)) return;

  const content = getContentEl(block);
  const sel = document.getSelection();

  // Cursor dentro do marcador do destaque: o offset do corpo não serve pra ele (o
  // marcador não conta no texto). Guarda a posição dentro do próprio marcador.
  const marcador = content.querySelector(':scope > .callout-marker');
  if (marcador && sel && marcador.contains(sel.anchorNode)) {
    const texto = marcador.firstChild;
    const off = sel.anchorNode === texto ? sel.anchorOffset : (texto?.data.length ?? 0);
    unwrapMarks(content);
    applyDetectionMarks(content);
    const novo = marcador.firstChild;
    if (novo?.nodeType === Node.TEXT_NODE) {
      const r = document.createRange();
      r.setStart(novo, Math.min(off, novo.data.length));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return;
  }

  const hadFocus = sel && content.contains(sel.anchorNode);
  const caretOffset = hadFocus ? getCaretOffset(content) : null;

  unwrapMarks(content);
  applyDetectionMarks(content);

  if (hadFocus && caretOffset !== null) setCaretOffset(content, caretOffset);
}

root.addEventListener('blur', flushRescan, true);
