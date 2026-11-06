import { t as tr } from '../i18n.js';
import { parseBackup } from '../backup.js';
import { blocksToMarkdown } from '../blocks.js';
import { flushSave } from '../note.js';
import { positionPopover } from '../popover.js';
import { createNoteRecord } from '../storage.js';
import { getTemplates, noteTemplates } from '../templates.js';
import { openTemplatesPage } from '../templates-page.js';
import { activateNote } from './lifecycle.js';
import { createNoteFromMarkdown, getBlocksForNote } from './note-io.js';
import { S, btnNew, importInput } from './state.js';
import { renderTabs, scrollTabIntoView } from './tab-strip.js';
import { buildTutorialNoteFields } from './tutorial.js';

export function closeNewMenu() { S.newMenuPopover?.remove(); S.newMenuPopover = null; }

export async function createBlankNote() {
  await flushSave();
  const title = `Nota ${S.notesMeta.length + 1}`;
  const id = await createNoteRecord({ title, content: '' });
  S.notesMeta.push({ id, title, color: null, icon: null, updatedAt: Date.now() });
  await activateNote(id);
  renderTabs();
}

export async function createTutorialNote() {
  await flushSave();
  const fields = buildTutorialNoteFields();
  const id = await createNoteRecord(fields);
  S.notesMeta.push({ id, title: fields.title, color: fields.color, icon: fields.icon, updatedAt: Date.now() });
  await activateNote(id);
  renderTabs();
  scrollTabIntoView(id);
}

export async function createNoteFromTemplate(tpl) {
  await flushSave();
  // Passa pelo mesmo caminho da importação: um modelo compartilhado por outra
  // pessoa pode trazer imagem em base64, que tem que virar arquivo.
  const id = await createNoteFromMarkdown(tpl.name, tpl.content);
  await activateNote(id);
  renderTabs();
  scrollTabIntoView(id);
}

export async function currentNoteAsMarkdown() {
  const meta = S.notesMeta.find(n => n.id === S.activeId);
  if (!meta) return null;
  return { title: meta.title, markdown: blocksToMarkdown(await getBlocksForNote(meta)) };
}

export function newMenuOpt(pop, label, run) {
  const btn = document.createElement('button');
  btn.className = 'copy-opt';
  const span = document.createElement('span');
  span.className = 'copy-opt-value';
  span.textContent = label;
  btn.appendChild(span);
  btn.addEventListener('mousedown', e => e.stopPropagation());
  btn.addEventListener('click', async e => { e.stopPropagation(); closeNewMenu(); await run(); });
  pop.appendChild(btn);
}

// `anchor` é o botão que abriu o menu: o "＋" da barra ou o da aside.
export async function openNewMenu(anchor = btnNew) {
  closeNewMenu();
  const pop = document.createElement('div');
  pop.className = 'copy-menu new-menu';

  newMenuOpt(pop, tr('Nota em branco'), createBlankNote);
  newMenuOpt(pop, tr('Importar (.md/.txt)'), () => importInput.click());

  await getTemplates();               // atualiza o cache antes de listar
  const templates = noteTemplates();  // o menu do ＋ cria notas, não insere blocos
  if (templates.length > 0) {
    pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
    const head = document.createElement('div');
    head.className = 'copy-menu-header';
    head.textContent = tr('A partir de um modelo');
    pop.appendChild(head);
    for (const tpl of templates) newMenuOpt(pop, tpl.name, () => createNoteFromTemplate(tpl));
  }

  pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  newMenuOpt(pop, tr('Modelos…'), () => openTemplatesPage());

  document.body.appendChild(pop);
  S.newMenuPopover = pop;
  positionPopover(pop, anchor);
}

btnNew.addEventListener('click', e => { e.stopPropagation(); openNewMenu(); });

document.addEventListener('mousedown', e => {
  if (S.newMenuPopover && !S.newMenuPopover.contains(e.target)) closeNewMenu();
});

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;

  const text = await file.text();
  await flushSave();

  // Arquivo de backup: vem com várias notas dentro, cada uma com o seu título.
  // Restaurar cria notas novas — nunca sobrescreve as que já existem, senão
  // um backup antigo apagaria o trabalho de quem o importou por engano.
  const backup = parseBackup(text);
  if (backup) {
    if (!confirm(tr('Este arquivo é um backup com {n} nota(s).\n\nElas serão adicionadas como notas novas — nada do que já existe é alterado.', { n: backup.length }))) return;
    let ultimoId = null;
    for (const { title, md } of backup) ultimoId = await createNoteFromMarkdown(title, md);
    if (ultimoId != null) await activateNote(ultimoId);
    renderTabs();
    return;
  }

  const title = file.name.replace(/\.(md|txt)$/i, '') || tr('Nota importada');
  const id = await createNoteFromMarkdown(title, text);
  await activateNote(id);
  renderTabs();
});
