// ── note-slash-menu.js ───────────────────────────────────────────────────────
// Menu "/" de inserção e troca rápida de tipo de bloco ou inserção de templates.
// Exibe opções em grade em 3 colunas organizadas por grupos (Texto, Listas,
// Destaques, Blocos, Modelos), com suporte a navegação por teclado e filtros.

import { createIcon } from '../icons.js';
import { positionMenu } from '../note-detection.js';
import { blockTemplates } from '../templates.js';
import { CALLOUT_TYPES, CALLOUT_LABELS } from '../blocks.js';

export const CALLOUT_ICONS = {
  note: 'info', tip: 'lightbulb', important: 'priority_high',
  warning: 'warning', caution: 'dangerous',
};

export const SLASH_ITEMS = [
  { key: 'texto',     label: 'Texto',               short: 'Texto',     hint: 'parágrafo', icon: 'notes',                 grupo: 'Texto',     type: 'paragraph' },
  { key: 'titulo1',   label: 'Título 1',            short: 'Título 1',  hint: '#',         icon: 'format_h1',             grupo: 'Texto',     type: 'heading1'  },
  { key: 'titulo2',   label: 'Título 2',            short: 'Título 2',  hint: '##',        icon: 'format_h2',             grupo: 'Texto',     type: 'heading2'  },
  { key: 'titulo3',   label: 'Título 3',            short: 'Título 3',  hint: '###',       icon: 'format_h3',             grupo: 'Texto',     type: 'heading3'  },

  { key: 'lista',     label: 'Lista com marcadores', short: 'Lista',    hint: '-',         icon: 'format_list_bulleted',  grupo: 'Listas',    type: 'bullet'    },
  { key: 'numerada',  label: 'Lista numerada',       short: 'Numerada', hint: '1.',        icon: 'format_list_numbered',  grupo: 'Listas',    type: 'number'    },
  { key: 'checklist', label: 'Checklist',            short: 'Checklist',hint: '[ ]',       icon: 'checklist',             grupo: 'Listas',    type: 'checklist' },

  { key: 'citacao',   label: 'Citação',              short: 'Citação',  hint: '>',         icon: 'format_quote',          grupo: 'Destaques', type: 'quote'     },
  ...CALLOUT_TYPES.map(t => ({
    key:   CALLOUT_LABELS[t].toLowerCase(),
    label: `Destaque · ${CALLOUT_LABELS[t]}`,
    short: CALLOUT_LABELS[t],
    hint:  `[!${t}]`,
    icon:  CALLOUT_ICONS[t],
    grupo: 'Destaques',
    type:  `callout:${t}`,
  })),

  { key: 'codigo',    label: 'Código',               short: 'Código',   hint: '```',       icon: 'code',                  grupo: 'Blocos',    type: 'code'      },
  { key: 'calculo',   label: 'Cálculo',              short: 'Cálculo',  hint: '= ao vivo', icon: 'calculate',             grupo: 'Blocos',    type: 'calc'      },
  { key: 'tabela',    label: 'Tabela',               short: 'Tabela',   hint: '| |',       icon: 'table',                 grupo: 'Blocos',    type: 'table'     },
  { key: 'imagem',    label: 'Imagem',               short: 'Imagem',   hint: 'arquivo',   icon: 'image',                 grupo: 'Blocos',    type: 'image'     },
  { key: 'audio',     label: 'Áudio',                short: 'Áudio',    hint: 'arquivo',   icon: 'audio_file',            grupo: 'Blocos',    type: 'audio'     },
  { key: 'video',     label: 'Vídeo',                short: 'Vídeo',    hint: 'arquivo',   icon: 'videocam',              grupo: 'Blocos',    type: 'video'     },
  { key: 'base',      label: 'Base de dados',        short: 'Base',     hint: '```base',   icon: 'view_kanban',           grupo: 'Blocos',    type: 'base'      },
  { key: 'divisor',   label: 'Divisor',              short: 'Divisor',  hint: '---',       icon: 'horizontal_rule',       grupo: 'Blocos',    type: 'divider'   },
];

export const INSERTED_TYPES = new Set(['divider', 'table', 'image', 'base']);

let slashMenuEl = null;
let slashItems  = [];
let slashIndex  = 0;
let slashBlock  = null;
let slashBackdropEl = null;

let _callbacks = {
  getContentEl: (el) => el,
  clearContent: (el) => {},
  captureUndoPoint: () => {},
  insertTemplateBlocks: (template, block) => {},
  pedirImagem: (intent, type) => {},
  createBlockEl: (type) => null,
  convertBlockType: (block, type) => null,
  focusCell: (cell) => {},
  focusBlockStart: (block) => {},
  renumberLists: () => {},
};

export function initNoteSlashMenu(callbacks) {
  _callbacks = { ..._callbacks, ...callbacks };
}

export function isSlashMenuOpen() {
  return slashMenuEl !== null;
}

export function buildTypeGrid(itens, aoEscolher) {
  const wrap = document.createElement('div');
  wrap.className = 'type-grid-wrap';

  let grupoAtual = null;
  let grade = null;

  itens.forEach((it, i) => {
    if (it.grupo !== grupoAtual) {
      grupoAtual = it.grupo;
      const cab = document.createElement('div');
      cab.className = 'copy-menu-header';
      cab.textContent = grupoAtual;
      wrap.appendChild(cab);
      grade = document.createElement('div');
      grade.className = 'type-grid';
      wrap.appendChild(grade);
    }

    const btn = document.createElement('button');
    btn.className = 'type-cell';
    btn.title = it.hint ? `${it.label} · ${it.hint}` : it.label;
    const ico = createIcon(it.icon, 'type-cell-icon');
    const nome = document.createElement('span');
    nome.className = 'type-cell-label';
    nome.textContent = it.short;
    btn.append(ico, nome);
    btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true });
    btn.addEventListener('click', e => { e.stopPropagation(); aoEscolher(i); });
    grade.appendChild(btn);
  });

  return wrap;
}

export function slashItemsWithTemplates() {
  return [
    ...SLASH_ITEMS,
    ...blockTemplates().map(t => ({
      key:   t.name.toLowerCase(),
      label: t.name,
      short: t.name,
      hint:  'modelo',
      icon:  'bookmark',
      grupo: 'Modelos',
      template: t.content,
    })),
  ];
}

function closeSlashBackdrop() {
  slashBackdropEl?.remove();
  slashBackdropEl = null;
}

function closeSlashMenuEl() {
  closeSlashBackdrop();
  slashMenuEl?.remove();
  slashMenuEl = null;
}

export function closeSlashMenu() {
  closeSlashMenuEl();
  slashItems = [];
  slashBlock = null;
}

export function cancelSlashMenu() {
  if (slashBlock) _callbacks.clearContent(_callbacks.getContentEl(slashBlock));
  closeSlashMenu();
}

function highlightSlashItem() {
  if (!slashMenuEl) return;
  const celulas = slashMenuEl.querySelectorAll('.type-cell');
  celulas.forEach((btn, i) => btn.classList.toggle('active', i === slashIndex));
  celulas[slashIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function moveSlashSelection(delta) {
  if (!slashItems.length) return;
  slashIndex = (slashIndex + delta + slashItems.length) % slashItems.length;
  highlightSlashItem();
}

export function moveSlashRow(direcao) {
  if (!slashMenuEl) return;
  const celulas = [...slashMenuEl.querySelectorAll('.type-cell')];
  const atual = celulas[slashIndex];
  if (!atual) return;

  const r = atual.getBoundingClientRect();
  let melhor = -1, menorDistancia = Infinity;

  celulas.forEach((c, i) => {
    const cr = c.getBoundingClientRect();
    const dy = cr.top - r.top;
    if (direcao > 0 ? dy <= 1 : dy >= -1) return;
    const dist = Math.abs(dy) * 1000 + Math.abs(cr.left - r.left);
    if (dist < menorDistancia) { menorDistancia = dist; melhor = i; }
  });

  slashIndex = melhor !== -1 ? melhor : (direcao > 0 ? 0 : celulas.length - 1);
  highlightSlashItem();
}

export function confirmSlashSelection() {
  const item  = slashItems[slashIndex];
  const block = slashBlock;
  closeSlashMenu();
  if (!item || !block) return;

  _callbacks.captureUndoPoint();

  if (item.template) {
    _callbacks.clearContent(_callbacks.getContentEl(block));
    _callbacks.insertTemplateBlocks(item.template, block);
    return;
  }

  if (item.type === 'image' || item.type === 'audio' || item.type === 'video') {
    _callbacks.clearContent(_callbacks.getContentEl(block));
    _callbacks.pedirImagem({ inserirEm: block }, item.type);
    return;
  }

  if (INSERTED_TYPES.has(item.type)) {
    const inserted = _callbacks.createBlockEl(item.type);
    block.replaceWith(inserted);
    const para = _callbacks.createBlockEl('paragraph');
    inserted.after(para);
    if (item.type === 'table') _callbacks.focusCell(inserted.querySelector('.table-cell'));
    else _callbacks.focusBlockStart(para);
  } else {
    const newBlock = _callbacks.convertBlockType(block, item.type);
    _callbacks.clearContent(_callbacks.getContentEl(newBlock));
    _callbacks.focusBlockStart(newBlock);
  }
  _callbacks.renumberLists();
}

export function renderSlashMenu(block) {
  closeSlashMenuEl();
  const menu = document.createElement('div');
  menu.className = 'copy-menu slash-menu';

  const isMobile = document.documentElement.dataset.platform === 'mobile';
  if (isMobile) {
    menu.classList.add('is-bottom-sheet');
    slashBackdropEl = document.createElement('div');
    slashBackdropEl.className = 'bottom-sheet-backdrop';
    slashBackdropEl.addEventListener('click', cancelSlashMenu);
    document.body.appendChild(slashBackdropEl);

    const pill = document.createElement('div');
    pill.className = 'bottom-sheet-drag-pill';
    const head = document.createElement('div');
    head.className = 'bottom-sheet-header';
    head.innerHTML = `<span class="bottom-sheet-title">Inserir bloco</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn bottom-sheet-close';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Fechar';
    closeBtn.setAttribute('aria-label', 'Fechar menu de blocos');
    closeBtn.addEventListener('click', cancelSlashMenu);
    head.appendChild(closeBtn);
    menu.prepend(pill, head);
  }

  menu.appendChild(buildTypeGrid(slashItems, i => { slashIndex = i; confirmSlashSelection(); }));

  document.body.appendChild(menu);
  slashMenuEl = menu;
  if (!isMobile) {
    positionMenu(menu, block.getBoundingClientRect());
  }
  highlightSlashItem();
}

export function openSlashMenuForBlock(block) {
  slashItems = slashItemsWithTemplates();
  slashBlock = block;
  slashIndex = 0;
  renderSlashMenu(block);
}

export function checkSlashMenu(block) {
  const text = _callbacks.getContentEl(block).textContent;
  const m = /^\/(\w*)$/.exec(text);
  if (!m) { closeSlashMenu(); return; }

  const filter = m[1].toLowerCase();
  slashItems = slashItemsWithTemplates()
    .filter(it => it.label.toLowerCase().includes(filter) || it.key.includes(filter));
  if (slashItems.length === 0) { closeSlashMenu(); return; }

  slashBlock = block;
  slashIndex = 0;
  renderSlashMenu(block);
}
