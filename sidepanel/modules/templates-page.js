// Página de modelos. Antes era um popover com a lista; agora ocupa a área da
// nota, com a mesma ação em cada modelo: nota de modelo cria uma nota nova, e
// modelo de bloco entra na nota aberta. Pode editar, baixar (.md) e excluir.
import { createTemplateRecord, deleteTemplateById } from './storage.js';
import {
  blockTemplates, createAndEdit, downloadText, noteTemplates, refreshTemplates, requestTemplateEdit, safeFilename,
} from './templates.js';
import { closeNotesListPopover } from './notes-tabs/notes-list.js';
import { createNoteFromTemplate, currentNoteAsMarkdown, openNewMenu } from './notes-tabs/new-note-menu.js';
import { currentBlock } from './note/block-ops.js';
import { insertTemplateBlocks } from './note/slash.js';
import { root } from './note/state.js';

const page = document.getElementById('templates-page');
const body = document.getElementById('templates-page-body');
const importInput = document.getElementById('templates-import-input');
let importKind = 'note';

export function closeTemplatesPage() {
  page.hidden = true;
}

function renderRow(tpl) {
  const row = document.createElement('div');
  row.className = 'template-row';

  const use = document.createElement('button');
  use.className = 'template-use';
  use.textContent = tpl.name;
  use.title = tpl.kind === 'block'
    ? 'Inserir este bloco na nota aberta'
    : 'Criar uma nota com este modelo';
  use.addEventListener('click', async () => {
    closeTemplatesPage();
    if (tpl.kind === 'block') {
      const alvo = currentBlock() ?? root.lastElementChild;
      if (alvo) await insertTemplateBlocks(tpl.content, alvo);
    } else {
      await createNoteFromTemplate(tpl);
    }
  });

  const acoes = document.createElement('div');
  acoes.className = 'template-actions';

  const acao = (glifo, titulo, rodar) => {
    const b = document.createElement('button');
    b.className = 'template-btn';
    b.textContent = glifo;
    b.title = titulo;
    b.addEventListener('click', async e => { e.stopPropagation(); await rodar(); });
    return b;
  };

  acoes.append(
    acao('↓', 'Baixar .md para compartilhar', () => {
      downloadText(`${safeFilename(tpl.name)}.md`, tpl.content);
    }),
    acao('✎', 'Editar no editor de notas', () => requestTemplateEdit(tpl)),
    acao('✕', 'Excluir modelo', async () => {
      if (!confirm(`Excluir o modelo "${tpl.name}"?`)) return;
      await deleteTemplateById(tpl.id);
      await renderBody();
    }),
  );

  row.append(use, acoes);
  return row;
}

async function renderBody() {
  await refreshTemplates();
  body.replaceChildren();

  const grupos = [
    ['Modelos de nota', noteTemplates(), 'Nenhum modelo de nota ainda.'],
    ['Modelos de bloco', blockTemplates(), 'Nenhum modelo de bloco ainda.'],
  ];
  for (const [titulo, lista, vazio] of grupos) {
    const head = document.createElement('div');
    head.className = 'templates-group-title';
    head.textContent = titulo;
    body.appendChild(head);

    if (lista.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'templates-empty';
      aviso.textContent = vazio;
      body.appendChild(aviso);
    }
    lista.forEach(tpl => body.appendChild(renderRow(tpl)));
  }
}

export async function openTemplatesPage() {
  closeNotesListPopover();
  page.hidden = false;
  await renderBody();
}

// ── Ações do rodapé ───────────────────────────────────────────────────────────
document.getElementById('btn-tpl-new').addEventListener('click', () =>
  createAndEdit({ name: 'Novo modelo', content: '', kind: 'note' }));

document.getElementById('btn-tpl-from-note').addEventListener('click', async () => {
  const atual = await currentNoteAsMarkdown();
  if (!atual?.markdown?.trim()) { alert('A nota atual está vazia.'); return; }
  await createTemplateRecord({ name: atual.title || 'Novo modelo', content: atual.markdown, kind: 'note' });
  await renderBody();
});

document.getElementById('btn-tpl-import-note').addEventListener('click', () => { importKind = 'note'; importInput.click(); });
document.getElementById('btn-tpl-import-block').addEventListener('click', () => { importKind = 'block'; importInput.click(); });

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  const content = await file.text();
  const name = file.name.replace(/\.(md|txt)$/i, '') || 'Modelo importado';
  await createTemplateRecord({ name, content, kind: importKind });
  await renderBody();
});

// ── Navegação ─────────────────────────────────────────────────────────────────
document.getElementById('btn-templates-back').addEventListener('click', closeTemplatesPage);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !page.hidden) closeTemplatesPage();
});
document.addEventListener('quickdock:edit-template', closeTemplatesPage);

// ── Botões da aside ───────────────────────────────────────────────────────────
document.getElementById('btn-aside-templates').addEventListener('click', e => {
  e.stopPropagation();
  openTemplatesPage();
});
document.getElementById('btn-aside-new').addEventListener('click', e => {
  e.stopPropagation();
  openNewMenu(e.currentTarget);
});
