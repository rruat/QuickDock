// Capa da nota: uma imagem no topo, acima do título. Pode vir de um endereço
// (link http/https) ou de um arquivo enviado, que fica guardado no mesmo banco
// das imagens da nota (saveFile, marcado como inline).
//
// Persistência: `coverUrl` (endereço) OU `coverFileId` (arquivo), nunca os dois.
// Só o endereço sincroniza (frontmatter `capa:`); o arquivo é local.

import { updateNoteMetaById, saveFile, loadFileBlob, deleteFile } from './storage.js';
import { noteEditorEl } from './note-state.js';

const headerBar = document.getElementById('note-header-bar');
const colorBtn = document.getElementById('btn-note-header-color');

// Teto pra imagem enviada: a capa é decoração, não precisa de foto em tamanho cheio.
const MAX_BYTES = 10 * 1024 * 1024;

let noteRef = null;       // nota mostrada agora (o mesmo objeto que o cabeçalho recebe)
let objectUrl = null;     // URL temporária da capa enviada, revogada ao trocar
let renderToken = 0;      // descarta o carregamento de um arquivo que ficou pra trás
let renderedKey = null;   // o que já está na tela, pra não recarregar a imagem à toa

let coverEl = null;
let imgEl = null;
let errorEl = null;
let popoverEl = null;
let openBtn = null;
let urlInput = null;
let removeBtn = null;
let messageEl = null;

function revokeObjectUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

// Só http/https: nada de javascript:, data: ou file: digitado como "endereço".
function normalizeUrl(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function hasCover(note) {
  return !!note && (!!note.coverUrl || note.coverFileId != null);
}

// ── Renderização ──────────────────────────────────────────────────────────────
function showError(text) {
  errorEl.textContent = text;
  errorEl.hidden = false;
  imgEl.hidden = true;
}

export async function renderNoteCover(note) {
  noteRef = note || null;
  if (!coverEl) return;

  // O cabeçalho re-renderiza a mesma nota várias vezes (título, ícone, cor...):
  // sem esta checagem a imagem era baixada de novo a cada uma.
  const key = hasCover(note) ? `${note.id}|${note.coverUrl ?? ''}|${note.coverFileId ?? ''}` : null;
  if (key === renderedKey && (key === null || !coverEl.hidden)) { syncButtons(); return; }
  renderedKey = key;

  const token = ++renderToken;

  if (!hasCover(note)) {
    revokeObjectUrl();
    imgEl.removeAttribute('src');
    coverEl.hidden = true;
    syncButtons();
    return;
  }

  coverEl.hidden = false;
  errorEl.hidden = true;
  imgEl.hidden = false;

  if (note.coverUrl) {
    revokeObjectUrl();
    imgEl.src = note.coverUrl;
  } else {
    const blob = await loadFileBlob(note.coverFileId);
    if (token !== renderToken) return;             // trocou de nota enquanto carregava
    if (!blob) { showError('A imagem da capa não foi encontrada neste aparelho.'); syncButtons(); return; }
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(blob);
    imgEl.src = objectUrl;
  }
  syncButtons();
}

export function clearNoteCover() {
  noteRef = null;
  renderedKey = null;
  closePopover();
  if (coverEl) coverEl.hidden = true;
  revokeObjectUrl();
}

function syncButtons() {
  const has = hasCover(noteRef);
  if (openBtn) {
    openBtn.title = has ? 'Alterar capa' : 'Adicionar capa';
    openBtn.setAttribute('aria-label', openBtn.title);
    openBtn.classList.toggle('active', has);
  }
  if (removeBtn) removeBtn.hidden = !has;
}

// ── Gravação ──────────────────────────────────────────────────────────────────
async function applyCover(patch) {
  if (!noteRef) return;
  const id = noteRef.id;
  const antigoArquivo = noteRef.coverFileId;
  await updateNoteMetaById(id, patch);
  // O arquivo anterior só é apagado depois de a troca estar gravada.
  if (antigoArquivo != null && antigoArquivo !== patch.coverFileId) {
    try { await deleteFile(antigoArquivo); } catch {}
  }
  Object.assign(noteRef, patch);
  await renderNoteCover(noteRef);
  // Mesmo aviso que ícone/cor usam: quem mostra a nota em outro lugar se atualiza.
  document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: id } }));
}

function setMessage(text) {
  if (!messageEl) return;
  messageEl.textContent = text || '';
  messageEl.hidden = !text;
}

async function applyUrl() {
  const url = normalizeUrl(urlInput.value);
  if (!url) { setMessage('Digite um link http:// ou https:// válido.'); return; }
  setMessage('');
  await applyCover({ coverUrl: url, coverFileId: null });
  urlInput.value = '';
  closePopover();
}

async function applyFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { setMessage('Escolha um arquivo de imagem.'); return; }
  if (file.size > MAX_BYTES) { setMessage('A imagem passa de 10 MB. Escolha uma menor.'); return; }
  setMessage('');
  const fileId = await saveFile(file, noteRef?.id ?? null, { inline: true });
  await applyCover({ coverFileId: fileId, coverUrl: null });
  closePopover();
}

async function removeCover() {
  await applyCover({ coverUrl: null, coverFileId: null });
  closePopover();
}

// ── Popover ───────────────────────────────────────────────────────────────────
function closePopover() {
  if (popoverEl) popoverEl.hidden = true;
  openBtn?.setAttribute('aria-expanded', 'false');
}

function positionPopover(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = popoverEl.offsetWidth || 300;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  popoverEl.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - popoverEl.offsetHeight - 8)}px`;
  popoverEl.style.left = `${left}px`;
}

function openPopover(anchor) {
  if (!noteRef) return;
  setMessage('');
  syncButtons();
  popoverEl.hidden = false;
  positionPopover(anchor);
  openBtn?.setAttribute('aria-expanded', 'true');
  urlInput.value = noteRef.coverUrl || '';
  urlInput.focus();
}

function buildPopover() {
  const el = document.createElement('div');
  el.className = 'note-cover-popover';
  el.hidden = true;
  el.innerHTML = `
    <div class="note-cover-title">Capa da nota</div>
    <label class="note-cover-field">
      <span>Link da imagem</span>
      <input type="url" class="note-cover-url" placeholder="https://exemplo.com/imagem.jpg" spellcheck="false" autocomplete="off">
    </label>
    <button type="button" class="note-cover-btn note-cover-apply">
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">link</span>
      <span>Usar este link</span>
    </button>
    <div class="note-cover-or">ou</div>
    <button type="button" class="note-cover-btn note-cover-upload">
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">upload</span>
      <span>Enviar uma imagem</span>
    </button>
    <input type="file" class="note-cover-file" accept="image/*" hidden>
    <button type="button" class="note-cover-btn note-cover-remove" hidden>
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">delete</span>
      <span>Remover capa</span>
    </button>
    <div class="note-cover-message" role="status" hidden></div>
    <div class="note-cover-hint">O link carrega a imagem direto do site, sem enviar de qual página você veio.</div>
  `;
  urlInput = el.querySelector('.note-cover-url');
  removeBtn = el.querySelector('.note-cover-remove');
  messageEl = el.querySelector('.note-cover-message');
  const fileInput = el.querySelector('.note-cover-file');

  el.querySelector('.note-cover-apply').addEventListener('click', applyUrl);
  urlInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); applyUrl(); }
  });
  el.querySelector('.note-cover-upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    await applyFile(file);
  });
  removeBtn.addEventListener('click', removeCover);
  document.body.appendChild(el);
  return el;
}

function buildCover() {
  const el = document.createElement('div');
  el.id = 'note-cover';
  el.className = 'note-cover';
  el.hidden = true;
  el.innerHTML = `
    <img class="note-cover-img" alt="" referrerpolicy="no-referrer" decoding="async">
    <div class="note-cover-error" hidden></div>
    <div class="note-cover-actions">
      <button type="button" class="note-cover-action note-cover-change">
        <span class="qd-icon material-symbols-rounded" aria-hidden="true">image</span>
        <span>Alterar capa</span>
      </button>
    </div>
  `;
  imgEl = el.querySelector('.note-cover-img');
  errorEl = el.querySelector('.note-cover-error');
  // Endereço que não abre (saiu do ar, bloqueado...) vira aviso, não uma caixa quebrada.
  imgEl.addEventListener('error', () => {
    if (imgEl.getAttribute('src')) showError('Não foi possível carregar a imagem da capa.');
  });
  imgEl.addEventListener('load', () => { errorEl.hidden = true; imgEl.hidden = false; });
  el.querySelector('.note-cover-change').addEventListener('click', (e) => {
    e.stopPropagation();
    openPopover(e.currentTarget);
  });
  return el;
}

function mount() {
  if (!noteEditorEl) return;
  coverEl = buildCover();
  noteEditorEl.insertBefore(coverEl, noteEditorEl.firstChild);

  popoverEl = buildPopover();

  if (headerBar) {
    openBtn = document.createElement('button');
    openBtn.id = 'btn-note-cover';
    openBtn.type = 'button';
    openBtn.className = 'icon-btn note-header-cover-btn';
    openBtn.setAttribute('aria-haspopup', 'true');
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">image</span>';
    headerBar.insertBefore(openBtn, colorBtn || null);
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!popoverEl.hidden) { closePopover(); return; }
      openPopover(openBtn);
    });
  }
  syncButtons();

  document.addEventListener('mousedown', (e) => {
    if (popoverEl.hidden) return;
    if (popoverEl.contains(e.target) || openBtn?.contains(e.target) || coverEl.contains(e.target)) return;
    closePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popoverEl.hidden) closePopover();
  });
  window.addEventListener('resize', () => { if (!popoverEl.hidden) closePopover(); });
}

mount();
