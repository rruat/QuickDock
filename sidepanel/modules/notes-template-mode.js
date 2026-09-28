// Modo de edição de modelo: o editor de blocos é um só, ligado a
// #note-editor-blocks. Em vez de construir um segundo editor, ele empresta:
// carrega o modelo, mostra esta barra e o que for digitado volta pro modelo
// em vez de pra uma nota.
import { updateTemplateById } from './storage.js';
import { refreshTemplates, closeTemplatesManager } from './templates.js';
import { openTemplateInEditor, currentTemplateMarkdown, clearTemplateEditing } from './note.js';
import { blocksToMarkdown } from './blocks.js';
import { noteSection } from './note-state.js';
import {
  getNotesMeta, getActiveId, activateNote, renderTabs, getBlocksForNote,
} from './notes-tabs.js';

const templateBar    = document.getElementById('template-bar');
const templateName   = document.getElementById('template-bar-name');
const templateKind   = document.getElementById('template-bar-kind');
const templateCancel = document.getElementById('template-bar-cancel');
const templateSave   = document.getElementById('template-bar-save');

let editingTpl  = null;   // {id, name, kind} do modelo aberto
let returnNoteId = null;  // nota pra onde voltar ao sair

export async function editTemplate(tpl) {
  closeTemplatesManager();
  returnNoteId = getActiveId();
  editingTpl = { id: tpl.id, name: tpl.name, kind: tpl.kind };

  await openTemplateInEditor(tpl);

  templateName.value = tpl.name;
  templateKind.value = tpl.kind;
  templateBar.hidden = false;
  noteSection.classList.add('template-mode');
  document.documentElement.classList.add('template-mode');
  document.body.classList.add('template-mode');
}

async function exitTemplate(salvar) {
  if (!editingTpl) return;

  if (salvar) {
    const nome = templateName.value.trim() || editingTpl.name;
    await updateTemplateById(editingTpl.id, {
      name: nome,
      kind: templateKind.value,
      content: currentTemplateMarkdown(),
    });
    await refreshTemplates();
  }

  editingTpl = null;
  templateBar.hidden = true;
  noteSection.classList.remove('template-mode');
  document.documentElement.classList.remove('template-mode');
  document.body.classList.remove('template-mode');

  const notesMeta = getNotesMeta();
  const voltarPara = notesMeta.some(n => n.id === returnNoteId) ? returnNoteId : notesMeta[0]?.id;

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

// Evento em vez de import: templates.js e note.js precisam pedir "abre este
// modelo no editor", e os dois seriam import circular com este módulo.
document.addEventListener('quickdock:edit-template', e => { editTemplate(e.detail); });

templateSave.addEventListener('click', () => exitTemplate(true));
templateCancel.addEventListener('click', () => exitTemplate(false));
templateName.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); exitTemplate(true); }
});

export async function currentNoteAsMarkdown() {
  const meta = getNotesMeta().find(n => n.id === getActiveId());
  if (!meta) return null;
  return { title: meta.title, markdown: blocksToMarkdown(await getBlocksForNote(meta)) };
}
