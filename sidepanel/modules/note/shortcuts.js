import { safeHref } from '../blocks.js';
import { ANCORA, createBlockEl } from './block-model.js';
import { clearContent, convertBlockType, focusBlockStart, renumberLists } from './block-ops.js';
import { getContentEl } from './block-structure.js';
import { getCaretOffset, rangeFromOffsets, setCaretOffset, textoVisivel } from './caret.js';
import { closeSlashMenu } from './slash.js';

export const BLOCK_SHORTCUTS = [
  { re: /^(#{1,6}) $/, type: m => `heading${m[1].length}` },
  { re: /^([-*]) \[([ xX])\] $/, type: () => 'checklist', checked: m => /[xX]/.test(m[2]) },
  { re: /^[-*] $/, type: () => 'bullet' },
  { re: /^\d+\. $/, type: () => 'number' },
  { re: /^> $/, type: () => 'quote' },
  // Destaque é "> [!note] " (citação com marcador), como no markdown. A palavra-chave
  // é a do markdown (inglês), igual à que vai pro arquivo.
  { re: /^>\s?\[!(note|tip|important|warning|caution)\] $/i, type: m => `callout:${m[1].toLowerCase()}` },
  // Dentro de uma citação (já criada com "> "), basta digitar "[!note] ".
  { re: /^\[!(note|tip|important|warning|caution)\] $/i, type: m => `callout:${m[1].toLowerCase()}`, soCitacao: true },
  { re: /^```$/, type: () => 'code' },
];

export function checkDividerShortcut(block) {
  const content = getContentEl(block);
  if (!/^(-{3,}|\*{3,}|_{3,})$/.test(content.textContent)) return false;

  const divider = createBlockEl('divider');
  block.replaceWith(divider);
  const para = createBlockEl('paragraph');
  divider.after(para);
  focusBlockStart(para);
  renumberLists();
  return true;
}

export function checkBlockShortcut(block) {
  const text = textoVisivel(getContentEl(block));
  for (const s of BLOCK_SHORTCUTS) {
    if (s.soCitacao && block.dataset.quoted !== 'true') continue;
    const m = s.re.exec(text);
    if (!m) continue;
    const type = s.type(m);
    const checked = s.checked ? s.checked(m) : false;
    const newBlock = convertBlockType(block, type, checked);
    clearContent(getContentEl(newBlock));
    // Primeiro recalcula (o marcador do destaque é recriado aqui), depois posiciona o
    // cursor: senão o cursor fica antes do marcador e o texto digitado entra nele.
    renumberLists();
    focusBlockStart(newBlock);
    closeSlashMenu();
    return true;
  }
  return false;
}

export const INLINE_SHORTCUTS = [
  { re: /`([^`\n]+?)`$/, tag: 'code' },
  // Link ao digitar: "[texto](endereço)" vira link assim que o parêntese
  // fecha. É o único atalho que precisa de um segundo grupo (o endereço) e de
  // um atributo no elemento — daí o `attrs`.
  //
  // O "!" da frente é consumido de propósito: sem isso, digitar "![alt](url)"
  // deixaria um "!" solto antes do link. Imagem por endereço remoto não vira
  // <img> por decisão de privacidade (ver blocks.js) — vira link, que é
  // exatamente o mesmo resultado de colar a mesma linha.
  {
    re: /!?\[([^\]\n]+)\]\(([^)\s]+)\)$/,
    tag: 'a',
    attrs: m => {
      const href = safeHref(m[2]);
      return href ? { href } : null;   // endereço recusado: deixa o texto como está
    },
  },
  { re: /\*\*([^\n]+?)\*\*$/, tag: 'strong' },
  { re: /~~([^\n]+?)~~$/, tag: 's' },
  // Marcado-texto: ==trecho== vira <mark class="md-highlight">. O class é o que
  // o diferencia das marcas de detecção (CPF, datas), que não são formatação.
  { re: /==([^=\n]+?)==$/, tag: 'mark', attrs: () => ({ class: 'md-highlight', 'data-syntax': '==' }) },
  { re: /(?<!\*)\*(?![\s*])([^*\n]+?)(?<![\s*])\*$/, tag: 'em' },
];

export function replaceRangeWithTag(contentEl, start, end, tag, innerText, attrs = {}) {
  const range = rangeFromOffsets(contentEl, start, end);
  range.deleteContents();
  const el = document.createElement(tag);
  el.textContent = innerText;
  for (const [nome, valor] of Object.entries(attrs)) el.setAttribute(nome, valor);
  range.insertNode(el);

  const ancora = document.createTextNode(ANCORA);
  el.after(ancora);

  const after = document.createRange();
  after.setStart(ancora, 1);
  after.collapse(true);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(after);
}

export function limparAncoras(contentEl) {
  if (!contentEl.textContent.includes(ANCORA)) return;

  const sel = document.getSelection();
  const cursorAqui = sel?.rangeCount > 0 && contentEl.contains(sel.anchorNode);
  const caret = cursorAqui ? getCaretOffset(contentEl) : null;

  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  const nos = [];
  for (let n; (n = walker.nextNode()); ) nos.push(n);

  let pos = 0, removidasAntes = 0, mexeu = false;
  for (const no of nos) {
    const dados = no.data;
    if (dados.length > 1 && dados.includes(ANCORA)) {
      if (caret !== null) {
        for (let i = 0; i < dados.length; i++) {
          if (dados[i] === ANCORA && pos + i < caret) removidasAntes++;
        }
      }
      no.data = dados.split(ANCORA).join('');
      mexeu = true;
    }
    pos += dados.length;
  }

  if (mexeu && caret !== null) setCaretOffset(contentEl, Math.max(0, caret - removidasAntes));
}

export function tryAutoFormatInline(contentEl) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
  if (!contentEl.contains(sel.anchorNode)) return;

  const offset = getCaretOffset(contentEl);
  const before = textoVisivel(contentEl).slice(0, offset);

  for (const { re, tag, attrs } of INLINE_SHORTCUTS) {
    const m = re.exec(before);
    if (!m) continue;
    // `attrs` devolvendo null quer dizer "este atalho não se aplica" — é assim
    // que um endereço inválido deixa o texto digitado intacto em vez de sumir.
    const atributos = attrs ? attrs(m) : {};
    if (atributos === null) continue;
    replaceRangeWithTag(contentEl, offset - m[0].length, offset, tag, m[1], atributos);
    return;
  }
}
