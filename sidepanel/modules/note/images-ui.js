import { t as tr } from '../i18n.js';
import { refreshDocuments } from '../documents.js';
import { openModal } from '../modal.js';
import { moveInlineFileToDocuments, saveFile } from '../storage.js';
import { createBlockEl } from './block-model.js';
import { renumberLists } from './block-ops.js';
import { showFeedback } from './feedback-ctrl.js';
import { blockNearestToY } from './handle.js';
import { focusBlockEnd, insertImageFile, setImageData } from './images.js';
import { positionMenu } from './menus.js';
import { S, root } from './state.js';
import { flushSave, scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export const imagePicker = document.createElement('input');

imagePicker.type   = 'file';

imagePicker.accept = 'image/*';

imagePicker.hidden = true;

document.body.appendChild(imagePicker);

export function pedirImagem(intent) {
  S.imagePickerIntent = intent;
  imagePicker.value = '';
  imagePicker.click();
}

imagePicker.addEventListener('change', async () => {
  const file = imagePicker.files?.[0];
  imagePicker.value = '';
  const intent = S.imagePickerIntent;
  S.imagePickerIntent = null;
  if (!file || !file.type.startsWith('image/') || !intent) return;

  if (intent.inserirEm) {
    await insertImageFile(file, intent.inserirEm);
    return;
  }

  // Trocar: o arquivo antigo não é apagado aqui de propósito — Ctrl+Z traz o
  // bloco anterior de volta e ele precisa achar o arquivo. A faxina de imagem
  // órfã roda na próxima abertura do painel (gcInlineFiles).
  captureUndoPoint();
  const fileId = await saveFile(file, S.currentNoteId, { inline: true });
  setImageData(intent.trocar, { fileId, alt: intent.trocar.dataset.alt ?? '' });
  scheduleSave();
});

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
    .map(el => ({ id: Number(el.dataset.fileId), name: el.dataset.alt || tr('Imagem'), type: 'image/*' }))
    .filter(g => Number.isFinite(g.id));

  openModal(fileId, bloco.dataset.alt || tr('Imagem'), 'image/*', galeria);
});

export async function moverImagemParaDocumentos(bloco) {
  const fileId = Number(bloco.dataset.fileId);
  if (!Number.isFinite(fileId)) return;

  const movido = await moveInlineFileToDocuments(fileId);
  if (!movido) { showFeedback(tr('não achei o arquivo desta imagem')); return; }

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
  showFeedback(tr('imagem movida para Documentos'));
}

export function closeAltMenu() { S.altMenuEl?.remove(); S.altMenuEl = null; }

export function openAltMenu(bloco, anchorRect) {
  closeAltMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu alt-menu';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = tr('Texto alternativo');

  const dica = document.createElement('div');
  dica.className = 'alt-menu-hint';
  dica.textContent = tr('Descreve a imagem pra quem usa leitor de tela — e é o que aparece se o arquivo se perder.');

  const campo = document.createElement('input');
  campo.className = 'link-input';
  campo.type = 'text';
  campo.value = bloco.dataset.alt ?? '';
  campo.placeholder = tr('Ex.: print do protocolo aberto');

  const aplicar = () => {
    captureUndoPoint();
    setImageData(bloco, { alt: campo.value.trim() });
    closeAltMenu();
    scheduleSave();
  };

  campo.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); aplicar(); }
    if (e.key === 'Escape') { e.preventDefault(); closeAltMenu(); }
  });

  const ok = document.createElement('button');
  ok.className = 'copy-opt';
  ok.innerHTML = `<span class="copy-opt-value">${tr('Salvar')}</span>`;
  ok.addEventListener('mousedown', e => e.stopPropagation());
  ok.addEventListener('click', aplicar);

  menu.append(head, dica, campo, ok);
  menu.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(menu);
  S.altMenuEl = menu;
  positionMenu(menu, anchorRect);
  campo.focus();
  campo.select();
}

document.addEventListener('mousedown', () => closeAltMenu());

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAltMenu(); });

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
  const imagens = [...(e.dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/'));
  if (imagens.length === 0) return;   // outro tipo de arquivo é assunto dos Documentos

  e.preventDefault();
  e.stopPropagation();
  let alvo = blockNearestToY(e.clientY) ?? root.lastElementChild;
  for (const file of imagens) alvo = (await insertImageFile(file, alvo)) ?? alvo;
});
