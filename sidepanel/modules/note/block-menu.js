import { t as tr } from '../i18n.js';
import { blocksToMarkdown, blocksToPlainText, escHtml } from '../blocks.js';
import { copyBlocksAsImage, downloadBlocksAsImage } from '../snapshot.js';
import { blockTemplates, openSaveBlockTemplate } from '../templates.js';
import { hideBlockControls } from './block-controls.js';
import { NO_TEXT_TYPES, createBlockEl, createBlockElFrom } from './block-model.js';
import { convertBlockType, renumberLists } from './block-ops.js';
import { clearBlockSelection, targetBlocksFor } from './block-selection.js';
import { getContentEl } from './block-structure.js';
import { setCaretOffset } from './caret.js';
import { showFeedback } from './feedback-ctrl.js';
import { closeCopyMenu, positionMenu } from './menus.js';
import { serializeBlockEl } from './save.js';
import { INSERTED_TYPES, SLASH_ITEMS, insertTemplateBlocks } from './slash.js';
import { S, root } from './state.js';
import { blocksToExportMarkdown, scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export function closeBlockMenu() { S.blockMenuEl?.remove(); S.blockMenuEl = null; }

export function getTransformTypes() {
  return SLASH_ITEMS.filter(it => !INSERTED_TYPES.has(it.type));
}

export function openBlockMenu(block, anchorEl) {
  closeBlockMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu block-menu';

  const scopeCount = (S.selectedBlockIds.size > 1 && S.selectedBlockIds.has(block.dataset.id))
    ? S.selectedBlockIds.size : 1;

  // ── Barra de ações rápidas, presa no topo ────────────────────────────────
  // O que se faz o tempo todo vira ícone e fica sempre à vista, mesmo quando a
  // lista de "Transformar em" está rolando por baixo. O resto continua escrito
  // por extenso na lista — ícone sozinho só funciona pro que é óbvio.
  const barra = document.createElement('div');
  barra.className = 'block-menu-quickbar';

  const acaoRapida = (icone, titulo, run, extra = '') => {
    const btn = document.createElement('button');
    btn.className = `block-menu-quick ${extra}`.trim();
    btn.title = scopeCount > 1 ? `${titulo} (${scopeCount} blocos)` : titulo;
    btn.innerHTML = `<span class="material-symbols-rounded">${icone}</span>`;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); closeBlockMenu(); run(); });
    barra.appendChild(btn);
  };

  acaoRapida('content_copy', tr('Copiar como texto'), () => copyBlocksAs(block, 'text'));
  acaoRapida('image',        tr('Copiar imagem'),     () => printBlocks(block, 'clipboard'));
  acaoRapida('library_add',  tr('Duplicar'),          () => duplicateBlocks(block));
  acaoRapida('delete',       tr('Excluir'),           () => deleteBlocksOrOne(block), 'is-danger');

  menu.appendChild(barra);

  // Divisor não tem conteúdo e tabela não tem um conteúdo único — converter
  // qualquer um dos dois em título/lista não teria o que preservar (e, no caso
  // da tabela, despejaria o HTML dela inteiro dentro de um parágrafo).
  const canTransform = !INSERTED_TYPES.has(block.dataset.type);

  if (canTransform) {
    const header = document.createElement('div');
    header.className   = 'copy-menu-header';
    header.textContent = scopeCount > 1 ? tr('Transformar em ({n} blocos)', { n: scopeCount }) : tr('Transformar em');
    menu.appendChild(header);

    for (const it of getTransformTypes()) {
      const btn = document.createElement('button');
      btn.className = 'copy-opt';
      btn.innerHTML = `<span class="copy-opt-value">${escHtml(it.label)}</span><span class="copy-opt-hint">${escHtml(it.hint)}</span>`;
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('click', () => { closeBlockMenu(); transformBlocks(block, it.type); });
      menu.appendChild(btn);
    }

    menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  }

  // Modelos de bloco: mesma lista do menu "/", aqui pra quem prefere a alça.
  const tpls = blockTemplates();
  if (tpls.length > 0) {
    const tplHead = document.createElement('div');
    tplHead.className = 'copy-menu-header';
    tplHead.textContent = tr('Inserir modelo');
    menu.appendChild(tplHead);

    for (const tpl of tpls) {
      const btn = document.createElement('button');
      btn.className = 'copy-opt';
      const span = document.createElement('span');
      span.className = 'copy-opt-value';
      span.textContent = tpl.name;
      btn.appendChild(span);
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('click', () => {
        closeBlockMenu();
        captureUndoPoint();
        insertTemplateBlocks(tpl.content, block);
      });
      menu.appendChild(btn);
    }

    menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  }

  const saveTplBtn = document.createElement('button');
  saveTplBtn.className = 'copy-opt';
  saveTplBtn.innerHTML = `<span class="copy-opt-value">${tr('Salvar como modelo de bloco')}${scopeCount > 1 ? ` (${scopeCount})` : ''}</span>`;
  saveTplBtn.addEventListener('mousedown', e => e.stopPropagation());
  saveTplBtn.addEventListener('click', () => {
    closeBlockMenu();
    // Uma linha de cálculo sem as outras da folha não tem as variáveis que usa: o
    // modelo leva a folha inteira (todas as linhas de cálculo seguidas).
    const markdown = blocksToMarkdown(expandirFolhas(targetBlocksFor(block)).map(serializeBlockEl));
    if (!markdown.trim()) { showFeedback(tr('Nada para salvar')); return; }
    openSaveBlockTemplate(anchorEl, markdown, nome => showFeedback(`modelo "${nome}" salvo`));
  });
  menu.appendChild(saveTplBtn);

  const copyMdBtn = document.createElement('button');
  copyMdBtn.className = 'copy-opt';
  copyMdBtn.innerHTML = `<span class="copy-opt-value">${tr('Copiar como Markdown')}${scopeCount > 1 ? ` (${scopeCount})` : ''}</span>`;
  copyMdBtn.addEventListener('mousedown', e => e.stopPropagation());
  copyMdBtn.addEventListener('click', () => { closeBlockMenu(); copyBlocksAs(block, 'markdown'); });
  menu.appendChild(copyMdBtn);

  // "Copiar como texto" e "Copiar imagem" moraram aqui e subiram pra barra de
  // ícones do topo — são as duas mais usadas. O que fica na lista é o que
  // precisa do nome por extenso pra não virar adivinhação.
  const saveImgBtn = document.createElement('button');
  saveImgBtn.className = 'copy-opt';
  saveImgBtn.innerHTML = `<span class="copy-opt-value">${tr('Baixar imagem (.png)')}${scopeCount > 1 ? ` (${scopeCount})` : ''}</span>`;
  saveImgBtn.addEventListener('mousedown', e => e.stopPropagation());
  saveImgBtn.addEventListener('click', () => { closeBlockMenu(); printBlocks(block, 'download'); });
  menu.appendChild(saveImgBtn);

  // Duplicar e Excluir também subiram pra barra de ícones.

  document.body.appendChild(menu);
  S.blockMenuEl = menu;
  positionMenu(menu, anchorEl.getBoundingClientRect());
}

export async function printBlocks(block, destino) {
  const alvos = targetBlocksFor(block);
  if (alvos.length === 0) return;

  clearBlockSelection();
  hideBlockControls();
  closeCopyMenu();

  // Nome do arquivo: o primeiro texto que aparecer no print. É o que a pessoa
  // reconhece na pasta de downloads — "nota.png" não diz nada.
  const nome = alvos
    .filter(b => !NO_TEXT_TYPES.has(b.dataset.type))
    .map(b => getContentEl(b).textContent.trim())
    .find(Boolean) ?? 'nota';

  showFeedback(tr('gerando imagem…'));
  try {
    const ok = destino === 'clipboard'
      ? await copyBlocksAsImage(alvos)
      : await downloadBlocksAsImage(alvos, nome);
    showFeedback(ok
      ? (destino === 'clipboard' ? tr('imagem copiada!') : tr('imagem baixada!'))
      : tr('não deu pra gerar a imagem'));
  } catch {
    // Copiar imagem depende de permissão da área de transferência, que o
    // navegador só concede com o painel em foco. Baixar sempre funciona.
    showFeedback(destino === 'clipboard'
      ? tr('não deu pra copiar — tente "Baixar imagem"')
      : tr('não deu pra gerar a imagem'));
  }
}

export async function copyBlocksAs(block, format) {
  const targets = targetBlocksFor(block).map(serializeBlockEl);
  // Markdown sai pra fora da extensão, então a imagem vai embutida — colar num
  // editor de markdown qualquer tem que mostrar a imagem, não uma referência
  // interna que só o QuickDock entende.
  const text = format === 'markdown'
    ? await blocksToExportMarkdown(targets)
    : blocksToPlainText(targets);
  await navigator.clipboard.writeText(text);
  showFeedback('copiado!');
}

export function transformBlocks(block, type) {
  // Divisor e tabela nunca entram como origem de conversão, mesmo dentro de
  // uma seleção múltipla — não têm conteúdo de linha pra preservar.
  const targets = targetBlocksFor(block).filter(b => !INSERTED_TYPES.has(b.dataset.type));
  if (targets.length === 0) return;

  captureUndoPoint();
  const converted = targets.map(b => convertBlockType(b, type, b.dataset.checked === 'true'));
  renumberLists();
  clearBlockSelection();
  hideBlockControls();
  const lastContent = getContentEl(converted[converted.length - 1]);
  lastContent.focus();
  setCaretOffset(lastContent, lastContent.textContent.length);
  scheduleSave();
}

export function duplicateBlocks(block) {
  const targets = targetBlocksFor(block);
  captureUndoPoint();
  let anchor = targets[targets.length - 1];
  for (const b of targets) {
    // Passa pela serialização em vez de copiar innerHTML na mão: é o que faz
    // duplicar uma tabela duplicar as células, e não devolver uma tabela vazia.
    const clone = createBlockElFrom({ ...serializeBlockEl(b), id: null });
    anchor.after(clone);
    anchor = clone;
  }
  renumberLists();
  clearBlockSelection();
  hideBlockControls();
  scheduleSave();
}

export function deleteBlocksOrOne(block) {
  const targets = targetBlocksFor(block);
  captureUndoPoint();

  const prev = targets[0].previousElementSibling;
  targets.forEach(b => b.remove());
  if (root.children.length === 0) root.appendChild(createBlockEl('paragraph'));

  renumberLists();
  clearBlockSelection();
  hideBlockControls();

  const focusTarget = (prev && document.body.contains(prev)) ? prev : root.firstElementChild;
  if (focusTarget) {
    const c = getContentEl(focusTarget);
    c.focus();
    setCaretOffset(c, c.textContent.length);
  }
  scheduleSave();
}

// Expande cada bloco de cálculo para a folha inteira: as linhas de cálculo que vêm
// antes e depois dele, seguidas. Mantém a ordem da nota.
function expandirFolhas(blocos) {
  const saida = new Set();
  for (const b of blocos) {
    if (b.dataset.type !== 'calc') { saida.add(b); continue; }
    let inicio = b;
    while (inicio.previousElementSibling?.dataset.type === 'calc') inicio = inicio.previousElementSibling;
    let fim = b;
    while (fim.nextElementSibling?.dataset.type === 'calc') fim = fim.nextElementSibling;
    for (let el = inicio; ; el = el.nextElementSibling) {
      saida.add(el);
      if (el === fim) break;
    }
  }
  return [...saida];
}