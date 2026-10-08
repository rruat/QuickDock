// ── shell-graph-panel.js ────────────────────────────────────────────────────
// Modo CONSTELAÇÕES da aside direita (padrão do mockup): o grafo de conexões deixa de ser
// uma tela e passa a morar na aside. Como o graph-view.js acha seus elementos por id, o próprio
// contêiner do canvas é MOVIDO para a aside enquanto o modo está ativo e volta ao lugar ao sair
// (mesmo padrão de shell-note-panel.js). Os nós do grafo são as notas e abrir um nó dispara
// `quickdock:activate-note`, o mesmo caminho de abrir uma nota da Base.

import { ensureGraphQuickbar, hideGraphQuickbar } from './shell-graph-quickbar.js';

const GRAPH_ID = 'graph-canvas-container';
let origin = null; // { parent, next }

/** Move o grafo para dentro de `host` e manda recarregar/redesenhar com o novo tamanho. */
export function showGraphPanel(host) {
  const el = document.getElementById(GRAPH_ID);
  if (!host || !el) return;
  host.hidden = false;
  ensureGraphQuickbar(el); // barra flutuante no rodapé do grafo
  if (el.parentElement !== host) {
    if (!origin) origin = { parent: el.parentElement, next: el.nextSibling };
    host.appendChild(el);
    document.dispatchEvent(new CustomEvent('quickdock:refresh-graph-view'));
  }
}

/** Devolve o grafo ao lugar de origem (a tela antiga, oculta). */
export function hideGraphPanel(host) {
  if (host) host.hidden = true;
  hideGraphQuickbar();
  const el = document.getElementById(GRAPH_ID);
  if (!origin || !el || el.parentElement !== host) return;
  if (origin.next && origin.next.parentNode === origin.parent) origin.parent.insertBefore(el, origin.next);
  else origin.parent.appendChild(el);
  origin = null;
}
