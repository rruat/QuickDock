// ── bases-feed-view.js ──────────────────────────────────────────────────────
// View "Feed": coluna vertical de cartões COM o conteúdo da nota (somente leitura, o mesmo
// render dos cartões do Espaço — board/board-note-render.js). O conteúdo só é carregado
// quando o cartão chega perto da tela (IntersectionObserver), então 100 notas rolam leve.

import { getNotePropertyValue } from './bases-engine.js';
import { getViewProps } from './config/view-model.js';
import { formatPropertyValue } from './bases-schema.js';
import { renderGrouped } from './ui/grouped-sections.js';
import { renderNoteBlocks } from '../board/board-note-render.js';
import { urlDoArquivo } from '../board/board-media.js';
import { parseMarkdownToBlocks } from '../blocks.js';
import { getNoteById, loadFileBlob } from '../storage.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/** Altura máxima do corpo (em linhas de texto) aceita pela view. */
export function feedMaxLines(view) {
  const n = Number(view?.card?.maxLines);
  return Number.isFinite(n) ? Math.min(60, Math.max(3, Math.round(n))) : 14;
}

async function hidratar(corpo, noteId) {
  try {
    const nota = await getNoteById(noteId);
    // blocos salvos; se vierem vazios (nota criada só com `content`, ex.: importação), usa o texto
    const vazios = !nota?.blocks?.length || nota.blocks.every(b => b?.type === 'paragraph' && !String(b.html ?? '').trim());
    const blocos = vazios && nota?.content?.trim() ? parseMarkdownToBlocks(nota.content) : (nota?.blocks ?? []);
    if (!corpo.isConnected) return;
    if (!blocos.length) { corpo.replaceChildren(el('p', 'bfeed-empty', 'Nota sem conteúdo.')); return; }
    renderNoteBlocks(corpo, blocos, { urlDoArquivo: id => urlDoArquivo(id, loadFileBlob) });
    // só oferece "ver mais" se o conteúdo realmente passa do limite
    requestAnimationFrame(() => {
      const card = corpo.closest('.bfeed-card');
      if (card && corpo.scrollHeight > corpo.clientHeight + 4) card.classList.add('is-clipped');
    });
  } catch (err) {
    console.warn('Feed: erro ao renderizar a nota', err);
    corpo.replaceChildren(el('p', 'bfeed-empty', 'Não foi possível carregar o conteúdo.'));
  }
}

export function renderBaseFeedView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container._feedCleanup?.();
  container.className = 'base-view-container base-feed-container';
  container.replaceChildren();

  const linhas = feedMaxLines(viewConfig);
  const props = getViewProps(viewConfig).filter(p => p !== 'title');
  const lista = el('div', 'bfeed-list');
  lista.style.setProperty('--bfeed-lines', String(linhas));
  container.appendChild(lista);

  const observador = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        observador.unobserve(e.target);
        hidratar(e.target.querySelector('.bfeed-body'), e.target._noteId);   // id original (número), não o texto do dataset
      }
    }, { root: null, rootMargin: '400px 0px' })
    : null;
  container._feedCleanup = () => { observador?.disconnect(); container._feedCleanup = null; };

  const desenha = (box, itens) => {
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
      if (observador) observador.observe(card); else hidratar(corpo, note.id);
    }
  };

  if (!notes.length) { lista.appendChild(el('p', 'bfeed-empty', 'Nenhuma nota para exibir.')); return; }
  renderGrouped(lista, { notes, schema, view: viewConfig }, desenha, callbacks.onUpdateView);
}
