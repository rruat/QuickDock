import { isNoteActive, setActiveArea } from '../active-area.js';
import { safeHref } from '../blocks.js';
import { deleteBlocksOrOne } from './block-menu.js';
import { currentBlock, recalcCalcSheets, renumberLists } from './block-ops.js';
import { clearBlockSelection, findBlockById } from './block-selection.js';
import { blocksForIndent, getContentEl, indentBlocks } from './block-structure.js';
import { getCaretOffset } from './caret.js';
import { handleBackspaceAtStart, handleEnter } from './enter-backspace.js';
import { insertImageFile } from './images.js';
import { applyLink } from './links.js';
import { insertTableBlock, parseClipboardTable, parseTsvTable, pasteInlineText, pasteLink, pasteMultilineText } from './paste.js';
import { scheduleRescan } from './rescan.js';
import { checkBlockShortcut, checkDividerShortcut, limparAncoras, tryAutoFormatInline } from './shortcuts.js';
import { cancelSlashMenu, checkSlashMenu, closeSlashMenu, confirmSlashSelection, moveSlashSelection } from './slash.js';
import { S, root } from './state.js';
import { focusedCell, moveCell } from './table.js';
import { scheduleSave } from './template-mode.js';
import { captureTypingUndoPoint, captureUndoPoint, performRedo, performUndo, snapshotState } from './undo.js';

root.addEventListener('beforeinput', () => {
  captureTypingUndoPoint();
});

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

  if (block.dataset.type === 'paragraph') {
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

  // Apagar blocos inteiros é o gesto de uma seleção de BLOCOS (alça ou
  // Ctrl+arrastar), onde não existe texto selecionado. Numa seleção espelhada
  // de texto, Backspace tem que apagar o texto marcado e mais nada — selecionar
  // do meio de uma linha até o meio da seguinte e apagar as duas por inteiro
  // seria perder o que ninguém mandou apagar.
  if ((e.key === 'Backspace' || e.key === 'Delete')
      && S.selectedBlockIds.size > 0 && !S.selecaoEspelhada) {
    e.preventDefault();
    const first = findBlockById([...S.selectedBlockIds][0]);
    if (first) deleteBlocksOrOne(first);
    return;
  }
  if (e.key === 'Escape' && S.selectedBlockIds.size > 0) {
    e.preventDefault();
    clearBlockSelection();
    return;
  }

  if (S.slashMenuEl) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSlashSelection(1);  return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveSlashSelection(-1); return; }
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

  if (e.key === 'Backspace') {
    const sel = document.getSelection();
    if (!sel || !sel.isCollapsed) return;
    // Backspace no início de uma célula vazia não pode fundir blocos.
    if (focusedCell()) return;
    // Dentro do marcador do destaque ("> [!NOTE]") o Backspace apaga só o texto do marcador
    // (callout-marker.js decide se o destaque acaba). Não é início de bloco.
    // Dentro do marcador, o Backspace é feito à mão: o navegador às vezes move o cursor
    // para o corpo do destaque (a linha de baixo) depois de apagar um caractere.
    const marcadorAtivo = sel.anchorNode?.parentElement?.closest?.('.callout-marker');
    if (marcadorAtivo) {
      e.preventDefault();
      const texto = marcadorAtivo.firstChild;
      if (texto?.nodeType === Node.TEXT_NODE) {
        const off = sel.anchorNode === texto ? sel.anchorOffset : texto.data.length;
        if (off > 0) {
          texto.data = texto.data.slice(0, off - 1) + texto.data.slice(off);
          const r = document.createRange();
          r.setStart(texto, off - 1);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          root.dispatchEvent(new Event('input', { bubbles: true }));
          scheduleSave();
        }
      }
      return;
    }
    const block = currentBlock();
    if (!block) return;
    const content = getContentEl(block);
    if (getCaretOffset(content) !== 0) return;
    e.preventDefault();
    // Início do corpo de um destaque: o caractere de antes é o último do marcador
    // ("]"), então é ele que sai — não o bloco.
    const marcador = content.querySelector(':scope > .callout-marker');
    if (marcador) {
      const texto = marcador.firstChild;
      if (texto?.nodeType === Node.TEXT_NODE && texto.data.length > 0) {
        texto.data = texto.data.slice(0, -1);
        const r = document.createRange();
        r.selectNodeContents(marcador);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
        root.dispatchEvent(new Event('input', { bubbles: true }));
        scheduleSave();
        return;
      }
    }
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
