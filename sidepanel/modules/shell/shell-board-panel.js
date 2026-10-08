// ── shell-board-panel.js ────────────────────────────────────────────────────
// Painel do QUADRO na aside direita (padrão do mockup): propriedades, fundo, zoom e ações do
// espaço infinito aberto. Só lê e ajusta o motor do quadro (board-engine.js) pelas funções
// exportadas dele; nenhum elemento do motor é tocado aqui.

import {
  getBoardSummary, updateBoardMeta, setBoardBgMode, setBoardZoomTo, fitBoardView, removeBoard, exportBoardAsJSON,
} from '../board-engine.js';
import { escapeHtml } from './shell-views.js';

const BG_MODES = [['stars', 'Estrelas'], ['dots', 'Pontos'], ['none', 'Liso']];

let host = null;
let bound = false;

/** Desenha o painel dentro de `hostEl` com o estado atual do quadro aberto. */
export function renderBoardPanel(hostEl) {
  host = hostEl;
  const b = getBoardSummary();
  if (!b) {
    host.innerHTML = '<div class="aside-panel-empty">Nenhum quadro aberto.</div>';
    return;
  }
  const pct = Math.round(b.zoom * 100);
  host.innerHTML = `
    <div class="aside-panel-group">
      <h4>Propriedades do quadro</h4>
      <label class="aside-panel-field"><span>Nome</span>
        <input type="text" data-board-field="title" value="${escapeHtml(b.title)}" spellcheck="false" autocomplete="off" />
      </label>
      <label class="aside-panel-field"><span>Pasta</span>
        <input type="text" data-board-field="pasta" value="${escapeHtml(b.pasta)}" placeholder="Sem pasta" spellcheck="false" autocomplete="off" />
      </label>
      <div class="aside-panel-row"><span>Tipo</span><strong><span class="material-symbols-rounded">space_dashboard</span> Quadro</strong></div>
      <div class="aside-panel-row"><span>Conteúdo</span><strong>${b.cards} cartões • ${b.arrows} conexões</strong></div>
    </div>
    <div class="aside-panel-group">
      <h4>Fundo e zoom</h4>
      <div class="aside-panel-segmented" data-board-bg>
        ${BG_MODES.map(([m, label]) => `<button type="button" data-bg="${m}" class="${b.bgMode === m ? 'is-active' : ''}">${label}</button>`).join('')}
      </div>
      <label class="aside-panel-field aside-panel-range"><span>Zoom <b data-board-zoom-label>${pct}%</b></span>
        <input type="range" min="20" max="250" value="${Math.min(250, Math.max(20, pct))}" data-board-zoom />
      </label>
      <button type="button" class="aside-panel-btn" data-board-fit><span class="material-symbols-rounded">fit_screen</span> Encaixar tudo</button>
    </div>
    <div class="aside-panel-group">
      <h4>Ações</h4>
      <button type="button" class="aside-panel-btn" data-board-export><span class="material-symbols-rounded">download</span> Exportar JSON</button>
      <button type="button" class="aside-panel-btn is-danger" data-board-delete><span class="material-symbols-rounded">delete</span> Excluir quadro</button>
    </div>`;
  bind();
}

function bind() {
  if (bound || !host) return;
  bound = true;

  host.addEventListener('change', (e) => {
    const field = e.target.closest('[data-board-field]');
    const b = getBoardSummary();
    if (field && b) updateBoardMeta(b.uid, { [field.dataset.boardField]: field.value.trim() || (field.dataset.boardField === 'title' ? 'Quadro sem título' : '') });
  });

  host.addEventListener('input', (e) => {
    if (!e.target.matches('[data-board-zoom]')) return;
    setBoardZoomTo(Number(e.target.value) / 100);
    host.querySelector('[data-board-zoom-label]').textContent = `${e.target.value}%`;
  });

  host.addEventListener('click', async (e) => {
    const bg = e.target.closest('[data-bg]');
    if (bg) {
      setBoardBgMode(bg.dataset.bg);
      host.querySelectorAll('[data-board-bg] button').forEach(x => x.classList.toggle('is-active', x === bg));
      return;
    }
    if (e.target.closest('[data-board-fit]')) { fitBoardView(); refreshZoom(); return; }
    if (e.target.closest('[data-board-export]')) { exportBoardAsJSON(); return; }
    if (e.target.closest('[data-board-delete]')) {
      const b = getBoardSummary();
      if (b && window.confirm(`Excluir o quadro "${b.title}"? Isso não pode ser desfeito.`)) {
        await removeBoard(b.uid);
        document.dispatchEvent(new CustomEvent('quickdock:open-view', { detail: { view: 'bases' } }));
      }
    }
  });

  // o quadro mudou (trocou de quadro, renomeou): redesenha
  document.addEventListener('quickdock:board-changed', () => { if (host && !host.hidden) renderBoardPanel(host); });
}

function refreshZoom() {
  const b = getBoardSummary();
  const range = host?.querySelector('[data-board-zoom]');
  if (!b || !range) return;
  const pct = Math.round(b.zoom * 100);
  range.value = String(Math.min(250, Math.max(20, pct)));
  host.querySelector('[data-board-zoom-label]').textContent = `${pct}%`;
}
