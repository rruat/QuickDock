// ── shell-graph-quickbar.js ─────────────────────────────────────────────────
// Quick bar das CONSTELAÇÕES (mesmo desenho da quick bar do quadro): barra flutuante no rodapé
// do grafo com zoom, centralizar, reorganizar e os menus que antes ficavam no cabeçalho e num
// painel flutuante. Menus maiores (Filtros e exibição, Física e forças) fazem a barra CRESCER
// para cima e mostrar as configurações no mesmo bloco.
//
// Não recria controles: as seções de configuração do grafo (com seus ids e ouvintes, que o
// graph-view.js liga) são MOVIDAS para o painel da barra ao abrir e devolvidas ao fechar; os
// botões de zoom/centralizar/reorganizar acionam os botões originais do cabeçalho do grafo.

const CLOSE_DELAY = 240; // ms — igual à transição de altura em 37-graph-quickbar.css

const TOOLS = [
  { id: 'zoom-out', icon: 'remove', label: 'Menos', title: 'Diminuir zoom', click: '#btn-graph-zoom-out' },
  { id: 'zoom-in', icon: 'add', label: 'Mais', title: 'Aumentar zoom', click: '#btn-graph-zoom-in' },
  { id: 'center', icon: 'filter_center_focus', label: 'Centralizar', title: 'Centralizar visualização', click: '#btn-graph-zoom-reset' },
  { divider: true },
  { id: 'filters', icon: 'filter_alt', label: 'Filtros', title: 'Filtros e exibição', panel: 0 },
  { id: 'physics', icon: 'tune', label: 'Física', title: 'Física e forças', panel: 1 },
  { divider: true },
  { id: 'reheat', icon: 'refresh', label: 'Reorganizar', title: 'Reorganizar nós', click: '#btn-graph-reheat' },
];
// o que cada painel mostra (índices das seções de #graph-settings-body, na ordem original)
const PANELS = [
  { title: 'Filtros e exibição', icon: 'filter_alt', sections: [0] },
  { title: 'Física e forças', icon: 'tune', sections: [1, 2] },
];

let bar = null, panelEl = null, bodyEl = null, current = null, clearTimer = null; // current: índice do painel aberto (0 vale!) ou null
let sections = null; // [{ el, parent }] — seções originais, em ordem

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = name => { const s = mk('span', 'qd-icon material-symbols-rounded', name); s.setAttribute('aria-hidden', 'true'); return s; };

function collectSections() {
  if (sections) return sections;
  const body = document.querySelector('#graph-settings-panel .graph-settings-body');
  if (!body) return (sections = []);
  sections = [...body.children].map(el => ({ el, parent: body }));
  return sections;
}

function giveBackSections() {
  for (const s of sections || []) s.parent.appendChild(s.el); // a ordem original se refaz a cada devolução
}

export function closeGraphQuickbarPanel() {
  if (!bar || current === null) return;
  bar.querySelectorAll('.gq-btn.panel-open').forEach(b => { b.classList.remove('panel-open'); b.setAttribute('aria-expanded', 'false'); });
  current = null;
  panelEl.classList.remove('is-open');
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => { if (current === null) { giveBackSections(); bodyEl.replaceChildren(); } }, CLOSE_DELAY);
}

function openPanel(index, anchor) {
  const def = PANELS[index];
  if (current === index) { closeGraphQuickbarPanel(); return; }
  clearTimeout(clearTimer);
  giveBackSections();
  bar.querySelectorAll('.gq-btn.panel-open').forEach(b => { b.classList.remove('panel-open'); b.setAttribute('aria-expanded', 'false'); });
  const secs = collectSections();
  bodyEl.replaceChildren(...def.sections.map(i => secs[i]?.el).filter(Boolean));
  panelEl.querySelector('.gq-panel-title').textContent = def.title;
  panelEl.querySelector('.gq-panel-icon').textContent = def.icon;
  current = index;
  anchor.classList.add('panel-open');
  anchor.setAttribute('aria-expanded', 'true');
  panelEl.classList.add('is-open');
}

function build() {
  bar = mk('nav', 'gq-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Barra de ferramentas das Constelações');

  panelEl = mk('div', 'gq-panel');
  panelEl.setAttribute('aria-live', 'polite');
  const inner = mk('div', 'gq-panel-inner');
  const content = mk('div', 'gq-panel-content');
  const head = mk('div', 'gq-panel-head');
  const pIcon = mk('span', 'qd-icon material-symbols-rounded gq-panel-icon');
  const pTitle = mk('span', 'gq-panel-title');
  const x = mk('button', 'gq-panel-close'); x.type = 'button'; x.title = 'Fechar'; x.setAttribute('aria-label', 'Fechar painel');
  x.appendChild(icon('expand_more'));
  x.addEventListener('click', closeGraphQuickbarPanel);
  head.append(pIcon, pTitle, x);
  bodyEl = mk('div', 'gq-panel-body');
  content.append(head, bodyEl);
  inner.appendChild(content);
  panelEl.appendChild(inner);

  const row = mk('div', 'gq-row');
  for (const t of TOOLS) {
    if (t.divider) { row.appendChild(mk('span', 'gq-divider')); continue; }
    const b = mk('button', 'gq-btn'); b.type = 'button'; b.title = t.title; b.setAttribute('aria-label', t.title);
    b.append(icon(t.icon), mk('span', 'gq-label', t.label));
    if (t.panel !== undefined) {
      b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', () => openPanel(t.panel, b));
    } else {
      b.addEventListener('click', () => document.querySelector(t.click)?.click());
    }
    row.appendChild(b);
  }
  const stats = document.getElementById('graph-stats-badge'); // o contador de notas/conexões acompanha a barra
  if (stats) { row.appendChild(mk('span', 'gq-divider')); stats.classList.add('gq-stats'); row.appendChild(stats); }
  bar.append(panelEl, row);
  return bar;
}

/** Garante a quick bar dentro do contêiner do grafo (cria na primeira vez). */
export function ensureGraphQuickbar(container) {
  if (!container) return;
  if (!bar) build();
  if (bar.parentElement !== container) container.appendChild(bar);
  bar.hidden = false;
}

/** O grafo saiu da aside: fecha o painel (devolvendo as seções) e esconde a barra. */
export function hideGraphQuickbar() {
  if (!bar) return;
  closeGraphQuickbarPanel();
  clearTimeout(clearTimer);
  giveBackSections();
  bodyEl.replaceChildren();
  bar.hidden = true;
}
