// ── note-preview.js ─────────────────────────────────────────────────────────
// Prévia SOMENTE LEITURA do conteúdo de uma nota (mesmo render dos cartões do Espaço), com
// carregamento preguiçoso. Usada pelo Feed e pela Galeria (preview: content).

import { renderNoteBlocks } from '../board/board-note-render.js';
import { urlDoArquivo } from '../board/board-media.js';
import { parseMarkdownToBlocks } from '../blocks.js';
import { getNoteById, loadFileBlob } from '../storage.js';

const vazioTexto = (el, cls, txt) => { const p = document.createElement('p'); p.className = cls; p.textContent = txt; el.replaceChildren(p); };

/** Preenche `corpo` com os blocos da nota. `noteId` precisa ser o id ORIGINAL (número), não o texto do dataset. */
export async function hydrateNoteContent(corpo, noteId, onRendered) {
  try {
    const nota = await getNoteById(noteId);
    // blocos salvos; se vierem vazios (nota criada só com `content`, ex.: importação), usa o texto
    const vazios = !nota?.blocks?.length || nota.blocks.every(b => b?.type === 'paragraph' && !String(b.html ?? '').trim());
    const blocos = vazios && nota?.content?.trim() ? parseMarkdownToBlocks(nota.content) : (nota?.blocks ?? []);
    if (!corpo.isConnected) return;
    if (!blocos.length) { vazioTexto(corpo, 'bfeed-empty', 'Nota sem conteúdo.'); return; }
    renderNoteBlocks(corpo, blocos, { urlDoArquivo: id => urlDoArquivo(id, loadFileBlob) });
    if (onRendered) requestAnimationFrame(() => onRendered(corpo));
  } catch (err) {
    console.warn('Prévia: erro ao renderizar a nota', err);
    vazioTexto(corpo, 'bfeed-empty', 'Não foi possível carregar o conteúdo.');
  }
}

/** Observa elementos e chama `hidrata(el)` uma vez quando chegam perto da tela (sem IO, hidrata já). */
export function lazyHydrate(hidrata, { margem = '400px 0px' } = {}) {
  if (typeof IntersectionObserver !== 'function') return { observe: el => hidrata(el), disconnect() {} };
  const obs = new IntersectionObserver(es => {
    for (const e of es) { if (e.isIntersecting) { obs.unobserve(e.target); hidrata(e.target); } }
  }, { rootMargin: margem });
  return { observe: el => obs.observe(el), disconnect: () => obs.disconnect() };
}
