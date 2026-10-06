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
import { loadAllNotesMeta, createNoteRecord, updateNoteMetaById } from '../storage.js';
import { normalizeViews, VIEW_TYPES, createView, duplicateView, newViewId, applyViewPatch } from './config/view-model.js';
import { mountViewSettingsPanel } from './ui/view-settings-panel.js';
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
  let baseDef = normalizeViews(normalizeBaseDefinition(parseYamlOrJson(rawConfigString)));
  let activeViewId = baseDef.defaultViewId;
  let settingsOpen = false;
  let settingsHandle = null;
  const activeIndex = () => Math.max(0, baseDef.views.findIndex(v => v.id === activeViewId));
  const persistBase = () => {
    rawConfigString = stringifyBaseToYaml(baseDef);
    if (options.onConfigChange) options.onConfigChange(rawConfigString);
  };

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

  // 2. Área Principal de Visualização (Viewport) + painel de configuração da view
  const viewportEl = document.createElement('div');
  viewportEl.className = 'base-viewport';
  rootContainer.appendChild(viewportEl);
  const settingsEl = document.createElement('aside');
  settingsEl.className = 'base-settings-host';
  settingsEl.hidden = true;
  rootContainer.appendChild(settingsEl);

  function renderSettingsPanel() {
    settingsHandle?.destroy();
    settingsHandle = null;
    const view = baseDef.views[activeIndex()];
    settingsEl.hidden = !settingsOpen || !view;
    rootContainer.classList.toggle('has-settings', !settingsEl.hidden);
    if (settingsEl.hidden) { settingsEl.replaceChildren(); return; }
    const rolagem = settingsEl.querySelector('.bset-body')?.scrollTop ?? 0;
    settingsHandle = mountViewSettingsPanel(settingsEl, {
      getView: () => baseDef.views[activeIndex()],
      getSchema: () => inferBaseSchema(allNotes, baseDef.properties),
      onPatch: patch => updateActiveView(patch),
      onRename: nome => updateActiveView({ name: nome }),
      onDuplicate: () => {
        const copia = duplicateView(baseDef.views[activeIndex()], baseDef.views.map(v => v.id));
        baseDef.views.splice(activeIndex() + 1, 0, copia);
        activeViewId = copia.id;
        persistBase(); renderViewTabs(); updateViewport();
      },
      canDelete: () => baseDef.views.length > 1,
      onDelete: () => {
        if (baseDef.views.length <= 1) return;
        baseDef.views.splice(activeIndex(), 1);
        activeViewId = baseDef.views[Math.min(activeIndex(), baseDef.views.length - 1)].id;
        if (!baseDef.views.some(v => v.id === baseDef.defaultViewId)) baseDef.defaultViewId = activeViewId;
        persistBase(); renderViewTabs(); updateViewport();
      },
      onClose: () => { settingsOpen = false; renderSettingsPanel(); },
    });
    const corpo = settingsEl.querySelector('.bset-body');
    if (corpo) corpo.scrollTop = rolagem;
  }

  function updateActiveView(patch) {
    const i = activeIndex();
    baseDef.views[i] = applyViewPatch(baseDef.views[i], patch);
    persistBase();
    renderViewTabs();
    updateViewport();
  }

  // Função para renderizar as abas de visão
  function renderViewTabs() {
    tabsEl.innerHTML = '';
    baseDef.views.forEach((view) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'base-tab-btn' + (view.id === activeViewId ? ' is-active' : '');
      const icon = VIEW_TYPES[view.type]?.icon || 'table_chart';

      tabBtn.innerHTML = `
        <span class="qd-icon material-symbols-rounded base-tab-icon" aria-hidden="true">${icon}</span>
        <span class="base-tab-name"></span>
      `;
      tabBtn.querySelector('.base-tab-name').textContent = view.name || view.type;
      tabBtn.addEventListener('click', () => {
        activeViewId = view.id;
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
        const nova = createView(t.type, { name: t.label, id: newViewId(baseDef.views.map(v => v.id)) });
        baseDef.views.push(nova);
        activeViewId = nova.id;
        persistBase();
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
  async function handleCreateNewNote(extraProps = {}, extraTypes = {}) {
    const pasta = baseDef.source?.folder && baseDef.source.folder !== '/' ? baseDef.source.folder : '';
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
        propertyTypes: extraTypes,
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
        baseDef = normalizeViews(normalizeBaseDefinition(parseYamlOrJson(rawConfigString)));
        if (!baseDef.views.some(v => v.id === activeViewId)) activeViewId = baseDef.defaultViewId;
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

    const currentView = baseDef.views[activeIndex()] || baseDef.views[0];
    if (!currentView) return;
    renderSettingsPanel();

    // 1. Infere o schema combinando notas + definições explícitas
    const schema = inferBaseSchema(allNotes, baseDef.properties);

    // 2. Filtra notas pela fonte (source) e busca rápida
    const filteredNotes = queryBaseNotes(allNotes, {
      source: baseDef.source,
      filters: currentView.filters,
      filterMode: currentView.filterMode,
      filterOperator: currentView.filterOperator,
      quickSearch: searchQuery,
    });

    // 3. Ordena notas
    const sortedNotes = sortBaseNotes(filteredNotes, currentView.sort, schema);

    // Callbacks comuns para as visões. showOwnToolbar: false porque a barra
    // de cima (headerEl, logo acima) já dá busca + "Nova Nota" — sem isto, a
    // tabela/quadro desenhavam uma segunda barra própria com os dois
    // duplicados por cima da primeira.
    const callbacks = {
      onOpenNote: async (noteId) => {
        await switchToNote(noteId);
      },
      onAddNote: async (extraProps, extraTypes) => {
        await handleCreateNewNote(extraProps, extraTypes);
      },
      // Arrastar/redimensionar no calendário grava a propriedade de data da nota
      onUpdateNoteProperties: async (note, propPatch, typePatch = {}) => {
        const properties = { ...(note.properties || {}), ...propPatch };
        const propertyTypes = { ...(note.propertyTypes || {}), ...typePatch };
        note.properties = properties;
        note.propertyTypes = propertyTypes;
        await updateNoteMetaById(note.id, { properties, propertyTypes });
        document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { id: note.id } }));
      },
      onOpenSettings: () => { settingsOpen = !settingsOpen; renderSettingsPanel(); },
      // Ajustes da própria visão (ex.: tamanho dos cartões da galeria) viram parte da Base
      onUpdateView: patch => updateActiveView(patch),
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
