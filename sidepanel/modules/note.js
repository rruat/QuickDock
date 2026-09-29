import {
  getNoteById, updateNoteBlocksById, updateNoteMetaById, saveFile, loadFileBlob, moveInlineFileToDocuments,
  loadAllNotesMeta, salvarLinksDaNota, obterTodosLinks,
} from './storage.js';
import {
  extrairLinksDeBlocos, resolverLinks, calcularBacklinks,
} from './links.js';
import { refreshDocuments, setDocsCollapsed } from './documents.js';
import { setActiveArea, isNoteActive } from './active-area.js';
import { openModal } from './modal.js';
import { evaluateSheet } from './calc.js';
import {
  uid, escHtml, safeHref, parseMarkdownToBlocks, blocksToMarkdown, blocksToPlainText,
  MAX_DEPTH, BULLET_GLYPHS, normalizeBlock, blocksToMarkdownForExport,
  CALLOUT_TYPES, CALLOUT_LABELS, headingSlug, headingSlugs,
} from './blocks.js';
import { blockTemplates, openSaveBlockTemplate } from './templates.js';
import { copyBlocksAsImage, downloadBlocksAsImage } from './snapshot.js';
import { iconSvg, createIcon } from './icons.js';
import { buildEmbeddedBaseBlock } from './bases/bases-embedded.js';
import { onViewChange } from './views.js';
import {
  noteSection, noteWorkspaceBodyEl, noteEditorEl, root, indicator, btnTouchSelect,
} from './note-state.js';
import {
  pointAtOffset, rangeFromOffsets, getCaretOffset, setCaretOffset, caretViewportRect,
  getContentEl, getBlockFromNode, currentBlock, focusBlockStart,
} from './note-dom-utils.js';
import {
  initNoteHistory, getUndoStackLength, getRedoStackLength, snapshotState,
  captureUndoPoint, captureTypingUndoPoint, resetUndoHistory,
  performUndo, performRedo,
} from './note/note-history.js';
export { getUndoStackLength, getRedoStackLength, snapshotState, captureUndoPoint, performUndo, performRedo };
import {
  initNoteTable, DEFAULT_TABLE, buildCell, buildTableEl, buildTableTools,
  focusedCell, focusCell, addTableRow, addTableCol, delTableRow, delTableCol,
  moveCell, handleTableButtonClick, parseClipboardTable, parseTsvTable,
  insertTableBlock,
} from './note/note-table.js';
export { focusCell };
import {
  initNoteMedia, revokeImageURLs, loadInlineMedia, aplicarTamanhoImagem,
  setImageData, setMediaData, buildImageTools, buildMediaTools,
  buildImageResizeHandle, setImageResolver,
} from './note/note-media.js';
export { setImageResolver };
import {
  initNoteSlashMenu, SLASH_ITEMS, INSERTED_TYPES, buildTypeGrid,
  slashItemsWithTemplates, closeSlashMenu, cancelSlashMenu,
  moveSlashSelection, moveSlashRow, confirmSlashSelection,
  checkSlashMenu, isSlashMenuOpen, openSlashMenuForBlock,
} from './note/note-slash-menu.js';
import {
  initNoteDragDrop, getSelectedBlockIds, getIsBlockSelectActive, setIsBlockSelectActive,
  getLastHandleClickedId, setLastHandleClickedId, setBlockSelection, clearBlockSelection,
  selectBlockRange, targetBlocksFor, getSelectedBlockElements, printBlocks, transformBlocks,
  hideBlockControls, positionBlockControls, findBlockById, orderedBlocks,
  deleteBlocksOrOne, closeBlockMenu, isGestureActive, isSelecaoEspelhada, setSelecaoEspelhada,
} from './note/note-drag-drop.js';
import {
  getInlineDelimiters,
  extractExtraPrefixText,
  findNearestInlineFormatting,
  isDividerText,
} from './note/note-live-preview.js';
import {
  openLinkMenu as _openLinkMenu,
  closeLinkMenu as _closeLinkMenu,
  openAltMenu as _openAltMenu,
  closeAltMenu as _closeAltMenu,
  isClickInsideLinkMenu,
} from './note/note-dialogs.js';
export {
  getSelectedBlockIds, getIsBlockSelectActive, setIsBlockSelectActive,
  getLastHandleClickedId, setLastHandleClickedId, setBlockSelection,
  clearBlockSelection, targetBlocksFor, getSelectedBlockElements,
  printBlocks, transformBlocks,
};
import { syncVisualViewport } from './note-viewport.js';
import {
  ttTitleCase, ttSentenceCase, ttParaCase, ttInvertCase, ttNoAccents,
  ttCleanSpaces, applyTransformToSelection,
} from './note-text-transforms.js';
import { downloadTextFile, getSuggestedBlockFilename } from './note-export-helpers.js';
import { renderNoteHeader, getHeaderNoteRef, flushHeaderTitle, clearNoteHeader } from './note-header.js';
export { renderNoteHeader };
import { atualizarLinksInternos, refreshBacklinks } from './note-backlinks.js';
export { atualizarLinksInternos, refreshBacklinks };
import {
  irParaTitulo, extrairSumarioDaNota, renderOutline, updateActiveOutlineHeading,
  scheduleOutlineUpdate, setSidebarTab, setBottomTab, setOutlineSidebarOpen,
} from './note-outline.js';
export {
  irParaTitulo, extrairSumarioDaNota, renderOutline, updateActiveOutlineHeading,
  scheduleOutlineUpdate, setSidebarTab, setBottomTab, setOutlineSidebarOpen,
};
import { renderPropertiesBar, iniciarNovaPropriedade } from './note-properties.js';
export { renderPropertiesBar };
import {
  showFeedback, showCopyMenu, closeCopyMenu, positionMenu, showMathMenu,
  applyDetectionMarks, unwrapMarks, mathCache,
} from './note-detection.js';
export { showFeedback };
import {
  closeLinkAutocomplete, checkLinkAutocomplete, moveLinkAutocompleteSelection,
  confirmLinkAutocompleteSelection, closeLinkAutocompleteIfOutside, isLinkAutocompleteOpen,
} from './note-link-autocomplete.js';
export { closeLinkAutocomplete };
import {
  getLastFocusedBlock, updateMobileToolbarState, isEventInsideMobileToolbar,
} from './note-mobile-toolbar.js';
export { getLastFocusedBlock };

let currentNoteId  = null;
let isCtrlHeld     = false;
let touchSelectionActive = false;
export function getIsCtrlHeld() { return isCtrlHeld; }
export function setIsCtrlHeld(v) { isCtrlHeld = v; }

// ── Modo de seleção por toque (em telas com dedo / pointer: coarse) ─────────
export function isTouchSelectionMode() {
  return touchSelectionActive;
}

export function setTouchSelectionMode(active) {
  if (touchSelectionActive === active) return;
  touchSelectionActive = active;
  noteSection.classList.toggle('touch-selection-active', active);
  noteSection.classList.toggle('ctrl-active', active || isCtrlHeld);
  if (btnTouchSelect) {
    btnTouchSelect.classList.toggle('is-active', active);
    btnTouchSelect.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (active) {
    showFeedback('Modo seleção ativo · toque para selecionar');
  } else {
    if (!activeMenu) indicator.classList.remove('visible');
  }
}

export function toggleTouchSelectionMode() {
  setTouchSelectionMode(!touchSelectionActive);
}

if (btnTouchSelect) {
  btnTouchSelect.addEventListener('click', e => {
    e.stopPropagation();
    toggleTouchSelectionMode();
  });
}
let indicatorTimer = null;
let saveTimer      = null;
let rescanTimer    = null;
let rescanBlock    = null;
export function getIndicatorTimer() { return indicatorTimer; }
export function setIndicatorTimer(t) { indicatorTimer = t; }

// ── Modelo de blocos ───────────────────────────────────────────────────────────
export const HEADING_TAGS = { heading1: 'h1', heading2: 'h2', heading3: 'h3', heading4: 'h4', heading5: 'h5', heading6: 'h6' };

// Blocos que não passam pela detecção de CPF/data/cálculo: código é literal,
// divisor não tem texto e a tabela não tem um conteúdo único — são N células.
// Numa folha de cálculo a linha inteira já é conta: a detecção de conta solta
// no meio do texto não tem o que fazer ali dentro.
const NO_DETECTION = new Set(['code', 'divider', 'table', 'image', 'calc', 'base']);

// Blocos sem um conteúdo de texto único: getContentEl devolve o próprio bloco
// neles, então perguntar pelo texto não faz sentido.
export const NO_TEXT_TYPES = new Set(['divider', 'table', 'image', 'audio', 'video', 'base']);

// Âncora invisível do cursor. Fica aqui em cima porque sanitizeForSave a usa
// muito antes do ponto onde ela é criada — ver replaceRangeWithTag, que é onde
// está explicado por que ela existe.
const ANCORA = '​';

export function createBlockEl(type, innerHTML = '', checked = false, rows = null, config = '') {
  let el;

  // "quote" deixou de ser um tipo e virou decoração. Um registro antigo que
  // escape da normalização ainda chega aqui — vira parágrafo citado, que é a
  // forma nova do mesmo conteúdo.
  if (type === 'quote') {
    const p = createBlockEl('paragraph', innerHTML);
    setBlockQuoted(p, true);
    return p;
  }

  if (type === 'image') {
    el = document.createElement('div');
    el.className = 'block block-image';
    // Não editável, como a tabela e o divisor: o que se edita aqui é o texto
    // alternativo, por botão, não o conteúdo do bloco.
    el.contentEditable = 'false';
    // Moldura própria pra alça de redimensionar ficar grudada no canto da
    // imagem de verdade, e não no bloco inteiro (que também tem a barra de
    // ferramentas embaixo, de altura variável).
    const frame = document.createElement('div');
    frame.className = 'image-frame';
    const img = document.createElement('img');
    img.draggable = false;
    img.alt = '';
    frame.append(img, buildImageResizeHandle(el));
    el.append(frame, buildImageTools());
    el.dataset.type = type;
    el.dataset.id = uid();
    return el;
  }

  if (type === 'audio' || type === 'video') {
    el = document.createElement('div');
    el.className = `block block-${type}`;
    // Mesma ideia da imagem: não editável, sem cursor de texto dentro.
    el.contentEditable = 'false';
    const media = document.createElement(type);
    media.controls = true;
    media.preload = 'metadata';
    if (type === 'video') {
      // Vídeo ganha a mesma moldura+alça de redimensionar da imagem — largura
      // de player faz sentido ajustar; áudio (só a barra de controles) não.
      const frame = document.createElement('div');
      frame.className = 'image-frame';
      frame.append(media, buildImageResizeHandle(el));
      el.append(frame, buildMediaTools());
    } else {
      el.append(media, buildMediaTools());
    }
    el.dataset.type = type;
    el.dataset.id = uid();
    return el;
  }

  if (type === 'table') {
    el = document.createElement('div');
    el.className = 'block block-table';
    // O bloco não é editável; cada célula é a sua própria ilha editável. É isso
    // que mantém a tabela fora das regras de Enter/Backspace dos outros blocos.
    el.contentEditable = 'false';
    el.append(buildTableEl(rows), buildTableTools());
    el.dataset.type = type;
    el.dataset.id = uid();
    return el;
  }

  if (type === 'base') {
    return buildEmbeddedBaseBlock(config || innerHTML, () => scheduleSave());
  }

  if (HEADING_TAGS[type]) {
    el = document.createElement(HEADING_TAGS[type]);
    el.className = 'block';
    el.contentEditable = 'true';
    el.innerHTML = innerHTML;

  } else if (type === 'bullet' || type === 'number' || type === 'checklist') {
    el = document.createElement('div');
    el.className = 'block block-list' + (type === 'checklist' ? ' block-checklist' : '');
    const marker = document.createElement('span');
    marker.className = 'block-marker';
    marker.contentEditable = 'false';
    if (type === 'checklist') {
      marker.classList.add('cb-wrap');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!checked;
      marker.appendChild(cb);
      el.dataset.checked = checked ? 'true' : 'false';
    } else {
      marker.textContent = type === 'bullet' ? '•' : '1.';
    }
    const content = document.createElement('span');
    content.className = 'block-content';
    content.contentEditable = 'true';
    content.innerHTML = innerHTML;
    el.append(marker, content);

  } else if (type === 'calc') {
    el = document.createElement('div');
    el.className = 'block block-calc';
    const content = document.createElement('span');
    content.className = 'block-content';
    content.contentEditable = 'true';
    content.innerHTML = innerHTML;
    // O resultado fica fora do editável, na mesma estrutura de dois elementos
    // que lista e checklist usam. É o que impede o cursor de entrar nele ou de
    // apagá-lo sem querer — e o que faz getContentEl continuar valendo.
    const res = document.createElement('span');
    res.className = 'calc-result';
    res.contentEditable = 'false';
    el.append(content, res);

  } else if (type === 'code') {
    el = document.createElement('div');
    el.className = 'block block-code';
    const content = document.createElement('span');
    content.className = 'block-content';
    content.contentEditable = 'true';
    content.innerHTML = innerHTML;
    el.appendChild(content);

  } else if (type === 'divider') {
    el = document.createElement('div');
    el.className = 'block block-divider';
    const content = document.createElement('span');
    content.className = 'block-content divider-content';
    content.contentEditable = 'true';
    content.textContent = (innerHTML && /^(-{3,}|\*{3,}|_{3,})$/.test(innerHTML.trim())) ? innerHTML.trim() : '---';
    const hr = document.createElement('hr');
    hr.contentEditable = 'false';
    el.append(content, hr);

    // Entrar e sair do modo "texto cru" (--- em vez da linha) é decidido por
    // onde o cursor está a cada mudança de seleção (ver syncDividerActiveState,
    // chamada de dentro de updateLivePreviewState) — igual ao resto do editor
    // faz para cabeçalho/citação/destaque. focusin/focusout não servem aqui:
    // todo bloco é um contenteditable aninhado dentro do mesmo host editável
    // do documento inteiro, então mover o cursor com clique ou seta nunca
    // dispara blur de verdade num bloco só, e o divisor ficava preso mostrando
    // "---" pra sempre depois do primeiro clique.
    el.addEventListener('mousedown', e => {
      if (el.classList.contains('is-active')) return;   // já ativo: deixa o clique posicionar o cursor
      e.preventDefault();
      content.focus();
      setCaretOffset(content, content.textContent.length);
    });

  } else {
    el = document.createElement('p');
    el.className = 'block';
    el.contentEditable = 'true';
    el.innerHTML = innerHTML;
  }

  el.dataset.type = type;
  el.dataset.id = uid();

  // Um elemento editável totalmente vazio (sem nem um nó de texto) não fica
  // clicável/digitável de forma confiável em alguns navegadores — sobretudo
  // o <span> de conteúdo de listas/checklist/código, que colapsa a altura
  // zero quando vazio. Um <br> "segura" o espaço pro cursor.
  if (type !== 'divider' && type !== 'base') {
    const contentEl = getContentEl(el);
    if (!contentEl.hasChildNodes()) contentEl.appendChild(document.createElement('br'));
  }

  return el;
}

// Ponto único pra criar um bloco a partir de dado serializado. Existe porque
// createBlockEl tem parâmetros posicionais e é fácil esquecer o último — foi
// exatamente assim que uma tabela colada virava uma tabela vazia. Campo novo
// no modelo entra aqui e todas as chamadas passam a respeitá-lo de uma vez.
function createBlockElFrom(bruto) {
  const b  = normalizeBlock(bruto);
  const el = createBlockEl(b.type, b.html ?? '', b.checked ?? false, b.rows ?? null, b.config ?? '');
  if (b.id) el.dataset.id = b.id;
  setBlockDepth(el, b.depth ?? 0);
  setBlockQuoted(el, !!b.quoted);
  setBlockCallout(el, b.callout);
  setBlockUnderlined(el, !!b.underlined);
  if (b.type === 'image') setImageData(el, b);
  if (b.type === 'audio' || b.type === 'video') setMediaData(el, b.type, b);
  return el;
}

// ── Citação (decoração) ───────────────────────────────────────────────────────
// Citação não é um tipo de bloco: é uma marca que qualquer bloco pode ter. É
// isso que faz título, lista e checklist funcionarem DENTRO de uma citação, em
// vez de o conteúdo virar texto literal com ">" na frente.
function isBlockQuoted(el) {
  return el?.dataset?.quoted === 'true';
}

function setBlockQuoted(el, on) {
  if (on) el.dataset.quoted = 'true';
  else { delete el.dataset.quoted; delete el.dataset.callout; }
}

// Destaque (callout) é uma segunda camada em cima da citação: a caixa colorida
// com rótulo dos sites de documentação. No markdown ela é exatamente isso —
// uma citação com um marcador na primeira linha —, então tirar a citação tira
// o destaque junto (ver setBlockQuoted).
// Título sublinhado. Também é decoração, não tipo — senão seriam mais duas
// entradas num menu que já estava grande demais. No arquivo isso vira setext
// (o texto com === ou --- embaixo), que é markdown de verdade.
//
// Só título 1 e 2: é o que o setext alcança, e é onde um traço embaixo lê bem.
const PODE_SUBLINHAR = new Set(['heading1', 'heading2']);

function isBlockUnderlined(el) {
  return el?.dataset?.underlined === 'true';
}

function setBlockUnderlined(el, on) {
  if (on && PODE_SUBLINHAR.has(el.dataset.type)) el.dataset.underlined = 'true';
  else delete el.dataset.underlined;
}

function setBlockCallout(el, tipo) {
  if (tipo && CALLOUT_TYPES.includes(tipo)) {
    el.dataset.quoted  = 'true';
    el.dataset.callout = tipo;
  } else {
    delete el.dataset.callout;
  }
}

// ── Profundidade (indentação) ─────────────────────────────────────────────────
// O nível vive num atributo de verdade (data-depth), não numa propriedade do
// elemento: o desfazer restaura por innerHTML, e só atributo volta junto.
// Nível 0 não escreve atributo nenhum — a nota de quem nunca indentou nada
// continua exatamente com a mesma forma de antes.
function blockDepth(el) {
  const d = Number(el?.dataset?.depth) || 0;
  return Math.min(Math.max(d, 0), MAX_DEPTH);
}

function setBlockDepth(el, depth) {
  const d = Math.min(Math.max(Math.round(depth) || 0, 0), MAX_DEPTH);
  if (d) el.dataset.depth = String(d);
  else delete el.dataset.depth;
}

// Fecha a escada depois de qualquer mudança de ordem — arrastar um bloco de
// nível 2 pro topo deixaria um nível sem pai.
function normalizeDepths() {
  let anterior = -1;
  for (const block of root.children) {
    const d = Math.min(blockDepth(block), anterior + 1);
    setBlockDepth(block, d);
    anterior = d;
  }
}

// Move os blocos um nível, pra dentro ou pra fora.
//
// A regra que decide tudo é quem é passageiro e quem tem vida própria:
//
// - Um bloco NÃO selecionado que está dentro de um selecionado é passageiro.
//   Acompanha o dono, senão ficaria órfão num nível que deixou de existir.
// - Um bloco SELECIONADO responde por si, mesmo sendo filho de outro
//   selecionado. É isso que faz Shift+Tab num grupo indentado inteiro subir um
//   nível por vez: antes o primeiro bloco do grupo era tratado como dono de
//   todos, e como ele já estava na margem e não tinha pra onde subir, ele
//   travava o grupo inteiro e a tecla não fazia nada.
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

// Blocos que o Tab deve mover: a seleção múltipla quando existe, senão o
// bloco do cursor.
function blocksForIndent() {
  if (selectedBlockIds.size > 0) {
    return orderedBlocks().filter(b => selectedBlockIds.has(b.dataset.id));
  }
  const block = currentBlock();
  return block ? [block] : [];
}

// ── Imagem e mídia (delegado para note-media.js) ───────────────────────────
initNoteMedia({
  getRoot: () => root,
  getCurrentNoteId: () => currentNoteId,
  captureUndoPoint,
  scheduleSave,
});

// Base64 → arquivo. Chega assim de um .md importado, de uma colagem de texto
// ou de um modelo compartilhado. A decodificação é na mão (atob) em vez de
// fetch('data:...') pra não depender da política de conexão da extensão.
function dataUrlToFile(dataUrl, alt) {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl ?? '');
  if (!m) return null;
  const [, mime, base64, dados] = m;
  try {
    let bytes;
    if (base64) {
      const bin = atob(dados);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(dados));
    }
    const ext  = ({ jpeg: 'jpg' }[mime.split('/')[1]] ?? mime.split('/')[1] ?? 'png');
    const nome = `${(alt || 'imagem').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40)}.${ext}`;
    return new File([bytes], nome, { type: mime });
  } catch {
    return null;   // base64 truncado num .md editado à mão
  }
}

// Toda imagem que entra por markdown de fora vira arquivo ANTES de chegar ao
// DOM. Base64 dentro do bloco significaria a nota inteira regravada a cada
// pausa na digitação e cada instantâneo de desfazer carregando megabytes.
export async function absorbDataUrls(blocks, noteId = undefined) {
  if (!blocks.some(b => b.type === 'image' && b.dataUrl)) return blocks;

  const destino = noteId === undefined ? currentNoteId : noteId;
  const out = [];
  for (const b of blocks) {
    if (b.type !== 'image' || !b.dataUrl) { out.push(b); continue; }
    const file = dataUrlToFile(b.dataUrl, b.alt);
    if (!file) { out.push({ ...b, dataUrl: undefined }); continue; }
    const fileId = await saveFile(file, destino, { inline: true });
    out.push({ type: 'image', alt: b.alt, fileId, depth: b.depth, quoted: b.quoted });
  }
  return out;
}

// Um arquivo de imagem (colado, arrastado ou escolhido) vira bloco na nota.
async function insertImageFile(file, atBlock) {
  return insertMediaFile(file, atBlock, 'image');
}

// Mesma ideia da imagem: guarda o Blob (saveFile já é genérico, não sabe nem
// precisa saber o tipo), cria o bloco e deixa uma linha embaixo pra continuar
// escrevendo.
async function insertMediaFile(file, atBlock, type) {
  const fileId = await saveFile(file, currentNoteId, { inline: true });
  const bloco  = atBlock ?? currentBlock() ?? root.lastElementChild;
  if (!bloco) return null;

  captureUndoPoint();
  const el = createBlockElFrom({ type, fileId, alt: '', depth: blockDepth(bloco) });

  const vazio = !NO_TEXT_TYPES.has(bloco.dataset.type)
    && !getContentEl(bloco).textContent.trim();
  if (vazio) bloco.replaceWith(el);
  else bloco.after(el);

  // Sempre deixa uma linha logo abaixo: senão não há onde continuar a escrever
  // quando o bloco é o último da nota.
  if (!el.nextElementSibling) el.after(createBlockEl('paragraph'));
  focusBlockEnd(el.nextElementSibling);
  renumberLists();
  scheduleSave();
  return el;
}

// Leva o cursor pro fim do bloco. Tabela e divisor não têm "fim" onde o cursor
// caiba: na tabela o destino é a primeira célula, e depois de um divisor a
// gente garante um parágrafo em que dê pra escrever.
function focusBlockEnd(block) {
  if (!block) return;
  if (block.dataset.type === 'table') {
    focusCell(block.querySelector('.table-cell'));
    return;
  }
  // Imagem, áudio e vídeo não recebem cursor de texto: o destino é a linha
  // seguinte, e se não houver uma (ou for outro bloco do mesmo tipo), cria.
  if (block.dataset.type === 'image' || block.dataset.type === 'audio' || block.dataset.type === 'video') {
    let next = block.nextElementSibling;
    if (!next || next.dataset.type === block.dataset.type) {
      next = createBlockEl('paragraph');
      block.after(next);
    }
    focusBlockEnd(next);
    return;
  }
  const content = getContentEl(block);
  content.focus();
  setCaretOffset(content, content.textContent.length);
}

// ── Tabela (delegado para note-table.js) ──────────────────────────────────
initNoteTable({
  getRoot: () => root,
  captureUndoPoint,
  scheduleSave,
  escHtml,
  createBlockEl,
  currentBlock,
  getContentEl,
  renumberLists,
});

// Esvazia o conteúdo de um bloco mantendo o <br> de segurança (ver createBlockEl).
function clearContent(el) {
  el.innerHTML = '';
  el.appendChild(document.createElement('br'));
}

function convertBlockType(blockEl, newType, checked = false) {
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
  oldContent.querySelectorAll(':scope > .md-syntax-prefix').forEach(el => {
    const text = el.textContent;
    let extra = '';
    const mCall = /^((?:>\s*)?\[!(?:note|tip|important|warning|caution)\][ \t]?)(.*)$/is.exec(text);
    const mHead = /^(#{1,6}[ \t]?)(.*)$/s.exec(text);
    const mQuote = /^(>[ \t]?)(.*)$/s.exec(text);
    if (mCall && mCall[2]) extra = mCall[2];
    else if (mHead && mHead[2]) extra = mHead[2];
    else if (mQuote && mQuote[2]) extra = mQuote[2];
    if (extra) el.after(document.createTextNode(extra));
  });
  oldContent.querySelectorAll(':scope > .md-syntax-prefix').forEach(p => p.remove());
  const newBlock = createBlockEl(newType, oldContent.innerHTML, checked);
  setBlockDepth(newBlock, blockDepth(blockEl));
  setBlockQuoted(newBlock, isBlockQuoted(blockEl));
  setBlockCallout(newBlock, blockEl.dataset.callout);
  // O sublinhado só sobrevive entre tipos que o suportam — virar parágrafo o
  // descarta, que é o esperado.
  setBlockUnderlined(newBlock, isBlockUnderlined(blockEl));
  blockEl.replaceWith(newBlock);
  return newBlock;
}

// Marcadores de lista. Roda depois de qualquer mudança estrutural, então é
// também onde a escada de indentação é fechada — assim a regra vale nos 25
// pontos que já chamavam esta função, sem precisar lembrar de cada um.
// Marca a primeira e a última linha de cada sequência de destaque. São elas que
// recebem o rótulo e os cantos arredondados, pra que várias linhas seguidas
// leiam como uma caixa só.
//
// Isso não é feito em CSS porque "não vir depois de um destaque DO MESMO TIPO"
// exigiria uma regra por tipo — e ainda assim erraria com dois destaques de
// tipos diferentes colados, que é justamente quando o rótulo mais importa.
function markCalloutEdges() {
  const blocos = [...root.children];
  for (let i = 0; i < blocos.length; i++) {
    const tipo = blocos[i].dataset.callout ?? null;
    if (!tipo) {
      delete blocos[i].dataset.calloutFirst;
      delete blocos[i].dataset.calloutLast;
      continue;
    }
    if (tipo !== (blocos[i - 1]?.dataset.callout ?? null)) blocos[i].dataset.calloutFirst = 'true';
    else delete blocos[i].dataset.calloutFirst;

    if (tipo !== (blocos[i + 1]?.dataset.callout ?? null)) blocos[i].dataset.calloutLast = 'true';
    else delete blocos[i].dataset.calloutLast;
  }
}

// Avalia cada folha de cálculo e escreve o resultado ao lado de cada linha.
//
// A folha é a sequência contígua de blocos `calc` — mesma ideia das pontas do
// destaque. É ela o escopo das variáveis: uma linha de texto ou um parágrafo
// no meio encerram uma folha e começam outra, então nada de um bloco lá em
// cima mexer numa conta muito abaixo.
function recalcCalcSheets() {
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
      if (el) {
        el.textContent = r.tipo === 'valor' ? r.fmt : (r.tipo === 'erro' ? r.erro : '');
        el.classList.remove('copiado');
        // O título só existe quando há um valor: é ele, junto com o cursor de
        // mão, que promete "clique pra copiar". Erro e linha de texto não têm
        // o que copiar, e um alvo que promete e não entrega é pior que alvo
        // nenhum.
        if (r.tipo === 'valor') el.title = 'Clique para copiar';
        else el.removeAttribute('title');
      }

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

// ── Undo / redo próprios (delegado para note-history.js) ──────────────────────
initNoteHistory({
  getRoot: () => root,
  renumberLists,
  refreshChecklistStates,
  getContentEl,
  setCaretOffset,
  scheduleSave,
});

// ── Detecção com debounce (não recalcula a cada tecla, só quando pausa) ──────
export function scheduleRescan(block) {
  rescanBlock = block;
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(flushRescan, 500);
}

function flushRescan() {
  clearTimeout(rescanTimer);
  if (!rescanBlock) return;
  const block = rescanBlock;
  rescanBlock = null;
  if (!document.body.contains(block)) return;
  if (NO_DETECTION.has(block.dataset.type)) return;

  const content = getContentEl(block);
  const sel = document.getSelection();
  const hadFocus = sel && content.contains(sel.anchorNode);
  const caretOffset = hadFocus ? getCaretOffset(content) : null;

  unwrapMarks(content);
  applyDetectionMarks(content);

  if (hadFocus && caretOffset !== null) setCaretOffset(content, caretOffset);
}

root.addEventListener('blur', () => {
  flushRescan();
  if (livePreviewActiveBlock) { collapseBlockSyntax(livePreviewActiveBlock); livePreviewActiveBlock = null; }
  if (livePreviewActiveInline) { collapseInlineSyntax(livePreviewActiveInline); livePreviewActiveInline = null; }
  if (activeDividerBlock) { commitDivider(activeDividerBlock); activeDividerBlock = null; }
}, true);

// ── Salvamento ────────────────────────────────────────────────────────────────
// `keepBreaks` mantém <br> real (bloco de código, onde é quebra de linha de
// verdade); nos outros tipos o <br> é só o "segurador" de cursor de um bloco
// vazio (ver createBlockEl/clearContent) e não deve ser persistido.
function sanitizeForSave(html, keepBreaks = false) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('mark').forEach(m => m.replaceWith(...m.childNodes));
  div.querySelectorAll('.md-syntax-prefix').forEach(el => {
    const text = el.textContent;
    let extra = '';
    const mCall = /^((?:>\s*)?\[!(?:note|tip|important|warning|caution)\][ \t]?)(.*)$/is.exec(text);
    const mHead = /^(#{1,6}[ \t]?)(.*)$/s.exec(text);
    const mQuote = /^(>[ \t]?)(.*)$/s.exec(text);
    if (mCall && mCall[2]) extra = mCall[2];
    else if (mHead && mHead[2]) extra = mHead[2];
    else if (mQuote && mQuote[2]) extra = mQuote[2];
    if (extra) el.after(document.createTextNode(extra));
  });
  div.querySelectorAll('.md-syntax-prefix, .md-syntax').forEach(el => el.remove());
  div.querySelectorAll('.md-token-open, .is-active, .md-inline-active').forEach(el => {
    el.classList.remove('md-token-open', 'is-active', 'md-inline-active');
  });
  // Link é o único elemento que carrega dado do usuário num atributo. Aqui é o
  // funil por onde passa tudo que é persistido — inclusive HTML colado de fora
  // —, então é onde href hostil e atributos de evento morrem.
  div.querySelectorAll('a').forEach(a => {
    const rawHref = a.getAttribute('href');
    const href = safeHref(rawHref);
    if (!href) { a.replaceWith(...a.childNodes); return; }
    const ehNota = /^nota:/i.test(href);
    const existingTitle = a.getAttribute('data-note-title');
    [...a.attributes].forEach(attr => a.removeAttribute(attr.name));
    a.setAttribute('href', href);
    if (ehNota) {
      a.className = 'note-internal-link';
      let titulo = existingTitle;
      if (!titulo) {
        const rawTarget = href.replace(/^nota:/i, '');
        try { titulo = decodeURIComponent(rawTarget); } catch { titulo = rawTarget; }
      }
      a.dataset.noteTitle = titulo;
      a.title = `Ctrl+clique para abrir nota: ${titulo}`;
    }
  });
  if (!keepBreaks) div.querySelectorAll('br').forEach(br => br.remove());
  // Âncora invisível da formatação ao digitar (ver replaceRangeWithTag): ela é
  // um detalhe do cursor e nunca pode virar conteúdo salvo. Aqui é o funil por
  // onde tudo passa, então é o lugar certo pra garantir isso.
  div.innerHTML = div.innerHTML.split(ANCORA).join('');
  div.normalize();
  return div.innerHTML;
}

export function serializeBlockEl(block) {
  const type = block.dataset.type;
  const b = { id: block.dataset.id, type };
  const depth = blockDepth(block);
  if (depth) b.depth = depth;   // ausente = nível 0, que é o formato de antes
  if (isBlockQuoted(block)) b.quoted = true;
  if (block.dataset.callout) b.callout = block.dataset.callout;
  if (isBlockUnderlined(block)) b.underlined = true;
  if (type === 'divider') return b;
  if (type === 'image') {
    const fileId = Number(block.dataset.fileId);
    if (Number.isFinite(fileId)) b.fileId = fileId;
    if (block.dataset.imagePath) b.imagePath = block.dataset.imagePath;
    if (block.dataset.alt) b.alt = block.dataset.alt;
    if (block.dataset.width) b.width = Number(block.dataset.width);
    if (block.dataset.height) b.height = Number(block.dataset.height);
    return b;
  }
  if (type === 'audio' || type === 'video') {
    const fileId = Number(block.dataset.fileId);
    if (Number.isFinite(fileId)) b.fileId = fileId;
    if (block.dataset.alt) b.alt = block.dataset.alt;
    if (type === 'video' && block.dataset.width) b.width = Number(block.dataset.width);
    if (type === 'video' && block.dataset.height) b.height = Number(block.dataset.height);
    return b;
  }
  if (type === 'table') {
    b.rows = [...block.querySelectorAll('tr')].map(tr =>
      [...tr.children].map(cell => sanitizeForSave(cell.innerHTML)));
    return b;
  }
  if (type === 'base') {
    b.config = block.dataset.config ?? '';
    return b;
  }
  b.html = sanitizeForSave(getContentEl(block).innerHTML, type === 'code');
  if (type === 'checklist') b.checked = block.dataset.checked === 'true';
  return b;
}

function serializeBlocks() {
  return [...root.children].map(serializeBlockEl);
}

// Blocos da nota atual, prontos pra exportar/copiar (blocksToMarkdown /
// blocksToPlainText, em blocks.js) — lê direto do DOM ao vivo, sempre atual.
export function getCurrentBlocks() {
  return serializeBlocks();
}

function showSaved() {
  indicator.innerHTML = `salvo ${iconSvg('check')}`;
  indicator.classList.add('visible');
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => indicator.classList.remove('visible'), 2200);
}

// ── Modo modelo ───────────────────────────────────────────────────────────────
// Editar um modelo usa o editor de verdade, não um textarea de markdown: o
// usuário mexe em checkbox, tabela e menu "/" do mesmo jeito que numa nota.
// A diferença é que aqui não há autosave — modelo só grava no botão Salvar,
// senão "Cancelar" não teria como voltar atrás.
let editingTemplate = null;

export function isEditingTemplate() { return !!editingTemplate; }

export async function openTemplateInEditor(tpl) {
  await flushSave();                 // grava a nota que estava aberta
  editingTemplate = { id: tpl.id };
  renderBlocks(await absorbDataUrls(parseMarkdownToBlocks(tpl.content ?? '')));
  resetUndoHistory();
  focusBlockStart(root.firstElementChild);
}

export function currentTemplateMarkdown() {
  return blocksToMarkdown(serializeBlocks());
}

// Markdown pronto pra sair da extensão: a imagem vai embutida em base64, pra
// que o arquivo abra em qualquer lugar sem depender do banco daqui.
export async function blocksToExportMarkdown(blocks) {
  return blocksToMarkdownForExport(blocks, async fileId => {
    const blob = await loadFileBlob(fileId);
    if (!blob) return null;
    return new Promise(resolve => {
      const leitor = new FileReader();
      leitor.onload  = () => resolve(leitor.result);
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  });
}

export function clearTemplateEditing() { editingTemplate = null; }

export function scheduleSave() {
  if (editingTemplate) return;
  scheduleOutlineUpdate();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 800);
}

export async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  flushRescan();
  if (editingTemplate || currentNoteId == null) return;
  const blocks = serializeBlocks();
  // Markdown completo (não só texto simples) — é o que permite recuperar
  // negrito/itálico/etc. se a nota precisar ser reconstruída a partir desse
  // campo (fallback de portabilidade).
  const content = blocksToMarkdown(blocks);
  await updateNoteBlocksById(currentNoteId, blocks, content);
  showSaved();

  // Indexa os links da nota salva no Dexie v10
  try {
    const note = await getNoteById(currentNoteId);
    if (note && note.uid) {
      const todasNotas = await loadAllNotesMeta();
      const refs = extrairLinksDeBlocos(blocks);
      const linksResolvidos = resolverLinks(refs, note.uid, todasNotas);
      await salvarLinksDaNota(note.uid, linksResolvidos);
      await refreshBacklinks(currentNoteId);
    }
  } catch (err) {
    console.warn('Erro ao indexar links da nota:', err);
  }
  renderOutline();

  // Avisa quem mantém uma visão derivada de TODAS as notas (Grafo/Constelações)
  // que os links desta nota acabaram de ser reindexados — dispara mesmo sem
  // mudança real de conteúdo (flushSave roda ao trocar de nota também), mas
  // quem escuta só faz trabalho de verdade se estiver com o painel aberto.
  document.dispatchEvent(new CustomEvent('quickdock:notes-changed'));
}

export function getCurrentNoteId() {
  return currentNoteId;
}

// Usado pelo painel dedicado de Base (bases-view.js) quando a nota aberta não
// tem nenhum bloco de base ainda — reaproveita createBlockEl('base') (mesma
// função que o menu "/" já usa) pra não duplicar o que é "uma base nova".
export async function appendBaseBlockToCurrentNote() {
  if (currentNoteId == null) return false;
  captureUndoPoint();
  const bloco = createBlockEl('base');
  root.appendChild(bloco);
  root.appendChild(createBlockEl('paragraph'));
  renumberLists();
  await flushSave();
  return true;
}

// O painel dedicado de Base escreve a config nova direto no dataset do bloco
// embutido (mesmo elemento que o editor já serializa) e só pede pra gravar
// por aqui — evita ter dois escritores diferentes tentando salvar a mesma
// nota (o autosave normal, disparado por qualquer tecla, sempre serializa o
// DOM vivo do editor; gravar direto no banco por fora seria apagado por ele).
export function requestSaveFromExternalEdit() {
  scheduleSave();
}

export function isEditorFocused() {
  return !!noteEditorEl?.contains(document.activeElement);
}

export function hasPendingSave() {
  return saveTimer !== null;
}

export function canSafelyReloadCurrentNote() {
  return !isEditingTemplate() && !isEditorFocused() && !hasPendingSave();
}

// Esvazia a nota aberta. Tem que passar pelo editor: escrever direto no banco
// não adianta, porque o autosave seguinte serializaria o DOM antigo por cima.
export async function clearCurrentNote() {
  clearTimeout(saveTimer);
  renderBlocks(parseMarkdownToBlocks(''));
  await flushSave();
}

// ── Carregar / trocar de nota ───────────────────────────────────────────────────
function renderBlocks(blocks) {
  revokeImageURLs();
  root.innerHTML = '';
  for (const b of blocks) root.appendChild(createBlockElFrom(b));
  if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));
  renumberLists();
  refreshChecklistStates();

  for (const block of root.children) {
    if (NO_DETECTION.has(block.dataset.type)) continue;
    applyDetectionMarks(getContentEl(block));
  }

  resetUndoHistory(); // histórico de undo é por nota, não deve vazar de uma pra outra
}

// `descartarDom`: o banco passa a ser a verdade e o que está no editor é jogado
// fora. Só a sincronização usa isso, e ela precisa.
//
// O `flushSave()` abaixo existe para quem TROCA de nota: salva o que você estava
// escrevendo antes de sair. Mas quando a sincronização acaba de gravar a versão
// nova da MESMA nota e manda recarregar, esse flush serializa o DOM antigo por
// cima do que acabou de descer — e o editor então lê de volta justamente o texto
// velho. Na rodada seguinte ele sobe como "alteração local" e desfaz a edição
// feita no outro aparelho. Era isso que estava revertendo as notas.
export async function switchToNote(id, { descartarDom = false } = {}) {
  if (descartarDom) {
    // Sem isso, um autosave já agendado dispararia depois do render e gravaria
    // o DOM antigo assim mesmo.
    clearTimeout(saveTimer);
    saveTimer = null;
  } else {
    await flushSave();
  }
  // Título do cabeçalho pendente de gravar (debounce ainda não estourou):
  // grava agora, na nota que estava aberta — sem isso, trocar de nota rápido
  // depois de digitar um título novo perderia a edição em silêncio.
  flushHeaderTitle();
  editingTemplate = null;            // trocar de nota abandona o modo modelo
  currentNoteId = id;
  if (id == null) {
    revokeImageURLs();
    root.innerHTML = '';
    clearNoteHeader();
    renderOutline();
    // Fechar a última aba nunca disparava este aviso (só ativar uma nota
    // dispara, em notes-tabs.js) — sem isto, quem escuta pra saber "qual nota
    // está aberta agora" (bases-view.js) não sabia que passou a não ter
    // nenhuma.
    document.dispatchEvent(new CustomEvent('quickdock:active-note-changed', { detail: { id: null } }));
    return;
  }
  const note = await getNoteById(id);
  const blocks = (note?.blocks?.length) ? note.blocks : parseMarkdownToBlocks(note?.content ?? '');
  renderBlocks(blocks);
  updateMobileToolbarState();
  renderNoteHeader(note);
  renderPropertiesBar(note);
  atualizarLinksInternos();
  await refreshBacklinks(id);
  renderOutline();
  // Centralizado aqui (não só em notes-tabs.js activateNote()) porque nem
  // toda troca de nota passa por lá — o próprio painel de Base (bases-view-
  // container.js handleCreateNewNote) chama switchToNote() direto. Sem isto,
  // criar uma nota pelo painel de Base trocava a nota ativa mas o painel
  // continuava mostrando a base da nota anterior. Duplica o aviso no caminho
  // que já passa por activateNote() — seguro, quem escuta só re-renderiza.
  document.dispatchEvent(new CustomEvent('quickdock:active-note-changed', { detail: { id } }));
}


// ── Clique em marcação detectada (CPF, data, cálculo…) ou seleção por toque ──
root.addEventListener('click', e => {
  if (!isCtrlHeld && !touchSelectionActive && !isBlockSelectActive) return;

  // Mesmo gesto que abre o menu de CPF/data: com Ctrl ou modo de seleção por toque, clique em link navega.
  // Sem Ctrl/modo toque o clique só posiciona o cursor — senão não dá pra editar o texto.
  const link = e.target.closest('a');
  if (link && root.contains(link)) {
    const rawHref = link.getAttribute('href') || '';
    const href = safeHref(rawHref);
    if (!href) return;
    // Âncora não abre aba nenhuma: rola até o título da própria nota.
    if (href.startsWith('#')) {
      irParaTitulo(href.slice(1));
      return;
    }
    if (href.startsWith('nota:') || link.classList.contains('note-internal-link')) {
      e.preventDefault();
      const targetPath = link.dataset.notePath || null;
      const targetUid = link.dataset.noteUid || null;
      const targetTitle = link.dataset.noteTitle || decodeURIComponent(href.replace(/^nota:/, ''));
      document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
        detail: {
          title: targetTitle,
          path: targetPath || targetTitle,
          uid: targetUid,
          createIfMissing: true
        }
      }));
      return;
    }
    window.open(href, '_blank', 'noopener');
    return;
  }

  const tagEl = e.target.closest('.note-tag, mark.tag');
  if (tagEl && root.contains(tagEl)) {
    const tagValue = tagEl.dataset.tag || tagEl.textContent.replace(/^#/, '').trim();
    if (tagValue) {
      e.preventDefault();
      const searchInput = document.querySelector('.notes-search-input');
      if (searchInput) {
        searchInput.value = `#${tagValue}`;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
      }
      document.dispatchEvent(new CustomEvent('quickdock:search-notes', {
        detail: { query: `#${tagValue}` }
      }));
      return;
    }
  }

  const mark = e.target.closest('mark');
  if (!mark) {
    if (isBlockSelectActive) {
      const block = e.target.closest('.block');
      if (block && root.contains(block)) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedBlockIds.has(block.dataset.id)) {
          selectedBlockIds.delete(block.dataset.id);
          setBlockSelection([...selectedBlockIds]);
        } else {
          selectedBlockIds.add(block.dataset.id);
          setBlockSelection([...selectedBlockIds]);
          lastHandleClickedId = block.dataset.id;
        }
        return;
      }
    } else if (touchSelectionActive) {
      // No modo de seleção por toque, tocar em um bloco (fora de link/mark) seleciona o bloco
      const block = e.target.closest('.block');
      if (block && root.contains(block)) {
        handleHandleClick(block, true);
        e.preventDefault();
      }
    }
    closeCopyMenu();
    return;
  }

  const type = mark.dataset.type;
  const raw  = mark.dataset.value;
  const rect = mark.getBoundingClientRect();

  if (type === 'math') {
    const parsed = mathCache.get(raw);
    if (parsed) showMathMenu(parsed, rect);
    return;
  }
  showCopyMenu(type, raw, rect);
});

// ── Tabela: botões de linha/coluna ───────────────────────────────────────────
// mousedown em capture com preventDefault mantém o cursor na célula — é ele que
// diz qual linha/coluna a ação atinge — e impede que o gesto de arrastar bloco
// interprete o clique como início de arraste.
root.addEventListener('mousedown', e => {
  if (!e.target.closest('.table-btn')) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

root.addEventListener('click', e => {
  const btn = e.target.closest('.table-btn');
  if (!btn) return;
  handleTableButtonClick(btn);
});


// ── Cálculo: clique no resultado copia ────────────────────────────────────────
// O mousedown é cancelado em captura pra que o cursor não saia de onde estava:
// o valor vai pra área de transferência sem tirar a pessoa da linha que ela
// estava escrevendo.
root.addEventListener('mousedown', e => {
  const alvo = e.target.closest('.calc-result');
  if (!alvo || !alvo.title) return;   // sem título = erro ou linha de texto
  e.preventDefault();
}, true);

root.addEventListener('click', async e => {
  const alvo = e.target.closest('.calc-result');
  if (!alvo || !alvo.title) return;

  const valor = alvo.textContent.trim();
  if (!valor) return;
  e.stopPropagation();

  try {
    await navigator.clipboard.writeText(valor);
    // O aviso mais útil é no próprio lugar em que se clicou; o indicador de
    // baixo é o segundo, pra quem estava olhando pra lá.
    alvo.classList.add('copiado');
    setTimeout(() => alvo.classList.remove('copiado'), 900);
    showFeedback('copiado!');
  } catch {
    showFeedback('não deu pra copiar');
  }
});

// ── Imagem: botões de ação e visualizador ─────────────────────────────────────
// O seletor de arquivo é um só, reaproveitado — quem o pediu fica guardado em
// `imagePickerTarget`: null quer dizer "inserir nova", um bloco quer dizer
// "trocar a imagem deste".
const imagePicker = document.createElement('input');
imagePicker.type   = 'file';
imagePicker.accept = 'image/*';
imagePicker.hidden = true;
document.body.appendChild(imagePicker);
let imagePickerIntent = null;   // { trocar: bloco } ou { inserirEm: bloco, tipo? }

const MEDIA_ACCEPT = { image: 'image/*', audio: 'audio/*', video: 'video/*' };

// `tipo` só importa pra "inserir nova" (áudio/vídeo do menu "/") — "trocar"
// continua exclusivo de imagem, é o único caso que usa esse botão hoje.
function pedirImagem(intent, tipo = 'image') {
  imagePickerIntent = { ...intent, tipo };
  imagePicker.accept = MEDIA_ACCEPT[tipo] ?? 'image/*';
  imagePicker.value = '';
  imagePicker.click();
}

imagePicker.addEventListener('change', async () => {
  const file = imagePicker.files?.[0];
  imagePicker.value = '';
  const intent = imagePickerIntent;
  imagePickerIntent = null;
  const tipo = intent?.tipo ?? 'image';
  if (!file || !file.type.startsWith(`${tipo}/`) || !intent) return;

  if (intent.inserirEm) {
    if (tipo !== 'image') { await insertMediaFile(file, intent.inserirEm, tipo); return; }
    await insertImageFile(file, intent.inserirEm);
    return;
  }

  // Trocar: o arquivo antigo não é apagado aqui de propósito — Ctrl+Z traz o
  // bloco anterior de volta e ele precisa achar o arquivo. A faxina de imagem
  // órfã roda na próxima abertura do painel (gcInlineFiles).
  captureUndoPoint();
  const fileId = await saveFile(file, currentNoteId, { inline: true });
  setImageData(intent.trocar, { fileId, alt: intent.trocar.dataset.alt ?? '' });
  scheduleSave();
});

// mousedown em capture: impede que o clique num botão da imagem seja lido como
// começo de arraste de bloco.
root.addEventListener('mousedown', e => {
  if (!e.target.closest('.image-btn')) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

root.addEventListener('click', e => {
  const btn = e.target.closest('.image-btn');
  if (btn) {
    const bloco = btn.closest('.block-image');
    if (!bloco) return;
    e.stopPropagation();

    if (btn.dataset.act === 'replace') { pedirImagem({ trocar: bloco }); return; }

    // Nem toda imagem quer ficar no meio do texto. Aqui ela sai da nota e vira
    // um documento normal, vinculado à mesma nota — some daqui e aparece na
    // seção de baixo, que é onde a pessoa vai procurar por ela em seguida.
    if (btn.dataset.act === 'to-docs') { moverImagemParaDocumentos(bloco); return; }

    if (btn.dataset.act === 'alt') {
      openAltMenu(bloco, btn.getBoundingClientRect());
      return;
    }

    if (btn.dataset.act === 'remove') {
      captureUndoPoint();
      const seguinte = bloco.nextElementSibling ?? bloco.previousElementSibling;
      bloco.remove();
      if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));
      focusBlockEnd(seguinte ?? root.lastElementChild);
      renumberLists();
      scheduleSave();
    }
    return;
  }

  // Clique na própria imagem abre o visualizador, com as outras imagens da
  // nota disponíveis nas setas.
  const img = e.target.closest('.block-image img');
  if (!img) return;
  const bloco  = img.closest('.block-image');
  const fileId = Number(bloco?.dataset.fileId);
  if (!Number.isFinite(fileId)) return;

  const galeria = [...root.querySelectorAll('.block-image')]
    .map(el => ({ id: Number(el.dataset.fileId), name: el.dataset.alt || 'Imagem', type: 'image/*' }))
    .filter(g => Number.isFinite(g.id));

  openModal(fileId, bloco.dataset.alt || 'Imagem', 'image/*', galeria);
});

// Botão "Remover" de áudio/vídeo — ouvinte à parte do da imagem (mesmo
// data-act de "remover" faz o mesmo em espírito, mas aqui não existe
// "trocar"/"texto alternativo" nem visualizador em modal pra reaproveitar).
root.addEventListener('click', e => {
  const btn = e.target.closest('[data-act="remove-media"]');
  if (!btn) return;
  const bloco = btn.closest('.block-audio, .block-video');
  if (!bloco) return;
  e.stopPropagation();
  captureUndoPoint();
  const seguinte = bloco.nextElementSibling ?? bloco.previousElementSibling;
  bloco.remove();
  if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));
  focusBlockEnd(seguinte ?? root.lastElementChild);
  renumberLists();
  scheduleSave();
});

async function moverImagemParaDocumentos(bloco) {
  const fileId = Number(bloco.dataset.fileId);
  if (!Number.isFinite(fileId)) return;

  const movido = await moveInlineFileToDocuments(fileId);
  if (!movido) { showFeedback('não achei o arquivo desta imagem'); return; }

  // O arquivo deixa de ser inline ANTES do bloco sair, pra que a faxina de
  // imagem órfã (gcInlineFiles) nunca o veja sem dono. Um Ctrl+Z aqui traz o
  // bloco de volta e a imagem continua aparecendo — só que agora ela também
  // está nos Documentos, que é o preço de poder desfazer.
  captureUndoPoint();
  const seguinte = bloco.nextElementSibling ?? bloco.previousElementSibling;
  bloco.remove();
  if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));
  focusBlockEnd(seguinte ?? root.lastElementChild);
  renumberLists();
  await flushSave();

  await refreshDocuments();
  showFeedback('imagem movida para Documentos');
}

// Texto alternativo: menu dentro da extensão, não um dialog da página.
function closeAltMenu() {
  _closeAltMenu();
}

function openAltMenu(bloco, anchorRect) {
  _openAltMenu(bloco, anchorRect, {
    captureUndoPoint,
    setImageData,
    scheduleSave,
    positionMenu,
  });
}

document.addEventListener('mousedown', () => closeAltMenu());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAltMenu(); });

// ── Arrastar imagem pra dentro do editor ──────────────────────────────────────
root.addEventListener('dragover', e => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  root.classList.add('editor-drop');
});

root.addEventListener('dragleave', e => {
  if (!root.contains(e.relatedTarget)) root.classList.remove('editor-drop');
});

root.addEventListener('drop', async e => {
  root.classList.remove('editor-drop');
  const arquivos = [...(e.dataTransfer?.files ?? [])]
    .map(f => ({ file: f, tipo: f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('video/') ? 'video' : null }))
    .filter(x => x.tipo);
  if (arquivos.length === 0) return;   // outro tipo de arquivo é assunto dos Documentos

  e.preventDefault();
  e.stopPropagation();
  let alvo = blockNearestToY(e.clientY) ?? root.lastElementChild;
  for (const { file, tipo } of arquivos) alvo = (await insertMediaFile(file, alvo, tipo)) ?? alvo;
});

// ── Checklist aninhada ────────────────────────────────────────────────────────
// Marcar um item marca tudo que está dentro dele, e completar os itens de
// dentro completa o de fora. Isso é comportamento de edição, não formato: o
// que fica gravado continua sendo "- [x]" comum, então um .md exportado daqui
// abre igual em qualquer lugar — markdown não tem (nem teria como ter) essa
// relação entre linhas.
//
// O "meio marcado" do pai (o tracinho) é só visual: não existe em markdown e
// sai como "- [ ]" na exportação, que é a única forma fiel possível.

function checkboxDe(block) {
  return block.querySelector(':scope > .block-marker input[type="checkbox"]');
}

// Filhos diretos: os checklists exatamente um nível abaixo, até onde a escada
// voltar pro nível do próprio bloco.
function checklistFilhos(block) {
  const base = blockDepth(block);
  const filhos = [];
  for (let n = block.nextElementSibling; n && blockDepth(n) > base; n = n.nextElementSibling) {
    if (blockDepth(n) === base + 1 && n.dataset.type === 'checklist') filhos.push(n);
  }
  return filhos;
}

function checklistPai(block) {
  const base = blockDepth(block);
  if (base === 0) return null;
  for (let n = block.previousElementSibling; n; n = n.previousElementSibling) {
    if (blockDepth(n) < base) return n.dataset.type === 'checklist' ? n : null;
  }
  return null;
}

function marcarChecklist(block, checked) {
  block.dataset.checked = checked ? 'true' : 'false';
  const cb = checkboxDe(block);
  if (cb) { cb.checked = checked; cb.indeterminate = false; }
}

function propagarParaBaixo(block, checked) {
  for (const filho of checklistFilhos(block)) {
    marcarChecklist(filho, checked);
    propagarParaBaixo(filho, checked);
  }
}

// Sobe recalculando: o pai fica marcado só quando todos os filhos estão, e
// "meio marcado" quando alguns estão (ou quando algum filho está meio marcado).
function propagarParaCima(block) {
  for (let pai = checklistPai(block); pai; pai = checklistPai(pai)) {
    const filhos = checklistFilhos(pai);
    if (filhos.length === 0) return;

    const marcados = filhos.filter(f => f.dataset.checked === 'true').length;
    const parciais = filhos.some(f => checkboxDe(f)?.indeterminate);
    const todos    = marcados === filhos.length && !parciais;

    marcarChecklist(pai, todos);
    const cb = checkboxDe(pai);
    if (cb && !todos && (marcados > 0 || parciais)) cb.indeterminate = true;
  }
}

// Ao abrir a nota, o "meio marcado" é recalculado a partir dos filhos — ele é
// estado de tela e não existe no que foi gravado. O que NÃO se faz aqui é
// mexer no marcado/desmarcado de ninguém: abrir uma nota não pode alterar o
// que está escrito nela.
function refreshChecklistStates() {
  for (const block of root.children) {
    if (block.dataset.type !== 'checklist') continue;
    const cb = checkboxDe(block);
    if (!cb || block.dataset.checked === 'true') continue;
    const filhos = checklistFilhos(block);
    cb.indeterminate = filhos.length > 0 && filhos.some(f => f.dataset.checked === 'true');
  }
}

// ── Checklist: clique direto na caixa (sem precisar de Ctrl) ──────────────────
root.addEventListener('change', e => {
  if (!e.target.matches('input[type="checkbox"]')) return;
  const block = getBlockFromNode(e.target);
  if (!block) return;

  // Um clique pode mexer em vários blocos, então vira um passo só de desfazer.
  captureUndoPoint();
  marcarChecklist(block, e.target.checked);
  propagarParaBaixo(block, e.target.checked);
  propagarParaCima(block);
  scheduleSave();
});

// ── Copiar ─────────────────────────────────────────────────────────────────
// Cada linha da nota é um elemento de bloco separado (<p>, <div>…) — o
// navegador, ao copiar uma seleção que atravessa vários blocos, insere uma
// linha em branco entre cada um (é assim que ele serializa "parágrafos" em
// texto puro). Aqui a gente monta o texto copiado na mão, uma quebra de
// linha simples por bloco, pra colar em outro lugar sair igual ao que
// aparece na tela.
function textForBlockInSelection(block, isFirst, isLast, range) {
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

// ── Menu "/" (trocar tipo de bloco) ───────────────────────────────────────────
// Os tipos de bloco, em grade e agrupados.
//
// Eram dezoito numa lista de uma coluna, e o menu virou uma rolagem sem fim —
// achar "Tabela" custava mais que criar a tabela. Em três colunas os mesmos
// dezoito cabem em sete linhas, e o grupo diz de cara em que vizinhança
// procurar.
//
// ── Menu Slash & Tipos de Bloco (delegado para note-slash-menu.js) ────────────


// ── Modelos de bloco ──────────────────────────────────────────────────────────
// O markdown do modelo passa pelo mesmo parser da importação, então checklist,
// título e tabela chegam como blocos de verdade, não como texto.
export async function insertTemplateBlocks(markdown, atBlock) {
  const els = (await absorbDataUrls(parseMarkdownToBlocks(markdown))).map(createBlockElFrom);
  if (els.length === 0 || !atBlock) return;

  // Numa linha vazia o modelo ocupa o lugar dela, em vez de deixar um
  // parágrafo em branco pendurado acima.
  const vazio = atBlock.dataset.type !== 'table' && !getContentEl(atBlock).textContent.trim();
  let ref = atBlock;
  if (vazio) {
    atBlock.replaceWith(els[0]);
    ref = els[0];
    for (const el of els.slice(1)) { ref.after(el); ref = el; }
  } else {
    for (const el of els) { ref.after(el); ref = el; }
  }

  for (const el of els) {
    if (!NO_DETECTION.has(el.dataset.type)) applyDetectionMarks(getContentEl(el));
  }

  focusBlockEnd(els[els.length - 1]);

  renumberLists();
  scheduleSave();
}

document.addEventListener('quickdock:insert-template-blocks', e => {
  const { content } = e.detail || {};
  if (!content) return;
  captureUndoPoint();
  const target = currentBlock() || getLastFocusedBlock() || root.lastElementChild;
  if (target) insertTemplateBlocks(content, target);
});

// ── Menu Slash (delegado para note-slash-menu.js) ─────────────────────────
initNoteSlashMenu({
  getContentEl,
  clearContent,
  captureUndoPoint,
  insertTemplateBlocks,
  pedirImagem,
  createBlockEl,
  convertBlockType,
  focusCell,
  focusBlockStart,
  renumberLists,
});


// ── Obsidian Live Preview Engine ─────────────────────────────────────────────
let livePreviewActiveBlock = null;
let livePreviewActiveInline = null;
let activeDividerBlock = null;

// Sai do modo "texto cru" de um divisor: se o texto ainda for --- / *** / ___
// continua divisor (só esconde a edição); senão vira parágrafo com o que foi
// digitado, ou some se ficou vazio.
function commitDivider(block) {
  block.classList.remove('is-active');
  if (!document.body.contains(block)) return;
  const content = getContentEl(block);
  const text = content.textContent.trim();
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(text)) return;
  if (text === '') {
    const prev = block.previousElementSibling ?? block.nextElementSibling;
    block.remove();
    if (prev) focusBlockEnd(prev);
  } else {
    const para = convertBlockType(block, 'paragraph');
    getContentEl(para).textContent = text;
  }
}

// Mantém no máximo um divisor "aberto" por vez, decidido por onde o cursor
// está agora — chamada a cada seleção nova (ver updateLivePreviewState).
function syncDividerActiveState(block) {
  if (block === activeDividerBlock) return;
  const prev = activeDividerBlock;
  activeDividerBlock = (block?.dataset.type === 'divider') ? block : null;
  if (prev) commitDivider(prev);
  if (activeDividerBlock) activeDividerBlock.classList.add('is-active');
}

export function revealBlockSyntax(block) {
  if (!block) return;
  const type = block.dataset.type;
  const isHeading = HEADING_TAGS[type];
  const isQuoted = isBlockQuoted(block);
  const callout = block.dataset.callout;

  if (!isHeading && !isQuoted && !callout) return;

  const contentEl = getContentEl(block);
  if (!contentEl) return;
  if (contentEl.querySelector(':scope > .md-syntax-prefix')) return;

  const prefixSpan = document.createElement('span');
  prefixSpan.className = 'md-syntax-prefix';
  prefixSpan.contentEditable = 'true';

  if (callout) {
    prefixSpan.textContent = `> [!${callout.toUpperCase()}] `;
    prefixSpan.dataset.syntaxType = 'callout';
    prefixSpan.classList.add('md-syntax-callout');
  } else if (isHeading) {
    const level = Number(type.replace('heading', ''));
    prefixSpan.textContent = '#'.repeat(level) + ' ';
    prefixSpan.dataset.syntaxType = 'heading';
  } else if (isQuoted) {
    prefixSpan.textContent = '> ';
    prefixSpan.dataset.syntaxType = 'quote';
  }

  contentEl.prepend(prefixSpan);
  if (!prefixSpan.nextSibling) {
    prefixSpan.after(document.createTextNode(ANCORA));
  }
}

export function collapseBlockSyntax(block) {
  if (!block) return;
  const contentEl = getContentEl(block);
  if (!contentEl) return;
  contentEl.querySelectorAll(':scope > .md-syntax-prefix').forEach(p => {
    const text = p.textContent;
    let extra = '';
    const mCall = /^((?:>\s*)?\[!(?:note|tip|important|warning|caution)\][ \t]?)(.*)$/is.exec(text);
    const mHead = /^(#{1,6}[ \t]?)(.*)$/s.exec(text);
    const mQuote = /^(>[ \t]?)(.*)$/s.exec(text);
    if (mCall && mCall[2]) extra = mCall[2];
    else if (mHead && mHead[2]) extra = mHead[2];
    else if (mQuote && mQuote[2]) extra = mQuote[2];
    if (extra) p.after(document.createTextNode(extra));
    p.remove();
  });
}

const INLINE_SYNTAX_MAP = {
  STRONG: '**',
  B: '**',
  EM: '*',
  I: '*',
  S: '~~',
  STRIKE: '~~',
  DEL: '~~',
  CODE: '`',
};

export function revealInlineSyntax(inlineEl) {
  if (!inlineEl) return;
  if (inlineEl.querySelector(':scope > .md-syntax-open')) return;

  const href = inlineEl.getAttribute?.('href') || '';
  const isWiki = inlineEl.classList?.contains('note-internal-link') || (inlineEl.tagName === 'A' && /^nota:/i.test(href));
  if (inlineEl.tagName === 'A' && !isWiki) {
    const openSpan = document.createElement('span');
    openSpan.className = 'md-syntax md-syntax-open';
    openSpan.contentEditable = 'true';
    openSpan.textContent = '[';

    const closeSpan = document.createElement('span');
    closeSpan.className = 'md-syntax md-syntax-close';
    closeSpan.contentEditable = 'true';
    closeSpan.innerHTML = `](<span class="md-syntax-link-href" contenteditable="true">${escHtml(href)}</span>)`;

    inlineEl.prepend(openSpan);
    inlineEl.append(closeSpan);
    inlineEl.classList.add('md-token-open');
    return;
  }

  const openSyntax = isWiki ? '[[' : INLINE_SYNTAX_MAP[inlineEl.tagName];
  const closeSyntax = isWiki ? ']]' : openSyntax;

  if (!openSyntax) return;

  const openSpan = document.createElement('span');
  openSpan.className = 'md-syntax md-syntax-open';
  openSpan.contentEditable = 'true';
  openSpan.textContent = openSyntax;

  const closeSpan = document.createElement('span');
  closeSpan.className = 'md-syntax md-syntax-close';
  closeSpan.contentEditable = 'true';
  closeSpan.textContent = closeSyntax;

  inlineEl.prepend(openSpan);
  inlineEl.append(closeSpan);
  inlineEl.classList.add('md-token-open');
}

export function collapseInlineSyntax(inlineEl) {
  if (!inlineEl) return;
  const href = inlineEl.getAttribute?.('href') || '';
  const isWiki = inlineEl.classList?.contains('note-internal-link') || (inlineEl.tagName === 'A' && /^nota:/i.test(href));
  if (inlineEl.tagName === 'A' && !isWiki) {
    const hrefSpan = inlineEl.querySelector('.md-syntax-link-href');
    if (hrefSpan) {
      const newHref = hrefSpan.textContent.trim();
      if (newHref) {
        inlineEl.setAttribute('href', safeHref(newHref) || newHref);
      }
    }
  }
  inlineEl.querySelectorAll(':scope > .md-syntax').forEach(s => s.remove());
  inlineEl.classList.remove('md-token-open');
}

export function updateLivePreviewState() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) {
    if (livePreviewActiveBlock) { collapseBlockSyntax(livePreviewActiveBlock); livePreviewActiveBlock = null; }
    if (livePreviewActiveInline) { collapseInlineSyntax(livePreviewActiveInline); livePreviewActiveInline = null; }
    syncDividerActiveState(null);
    return;
  }

  const anchor = sel.anchorNode;
  if (!anchor || !root.contains(anchor)) {
    if (livePreviewActiveBlock) { collapseBlockSyntax(livePreviewActiveBlock); livePreviewActiveBlock = null; }
    if (livePreviewActiveInline) { collapseInlineSyntax(livePreviewActiveInline); livePreviewActiveInline = null; }
    syncDividerActiveState(null);
    return;
  }

  const block = getBlockFromNode(anchor);
  syncDividerActiveState(block);
  if (block !== livePreviewActiveBlock) {
    if (livePreviewActiveBlock) collapseBlockSyntax(livePreviewActiveBlock);
    livePreviewActiveBlock = block;
    if (block) revealBlockSyntax(block);
  }

  const inline = findNearestInlineFormatting(anchor, root);

  if (inline !== livePreviewActiveInline) {
    if (livePreviewActiveInline) collapseInlineSyntax(livePreviewActiveInline);
    livePreviewActiveInline = inline;
    if (inline) revealInlineSyntax(inline);
  }
}

// ── Atalhos de Markdown → tipo de bloco ───────────────────────────────────────
const BLOCK_SHORTCUTS = [
  { re: /^(#{1,6}) (.*)$/s, type: m => `heading${m[1].length}`, prefixLen: m => m[1].length + 1 },
  // Sem hífen na frente de propósito: "- [ ] " nunca dispara, porque "- "
  // sozinho já vira lista de marcador antes de "[ ] " terminar de ser digitado
  // (o atalho roda a cada tecla). "[]"/"[ ]"/"[x] " direto evita a corrida.
  { re: /^\[([ xX]?)\] (.*)$/s, type: () => 'checklist', checked: m => /[xX]/.test(m[1]), prefixLen: m => m[1].length + 3 },
  { re: /^[-*] (?!\[)(.*)$/s, type: () => 'bullet', prefixLen: () => 2 },
  { re: /^\d+\. (.*)$/s, type: () => 'number', prefixLen: m => m[0].length - m[1].length },
  { re: /^> (.*)$/s, type: () => 'quote', prefixLen: () => 2 },
  // A palavra-chave é a do markdown (inglês), igual à que vai pro arquivo.
  { re: /^\[!(note|tip|important|warning|caution)\] (.*)$/is, type: m => `callout:${m[1].toLowerCase()}`, prefixLen: m => m[0].length - m[2].length },
  { re: /^```$/, type: () => 'code', prefixLen: () => 3 },
];

function checkDividerShortcut(block) {
  const content = getContentEl(block);
  const text = content.textContent.trim();
  if (!/^(-{3,}|\*{3,}|_{3,})$/.test(text)) return false;

  // "---" (só esse — o mesmo delimitador do frontmatter YAML, não "***"/"___")
  // como o primeiro conteúdo da nota abre as propriedades em vez de virar um
  // divisor comum, igual ao Obsidian. Só dispara com a nota ainda sem
  // nenhuma propriedade: se já tem alguma, a pessoa já sabe onde elas estão
  // e "---" ali continua sendo divisor mesmo.
  const headerNoteRef = getHeaderNoteRef();
  if (text === '---' && block === root.firstElementChild
    && headerNoteRef && !Object.keys(headerNoteRef.properties || {}).length) {
    clearContent(content);
    iniciarNovaPropriedade(headerNoteRef);
    closeSlashMenu();
    return true;
  }

  const divider = createBlockEl('divider');
  const dividerContent = getContentEl(divider);
  dividerContent.textContent = text;
  block.replaceWith(divider);

  let next = divider.nextElementSibling;
  if (!next) {
    next = createBlockEl('paragraph');
    divider.after(next);
  }
  focusBlockStart(next);
  renumberLists();
  closeSlashMenu();
  return true;
}

function checkBlockShortcut(block) {
  const content = getContentEl(block);
  if (!content) return false;
  // Citação e destaque são decoração sobre "paragraph" (convertBlockType nem
  // troca block.dataset.type pra elas) — sem esta saída, a cada tecla digitada
  // DEPOIS de virar citação o texto ainda começa com "> " e a mesma regex
  // casa de novo, apagando o "> " de dentro do <span> do prefixo (que essa
  // segunda passada nem recria) e deixando o resto do texto preso lá dentro.
  if (isBlockQuoted(block) || block.dataset.callout) return false;
  const text = content.textContent;
  for (const s of BLOCK_SHORTCUTS) {
    const m = s.re.exec(text);
    if (!m) continue;
    const type = s.type(m);
    const checked = s.checked ? s.checked(m) : false;
    const prefixLen = s.prefixLen ? s.prefixLen(m) : m[0].length;

    if (prefixLen > 0 && prefixLen <= content.textContent.length) {
      const r = rangeFromOffsets(content, 0, prefixLen);
      r.deleteContents();
    }
    const newBlock = convertBlockType(block, type, checked);
    revealBlockSyntax(newBlock);
    const newContent = getContentEl(newBlock);
    const prefixEl = newContent.querySelector(':scope > .md-syntax-prefix');
    if (prefixEl) {
      // O cursor tem que cair DEPOIS do span do prefixo, nunca dentro dele —
      // mas simplesmente pôr a seleção "logo depois do span, sem nada
      // adiante" não basta: é a mesma fronteira descrita no comentário da
      // âncora invisível (replaceRangeWithTag) — o Chrome estende o elemento
      // anterior ao digitar em vez de criar texto novo do lado de fora. O
      // título inteiro que a pessoa digita a seguir entrava dentro do span,
      // com o estilo pequeno/apagado do prefixo em vez do título de verdade
      // (o texto "sumia" visualmente). Uma âncora de verdade do lado de fora
      // resolve — limparAncoras tira ela assim que a primeira letra entra.
      // O Chrome também costuma deixar um <br> solto depois do prefixo
      // quando o resto do bloco fica vazio — lixo desta conversão, não o
      // placeholder de bloco vazio de verdade (que é só quando o <br> é o
      // único filho).
      if (newContent.lastChild?.nodeName === 'BR' && newContent.lastChild !== prefixEl) {
        newContent.lastChild.remove();
      }
      newContent.focus();
      const ancora = document.createTextNode(ANCORA);
      prefixEl.after(ancora);
      const afterPrefix = document.createRange();
      afterPrefix.setStart(ancora, 1);
      afterPrefix.collapse(true);
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(afterPrefix);
    } else {
      focusBlockStart(newBlock);
    }
    renumberLists();
    closeSlashMenu();
    return true;
  }
  return false;
}

// ── Formatação inline automática (**negrito**, *itálico*, `código`, ~~riscado~~) ──
const INLINE_SHORTCUTS = [
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
  // Wikilink ao digitar: "[[Título]]" ou "[[Título|Alias]]" vira link interno imediato
  {
    re: /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]$/,
    tag: 'a',
    attrs: m => {
      const target = m[1].trim().replace(/\\/g, '/');
      return {
        href: `nota:${encodeURIComponent(target)}`,
        class: 'note-internal-link',
        'data-note-title': target,
        'data-note-path': target,
        title: `Ctrl+clique para abrir nota: ${target}`
      };
    },
    text: m => (m[2] ? m[2].trim() : m[1].trim())
  },
  { re: /\*\*([^\n]+?)\*\*$/, tag: 'strong' },
  { re: /~~([^\n]+?)~~$/, tag: 's' },
  { re: /(?<!\*)\*(?![\s*])([^*\n]+?)(?<![\s*])\*$/, tag: 'em' },
];

// Âncora invisível. O cursor precisa cair num nó de texto DE VERDADE fora do
// elemento recém-criado. Numa posição de fronteira — logo depois do <em>, sem
// nada adiante — o Chrome estende o elemento anterior ao digitar, e a ênfase
// que devia ter terminado no "*" de fechamento engole o resto da frase. Não é
// só aparência: o que fica gravado vira "*teste e o resto*" em vez de
// "*teste* e o resto", que é outro texto.
//
// Ela é temporária: some assim que a primeira letra de verdade entra ao lado
// (limparAncoras, no início do 'input'), e sanitizeForSave a remove como rede
// de segurança pra que nunca chegue ao banco em nenhum caminho.
export function replaceRangeWithTag(contentEl, start, end, tag, innerText, attrs = {}) {
  const range = rangeFromOffsets(contentEl, start, end);
  range.deleteContents();
  const el = document.createElement(tag);
  el.textContent = innerText;
  for (const [nome, valor] of Object.entries(attrs)) el.setAttribute(nome, valor);
  range.insertNode(el);
  if (attrs.class === 'note-internal-link') atualizarLinksInternos();

  const ancora = document.createTextNode(ANCORA);
  el.after(ancora);

  const after = document.createRange();
  after.setStart(ancora, 1);
  after.collapse(true);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(after);
}

// Uma âncora sozinha no nó ainda está segurando o cursor. Uma âncora com texto
// ao lado já cumpriu o papel e precisa sair — senão sobra invisível no meio da
// frase e desalinha a contagem de posição, a detecção de CPF e a exportação.
function limparAncoras(contentEl) {
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

function tryAutoFormatInline(contentEl) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
  if (!contentEl.contains(sel.anchorNode)) return;

  const offset = getCaretOffset(contentEl);
  const before = contentEl.textContent.slice(0, offset);

  for (const item of INLINE_SHORTCUTS) {
    const { re, tag, attrs, text } = item;
    const m = re.exec(before);
    if (!m) continue;
    // `attrs` devolvendo null quer dizer "este atalho não se aplica" — é assim
    // que um endereço inválido deixa o texto digitado intacto em vez de sumir.
    const atributos = attrs ? attrs(m) : {};
    if (atributos === null) continue;
    const textoInterno = text ? text(m) : m[1];
    replaceRangeWithTag(contentEl, offset - m[0].length, offset, tag, textoInterno, atributos);
    return;
  }
}

// ── Enter / Backspace ─────────────────────────────────────────────────────────
function htmlOfFragment(fragment) {
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

function handleEnter(block) {
  captureUndoPoint();
  const content  = getContentEl(block);
  const offset   = getCaretOffset(content);
  const type     = block.dataset.type;

  // Divisor no Enter: insere um parágrafo novo depois do divisor e move o cursor para lá
  if (type === 'divider') {
    const newBlock = createBlockEl('paragraph');
    block.after(newBlock);
    focusBlockStart(newBlock);
    renumberLists();
    return;
  }

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

function handleBackspaceAtStart(block) {
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

  // Divisor: apagar no início remove o divisor e foca o anterior
  if (type === 'divider') {
    const prev = block.previousElementSibling;
    const next = block.nextElementSibling;
    block.remove();
    if (prev) {
      focusBlockEnd(prev);
    } else if (next) {
      focusBlockStart(next);
    } else {
      const para = createBlockEl('paragraph');
      root.appendChild(para);
      focusBlockStart(para);
    }
    renumberLists();
    return;
  }

  // Cabeçalhos: Backspace no início reduz o nível (h3 -> h2 -> h1 -> parágrafo),
  // permitindo desformatar ou alterar o nível sem precisar da toolbar.
  if (HEADING_TAGS[type]) {
    const level = Number(type.replace('heading', ''));
    if (level > 1) {
      const novo = convertBlockType(block, `heading${level - 1}`);
      revealBlockSyntax(novo);
      focusBlockStart(novo);
      renumberLists();
      return;
    }
    const para = convertBlockType(block, 'paragraph');
    focusBlockStart(para);
    renumberLists();
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

  if (prev.dataset.type === 'divider') {
    const prevContent = getContentEl(prev);
    if (isEmpty) block.remove();
    prev.classList.add('is-active');
    prevContent.focus();
    setCaretOffset(prevContent, prevContent.textContent.length);
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

// ── Eventos principais do editor ──────────────────────────────────────────────
// Dispara antes da mudança entrar no DOM — é o único ponto em que dá pra
// capturar o estado "antes" da digitação normal (o 'input' já roda depois).
// Enter/Backspace/colar já têm sua própria captura (são interceptados com
// preventDefault antes de gerar beforeinput).
root.addEventListener('beforeinput', () => {
  captureTypingUndoPoint();
});

// Mexeu no editor — por clique ou por teclado —, a nota volta a ser a área da
// vez. É o que decide pra onde vai a próxima imagem colada.
root.addEventListener('mousedown', () => setActiveArea('note'), true);
root.addEventListener('focusin',   () => setActiveArea('note'));

root.addEventListener('input', () => {
  const block = currentBlock();
  if (!block) return;

  // Primeiro de tudo: a âncora invisível da formatação anterior já cumpriu o
  // papel assim que esta tecla entrou ao lado dela. Sai daqui antes que
  // qualquer atalho ou detecção leia o texto do bloco e a conte como caractere.
  if (block.dataset.type !== 'table') limparAncoras(getContentEl(block));

  // Célula de tabela só salva: atalho de bloco e menu "/" não fazem sentido
  // dentro dela, e a detecção varreria o bloco inteiro em vez da célula.
  if (block.dataset.type === 'table') { scheduleSave(); return; }

  // Divisor: se o texto foi modificado e não é mais divisor, converte para parágrafo
  if (block.dataset.type === 'divider') {
    const text = getContentEl(block).textContent.trim();
    if (!/^(-{3,}|\*{3,}|_{3,})$/.test(text)) {
      const para = convertBlockType(block, 'paragraph');
      getContentEl(para).textContent = text;
      focusBlockEnd(para);
    }
    scheduleSave();
    return;
  }

  // Live Preview: monitorar edição do cabeçalho (#)
  if (HEADING_TAGS[block.dataset.type]) {
    const contentEl = getContentEl(block);
    const prefixSpan = contentEl?.querySelector?.(':scope > .md-syntax-prefix');
    
    let hashCount = 0;
    if (prefixSpan) {
      const match = /^(#{1,6})(?:[ \t](.*)|([^#\s].*))?$/s.exec(prefixSpan.textContent);
      if (match) {
        hashCount = match[1].length;
        const extraText = match[2] ?? match[3] ?? '';
        if (extraText) {
          prefixSpan.textContent = '#'.repeat(hashCount) + ' ';
          let nextNode = prefixSpan.nextSibling;
          if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
            nextNode.data = extraText + nextNode.data;
          } else {
            const tn = document.createTextNode(extraText);
            prefixSpan.after(tn);
            nextNode = tn;
          }
          const sel = document.getSelection();
          if (sel && nextNode) {
            const range = document.createRange();
            range.setStart(nextNode, extraText.length);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
    } else {
      const match = /^(#{1,6})/.exec(contentEl.textContent);
      if (match) hashCount = match[1].length;
    }

    if (hashCount === 0) {
      if (prefixSpan) prefixSpan.remove();
      const curOffset = getCaretOffset(contentEl);
      const para = convertBlockType(block, 'paragraph');
      livePreviewActiveBlock = para;
      const paraContent = getContentEl(para);
      paraContent.focus();
      setCaretOffset(paraContent, Math.min(curOffset, paraContent.textContent.length));
      scheduleSave();
      return;
    } else if (hashCount >= 1 && hashCount <= 6) {
      const targetType = `heading${hashCount}`;
      if (block.dataset.type !== targetType) {
        const curOffset = getCaretOffset(contentEl);
        const novo = convertBlockType(block, targetType);
        livePreviewActiveBlock = novo;
        revealBlockSyntax(novo);
        const novoContent = getContentEl(novo);
        novoContent.focus();
        setCaretOffset(novoContent, Math.min(curOffset, novoContent.textContent.length));
        scheduleSave();
        return;
      }
    }
  }

  // Live Preview: monitorar edição do callout (> [!...])
  if (block.dataset.callout) {
    const contentEl = getContentEl(block);
    const prefixSpan = contentEl?.querySelector?.(':scope > .md-syntax-prefix');
    if (prefixSpan) {
      const mCallText = /^((?:>\s*)?\[!(?:note|tip|important|warning|caution)\][ \t]?)(.*)$/is.exec(prefixSpan.textContent);
      if (mCallText && mCallText[2]) {
        const extraText = mCallText[2];
        prefixSpan.textContent = `> [!${block.dataset.callout.toUpperCase()}] `;
        let nextNode = prefixSpan.nextSibling;
        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
          nextNode.data = extraText + nextNode.data;
        } else {
          const tn = document.createTextNode(extraText);
          prefixSpan.after(tn);
          nextNode = tn;
        }
        const sel = document.getSelection();
        if (sel && nextNode) {
          const range = document.createRange();
          range.setStart(nextNode, extraText.length);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
    const textToCheck = prefixSpan ? prefixSpan.textContent : contentEl.textContent;
    const m = />\s*\[!(note|tip|important|warning|caution)\]/i.exec(textToCheck);
    if (m) {
      const newType = m[1].toLowerCase();
      if (block.dataset.callout !== newType) {
        setBlockCallout(block, newType);
        markCalloutEdges();
        scheduleSave();
      }
    } else {
      if (textToCheck.includes('>')) {
        delete block.dataset.callout;
        if (prefixSpan) {
          prefixSpan.dataset.syntaxType = 'quote';
          prefixSpan.classList.remove('md-syntax-callout');
        }
      } else {
        if (prefixSpan) prefixSpan.remove();
        delete block.dataset.callout;
        setBlockQuoted(block, false);
      }
      markCalloutEdges();
      scheduleSave();
    }
  }

  // Live Preview: monitorar edição da citação (>)
  if (isBlockQuoted(block) && !block.dataset.callout) {
    const contentEl = getContentEl(block);
    const prefixSpan = contentEl?.querySelector?.(':scope > .md-syntax-prefix');
    if (prefixSpan) {
      const mQuoteText = /^(>[ \t]?)(.*)$/s.exec(prefixSpan.textContent);
      if (mQuoteText && mQuoteText[2]) {
        const extraText = mQuoteText[2];
        prefixSpan.textContent = '> ';
        let nextNode = prefixSpan.nextSibling;
        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
          nextNode.data = extraText + nextNode.data;
        } else {
          const tn = document.createTextNode(extraText);
          prefixSpan.after(tn);
          nextNode = tn;
        }
        const sel = document.getSelection();
        if (sel && nextNode) {
          const range = document.createRange();
          range.setStart(nextNode, extraText.length);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
    let hasQuote = false;
    if (prefixSpan) {
      hasQuote = prefixSpan.textContent.includes('>');
    } else {
      hasQuote = contentEl.textContent.startsWith('>');
    }
    if (!hasQuote) {
      if (prefixSpan) prefixSpan.remove();
      setBlockQuoted(block, false);
      scheduleSave();
    }
  }

  // Live Preview: monitorar edição de delimitadores inline (** ou ` ou [link](url))
  if (livePreviewActiveInline) {
    const inline = livePreviewActiveInline;
    const openSpan = inline.querySelector(':scope > .md-syntax-open');
    const closeSpan = inline.querySelector(':scope > .md-syntax-close');
    if (openSpan && closeSpan) {
      const isWiki = inline.classList?.contains('note-internal-link');
      const isStdLink = inline.tagName === 'A' && !isWiki;

      let shouldUnwrap = false;
      if (isStdLink) {
        if (!openSpan.textContent.includes('[') || !closeSpan.textContent.includes('](')) {
          shouldUnwrap = true;
        }
      } else {
        const expectedOpen = isWiki ? '[[' : INLINE_SYNTAX_MAP[inline.tagName];
        const expectedClose = isWiki ? ']]' : expectedOpen;
        if (openSpan.textContent !== expectedOpen || closeSpan.textContent !== expectedClose) {
          shouldUnwrap = true;
        }
      }

      if (shouldUnwrap) {
        const blockEl = currentBlock();
        const content = blockEl ? getContentEl(blockEl) : inline.parentElement;
        const caretBefore = content ? getCaretOffset(content) : 0;
        livePreviewActiveInline = null;
        openSpan.remove();
        closeSpan.remove();
        inline.classList.remove('md-token-open');
        inline.replaceWith(...inline.childNodes);
        if (content) {
          content.normalize();
          setCaretOffset(content, Math.min(caretBefore, content.textContent.length));
        }
        scheduleSave();
      }
    }
  }

  if (block.dataset.type === 'paragraph') {
    // Uma marca de detecção (#tag, data, CPF...) pode ter pego o começo da
    // linha antes do atalho de bloco rodar — ex.: digitar "#" e fazer uma
    // pausa deixa o rescan (500ms) marcar "#outra" como tag; ao completar
    // "# outra" pra virar título, o <mark> sobrevivia dentro do cabeçalho
    // recém-criado. Desembrulhar aqui garante que o atalho sempre opera em
    // texto puro.
    const contentEl = getContentEl(block);
    const firstNode = contentEl?.firstChild;
    if (firstNode?.nodeType === Node.ELEMENT_NODE && firstNode.tagName === 'MARK') {
      unwrapMarks(contentEl);
    }
    if (checkDividerShortcut(block)) { scheduleSave(); return; }
    if (checkBlockShortcut(block))   { scheduleSave(); return; }
    checkSlashMenu(block);
  } else {
    closeSlashMenu();
  }

  // Folha de cálculo: recalcula a cada tecla (é o "tempo real") e não passa
  // pela formatação inline — asterisco ali é multiplicação, não itálico.
  if (block.dataset.type === 'calc') {
    recalcCalcSheets();
    scheduleSave();
    return;
  }

  if (block.dataset.type !== 'code') {
    tryAutoFormatInline(getContentEl(block));
    checkLinkAutocomplete(block);
  }

  scheduleRescan(block);
  scheduleSave();
});

root.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
    e.preventDefault();
    performUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
    e.preventDefault();
    performRedo();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && key === 'k') {
    e.preventDefault();
    applyLink();
    return;
  }

  // Um bloco sem texto (imagem, tabela, futuro áudio/vídeo/pdf) já está
  // selecionado (ver mais abaixo, onde a seleção nasce) — a seta continua
  // andando bloco a bloco a partir dele, e não a partir de onde o cursor de
  // texto de verdade ficou esquecido.
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
    && selectedBlockIds.size === 1) {
    const atual = findBlockById([...selectedBlockIds][0]);
    if (atual) {
      e.preventDefault();
      const direcao = e.key === 'ArrowDown' ? 1 : -1;
      const vizinho = direcao === 1 ? atual.nextElementSibling : atual.previousElementSibling;
      if (vizinho) {
        if (vizinho.contentEditable === 'false') {
          setBlockSelection([vizinho.dataset.id]);
        } else {
          clearBlockSelection();
          (direcao === 1 ? focusBlockStart : focusBlockEnd)(vizinho);
        }
      }
      return;
    }
  }

  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (root.contains(range.commonAncestorContainer)) {
        let rawSelected = range.toString();
        if (rawSelected) {
          const leadMatch = rawSelected.match(/^\s+/);
          const leadingSpace = leadMatch ? leadMatch[0] : '';
          const trailMatch = rawSelected.match(/\s+$/);
          const trailingSpace = trailMatch ? trailMatch[0] : '';
          const coreText = rawSelected.slice(leadingSpace.length, rawSelected.length - trailingSpace.length);

          if (coreText) {
            const block = currentBlock();

            // Intercepta formatação por teclas de atalho Obsidian
            if (e.key === '#') {
              e.preventDefault();
              captureUndoPoint();
              if (block) {
                const content = getContentEl(block);
                const isAtBlockStart = (range.startContainer === content && range.startOffset === 0) ||
                                      (range.startContainer === content.firstChild && range.startOffset === 0);
                const isFullBlock = rawSelected.trim() === content.textContent.trim();
                if (isAtBlockStart || isFullBlock) {
                  const currentType = block.dataset.type;
                  let nextType = 'heading1';
                  if (HEADING_TAGS[currentType]) {
                    const lvl = Number(currentType.replace('heading', ''));
                    nextType = lvl < 6 ? `heading${lvl + 1}` : 'heading1';
                  }
                  const novo = convertBlockType(block, nextType);
                  revealBlockSyntax(novo);
                  focusBlockStart(novo);
                } else {
                  range.deleteContents();
                  const frag = document.createDocumentFragment();
                  if (leadingSpace) frag.appendChild(document.createTextNode(leadingSpace));
                  const textNode = document.createTextNode(`#${coreText}`);
                  frag.appendChild(textNode);
                  if (trailingSpace) frag.appendChild(document.createTextNode(trailingSpace));
                  range.insertNode(frag);
                  const newRange = document.createRange();
                  newRange.selectNode(textNode);
                  sel.removeAllRanges();
                  sel.addRange(newRange);
                }
                scheduleSave();
                return;
              }
            }

            if (e.key === '[' || e.key === ']') {
              e.preventDefault();
              captureUndoPoint();
              range.deleteContents();

              const frag = document.createDocumentFragment();
              if (leadingSpace) frag.appendChild(document.createTextNode(leadingSpace));

              let nodeToSelect;
              // Se já está como [texto], o 2º '[' converte imediatamente para link interno [[texto]]
              if (/^\[([^\]]+)\]$/.test(coreText)) {
                const inner = coreText.slice(1, -1);
                const a = document.createElement('a');
                a.className = 'note-internal-link';
                a.setAttribute('href', `nota:${encodeURIComponent(inner)}`);
                a.dataset.noteTitle = inner;
                a.title = `Ctrl+clique para abrir nota: ${inner}`;
                a.textContent = inner;
                frag.appendChild(a);
                revealInlineSyntax(a);
                livePreviewActiveInline = a;
                nodeToSelect = a;
                atualizarLinksInternos();
              } else if (/^\[\[([^\]]+)\]\]$/.test(coreText)) {
                // Já é [[texto]]: desfaz para texto puro
                const inner = coreText.slice(2, -2);
                nodeToSelect = document.createTextNode(inner);
                frag.appendChild(nodeToSelect);
              } else {
                // 1º '[': envolve com [texto]
                nodeToSelect = document.createTextNode(`[${coreText}]`);
                frag.appendChild(nodeToSelect);
              }

              if (trailingSpace) frag.appendChild(document.createTextNode(trailingSpace));
              range.insertNode(frag);

              const newRange = document.createRange();
              newRange.selectNode(nodeToSelect);
              sel.removeAllRanges();
              sel.addRange(newRange);
              scheduleSave();
              return;
            }

            if (e.key === '*') {
              e.preventDefault();
              captureUndoPoint();
              range.deleteContents();

              const frag = document.createDocumentFragment();
              if (leadingSpace) frag.appendChild(document.createTextNode(leadingSpace));

              let nodeToSelect;
              // Se já está como *texto*, o 2º '*' converte imediatamente para negrito <strong>
              if (/^\*([^*]+)\*$/.test(coreText)) {
                const inner = coreText.slice(1, -1);
                const strong = document.createElement('strong');
                strong.textContent = inner;
                frag.appendChild(strong);
                revealInlineSyntax(strong);
                livePreviewActiveInline = strong;
                nodeToSelect = strong;
              } else if (/^\*\*([^*]+)\*\*$/.test(coreText)) {
                // Já é **texto**: desfaz para texto puro
                const inner = coreText.slice(2, -2);
                nodeToSelect = document.createTextNode(inner);
                frag.appendChild(nodeToSelect);
              } else {
                // 1º '*': envolve com *texto*
                nodeToSelect = document.createTextNode(`*${coreText}*`);
                frag.appendChild(nodeToSelect);
              }

              if (trailingSpace) frag.appendChild(document.createTextNode(trailingSpace));
              range.insertNode(frag);

              const newRange = document.createRange();
              newRange.selectNode(nodeToSelect);
              sel.removeAllRanges();
              sel.addRange(newRange);
              scheduleSave();
              return;
            }

            if (e.key === '~') {
              e.preventDefault();
              captureUndoPoint();
              range.deleteContents();

              const frag = document.createDocumentFragment();
              if (leadingSpace) frag.appendChild(document.createTextNode(leadingSpace));

              let nodeToSelect;
              // Se já está como ~texto~, o 2º '~' converte para riscado <s>
              if (/^~([^~]+)~$/.test(coreText)) {
                const inner = coreText.slice(1, -1);
                const s = document.createElement('s');
                s.textContent = inner;
                frag.appendChild(s);
                revealInlineSyntax(s);
                livePreviewActiveInline = s;
                nodeToSelect = s;
              } else if (/^~~([^~]+)~~$/.test(coreText)) {
                const inner = coreText.slice(2, -2);
                nodeToSelect = document.createTextNode(inner);
                frag.appendChild(nodeToSelect);
              } else {
                nodeToSelect = document.createTextNode(`~${coreText}~`);
                frag.appendChild(nodeToSelect);
              }

              if (trailingSpace) frag.appendChild(document.createTextNode(trailingSpace));
              range.insertNode(frag);

              const newRange = document.createRange();
              newRange.selectNode(nodeToSelect);
              sel.removeAllRanges();
              sel.addRange(newRange);
              scheduleSave();
              return;
            }

            if (e.key === '`') {
              e.preventDefault();
              captureUndoPoint();
              range.deleteContents();

              const frag = document.createDocumentFragment();
              if (leadingSpace) frag.appendChild(document.createTextNode(leadingSpace));

              let nodeToSelect;
              if (/^`([^`]+)`$/.test(coreText)) {
                const inner = coreText.slice(1, -1);
                nodeToSelect = document.createTextNode(inner);
                frag.appendChild(nodeToSelect);
              } else {
                const code = document.createElement('code');
                code.textContent = coreText;
                frag.appendChild(code);
                revealInlineSyntax(code);
                livePreviewActiveInline = code;
                nodeToSelect = code;
              }

              if (trailingSpace) frag.appendChild(document.createTextNode(trailingSpace));
              range.insertNode(frag);

              const newRange = document.createRange();
              newRange.selectNode(nodeToSelect);
              sel.removeAllRanges();
              sel.addRange(newRange);
              scheduleSave();
              return;
            }

            // Pares literais: ", ', (, {, _
            const PAIRS = {
              '_': [ '_', '_' ],
              '"': [ '"', '"' ],
              "'": [ "'", "'" ],
              '(': [ '(', ')' ],
              ')': [ '(', ')' ],
              '{': [ '{', '}' ],
              '}': [ '{', '}' ],
            };
            const pair = PAIRS[e.key];
            if (pair) {
              e.preventDefault();
              captureUndoPoint();
              range.deleteContents();

              const frag = document.createDocumentFragment();
              if (leadingSpace) frag.appendChild(document.createTextNode(leadingSpace));
              const [left, right] = pair;
              const textNode = document.createTextNode(`${left}${coreText}${right}`);
              frag.appendChild(textNode);
              if (trailingSpace) frag.appendChild(document.createTextNode(trailingSpace));
              range.insertNode(frag);

              const newRange = document.createRange();
              newRange.selectNode(textNode);
              sel.removeAllRanges();
              sel.addRange(newRange);
              scheduleSave();
              return;
            }
          }
        }
      }
    }
  }

  // Apagar blocos inteiros é o gesto de uma seleção de BLOCOS (alça ou
  // Ctrl+arrastar), onde não existe texto selecionado. Numa seleção espelhada
  // de texto, Backspace tem que apagar o texto marcado e mais nada — selecionar
  // do meio de uma linha até o meio da seguinte e apagar as duas por inteiro
  // seria perder o que ninguém mandou apagar.
  if ((e.key === 'Backspace' || e.key === 'Delete')
      && selectedBlockIds.size > 0 && !selecaoEspelhada) {
    e.preventDefault();
    const first = findBlockById([...selectedBlockIds][0]);
    if (first) deleteBlocksOrOne(first);
    return;
  }
  if (e.key === 'Escape' && selectedBlockIds.size > 0) {
    e.preventDefault();
    clearBlockSelection();
    return;
  }

  // Obsidian Live Preview: Backspace ou Delete na borda de um elemento com formatação
  // ativa desfaz a formatação (unwrap) permitindo apagar o delimitador sem toolbar.
  if ((e.key === 'Backspace' || e.key === 'Delete') && livePreviewActiveInline) {
    const sel = document.getSelection();
    if (sel && sel.isCollapsed && sel.rangeCount > 0) {
      const inline = livePreviewActiveInline;
      const openSpan = inline.querySelector(':scope > .md-syntax-open');
      const closeSpan = inline.querySelector(':scope > .md-syntax-close');
      const r = sel.getRangeAt(0);
      const isAtStart = (r.startContainer === inline && r.startOffset === 0) ||
                        (r.startContainer === inline.firstChild && r.startOffset === 0) ||
                        (openSpan && openSpan.contains(r.startContainer));
      const isAtEnd = (r.startContainer === inline && r.startOffset === inline.childNodes.length) ||
                      (r.startContainer === inline.lastChild && r.startOffset === (inline.lastChild.textContent || '').length) ||
                      (closeSpan && closeSpan.contains(r.startContainer));

      if ((e.key === 'Backspace' && isAtStart) || (e.key === 'Delete' && isAtEnd)) {
        e.preventDefault();
        const block = currentBlock();
        const content = block ? getContentEl(block) : inline.parentElement;
        inline.classList.remove('md-inline-active', 'md-token-open');
        livePreviewActiveInline = null;
        if (openSpan) openSpan.remove();
        if (closeSpan) closeSpan.remove();

        const fragment = document.createDocumentFragment();
        while (inline.firstChild) fragment.appendChild(inline.firstChild);
        const firstNode = fragment.firstChild;
        inline.replaceWith(fragment);
        if (content) content.normalize();

        if (firstNode && sel) {
          const newRange = document.createRange();
          newRange.setStart(firstNode, 0);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        scheduleSave();
        return;
      }
    }
  }

  if (isLinkAutocompleteOpen()) {
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveLinkAutocompleteSelection(1);  return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveLinkAutocompleteSelection(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); confirmLinkAutocompleteSelection(); return; }
    if (e.key === 'Escape') { e.preventDefault(); closeLinkAutocomplete(); return; }
  }

  if (isSlashMenuOpen()) {
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveSlashRow(1);  return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveSlashRow(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSlashSelection(1);  return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSlashSelection(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); confirmSlashSelection(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelSlashMenu(); return; }
  }

  // Numa célula de tabela, Enter quebra linha dentro da célula — nunca cria um
  // bloco novo, que jogaria um parágrafo pra fora da tabela.
  if (e.key === 'Enter' && focusedCell()) {
    e.preventDefault();
    document.execCommand('insertLineBreak');
    scheduleSave();
    return;
  }

  if (e.key === 'Tab') {
    const cell = focusedCell();
    if (cell) {
      e.preventDefault();
      moveCell(cell, e.shiftKey ? -1 : 1);
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    const block = currentBlock();
    if (!block || block.dataset.type === 'code') return;
    e.preventDefault();
    handleEnter(block);
    scheduleSave();
    return;
  }

  // Seta saindo de texto de verdade rumo a um bloco sem onde pôr o cursor
  // (imagem, tabela...): o navegador não sabe pousar ali, então ele PULA o
  // bloco inteiro em vez de parar nele — dava pra sentir que "o cursor não
  // alcança a imagem". Deixa a seta seguir seu curso normal e, só depois
  // (setTimeout 0: espera o navegador decidir onde o cursor foi parar),
  // confere se ele saiu do bloco atual sem pousar no vizinho — se sim, é
  // porque pulou ele, e a gente troca o cursor perdido por uma seleção de
  // bloco de verdade (mesma que clique/arrasto usam, que Delete/Esc já tratam).
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const sel = document.getSelection();
    if (sel && sel.isCollapsed && !focusedCell()) {
      const atual = currentBlock();
      if (atual && atual.contentEditable !== 'false') {
        const direcao = e.key === 'ArrowDown' ? 1 : -1;
        const vizinho = direcao === 1 ? atual.nextElementSibling : atual.previousElementSibling;
        if (vizinho && vizinho.contentEditable === 'false') {
          const rectAntes = caretViewportRect(sel);
          setTimeout(() => {
            const rectDepois = caretViewportRect(document.getSelection());
            const moveuNaTela = rectAntes && rectDepois && Math.abs(rectDepois.top - rectAntes.top) > 1;
            const depois = currentBlock();
            if (!moveuNaTela || (depois !== atual && depois !== vizinho)) {
              setBlockSelection([vizinho.dataset.id]);
            }
          }, 0);
        }
      }
    }
  }

  if (e.key === 'Backspace') {
    const sel = document.getSelection();
    if (!sel || !sel.isCollapsed) return;
    // Backspace no início de uma célula vazia não pode fundir blocos.
    if (focusedCell()) return;
    const block = currentBlock();
    if (!block) return;
    const content = getContentEl(block);
    const prefixSpan = content.querySelector(':scope > .md-syntax-prefix');
    const prefixLen = prefixSpan ? prefixSpan.textContent.length : 0;
    if (getCaretOffset(content) > prefixLen) return;
    e.preventDefault();
    handleBackspaceAtStart(block);
    scheduleSave();
    return;
  }

  // Tab tem três donos, nesta ordem: célula de tabela (acima), item do menu
  // "/" (acima) e, aqui, indentar. Chegar até este ponto já quer dizer que os
  // dois primeiros não quiseram a tecla.
  if (e.key === 'Tab') {
    e.preventDefault();
    const alvos = blocksForIndent();
    if (alvos.length === 0) return;
    const antes = snapshotState();
    if (!indentBlocks(alvos, e.shiftKey ? -1 : 1)) return;
    captureUndoPoint(antes);
    renumberLists();
    scheduleSave();
  }
});

// Precedência de colagem. Existem dois ouvintes de `paste`: este, em `root`, e
// o de documents.js, em `document`. Como este não interrompia a propagação, os
// dois rodavam na mesma colagem — hoje isso é inofensivo só porque a nota não
// trata imagem. `claim()` marca explicitamente o que a nota assumiu, e o que
// ela não assume continua subindo pra seção Documentos.
root.addEventListener('paste', e => {
  const claim = () => e.stopPropagation();
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') ?? '';

  // Excel e Google Sheets mandam a seleção como <table> em text/html e como
  // TSV em text/plain. Dentro de uma célula não vale — colar tabela em tabela
  // não tem para onde ir, então ali entra como texto.
  if (!focusedCell()) {
    const grid = parseClipboardTable(e.clipboardData?.getData('text/html') ?? '')
              ?? parseTsvTable(text);
    if (grid) { claim(); insertTableBlock(grid); return; }
  }

  // Imagem entra na nota quando foi na nota que a pessoa clicou por último.
  // Conferir o foco não serviria: a seleção por arrasto dos documentos cancela
  // o mousedown, e um mousedown cancelado deixa o foco onde estava — o editor
  // continuava "focado" mesmo com a pessoa mexendo nos documentos (ver
  // active-area.js). Dentro de uma célula de tabela a imagem não cabe, então
  // ali ela também segue pros Documentos.
  const imagem = [...(e.clipboardData?.items ?? [])].find(it => it.type.startsWith('image/'));
  if (imagem && isNoteActive() && !focusedCell()) {
    const blob = imagem.getAsFile();
    if (blob) {
      claim();
      const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
      const ext = ({ jpeg: 'jpg' }[blob.type.split('/')[1]] ?? blob.type.split('/')[1] ?? 'png');
      insertImageFile(new File([blob], `colado_${carimbo}.${ext}`, { type: blob.type }), currentBlock());
      return;
    }
  }

  if (!text) return;   // nada que a nota saiba tratar — segue pros Documentos
  claim();

  // URL colada vira link direto: com texto selecionado o endereço envolve a
  // seleção; sem seleção o link entra rotulado com o que foi colado, então
  // colar "www.aaa.com" dá [www.aaa.com](https://www.aaa.com).
  const single = text.trim();
  if (!single.includes('\n') && !/\s/.test(single)) {
    const href = safeHref(single);
    if (href) { pasteLink(single, href); return; }
  }

  if (text.includes('\n')) {
    pasteMultilineText(text);
  } else {
    pasteInlineText(text);
  }
});

// ── Colar planilha (delegado para note-table.js) ─────────────────────────────


// O <br> de um bloco vazio (ver clearContent) não está dentro da seleção
// quando ela só marca "o fim do bloco" — sobra como uma quebra de linha solta
// antes do que acabou de ser colado. Tira ele do caminho e devolve uma range
// limpa no mesmo lugar.
function dropPlaceholderBr(range) {
  const el = range.commonAncestorContainer;
  const contentEl = el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
  if (contentEl?.childNodes.length === 1 && contentEl.firstChild.nodeName === 'BR') {
    contentEl.removeChild(contentEl.firstChild);
    const fresh = document.createRange();
    fresh.selectNodeContents(contentEl);
    fresh.collapse(false);
    return fresh;
  }
  return range;
}

function pasteLink(label, href) {
  const sel = document.getSelection();
  let range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;
  if (!range || !root.contains(range.commonAncestorContainer)) { pasteInlineText(label); return; }
  range = dropPlaceholderBr(range);

  captureUndoPoint();

  const a = document.createElement('a');
  a.setAttribute('href', href);
  if (!range.collapsed) a.appendChild(range.extractContents());
  if (!a.textContent.trim()) a.textContent = label;
  range.insertNode(a);

  const after = document.createRange();
  after.setStartAfter(a);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);

  const block = getBlockFromNode(a);
  if (block) scheduleRescan(block);
  scheduleSave();
}

// Colagem de uma linha só: insere como texto simples via Range (não usa
// execCommand — comportamento inconsistente entre versões do Chrome), sem
// mexer na estrutura do bloco atual. Se não há uma seleção válida dentro do
// editor (ex.: foco perdido), cola no fim do último bloco em vez de não
// fazer nada.
function pasteInlineText(text) {
  const sel = document.getSelection();
  let range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;
  if (!range || !root.contains(range.commonAncestorContainer)) {
    const last = root.lastElementChild;
    if (!last) return;
    const c = getContentEl(last);
    c.focus();
    range = document.createRange();
    range.selectNodeContents(c);
    range.collapse(false);
  }
  range = dropPlaceholderBr(range);

  const block = getBlockFromNode(range.commonAncestorContainer);
  captureUndoPoint();

  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);

  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);

  // Colar "# título" ou "[[nota]]" numa linha só caia direto como texto puro
  // sem isso — só a colagem multilinha (pasteMultilineText) passava pelo
  // parser de markdown. Um atalho só dispara se o "#"/"[[" ficou mesmo no
  // início do bloco (as regex são ancoradas em ^), então colar no meio de uma
  // frase existente não vira título por engano.
  if (block?.dataset.type === 'paragraph') {
    if (checkDividerShortcut(block)) { scheduleSave(); return; }
    if (checkBlockShortcut(block))   { scheduleSave(); return; }
  }
  if (block && block.dataset.type !== 'code') {
    tryAutoFormatInline(getContentEl(block));
  }

  if (block) scheduleRescan(block);
  scheduleSave();
}

// Colagem de texto com várias linhas: reaproveita o mesmo parser da migração
// de notas antigas pra reconhecer "# título", "- [ ] tarefa", listas etc. e
// já colar como blocos de verdade, não como texto solto. Se não há bloco com
// foco (currentBlock() falha), cola no fim da nota em vez de não fazer nada.
async function pasteMultilineText(text) {
  const block = currentBlock() ?? root.lastElementChild;
  if (!block) return;

  // Imagem em base64 vira arquivo antes de entrar no DOM (ver absorbDataUrls).
  const parsed = await absorbDataUrls(parseMarkdownToBlocks(text));

  captureUndoPoint();
  const base = blockDepth(block);
  const newEls = parsed
    .map(b => createBlockElFrom(base ? { ...b, depth: (b.depth ?? 0) + base } : b));

  const content = block.dataset.type === 'table' ? null : getContentEl(block);
  const isEmpty = content ? content.textContent.trim() === '' : false;

  let anchor = block;
  for (const el of newEls) { anchor.after(el); anchor = el; }
  if (isEmpty && block.dataset.type === 'paragraph') block.remove();

  renumberLists();
  for (const el of newEls) {
    if (!NO_DETECTION.has(el.dataset.type)) applyDetectionMarks(getContentEl(el));
  }
  focusBlockEnd(newEls[newEls.length - 1]);
  scheduleSave();
}

// ── Formatação Markdown / troca de tipo de bloco ─────────────────────────────
export function execFormat(command) {
  captureUndoPoint();
  document.execCommand(command, false, null);
  const block = currentBlock();
  if (block) scheduleRescan(block);
  scheduleSave();
}

// ── Links ─────────────────────────────────────────────────────────────────────
function currentLinkEl() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const a = node?.closest?.('a');
  return a && root.contains(a) ? a : null;
}

// Menu de link — dentro da extensão, não um prompt() do navegador.
function closeLinkMenu() {
  _closeLinkMenu();
}

function openLinkMenu(anchorRect, opts) {
  _openLinkMenu(anchorRect, opts, positionMenu);
}

document.addEventListener('mousedown', e => {
  if (!isClickInsideLinkMenu(e.target)) closeLinkMenu();
  closeLinkAutocompleteIfOutside(e.target);
});

export function applyLink() {
  const sel      = document.getSelection();
  const existing = currentLinkEl();
  const dentro   = sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).commonAncestorContainer);
  const hasText  = dentro && !sel.isCollapsed;

  // Sem seleção e sem link não é mais recusa: agora existe um campo de texto,
  // então dá pra criar o link inteiro pelo menu.
  if (!existing && !dentro) { showFeedback('Ponha o cursor na nota primeiro'); return; }

  // O range e o bloco são guardados agora: abrir o menu tira o foco do editor
  // e a seleção deixa de existir quando o callback roda.
  const range = dentro ? sel.getRangeAt(0).cloneRange() : null;
  const block = getBlockFromNode(existing ?? range.commonAncestorContainer);
  const rect  = (existing ?? range).getBoundingClientRect();

  const done = () => {
    if (block) scheduleRescan(block);
    scheduleSave();
  };

  openLinkMenu(rect, {
    href:  existing?.getAttribute('href') ?? '',
    texto: existing?.textContent ?? (hasText ? range.toString() : ''),
    canRemove: !!existing,
    onApply: (url, novoTexto) => {
      captureUndoPoint();
      let a;
      if (existing) {
        existing.setAttribute('href', url);
        // Só reescreve o texto se ele mudou de verdade: um link com negrito
        // dentro perderia a formatação à toa se fosse refeito a cada ajuste
        // de endereço.
        if (novoTexto !== existing.textContent) existing.textContent = novoTexto;
        a = existing;
      } else {
        a = document.createElement('a');
        a.setAttribute('href', url);
        if (hasText && novoTexto === range.toString()) {
          // Texto inalterado: move o conteúdo original pra dentro do link e
          // preserva o negrito/itálico que já estava lá.
          a.appendChild(range.extractContents());
        } else {
          range.deleteContents();
          a.textContent = novoTexto;
        }
        range.insertNode(a);
      }
      // Endereço "nota:..." digitado (ou colado) direto neste menu genérico,
      // sem passar pelo atalho de "[[Título]]", saía sem a marca de link
      // interno — o resultado ficava um link comum, cinza, sem o comportamento
      // de Ctrl+clique, e ao editar de novo revelava a sintaxe crua
      // "[Título](nota:T%C3%ADtulo%20...)" em vez de "[[Título]]".
      const ehNota = /^nota:/i.test(url);
      a.classList.toggle('note-internal-link', ehNota);
      if (ehNota) {
        let titulo;
        try { titulo = decodeURIComponent(url.replace(/^nota:/i, '')); }
        catch { titulo = url.replace(/^nota:/i, ''); }
        a.dataset.noteTitle = titulo;
        a.title = `Ctrl+clique para abrir nota: ${titulo}`;
        atualizarLinksInternos();
      } else {
        delete a.dataset.noteTitle;
        a.removeAttribute('title');
      }
      done();
    },
    onRemove: () => {
      captureUndoPoint();
      existing.replaceWith(...existing.childNodes);
      done();
    },
  });
}

export function wrapSelectionInTag(tag) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  captureUndoPoint();
  const el = document.createElement(tag);
  el.appendChild(range.extractContents());
  range.insertNode(el);

  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNode(el);
  sel.addRange(r);

  const block = getBlockFromNode(el);
  if (block) scheduleRescan(block);
  scheduleSave();
}

// Todos os blocos tocados pela seleção atual, na ordem em que aparecem no
// editor (usado pra converter tipo de vários blocos de uma vez — cada linha
// vira um item independente, já que cada uma já é o seu próprio bloco).
function getSelectedBlocks() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return [];
  const range = sel.getRangeAt(0);
  const startBlock = getBlockFromNode(range.startContainer);
  const endBlock   = getBlockFromNode(range.endContainer);
  if (!startBlock) return [];
  if (!endBlock || startBlock === endBlock) return [startBlock];

  const blocks = [];
  for (let el = startBlock; el; el = el.nextElementSibling) {
    blocks.push(el);
    if (el === endBlock) break;
  }
  return blocks;
}

// Na barra de formatação o botão de citação liga e desliga — é o que se
// espera de um botão de barra, e é o caminho visível pra tirar a citação (o
// outro é Backspace no começo da linha). Com vários blocos só desliga quando
// todos já estão citados: numa seleção meio-a-meio, alternar cada um
// embaralharia em vez de resolver.
function toggleQuotedOnSelection() {
  const blocks = getSelectedBlocks();
  if (blocks.length === 0) return;
  captureUndoPoint();
  const todosCitados = blocks.every(isBlockQuoted);
  for (const b of blocks) setBlockQuoted(b, !todosCitados);
  renumberLists();
  scheduleSave();
}

function convertSelectedBlocks(type) {
  const blocks = getSelectedBlocks();
  if (blocks.length === 0) return;

  captureUndoPoint();

  if (blocks.length === 1) {
    const block   = blocks[0];
    const content = getContentEl(block);
    const offset  = getCaretOffset(content);

    const newBlock   = convertBlockType(block, type, block.dataset.checked === 'true');
    const newContent = getContentEl(newBlock);
    newContent.focus();
    setCaretOffset(newContent, offset);
  } else {
    const newBlocks  = blocks.map(b => convertBlockType(b, type, b.dataset.checked === 'true'));
    const lastContent = getContentEl(newBlocks[newBlocks.length - 1]);
    lastContent.focus();
    setCaretOffset(lastContent, lastContent.textContent.length);
  }

  renumberLists();
  scheduleSave();
}

export function insertDividerAtCursor() {
  const block = currentBlock();
  if (!block) return;
  captureUndoPoint();
  const divider = createBlockEl('divider');
  block.after(divider);
  const para = createBlockEl('paragraph');
  divider.after(para);
  focusBlockStart(para);
  renumberLists();
  scheduleSave();
}

// ── Controles de bloco e Drag & Drop (touchDragTimer / touchstart delegado para note-drag-drop.js) ─────
initNoteDragDrop({
  getRoot: () => root,
  getNoteEditorEl: () => noteEditorEl,
  getNoteSection: () => noteSection,
  captureUndoPoint,
  scheduleSave,
  renumberLists,
  showFeedback,
  currentBlock,
  getLastFocusedBlock,
  getContentEl,
  createBlockEl,
  createBlockElFrom,
  convertBlockType,
  serializeBlockEl,
  focusBlockStart,
  openSlashMenuForBlock,
  insertTemplateBlocks,
  updateMobileToolbarState,
  isEventInsideMobileToolbar,
  closeCopyMenu,
  isBlockUnderlined,
  setBlockUnderlined,
  PODE_SUBLINHAR,
  NO_TEXT_TYPES,
  INSERTED_TYPES,
  SLASH_ITEMS,
  buildTypeGrid,
});

document.addEventListener('selectionchange', () => {
  updateLivePreviewState();

  // Gesto de arrastar em andamento tem dono — não mexe na seleção no meio dele.
  if (isGestureActive()) return;

  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  if (!root.contains(sel.getRangeAt(0).commonAncestorContainer)) return;

  const blocos = sel.isCollapsed ? [] : getSelectedBlocks();

  if (blocos.length > 1) {
    const ids = blocos.map(b => b.dataset.id);
    const sIds = getSelectedBlockIds();
    // selectionchange dispara a cada pixel do arraste; só repinta se mudou.
    const mudou = ids.length !== sIds.size || ids.some(id => !sIds.has(id));
    if (mudou) setBlockSelection(ids);
    setSelecaoEspelhada(true);
    return;
  }

  // Voltou a ser um bloco só (ou um cursor): o grupo deixa de existir. Uma
  // seleção feita com Ctrl+arrastar não é espelhada e não se desfaz aqui —
  // ela tem os próprios caminhos de saída (Esc, clique fora).
  if (isSelecaoEspelhada()) clearBlockSelection();
});

// ── Controles de bloco sem hover (toque e foco no celular) ───────────────────
// Em telas de toque (:hover não existe), posiciona os controles (+ / ⠿) ao tocar
// ou focar em um bloco qualquer, tornando as ações alcançáveis no celular.
root.addEventListener('focusin', e => {
  const block = e.target.closest('.block');
  if (block && root.contains(block)) {
    positionBlockControls(block);
  }
});

root.addEventListener('touchstart', e => {
  const block = e.target.closest('.block');
  if (block && root.contains(block)) {
    positionBlockControls(block);
  }
}, { passive: true });


