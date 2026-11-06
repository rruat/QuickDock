// ── templates.js ───────────────────────────────────────────────────────────
// Modelos de nota: markdown guardado como texto puro, exatamente o formato que
// sai na exportação. É isso que faz "compartilhar um modelo" e "baixar um .md"
// serem a mesma coisa — quem recebe importa o arquivo e tem o modelo de volta.

import {
  loadAllTemplates, createTemplateRecord, deleteTemplateById,
  wasSeeded, markSeeded,
} from './storage.js';
import { positionPopover } from './popover.js';

const EXEMPLO_NOTA = {
  kind: 'note',
  name: 'Atendimento',
  content: `# Atendimento —

**Nome:**
**CPF:**
**Protocolo:**
**Data:**
**Canal:**

## O que foi pedido

## Validações

- [ ] Conferir elegibilidade no portal
- [ ] Documentação completa e legível
- [ ] CPF confere com o do titular
- [ ] Prazo ainda em aberto

## Ações

- [ ] Abrir o protocolo no sistema
- [ ] Anexar os documentos
- [ ] Informar o prazo ao beneficiário
- [ ] Registrar o número de retorno

## Retorno

**Responsável:**
**Prazo:**

## Observações
`,
};

// Modelo de bloco: um pedaço que entra no meio da nota, não uma nota inteira.
const EXEMPLO_BLOCO = {
  kind: 'block',
  name: 'Conferência',
  content: `## Conferência

- [ ] Documento legível e dentro da validade
- [ ] Dados batem com o cadastro
- [ ] Prazo ainda em aberto

**Conferido por:**
**Data:**
`,
};

// O menu "/" é montado de forma síncrona enquanto a pessoa digita, então os
// modelos ficam em cache na memória em vez de serem lidos do banco na hora.
let cache = [];

export async function refreshTemplates() {
  cache = await loadAllTemplates();
  return cache;
}

export function noteTemplates()  { return cache.filter(t => t.kind === 'note'); }
export function blockTemplates() { return cache.filter(t => t.kind === 'block'); }

export async function initTemplates() {
  for (const [chave, exemplo] of [
    ['templates_seeded', EXEMPLO_NOTA],
    ['block_template_seeded', EXEMPLO_BLOCO],
  ]) {
    if (await wasSeeded(chave)) continue;
    await createTemplateRecord(exemplo);
    await markSeeded(chave);
  }
  await refreshTemplates();
}

export async function getTemplates() {
  return refreshTemplates();
}


function safeFilename(name) {
  return (name || 'modelo').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'modelo';
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Pedir "abre este modelo no editor". Vai por evento porque quem atende é o
// notes-tabs, que já importa este módulo — chamar de volta seria ciclo.
export function requestTemplateEdit(tpl) {
  document.dispatchEvent(new CustomEvent('quickdock:edit-template', { detail: tpl }));
}

// Cria o registro e abre direto no editor, pra nomear e ajustar lá.
export async function createAndEdit({ name, content, kind }) {
  const id = await createTemplateRecord({ name, content, kind });
  await refreshTemplates();
  requestTemplateEdit({ id, name, content, kind });
}

export { downloadText, safeFilename };


// ── Salvar um pedaço da nota como modelo ──────────────────────────────────────
// Sugere um nome a partir da primeira linha com texto, sem a marcação. É o que
// a pessoa reconhece depois na lista — "Novo modelo" não diz nada.
function nomeSugerido(markdown) {
  const primeira = (markdown ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? '';
  const limpo = primeira
    .replace(/^(?:>\s*)+/, '')            // citação
    .replace(/^\[![a-z]+\]\s*/i, '')      // marcador de destaque
    .replace(/^(?:#{1,6}|[-*]|\d+\.)\s+/, '')
    .replace(/^\[[ xX]\]\s*/, '')         // caixa de checklist
    .replace(/[*`~]/g, '')                // ênfase inline
    .trim();
  return limpo.slice(0, 40) || 'Novo modelo';
}

let nameMenuEl = null;
export function closeNameMenu() { nameMenuEl?.remove(); nameMenuEl = null; }

/**
 * Salvar a seleção como modelo de bloco.
 *
 * NÃO abre o editor de modelos. Quem clicou aqui estava escrevendo uma nota e
 * pediu pra guardar um pedaço dela — trocar a tela pelo modelo tirava a pessoa
 * do lugar onde ela estava, e o que ficava à vista era só o trecho salvo, como
 * se o resto da nota tivesse sumido. O nome é pedido aqui mesmo, num popover.
 */
export function openSaveBlockTemplate(anchorEl, markdown, onSaved) {
  closeNameMenu();

  const pop = document.createElement('div');
  pop.className = 'copy-menu name-menu';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = 'Salvar como modelo de bloco';

  const campo = document.createElement('input');
  campo.className = 'link-input';
  campo.type = 'text';
  campo.value = nomeSugerido(markdown);
  campo.placeholder = 'Nome do modelo';

  const salvar = async () => {
    const nome = campo.value.trim() || 'Novo modelo';
    closeNameMenu();
    await createTemplateRecord({ name: nome, content: markdown, kind: 'block' });
    await refreshTemplates();
    onSaved?.(nome);
  };

  campo.addEventListener('mousedown', e => e.stopPropagation());
  campo.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); salvar(); }
    if (e.key === 'Escape') { e.preventDefault(); closeNameMenu(); }
  });

  const ok = document.createElement('button');
  ok.className = 'copy-opt';
  ok.innerHTML = '<span class="copy-opt-value">Salvar</span>';
  ok.addEventListener('mousedown', e => e.stopPropagation());
  ok.addEventListener('click', salvar);

  pop.append(head, campo, ok);
  pop.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(pop);
  nameMenuEl = pop;
  positionPopover(pop, anchorEl);
  campo.focus();
  campo.select();
}

document.addEventListener('mousedown', e => {
  if (nameMenuEl && !nameMenuEl.contains(e.target)) closeNameMenu();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeNameMenu();
});
