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
import { renderBaseChartView } from './bases-chart-view.js';
import { renderBaseTimelineView } from './bases-timeline-view.js';
import { renderBaseFeedView } from './bases-feed-view.js';
import { renderBaseMapView } from './bases-map-view.js';
import { loadAllNotesMeta, createNoteRecord, updateNoteMetaById } from '../storage.js';
import { normalizeViews, VIEW_TYPES, createView, newViewId, applyViewPatch } from './config/view-model.js';
import { mountViewSettingsPanel } from './ui/view-settings-panel.js';
import { renderViewTabs as desenhaAbas } from './ui/view-tabs.js';
import { renderQuickFilters, loadQuickFilters, saveQuickFilters } from './ui/quick-filters.js';
import { impliedValues } from './engine/filter-tree.js';
import { applyDerivedColumns } from './engine/derived-columns.js';
import { normalizeColorRules, rowTone, cellTone } from './engine/color-rules.js';
import {
  moveView, duplicateViewAt, deleteViewById, renameViewById, setViewLocked, setViewIcon,
  setDefaultView, neighborViewId,
} from './config/view-actions.js';
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

  // Botão ⚙ "Configurar view" (todas as views)
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'base-header-btn base-btn-settings';
  settingsBtn.type = 'button';
  settingsBtn.title = 'Configurar view';
  settingsBtn.setAttribute('aria-label', 'Configurar view');
  settingsBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">tune</span>';
  settingsBtn.addEventListener('click', () => { settingsOpen = !settingsOpen; renderSettingsPanel(); });
  rightGroup.appendChild(settingsBtn);

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

  // Filtros rápidos (chips) — entre o cabeçalho e a view
  const quickEl = document.createElement('div');
  quickEl.className = 'base-quickfilters';
  rootContainer.appendChild(quickEl);
  const baseKey = () => options.baseId || baseDef.name || 'base';
  let quickFilters = [];
  let quickFiltersViewId = null;

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
    settingsBtn.classList.toggle('active', !settingsEl.hidden);
    settingsBtn.setAttribute('aria-pressed', String(!settingsEl.hidden));
    if (settingsEl.hidden) { settingsEl.replaceChildren(); return; }
    const rolagem = settingsEl.querySelector('.bset-body')?.scrollTop ?? 0;
    settingsHandle = mountViewSettingsPanel(settingsEl, {
      getView: () => baseDef.views[activeIndex()],
      getSchema: () => inferBaseSchema(allNotes, baseDef.properties),
      getBaseProps: () => baseDef.properties || {},
      onBasePatch: patch => {
        const props = { ...(baseDef.properties || {}) };
        for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete props[k]; else props[k] = v; }
        baseDef = { ...baseDef, properties: props };
        persistBase(); updateViewport();
      },
      onPatch: patch => updateActiveView(patch),
      onRename: nome => updateActiveView({ name: nome }),
      onDuplicate: () => { const r = duplicateViewAt(baseDef, activeViewId); aplica(r.baseDef, r.newId); },
      canDelete: () => baseDef.views.length > 1 && !baseDef.views[activeIndex()]?.locked,
      onDelete: () => { const r = deleteViewById(baseDef, activeViewId, activeViewId); aplica(r.baseDef, r.activeId); },
      onClose: () => { settingsOpen = false; renderSettingsPanel(); },
    });
    const corpo = settingsEl.querySelector('.bset-body');
    if (corpo) corpo.scrollTop = rolagem;
  }

  function updateActiveView(patch) {
    const i = activeIndex();
    // view bloqueada: só renomear/ícone/trava passam pelo menu; o painel e as views não gravam
    if (baseDef.views[i]?.locked && !('locked' in patch)) return;
    baseDef.views[i] = applyViewPatch(baseDef.views[i], patch);
    persistBase();
    renderViewTabs();
    updateViewport();
  }

  // Abas de visão (ícone, renomear, arrastar, menu ⋯) — ver ui/view-tabs.js
  const aplica = (novaDef, ativa = activeViewId) => {
    baseDef = novaDef;
    activeViewId = baseDef.views.some(v => v.id === ativa) ? ativa : baseDef.defaultViewId;
    persistBase(); renderViewTabs(); updateViewport();
  };
  function renderViewTabs() {
    desenhaAbas(tabsEl, { views: baseDef.views, activeId: activeViewId, defaultId: baseDef.defaultViewId }, {
      onSelect: id => { activeViewId = id; renderViewTabs(); updateViewport(); },
      onAdd: type => {
        const nome = VIEW_TYPES[type]?.label || type;
        const nova = createView(type, { name: nome, id: newViewId(baseDef.views.map(v => v.id)) });
        aplica({ ...baseDef, views: [...baseDef.views, nova] }, nova.id);
      },
      onRename: (id, nome) => aplica(renameViewById(baseDef, id, nome)),
      onDuplicate: id => { const r = duplicateViewAt(baseDef, id); aplica(r.baseDef, r.newId); },
      onDelete: id => {
        const v = baseDef.views.find(x => x.id === id);
        if (!window.confirm(`Excluir a view "${v?.name || id}"?`)) return;
        const r = deleteViewById(baseDef, id, activeViewId); aplica(r.baseDef, r.activeId);
      },
      onReorder: (de, para) => aplica(moveView(baseDef, de, para)),
      onToggleLock: id => aplica(setViewLocked(baseDef, id, !baseDef.views.find(v => v.id === id)?.locked)),
      onSetDefault: id => aplica(setDefaultView(baseDef, id)),
      onSetIcon: id => {
        const nome = window.prompt('Nome do ícone (Material Symbols, ex.: star, work). Vazio = padrão do tipo:', baseDef.views.find(v => v.id === id)?.icon || '');
        if (nome !== null) aplica(setViewIcon(baseDef, id, nome.trim()));
      },
    });
  }

  // Criação de nova nota
  async function handleCreateNewNote(extraProps = {}, extraTypes = {}) {
    const pasta = baseDef.source?.folder && baseDef.source.folder !== '/' ? baseDef.source.folder : '';
    const tag = baseDef.source?.tag;

    // "Novo" herda o que os filtros da view exigem (ex.: status = Em andamento) — a nota nasce visível
    const view = baseDef.views[activeIndex()];
    const implicitos = impliedValues(view?.filters, view?.filterMode ?? view?.filterOperator);
    for (const [k, v] of Object.entries(impliedValues(quickFilters))) if (!(k in implicitos)) implicitos[k] = v;
    const reservadas = new Set(['title', 'folder', 'tags', 'createdAt', 'updatedAt', 'tasks']);
    const herdadas = Object.fromEntries(Object.entries(implicitos).filter(([k]) => !reservadas.has(k)));
    const initialProperties = { ...herdadas, ...extraProps };
    const tiposHerdados = {};
    const esquema = inferBaseSchema(allNotes, baseDef.properties);
    for (const k of Object.keys(herdadas)) if (esquema[k]?.type) tiposHerdados[k] = esquema[k].type;
    extraTypes = { ...tiposHerdados, ...extraTypes };
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
    const notasBase = applyDerivedColumns(allNotes, baseDef.properties);

    if (quickFiltersViewId !== currentView.id) {
      quickFiltersViewId = currentView.id;
      quickFilters = loadQuickFilters(baseKey(), currentView.id);
    }

    // 2. Filtra notas pela fonte (source), filtros da view, filtros rápidos e busca
    const filteredNotes = queryBaseNotes(notasBase, {
      quickFilters,
      source: baseDef.source,
      filters: currentView.filters,
      filterMode: currentView.filterMode,
      filterOperator: currentView.filterOperator,
      quickSearch: searchQuery,
    });

    // 3. Ordena notas
    const sortedNotes = sortBaseNotes(filteredNotes, currentView.sort, schema);
    renderQuickFilters(quickEl, { filters: quickFilters, schema, count: sortedNotes.length }, lista => {
      quickFilters = lista;
      saveQuickFilters(baseKey(), currentView.id, lista);
      updateViewport();
    });

    // Callbacks comuns para as visões. showOwnToolbar: false porque a barra
    // de cima (headerEl, logo acima) já dá busca + "Nova Nota" — sem isto, a
    // tabela/quadro desenhavam uma segunda barra própria com os dois
    // duplicados por cima da primeira.
    const regrasCor = normalizeColorRules(currentView);
    const callbacks = {
      rowTone: regrasCor.length ? n => rowTone(n, regrasCor) : null,
      cellTone: regrasCor.length ? (n, k) => cellTone(n, regrasCor, k) : null,
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
      // clicar numa barra/fatia do gráfico vira filtro rápido
      onQuickFilter: cond => {
        quickFilters = [...quickFilters, cond];
        saveQuickFilters(baseKey(), currentView.id, quickFilters);
        updateViewport();
      },
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
      case 'feed':
        renderBaseFeedView(viewportEl, sortedNotes, schema, currentView, callbacks);
        break;
      case 'map':
        renderBaseMapView(viewportEl, sortedNotes, schema, currentView, callbacks).catch(err => console.warn('Mapa:', err));
        break;
      case 'timeline':
        renderBaseTimelineView(viewportEl, sortedNotes, schema, currentView, callbacks);
        break;
      case 'chart':
        renderBaseChartView(viewportEl, sortedNotes, schema, currentView, callbacks);
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

  const onKeyViews = e => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !rootContainer.contains(document.activeElement)) return;
    const id = neighborViewId(baseDef, activeViewId, e.key === 'ArrowRight' ? 1 : -1);
    if (id && id !== activeViewId) { e.preventDefault(); activeViewId = id; renderViewTabs(); updateViewport(); }
  };
  rootContainer.addEventListener('keydown', onKeyViews);
  document.addEventListener('quickdock:note-updated', onNoteEvent);
  document.addEventListener('quickdock:note-created', onNoteEvent);

  rootContainer._cleanup = () => {
    document.removeEventListener('quickdock:note-updated', onNoteEvent);
    document.removeEventListener('quickdock:note-created', onNoteEvent);
    rootContainer.removeEventListener('keydown', onKeyViews);
  };

  await loadData();
}
