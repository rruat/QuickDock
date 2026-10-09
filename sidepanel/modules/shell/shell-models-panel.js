// ── shell-models-panel.js ───────────────────────────────────────────────────
// Painel MODELOS da aside esquerda: notas modelo (a biblioteca real do app) e quadros
// modelo (models-board-templates.js). "Usar" cria o item e o abre; a galeria completa
// (editar, duplicar, importar…) continua em "Gerenciar modelos".

import { loadAllTemplates } from '../storage.js';
import { BOARD_TEMPLATES, buildBoardFromTemplate } from './models-board-templates.js';
import { escapeHtml } from './shell-views.js';
import { setRightAsideOpen } from './shell-right-aside.js';

export function initModelsPanel({ openView }) {
  const body = document.getElementById('asideModelsBody');
  if (!body) return;

  let notes = [];
  let blocks = [];

  const row = (kind, id, icon, name, desc) => `
    <div class="aside-view-item" data-kind="${kind}" data-id="${escapeHtml(String(id))}">
      <button type="button" class="aside-view-main" data-act="use" title="Usar “${escapeHtml(name)}”">
        <span class="material-symbols-rounded">${icon}</span>
        <span class="aside-view-text"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(desc)}</small></span>
      </button>
      <span class="aside-view-actions" style="display:inline-flex"><span class="aside-model-use">Usar</span></span>
    </div>`;

  async function render() {
    try {
      const todos = await loadAllTemplates();
      notes = todos.filter(t => t.kind === 'note');
      blocks = todos.filter(t => t.kind === 'block');
    } catch { notes = []; blocks = []; }
    const emNota = document.documentElement.dataset.shellFocus === 'notes'; // bloco só entra numa nota aberta
    body.innerHTML = `
      <div class="aside-model-group">Notas modelo</div>
      ${notes.length
        ? notes.map(t => row('note', t.id, 'description', t.name || 'Sem nome', 'Nota')).join('')
        : '<div class="aside-views-empty">Nenhum modelo de nota ainda.<br>Crie um em <strong>Gerenciar modelos</strong>.</div>'}
      <div class="aside-model-group">Quadros modelo</div>
      ${BOARD_TEMPLATES.map(t => row('board', t.id, 'space_dashboard', t.name, t.desc)).join('')}
      <div class="aside-model-group">Blocos modelo</div>
      ${blocks.length
        ? blocks.map(t => row('block', t.id, 'view_agenda', t.name, emNota ? 'Inserir na nota aberta' : 'Abra uma nota para inserir')).join('')
        : '<div class="aside-views-empty">Nenhum bloco modelo ainda.<br>Salve um pelo menu de blocos da nota.</div>'}`;
  }

  body.addEventListener('click', async (e) => {
    const item = e.target.closest('.aside-view-item');
    if (!item) return;
    if (item.dataset.kind === 'block') {
      const tpl = blocks.find(t => String(t.id) === item.dataset.id);
      if (!tpl || document.documentElement.dataset.shellFocus !== 'notes') return;
      document.dispatchEvent(new CustomEvent('quickdock:insert-template-blocks', { detail: { content: tpl.content } }));
      setRightAsideOpen(false); // no mobile devolve a tela à nota
      return;
    }
    if (item.dataset.kind === 'note') {
      const tpl = notes.find(t => String(t.id) === item.dataset.id);
      if (tpl) {
        // notes-tabs.js cria a nota a partir do modelo e a ativa, mas não muda de tela: quando a nota
        // ficar ativa, abrimos a tela de notas
        const aoAtivar = () => { document.removeEventListener('quickdock:active-note-changed', aoAtivar); openView('notes'); };
        document.addEventListener('quickdock:active-note-changed', aoAtivar);
        setTimeout(() => document.removeEventListener('quickdock:active-note-changed', aoAtivar), 5000);
        document.dispatchEvent(new CustomEvent('quickdock:use-template-note', { detail: { template: tpl } }));
      }
    } else {
      const tpl = BOARD_TEMPLATES.find(t => t.id === item.dataset.id);
      if (!tpl) return;
      const { createBlankBoard } = await import('../board-engine.js');
      await createBlankBoard(tpl.name, '', buildBoardFromTemplate(tpl));
      openView('board');
    }
  });

  document.getElementById('btnManageTemplates')?.addEventListener('click', () => openView('templates'));

  // atualiza ao abrir o painel e quando a biblioteca de modelos muda
  document.addEventListener('quickdock:aside-panel-changed', e => { if (e.detail?.panel === 'models') render(); });
  document.addEventListener('quickdock:templates-changed', () => render());
  document.addEventListener('quickdock:shell-focus', () => { if (document.getElementById('asideModels')?.offsetParent) render(); }); // a dica dos blocos acompanha a tela
}
