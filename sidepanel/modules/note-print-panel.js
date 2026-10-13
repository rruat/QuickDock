// ── note-print-panel.js ─────────────────────────────────────────────────────
// Painel de configurações do modo de impressão, no mesmo padrão dos painéis da aside direita
// (grupos com título, bordas e cores da própria aside). O note-print.js liga os eventos pelos ids
// e `data-` daqui: #note-print-selected-count, #btn-print-select-toggle, #btn-print-confirm,
// #btn-print-exit e [data-orientation].

import { buildMarginControls } from './note-print-margins.js';
import { buildTextControls } from './note-print-text.js';

function grupo(titulo, ...filhos) {
  const g = document.createElement('section');
  g.className = 'aside-panel-group print-group';
  if (titulo) {
    const h = document.createElement('h4');
    h.textContent = titulo;
    g.appendChild(h);
  }
  g.append(...filhos);
  return g;
}

/** Grupos Margens e Texto (usados no painel da aside e, recolhidos, na barra do celular). */
export function buildPageAndTextGroups({ margins, text, onMargins, onText }) {
  return [
    grupo('Margens', buildMarginControls(margins, onMargins)),
    grupo('Texto', buildTextControls(text, onText)),
  ];
}

/** Painel completo (desktop). */
export function buildPrintPanel({ orientation, margins, text, onMargins, onText }) {
  const el = document.createElement('div');
  el.id = 'note-print-toolbar';
  el.className = 'note-print-panel';

  const cab = document.createElement('div');
  cab.className = 'aside-panel-group print-group print-head';
  cab.innerHTML = `
    <div class="print-head-row">
      <span class="material-symbols-rounded print-head-icon" aria-hidden="true">print</span>
      <div class="print-head-info">
        <strong>Imprimir</strong>
        <span id="note-print-selected-count">Carregando blocos...</span>
      </div>
      <button type="button" class="icon-btn" id="btn-print-exit" title="Sair do modo de impressão (Esc)" aria-label="Sair">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>`;

  const orient = document.createElement('div');
  orient.className = 'aside-panel-segmented print-orientation';
  orient.setAttribute('role', 'tablist');
  orient.setAttribute('aria-label', 'Orientação do papel');
  orient.innerHTML = `
    <button type="button" data-orientation="portrait" title="Retrato (vertical)"><span class="material-symbols-rounded">crop_portrait</span> Retrato</button>
    <button type="button" data-orientation="landscape" title="Paisagem (horizontal)"><span class="material-symbols-rounded">crop_landscape</span> Paisagem</button>`;
  orient.querySelectorAll('button').forEach(b => {
    const ativo = b.dataset.orientation === orientation;
    b.classList.toggle('active', ativo);
    b.classList.toggle('is-active', ativo);
  });

  const selecao = document.createElement('div');
  selecao.innerHTML = `
    <button type="button" class="aside-panel-btn btn-print-select-toggle" id="btn-print-select-toggle" title="Alternar seleção de todos os blocos">
      <span class="material-symbols-rounded" aria-hidden="true">checklist</span>
      <span class="btn-toggle-label">Desmarcar Todos</span>
    </button>`;

  const rodape = document.createElement('div');
  rodape.className = 'aside-panel-group print-group print-foot';
  rodape.innerHTML = `
    <button type="button" class="aside-panel-btn is-primary" id="btn-print-confirm" title="Imprimir ou salvar em PDF os blocos selecionados">
      <span class="material-symbols-rounded" aria-hidden="true">print</span><span>Imprimir / Salvar PDF</span>
    </button>`;

  el.append(
    cab,
    grupo('Página', orient),
    ...buildPageAndTextGroups({ margins, text, onMargins, onText }),
    grupo('Seleção', ...selecao.children),
    rodape,
  );
  return el;
}
