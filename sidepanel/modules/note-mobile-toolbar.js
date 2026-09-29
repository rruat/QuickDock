// Barra de contexto mobile ("Notion mobile toolbar"): 3 estados (formatação
// de texto / ações de bloco / seleção de blocos), popovers de adicionar/cor,
// sheets de trocar tipo e modelos de bloco, toque longo pra selecionar.
import { setDocsCollapsed } from './documents.js';
import { blockTemplates, openSaveBlockTemplate } from './templates.js';
import { copyBlocksAsImage, downloadBlocksAsImage } from './snapshot.js';
import { blocksToPlainText, blocksToMarkdown, escHtml } from './blocks.js';
import { onViewChange } from './views.js';
import { noteSection, root } from './note-state.js';
import { currentBlock, getContentEl, setCaretOffset, focusBlockStart } from './note-dom-utils.js';
import { syncVisualViewport } from './note-viewport.js';
import {
  ttTitleCase, ttSentenceCase, ttParaCase, ttInvertCase, ttNoAccents, ttCleanSpaces,
  applyTransformToSelection,
} from './note-text-transforms.js';
import { downloadTextFile, getSuggestedBlockFilename } from './note-export-helpers.js';
import { showFeedback } from './note-detection.js';
import {
  getCurrentNoteId, captureUndoPoint, scheduleSave, snapshotState, createBlockEl,
  focusCell, renumberLists, indentBlocks, transformBlocks, insertDividerAtCursor,
  execFormat, wrapSelectionInTag, applyLink, printBlocks, performUndo, performRedo,
  serializeBlockEl, targetBlocksFor, setBlockSelection, clearBlockSelection,
  getSelectedBlockElements, getSelectedBlockIds, getIsBlockSelectActive,
  setIsBlockSelectActive, getLastHandleClickedId, setLastHandleClickedId,
  getUndoStackLength, getRedoStackLength, insertTemplateBlocks, blocksToExportMarkdown,
} from './note.js';

// ── Barra Contextual Estilo Notion (Dual-State & No-Scrim Sheets) ────────────
let lastFocusedBlock = null;
// Getter exposto pra note-viewport.js.
export function getLastFocusedBlock() { return lastFocusedBlock; }

const mobileNotionToolbar = document.createElement('div');
mobileNotionToolbar.className = 'mobile-notion-toolbar';
mobileNotionToolbar.id = 'mobile-notion-toolbar';

// Estado 1: Formatação de Texto (quando texto estiver selecionado)
const mobileFormatBar = document.createElement('div');
mobileFormatBar.className = 'mobile-toolbar-inner mobile-format-bar';
mobileFormatBar.hidden = true;
mobileFormatBar.style.display = 'none';

// Estado 2: Ações de Bloco (quando NÃO houver texto selecionado)
const mobileBlockBar = document.createElement('div');
mobileBlockBar.className = 'mobile-toolbar-inner mobile-block-bar';
mobileBlockBar.style.display = 'flex';

// Estado 3: Seleção de Blocos (quando blocos estiverem selecionados ou modo seleção ativo)
const mobileSelectBar = document.createElement('div');
mobileSelectBar.className = 'mobile-toolbar-inner mobile-select-bar';
mobileSelectBar.hidden = true;
mobileSelectBar.style.display = 'none';

// Popover: Adicionar bloco (Acima ou Abaixo)
const mobileAddPopover = document.createElement('div');
mobileAddPopover.className = 'mobile-add-popover';
mobileAddPopover.hidden = true;
mobileAddPopover.innerHTML = `
  <button class="mob-popover-item" data-pos="above">
    <span class="qd-icon material-symbols-rounded">arrow_upward</span>
    <span>Adicionar acima</span>
  </button>
  <button class="mob-popover-item" data-pos="below">
    <span class="qd-icon material-symbols-rounded">arrow_downward</span>
    <span>Adicionar abaixo</span>
  </button>
`;

// Popover: Cores / Destaque
const mobileColorPopover = document.createElement('div');
mobileColorPopover.className = 'mobile-color-popover';
mobileColorPopover.hidden = true;
const HIGHLIGHT_COLORS = [
  { name: 'Sem cor', color: 'transparent', border: true },
  { name: 'Amarelo', color: '#fef08a' },
  { name: 'Verde', color: '#bbf7d0' },
  { name: 'Azul', color: '#bfdbfe' },
  { name: 'Rosa', color: '#fbcfe8' },
  { name: 'Laranja', color: '#fed7aa' },
  { name: 'Roxo', color: '#e9d5ff' },
];
mobileColorPopover.innerHTML = HIGHLIGHT_COLORS.map(c =>
  `<button class="mob-color-dot" data-color="${c.color}" title="${c.name}" style="background-color: ${c.color}; ${c.border ? 'border: 1px dashed var(--border);' : ''}"></button>`
).join('');

// Sheet: Formatar texto (transformações de texto QuickDock)
const mobileTextFormatSheet = document.createElement('div');
mobileTextFormatSheet.className = 'mobile-text-format-sheet';
mobileTextFormatSheet.hidden = true;
mobileTextFormatSheet.innerHTML = `
  <div class="mob-tf-header">
    <span class="mob-tf-title">Formatar texto</span>
    <button class="mob-tf-close" id="mob-tf-close" aria-label="Fechar">✕</button>
  </div>
  <div class="mob-tf-grid">
    <button class="mob-tf-btn" data-act="upper"><b>AA</b><span>MAIÚSCULAS</span></button>
    <button class="mob-tf-btn" data-act="lower"><b>aa</b><span>minúsculas</span></button>
    <button class="mob-tf-btn" data-act="title"><b>Aa</b><span>Cada palavra</span></button>
    <button class="mob-tf-btn" data-act="sentence"><b>A.</b><span>Frase</span></button>
    <button class="mob-tf-btn" data-act="para"><b>¶A</b><span>Parágrafo</span></button>
    <button class="mob-tf-btn" data-act="invert"><b>aA</b><span>Inverter</span></button>
    <button class="mob-tf-btn" data-act="no-accents"><b>Á</b><span>Sem acentos</span></button>
    <button class="mob-tf-btn" data-act="clean-spaces"><b>⎵</b><span>Espaços</span></button>
  </div>
`;

// Bottom Sheet: Trocar Tipo de Bloco (Sem modal e SEM scrim)
const mobileTypeSheet = document.createElement('div');
mobileTypeSheet.className = 'mobile-type-sheet-no-scrim';
mobileTypeSheet.hidden = true;
mobileTypeSheet.innerHTML = `
  <div class="mob-sheet-handle"></div>
  <div class="mob-sheet-header">
    <span class="mob-sheet-title">Trocar tipo de bloco</span>
    <button class="mob-sheet-close" id="mob-type-close" aria-label="Fechar">✕</button>
  </div>
  <div class="mob-sheet-grid" id="mob-sheet-grid"></div>
`;

const MOBILE_BLOCK_TYPES = [
  { type: 'paragraph',         label: 'Texto',       icon: 'notes' },
  { type: 'heading1',          label: 'Título 1',    icon: 'format_h1' },
  { type: 'heading2',          label: 'Título 2',    icon: 'format_h2' },
  { type: 'heading3',          label: 'Título 3',    icon: 'format_h3' },
  { type: 'bullet',            label: 'Marcadores',  icon: 'format_list_bulleted' },
  { type: 'number',            label: 'Numerada',    icon: 'format_list_numbered' },
  { type: 'checklist',         label: 'Checklist',   icon: 'checklist' },
  { type: 'quote',             label: 'Citação',     icon: 'format_quote' },
  { type: 'callout:note',      label: 'Nota',        icon: 'info' },
  { type: 'callout:tip',       label: 'Dica',        icon: 'lightbulb' },
  { type: 'callout:important', label: 'Importante',  icon: 'priority_high' },
  { type: 'callout:warning',   label: 'Alerta',      icon: 'warning' },
  { type: 'code',              label: 'Código',      icon: 'code' },
  { type: 'table',             label: 'Tabela',      icon: 'table' },
  { type: 'divider',           label: 'Divisor',     icon: 'horizontal_rule' },
];

const mobSheetGrid = mobileTypeSheet.querySelector('#mob-sheet-grid');
for (const it of MOBILE_BLOCK_TYPES) {
  const itemBtn = document.createElement('button');
  itemBtn.className = 'mob-sheet-item';
  itemBtn.innerHTML = `<span class="qd-icon material-symbols-rounded">${it.icon}</span><span>${escHtml(it.label)}</span>`;
  itemBtn.addEventListener('mousedown', e => e.preventDefault());
  itemBtn.addEventListener('click', e => {
    e.stopPropagation();
    applyMobileBlockType(it.type);
  });
  mobSheetGrid.appendChild(itemBtn);
}

function applyMobileBlockType(type) {
  const block = currentBlock() || lastFocusedBlock || root.querySelector('.block');
  closeMobileTypeSheet();
  if (!block || !root.contains(block)) return;

  if (type === 'divider') {
    insertDividerAtCursor();
  } else if (type === 'table') {
    const inserted = createBlockEl('table');
    block.after(inserted);
    if (!inserted.nextElementSibling) inserted.after(createBlockEl('paragraph'));
    focusCell(inserted.querySelector('.table-cell'));
    renumberLists();
    scheduleSave();
  } else {
    transformBlocks(block, type);
  }
}

// Bottom Sheet: Modelos de Bloco (Sem modal e SEM scrim, totalmente separado de tipo)
const mobileTemplateSheet = document.createElement('div');
mobileTemplateSheet.className = 'mobile-template-sheet-no-scrim';
mobileTemplateSheet.hidden = true;
mobileTemplateSheet.innerHTML = `
  <div class="mob-sheet-handle"></div>
  <div class="mob-sheet-header">
    <span class="mob-sheet-title">Modelos de bloco</span>
    <button class="mob-sheet-close" id="mob-template-close" aria-label="Fechar">✕</button>
  </div>
  <div class="mob-template-list" id="mob-template-list"></div>
  <div class="mob-template-footer">
    <button class="mob-template-save-btn" id="mob-template-save-btn">
      <span class="qd-icon material-symbols-rounded">bookmark_add</span>
      <span>Salvar bloco atual como modelo</span>
    </button>
  </div>
`;

function renderMobileTemplateList() {
  const listEl = mobileTemplateSheet.querySelector('#mob-template-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const tpls = blockTemplates();
  if (tpls.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mob-template-empty';
    empty.textContent = 'Nenhum modelo de bloco salvo ainda';
    listEl.appendChild(empty);
    return;
  }

  for (const tpl of tpls) {
    const itemBtn = document.createElement('button');
    itemBtn.className = 'mob-template-item';
    itemBtn.innerHTML = `
      <span class="qd-icon material-symbols-rounded">bookmark</span>
      <span class="mob-template-name">${escHtml(tpl.name)}</span>
    `;
    itemBtn.addEventListener('mousedown', e => e.preventDefault());
    itemBtn.addEventListener('click', e => {
      e.stopPropagation();
      closeMobileTemplateSheet();
      captureUndoPoint();
      const target = currentBlock() || lastFocusedBlock || root.lastElementChild;
      insertTemplateBlocks(tpl.content, target);
    });
    listEl.appendChild(itemBtn);
  }
}

function closeMobileTemplateSheet() {
  mobileTemplateSheet.hidden = true;
}

function toggleMobileTemplateSheet() {
  if (mobileTemplateSheet.hidden) {
    const block = currentBlock();
    if (block) lastFocusedBlock = block;
    renderMobileTemplateList();
    mobileTemplateSheet.hidden = false;
    closeMobileAddPopover();
    closeMobileTypeSheet();
    closeMobileTextFormatSheet();
    closeMobileColorPopover();
  } else {
    mobileTemplateSheet.hidden = true;
  }
}

mobileTemplateSheet.querySelector('#mob-template-close')?.addEventListener('click', e => {
  e.stopPropagation();
  closeMobileTemplateSheet();
});

mobileTemplateSheet.querySelector('#mob-template-save-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) {
    showFeedback('Nenhum bloco para salvar');
    return;
  }
  const targets = alvos.length > 1 ? alvos : targetBlocksFor(alvos[0]);
  const markdown = blocksToMarkdown(targets.map(serializeBlockEl));
  if (!markdown.trim()) {
    showFeedback('Nada para salvar');
    return;
  }
  closeMobileTemplateSheet();
  openSaveBlockTemplate(mobBtnTemplates, markdown, nome => {
    showFeedback(`Modelo "${nome}" salvo`);
    renderMobileTemplateList();
  });
});

// ── Botões do Estado 1: Formatação de Texto ──────────────────────────────────
function createMobToolbarBtn(act, html, title, clickFn) {
  const btn = document.createElement('button');
  btn.className = 'mob-btn';
  btn.dataset.act = act;
  btn.title = title;
  btn.innerHTML = html;
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', e => {
    e.stopPropagation();
    clickFn(e);
  });
  return btn;
}

const mobBtnBold = createMobToolbarBtn('bold', '<b>B</b>', 'Negrito', () => execFormat('bold'));
const mobBtnItalic = createMobToolbarBtn('italic', '<i>I</i>', 'Itálico', () => execFormat('italic'));
const mobBtnUnderline = createMobToolbarBtn('underline', '<u>U</u>', 'Sublinhado', () => execFormat('underline'));
const mobBtnStrike = createMobToolbarBtn('strike', '<s>S</s>', 'Tachado', () => execFormat('strikeThrough'));
const mobBtnCode = createMobToolbarBtn('code', '&lt;/&gt;', 'Código em linha', () => wrapSelectionInTag('code'));
const mobBtnLink = createMobToolbarBtn('link', '<span class="qd-icon material-symbols-rounded">link</span>', 'Link', () => applyLink());
const mobBtnColor = createMobToolbarBtn('color', '<span class="qd-icon material-symbols-rounded">palette</span>', 'Cor e destaque', () => {
  toggleMobileColorPopover();
});

const mobBtnTextFormat = createMobToolbarBtn(
  'text-format',
  '<span class="qd-icon material-symbols-rounded">text_format</span><span class="mob-btn-label">Formatar</span>',
  'Formatar texto',
  () => {
    toggleMobileTextFormatSheet();
  }
);

const mobBtnFmtCopyImg = createMobToolbarBtn(
  'fmt-copy-img',
  '<span class="qd-icon material-symbols-rounded">image</span>',
  'Copiar bloco como imagem',
  () => {
    const b = currentBlock() || lastFocusedBlock;
    if (b) printBlocks(b, 'clipboard');
  }
);

const mobBtnFmtDownloadImg = createMobToolbarBtn(
  'fmt-down-img',
  '<span class="qd-icon material-symbols-rounded">download</span>',
  'Baixar bloco como imagem',
  () => {
    const b = currentBlock() || lastFocusedBlock;
    if (b) printBlocks(b, 'download');
  }
);

const mobBtnFmtDownloadMd = createMobToolbarBtn(
  'fmt-down-md',
  '<span class="qd-icon material-symbols-rounded">description</span><span class="mob-btn-label">.md</span>',
  'Baixar bloco como Markdown',
  async () => {
    const b = currentBlock() || lastFocusedBlock;
    if (!b) return;
    const targets = targetBlocksFor(b).map(serializeBlockEl);
    const text = await blocksToExportMarkdown(targets);
    const nome = getSuggestedBlockFilename([b], 'bloco');
    downloadTextFile(`${nome}.md`, text, 'text/markdown;charset=utf-8');
    showFeedback('Markdown baixado!');
  }
);

const mobBtnFmtDownloadTxt = createMobToolbarBtn(
  'fmt-down-txt',
  '<span class="qd-icon material-symbols-rounded">text_snippet</span><span class="mob-btn-label">.txt</span>',
  'Baixar bloco como Texto',
  () => {
    const b = currentBlock() || lastFocusedBlock;
    if (!b) return;
    const targets = targetBlocksFor(b).map(serializeBlockEl);
    const text = blocksToPlainText(targets);
    const nome = getSuggestedBlockFilename([b], 'bloco');
    downloadTextFile(`${nome}.txt`, text, 'text/plain;charset=utf-8');
    showFeedback('Texto baixado!');
  }
);

mobileFormatBar.append(
  mobBtnBold,
  mobBtnItalic,
  mobBtnUnderline,
  mobBtnStrike,
  mobBtnCode,
  mobBtnLink,
  mobBtnColor,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobBtnTextFormat,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobBtnFmtCopyImg,
  mobBtnFmtDownloadImg,
  mobBtnFmtDownloadMd,
  mobBtnFmtDownloadTxt
);

// ── Botões do Estado 2: Ações de Bloco ───────────────────────────────────────
const mobBtnAdd = createMobToolbarBtn(
  'add-menu',
  '<span class="qd-icon material-symbols-rounded">add</span>',
  'Adicionar bloco (acima ou abaixo)',
  () => {
    toggleMobileAddPopover();
  }
);
mobBtnAdd.classList.add('mob-btn-add');

const mobUndoBtn = createMobToolbarBtn(
  'undo',
  '<span class="qd-icon material-symbols-rounded">undo</span>',
  'Desfazer',
  () => {
    performUndo();
    updateMobileToolbarState();
  }
);

const mobRedoBtn = createMobToolbarBtn(
  'redo',
  '<span class="qd-icon material-symbols-rounded">redo</span>',
  'Refazer',
  () => {
    performRedo();
    updateMobileToolbarState();
  }
);

const mobMoveUpBtn = createMobToolbarBtn(
  'move-up',
  '<span class="qd-icon material-symbols-rounded">arrow_upward</span>',
  'Mover bloco para cima',
  () => {
    moveActiveBlock(-1);
  }
);

const mobMoveDownBtn = createMobToolbarBtn(
  'move-down',
  '<span class="qd-icon material-symbols-rounded">arrow_downward</span>',
  'Mover bloco para baixo',
  () => {
    moveActiveBlock(1);
  }
);

const mobOutdentBtn = createMobToolbarBtn(
  'outdent',
  '<span class="qd-icon material-symbols-rounded">format_indent_decrease</span>',
  'Desindentar',
  () => {
    indentActiveBlock(-1);
  }
);

const mobIndentBtn = createMobToolbarBtn(
  'indent',
  '<span class="qd-icon material-symbols-rounded">format_indent_increase</span>',
  'Indentar',
  () => {
    indentActiveBlock(1);
  }
);

const mobBtnType = createMobToolbarBtn(
  'change-type',
  '<span class="qd-icon material-symbols-rounded">interests</span><span class="mob-btn-label">Tipo</span>',
  'Trocar tipo de bloco',
  () => {
    toggleMobileTypeSheet();
  }
);

const mobBtnTemplates = createMobToolbarBtn(
  'templates',
  '<span class="qd-icon material-symbols-rounded">bookmark</span><span class="mob-btn-label">Modelos</span>',
  'Modelos de bloco',
  () => {
    toggleMobileTemplateSheet();
  }
);

const mobBtnSelect = createMobToolbarBtn(
  'select-blocks',
  '<span class="qd-icon material-symbols-rounded">checklist</span><span class="mob-btn-label">Selecionar</span>',
  'Selecionar blocos',
  () => {
    toggleBlockSelectMode();
  }
);

mobileBlockBar.append(
  mobBtnAdd,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobUndoBtn,
  mobRedoBtn,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobMoveUpBtn,
  mobMoveDownBtn,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobOutdentBtn,
  mobIndentBtn,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobBtnType,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobBtnTemplates,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobBtnSelect
);

// ── Botões do Estado 3: Seleção de Blocos (mobileSelectBar) ─────────────────
const mobSelectCount = document.createElement('span');
mobSelectCount.className = 'mob-select-count';
mobSelectCount.textContent = '1 bloco';

const mobBtnCopyText = createMobToolbarBtn(
  'sel-copy-text',
  '<span class="qd-icon material-symbols-rounded">content_copy</span><span class="mob-btn-label">Copiar</span>',
  'Copiar texto dos blocos',
  () => copySelectedBlocksAsText()
);

const mobBtnCopyImg = createMobToolbarBtn(
  'sel-copy-img',
  '<span class="qd-icon material-symbols-rounded">image</span><span class="mob-btn-label">Copiar img</span>',
  'Copiar blocos como imagem',
  () => copySelectedBlocksAsImage()
);

const mobBtnDownloadImg = createMobToolbarBtn(
  'sel-down-img',
  '<span class="qd-icon material-symbols-rounded">download</span><span class="mob-btn-label">Baixar img</span>',
  'Baixar blocos como imagem',
  () => downloadSelectedBlocksAsImage()
);

const mobBtnDownloadMd = createMobToolbarBtn(
  'sel-down-md',
  '<span class="qd-icon material-symbols-rounded">description</span><span class="mob-btn-label">.md</span>',
  'Baixar blocos como Markdown (.md)',
  () => downloadSelectedBlocksAsMd()
);

const mobBtnDownloadTxt = createMobToolbarBtn(
  'sel-down-txt',
  '<span class="qd-icon material-symbols-rounded">text_snippet</span><span class="mob-btn-label">.txt</span>',
  'Baixar blocos como Texto (.txt)',
  () => downloadSelectedBlocksAsTxt()
);

const mobBtnSaveTpl = createMobToolbarBtn(
  'sel-save-tpl',
  '<span class="qd-icon material-symbols-rounded">bookmark_add</span><span class="mob-btn-label">Modelo</span>',
  'Salvar blocos como modelo',
  () => saveSelectedBlocksAsTemplate()
);

const mobBtnDeleteBlocks = createMobToolbarBtn(
  'sel-delete',
  '<span class="qd-icon material-symbols-rounded">delete</span>',
  'Excluir blocos',
  () => deleteSelectedBlocks()
);
mobBtnDeleteBlocks.classList.add('mob-btn-danger');

const mobBtnCloseSelect = createMobToolbarBtn(
  'sel-done',
  '<span class="qd-icon material-symbols-rounded">check</span><span class="mob-btn-label">Concluir</span>',
  'Concluir seleção',
  () => exitBlockSelectMode()
);

mobileSelectBar.append(
  mobSelectCount,
  mobBtnCopyText,
  mobBtnCopyImg,
  mobBtnDownloadImg,
  mobBtnDownloadMd,
  mobBtnDownloadTxt,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobBtnSaveTpl,
  mobBtnDeleteBlocks,
  Object.assign(document.createElement('div'), { className: 'mob-sep' }),
  mobBtnCloseSelect
);

// ── Handlers das Ações de Bloco ─────────────────────────────────────────────
function moveActiveBlock(direction) {
  const block = currentBlock() || lastFocusedBlock;
  if (!block || !root.contains(block)) return;
  captureUndoPoint();
  if (direction === -1) {
    const prev = block.previousElementSibling;
    if (prev && prev.classList?.contains('block')) {
      prev.before(block);
      renumberLists();
      scheduleSave();
      block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } else if (direction === 1) {
    const next = block.nextElementSibling;
    if (next && next.classList?.contains('block')) {
      next.after(block);
      renumberLists();
      scheduleSave();
      block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

function indentActiveBlock(delta) {
  const block = currentBlock() || lastFocusedBlock;
  if (!block || !root.contains(block)) return;
  const antes = snapshotState();
  const alvos = targetBlocksFor(block);
  if (indentBlocks(alvos, delta)) {
    captureUndoPoint(antes);
    renumberLists();
    scheduleSave();
  }
}

function addBlockRelative(position) {
  const block = currentBlock() || lastFocusedBlock || root.lastElementChild;
  captureUndoPoint();
  const newBlock = createBlockEl('paragraph');
  if (position === 'above') {
    if (block) block.before(newBlock);
    else root.prepend(newBlock);
  } else {
    if (block) block.after(newBlock);
    else root.appendChild(newBlock);
  }
  renumberLists();
  focusBlockStart(newBlock);
  scheduleSave();
  lastFocusedBlock = newBlock;
}

// ── Ações de Seleção de Blocos ───────────────────────────────────────────────
function enterBlockSelectMode(initialBlock) {
  setIsBlockSelectActive(true);
  noteSection.classList.add('touch-selection-active');
  const target = initialBlock || currentBlock() || lastFocusedBlock || root.firstElementChild;
  if (target && target.dataset.id) {
    setBlockSelection([target.dataset.id]);
    setLastHandleClickedId(target.dataset.id);
  } else {
    setBlockSelection([]);
  }
  updateMobileToolbarState();
  showFeedback('Modo seleção ativo · toque nos blocos para selecionar');
}

function exitBlockSelectMode() {
  setIsBlockSelectActive(false);
  noteSection.classList.remove('touch-selection-active');
  clearBlockSelection();
  updateMobileToolbarState();
}

function toggleBlockSelectMode() {
  if (getIsBlockSelectActive()) {
    exitBlockSelectMode();
  } else {
    enterBlockSelectMode();
  }
}

async function copySelectedBlocksAsText() {
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) {
    showFeedback('Nenhum bloco selecionado');
    return;
  }
  const targets = alvos.map(serializeBlockEl);
  const text = blocksToPlainText(targets);
  await navigator.clipboard.writeText(text);
  showFeedback('Texto copiado!');
}

async function copySelectedBlocksAsImage() {
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) {
    showFeedback('Nenhum bloco selecionado');
    return;
  }
  showFeedback('Gerando imagem…');
  try {
    const ok = await copyBlocksAsImage(alvos);
    showFeedback(ok ? 'Imagem copiada!' : 'Erro ao copiar imagem');
  } catch (_) {
    showFeedback('Erro ao copiar imagem');
  }
}

async function downloadSelectedBlocksAsImage() {
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) {
    showFeedback('Nenhum bloco selecionado');
    return;
  }
  const nome = getSuggestedBlockFilename(alvos, 'nota');
  showFeedback('Gerando imagem…');
  try {
    const ok = await downloadBlocksAsImage(alvos, nome);
    showFeedback(ok ? 'Imagem baixada!' : 'Erro ao baixar imagem');
  } catch (_) {
    showFeedback('Erro ao baixar imagem');
  }
}

async function downloadSelectedBlocksAsMd() {
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) {
    showFeedback('Nenhum bloco selecionado');
    return;
  }
  const targets = alvos.map(serializeBlockEl);
  const text = await blocksToExportMarkdown(targets);
  const nome = getSuggestedBlockFilename(alvos, 'blocos');
  downloadTextFile(`${nome}.md`, text, 'text/markdown;charset=utf-8');
  showFeedback('Markdown baixado!');
}

function downloadSelectedBlocksAsTxt() {
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) {
    showFeedback('Nenhum bloco selecionado');
    return;
  }
  const targets = alvos.map(serializeBlockEl);
  const text = blocksToPlainText(targets);
  const nome = getSuggestedBlockFilename(alvos, 'blocos');
  downloadTextFile(`${nome}.txt`, text, 'text/plain;charset=utf-8');
  showFeedback('Texto baixado!');
}

function saveSelectedBlocksAsTemplate() {
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) {
    showFeedback('Nenhum bloco selecionado');
    return;
  }
  const targets = alvos.length > 1 ? alvos : targetBlocksFor(alvos[0]);
  const markdown = blocksToMarkdown(targets.map(serializeBlockEl));
  if (!markdown.trim()) {
    showFeedback('Nada para salvar');
    return;
  }
  openSaveBlockTemplate(mobBtnSaveTpl, markdown, nome => {
    showFeedback(`Modelo "${nome}" salvo`);
    renderMobileTemplateList();
  });
}

function deleteSelectedBlocks() {
  const alvos = getSelectedBlockElements();
  if (alvos.length === 0) return;
  captureUndoPoint();
  const prev = alvos[0].previousElementSibling;
  alvos.forEach(b => b.remove());
  if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));
  renumberLists();
  exitBlockSelectMode();
  const focusTarget = (prev && document.body.contains(prev)) ? prev : root.firstElementChild;
  if (focusTarget) {
    const c = getContentEl(focusTarget);
    c.focus();
    setCaretOffset(c, c.textContent.length);
  }
  scheduleSave();
}

// ── Toque Longo em Blocos no Mobile para Seleção ─────────────────────────────
let touchSelectTimer = null;
let touchSelectStart = null;

root.addEventListener('pointerdown', e => {
  const isMobile = typeof document !== 'undefined' && document.documentElement.dataset.platform === 'mobile';
  if (!isMobile) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const targetBlock = e.target.closest('.block');
  if (!targetBlock || !root.contains(targetBlock)) return;

  if (e.target.closest('a, button, input, .block-checkbox, mark')) return;

  touchSelectStart = { x: e.clientX, y: e.clientY, block: targetBlock };
  clearTimeout(touchSelectTimer);

  touchSelectTimer = setTimeout(() => {
    if (!touchSelectStart) return;
    const blk = touchSelectStart.block;
    if (blk && root.contains(blk)) {
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch (_) {}
      }
      enterBlockSelectMode(blk);
    }
    touchSelectStart = null;
  }, 450);
}, { passive: true });

root.addEventListener('pointermove', e => {
  if (!touchSelectStart) return;
  const dx = Math.abs(e.clientX - touchSelectStart.x);
  const dy = Math.abs(e.clientY - touchSelectStart.y);
  if (dx > 10 || dy > 10) {
    clearTimeout(touchSelectTimer);
    touchSelectStart = null;
  }
}, { passive: true });

root.addEventListener('pointerup', () => {
  clearTimeout(touchSelectTimer);
  touchSelectStart = null;
}, { passive: true });

root.addEventListener('pointercancel', () => {
  clearTimeout(touchSelectTimer);
  touchSelectStart = null;
}, { passive: true });

// Handlers do Popover Adicionar
mobileAddPopover.querySelectorAll('.mob-popover-item').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const pos = btn.dataset.pos;
    addBlockRelative(pos);
    closeMobileAddPopover();
  });
});

// Handlers do Popover Cores
mobileColorPopover.querySelectorAll('.mob-color-dot').forEach(dot => {
  dot.addEventListener('mousedown', e => e.preventDefault());
  dot.addEventListener('click', e => {
    e.stopPropagation();
    const color = dot.dataset.color;
    if (color === 'transparent') {
      document.execCommand('removeFormat', false, null);
    } else {
      document.execCommand('hiliteColor', false, color);
    }
    closeMobileColorPopover();
    scheduleSave();
  });
});

// Handlers do Painel Formatar Texto
mobileTextFormatSheet.querySelectorAll('.mob-tf-btn').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const act = btn.dataset.act;
    if (act === 'upper') applyTransformToSelection(s => s.toUpperCase());
    else if (act === 'lower') applyTransformToSelection(s => s.toLowerCase());
    else if (act === 'title') applyTransformToSelection(ttTitleCase);
    else if (act === 'sentence') applyTransformToSelection(ttSentenceCase);
    else if (act === 'para') applyTransformToSelection(ttParaCase);
    else if (act === 'invert') applyTransformToSelection(ttInvertCase);
    else if (act === 'no-accents') applyTransformToSelection(ttNoAccents);
    else if (act === 'clean-spaces') applyTransformToSelection(ttCleanSpaces);
    closeMobileTextFormatSheet();
  });
});

mobileTextFormatSheet.querySelector('#mob-tf-close')?.addEventListener('click', e => {
  e.stopPropagation();
  closeMobileTextFormatSheet();
});

mobileTypeSheet.querySelector('#mob-type-close')?.addEventListener('click', e => {
  e.stopPropagation();
  closeMobileTypeSheet();
});

function closeMobileAddPopover() {
  mobileAddPopover.hidden = true;
}
function toggleMobileAddPopover() {
  mobileAddPopover.hidden = !mobileAddPopover.hidden;
  if (!mobileAddPopover.hidden) {
    closeMobileTypeSheet();
    closeMobileTemplateSheet();
    closeMobileTextFormatSheet();
    closeMobileColorPopover();
  }
}

function closeMobileTextFormatSheet() {
  mobileTextFormatSheet.hidden = true;
}
function toggleMobileTextFormatSheet() {
  mobileTextFormatSheet.hidden = !mobileTextFormatSheet.hidden;
  if (!mobileTextFormatSheet.hidden) {
    closeMobileColorPopover();
  }
}

function closeMobileColorPopover() {
  mobileColorPopover.hidden = true;
}
function toggleMobileColorPopover() {
  mobileColorPopover.hidden = !mobileColorPopover.hidden;
  if (!mobileColorPopover.hidden) {
    closeMobileTextFormatSheet();
  }
}

function closeMobileTypeSheet() {
  mobileTypeSheet.hidden = true;
}
function toggleMobileTypeSheet() {
  if (mobileTypeSheet.hidden) {
    const block = currentBlock();
    if (block) lastFocusedBlock = block;
    mobileTypeSheet.hidden = false;
    closeMobileAddPopover();
    closeMobileTemplateSheet();
    closeMobileTextFormatSheet();
    closeMobileColorPopover();
  } else {
    mobileTypeSheet.hidden = true;
  }
}

// Fecha popovers ao tocar fora
document.addEventListener('pointerdown', e => {
  if (typeof document === 'undefined') return;
  if (!mobileAddPopover.hidden && !mobileAddPopover.contains(e.target) && !mobBtnAdd.contains(e.target)) {
    closeMobileAddPopover();
  }
  if (!mobileTextFormatSheet.hidden && !mobileTextFormatSheet.contains(e.target) && !mobBtnTextFormat.contains(e.target)) {
    closeMobileTextFormatSheet();
  }
  if (!mobileColorPopover.hidden && !mobileColorPopover.contains(e.target) && !mobBtnColor.contains(e.target)) {
    closeMobileColorPopover();
  }
  if (!mobileTypeSheet.hidden && !mobileTypeSheet.contains(e.target) && !mobBtnType.contains(e.target)) {
    closeMobileTypeSheet();
  }
  if (!mobileTemplateSheet.hidden && !mobileTemplateSheet.contains(e.target) && !mobBtnTemplates.contains(e.target)) {
    closeMobileTemplateSheet();
  }
});

// Atualiza o estado da barra contextual (Texto Selecionado vs Ações de Bloco vs Seleção de Blocos)
export function updateMobileToolbarState() {
  if (typeof document === 'undefined') return;

  const docEl = document.documentElement;
  const isFullscreenView = docEl.classList.contains('has-maximized-panel') ||
                           docEl.classList.contains('view-fullscreen') ||
                           docEl.classList.contains('view-templates') ||
                           ((docEl.classList.contains('view-grafo') ||
                             docEl.classList.contains('view-board') ||
                             docEl.classList.contains('view-calendar') ||
                             docEl.classList.contains('view-bases')) && !docEl.classList.contains('view-split'));

  if (!getCurrentNoteId()) {
    if (mobileNotionToolbar) {
      mobileNotionToolbar.hidden = true;
      mobileNotionToolbar.style.display = 'none';
    }
    return;
  }
  if (isFullscreenView) {
    if (mobileNotionToolbar) {
      mobileNotionToolbar.hidden = true;
      mobileNotionToolbar.style.display = 'none';
    }
    return;
  }
  if (mobileNotionToolbar) {
    mobileNotionToolbar.hidden = false;
    mobileNotionToolbar.style.display = '';
  }

  if (getSelectedBlockIds().size > 0 || getIsBlockSelectActive()) {
    mobileBlockBar.hidden = true;
    mobileBlockBar.style.display = 'none';
    mobileFormatBar.hidden = true;
    mobileFormatBar.style.display = 'none';
    mobileSelectBar.hidden = false;
    mobileSelectBar.style.display = 'flex';

    closeMobileAddPopover();
    closeMobileTypeSheet();
    closeMobileTemplateSheet();
    closeMobileTextFormatSheet();
    closeMobileColorPopover();

    const count = getSelectedBlockIds().size;
    mobSelectCount.textContent = count === 1 ? '1 bloco' : `${count} blocos`;
    return;
  }

  mobileSelectBar.hidden = true;
  mobileSelectBar.style.display = 'none';

  const sel = document.getSelection();
  const hasSelection = sel && !sel.isCollapsed && sel.rangeCount > 0 && root.contains(sel.anchorNode);

  if (hasSelection) {
    mobileBlockBar.hidden = true;
    mobileBlockBar.style.display = 'none';
    mobileFormatBar.hidden = false;
    mobileFormatBar.style.display = 'flex';
    closeMobileAddPopover();
    closeMobileTypeSheet();
    closeMobileTemplateSheet();
  } else {
    mobileFormatBar.hidden = true;
    mobileFormatBar.style.display = 'none';
    mobileBlockBar.hidden = false;
    mobileBlockBar.style.display = 'flex';
    closeMobileTextFormatSheet();
    closeMobileColorPopover();

    const blk = currentBlock();
    if (blk) lastFocusedBlock = blk;

    mobUndoBtn.disabled = getUndoStackLength() === 0;
    mobRedoBtn.disabled = getRedoStackLength() === 0;
  }
}

document.addEventListener('selectionchange', updateMobileToolbarState);
try {
  onViewChange(() => updateMobileToolbarState());
} catch (_) {}
document.addEventListener('quickdock:view-changed', updateMobileToolbarState);
document.addEventListener('quickdock:maximize-changed', updateMobileToolbarState);

root.addEventListener('scroll', () => {
  closeMobileAddPopover();
  closeMobileTextFormatSheet();
  closeMobileColorPopover();
  closeMobileTypeSheet();
  closeMobileTemplateSheet();
}, { passive: true });

// Monta os elementos no DOM
mobileNotionToolbar.append(
  mobileAddPopover,
  mobileColorPopover,
  mobileTextFormatSheet,
  mobileFormatBar,
  mobileBlockBar,
  mobileSelectBar
);
noteSection.appendChild(mobileNotionToolbar);
document.body.appendChild(mobileTypeSheet);
document.body.appendChild(mobileTemplateSheet);
// Adiado: este módulo é importado cedo no carregamento de note.js (antes da
// própria `let currentNoteId` de note.js terminar de inicializar), e
// updateMobileToolbarState() lê esse valor via getCurrentNoteId() — chamar
// direto aqui no topo do módulo estoura "Cannot access before initialization".
queueMicrotask(updateMobileToolbarState);

// Ao tocar no editor no mobile, se documentos estiver aberto, recolhe-o suavemente
root.addEventListener('pointerdown', () => {
  const isMobile = typeof document !== 'undefined' && document.documentElement.dataset.platform === 'mobile';
  if (isMobile) {
    const docsSec = document.querySelector('.docs-section');
    if (docsSec && !docsSec.classList.contains('is-collapsed')) {
      setDocsCollapsed(true);
    }
  }
});

root.addEventListener('focusin', () => {
  syncVisualViewport();
  updateMobileToolbarState();
});

root.addEventListener('focusout', () => {
  setTimeout(syncVisualViewport, 120);
});

syncVisualViewport();


// Usado pelo listener de "clique fora limpa a seleção" (ainda em note.js) pra
// não fechar a seleção quando o clique foi na própria toolbar mobile.
export function isEventInsideMobileToolbar(target) {
  return mobileNotionToolbar.contains(target)
    || mobileTemplateSheet.contains(target)
    || mobileTypeSheet.contains(target);
}
