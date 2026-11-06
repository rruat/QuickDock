import { clearTemplateEditing, currentTemplateMarkdown, openTemplateInEditor } from '../note.js';
import { updateTemplateById } from '../storage.js';
import { refreshTemplates } from '../templates.js';
import { closeTemplatesPage } from '../templates-page.js';
import { activateNote } from './lifecycle.js';
import { S, noteSection } from './state.js';
import { renderTabs } from './tab-strip.js';

export const templateBar    = document.getElementById('template-bar');

export const templateName   = document.getElementById('template-bar-name');

export const templateKind   = document.getElementById('template-bar-kind');

export const templateCancel = document.getElementById('template-bar-cancel');

export const templateSave   = document.getElementById('template-bar-save');

export async function editTemplate(tpl) {
  closeTemplatesPage();
  S.returnNoteId = S.activeId;
  S.editingTpl = { id: tpl.id, name: tpl.name, kind: tpl.kind };

  await openTemplateInEditor(tpl);

  templateName.value = tpl.name;
  templateKind.value = tpl.kind;
  templateBar.hidden = false;
  noteSection.classList.add('template-mode');
}

export async function exitTemplate(salvar) {
  if (!S.editingTpl) return;

  if (salvar) {
    const nome = templateName.value.trim() || S.editingTpl.name;
    await updateTemplateById(S.editingTpl.id, {
      name: nome,
      kind: templateKind.value,
      content: currentTemplateMarkdown(),
    });
    await refreshTemplates();
  }

  S.editingTpl = null;
  templateBar.hidden = true;
  noteSection.classList.remove('template-mode');

  const voltarPara = S.notesMeta.some(n => n.id === S.returnNoteId) ? S.returnNoteId : S.notesMeta[0]?.id;

  // O modo modelo só é desligado DEPOIS de a nota voltar pra tela.
  //
  // Desligar antes era perda de nota: switchToNote começa com um flushSave, e
  // esse save é justamente o que o modo modelo existe pra bloquear. Com a
  // marca já limpa, ele serializava o que estava na tela — os blocos do
  // MODELO — e gravava por cima da nota que estava aberta. Valia pra toda
  // saída, inclusive pelo "Cancelar".
  if (voltarPara != null) await activateNote(voltarPara);
  clearTemplateEditing();
  renderTabs();
}

document.addEventListener('quickdock:edit-template', e => { editTemplate(e.detail); });

templateSave.addEventListener('click', () => exitTemplate(true));

templateCancel.addEventListener('click', () => exitTemplate(false));

templateName.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); exitTemplate(true); }
});
