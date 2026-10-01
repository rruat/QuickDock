// ── note-live-preview.js ───────────────────────────────────────────────────
// Submódulo de suporte ao Obsidian Live Preview e Sintaxe Markdown Dinâmica.
// Gerencia mapas de sintaxe inline, extração de prefixos e identificação de
// elementos ativos sob o cursor (Source-on-Cursor Parity).

export const INLINE_SYNTAX_MAP = {
  STRONG: '**',
  B: '**',
  EM: '*',
  I: '*',
  S: '~~',
  STRIKE: '~~',
  DEL: '~~',
  CODE: '`',
  MARK: '==',
};

/**
 * Retorna os delimitadores de abertura e fechamento para um dado elemento inline.
 * @param {HTMLElement} inlineEl
 * @returns {{ openSyntax: string, closeSyntax: string, isWiki: boolean, isWebLink: boolean }}
 */
export function getInlineDelimiters(inlineEl) {
  if (!inlineEl) return { openSyntax: '', closeSyntax: '', isWiki: false, isWebLink: false };

  const href = inlineEl.getAttribute?.('href') || '';
  const isWiki = inlineEl.classList?.contains('note-internal-link') || (inlineEl.tagName === 'A' && /^nota:/i.test(href));
  const isWebLink = inlineEl.tagName === 'A' && !isWiki;

  if (isWebLink) {
    return { openSyntax: '[', closeSyntax: ']', isWiki: false, isWebLink: true };
  }

  const isBoldItalic = inlineEl.dataset?.syntax === '***' ||
    inlineEl.dataset?.syntax === '___' ||
    inlineEl.getAttribute?.('data-syntax') === '***' ||
    inlineEl.getAttribute?.('data-syntax') === '___' ||
    ((inlineEl.tagName === 'STRONG' || inlineEl.tagName === 'B') && inlineEl.querySelector?.(':scope > em, :scope > i')) ||
    ((inlineEl.tagName === 'EM' || inlineEl.tagName === 'I') && inlineEl.querySelector?.(':scope > strong, :scope > b'));

  if (isBoldItalic) {
    const syn = inlineEl.dataset?.syntax || inlineEl.getAttribute?.('data-syntax') || '***';
    return { openSyntax: syn, closeSyntax: syn, isWiki: false, isWebLink: false };
  }

  const customSyntax = inlineEl.dataset?.syntax || inlineEl.getAttribute?.('data-syntax');
  const openSyntax = isWiki ? '[[' : (customSyntax || INLINE_SYNTAX_MAP[inlineEl.tagName] || '');
  const closeSyntax = isWiki ? ']]' : openSyntax;

  return { openSyntax, closeSyntax, isWiki, isWebLink: false };
}

/**
 * Extrai texto excedente digitado acidentalmente dentro de um prefixSpan de bloco.
 * @param {string} text
 * @returns {string} Texto residual digitado após o prefixo markdown
 */
export function extractExtraPrefixText(text) {
  if (!text) return '';
  const mCall = /^((?:>\s*)?\[!(?:note|tip|important|warning|caution)\][ \t]?)(.*)$/is.exec(text);
  const mHead = /^(#{1,6}[ \t]?)(.*)$/s.exec(text);
  const mQuote = /^(>[ \t]?)(.*)$/s.exec(text);

  if (mCall && mCall[2]) return mCall[2];
  if (mHead && mHead[2]) return mHead[2];
  if (mQuote && mQuote[2]) return mQuote[2];
  return '';
}

/**
 * Identifica o elemento inline formatado mais próximo do nó do cursor
 * (strong, em, mark, s, code, link ou link interno).
 * @param {Node} node
 * @param {HTMLElement} root
 * @returns {HTMLElement|null}
 */
export function findNearestInlineFormatting(node, root) {
  if (!node || !root) return null;
  const target = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!target || !root.contains(target)) return null;

  const selector = 'strong, b, em, i, mark.md-highlight, mark[data-syntax="=="], s, strike, del, code, a.note-internal-link, a[href]';

  const strongEl = target.closest('strong, b');
  const emEl = target.closest('em, i');
  if (strongEl && emEl && root.contains(strongEl) && root.contains(emEl)) {
    return strongEl.contains(emEl) ? strongEl : emEl;
  }

  const direct = target.closest(selector);
  if (direct && root.contains(direct)) return direct;

  const sel = (typeof document !== 'undefined') ? document.getSelection() : null;
  if (sel && sel.isCollapsed && (target.classList?.contains('block') || target.classList?.contains('block-content'))) {
    const offset = sel.anchorOffset;
    const candidate = target.childNodes?.[offset] || target.childNodes?.[offset - 1] || (target.childNodes?.length === 1 ? target.firstChild : null);
    if (candidate && candidate.nodeType === Node.ELEMENT_NODE) {
      const match = candidate.closest?.(selector) || (candidate.matches?.(selector) ? candidate : null);
      if (match && root.contains(match)) return match;
    }
  }

  return null;
}

/**
 * Verifica se uma string de texto corresponde a um divisor markdown válido (---, ***, ___).
 * @param {string} text
 * @returns {boolean}
 */
export function isDividerText(text) {
  if (!text) return false;
  return /^(-{3,}|\*{3,}|_{3,})$/.test(text.trim());
}
