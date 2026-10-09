// ── shell-mobile-drawer.js ──────────────────────────────────────────────────
// Drawer ESQUERDO do mobile no desenho do Obsidian (com traço outline): barra de PESQUISA no topo; no
// rodapé o seletor do ESCOPO da busca (abre para cima) e o botão de CONFIGURAÇÕES (abre uma tela
// cheia); acima deles a LUPA flutuante, que leva o foco à barra de busca sem esticar o polegar até o
// topo. Sem a nav inferior, é por aqui que se escolhe view, nota, quadro ou pasta e se chega às
// configurações. Os modelos moram na aside direita (shell-models-aside.js).

import { SEARCH_SCOPES, searchItems, searchFolders } from './mobile-drawer-search.js';
import { escapeHtml } from './shell-views.js';

const KEY_SCOPE = 'quickdock:mobile:search-scope';
const rd = k => { try { return localStorage.getItem(k); } catch { return null; } };
const wr = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = n => `<span class="material-symbols-rounded" aria-hidden="true">${n}</span>`;

export function initMobileDrawer() {
  const aside = document.getElementById('mAside');
  if (!aside || aside.querySelector('.md-top')) return;

  let scope = SEARCH_SCOPES.find(s => s.id === rd(KEY_SCOPE)) || SEARCH_SCOPES[0];
  let timer = null;

  // ── topo: barra de pesquisa ──
  const top = el('div', 'md-top');
  const box = el('label', 'md-search', icon('search'));
  const input = el('input'); input.type = 'search'; input.id = 'mDrawerSearch'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('enterkeyhint', 'search');
  const clear = el('button', 'md-clear', icon('close')); clear.type = 'button'; clear.hidden = true; clear.setAttribute('aria-label', 'Limpar busca');
  box.append(input, clear);
  top.appendChild(box);

  // ── resultados (itens e pastas) ──
  const results = el('div', 'md-results'); results.hidden = true;

  // ── rodapé: escopo + configurações ──
  const bottom = el('div', 'md-bottom');
  const scopeBtn = el('button', 'md-scope'); scopeBtn.type = 'button'; scopeBtn.setAttribute('aria-haspopup', 'listbox'); scopeBtn.setAttribute('aria-expanded', 'false');
  const menu = el('div', 'md-scope-menu'); menu.setAttribute('role', 'listbox');
  const gear = el('button', 'md-gear', icon('settings')); gear.type = 'button'; gear.title = 'Configurações'; gear.setAttribute('aria-label', 'Configurações');
  bottom.append(scopeBtn, gear, menu);

  // ── lupa flutuante (acima do rodapé): foca a busca ──
  const lupa = el('button', 'md-lupa', icon('search')); lupa.type = 'button'; lupa.title = 'Buscar'; lupa.setAttribute('aria-label', 'Buscar');

  aside.append(top, results, bottom, lupa);

  const paintScope = () => {
    scopeBtn.innerHTML = `${icon(scope.icon)}<span class="md-scope-label">${scope.label}</span>${icon('expand_less')}`;
    input.placeholder = scope.placeholder;
    menu.innerHTML = SEARCH_SCOPES.map(s => `<button type="button" role="option" class="md-scope-opt${s.id === scope.id ? ' is-active' : ''}" data-scope="${s.id}">${icon(s.icon)}<span>${s.label}</span>${s.id === scope.id ? icon('check') : ''}</button>`).join('');
  };
  const closeMenu = () => {
    // só mexe no DOM se algo muda: remover uma classe que não existe ainda gera um registro no MutationObserver
    // que observa a classe do próprio aside (abaixo) e viraria um laço infinito
    if (menu.classList.contains('is-open')) menu.classList.remove('is-open');
    if (aside.classList.contains('is-menu-open')) aside.classList.remove('is-menu-open');
    if (scopeBtn.getAttribute('aria-expanded') !== 'false') scopeBtn.setAttribute('aria-expanded', 'false');
  };

  // ── busca ──
  async function run() {
    const q = input.value;
    clear.hidden = !q;
    const searching = !!q.trim() && scope.id !== 'views';
    aside.classList.toggle('is-searching', searching);
    results.hidden = !searching;

    // Views: o filtro da própria lista do painel Home
    const viewsInput = document.getElementById('asideViewsSearch');
    if (viewsInput) { const v = scope.id === 'views' ? q : ''; if (viewsInput.value !== v) { viewsInput.value = v; viewsInput.dispatchEvent(new Event('input', { bubbles: true })); } }
    if (!searching) { results.replaceChildren(); return; }

    const { loadWorkspaceItems } = await import('../workspace-items.js');
    const items = await loadWorkspaceItems();
    if (input.value !== q) return; // digitou de novo enquanto carregava
    if (scope.id === 'items') {
      const hits = searchItems(items, q);
      results.innerHTML = hits.length ? hits.map(it => `
        <div class="aside-view-item"><button type="button" class="aside-view-main" data-open="${escapeHtml(String(it.id))}">
          <span class="material-symbols-rounded">${escapeHtml(it.icon || (it.isBoard ? 'space_dashboard' : 'description'))}</span>
          <span class="aside-view-text"><strong>${escapeHtml(it.title || 'Sem título')}</strong><small>${escapeHtml(it.pasta || (it.isBoard ? 'Quadro' : 'Nota'))}</small></span>
        </button></div>`).join('') : '<div class="aside-views-empty">Nada encontrado.</div>';
    } else {
      const hits = searchFolders(items, q);
      results.innerHTML = hits.length ? hits.map(f => `
        <div class="aside-view-item"><button type="button" class="aside-view-main" data-folder="${escapeHtml(f.path)}">
          <span class="material-symbols-rounded">folder</span>
          <span class="aside-view-text"><strong>${escapeHtml(f.name)}</strong><small>${escapeHtml(f.path)} • ${f.count}</small></span>
        </button></div>`).join('') : '<div class="aside-views-empty">Nenhuma pasta encontrada.</div>';
    }
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); clear.hidden = !input.value; });
  clear.addEventListener('click', () => { input.value = ''; run(); input.focus(); });

  results.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    const folder = e.target.closest('[data-folder]');
    if (open) {
      const { openNoteFromBase } = await import('../bases/open-note.js');
      const id = open.dataset.open;
      openNoteFromBase(/^\d+$/.test(id) ? Number(id) : id);
    } else if (folder) {
      // abre a view Explorador já dentro da pasta
      wr('quickdock:explorer-path:v_explorador', folder.dataset.folder);
      const { setActiveViewId } = await import('../workspace-base.js');
      const { requestSelectViewNow } = await import('../bases/engine/view-request.js');
      setActiveViewId('v_explorador');
      document.dispatchEvent(new CustomEvent('quickdock:open-view', { detail: { view: 'bases' } }));
      setTimeout(() => requestSelectViewNow('v_explorador'), 0);
    }
  });

  // ── escopo (menu para cima) ──
  scopeBtn.addEventListener('click', (e) => { e.stopPropagation(); const open = !menu.classList.contains('is-open'); menu.classList.toggle('is-open', open); aside.classList.toggle('is-menu-open', open); scopeBtn.setAttribute('aria-expanded', String(open)); });
  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-scope]');
    if (!opt) return;
    e.stopPropagation(); // o menu é redesenhado abaixo: sem isso o clique "fora do drawer" do shell o fecharia
    scope = SEARCH_SCOPES.find(s => s.id === opt.dataset.scope) || scope;
    wr(KEY_SCOPE, scope.id);
    paintScope(); closeMenu(); run(); input.focus();
  });
  document.addEventListener('click', (e) => { if (menu.classList.contains('is-open') && !bottom.contains(e.target)) closeMenu(); });

  // ── lupa ──
  lupa.addEventListener('click', () => input.focus());

  // ── configurações: tela cheia (o painel #asideSettings é movido para ela) ──
  let screen = null, origin = null;
  function openSettings() {
    const section = document.getElementById('asideSettings');
    if (!section) return;
    if (!screen) {
      screen = el('div', 'md-settings-screen');
      screen.setAttribute('role', 'dialog'); screen.setAttribute('aria-label', 'Configurações');
      const head = el('div', 'md-settings-head');
      const back = el('button', 'md-settings-back', icon('arrow_back')); back.type = 'button'; back.setAttribute('aria-label', 'Voltar');
      back.addEventListener('click', closeSettings);
      head.append(back, el('span', 'md-settings-title', 'Configurações'));
      screen.appendChild(head);
      document.body.appendChild(screen);
    }
    origin = { parent: section.parentElement, next: section.nextSibling, hidden: section.hidden };
    section.hidden = false;
    screen.appendChild(section);
    closeMenu();
    requestAnimationFrame(() => screen.classList.add('is-open'));
  }
  function closeSettings() {
    if (!screen) return;
    screen.classList.remove('is-open');
    const section = document.getElementById('asideSettings');
    setTimeout(() => {
      if (section && origin) {
        if (origin.next && origin.next.parentNode === origin.parent) origin.parent.insertBefore(section, origin.next); else origin.parent.appendChild(section);
        section.hidden = origin.hidden;
        origin = null;
      }
    }, 260);
  }
  gear.addEventListener('click', openSettings);
  window.addEventListener('popstate', () => { if (screen?.classList.contains('is-open')) closeSettings(); });

  // fechou o drawer: some o menu e a busca de itens volta ao normal
  new MutationObserver(() => { if (!aside.classList.contains('is-open-mobile') && menu.classList.contains('is-open')) closeMenu(); }).observe(aside, { attributes: true, attributeFilter: ['class'] });

  paintScope();
}
