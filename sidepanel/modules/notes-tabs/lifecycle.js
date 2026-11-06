import { setDocumentsNote } from '../documents.js';
import { switchToNote } from '../note.js';
import { createNoteRecord, gcInlineFiles, loadActiveNoteId, loadAllNotesMeta, migrateLegacyNoteIfNeeded, saveActiveNoteId } from '../storage.js';
import { initTemplates } from '../templates.js';
import { S } from './state.js';
import { renderTabs, scrollTabIntoView, setAccent } from './tab-strip.js';

export async function activateNote(id) {
  S.activeId = id;
  const meta = S.notesMeta.find(n => n.id === id);
  setAccent(meta?.color);
  await switchToNote(id);
  await setDocumentsNote(id);
  await saveActiveNoteId(id);
}

export async function initNotesTabs() {
  await migrateLegacyNoteIfNeeded();
  // Faxina de imagem órfã. Roda na abertura de propósito: é o único momento em
  // que não existe histórico de desfazer que pudesse trazer de volta um bloco
  // cujo arquivo acabou de ser apagado.
  await gcInlineFiles();
  await initTemplates();
  S.notesMeta = await loadAllNotesMeta();

  // Primeira vez que a extensão é aberta (nenhuma nota, nem legado migrado):
  // uma nota em branco. O tutorial não é criado sozinho: fica no menu ⋯, "Ver tutorial".
  if (S.notesMeta.length === 0) {
    const title = 'Nota 1';
    const id = await createNoteRecord({ title, content: '' });
    S.notesMeta = [{ id, title, color: null, icon: null, updatedAt: Date.now() }];
  }

  const savedActiveId = await loadActiveNoteId();
  const initial = S.notesMeta.find(n => n.id === savedActiveId) ?? S.notesMeta[0];
  await activateNote(initial.id);
  renderTabs();
  scrollTabIntoView(initial.id);
}
