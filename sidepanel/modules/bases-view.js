// ── bases-view.js ────────────────────────────────────────────────────────
// Visão dedicada de Base: a MESMA Base que já existe embutida numa nota
// (bases-view-container.js cuida de tudo isso), só que num painel próprio no
// desktop ou em tela cheia/dividida no mobile e na extensão — igual
// Grafo/Quadro/Calendário. Este módulo não reimplementa nenhuma lógica de
// Base: só decide QUAL base mostrar (a da nota aberta agora, como o
// Documentos) e onde montar/desmontar o componente já existente.

import { renderBaseComponent } from './bases/bases-view-container.js';
import { getNoteById, updateNoteBlocksById } from './storage.js';
import { getBaseBlocksFromNote } from './blocks.js';
import { getCurrentNoteId, appendBaseBlockToCurrentNote, requestSaveFromExternalEdit } from './note.js';
import { getCurrentView, goBack } from './views.js';
import { isDesktopMode } from './platform.js';
import { isDesktopPanelOpen, toggleDesktopPanel } from './desktop-panels.js';

// Igual isGrafoVisivel() em graph-view.js.
function isBasesVisivel() {
  return isDesktopMode() ? isDesktopPanelOpen('bases') : getCurrentView() === 'bases';
}

let bodyEl = null;
// Guardam o que está montado agora, só pra o diff barato do listener de
// quickdock:notes-changed (ver mais abaixo) saber se vale a pena remontar.
let lastMountedNoteId = null;
let lastMountedConfig = null;

function limparMontagemAnterior() {
  if (typeof bodyEl?._cleanup === 'function') bodyEl._cleanup();
}

function renderEmptyState(mensagem, botao) {
  limparMontagemAnterior();
  lastMountedNoteId = null;
  lastMountedConfig = null;
  bodyEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'bases-empty-state';

  const icon = document.createElement('span');
  icon.className = 'qd-icon material-symbols-rounded bases-empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'view_kanban';
  wrap.appendChild(icon);

  const p = document.createElement('p');
  p.textContent = mensagem;
  wrap.appendChild(p);

  if (botao) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bases-empty-action';
    btn.textContent = botao.label;
    btn.addEventListener('click', botao.onClick);
    wrap.appendChild(btn);
  }

  bodyEl.appendChild(wrap);
}

// Painel (ou bloco inline na mesma nota) podem editar a base ao mesmo tempo —
// grava sempre no dataset do bloco embutido e pede o autosave normal do
// editor, pra nunca ter dois escritores diferentes gravando a mesma nota por
// caminhos separados (o autosave sempre serializa o DOM vivo do editor; se
// este painel gravasse direto no banco por fora, a próxima tecla digitada em
// qualquer lugar da nota reescreveria o DOM antigo por cima).
async function escreverConfigDeVolta(noteId, newYaml) {
  const blocoInline = document.querySelector('#note-editor-blocks .block-base');
  if (blocoInline && getCurrentNoteId() === noteId) {
    blocoInline.dataset.config = newYaml;
    requestSaveFromExternalEdit();
    return;
  }
  // Caminho defensivo — não deveria acontecer, já que o painel só mostra a
  // nota que também está aberta no editor.
  console.warn('bases-view: bloco inline não encontrado na nota ativa, gravando direto no banco.');
  const note = await getNoteById(noteId);
  if (!note) return;
  const blocks = [...(note.blocks || [])];
  const idx = blocks.findIndex(b => b?.type === 'base');
  if (idx === -1) return;
  blocks[idx] = { ...blocks[idx], config: newYaml };
  await updateNoteBlocksById(noteId, blocks, note.content || '');
  document.dispatchEvent(new CustomEvent('quickdock:notes-changed'));
}

async function renderCurrentNoteBase() {
  if (!bodyEl) return;
  const noteId = getCurrentNoteId();

  if (noteId == null) {
    renderEmptyState('Abra ou crie uma nota para ver sua Base.');
    return;
  }

  const note = await getNoteById(noteId);
  const baseBlocks = getBaseBlocksFromNote(note);

  if (baseBlocks.length === 0) {
    renderEmptyState('Esta nota ainda não tem uma Base.', {
      label: 'Criar Base nesta nota',
      onClick: async () => {
        await appendBaseBlockToCurrentNote();
        await renderCurrentNoteBase();
      },
    });
    return;
  }

  limparMontagemAnterior();
  lastMountedNoteId = noteId;
  lastMountedConfig = baseBlocks[0].config;
  await renderBaseComponent(bodyEl, baseBlocks[0].config, {
    embedded: true,
    onConfigChange: (newYaml) => {
      lastMountedConfig = newYaml;
      escreverConfigDeVolta(noteId, newYaml);
    },
  });
}

export function initBasesView() {
  bodyEl = document.getElementById('bases-body');
  if (!bodyEl) return;

  // No desktop a Base é um painel que se liga/desliga (ver desktop-panels.js),
  // não uma tela cheia com histórico pra "voltar" — o botão fecha o painel.
  document.getElementById('btn-bases-back')?.addEventListener('click', () => {
    if (isDesktopMode()) toggleDesktopPanel('bases');
    else goBack();
  });

  document.addEventListener('quickdock:view-changed', e => {
    if (e.detail?.view === 'bases') renderCurrentNoteBase();
  });

  document.addEventListener('quickdock:refresh-bases-view', () => {
    renderCurrentNoteBase();
  });

  document.addEventListener('quickdock:active-note-changed', () => {
    if (isBasesVisivel()) renderCurrentNoteBase();
  });

  // Edição estrutural da base (adicionar view, editar YAML cru) só dispara
  // quickdock:notes-changed (o autosave normal do editor), nunca
  // quickdock:note-updated — só edição de célula/linha dispara esse. Sem
  // isto, uma base aberta ao mesmo tempo inline E no painel ficaria
  // dessincronizada até a pessoa trocar de nota e voltar. Compara com o que
  // está montado agora e só remonta se realmente mudou, pra não recarregar a
  // cada tecla digitada em QUALQUER lugar do app.
  document.addEventListener('quickdock:notes-changed', async () => {
    if (!isBasesVisivel() || lastMountedNoteId == null) return;
    const note = await getNoteById(lastMountedNoteId);
    const baseBlocks = getBaseBlocksFromNote(note);
    const novaConfig = baseBlocks[0]?.config ?? null;
    if (novaConfig !== lastMountedConfig) {
      await renderCurrentNoteBase();
    }
  });
}
