// ── note-toc.js ─────────────────────────────────────────────────────────────
// Bloco de SUMÁRIO dentro da nota.
//  • Automático: a lista acompanha os títulos da nota (níveis e numeração 1, 1.1, 1.1.1 à escolha).
//  • Manual: a lista é da pessoa — escolhe, renomeia, recua e acrescenta itens; não muda sozinha.
// No arquivo é uma lista de links entre <!-- toc --> e <!-- /toc --> (ver blocks.js), que outros apps
// mostram como lista comum. Aqui só mora a interface do bloco; as entradas vêm de `tocEntries` (blocks.js).

import { tocEntries, TOC_DEFAULT_LEVELS, escHtml } from '../blocks.js';

let cb = {
  captureUndoPoint: () => {}, scheduleSave: () => {},
  getHeadings: () => [],        // [{ nivel, texto }] da nota aberta, na ordem
  goToHeading: () => {},        // (slug)
};
export function initNoteToc(callbacks) { cb = { ...cb, ...callbacks }; }

const TITULO_PADRAO = 'Sumário';

// ── Dados do bloco (ficam em atributos: o desfazer restaura por innerHTML e só atributo volta junto) ──
export function getTocData(el) {
  const d = el.dataset;
  let items = [];
  try { items = JSON.parse(d.items || '[]'); } catch { items = []; }
  return {
    mode: d.mode === 'manual' ? 'manual' : 'auto',
    levels: Math.min(6, Math.max(1, Number(d.levels) || TOC_DEFAULT_LEVELS)),
    numbered: d.numbered === 'true',
    title: d.title ?? TITULO_PADRAO,
    items,
  };
}

export function setTocData(el, data = {}) {
  const d = el.dataset;
  d.mode = data.mode === 'manual' ? 'manual' : 'auto';
  d.levels = String(Math.min(6, Math.max(1, Number(data.levels) || TOC_DEFAULT_LEVELS)));
  if (data.numbered) d.numbered = 'true'; else delete d.numbered;
  d.title = data.title ?? TITULO_PADRAO;
  if (Array.isArray(data.items) && data.items.length) d.items = JSON.stringify(data.items); else delete d.items;
  paint(el);
}

// Entradas que o bloco mostra agora (automático: dos títulos vivos da nota)
function entradas(el) {
  const data = getTocData(el);
  const lista = cb.getHeadings().map(h => ({ type: `heading${h.nivel}`, html: escHtml(h.texto) }));
  return tocEntries({ mode: data.mode, levels: data.levels, numbered: data.numbered, items: data.items }, lista);
}

// ── Montagem ────────────────────────────────────────────────────────────────
export function buildToc() {
  const el = document.createElement('div');
  el.className = 'block block-toc';
  el.contentEditable = 'false';
  el.innerHTML = `<div class="toc-head"><input type="text" class="toc-title" aria-label="Título do sumário" spellcheck="false" placeholder="Sem título"><span class="toc-badge"></span></div><div class="toc-tools"><div class="toc-seg" role="group" aria-label="Tipo de sumário"><button type="button" data-toc-mode="auto" title="Acompanha os títulos da nota">Automático</button><button type="button" data-toc-mode="manual" title="A lista é sua: escolha, renomeie e acrescente itens">Manual</button></div><label class="toc-opt toc-opt-auto">Níveis<select data-toc-levels aria-label="Níveis de título no sumário">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">até ${n}</option>`).join('')}</select></label><label class="toc-opt toc-opt-auto"><input type="checkbox" data-toc-numbered> Numerar (1, 1.1…)</label><button type="button" class="toc-link-btn toc-opt-manual" data-toc-reset title="Refaz a lista a partir dos títulos da nota">Atualizar dos títulos</button></div><div class="toc-list" role="navigation" aria-label="Sumário"></div><div class="toc-foot toc-opt-manual"><button type="button" class="toc-link-btn" data-toc-add>+ Adicionar item</button></div>`;  setTocData(el, { mode: 'auto', levels: TOC_DEFAULT_LEVELS, title: TITULO_PADRAO });
  ligar(el);
  return el;
}

function ligar(el) {
  const mudar = (fn) => { cb.captureUndoPoint(); fn(getTocData(el)); cb.scheduleSave(); };
  const regravar = (data) => setTocData(el, data);

  el.addEventListener('mousedown', e => { if (e.target.closest('button, select')) e.stopPropagation(); });
  el.querySelector('.toc-title').addEventListener('input', e => { el.dataset.title = e.target.value; cb.scheduleSave(); });
  el.querySelector('.toc-title').addEventListener('focus', () => cb.captureUndoPoint());

  el.addEventListener('click', e => {
    const modo = e.target.closest('[data-toc-mode]');
    if (modo) {
      mudar(d => {
        // ao virar manual, a lista de agora vira os itens (um ponto de partida para editar)
        if (modo.dataset.tocMode === 'manual' && d.mode !== 'manual' && !d.items.length) d.items = entradas(el).map(({ text, level, slug }) => ({ text, level, slug }));
        regravar({ ...d, mode: modo.dataset.tocMode });
      });
      return;
    }
    if (e.target.closest('[data-toc-reset]')) {
      mudar(d => regravar({ ...d, items: cb.getHeadings().length
        ? tocEntries({ mode: 'auto', levels: 6, numbered: false }, cb.getHeadings().map(h => ({ type: `heading${h.nivel}`, html: escHtml(h.texto) }))).map(({ text, level, slug }) => ({ text, level, slug }))
        : [] }));
      return;
    }
    if (e.target.closest('[data-toc-add]')) {
      mudar(d => regravar({ ...d, items: [...d.items, { text: 'Novo item', level: 1 }] }));
      return;
    }
    const linha = e.target.closest('[data-toc-row]');
    if (linha) {
      const i = Number(linha.dataset.tocRow);
      if (e.target.closest('[data-toc-del]'))  { mudar(d => regravar({ ...d, items: d.items.filter((_, k) => k !== i) })); return; }
      if (e.target.closest('[data-toc-out]'))  { mudar(d => regravar({ ...d, items: d.items.map((it, k) => k === i ? { ...it, level: Math.max(1, (it.level || 1) - 1) } : it) })); return; }
      if (e.target.closest('[data-toc-in]'))   { mudar(d => regravar({ ...d, items: d.items.map((it, k) => k === i ? { ...it, level: Math.min(6, (it.level || 1) + 1) } : it) })); return; }
    }
    const alvo = e.target.closest('[data-toc-go]');
    if (alvo?.dataset.tocGo) cb.goToHeading(alvo.dataset.tocGo);
  });

  el.addEventListener('change', e => {
    if (e.target.matches('[data-toc-levels]')) mudar(d => regravar({ ...d, levels: Number(e.target.value) }));
    else if (e.target.matches('[data-toc-numbered]')) mudar(d => regravar({ ...d, numbered: e.target.checked }));
    else if (e.target.matches('[data-toc-text]')) {
      const i = Number(e.target.closest('[data-toc-row]').dataset.tocRow);
      mudar(d => regravar({ ...d, items: d.items.map((it, k) => k === i ? { ...it, text: e.target.value } : it) }));
    }
  });
}

// ── Desenho ─────────────────────────────────────────────────────────────────
function paint(el) {
  const data = getTocData(el);
  el.classList.toggle('is-manual', data.mode === 'manual');
  const titulo = el.querySelector('.toc-title');
  if (titulo && document.activeElement !== titulo) titulo.value = data.title;
  el.querySelectorAll('[data-toc-mode]').forEach(b => b.classList.toggle('active', b.dataset.tocMode === data.mode));
  const lv = el.querySelector('[data-toc-levels]'); if (lv) lv.value = String(data.levels);
  const nm = el.querySelector('[data-toc-numbered]'); if (nm) nm.checked = data.numbered;
  const badge = el.querySelector('.toc-badge'); if (badge) badge.textContent = data.mode === 'manual' ? 'manual' : 'automático';
  paintList(el, data);
}

function paintList(el, data = getTocData(el)) {
  const lista = el.querySelector('.toc-list');
  if (!lista) return;
  // quem está digitando num item manual não pode perder o foco por um redesenho
  if (data.mode === 'manual' && lista.contains(document.activeElement)) return;
  const itens = entradas(el);
  lista.replaceChildren();
  if (!itens.length) {
    const vazio = document.createElement('div');
    vazio.className = 'toc-empty';
    vazio.textContent = data.mode === 'manual' ? 'Nenhum item. Use "Adicionar item" ou "Atualizar dos títulos".' : 'Nenhum título na nota ainda (use # Título).';
    lista.appendChild(vazio);
    return;
  }
  const base = Math.min(...itens.map(i => i.level));
  itens.forEach((it, i) => {
    const linha = document.createElement('div');
    linha.className = `toc-row toc-level-${Math.min(6, it.level - base + 1)}`;
    linha.dataset.tocRow = String(i);
    linha.style.paddingLeft = `${(it.level - base) * 18}px`;
    if (data.mode === 'manual') {
      linha.innerHTML = `<input type="text" data-toc-text aria-label="Texto do item" value="${escHtml(it.text)}">
        <button type="button" data-toc-out title="Menos recuo" aria-label="Menos recuo">‹</button>
        <button type="button" data-toc-in title="Mais recuo" aria-label="Mais recuo">›</button>
        <button type="button" data-toc-del title="Remover" aria-label="Remover item">×</button>`;
    } else {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'toc-item';
      a.dataset.tocGo = it.slug || '';
      a.textContent = it.text;
      linha.appendChild(a);
    }
    lista.appendChild(linha);
  });
}

/** Refaz a lista de todos os sumários da nota (chamado quando os títulos mudam). */
export function refreshTocBlocks(raiz) {
  raiz?.querySelectorAll?.(':scope > .block-toc').forEach(el => paintList(el));
}
