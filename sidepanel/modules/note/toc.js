// Sumário (bloco "toc"): lista automática dos títulos da nota, com até o nível 3.
// As entradas vêm de tocEntries() do blocks.js (mesma regra da versão desktop).
// Não é editável: o sumário acompanha os títulos e é reconstruído ao salvar e
// ao abrir a nota. Clicar numa entrada leva ao título correspondente.
import { tocEntries } from '../blocks.js';
import { serializeBlocks } from './save.js';
import { root } from './state.js';

const TOC_LEVELS = 3;

export function renderToc(el, lista = serializeBlocks()) {
  const entradas = tocEntries({ mode: 'auto', levels: TOC_LEVELS, numbered: false }, lista);
  const base = entradas.length ? Math.min(...entradas.map(e => e.level)) : 1;

  el.replaceChildren();
  if (!entradas.length) {
    const vazio = document.createElement('div');
    vazio.className = 'block-toc-empty';
    vazio.textContent = 'Sumário: os títulos da nota aparecem aqui.';
    el.appendChild(vazio);
    return;
  }

  const lista_el = document.createElement('ul');
  lista_el.className = 'block-toc-list';
  for (const e of entradas) {
    const li = document.createElement('li');
    li.className = 'block-toc-item';
    li.style.paddingLeft = `${(e.level - base) * 14}px`;
    li.textContent = e.text;
    li.dataset.text = e.text;
    lista_el.appendChild(li);
  }
  el.appendChild(lista_el);
}

// Atualiza todos os sumários da nota (chamado ao salvar e ao montar a nota).
export function refreshTocs() {
  const tocs = root.querySelectorAll(':scope > .block-toc');
  if (tocs.length === 0) return;
  const lista = serializeBlocks();
  for (const el of tocs) renderToc(el, lista);
}

root.addEventListener('click', e => {
  const item = e.target.closest('.block-toc-item');
  if (!item) return;
  const alvo = [...root.children].find(b =>
    /^heading[1-6]$/.test(b.dataset.type || '') && b.textContent.trim() === item.dataset.text);
  alvo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
