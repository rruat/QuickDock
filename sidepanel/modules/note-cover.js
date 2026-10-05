// ── note-cover.js ─────────────────────────────────────────────────────────────
// Capa da nota como Sessão Expansível (<details> / <summary>), 100% no fluxo do documento.
// Zero popups flutuantes. Opções de tamanho (altura), reposicionamento e imagem.

import { updateNoteMetaById, saveFile, loadFileBlob, deleteFile } from './storage.js';
import { noteEditorEl } from './note-state.js';

const headerBar = document.getElementById('note-header-bar');
const colorBtn = document.getElementById('btn-note-header-color');

export const MAX_BYTES = 10 * 1024 * 1024;

let noteRef = null;
let objectUrl = null;
let renderToken = 0;
let renderedKey = null;

let coverEl = null;
let imgEl = null;
let errorEl = null;
let repositionBarEl = null;
let coverDetailsEl = null;
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
  return coverDetailsEl && coverDetailsEl.open;
}

export function closeCoverMenu() {
  if (coverDetailsEl) coverDetailsEl.open = false;
}

export function openCoverMenu() {
  if (coverDetailsEl) {
    coverDetailsEl.open = true;
    renderCoverDetailsContent();
    coverDetailsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export function toggleCoverMenu() {
  if (coverDetailsEl) {
    coverDetailsEl.open = !coverDetailsEl.open;
    if (coverDetailsEl.open) {
      renderCoverDetailsContent();
      coverDetailsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// ── Renderização dos Controles dentro da Sessão <details> ────────────────────
function renderCoverDetailsContent() {
  if (!coverDetailsEl || !noteRef) return;
  const has = hasCover(noteRef);
  const currentKey = getNoteCoverHeightKey(noteRef);
  const heightPx = getNoteCoverHeight(noteRef);

  const badgeEl = coverDetailsEl.querySelector('#note-cover-status-badge');
  if (badgeEl) {
    badgeEl.textContent = has ? `${heightPx}px · Ativa` : 'Adicionar capa';
  }

  const bodyEl = coverDetailsEl.querySelector('#note-cover-body');
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

    <!-- 4. Remover Capa -->
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

  const height = getNoteCoverHeight(note);
  coverEl.style.height = `${height}px`;

  renderCoverDetailsContent();

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
    syncButtons();
    return;
  }

  coverEl.hidden = false;
  if (errorEl) errorEl.hidden = true;
  imgEl.hidden = false;
  imgEl.style.objectPosition = `50% ${pos}%`;

  if (note.coverUrl) {
    revokeObjectUrl();
    imgEl.src = note.coverUrl;
  } else {
    const blob = await loadFileBlob(note.coverFileId);
    if (token !== renderToken) return;
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
  closeCoverMenu();
  if (coverEl) coverEl.hidden = true;
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
  el.className = 'note-cover';
  el.hidden = true;
  el.innerHTML = `
    <img class="note-cover-img" alt="" referrerpolicy="no-referrer" decoding="async">
    <div class="note-cover-error" hidden></div>
    <div class="note-cover-actions">
      <button type="button" class="note-cover-action note-cover-change">
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
  `;
  imgEl = el.querySelector('.note-cover-img');
  errorEl = el.querySelector('.note-cover-error');
  repositionBarEl = el.querySelector('.note-cover-reposition-bar');

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

function buildCoverDetails() {
  const details = document.createElement('details');
  details.id = 'note-cover-details';
  details.className = 'note-section-details note-cover-details';
  details.innerHTML = `
    <summary class="note-section-summary">
      <div class="note-summary-left">
        <span class="qd-icon material-symbols-rounded">image</span>
        <span class="note-summary-title">Capa</span>
      </div>
      <div class="note-summary-right">
        <span class="note-summary-badge" id="note-cover-status-badge">Adicionar capa</span>
        <span class="qd-icon material-symbols-rounded note-summary-chevron">expand_more</span>
      </div>
    </summary>
    <div class="note-section-body note-cover-section-body" id="note-cover-body"></div>
  `;

  details.addEventListener('toggle', () => {
    if (details.open) {
      coverEl?.classList.add('is-configuring');
      renderCoverDetailsContent();
    } else {
      coverEl?.classList.remove('is-configuring');
    }
  });

  return details;
}

function mount() {
  if (!noteEditorEl) return;
  coverEl = buildCover();
  noteEditorEl.insertBefore(coverEl, noteEditorEl.firstChild);

  coverDetailsEl = buildCoverDetails();
  noteEditorEl.insertBefore(coverDetailsEl, coverEl.nextSibling);

  if (headerBar) {
    openBtn = document.createElement('button');
    openBtn.id = 'btn-note-cover';
    openBtn.type = 'button';
    openBtn.className = 'icon-btn note-header-cover-btn';
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">image</span>';
    headerBar.insertBefore(openBtn, colorBtn || null);
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCoverMenu();
    });
  }
  syncButtons();
}

mount();
