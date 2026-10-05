// Capa da nota: uma imagem no topo, acima do título. Pode vir de um endereço
// (link http/https) ou de um arquivo enviado, que fica guardado no mesmo banco
// das imagens da nota (saveFile, marcado como inline).
//
// Persistência: `coverUrl` (endereço) OU `coverFileId` (arquivo), nunca os dois.
// Só o endereço sincroniza (frontmatter `capa:`); o arquivo é local.

import { updateNoteMetaById, saveFile, loadFileBlob, deleteFile } from './storage.js';
import { noteEditorEl } from './note-state.js';
import { toggleNoteSection, openNoteSection } from './reminders/note-expandable-section.js';

const headerBar = document.getElementById('note-header-bar');
const colorBtn = document.getElementById('btn-note-header-color');

// Teto pra imagem enviada: a capa é decoração, não precisa de foto em tamanho cheio.
export const MAX_BYTES = 10 * 1024 * 1024;

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
export function normalizeUrl(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function hasCover(note) {
  return !!note && (!!note.coverUrl || note.coverFileId != null);
}

let isRepositioning = false;
let isDragging = false;
let dragStartY = 0;
let dragStartPos = 50;
let currentPos = 50;
let repositionBarEl = null;

export function getNoteCoverPos(note) {
  if (!note) return 50;
  if (typeof note.coverPosition === 'number') return note.coverPosition;
  if (typeof note.coverPositionY === 'number') return note.coverPositionY;
  return 50;
}

export function startReposition() {
  if (!noteRef || isRepositioning) return;
  isRepositioning = true;
  currentPos = getNoteCoverPos(noteRef);
  if (imgEl) imgEl.style.objectPosition = `50% ${currentPos}%`;
  coverEl?.classList.add('is-repositioning');
  if (repositionBarEl) repositionBarEl.hidden = false;
}

export function stopReposition() {
  isRepositioning = false;
  isDragging = false;
  coverEl?.classList.remove('is-repositioning', 'is-dragging');
  if (repositionBarEl) repositionBarEl.hidden = true;
}

export function getNoteCoverHeight(note) {
  if (!note) return 180;
  if (typeof note.coverHeight === 'number') return note.coverHeight;
  if (note.coverHeight === 'compact') return 120;
  if (note.coverHeight === 'normal') return 180;
  if (note.coverHeight === 'large') return 260;
  if (note.coverHeight === 'banner') return 340;
  return 180;
}

export function getNoteCoverHeightKey(note) {
  if (!note) return 'normal';
  if (typeof note.coverHeight === 'string') return note.coverHeight;
  if (typeof note.coverHeight === 'number') {
    if (note.coverHeight <= 140) return 'compact';
    if (note.coverHeight <= 220) return 'normal';
    if (note.coverHeight <= 300) return 'large';
    return 'banner';
  }
  return 'normal';
}

export async function applyCoverHeight(heightKey, targetNote = null) {
  await applyCover({ coverHeight: heightKey }, targetNote);
}

let coverMenuEl = null;

export function isCoverMenuOpen() {
  return coverMenuEl && !coverMenuEl.hidden;
}

export function closeCoverMenu() {
  if (coverMenuEl) {
    coverMenuEl.hidden = true;
    coverEl?.classList.remove('is-configuring');
  }
}

export function openCoverMenu() {
  if (!coverMenuEl || !noteRef) return;
  window.dispatchEvent(new CustomEvent('quickdock:close-icon-menu'));
  renderCoverMenuContent();
  coverMenuEl.hidden = false;
  coverEl?.classList.add('is-configuring');
  coverMenuEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function toggleCoverMenu() {
  if (isCoverMenuOpen()) {
    closeCoverMenu();
  } else {
    openCoverMenu();
  }
}

function renderCoverMenuContent() {
  if (!coverMenuEl || !noteRef) return;
  const currentKey = getNoteCoverHeightKey(noteRef);

  coverMenuEl.innerHTML = `
    <div class="note-cover-menu-header">
      <div class="note-cover-menu-title">
        <span class="qd-icon material-symbols-rounded">image</span>
        <span>Opções da Capa</span>
      </div>
      <button type="button" class="icon-btn btn-close-cover-menu" title="Recolher opções" aria-label="Recolher opções">
        <span class="qd-icon material-symbols-rounded">expand_less</span>
      </button>
    </div>

    <div class="note-cover-menu-body">
      <!-- 1. Tamanho / Altura -->
      <div class="note-cover-menu-section">
        <div class="note-cover-section-header">
          <span class="note-cover-section-label">Tamanho / Altura</span>
        </div>
        <div class="note-cover-height-picker" role="radiogroup" aria-label="Tamanho da Capa">
          <button type="button" class="note-cover-height-btn ${currentKey === 'compact' ? 'active' : ''}" data-height="compact" title="Altura compacta (120px)">Compacta</button>
          <button type="button" class="note-cover-height-btn ${currentKey === 'normal' ? 'active' : ''}" data-height="normal" title="Altura padrão (180px)">Padrão</button>
          <button type="button" class="note-cover-height-btn ${currentKey === 'large' ? 'active' : ''}" data-height="large" title="Altura grande (260px)">Grande</button>
          <button type="button" class="note-cover-height-btn ${currentKey === 'banner' ? 'active' : ''}" data-height="banner" title="Altura banner (340px)">Banner</button>
        </div>
      </div>

      <!-- 2. Alinhamento / Posição -->
      <div class="note-cover-menu-section">
        <div class="note-cover-section-header">
          <span class="note-cover-section-label">Alinhamento & Posição</span>
        </div>
        <button type="button" class="calendar-action-btn secondary btn-menu-reposition" title="Arrastar verticalmente para ajustar o enquadramento">
          <span class="qd-icon material-symbols-rounded">drag_pan</span>
          <span>Reposicionar Imagem (Arrastar)</span>
        </button>
      </div>

      <!-- 3. Alterar Imagem -->
      <div class="note-cover-menu-section">
        <div class="note-cover-section-header">
          <span class="note-cover-section-label">Alterar Imagem da Capa</span>
        </div>
        <div class="note-cover-input-row">
          <input type="url" class="property-input note-cover-menu-url" placeholder="Colar link de imagem (https://...)" spellcheck="false" autocomplete="off" value="${noteRef.coverUrl || ''}">
          <button type="button" class="calendar-action-btn primary btn-menu-apply-url" title="Aplicar link da imagem">
            <span class="qd-icon material-symbols-rounded">link</span>
            <span>Aplicar</span>
          </button>
          <label class="calendar-action-btn secondary btn-menu-file-label" title="Escolher arquivo do aparelho">
            <input type="file" accept="image/*" class="note-cover-menu-file" hidden>
            <span class="qd-icon material-symbols-rounded">upload_file</span>
            <span>Arquivo</span>
          </label>
        </div>
        <div class="note-cover-menu-error" hidden></div>
      </div>

      <!-- 4. Remover Capa -->
      <div class="note-cover-menu-footer">
        <button type="button" class="calendar-action-btn danger btn-menu-remove-cover" title="Remover capa desta nota">
          <span class="qd-icon material-symbols-rounded">delete</span>
          <span>Remover Capa</span>
        </button>
      </div>
    </div>
  `;

  coverMenuEl.querySelector('.btn-close-cover-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCoverMenu();
  });

  coverMenuEl.querySelectorAll('.note-cover-height-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const heightKey = btn.dataset.height;
      await applyCoverHeight(heightKey, noteRef);
      renderCoverMenuContent();
    });
  });

  coverMenuEl.querySelector('.btn-menu-reposition')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCoverMenu();
    startReposition();
  });

  const urlInput = coverMenuEl.querySelector('.note-cover-menu-url');
  const applyBtn = coverMenuEl.querySelector('.btn-menu-apply-url');
  const fileInput = coverMenuEl.querySelector('.note-cover-menu-file');
  const errorEl = coverMenuEl.querySelector('.note-cover-menu-error');

  const handleApplyUrl = async () => {
    const raw = (urlInput?.value || '').trim();
    const url = normalizeUrl(raw);
    if (!url) {
      if (errorEl) {
        errorEl.textContent = 'Digite um link http:// ou https:// válido.';
        errorEl.hidden = false;
      }
      return;
    }
    if (errorEl) errorEl.hidden = true;
    await applyCover({ coverUrl: url, coverFileId: null }, noteRef);
    renderCoverMenuContent();
  };

  applyBtn?.addEventListener('click', handleApplyUrl);
  urlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleApplyUrl(); }
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      if (errorEl) {
        errorEl.textContent = 'Escolha um arquivo de imagem.';
        errorEl.hidden = false;
      }
      return;
    }
    if (file.size > MAX_BYTES) {
      if (errorEl) {
        errorEl.textContent = 'A imagem passa de 10 MB. Escolha uma menor.';
        errorEl.hidden = false;
      }
      return;
    }
    if (errorEl) errorEl.hidden = true;
    const fileId = await saveFile(file, noteRef.id, { inline: true });
    await applyCover({ coverFileId: fileId, coverUrl: null }, noteRef);
    renderCoverMenuContent();
  });

  coverMenuEl.querySelector('.btn-menu-remove-cover')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeCoverMenu();
    await removeCover(noteRef);
  });
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
  if (isRepositioning) stopReposition();

  const height = getNoteCoverHeight(note);
  coverEl.style.height = `${height}px`;

  if (isCoverMenuOpen()) {
    renderCoverMenuContent();
  }

  // O cabeçalho re-renderiza a mesma nota várias vezes (título, ícone, cor...):
  // sem esta checagem a imagem era baixada de novo a cada uma.
  const pos = getNoteCoverPos(note);
  const key = hasCover(note) ? `${note.id}|${note.coverUrl ?? ''}|${note.coverFileId ?? ''}|${pos}|${height}` : null;
  if (key === renderedKey && (key === null || !coverEl.hidden)) {
    if (imgEl) imgEl.style.objectPosition = `50% ${pos}%`;
    syncButtons();
    return;
  }
  renderedKey = key;

  const token = ++renderToken;

  if (!hasCover(note)) {
    revokeObjectUrl();
    imgEl.removeAttribute('src');
    coverEl.hidden = true;
    closeCoverMenu();
    syncButtons();
    return;
  }

  coverEl.hidden = false;
  errorEl.hidden = true;
  imgEl.hidden = false;
  imgEl.style.objectPosition = `50% ${pos}%`;

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
  stopReposition();
  closePopover();
  closeCoverMenu();
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
export async function applyCover(patch, targetNote = null) {
  const current = targetNote || noteRef;
  if (!current) return;
  const id = current.id;
  const antigoArquivo = current.coverFileId;
  await updateNoteMetaById(id, patch);
  // O arquivo anterior só é apagado depois de a troca estar gravada.
  if (antigoArquivo != null && antigoArquivo !== patch.coverFileId) {
    try { await deleteFile(antigoArquivo); } catch {}
  }
  Object.assign(current, patch);
  if (noteRef && noteRef.id === id) {
    Object.assign(noteRef, patch);
    await renderNoteCover(noteRef);
  }
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

export async function removeCover(targetNote = null) {
  await applyCover({ coverUrl: null, coverFileId: null }, targetNote);
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
      <button type="button" class="note-cover-action note-cover-reposition" title="Reposicionar verticalmente a capa">
        <span class="qd-icon material-symbols-rounded" aria-hidden="true">drag_pan</span>
        <span>Reposicionar</span>
      </button>
    </div>
    <div class="note-cover-reposition-bar" hidden>
      <span class="note-cover-reposition-hint">Arraste a imagem verticalmente</span>
      <div class="note-cover-reposition-btns">
        <button type="button" class="note-cover-action note-cover-reposition-save">
          <span class="qd-icon material-symbols-rounded" aria-hidden="true">check</span>
          <span>Salvar</span>
        </button>
        <button type="button" class="note-cover-action note-cover-reposition-cancel">
          <span class="qd-icon material-symbols-rounded" aria-hidden="true">close</span>
          <span>Cancelar</span>
        </button>
      </div>
    </div>
  `;
  imgEl = el.querySelector('.note-cover-img');
  errorEl = el.querySelector('.note-cover-error');
  repositionBarEl = el.querySelector('.note-cover-reposition-bar');

  // Endereço que não abre (saiu do ar, bloqueado...) vira aviso, não uma caixa quebrada.
  imgEl.addEventListener('error', () => {
    if (imgEl.getAttribute('src')) showError('Não foi possível carregar a imagem da capa.');
  });
  imgEl.addEventListener('load', () => { errorEl.hidden = true; imgEl.hidden = false; });
  el.querySelector('.note-cover-change').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCoverMenu();
  });
  el.querySelector('.note-cover-reposition').addEventListener('click', (e) => {
    e.stopPropagation();
    startReposition();
  });
  el.querySelector('.note-cover-reposition-save').addEventListener('click', (e) => {
    e.stopPropagation();
    saveReposition();
  });
  el.querySelector('.note-cover-reposition-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelReposition();
  });

  // Arraste interativo para reposicionar capa
  el.addEventListener('pointerdown', (e) => {
    if (!isRepositioning) return;
    if (e.target.closest('.note-cover-reposition-btns')) return;
    isDragging = true;
    dragStartY = e.clientY;
    dragStartPos = currentPos;
    el.classList.add('is-dragging');
    try { el.setPointerCapture(e.pointerId); } catch {}
  });

  el.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const height = el.clientHeight || 180;
    const deltaY = e.clientY - dragStartY;
    // Arrastar para baixo move a imagem para baixo, revelando o topo (diminui % de object-position-y)
    // Arrastar para cima move a imagem para cima, revelando o rodapé (aumenta % de object-position-y)
    const deltaPercent = (deltaY / height) * 100;
    currentPos = Math.max(0, Math.min(100, Math.round(dragStartPos - deltaPercent)));
    if (imgEl) imgEl.style.objectPosition = `50% ${currentPos}%`;
  });

  const stopPointerDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('is-dragging');
    try { el.releasePointerCapture(e.pointerId); } catch {}
  };
  el.addEventListener('pointerup', stopPointerDrag);
  el.addEventListener('pointercancel', stopPointerDrag);

  return el;
}

function mount() {
  if (!noteEditorEl) return;
  coverEl = buildCover();
  noteEditorEl.insertBefore(coverEl, noteEditorEl.firstChild);

  coverMenuEl = document.createElement('div');
  coverMenuEl.id = 'note-cover-menu';
  coverMenuEl.className = 'note-cover-inline-menu';
  coverMenuEl.hidden = true;
  noteEditorEl.insertBefore(coverMenuEl, coverEl.nextSibling);

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
      if (noteRef) {
        toggleCoverMenu();
      }
    });
  }
  syncButtons();

  document.addEventListener('pointerdown', (e) => {
    if (isCoverMenuOpen()) {
      if (!coverMenuEl.contains(e.target) && !coverEl.contains(e.target) && !openBtn?.contains(e.target)) {
        closeCoverMenu();
      }
    }
  });

  window.addEventListener('quickdock:close-cover-menu', () => {
    closeCoverMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCoverMenuOpen()) closeCoverMenu();
  });
}

mount();
