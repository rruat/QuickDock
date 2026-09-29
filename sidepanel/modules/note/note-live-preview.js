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

  const openSyntax = isWiki ? '[[' : (INLINE_SYNTAX_MAP[inlineEl.tagName] || '');
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
 * (strong, em, s, code, link ou link interno).
 * @param {Node} node
 * @param {HTMLElement} root
 * @returns {HTMLElement|null}
 */
export function findNearestInlineFormatting(node, root) {
  if (!node || !root) return null;
  const target = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!target || !root.contains(target)) return null;

  return target.closest('strong, b, em, i, s, strike, del, code, a.note-internal-link, a[href]');
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
