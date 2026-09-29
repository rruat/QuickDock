// ── shell-omnibar.js ────────────────────────────────────────────────────────
// Omnibar universal de busca inteligente e central de comandos do Spatial Shell
// (Ctrl + K). Suporta autocomplete por Tab, busca por multi-token, comandos
// rápidos ('>'), visualizações ('#') e busca em notas salvas.

import { loadAllNotesMeta } from '../storage.js';
import {
  SHELL_VIEWS,
  STOPWORDS,
  normalizeStr,
  highlightTokens
} from './shell-views.js';

let searchCandidates = [];
let searchActiveIdx = -1;

export function getSearchCandidates() {
  return searchCandidates;
}

export function setupOmnibar({
  onToggleLayout = null,
  onOpenAllViews = null,
  onCloseAllViews = null,
  onOpenOrFocusView = null
} = {}) {
  const searchBar = document.getElementById('smartSearchBar');
  const searchInput = document.getElementById('smartSearchInput');
  const dropdown = document.getElementById('searchDropdown');
  const resultsContainer = document.getElementById('searchResults');
  if (!searchBar || !searchInput || !dropdown || !resultsContainer) return;

  searchBar.addEventListener('click', () => searchInput.focus());

  searchInput.addEventListener('focus', () => {
    renderOmnibarResults(searchInput.value.trim(), {
      onToggleLayout,
      onOpenAllViews,
      onCloseAllViews,
      onOpenOrFocusView
    });
    dropdown.style.display = 'block';
  });

  searchInput.addEventListener('input', () => {
    searchActiveIdx = -1;
    renderOmnibarResults(searchInput.value.trim(), {
      onToggleLayout,
      onOpenAllViews,
      onCloseAllViews,
      onOpenOrFocusView
    });
    dropdown.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      searchActiveIdx = -1;
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      searchInput.blur();
      e.preventDefault();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (searchCandidates.length === 0) return;

      const direction = e.shiftKey ? -1 : 1;
      searchActiveIdx = (searchActiveIdx + direction + searchCandidates.length) % searchCandidates.length;
      updateActiveResultUI();

      const candidate = searchCandidates[searchActiveIdx];
      if (candidate && candidate.autocompleteTerm) {
        searchInput.value = candidate.autocompleteTerm;
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchCandidates.length === 0) return;
      searchActiveIdx = (searchActiveIdx + 1) % searchCandidates.length;
      updateActiveResultUI();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchCandidates.length === 0) return;
      searchActiveIdx = (searchActiveIdx - 1 + searchCandidates.length) % searchCandidates.length;
      updateActiveResultUI();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchCandidates.length > 0 && searchActiveIdx >= 0) {
        const item = searchCandidates[searchActiveIdx];
        if (item && item.action) {
          item.action();
          dropdown.style.display = 'none';
          searchInput.blur();
        }
      }
    }
  });
}

export function updateActiveResultUI() {
  const container = document.getElementById('searchResults');
  if (!container) return;
  const items = container.querySelectorAll('.search-item');
  items.forEach((it, idx) => {
    it.classList.toggle('is-selected', idx === searchActiveIdx);
    if (idx === searchActiveIdx) {
      it.scrollIntoView({ block: 'nearest' });
    }
  });
}

export async function renderOmnibarResults(query, {
  onToggleLayout = null,
  onOpenAllViews = null,
  onCloseAllViews = null,
  onOpenOrFocusView = null
} = {}) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  container.innerHTML = '';
  searchCandidates = [];

  const rawTokens = query.split(/\s+/).filter(Boolean);
  const cleanTokens = rawTokens.filter(t => !STOPWORDS.has(normalizeStr(t)));

  const isCommandQuery = query.startsWith('>');
  const isViewQuery = query.startsWith('#');

  // 1. Categoria: Comandos do Workspace
  const commands = [
    { title: 'Alternar Layout (Lado a Lado / Empilhado)', desc: 'Alt + L', action: () => onToggleLayout?.() },
    { title: 'Nova Nota', desc: 'Criar uma nova página de notas', action: () => document.getElementById('btn-new-note')?.click() },
    {
      title: 'Abrir Todas as Views',
      desc: 'Espalhar todas as views no workspace',
      action: () => onOpenAllViews?.()
    },
    {
      title: 'Fechar Todas as Views',
      desc: 'Mostrar o estado vazio (nenhuma view aberta)',
      action: async () => {
        if (onCloseAllViews) await onCloseAllViews();
      }
    }
  ];

  // 2. Categoria: Views
  const viewResults = SHELL_VIEWS.map(v => ({
    title: v.title,
    desc: v.desc,
    icon: v.icon,
    autocompleteTerm: `#${v.title.toLowerCase()}`,
    action: () => onOpenOrFocusView?.(v.id)
  }));

  // Renderiza Comandos se aplicável
  if (isCommandQuery || !isViewQuery) {
    const matchingCmds = commands.filter(c => !query || normalizeStr(c.title).includes(normalizeStr(query.replace('>', ''))));
    if (matchingCmds.length > 0) {
      const cat = document.createElement('div');
      cat.className = 'search-category-title';
      cat.textContent = 'COMANDOS DO SISTEMA';
      container.appendChild(cat);

      for (const cmd of matchingCmds) {
        const itemEl = document.createElement('div');
        itemEl.className = 'search-item';
        itemEl.innerHTML = `
          <span class="search-item-icon material-symbols-rounded">terminal</span>
          <div class="search-item-info">
            <span class="search-item-title">${highlightTokens(cmd.title, cleanTokens)}</span>
            <span class="search-item-sub">${cmd.desc}</span>
          </div>
          <span class="search-item-hint">Executar</span>
        `;
        itemEl.addEventListener('click', () => {
          cmd.action();
          const dd = document.getElementById('searchDropdown');
          if (dd) dd.style.display = 'none';
        });
        container.appendChild(itemEl);
        searchCandidates.push(cmd);
      }
    }
  }

  // Renderiza Views
  const matchingViews = viewResults.filter(v => !query || normalizeStr(v.title).includes(normalizeStr(query.replace('#', ''))));
  if (matchingViews.length > 0) {
    const cat = document.createElement('div');
    cat.className = 'search-category-title';
    cat.textContent = 'VISUALIZAÇÕES (VIEWS)';
    container.appendChild(cat);

    for (const v of matchingViews) {
      const itemEl = document.createElement('div');
      itemEl.className = 'search-item';
      itemEl.innerHTML = `
        <span class="search-item-icon material-symbols-rounded">${v.icon}</span>
        <div class="search-item-info">
          <span class="search-item-title">${highlightTokens(v.title, cleanTokens)}</span>
          <span class="search-item-sub">${v.desc}</span>
        </div>
        <span class="search-item-hint">Focar</span>
      `;
      itemEl.addEventListener('click', () => {
        v.action();
        const dd = document.getElementById('searchDropdown');
        if (dd) dd.style.display = 'none';
      });
      container.appendChild(itemEl);
      searchCandidates.push(v);
    }
  }

  // 3. Categoria: Notas Salvas
  if (!isCommandQuery && !isViewQuery && query.length >= 1) {
    try {
      const notesMeta = await loadAllNotesMeta();
      if (Array.isArray(notesMeta)) {
        const matchingNotes = notesMeta.filter(n => {
          const title = normalizeStr(n.title || 'Sem título');
          return cleanTokens.every(tok => title.includes(normalizeStr(tok)));
        }).slice(0, 6);

        if (matchingNotes.length > 0) {
          const cat = document.createElement('div');
          cat.className = 'search-category-title';
          cat.textContent = 'NOTAS';
          container.appendChild(cat);

          for (const note of matchingNotes) {
            const noteObj = {
              title: note.title || 'Sem título',
              desc: note.pasta ? `Pasta: ${note.pasta}` : 'Nota',
              action: () => {
                onOpenOrFocusView?.('notes');
                document.dispatchEvent(new CustomEvent('quickdock:activate-note', { detail: { id: note.id } }));
              }
            };
            const itemEl = document.createElement('div');
            itemEl.className = 'search-item';
            itemEl.innerHTML = `
              <span class="search-item-icon material-symbols-rounded">${note.isBase ? 'table_rows' : 'description'}</span>
              <div class="search-item-info">
                <span class="search-item-title">${highlightTokens(noteObj.title, cleanTokens)}</span>
                <span class="search-item-sub">${noteObj.desc}</span>
              </div>
              <span class="search-item-hint">Abrir</span>
            `;
            itemEl.addEventListener('click', () => {
              noteObj.action();
              const dd = document.getElementById('searchDropdown');
              if (dd) dd.style.display = 'none';
            });
            container.appendChild(itemEl);
            searchCandidates.push(noteObj);
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar notas para a omnibar:', err);
    }
  }

  updateActiveResultUI();
}
