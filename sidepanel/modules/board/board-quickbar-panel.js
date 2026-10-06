// ── board-quickbar-panel.js ─────────────────────────────────────────────────
// Painel expansível da quickbar do espaço: em vez de menus soltos flutuando
// por cima do canvas, a barra cresce pra cima e mostra as opções da
// ferramenta escolhida (Inserir, Fluxo, Organizar, Pulse…), no mesmo bloco.
//
// Cada ferramenta entrega só um `render(body, api)`; este módulo cuida do
// cabeçalho (título + fechar), da animação, do botão ativo e de trocar de
// painel sem fechar a barra. O markup base (#board-quickbar-panel) vive nos
// HTMLs, dentro do <nav id="board-quickbar">.

const CLOSE_DELAY = 240; // ms — mesma duração da transição em board/style.css

let current = null; // { id, anchor }
let clearTimer = null;

function panelEl() {
  return document.getElementById('board-quickbar-panel');
}

function setAnchorState(anchor, on) {
  if (!anchor) return;
  anchor.classList.toggle('panel-open', on);
  anchor.setAttribute('aria-expanded', String(on));
}

export function getOpenPanelId() {
  return current?.id ?? null;
}

export function closeQuickbarPanel() {
  const panel = panelEl();
  if (!panel || !current) return;
  setAnchorState(current.anchor, false);
  current = null;
  panel.classList.remove('is-open');
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (!current) panel.querySelector('.board-qbp-inner')?.replaceChildren();
  }, CLOSE_DELAY);
}

/**
 * Abre (ou troca o conteúdo de) o painel.
 * @param {string} id  identifica o painel (pra alternar com o mesmo botão)
 * @param {{ title:string, icon?:string, anchor?:HTMLElement,
 *           render:(body:HTMLElement, api:{close:()=>void, open:typeof openQuickbarPanel})=>void }} opts
 */
export function openQuickbarPanel(id, { title, icon = '', anchor = null, render }) {
  const panel = panelEl();
  if (!panel) return;
  clearTimeout(clearTimer);
  if (current && current.anchor !== anchor) setAnchorState(current.anchor, false);

  const inner = panel.querySelector('.board-qbp-inner');
  const content = document.createElement('div');
  content.className = 'board-qbp-content';

  const head = document.createElement('div');
  head.className = 'board-qbp-head';
  if (icon) {
    const i = document.createElement('span');
    i.className = 'qd-icon material-symbols-rounded board-qbp-icon';
    i.textContent = icon;
    head.appendChild(i);
  }
  const t = document.createElement('span');
  t.className = 'board-qbp-title';
  t.textContent = title;
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'board-qbp-close';
  x.title = 'Fechar (Esc)';
  x.setAttribute('aria-label', 'Fechar painel');
  x.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">expand_more</span>';
  x.addEventListener('click', closeQuickbarPanel);
  head.append(t, x);

  const body = document.createElement('div');
  body.className = 'board-qbp-body';
  content.append(head, body);
  inner.replaceChildren(content);

  current = { id, anchor };
  setAnchorState(anchor, true);
  render(body, { close: closeQuickbarPanel, open: openQuickbarPanel });
  // um frame depois, pra transição de altura partir de 0 quando acabou de abrir
  requestAnimationFrame(() => panel.classList.add('is-open'));
}

export function toggleQuickbarPanel(id, opts) {
  if (current?.id === id) closeQuickbarPanel();
  else openQuickbarPanel(id, opts);
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && current) closeQuickbarPanel();
  });
}
