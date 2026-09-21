// ── bases-view-container.js ──────────────────────────────────────────────────
// Controlador mestre para renderizar uma Base completa (incorporada ou em aba).
// Gerencia toolbar, abas de visão (Tabela, Quadro, Galeria, Lista, Calendário),
// pesquisa rápida, filtros, criação de notas reativa e sincronização com IndexedDB.

import { parseYamlOrJson, stringifyBaseToYaml } from './bases-yaml.js';
import { inferBaseSchema, normalizeBaseDefinition } from './bases-schema.js';
import { queryBaseNotes, sortBaseNotes } from './bases-engine.js';
import { renderBaseTableView } from './bases-table-view.js';
import { renderBaseBoardView } from './bases-board-view.js';
import { renderBaseGalleryView } from './bases-gallery-view.js';
import { renderBaseListView } from './bases-list-view.js';
import { renderBaseCalendarView } from './bases-calendar-view.js';
import { loadAllNotesMeta, createNoteRecord } from '../storage.js';
import { switchToNote } from '../note.js';

/**
 * Renderiza um componente completo de Base num elemento contêiner.
 * @param {HTMLElement} rootContainer
 * @param {string|Object} initialConfig - String YAML ou objeto de configuração
 * @param {Object} options - { embedded: boolean, onConfigChange: (newYaml) => void }
 */
export async function renderBaseComponent(rootContainer, initialConfig, options = {}) {
  // Limpa ouvintes anteriores se houver
  if (typeof rootContainer._cleanup === 'function') {
    rootContainer._cleanup();
  }

  // Estado interno da Base
  let rawConfigString = typeof initialConfig === 'string' ? initialConfig : stringifyBaseToYaml(initialConfig);
  let baseDef = normalizeBaseDefinition(parseYamlOrJson(rawConfigString));
  let activeViewIndex = baseDef.defaultView ?? 0;
  if (activeViewIndex < 0 || activeViewIndex >= baseDef.views.length) activeViewIndex = 0;

  let searchQuery = '';
  let showRawConfig = false;
  let allNotes = [];

  rootContainer.innerHTML = '';
  rootContainer.className = 'base-component-root' + (options.embedded ? ' is-embedded' : '');

  // 1. Barra de Ferramentas Superior (Header / Toolbar)
  const headerEl = document.createElement('div');
  headerEl.className = 'base-header-bar';

  // Lado Esquerdo: Título e Abas de Visão
  const leftGroup = document.createElement('div');
  leftGroup.className = 'base-header-left';

  const titleEl = document.createElement('div');
  titleEl.className = 'base-header-title';
  titleEl.innerHTML = `
    <span class="base-header-icon">🗃️</span>
    <span class="base-header-name">${baseDef.name || 'Base de Dados'}</span>
  `;
  leftGroup.appendChild(titleEl);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'base-header-tabs';
  leftGroup.appendChild(tabsEl);
  headerEl.appendChild(leftGroup);

  // Lado Direito: Busca rápida, Botão Novo, Alternar Código
  const rightGroup = document.createElement('div');
  rightGroup.className = 'base-header-right';

  // Campo de busca rápida
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'base-search-input';
  searchInput.placeholder = 'Buscar na base...';
  searchInput.value = searchQuery;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    updateViewport();
  });
  rightGroup.appendChild(searchInput);

  // Botão de alternar código YAML (se embutido)
  if (options.embedded) {
    const toggleCodeBtn = document.createElement('button');
    toggleCodeBtn.className = 'base-header-btn base-btn-code';
    toggleCodeBtn.title = 'Alternar código YAML';
    toggleCodeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
    `;
    toggleCodeBtn.addEventListener('click', () => {
      showRawConfig = !showRawConfig;
      toggleCodeBtn.classList.toggle('active', showRawConfig);
      updateViewport();
    });
    rightGroup.appendChild(toggleCodeBtn);
  }

  // Botão "+ Nova Nota"
  const addNoteBtn = document.createElement('button');
  addNoteBtn.className = 'base-header-btn base-btn-primary';
  addNoteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    <span>Nova Nota</span>
  `;
  addNoteBtn.addEventListener('click', async () => {
    await handleCreateNewNote();
  });
  rightGroup.appendChild(addNoteBtn);

  headerEl.appendChild(rightGroup);
  rootContainer.appendChild(headerEl);

  // 2. Área Principal de Visualização (Viewport)
  const viewportEl = document.createElement('div');
  viewportEl.className = 'base-viewport';
  rootContainer.appendChild(viewportEl);

  // Função para renderizar as abas de visão
  function renderViewTabs() {
    tabsEl.innerHTML = '';
    baseDef.views.forEach((view, idx) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'base-tab-btn' + (idx === activeViewIndex ? ' is-active' : '');

      let icon = 'table_chart';
      if (view.type === 'board') icon = 'view_kanban';
      if (view.type === 'gallery') icon = 'grid_view';
      if (view.type === 'list') icon = 'format_list_bulleted';
      if (view.type === 'calendar') icon = 'calendar_today';

      tabBtn.innerHTML = `
        <span class="base-tab-name">${view.name || view.type}</span>
      `;
      tabBtn.addEventListener('click', () => {
        activeViewIndex = idx;
        renderViewTabs();
        updateViewport();
      });
      tabsEl.appendChild(tabBtn);
    });

    // Botão "+ Visão"
    const addViewBtn = document.createElement('button');
    addViewBtn.className = 'base-tab-btn base-tab-add';
    addViewBtn.title = 'Adicionar visão';
    addViewBtn.textContent = '+';
    addViewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddViewMenu(addViewBtn);
    });
    tabsEl.appendChild(addViewBtn);
  }

  // Menu suspenso para adicionar nova visão
  function openAddViewMenu(anchorEl) {
    const existing = document.querySelector('.base-add-view-dropdown');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.className = 'base-add-view-dropdown';

    const tipos = [
      { type: 'table', label: 'Tabela' },
      { type: 'board', label: 'Quadro (Kanban)' },
      { type: 'gallery', label: 'Galeria (Cards)' },
      { type: 'list', label: 'Lista' },
      { type: 'calendar', label: 'Calendário' },
    ];

    tipos.forEach(t => {
      const item = document.createElement('div');
      item.className = 'base-add-view-item';
      item.textContent = t.label;
      item.addEventListener('click', () => {
        menu.remove();
        baseDef.views.push({
          type: t.type,
          name: t.label,
          properties: ['title', 'tags', 'updatedAt'],
        });
        activeViewIndex = baseDef.views.length - 1;
        rawConfigString = stringifyBaseToYaml(baseDef);
        if (options.onConfigChange) options.onConfigChange(rawConfigString);
        renderViewTabs();
        updateViewport();
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;

    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== anchorEl) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  // Criação de nova nota
  async function handleCreateNewNote(extraProps = {}) {
    const pasta = baseDef.source?.folder || '';
    const tag = baseDef.source?.tag;

    const initialProperties = { ...extraProps };
    if (tag) {
      initialProperties['tags'] = [tag.replace(/^#/, '')];
    }

    try {
      const noteId = await createNoteRecord({
        title: 'Nova nota',
        pasta,
        properties: initialProperties,
      });

      document.dispatchEvent(new CustomEvent('quickdock:note-created', { detail: { id: noteId } }));
      document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { id: noteId } }));

      // Abre a nota no editor
      await switchToNote(noteId);
    } catch (err) {
      console.error('Erro ao criar nota na base:', err);
    }
  }

  // Atualiza o viewport ativo
  function updateViewport() {
    viewportEl.innerHTML = '';

    // Se estiver no modo de edição do código YAML
    if (showRawConfig) {
      const editorWrap = document.createElement('div');
      editorWrap.className = 'base-raw-editor-wrap';

      const textarea = document.createElement('textarea');
      textarea.className = 'base-raw-editor';
      textarea.value = rawConfigString;

      const btnApply = document.createElement('button');
      btnApply.className = 'base-btn-primary base-raw-apply';
      btnApply.textContent = 'Salvar e Atualizar';
      btnApply.addEventListener('click', () => {
        rawConfigString = textarea.value;
        baseDef = normalizeBaseDefinition(parseYamlOrJson(rawConfigString));
        if (options.onConfigChange) options.onConfigChange(rawConfigString);
        showRawConfig = false;
        titleEl.querySelector('.base-header-name').textContent = baseDef.name || 'Base de Dados';
        renderViewTabs();
        updateViewport();
      });

      editorWrap.append(textarea, btnApply);
      viewportEl.appendChild(editorWrap);
      return;
    }

    const currentView = baseDef.views[activeViewIndex] || baseDef.views[0];
    if (!currentView) return;

    // 1. Infere o schema combinando notas + definições explícitas
    const schema = inferBaseSchema(allNotes, baseDef.properties);

    // 2. Filtra notas pela fonte (source) e busca rápida
    const filteredNotes = queryBaseNotes(allNotes, {
      source: baseDef.source,
      filters: currentView.filters,
      filterOperator: currentView.filterOperator,
      quickSearch: searchQuery,
    });

    // 3. Ordena notas
    const sortedNotes = sortBaseNotes(filteredNotes, currentView.sort);

    // Callbacks comuns para as visões. showOwnToolbar: false porque a barra
    // de cima (headerEl, logo acima) já dá busca + "Nova Nota" — sem isto, a
    // tabela/quadro desenhavam uma segunda barra própria com os dois
    // duplicados por cima da primeira.
    const callbacks = {
      onOpenNote: async (noteId) => {
        await switchToNote(noteId);
      },
      onAddNote: async (extraProps) => {
        await handleCreateNewNote(extraProps);
      },
      showOwnToolbar: false,
    };

    // Renderiza a visão ativa correspondente
    switch (currentView.type) {
      case 'board':
        renderBaseBoardView(viewportEl, sortedNotes, schema, currentView, callbacks);
        break;
      case 'gallery':
        renderBaseGalleryView(viewportEl, sortedNotes, schema, currentView, callbacks);
        break;
      case 'list':
        renderBaseListView(viewportEl, sortedNotes, schema, currentView, callbacks);
        break;
      case 'calendar':
        renderBaseCalendarView(viewportEl, sortedNotes, schema, currentView, callbacks);
        break;
      case 'table':
      default:
        renderBaseTableView(viewportEl, sortedNotes, schema, currentView, callbacks);
        break;
    }
  }

  // Carregamento inicial de notas
  async function loadData() {
    allNotes = await loadAllNotesMeta();
    renderViewTabs();
    updateViewport();
  }

  // Ouvinte reativo para atualizações externas
  const onNoteEvent = async () => {
    allNotes = await loadAllNotesMeta();
    updateViewport();
  };

  document.addEventListener('quickdock:note-updated', onNoteEvent);
  document.addEventListener('quickdock:note-created', onNoteEvent);

  rootContainer._cleanup = () => {
    document.removeEventListener('quickdock:note-updated', onNoteEvent);
    document.removeEventListener('quickdock:note-created', onNoteEvent);
  };

  await loadData();
}
