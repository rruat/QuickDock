// ── shell-aside-panels.js ───────────────────────────────────────────────────
// A aside ESQUERDA tem 3 painéis (padrão do mockup): Home (lista de views), Modelos e
// Configurações. Os botões da nav trocam o painel — a tela principal não muda. Clicar no
// botão do painel que já está aberto recolhe a aside. Só desktop; no mobile a nav segue
// abrindo as telas.

const PANELS = {
  home:     { title: 'VIEWS' },
  models:   { title: 'MODELOS' },
  settings: { title: 'CONFIGURAÇÕES' },
};
export const NAV_TO_PANEL = { home: 'home', templates: 'models', settings: 'settings' };

let current = 'home';
export const getAsidePanel = () => current;

/** Mostra o painel `name` (só troca o conteúdo; abrir/recolher fica com quem chama). */
export function setAsidePanel(name) {
  if (!PANELS[name]) return;
  current = name;
  const aside = document.getElementById('mAside');
  if (!aside) return;
  aside.dataset.asidePanel = name;
  const title = aside.querySelector(':scope > .aside-header .aside-title');
  if (title) title.textContent = PANELS[name].title;
  document.dispatchEvent(new CustomEvent('quickdock:aside-panel-changed', { detail: { panel: name } }));
}

/**
 * Clique num botão da nav: abre o painel; se ele já está aberto, recolhe a aside.
 * `isCollapsed`/`setCollapsed` vêm do spatial-shell (que é o dono do estado de recolhimento).
 */
export function toggleAsidePanel(name, { isCollapsed, setCollapsed }) {
  if (!isCollapsed() && current === name) { setCollapsed(true); return; }
  setAsidePanel(name);
  if (isCollapsed()) setCollapsed(false);
}
