// Cabeçalho da nota: ícone, título editável e cor.
import { getNoteById, updateNoteMetaById } from './storage.js';
import { openAppearancePopover } from './notes-appearance.js';
import { renderNoteCover, clearNoteCover } from './note-cover.js';

const headerIconBtn  = document.getElementById('btn-note-header-icon');
const headerIconEl   = document.getElementById('note-header-icon');
const headerTitleEl  = document.getElementById('note-header-title');
const headerColorBtn = document.getElementById('btn-note-header-color');
const headerColorDot = document.getElementById('note-header-color-dot');

let headerTitleDebounce = null;
// A nota mostrada agora no cabeçalho — guardada à parte pra comparar o valor
// no momento de gravar, mesmo se a pessoa já tiver trocado de nota antes do
// debounce dos 500ms terminar (o timer é sempre cancelado ao trocar, ver
// switchToNote, mas fica como segunda trava).
let headerNoteRef = null;

export function renderNoteHeader(note) {
  headerNoteRef = note;
  if (!headerIconEl || !headerTitleEl || !headerColorDot) return;
  if (!note) return;

  headerIconEl.textContent = note.icon || 'description';
  headerIconEl.classList.toggle('icon-filled', !!note.iconFilled);
  headerIconEl.style.color = note.color || '';

  // Não sobrescreve o texto se a pessoa estiver com o cursor ali agora —
  // re-renderizar por baixo da digitação faria o cursor pular de lugar.
  if (document.activeElement !== headerTitleEl) {
    headerTitleEl.textContent = note.title || '';
  }

  headerColorDot.style.background = note.color || 'var(--text-muted)';
  renderNoteCover(note);
}

export function getHeaderNoteRef() { return headerNoteRef; }

// Grava agora um título pendente de gravar (debounce ainda não estourou) —
// chamado antes de trocar de nota, pra não perder a edição em silêncio.
export function flushHeaderTitle() {
  if (headerTitleDebounce) commitHeaderTitle();
}

// Reseta o cabeçalho pra estado vazio (ex.: ao fechar a última nota aberta).
export function clearNoteHeader() {
  headerNoteRef = null;
  if (headerTitleEl) headerTitleEl.textContent = '';
  if (headerIconEl) headerIconEl.textContent = '';
  clearNoteCover();
}

function commitHeaderTitle() {
  clearTimeout(headerTitleDebounce);
  headerTitleDebounce = null;
  if (!headerNoteRef) return;
  const val = (headerTitleEl.textContent || '').trim() || 'Sem título';
  if (val === headerNoteRef.title) return;
  updateNoteMetaById(headerNoteRef.id, { title: val });
  headerNoteRef.title = val;
  // O título editado aqui nunca passa pelo notesMeta da aside (notes-tabs.js
  // mantém seu próprio cache) — sem isto, o nome ficava desatualizado ali até
  // fechar e reabrir a nota.
  document.dispatchEvent(new CustomEvent('quickdock:note-title-committed', {
    detail: { noteId: headerNoteRef.id, title: val }
  }));
}

if (headerTitleEl) {
  headerTitleEl.addEventListener('input', () => {
    if (!headerNoteRef) return;
    const val = headerTitleEl.textContent || '';
    // Atualiza a aba na hora, só visualmente — gravar de verdade espera a
    // pausa de digitação (mesma lógica de debounce da sincronização, só que
    // bem mais curta: aqui o custo de gravar cedo demais é só desperdiçar
    // escrita no banco, não travar o editor).
    document.dispatchEvent(new CustomEvent('quickdock:note-title-preview', {
      detail: { noteId: headerNoteRef.id, title: val.trim() || 'Sem título' }
    }));
    clearTimeout(headerTitleDebounce);
    headerTitleDebounce = setTimeout(commitHeaderTitle, 500);
  });
  headerTitleEl.addEventListener('blur', commitHeaderTitle);
  headerTitleEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); headerTitleEl.blur(); }
  });
}

// Ícone e cor do cabeçalho abrem o mesmo popover que o menu "⋯" da aba já
// usa — mesmo conteúdo, mesmo estado, só um segundo ponto de entrada.
headerIconBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (headerNoteRef) openAppearancePopover(headerIconBtn, headerNoteRef);
});
headerColorBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (headerNoteRef) openAppearancePopover(headerColorBtn, headerNoteRef);
});

// A aba (ou a aside) pode mudar título/ícone/cor desta mesma nota por fora do
// cabeçalho (menu "⋯"); precisa refletir isso mesmo quando não foi o
// cabeçalho quem disparou a troca. `headerNoteRef` é um objeto próprio deste
// módulo (vem de um getNoteById() separado do notesMeta da aside) — sem
// buscar de novo, renderNoteHeader(headerNoteRef) só repetiria os dados
// antigos, sem mudar nada na tela.
document.addEventListener('quickdock:note-appearance-updated', async e => {
  if (!headerNoteRef || e.detail?.noteId !== headerNoteRef.id) return;
  const fresh = await getNoteById(headerNoteRef.id);
  if (fresh) {
    headerNoteRef = fresh;
    renderNoteHeader(headerNoteRef);
  }
});
