import { t as tr } from './i18n.js';
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

// Ícones da frente de cada modelo: nota (folha com linhas) e bloco (pilha).
const ICONE_NOTA = "<svg viewBox='0 0 24 24'><path d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'/><path d='M14 3v5h5'/><path d='M9 13h6'/><path d='M9 17h4'/></svg>";
const ICONE_BLOCO = "<svg viewBox='0 0 24 24'><rect x='6' y='3' width='15' height='13' rx='3'/><path d='M3 8v10a3 3 0 0 0 3 3h11'/></svg>";

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
  const icone = document.createElement('span');
  icone.className = 'template-kind';
  icone.innerHTML = tpl.kind === 'block' ? ICONE_BLOCO : ICONE_NOTA;
  icone.title = tpl.kind === 'block' ? tr('Modelo de bloco') : tr('Modelo de nota');
  const nome = document.createElement('span');
  nome.className = 'template-name';
  nome.textContent = tpl.name;
  use.append(icone, nome);
  use.title = tpl.kind === 'block'
    ? tr('Inserir este bloco na nota aberta')
    : tr('Criar uma nota com este modelo');
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
    b.innerHTML = glifo;
    b.title = titulo;
    b.addEventListener('click', async e => { e.stopPropagation(); await rodar(); });
    return b;
  };

  acoes.append(
    acao("<svg viewBox='0 0 24 24'><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'/></svg>", tr('Editar no editor de notas'), () => requestTemplateEdit(tpl)),
    acao("<svg viewBox='0 0 24 24'><path d='M12 3v12'/><path d='M7 10l5 5 5-5'/><path d='M5 21h14'/></svg>", tr('Baixar .md para compartilhar'), () => {
      downloadText(`${safeFilename(tpl.name)}.md`, tpl.content);
    }),
    acao("<svg viewBox='0 0 24 24'><path d='M4 7h16'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M6 7l1 13h10l1-13'/><path d='M9 7V4h6v3'/></svg>", tr('Excluir modelo'), async () => {
      if (!confirm(tr('Excluir o modelo "{nome}"?', { nome: tpl.name }))) return;
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
    [tr('Modelos de nota'), noteTemplates(), tr('Nenhum modelo de nota ainda.')],
    [tr('Modelos de bloco'), blockTemplates(), tr('Nenhum modelo de bloco ainda.')],
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
  createAndEdit({ name: tr('Novo modelo'), content: '', kind: 'note' }));

document.getElementById('btn-tpl-from-note').addEventListener('click', async () => {
  const atual = await currentNoteAsMarkdown();
  if (!atual?.markdown?.trim()) { alert(tr('A nota atual está vazia.')); return; }
  await createTemplateRecord({ name: atual.title || tr('Novo modelo'), content: atual.markdown, kind: 'note' });
  await renderBody();
});

document.getElementById('btn-tpl-import-note').addEventListener('click', () => { importKind = 'note'; importInput.click(); });
document.getElementById('btn-tpl-import-block').addEventListener('click', () => { importKind = 'block'; importInput.click(); });

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  const content = await file.text();
  const name = file.name.replace(/\.(md|txt)$/i, '') || tr('Modelo importado');
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
