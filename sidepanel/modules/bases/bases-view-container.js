// ── bases-view-container.js ──────────────────────────────────────────────────
// Controlador mestre para renderizar uma Base completa (incorporada ou em aba).
// Gerencia toolbar, abas de visão (Tabela, Quadro, Galeria, Lista, Calendário),
// pesquisa rápida, filtros, criação de notas reativa e sincronização com IndexedDB.

import { parseYamlOrJson, stringifyBaseToYaml } from './bases-yaml.js';
import { inferBaseSchema, normalizeBaseDefinition } from './bases-schema.js';
import { runViewPipeline, renderViewByType } from './bases-view-pipeline.js';
import { loadAllNotesMeta, createNoteRecord, updateNoteMetaById, loadAllTemplates, updateNoteBlocksById, getNoteById } from '../storage.js';
import { parseMarkdownToBlocks, blocksToMarkdown, blocksOfNote } from '../blocks.js';
import { normalizeViews, getViewProps, VIEW_TYPES, createView, newViewId, applyViewPatch } from './config/view-model.js';
import { mountViewSettingsPanel } from './ui/view-settings-panel.js';
import { renderViewTabs as desenhaAbas, abreMenu } from './ui/view-tabs.js';
import { exportMenuItems } from './ui/export-menu.js';
import { createBulkController } from './bases-bulk-controller.js';
import { createNotePeek } from './ui/note-peek.js';
import { nextId, planMissingIds } from './engine/unique-id.js';
import { readLinkedDefinition, effectiveSource, effectiveProperties, findBaseNotes } from './engine/linked-base.js';
import { renderQuickFilters, loadQuickFilters, saveQuickFilters } from './ui/quick-filters.js';
import { impliedValues } from './engine/filter-tree.js';
import { applyDerivedColumns } from './engine/derived-columns.js';
import { normalizeColorRules, rowTone, cellTone } from './engine/color-rules.js';
import {
  moveView, duplicateViewAt, deleteViewById, renameViewById, setViewLocked, setViewIcon,
  setDefaultView, neighborViewId, serializeView, parseViewClipboard, pasteViewInto,
} from './config/view-actions.js';
import { absorbDataUrls } from '../note.js';
import { openNoteFromBase } from './open-note.js';
import { normalizeNoteId } from './engine/note-id.js';
import { loadWorkspaceItems } from '../workspace-items.js';
import { takePendingView, EVT_SELECT_VIEW, EVT_ADD_VIEW, EVT_SET_TYPE, EVT_SETTINGS_OPEN, EVT_SETTINGS_CLOSED, EVT_GROUP_FILTER, announceGroups } from './engine/view-request.js';
import { groupsFromItems } from '../shell/view-groups-model.js';

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
  // Se a aside do shell pediu uma view desta Base antes de ela montar, abre direto nela
  let activeViewId = takePendingView(options.baseId, baseDef.views) ?? baseDef.defaultViewId;
  // Painel do workspace: as configurações da view moram na aside direita do shell (options.settingsHost)
  const externalSettings = !!(options.panel && options.settingsHost);
  let settingsOpen = externalSettings ? !!options.settingsOpen : false;
  let settingsHandle = null;
  const activeIndex = () => Math.max(0, baseDef.views.findIndex(v => v.id === activeViewId));
  const persistBase = () => {
    rawConfigString = stringifyBaseToYaml(baseDef);
    if (options.onConfigChange) options.onConfigChange(rawConfigString);
  };

  let searchQuery = '';
  let showRawConfig = false;
  let allNotes = [];
  let templates = [];
  let linked = null;           // definição lida da Base de origem (view vinculada), só leitura
  const selfUid = () => allNotes.find(n => n.id === options.baseId)?.uid ?? null;
  const fonteEfetiva = () => effectiveSource(baseDef, linked);
  const propsEfetivas = () => effectiveProperties(baseDef, linked);
  async function carregaOrigem() {
    linked = null;
    const uid = baseDef.source?.base;
    if (!uid) return;
    const meta = allNotes.find(n => n.uid === uid);
    if (!meta) return;
    try {
      const nota = await getNoteById(meta.id);
      const blocos = blocksOfNote(nota);
      linked = readLinkedDefinition(blocos);
    } catch (err) { console.warn('Base vinculada: não foi possível ler a origem', err); }
  }

  rootContainer.innerHTML = '';
  rootContainer.className = 'base-component-root' + (options.embedded ? ' is-embedded' : '') + (options.panel ? ' is-workspace-panel' : '');

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

  // Botão ⬇ "Exportar" (CSV, Markdown, JSON das notas visíveis da view ativa)
  let ultimaVisao = { notes: [], schema: {}, view: {} };
  const exportBtn = document.createElement('button');
  exportBtn.className = 'base-header-btn base-btn-export';
  exportBtn.type = 'button';
  exportBtn.title = 'Exportar notas desta view';
  exportBtn.setAttribute('aria-label', 'Exportar');
  exportBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">download</span>';
  exportBtn.addEventListener('click', e => {
    e.stopPropagation();
    abreMenu(exportBtn, exportMenuItems(() => ({ ...ultimaVisao, baseName: baseDef.name })));
  });
  rightGroup.appendChild(exportBtn);

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
  // Painel do workspace: busca, exportar, Nova Nota, filtro rápido e a barra do calendário
  // (mês, navegação, modo) moram na aside direita (options.toolsHost), como no mockup
  const toolsHost = options.panel ? options.toolsHost : null;
  let calBarEl = null;
  if (toolsHost) {
    toolsHost.replaceChildren();
    calBarEl = document.createElement('div');
    calBarEl.className = 'base-tools-calbar';
    toolsHost.append(calBarEl, headerEl);
  } else {
    rootContainer.appendChild(headerEl);
  }

  // Filtros rápidos (chips) — entre o cabeçalho e a view
  const quickEl = document.createElement('div');
  quickEl.className = 'base-quickfilters';
  if (toolsHost) toolsHost.appendChild(quickEl); else rootContainer.appendChild(quickEl);
  const baseKey = () => options.baseId || baseDef.name || 'base';
  let quickFilters = [];
  let quickFiltersViewId = null;

  // Seleção e edição em lote (barra só aparece com notas selecionadas na tabela)
  const bulkEl = document.createElement('div');
  rootContainer.appendChild(bulkEl);
  const bulk = createBulkController(bulkEl, { getNotes: () => allNotes, onChanged: () => updateViewport() });

  const peek = createNotePeek(rootContainer, { onOpenNote: id => openNoteFromBase(id) });

  // 2. Área Principal de Visualização (Viewport) + painel de configuração da view
  // Linha própria: a view ocupa o espaço que sobra e o painel EMPURRA o conteúdo (não flutua por cima)
  const bodyRow = document.createElement('div');
  bodyRow.className = 'base-body-row';
  rootContainer.appendChild(bodyRow);
  const viewportEl = document.createElement('div');
  viewportEl.className = 'base-viewport';
  bodyRow.appendChild(viewportEl);
  const settingsEl = externalSettings ? options.settingsHost : document.createElement('aside');
  if (!externalSettings) {
    settingsEl.className = 'base-settings-host';
    settingsEl.hidden = true;
    bodyRow.appendChild(settingsEl);
  }

  function renderSettingsPanel() {
    settingsHandle?.destroy();
    settingsHandle = null;
    const view = baseDef.views[activeIndex()];
    settingsEl.hidden = !settingsOpen || !view;
    rootContainer.classList.toggle('has-settings', !settingsEl.hidden && !externalSettings);
    settingsBtn.classList.toggle('active', !settingsEl.hidden);
    settingsBtn.setAttribute('aria-pressed', String(!settingsEl.hidden));
    if (settingsEl.hidden) { settingsEl.replaceChildren(); return; }
    const rolagem = settingsEl.querySelector('.bset-body')?.scrollTop ?? 0;
    settingsHandle = mountViewSettingsPanel(settingsEl, {
      getView: () => baseDef.views[activeIndex()],
      getSchema: () => inferBaseSchema(allNotes, propsEfetivas()),
      getLinkInfo: () => ({ uid: baseDef.source?.base || null, loaded: !!linked, name: linked?.name || '', candidates: findBaseNotes(allNotes, selfUid()).map(n => ({ uid: n.uid, title: n.title || 'Sem título' })) }),
      onSourcePatch: patch => {
        const fonte = { ...(baseDef.source || {}) };
        for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete fonte[k]; else fonte[k] = v; }
        baseDef = { ...baseDef, source: Object.keys(fonte).length ? fonte : { all: true } };
        persistBase();
        carregaOrigem().then(() => updateViewport());
      },
      getTemplates: () => templates,
      getViews: () => baseDef.views,
      // Gera os IDs que faltam (ação explícita; abrir uma view nunca grava)
      onFillIds: async (key, def) => {
        const plano = planMissingIds(allNotes, key, def.prefix || '', def.digits || 0);
        if (!plano.length) { window.alert('Todas as notas já têm ID.'); return; }
        if (!window.confirm(`Gerar ${plano.length} ID(s) em ${key}? As notas serão alteradas.`)) return;
        for (const { id, value } of plano) {
          const n = allNotes.find(x => x.id === id);
          await updateNoteMetaById(id, { properties: { ...(n?.properties || {}), [key]: value }, propertyTypes: { ...(n?.propertyTypes || {}), [key]: 'text' } });
        }
        document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { ids: true } }));
      },
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
      onClose: () => {
        settingsOpen = false; renderSettingsPanel();
        if (externalSettings) document.dispatchEvent(new CustomEvent(EVT_SETTINGS_CLOSED)); // a aside direita recolhe
      },
    });
    const corpo = settingsEl.querySelector('.bset-body');
    if (corpo) corpo.scrollTop = rolagem;
  }

  // Altera uma view pelo id (a ativa, ou um widget do dashboard)
  function updateViewById(id, patch) {
    const i = baseDef.views.findIndex(v => v.id === id);
    if (i < 0) return;
    // view bloqueada: só renomear/ícone/trava passam pelo menu; o painel e as views não gravam
    if (baseDef.views[i]?.locked && !('locked' in patch)) return;
    baseDef.views[i] = applyViewPatch(baseDef.views[i], patch);
    persistBase();
    renderViewTabs();
    updateViewport();
  }
  const updateActiveView = patch => updateViewById(activeViewId, patch);

  // Abas de visão (ícone, renomear, arrastar, menu ⋯) — ver ui/view-tabs.js
  const aplica = (novaDef, ativa = activeViewId) => {
    baseDef = novaDef;
    activeViewId = baseDef.views.some(v => v.id === ativa) ? ativa : baseDef.defaultViewId;
    persistBase(); renderViewTabs(); updateViewport();
  };
  function renderViewTabs() {
    options.onViewChange?.(activeViewId); // o painel do workspace guarda a view ativa
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
      // copiar/colar uma view entre Bases (JSON na área de transferência)
      onCopyView: async id => {
        const v = baseDef.views.find(x => x.id === id);
        if (!v) return;
        try { await navigator.clipboard.writeText(serializeView(v)); }
        catch { window.prompt('Copie o texto abaixo (Ctrl+C) e cole em outra Base:', serializeView(v)); }
      },
      onPasteView: async () => {
        let texto = '';
        try { texto = await navigator.clipboard.readText(); }
        catch { texto = window.prompt('Cole aqui a view copiada (Ctrl+V):') || ''; }
        const r = parseViewClipboard(texto);
        if (!r.ok) { window.alert(r.motivo); return; }
        const res = pasteViewInto(baseDef, r.view);
        aplica(res.baseDef, res.newId);
      },
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
    const fonte = fonteEfetiva();
    const pasta = fonte.folder && fonte.folder !== '/' ? fonte.folder : '';
    const tag = fonte.tag;

    // "Novo" herda o que os filtros da view exigem (ex.: status = Em andamento) — a nota nasce visível
    const view = baseDef.views[activeIndex()];
    const implicitos = impliedValues(view?.filters, view?.filterMode ?? view?.filterOperator);
    for (const [k, v] of Object.entries(impliedValues(quickFilters))) if (!(k in implicitos)) implicitos[k] = v;
    const reservadas = new Set(['title', 'folder', 'tags', 'createdAt', 'updatedAt', 'tasks']);
    const herdadas = Object.fromEntries(Object.entries(implicitos).filter(([k]) => !reservadas.has(k)));
    const initialProperties = { ...herdadas, ...extraProps };
    // ID único: a nota nova já nasce com o próximo número livre
    for (const [k, d] of Object.entries(propsEfetivas())) if (d?.type === 'uid' && !(k in initialProperties)) initialProperties[k] = nextId(allNotes, k, d.prefix || '', d.digits || 0);
    const tiposHerdados = {};
    const esquema = inferBaseSchema(allNotes, propsEfetivas());
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

      // modelo da view: o markdown do modelo passa pelo mesmo caminho da importação
      // (imagem em base64 vira arquivo — precisa do id da nota, por isso a nota nasce vazia antes)
      const tpl = view?.newTemplate ? templates.find(t => t.uid === view.newTemplate && t.kind === 'note') : null;
      if (tpl) {
        const blocks = await absorbDataUrls(parseMarkdownToBlocks(tpl.content ?? ''), noteId);
        await updateNoteBlocksById(noteId, blocks, blocksToMarkdown(blocks));
      }

      document.dispatchEvent(new CustomEvent('quickdock:note-created', { detail: { id: noteId } }));
      document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { id: noteId } }));

      // Abre a nota no editor
      openNoteFromBase(noteId);
    } catch (err) {
      console.error('Erro ao criar nota na base:', err);
    }
  }

  // Atualiza o viewport ativo
  function updateViewport() {
    viewportEl.innerHTML = '';
    calBarEl?.replaceChildren(); // a barra do calendário só existe quando a view é um calendário

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
    const schema = inferBaseSchema(allNotes, propsEfetivas());
    const notasBase = applyDerivedColumns(allNotes, propsEfetivas());

    if (quickFiltersViewId !== currentView.id) {
      quickFiltersViewId = currentView.id;
      quickFilters = loadQuickFilters(baseKey(), currentView.id);
    }

    // 2. Filtra (origem, filtros da view, filtros rápidos, busca) e ordena — ver bases-view-pipeline.js
    const opcoesPipeline = () => ({ source: fonteEfetiva(), quickFilters, search: searchQuery });
    const sortedNotes = runViewPipeline(notasBase, currentView, schema, opcoesPipeline());
    ultimaVisao = { notes: sortedNotes, schema, view: currentView };
    if (options.panel) { // legenda de grupos da aside esquerda
      const f = quickFilters.find(c => c.property === 'folder' && (c.operator === 'equals' || c.operator === 'is_empty'));
      announceGroups(groupsFromItems(sortedNotes), f ? (f.operator === 'is_empty' ? '' : String(f.value ?? '')) : null);
    }
    bulk.sync(currentView, schema);
    renderQuickFilters(quickEl, { filters: quickFilters, schema, count: sortedNotes.length }, lista => {
      quickFilters = lista;
      saveQuickFilters(baseKey(), currentView.id, lista);
      updateViewport();
    });

    // Callbacks comuns para as visões. showOwnToolbar: false porque a barra
    // de cima (headerEl, logo acima) já dá busca + "Nova Nota" — sem isto, a
    // tabela/quadro desenhavam uma segunda barra própria com os dois
    // duplicados por cima da primeira.
    const montaCallbacks = view => {
    const regrasCor = normalizeColorRules(view);
    return {
      toolbarHost: calBarEl, // barra do calendário na aside direita (null = no topo da visão)
      // colar de planilha: patches já validados (tudo ou nada) — grava e recarrega
      onPasteWrites: async patches => {
        for (const { id, patch } of patches) await updateNoteMetaById(id, patch);
        document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { paste: true } }));
      },
      selection: bulk.selection,
      onSelectionChange: bulk.onSelectionChange,
      rowTone: regrasCor.length ? n => rowTone(n, regrasCor) : null,
      cellTone: regrasCor.length ? (n, k) => cellTone(n, regrasCor, k) : null,
      peekActive: view.openIn === 'peek-side' || view.openIn === 'peek-center',
      // "Abrir em": página (editor) ou prévia lateral/central somente leitura
      onOpenNote: async (noteId) => {
        const modo = view.openIn;
        const nota = (modo === 'peek-side' || modo === 'peek-center') ? allNotes.find(n => n.id === normalizeNoteId(noteId)) : null;
        if (nota) peek.abrir(nota, modo, { schema, props: getViewProps(view) });
        else openNoteFromBase(noteId);
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
      isSearching: () => !!searchQuery,
      // Explorador: arrastar um item para uma pasta grava a pasta (nota ou quadro)
      onMoveToFolder: async (note, pasta) => {
        await updateNoteMetaById(note.id, { pasta });
        document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { id: note.id, move: true } }));
      },
      onOpenSettings: () => { settingsOpen = !settingsOpen; renderSettingsPanel(); },
      // clicar numa barra/fatia do gráfico vira filtro rápido
      onQuickFilter: cond => {
        quickFilters = [...quickFilters, cond];
        saveQuickFilters(baseKey(), currentView.id, quickFilters);
        updateViewport();
      },
      // Ajustes da própria visão (ex.: tamanho dos cartões da galeria) viram parte da Base
      onUpdateView: patch => updateViewById(view.id, patch),
      // Dashboard: desenha outra view da mesma Base como widget (mesmo caminho: filtros, ordenação, cor…)
      renderWidget: (host, viewId) => {
        const alvo = baseDef.views.find(v => v.id === viewId && v.type !== 'dashboard');
        if (!alvo) { host.textContent = 'View não encontrada.'; return; }
        renderViewByType(host, alvo, runViewPipeline(notasBase, alvo, schema, opcoesPipeline()), schema, montaCallbacks(alvo));
      },
      showOwnToolbar: false,
    };
    };


    renderViewByType(viewportEl, currentView, sortedNotes, schema, montaCallbacks(currentView));
    // Painel do workspace: view sem itens (filtro, busca ou Base vazia) avisa em vez de parecer quebrada
    if (options.panel && sortedNotes.length === 0 && currentView.type !== 'dashboard') {
      const vazio = document.createElement('div');
      vazio.className = 'view-empty';
      vazio.textContent = 'Nenhum item nesta view';
      viewportEl.appendChild(vazio);
    }
  }

  // Carregamento inicial de notas
  // O painel do workspace mostra notas E quadros; as Bases embutidas em notas, só notas
  const loadItems = () => (options.panel ? loadWorkspaceItems() : loadAllNotesMeta());
  async function loadData() {
    allNotes = await loadItems();
    await carregaOrigem();
    try { templates = await loadAllTemplates(); } catch { templates = []; }
    renderViewTabs();
    updateViewport();
  }

  // Ouvinte reativo para atualizações externas
  const onNoteEvent = async () => {
    allNotes = await loadItems();
    if (baseDef.source?.base) await carregaOrigem();
    updateViewport();
  };

  // Atalhos (7.4): Alt+←/→ troca de view · Alt+1…9 vai direto a uma view · Ctrl+Alt+, abre/fecha o painel
  const onKeyViews = e => {
    if (!rootContainer.contains(document.activeElement)) return;
    const naoEhCampo = !e.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (e.ctrlKey && e.altKey && e.key === ',') { e.preventDefault(); settingsOpen = !settingsOpen; renderSettingsPanel(); return; }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    let id = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') id = neighborViewId(baseDef, activeViewId, e.key === 'ArrowRight' ? 1 : -1);
    else if (/^[1-9]$/.test(e.key) && naoEhCampo) id = baseDef.views[Number(e.key) - 1]?.id ?? null;
    if (id && id !== activeViewId) { e.preventDefault(); activeViewId = id; renderViewTabs(); updateViewport(); }
  };
  rootContainer.addEventListener('keydown', onKeyViews);
  document.addEventListener('quickdock:note-updated', onNoteEvent);
  document.addEventListener('quickdock:note-created', onNoteEvent);

  // Pedidos da aside esquerda (só o painel dedicado, não as Bases embutidas em notas)
  const onSelectViewRequest = e => {
    const id = e.detail?.viewId;
    if (id && baseDef.views.some(v => v.id === id) && id !== activeViewId) { activeViewId = id; renderViewTabs(); updateViewport(); }
  };
  const onAddViewRequest = e => {
    const type = e.detail?.type in VIEW_TYPES ? e.detail.type : 'table';
    const nova = createView(type, { name: VIEW_TYPES[type].label, id: newViewId(baseDef.views.map(v => v.id)) });
    aplica({ ...baseDef, views: [...baseDef.views, nova] }, nova.id);
  };
  const onSetTypeRequest = e => {
    const type = e.detail?.type;
    const i = baseDef.views.findIndex(v => v.id === activeViewId);
    if (!(type in VIEW_TYPES) || i < 0 || baseDef.views[i].type === type || baseDef.views[i].locked) return;
    const atual = baseDef.views[i];
    // padrões do tipo novo por baixo; o que a view já tem (nome, filtros, ordem…) por cima
    baseDef.views[i] = { ...createView(type, { id: atual.id, name: atual.name }), ...atual, type };
    persistBase(); renderViewTabs(); updateViewport(); renderSettingsPanel();
  };
  // clique num grupo da legenda: liga/desliga o filtro rápido "pasta é X" (X vazio = sem pasta)
  const onGroupFilterRequest = e => {
    const pasta = String(e.detail?.folder ?? '');
    const igual = c => c.property === 'folder' && (pasta ? (c.operator === 'equals' && String(c.value ?? '') === pasta) : c.operator === 'is_empty');
    const semPasta = c => c.property === 'folder';
    const ligado = quickFilters.some(igual);
    const base = quickFilters.filter(c => !semPasta(c));
    quickFilters = ligado ? base : [...base, pasta
      ? { property: 'folder', operator: 'equals', value: pasta }
      : { property: 'folder', operator: 'is_empty' }];
    saveQuickFilters(baseKey(), quickFiltersViewId, quickFilters);
    updateViewport();
  };
  const onSettingsRequest = e => { settingsOpen = !!e.detail?.open; renderSettingsPanel(); };
  if (options.panel) {
    document.addEventListener(EVT_SELECT_VIEW, onSelectViewRequest);
    document.addEventListener(EVT_ADD_VIEW, onAddViewRequest);
    document.addEventListener(EVT_SET_TYPE, onSetTypeRequest);
    document.addEventListener(EVT_GROUP_FILTER, onGroupFilterRequest);
    document.addEventListener('quickdock:board-changed', onNoteEvent); // quadro criado/renomeado/excluído
    if (externalSettings) document.addEventListener(EVT_SETTINGS_OPEN, onSettingsRequest);
  }

  rootContainer._cleanup = () => {
    document.removeEventListener(EVT_SELECT_VIEW, onSelectViewRequest);
    document.removeEventListener(EVT_ADD_VIEW, onAddViewRequest);
    document.removeEventListener(EVT_SET_TYPE, onSetTypeRequest);
    document.removeEventListener(EVT_GROUP_FILTER, onGroupFilterRequest);
    document.removeEventListener('quickdock:board-changed', onNoteEvent);
    document.removeEventListener(EVT_SETTINGS_OPEN, onSettingsRequest);
    if (externalSettings) { settingsHandle?.destroy(); settingsEl.replaceChildren(); settingsEl.hidden = true; }
    toolsHost?.replaceChildren();
    peek.fechar();
    document.removeEventListener('quickdock:note-updated', onNoteEvent);
    document.removeEventListener('quickdock:note-created', onNoteEvent);
    rootContainer.removeEventListener('keydown', onKeyViews);
  };

  await loadData();
  if (externalSettings && settingsOpen) renderSettingsPanel(); // remontou com a aside direita aberta
}
