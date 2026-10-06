// ── note-peek.js ────────────────────────────────────────────────────────────
// "Abrir em" prévia lateral/central: mostra a nota (título, propriedades e conteúdo) SEM trocar a
// nota ativa do editor. É uma prévia SOMENTE LEITURA, de propósito: o editor é um só e um painel
// que o tomasse emprestado tiraria do ar o bloco da própria Base que está na tela. "Abrir nota"
// leva para o editor de verdade.

import { hydrateNoteContent } from '../note-preview.js';
import { getNotePropertyValue } from '../bases-engine.js';
import { formatPropertyValue } from '../bases-schema.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/** @param {HTMLElement} raiz  elemento da Base (a prévia se ancora nele) */
export function createNotePeek(raiz, { onOpenNote }) {
  let aberto = null;   // { overlay, onKey }

  function fechar() {
    if (!aberto) return;
    document.removeEventListener('keydown', aberto.onKey, true);
    aberto.overlay.remove();
    raiz.classList.remove('has-peek');
    aberto = null;
  }

  /**
   * @param {Object} note  nota (metadados) a mostrar
   * @param {'peek-side'|'peek-center'} modo
   * @param {{ schema:Object, props:string[] }} ctx  propriedades a listar
   */
  function abrir(note, modo, { schema = {}, props = [] } = {}) {
    fechar();
    const overlay = el('div', `base-peek base-${modo}`);
    const painel = el('aside', 'base-peek-panel');
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-label', `Prévia de ${note.title || 'nota'}`);

    const cab = el('header', 'base-peek-head');
    cab.appendChild(el('h3', 'base-peek-title', note.title || 'Sem título'));
    const abrirBtn = el('button', 'bset-btn', 'Abrir nota'); abrirBtn.type = 'button';
    abrirBtn.addEventListener('click', () => { fechar(); onOpenNote?.(note.id); });
    const x = el('button', 'bset-close'); x.type = 'button'; x.title = 'Fechar'; x.setAttribute('aria-label', 'Fechar prévia');
    x.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">close</span>';
    x.addEventListener('click', fechar);
    cab.append(abrirBtn, x);
    painel.appendChild(cab);

    const lista = el('dl', 'base-peek-props');
    for (const p of props.filter(k => k !== 'title')) {
      const v = getNotePropertyValue(note, p);
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
      const f = formatPropertyValue(v, schema[p]?.type, schema[p]);
      const texto = Array.isArray(f) ? f.join(', ') : typeof f === 'string' ? f : f === true ? 'Sim' : (f && typeof f === 'object' && 'alias' in f) ? f.alias : String(v);
      lista.append(el('dt', '', schema[p]?.label || p), el('dd', '', texto));
    }
    if (lista.children.length) painel.appendChild(lista);

    const corpo = el('div', 'base-peek-body');
    corpo.appendChild(el('p', 'bfeed-loading', 'Carregando…'));
    painel.appendChild(corpo);
    overlay.appendChild(painel);
    // clicar fora fecha (no modo central; no lateral a Base continua usável)
    overlay.addEventListener('mousedown', e => { if (e.target === overlay && modo === 'peek-center') fechar(); });
    raiz.appendChild(overlay);
    raiz.classList.add('has-peek');

    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', onKey, true);
    aberto = { overlay, onKey };
    hydrateNoteContent(corpo, note.id);
    x.focus();
  }

  return { abrir, fechar, isOpen: () => aberto !== null };
}
