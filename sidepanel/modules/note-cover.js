// ── note-cover.js ─────────────────────────────────────────────────────────────
// Capa da nota como Sessão Expansível (<details> / <summary>), 100% no fluxo do documento.
// Zero popups flutuantes. Opções de tamanho (altura), reposicionamento e imagem.

import { updateNoteMetaById, saveFile, loadFileBlob, deleteFile } from './storage.js';
import { noteEditorEl } from './note-state.js';

const headerBar = document.getElementById('note-header-bar');

export const MAX_BYTES = 10 * 1024 * 1024;

let noteRef = null;
let objectUrl = null;
let renderToken = 0;
let renderedKey = null;

let coverEl = null;
let imgEl = null;
let errorEl = null;
let repositionBarEl = null;
let coverPanelEl = null;
let openBtn = null;

function revokeObjectUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

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

export async function saveReposition() {
  if (!noteRef) return;
  const pos = currentPos;
  stopReposition();
  await applyCover({ coverPosition: pos }, noteRef);
}

export function cancelReposition() {
  stopReposition();
  if (noteRef && imgEl) {
    imgEl.style.objectPosition = `50% ${getNoteCoverPos(noteRef)}%`;
  }
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

export function isCoverMenuOpen() {
  return !!coverEl?.classList.contains('is-open');
}

export function closeCoverMenu() {
  if (coverEl) {
    coverEl.classList.remove('is-open', 'is-configuring');
  }
  if (coverPanelEl) {
    coverPanelEl.classList.remove('is-open');
    coverPanelEl.setAttribute('aria-hidden', 'true');
  }
  openBtn?.classList.remove('section-active', 'is-active');
  openBtn?.setAttribute('aria-expanded', 'false');
}

export function openCoverMenu() {
  if (!coverEl) return;
  window.dispatchEvent(new CustomEvent('quickdock:close-icon-menu'));
  window.dispatchEvent(new CustomEvent('quickdock:close-note-section'));

  coverEl.classList.add('is-open', 'is-configuring');
  if (coverPanelEl) {
    coverPanelEl.classList.add('is-open');
    coverPanelEl.setAttribute('aria-hidden', 'false');
  }
  openBtn?.classList.add('section-active', 'is-active');
  openBtn?.setAttribute('aria-expanded', 'true');

  renderCoverDetailsContent();
  coverEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function toggleCoverMenu() {
  if (isCoverMenuOpen()) {
    closeCoverMenu();
  } else {
    openCoverMenu();
  }
}

// ── Renderização dos Controles dentro da Sessão Expansível ──────────────────
function renderCoverDetailsContent() {
  if (!coverPanelEl || !noteRef) return;
  const has = hasCover(noteRef);
  const currentKey = getNoteCoverHeightKey(noteRef);

  const bodyEl = coverPanelEl.querySelector('#note-cover-body');
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <!-- 1. Tamanho / Altura -->
    <div class="note-cover-menu-section">
      <div class="note-cover-section-header">
        <span class="note-cover-section-label">Tamanho / Altura</span>
      </div>
      <div class="note-cover-height-picker" role="radiogroup" aria-label="Tamanho da Capa">
        <button type="button" class="note-cover-height-btn ${currentKey === 'compact' ? 'active' : ''}" data-height="compact" title="Altura compacta (120px)">Compacta (120px)</button>
        <button type="button" class="note-cover-height-btn ${currentKey === 'normal' ? 'active' : ''}" data-height="normal" title="Altura padrão (180px)">Padrão (180px)</button>
        <button type="button" class="note-cover-height-btn ${currentKey === 'large' ? 'active' : ''}" data-height="large" title="Altura grande (260px)">Grande (260px)</button>
        <button type="button" class="note-cover-height-btn ${currentKey === 'banner' ? 'active' : ''}" data-height="banner" title="Altura banner (340px)">Banner (340px)</button>
      </div>
    </div>

    <!-- 2. Alinhamento / Posição (se tiver capa ativa) -->
    ${has ? `
      <div class="note-cover-menu-section">
        <div class="note-cover-section-header">
          <span class="note-cover-section-label">Alinhamento & Posição</span>
        </div>
        <button type="button" class="calendar-action-btn secondary btn-menu-reposition" title="Arrastar verticalmente para ajustar o enquadramento">
          <span class="qd-icon material-symbols-rounded">drag_pan</span>
          <span>Reposicionar Imagem (Arrastar)</span>
        </button>
      </div>
    ` : ''}

    <!-- 3. Alterar ou Adicionar Imagem -->
    <div class="note-cover-menu-section">
      <div class="note-cover-section-header">
        <span class="note-cover-section-label">${has ? 'Alterar Imagem da Capa' : 'Escolher Imagem para a Capa'}</span>
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

    <!-- 4. Remover Capa (se tiver capa ativa) -->
    ${has ? `
      <div class="note-cover-menu-footer">
        <button type="button" class="calendar-action-btn danger btn-menu-remove-cover" title="Remover capa desta nota">
          <span class="qd-icon material-symbols-rounded">delete</span>
          <span>Remover Capa</span>
        </button>
      </div>
    ` : ''}
  `;

  bodyEl.querySelectorAll('.note-cover-height-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const heightKey = btn.dataset.height;
      await applyCoverHeight(heightKey, noteRef);
      renderCoverDetailsContent();
    });
  });

  bodyEl.querySelector('.btn-menu-reposition')?.addEventListener('click', (e) => {
    e.stopPropagation();
    startReposition();
  });

  const urlInput = bodyEl.querySelector('.note-cover-menu-url');
  const applyBtn = bodyEl.querySelector('.btn-menu-apply-url');
  const fileInput = bodyEl.querySelector('.note-cover-menu-file');
  const errorEl = bodyEl.querySelector('.note-cover-menu-error');

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
    renderCoverDetailsContent();
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
    renderCoverDetailsContent();
  });

  bodyEl.querySelector('.btn-menu-remove-cover')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await removeCover(noteRef);
  });
}

function showError(text) {
  if (errorEl) {
    errorEl.textContent = text;
    errorEl.hidden = false;
  }
  if (imgEl) imgEl.hidden = true;
}

export async function renderNoteCover(note) {
  noteRef = note || null;
  if (!coverEl) return;
  if (isRepositioning) stopReposition();

  if (!note) {
    clearNoteCover();
    return;
  }

  const has = hasCover(note);
  const height = getNoteCoverHeight(note);
  const pos = getNoteCoverPos(note);

  // A seção fica visível para a nota ativa:
  // Se tiver capa -> mostra o banner da imagem
  // Se não tiver capa (ex: nota nova) -> mostra o espaço de design para receber capa
  coverEl.hidden = false;
  coverEl.classList.toggle('is-empty', !has);
  coverEl.classList.toggle('has-cover', has);

  const imageWrap = coverEl.querySelector('#note-cover-image-wrap');
  const placeholderWrap = coverEl.querySelector('#note-cover-placeholder');

  if (imageWrap) imageWrap.style.height = `${height}px`;

  renderCoverDetailsContent();

  if (!has) {
    revokeObjectUrl();
    if (imgEl) imgEl.removeAttribute('src');
    if (placeholderWrap) placeholderWrap.hidden = false;
    if (imageWrap) imageWrap.hidden = true;
    syncButtons();
    return;
  }

  if (placeholderWrap) placeholderWrap.hidden = true;
  if (imageWrap) imageWrap.hidden = false;
  if (errorEl) errorEl.hidden = true;
  if (imgEl) {
    imgEl.hidden = false;
    imgEl.style.objectPosition = `50% ${pos}%`;
  }

  const key = `${note.id}|${note.coverUrl ?? ''}|${note.coverFileId ?? ''}|${pos}|${height}`;
  if (key === renderedKey && imgEl?.getAttribute('src')) {
    syncButtons();
    return;
  }
  renderedKey = key;

  const token = ++renderToken;
  if (note.coverUrl) {
    revokeObjectUrl();
    if (imgEl) imgEl.src = note.coverUrl;
  } else if (note.coverFileId != null) {
    const blob = await loadFileBlob(note.coverFileId);
    if (token !== renderToken) return;
    if (!blob) {
      showError('A imagem da capa não foi encontrada neste aparelho.');
      syncButtons();
      return;
    }
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(blob);
    if (imgEl) imgEl.src = objectUrl;
  }

  syncButtons();
}

export function clearNoteCover() {
  noteRef = null;
  renderedKey = null;
  stopReposition();
  closeCoverMenu();
  if (coverEl) {
    coverEl.hidden = true;
    coverEl.classList.add('is-empty');
    coverEl.classList.remove('has-cover', 'is-open', 'is-configuring');
  }
  revokeObjectUrl();
}

function syncButtons() {
  const has = hasCover(noteRef);
  if (openBtn) {
    openBtn.title = has ? 'Configurar capa' : 'Adicionar capa';
    openBtn.setAttribute('aria-label', openBtn.title);
    openBtn.classList.toggle('active', has);
  }
}

export async function applyCover(patch, targetNote = null) {
  const current = targetNote || noteRef;
  if (!current) return;
  const id = current.id;
  const antigoArquivo = current.coverFileId;
  await updateNoteMetaById(id, patch);
  if (antigoArquivo != null && antigoArquivo !== patch.coverFileId) {
    try { await deleteFile(antigoArquivo); } catch {}
  }
  Object.assign(current, patch);
  if (noteRef && noteRef.id === id) {
    Object.assign(noteRef, patch);
    await renderNoteCover(noteRef);
  }
  document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: id } }));
}

export async function removeCover(targetNote = null) {
  await applyCover({ coverUrl: null, coverFileId: null }, targetNote);
}

function buildCover() {
  const el = document.createElement('div');
  el.id = 'note-cover';
  el.className = 'section note-cover note-cover-section is-empty';
  el.hidden = true;
  el.innerHTML = `
    <!-- Gatilho principal da seção da capa -->
    <div class="section-trigger capa-trigger" role="button" tabindex="0" title="Configurar capa da nota" aria-label="Capa da nota">
      <!-- 1. Placeholder quando NÃO TEM capa (nota nova) -->
      <div class="capa-placeholder-wrap" id="note-cover-placeholder">
        <div class="capa-placeholder-icon-badge">
          <span class="qd-icon material-symbols-rounded" aria-hidden="true">add_photo_alternate</span>
        </div>
        <div class="capa-placeholder-texts">
          <span class="capa-placeholder-title">Adicionar Capa</span>
          <span class="capa-placeholder-subtitle">Clique para opções ou arraste uma foto aqui</span>
        </div>
        <div class="capa-placeholder-actions">
          <button type="button" class="capa-btn-quick-upload" title="Escolher arquivo do computador">
            <span class="qd-icon material-symbols-rounded" aria-hidden="true">upload_file</span>
            <span>Arquivo</span>
          </button>
          <input type="file" accept="image/*" class="capa-placeholder-file-input" hidden>
        </div>
      </div>

      <!-- 2. Banner com imagem quando TEM capa -->
      <div class="capa-image-wrap" id="note-cover-image-wrap" hidden>
        <img class="note-cover-img capa-img" alt="" referrerpolicy="no-referrer" decoding="async">
        <div class="note-cover-error" hidden></div>
        <span class="capa-label">Capa</span>
        <div class="note-cover-actions">
          <button type="button" class="note-cover-action note-cover-change" title="Opções da capa">
            <span class="qd-icon material-symbols-rounded" aria-hidden="true">tune</span>
            <span>Ajustar capa</span>
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
      </div>
    </div>

    <!-- Gaveta de opções inline (.section-body) -->
    <div class="section-body note-cover-section-body" id="note-cover-panel" aria-hidden="true">
      <div class="property-drawer-content note-cover-drawer-content" id="note-cover-body"></div>
    </div>
  `;

  imgEl = el.querySelector('.note-cover-img');
  errorEl = el.querySelector('.note-cover-error');
  repositionBarEl = el.querySelector('.note-cover-reposition-bar');
  const triggerEl = el.querySelector('.capa-trigger');
  const quickUploadBtn = el.querySelector('.capa-btn-quick-upload');
  const quickFileInput = el.querySelector('.capa-placeholder-file-input');
  const imageWrap = el.querySelector('#note-cover-image-wrap');

  imgEl.addEventListener('error', () => {
    if (imgEl.getAttribute('src')) showError('Não foi possível carregar a imagem da capa.');
  });
  imgEl.addEventListener('load', () => { if (errorEl) errorEl.hidden = true; imgEl.hidden = false; });

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

  quickUploadBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    quickFileInput?.click();
  });

  quickFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !noteRef) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_BYTES) return;
    const fileId = await saveFile(file, noteRef.id, { inline: true });
    await applyCover({ coverFileId: fileId, coverUrl: null }, noteRef);
  });

  // Drag and Drop de imagem
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    el.classList.add('is-dragover');
  });

  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) {
      el.classList.remove('is-dragover');
    }
  });

  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (!file || !noteRef) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_BYTES) return;
    const fileId = await saveFile(file, noteRef.id, { inline: true });
    await applyCover({ coverFileId: fileId, coverUrl: null }, noteRef);
  });

  // Clique no gatilho abre ou fecha as opções
  triggerEl.addEventListener('click', (e) => {
    if (isRepositioning) return;
    if (e.target.closest('.note-cover-action')) return;
    if (e.target.closest('.capa-btn-quick-upload')) return;
    if (e.target.closest('input')) return;
    toggleCoverMenu();
  });

  triggerEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('button') || e.target.closest('input')) return;
      e.preventDefault();
      toggleCoverMenu();
    }
  });

  // Eventos de arrastar para reposicionar
  imageWrap.addEventListener('pointerdown', (e) => {
    if (!isRepositioning) return;
    if (e.target.closest('.note-cover-reposition-btns')) return;
    isDragging = true;
    dragStartY = e.clientY;
    dragStartPos = currentPos;
    el.classList.add('is-dragging');
    try { imageWrap.setPointerCapture(e.pointerId); } catch {}
  });

  imageWrap.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const height = imageWrap.clientHeight || 180;
    const deltaY = e.clientY - dragStartY;
    const deltaPercent = (deltaY / height) * 100;
    currentPos = Math.max(0, Math.min(100, Math.round(dragStartPos - deltaPercent)));
    if (imgEl) imgEl.style.objectPosition = `50% ${currentPos}%`;
  });

  const stopPointerDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('is-dragging');
    try { imageWrap.releasePointerCapture(e.pointerId); } catch {}
  };
  imageWrap.addEventListener('pointerup', stopPointerDrag);
  imageWrap.addEventListener('pointercancel', stopPointerDrag);

  return el;
}

function mount() {
  if (!noteEditorEl) return;
  coverEl = buildCover();
  coverPanelEl = coverEl.querySelector('#note-cover-panel');
  openBtn = document.getElementById('btn-note-cover');
  noteEditorEl.insertBefore(coverEl, noteEditorEl.firstChild);

  syncButtons();

  window.addEventListener('quickdock:close-cover-menu', () => {
    closeCoverMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCoverMenuOpen()) closeCoverMenu();
  });
}

mount();
