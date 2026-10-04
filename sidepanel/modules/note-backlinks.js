// Backlinks: notas que apontam pra esta, mais a validação de link interno
// resolvido/não-resolvido (estilo Obsidian).
import { loadAllNotesMeta, getNoteById, obterTodosLinks } from './storage.js';
import { calcularBacklinks } from './links.js';
import { escHtml } from './blocks.js';
import { root } from './note-state.js';
import { getCurrentNoteId } from './note.js';

export const backlinksSection = document.getElementById('note-backlinks-section');
export const backlinksToggle  = document.getElementById('note-backlinks-toggle');
export const backlinksCountEl = document.getElementById('note-backlinks-count');
export const backlinksListEl  = document.getElementById('note-backlinks-list');
export const desktopBacklinksListEl = document.getElementById('note-desktop-backlinks-list');
export const desktopBacklinksCountEl = document.getElementById('note-desktop-backlinks-count');

let backlinksOpen = typeof localStorage !== 'undefined' ? localStorage.getItem('quickdock:backlinks:open') !== 'false' : true;

if (backlinksToggle && backlinksSection) {
  backlinksSection.classList.toggle('is-collapsed', !backlinksOpen);
  backlinksToggle.setAttribute('aria-expanded', backlinksOpen ? 'true' : 'false');
  backlinksToggle.addEventListener('click', () => {
    backlinksOpen = !backlinksOpen;
    try { localStorage.setItem('quickdock:backlinks:open', String(backlinksOpen)); } catch {}
    backlinksSection.classList.toggle('is-collapsed', !backlinksOpen);
    backlinksToggle.setAttribute('aria-expanded', backlinksOpen ? 'true' : 'false');
  });
}

// Marca link interno cujo título não bate com nenhuma nota existente —
// mesma distinção do Obsidian entre link resolvido e "unresolved" (é só uma
// menção, a nota referenciada ainda não existe).
export async function atualizarLinksInternos() {
  const links = root.querySelectorAll('a.note-internal-link');
  if (!links.length) return;
  let todasNotas;
  try {
    todasNotas = await loadAllNotesMeta();
  } catch {
    return;
  }
  const alvosExistentes = new Set();
  for (const n of todasNotas) {
    if (n.title) alvosExistentes.add(n.title.trim().toLowerCase());
    if (n.uid) alvosExistentes.add(n.uid.toLowerCase());
    const p = (n.pasta || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const t = (n.title || '').trim();
    if (p && t) alvosExistentes.add(`${p}/${t}`.toLowerCase());
  }

  links.forEach(a => {
    const rawAlvo = (a.dataset.notePath || a.dataset.noteTitle || a.textContent || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
    a.classList.toggle('is-unresolved', !alvosExistentes.has(rawAlvo));
  });
}

export async function refreshBacklinks(noteId = getCurrentNoteId()) {
  if (noteId == null) return;
  try {
    const note = await getNoteById(noteId);
    if (!note) {
      if (backlinksSection) backlinksSection.hidden = true;
      if (desktopBacklinksListEl) desktopBacklinksListEl.innerHTML = '';
      return;
    }

    const [todasNotas, todosLinks] = await Promise.all([
      loadAllNotesMeta(),
      obterTodosLinks()
    ]);

    const backlinks = calcularBacklinks(note, todasNotas, todosLinks);
    const countStr = String(backlinks.length);
    if (backlinksSection) backlinksSection.hidden = false;
    if (backlinksCountEl) backlinksCountEl.textContent = countStr;
    if (desktopBacklinksCountEl) desktopBacklinksCountEl.textContent = countStr;
    const mobileTabBadge = document.getElementById('mobile-tab-backlinks-count');
    if (mobileTabBadge) mobileTabBadge.textContent = countStr;

    const populateBacklinks = (containerEl) => {
      if (!containerEl) return;
      containerEl.innerHTML = '';
      if (backlinks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'backlinks-empty mobile-backlinks-empty';
        empty.textContent = 'Nenhuma outra nota menciona esta.';
        containerEl.appendChild(empty);
        return;
      }

      for (const bl of backlinks) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'backlink-item mobile-backlink-card';
        item.innerHTML = `
          <span class="backlink-icon material-symbols-rounded qd-icon">description</span>
          <span class="backlink-title mobile-backlink-title">${escHtml(bl.title)}</span>
          ${bl.pasta ? `<span class="backlink-folder mobile-backlink-folder">${escHtml(bl.pasta)}</span>` : ''}
        `;
        item.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
            detail: { id: bl.id }
          }));
          document.getElementById('mobileRightDrawer')?.classList.remove('is-open-mobile');
          const scrim = document.getElementById('mobileDrawerScrim');
          const leftOpen = document.getElementById('mAside')?.classList.contains('is-open-mobile');
          if (!leftOpen && scrim) scrim.classList.remove('is-active');
        });
        containerEl.appendChild(item);
      }
    };

    populateBacklinks(backlinksListEl);
    populateBacklinks(desktopBacklinksListEl);
    populateBacklinks(document.getElementById('mobile-backlinks-container'));
  } catch (err) {
    console.warn('Erro ao carregar backlinks:', err);
  }
}
