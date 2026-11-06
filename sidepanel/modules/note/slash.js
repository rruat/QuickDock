import { t as tr } from '../i18n.js';
import { CALLOUT_LABELS, CALLOUT_TYPES, escHtml, parseMarkdownToBlocks } from '../blocks.js';
import { blockTemplates } from '../templates.js';
import { NO_DETECTION, createBlockEl, createBlockElFrom, setPageBreakBlank } from './block-model.js';
import { pedirMidia } from './media.js';
import { clearContent, convertBlockType, focusBlockStart, renumberLists } from './block-ops.js';
import { getContentEl } from './block-structure.js';
import { applyDetectionMarks } from './detection.js';
import { pedirImagem } from './images-ui.js';
import { absorbDataUrls, focusBlockEnd } from './images.js';
import { positionMenu } from './menus.js';
import { S } from './state.js';
import { focusCell } from './table.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export const SLASH_ITEMS = [
  { key: 'texto',      label: tr('Texto'),                 hint: tr('parágrafo'),  type: 'paragraph' },
  { key: 'titulo1',    label: tr('Título 1'),               hint: '#',          type: 'heading1'  },
  { key: 'titulo2',    label: tr('Título 2'),               hint: '##',         type: 'heading2'  },
  { key: 'titulo3',    label: tr('Título 3'),               hint: '###',        type: 'heading3'  },
  { key: 'lista',      label: tr('Lista com marcadores'),   hint: '-',          type: 'bullet'    },
  { key: 'numerada',   label: tr('Lista numerada'),         hint: '1.',         type: 'number'    },
  { key: 'checklist',  label: tr('Checklist'),              hint: '[ ]',        type: 'checklist' },
  { key: 'citacao',    label: tr('Citação'),                hint: '>',          type: 'quote'     },
  ...CALLOUT_TYPES.map(t => ({
    key:   CALLOUT_LABELS[t].toLowerCase(),
    label: `${tr('Destaque')} · ${tr(CALLOUT_LABELS[t])}`,
    hint:  `> [!${t}]`,
    type:  `callout:${t}`,
  })),
  { key: 'codigo',     label: tr('Código'),                 hint: '```',        type: 'code'      },
  { key: 'calculo',    label: tr('Cálculo'),                hint: tr('= ao vivo'),  type: 'calc'      },
  { key: 'tabela',     label: tr('Tabela'),                 hint: '| |',        type: 'table'     },
  { key: 'imagem',     label: tr('Imagem'),                 hint: tr('arquivo'),    type: 'image'     },
  { key: 'audio',      label: tr('Áudio'),                  hint: tr('arquivo'),    type: 'audio'     },
  { key: 'video',      label: tr('Vídeo'),                  hint: tr('arquivo'),    type: 'video'     },
  { key: 'divisor',    label: tr('Divisor'),                hint: '---',        type: 'divider'   },
  { key: 'sumario',    label: tr('Sumário'),                hint: 'toc',        type: 'toc'       },
  { key: 'quebra',     label: tr('Quebra de página'),       hint: tr('nova pág.'),  type: 'pagebreak' },
  { key: 'pagbranco',  label: tr('Página em branco'),       hint: tr('pág. vazia'), type: 'pagebreak', blank: true },
];

export const INSERTED_TYPES = new Set(['divider', 'table', 'image', 'pagebreak', 'toc']);

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

export function slashItemsWithTemplates() {
  return [
    ...SLASH_ITEMS,
    ...blockTemplates().map(t => ({
      key: t.name.toLowerCase(),
      label: t.name,
      hint: tr('modelo'),
      template: t.content,
    })),
  ];
}

export function closeSlashMenuEl() { S.slashMenuEl?.remove(); S.slashMenuEl = null; }

export function closeSlashMenu() { closeSlashMenuEl(); S.slashItems = []; S.slashBlock = null; }

export function cancelSlashMenu() {
  if (S.slashBlock) clearContent(getContentEl(S.slashBlock));
  closeSlashMenu();
}

export function renderSlashMenu(block) {
  closeSlashMenuEl();
  const menu = document.createElement('div');
  menu.className = 'copy-menu slash-menu';

  S.slashItems.forEach((it, i) => {
    const btn = document.createElement('button');
    btn.className = 'copy-opt slash-opt' + (i === S.slashIndex ? ' active' : '');
    btn.innerHTML = `<span class="copy-opt-value">${escHtml(it.label)}</span><span class="copy-opt-hint">${escHtml(it.hint)}</span>`;
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => { S.slashIndex = i; confirmSlashSelection(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  S.slashMenuEl = menu;
  positionMenu(menu, block.getBoundingClientRect());
  highlightSlashItem();
}

export function highlightSlashItem() {
  if (!S.slashMenuEl) return;
  const opcoes = S.slashMenuEl.querySelectorAll('.slash-opt');
  opcoes.forEach((btn, i) => btn.classList.toggle('active', i === S.slashIndex));
  // Sem isto o item ativo some da vista quando a lista é mais alta que o menu.
  opcoes[S.slashIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function moveSlashSelection(delta) {
  S.slashIndex = (S.slashIndex + delta + S.slashItems.length) % S.slashItems.length;
  highlightSlashItem();
}

export function confirmSlashSelection() {
  const item  = S.slashItems[S.slashIndex];
  const block = S.slashBlock;
  closeSlashMenu();
  if (!item || !block) return;

  captureUndoPoint();

  if (item.template) {
    // Tira o "/nome-do-modelo" que ficou digitado ANTES de inserir: com o
    // texto ainda ali, insertTemplateBlocks não reconhecia a linha como vazia
    // e pendurava o modelo abaixo dela, deixando a barra na nota.
    clearContent(getContentEl(block));
    insertTemplateBlocks(item.template, block);
    return;
  }

  // Imagem não insere bloco vazio: o bloco nasce junto com o arquivo, quando
  // ele for escolhido. Aqui só se limpa o "/imagem" que ficou digitado.
  if (item.type === 'image') {
    clearContent(getContentEl(block));
    pedirImagem({ inserirEm: block });
    return;
  }

  // Áudio e vídeo seguem a mesma regra: o bloco nasce com o arquivo escolhido.
  if (item.type === 'audio' || item.type === 'video') {
    clearContent(getContentEl(block));
    pedirMidia({ tipo: item.type, inserirEm: block });
    return;
  }

  if (INSERTED_TYPES.has(item.type)) {
    const inserted = createBlockEl(item.type);
    if (item.blank) setPageBreakBlank(inserted, true);
    block.replaceWith(inserted);
    const para = createBlockEl('paragraph');
    inserted.after(para);
    if (item.type === 'table') focusCell(inserted.querySelector('.table-cell'));
    else focusBlockStart(para);
  } else {
    const newBlock = convertBlockType(block, item.type);
    clearContent(getContentEl(newBlock));
    focusBlockStart(newBlock);
  }
  renumberLists();
}

export function checkSlashMenu(block) {
  const text = getContentEl(block).textContent;
  const m = /^\/(\w*)$/.exec(text);
  if (!m) { closeSlashMenu(); return; }

  const filter = m[1].toLowerCase();
  S.slashItems = slashItemsWithTemplates()
    .filter(it => it.label.toLowerCase().includes(filter) || it.key.includes(filter));
  if (S.slashItems.length === 0) { closeSlashMenu(); return; }

  S.slashBlock = block;
  S.slashIndex = 0;
  renderSlashMenu(block);
}
