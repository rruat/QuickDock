// ── shell-models-panel.js ───────────────────────────────────────────────────
// Painel MODELOS da aside esquerda: notas modelo (a biblioteca real do app) e quadros
// modelo (models-board-templates.js). "Usar" cria o item e o abre; a galeria completa
// (editar, duplicar, importar…) continua em "Gerenciar modelos".

import { loadAllTemplates } from '../storage.js';
import { BOARD_TEMPLATES, buildBoardFromTemplate } from './models-board-templates.js';
import { escapeHtml } from './shell-views.js';

export function initModelsPanel({ openView }) {
  const body = document.getElementById('asideModelsBody');
  if (!body) return;

  let notes = [];

  const row = (kind, id, icon, name, desc) => `
    <div class="aside-view-item" data-kind="${kind}" data-id="${escapeHtml(String(id))}">
      <button type="button" class="aside-view-main" data-act="use" title="Usar “${escapeHtml(name)}”">
        <span class="material-symbols-rounded">${icon}</span>
        <span class="aside-view-text"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(desc)}</small></span>
      </button>
      <span class="aside-view-actions" style="display:inline-flex"><span class="aside-model-use">Usar</span></span>
    </div>`;

  async function render() {
    try { notes = (await loadAllTemplates()).filter(t => t.kind === 'note'); } catch { notes = []; }
    body.innerHTML = `
      <div class="aside-model-group">Notas modelo</div>
      ${notes.length
        ? notes.map(t => row('note', t.id, 'description', t.name || 'Sem nome', 'Nota')).join('')
        : '<div class="aside-views-empty">Nenhum modelo de nota ainda.<br>Crie um em <strong>Gerenciar modelos</strong>.</div>'}
      <div class="aside-model-group">Quadros modelo</div>
      ${BOARD_TEMPLATES.map(t => row('board', t.id, 'space_dashboard', t.name, t.desc)).join('')}`;
  }

  body.addEventListener('click', async (e) => {
    const item = e.target.closest('.aside-view-item');
    if (!item) return;
    if (item.dataset.kind === 'note') {
      const tpl = notes.find(t => String(t.id) === item.dataset.id);
      // o ouvinte de notes-tabs.js cria a nota a partir do modelo e a ativa (o shell a abre)
      if (tpl) document.dispatchEvent(new CustomEvent('quickdock:use-template-note', { detail: { template: tpl } }));
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
}
