// ── bases-feed-view.js ──────────────────────────────────────────────────────
// View "Feed": coluna vertical de cartões COM o conteúdo da nota (somente leitura, o mesmo
// render dos cartões do Espaço — board/board-note-render.js). O conteúdo só é carregado
// quando o cartão chega perto da tela (IntersectionObserver), então 100 notas rolam leve.

import { getNotePropertyValue } from './bases-engine.js';
import { getViewProps } from './config/view-model.js';
import { formatPropertyValue } from './bases-schema.js';
import { renderGrouped } from './ui/grouped-sections.js';
import { enableReorder } from './ui/reorder.js';
import { hydrateNoteContent, lazyHydrate } from './note-preview.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/** Altura máxima do corpo (em linhas de texto) aceita pela view. */
export function feedMaxLines(view) {
  const n = Number(view?.card?.maxLines);
  return Number.isFinite(n) ? Math.min(60, Math.max(3, Math.round(n))) : 14;
}

// só oferece "ver mais" se o conteúdo realmente passa do limite
const marcaSeCortado = corpo => {
  const card = corpo.closest('.bfeed-card');
  if (card && corpo.scrollHeight > corpo.clientHeight + 4) card.classList.add('is-clipped');
};

export function renderBaseFeedView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container._feedCleanup?.();
  container.className = 'base-view-container base-feed-container';
  container.replaceChildren();

  const linhas = feedMaxLines(viewConfig);
  const props = getViewProps(viewConfig).filter(p => p !== 'title');
  const lista = el('div', 'bfeed-list');
  lista.style.setProperty('--bfeed-lines', String(linhas));
  container.appendChild(lista);

  const lazy = lazyHydrate(card => hydrateNoteContent(card.querySelector('.bfeed-body'), card._noteId, marcaSeCortado));
  container._feedCleanup = () => { lazy.disconnect(); container._feedCleanup = null; };

  const desenha = (box, itens, escopo) => {
    for (const note of itens) {
      const card = el('article', 'bfeed-card');
      card.dataset.noteId = note.id;
      card._noteId = note.id;
      const tom = callbacks.rowTone?.(note);
      if (tom) card.classList.add(`tone-${tom}`);

      const cab = el('header', 'bfeed-head');
      const titulo = el('a', 'bfeed-title', note.title || 'Sem título');
      titulo.href = '#';
      titulo.addEventListener('click', e => { e.preventDefault(); callbacks.onOpenNote?.(note.id); });
      cab.appendChild(titulo);
      const meta = el('div', 'bfeed-meta');
      for (const p of props) {
        const v = getNotePropertyValue(note, p);
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
        const f = formatPropertyValue(v, schema[p]?.type, schema[p]);
        const texto = Array.isArray(f) ? f.join(', ') : (typeof f === 'string' || typeof f === 'number') ? String(f) : f === true ? 'Sim' : String(v);
        const chip = el('span', 'bfeed-prop');
        chip.append(el('span', 'bfeed-prop-name', schema[p]?.label || p), document.createTextNode(` ${texto}`));
        meta.appendChild(chip);
      }
      if (meta.children.length) cab.appendChild(meta);
      card.appendChild(cab);

      const corpo = el('div', 'bfeed-body');
      corpo.appendChild(el('p', 'bfeed-loading', 'Carregando…'));
      card.appendChild(corpo);

      const mais = el('button', 'bfeed-more', 'Ver mais');
      mais.type = 'button';
      mais.setAttribute('aria-expanded', 'false');
      mais.addEventListener('click', () => {
        const aberto = card.classList.toggle('is-expanded');
        mais.textContent = aberto ? 'Ver menos' : 'Ver mais';
        mais.setAttribute('aria-expanded', String(aberto));
      });
      card.appendChild(mais);

      box.appendChild(card);
      lazy.observe(card);
    }
    enableReorder(box, { itemSelector: '.bfeed-card[data-note-id]', scope: escopo, view: viewConfig, onViewChange: callbacks.onUpdateView });
  };

  if (!notes.length) { lista.appendChild(el('p', 'bfeed-empty', 'Nenhuma nota para exibir.')); return; }
  renderGrouped(lista, { notes, schema, view: viewConfig }, desenha, callbacks.onUpdateView);
}
