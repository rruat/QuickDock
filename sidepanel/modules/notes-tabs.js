// Ponto de entrada das abas de notas. A implementação fica em ./notes-tabs/ (um arquivo por responsabilidade).
// Este arquivo mantém a API pública que o resto do painel já importa.
export { downloadAllNotes } from './notes-tabs/note-io.js';
export { createTutorialNote } from './notes-tabs/new-note-menu.js';
export { editTemplate } from './notes-tabs/template-mode.js';
export { initNotesTabs } from './notes-tabs/lifecycle.js';

import './notes-tabs/state.js';
import './notes-tabs/tab-strip.js';
import './notes-tabs/constants.js';
import './notes-tabs/tutorial.js';
import './notes-tabs/appearance.js';
import './notes-tabs/note-io.js';
import './notes-tabs/tab-menu.js';
import './notes-tabs/notes-list.js';
import './notes-tabs/new-note-menu.js';
import './notes-tabs/template-mode.js';
import './notes-tabs/lifecycle.js';
