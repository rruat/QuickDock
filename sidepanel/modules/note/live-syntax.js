// Sintaxe ao vivo (estilo Obsidian): o símbolo markdown de um título ou de uma
// citação aparece só quando o cursor está na linha, e o de um trecho em negrito,
// itálico, tachado ou código só quando o cursor está nele. Fora disso o texto
// fica limpo.
//
// Os símbolos são pseudo-elementos (::before / ::after, ver styles/live-syntax.css):
// não entram no texto, não mexem nos offsets do cursor e não vão pro arquivo
// salvo. Os atributos data-md-* servem só pra o CSS saber o que desenhar, e são
// limpos antes de cada atualização e antes de salvar (sanitizeForSave).
import { getContentEl, isBlockQuoted } from './block-structure.js';
import { S, root } from './state.js';

const INLINE_SYNTAX = { STRONG: '**', B: '**', EM: '*', I: '*', S: '~~', STRIKE: '~~', DEL: '~~', CODE: '`', MARK: '==' };
const INLINE_SELECTOR = 'strong, b, em, i, s, strike, del, code, mark.md-highlight';

// Blocos que nunca mostram sintaxe: não têm texto markdown próprio.
const SKIP_TYPES = new Set(['code', 'table', 'image', 'calc', 'audio', 'video', 'pagebreak', 'toc']);

// Símbolo de linha de cada bloco (o que a pessoa digitaria no markdown).
// Destaques já usam o ::before pro rótulo, então não entram aqui.
export function blockPrefix(block) {
  const tipo = block.dataset.type || '';
  const h = /^heading([1-6])$/.exec(tipo);
  if (h) return '#'.repeat(Number(h[1])) + ' ';
  // Destaque: a primeira linha mostra o marcador "> [!NOTE]" (no lugar do rótulo);
  // as seguintes, só o ">" da citação, como no markdown.
  // Na primeira linha o marcador é texto real (callout-marker), editável.
  if (block.dataset.callout) {
    return block.dataset.calloutFirst === 'true' ? '' : '> ';
  }
  if (tipo === 'checklist') return `- [${block.dataset.checked === 'true' ? 'x' : ' '}] `;
  if (tipo === 'bullet') return '- ';
  if (tipo === 'number') {
    const numero = block.querySelector(':scope > .block-marker')?.textContent.trim() || '1.';
    return `${numero.replace(/\.$/, '')}. `;
  }
  if (isBlockQuoted(block)) return '> ';
  return '';
}

// Seleção de texto que começa e termina em blocos diferentes.
function atravessaBlocos(sel) {
  const blocoDe = no => {
    const el = no?.nodeType === Node.TEXT_NODE ? no.parentElement : no;
    const bloco = el?.closest?.('.block');
    return bloco && bloco.parentElement === root ? bloco : null;
  };
  if (sel.isCollapsed) return false;
  return blocoDe(sel.anchorNode) !== blocoDe(sel.focusNode);
}

function clearLiveSyntax() {
  root.querySelectorAll('[data-md-prefix]').forEach(el => delete el.dataset.mdPrefix);
  root.querySelectorAll('[data-md-src]').forEach(el => delete el.dataset.mdSrc);
  root.querySelectorAll('[data-md-open]').forEach(el => delete el.dataset.mdOpen);
}

export function updateLiveSyntax() {
  clearLiveSyntax();
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !root.contains(sel.anchorNode)) return;

  // Blocos selecionados (alça, Ctrl+arrastar, seleção por cima de vários blocos):
  // o formatador não aparece, pra dar pra tirar print do bloco como ele fica.
  if (S.selectedBlockIds.size > 0 || atravessaBlocos(sel)) return;

  const start = sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
  const block = start?.closest('.block');
  if (!block || block.parentElement !== root || SKIP_TYPES.has(block.dataset.type)) return;

  // Divisor: o cursor dentro dele mostra o "---" em vez da linha.
  if (block.dataset.type === 'divider') {
    block.dataset.mdSrc = 'true';
    return;
  }

  const prefix = blockPrefix(block);
  if (prefix) block.dataset.mdPrefix = prefix;
  // Lista e checklist: com o cursor na linha, o marcador vira o texto "- " / "- [ ] ".
  if (block.classList.contains('block-list')) block.dataset.mdSrc = 'true';
  // Primeira linha do destaque: com o cursor nele, o marcador editável aparece no lugar do rótulo.
  if (block.dataset.callout && block.dataset.calloutFirst === 'true') block.dataset.mdSrc = 'true';

  const content = getContentEl(block);
  const inline = start.closest(INLINE_SELECTOR);
  if (inline && inline !== content && content.contains(inline) && INLINE_SYNTAX[inline.tagName]) {
    inline.dataset.mdOpen = INLINE_SYNTAX[inline.tagName];
  }
}

document.addEventListener('selectionchange', updateLiveSyntax);
