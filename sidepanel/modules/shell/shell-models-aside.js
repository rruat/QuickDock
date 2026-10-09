// ── shell-models-aside.js ───────────────────────────────────────────────────
// No MOBILE a aside direita ganha o modo MODELOS (notas, quadros e blocos modelo): sem a nav
// inferior, o botão que abre os modelos mora no cabeçalho dela. Em vez de recriar o painel, a seção
// `#asideModels` (a mesma do desktop, com seus ouvintes) é MOVIDA para a aside enquanto o modo está
// ativo e volta ao lugar ao sair (mesmo padrão de shell-note-panel.js e shell-graph-panel.js).

let origin = null; // { parent, next, hidden }

export function showModelsAside(host) {
  const el = document.getElementById('asideModels');
  if (!host || !el) return;
  host.hidden = false;
  if (el.parentElement !== host) {
    if (!origin) origin = { parent: el.parentElement, next: el.nextSibling, hidden: el.hidden };
    host.appendChild(el);
    el.hidden = false;
    document.dispatchEvent(new CustomEvent('quickdock:aside-panel-changed', { detail: { panel: 'models' } })); // redesenha a lista
  }
}

export function hideModelsAside(host) {
  if (host) host.hidden = true;
  const el = document.getElementById('asideModels');
  if (!origin || !el || el.parentElement !== host) return;
  if (origin.next && origin.next.parentNode === origin.parent) origin.parent.insertBefore(el, origin.next);
  else origin.parent.appendChild(el);
  el.hidden = origin.hidden;
  origin = null;
}
