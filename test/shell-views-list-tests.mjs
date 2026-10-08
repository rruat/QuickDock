// Testes da Base única do workspace (modelo puro), da lista de views da aside esquerda
// e dos pedidos de view para o painel de Bases.
import { readFile } from 'node:fs/promises';

export async function runShellViewsListTests({ ok, igual }) {
  const m = await import('../sidepanel/modules/workspace-base-model.js');
  const req = await import('../sidepanel/modules/bases/engine/view-request.js');

  // Base inicial
  const def = m.defaultWorkspaceDef();
  igual('workspace · a Base inicial tem calendário, tabela e galeria', def.views.map(v => v.type), ['calendar', 'table', 'gallery']);
  igual('workspace · abre no calendário (como o mockup)', def.defaultViewId, 'v_calendario');
  igual('workspace · origem = todos os itens', def.source, { all: true });

  // Leitura do YAML guardado
  igual('workspace · YAML vazio volta para a Base inicial', m.parseWorkspaceDef('').views.length, 3);
  igual('workspace · YAML sem views volta para a Base inicial', m.parseWorkspaceDef('name: X\n').views.length, 3);
  const yaml = m.workspaceDefToYaml(def);
  igual('workspace · YAML gravado e relido mantém as views', m.parseWorkspaceDef(yaml).views.map(v => v.name), ['Calendário', 'Tabela', 'Galeria']);
  igual('workspace · view ativa que não existe mais cai na padrão', m.resolveActiveViewId(def, 'sumiu'), 'v_calendario');
  igual('workspace · view ativa guardada é respeitada', m.resolveActiveViewId(def, 'v_galeria'), 'v_galeria');

  // Rascunho (fluxo "modificada")
  igual('rascunho · iguais não são modificados', m.isWorkspaceModified(def, m.parseWorkspaceDef(yaml)), false);
  const mudado = JSON.parse(JSON.stringify(def)); mudado.views[1].sort = [{ property: 'title', direction: 'desc' }];
  igual('rascunho · mudar a ordenação marca modificada', m.isWorkspaceModified(def, mudado), true);
  igual('rascunho · só a view alterada recebe o ponto', m.modifiedViewIds(def, mudado), ['v_tabela']);
  const renomeado = JSON.parse(JSON.stringify(def)); renomeado.views[0].name = 'Outro'; renomeado.name = 'X';
  igual('rascunho · renomear não suja', m.isWorkspaceModified(def, renomeado), false);
  const nova = m.saveDraftAsNewView(def, mudado, 'v_tabela');
  igual('rascunho · salvar como nova põe a cópia no fim, com o conteúdo do rascunho', [nova.def.views.length, nova.def.views[3].sort, nova.def.views[3].id === nova.id], [4, mudado.views[1].sort, true]);
  igual('rascunho · salvar como nova não altera a original salva', nova.def.views[1].sort, def.views[1].sort);
  const bv = await readFile(new URL('../sidepanel/modules/bases-view.js', import.meta.url), 'utf8');
  const wb = await readFile(new URL('../sidepanel/modules/workspace-base.js', import.meta.url), 'utf8');
  ok('rascunho · o painel grava no rascunho, não na Base salva', bv.includes('saveWorkspaceDraft(novoYaml)') && !bv.includes('saveWorkspaceYaml(') && wb.includes('export function commitWorkspaceDraft'));
  ok('rascunho · barra Salvar/Descartar no pré-cache', (await readFile(new URL('../sw.js', import.meta.url), 'utf8')).includes('shell/shell-draft-bar.js'));

  // P8 · fidelidade
  const fl = await import('../sidepanel/modules/shell/shell-footer-label.js');
  igual('rodapé · calendário mostra a escala', fl.footerLabelFor({ name: 'Calendário', type: 'calendar', mode: 'week' }), 'Calendário (Semana)');
  igual('rodapé · outras views só o nome', fl.footerLabelFor({ name: 'Tabela', type: 'table' }), 'Tabela');
  const esc = await readFile(new URL('../sidepanel/modules/shell/shell-escape-back.js', import.meta.url), 'utf8');
  ok('esc · volta às views só fora de edição/diálogo, pelo botão voltar', esc.includes('isEditing(document.activeElement)') && esc.includes('.btn-back-views') && esc.includes("'Escape'"));
  const ss = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  ok('título · o cabeçalho vira Nota/Quadro no início da expansão do mês', ss.indexOf('anticipateHeaderTitle(viewId);') < ss.indexOf('expandMonthCell(cell,'));
  ok('estado vazio · a view do workspace sem itens mostra "Nenhum item nesta view"', (await readFile(new URL('../sidepanel/modules/bases/bases-view-container.js', import.meta.url), 'utf8')).includes('Nenhum item nesta view'));

  // P4 · painéis Modelos e Configurações na aside esquerda
  const bt = await import('../sidepanel/modules/shell/models-board-templates.js');
  ok('modelos · há mapa mental, fluxo e storyboard', ['mapa-mental', 'fluxo', 'storyboard'].every(id => bt.BOARD_TEMPLATES.some(t => t.id === id)));
  for (const t of bt.BOARD_TEMPLATES) {
    const b = bt.buildBoardFromTemplate(t);
    const ids = new Set(b.cards.map(c => c.id));
    ok(`modelos · ${t.id}: toda seta liga cartões existentes e os ids são únicos`,
      b.arrows.length > 0 && b.arrows.every(a => ids.has(a.from) && ids.has(a.to)) && ids.size === b.cards.length && new Set(b.arrows.map(a => a.id)).size === b.arrows.length);
  }
  const ap = await readFile(new URL('../sidepanel/modules/shell/shell-aside-panels.js', import.meta.url), 'utf8');
  ok('aside esquerda · 3 painéis; clicar no painel aberto recolhe a aside', ap.includes("NAV_TO_PANEL = { home: 'home', templates: 'models', settings: 'settings' }") && ap.includes('setCollapsed(true)'));
  for (const f of ['index.html', '404.html', 'sidepanel/index.html']) {
    const html = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    ok(`aside esquerda · ${f} tem os painéis Modelos e Configurações (toggles movidos para a aside)`,
      ['id="asideModels"', 'id="asideModelsBody"', 'id="btnManageTemplates"', 'id="asideSettings"', 'id="asideSettingsTheme"', 'id="asideSettingsSync"'].every(x => html.includes(x)) &&
      html.indexOf('id="settings-aside-open"') > html.indexOf('id="asideSettings"') && html.indexOf('id="settings-animations"') > html.indexOf('id="asideSettings"'));
  }
  ok('aside esquerda · a nav do desktop troca o painel em vez de abrir telas cheias', ss.includes('toggleAsidePanel(NAV_TO_PANEL[viewId]'));
  ok('aside esquerda · createBlankBoard aceita cartões/setas iniciais do modelo', (await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8')).includes('inicial?.cards'));
  const swP4 = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  ok('aside esquerda · módulos novos no pré-cache', ['shell-aside-panels', 'shell-models-panel', 'models-board-templates'].every(n => swP4.includes(`shell/${n}.js`)));

  // Criar / duplicar / renomear / excluir
  const a = m.addWorkspaceView(def, 'board');
  igual('workspace · nova view entra no fim com o tipo pedido', a.def.views[3].type, 'board');
  igual('workspace · devolve o id da nova view', a.def.views[3].id, a.id);
  igual('workspace · tipo desconhecido vira tabela', m.addWorkspaceView(def, 'xyz').def.views[3].type, 'table');
  igual('workspace · nome repetido ganha número', m.addWorkspaceView(def, 'calendar').def.views[3].name, 'Calendário 2');
  const d = m.duplicateWorkspaceView(def, 'v_tabela');
  igual('workspace · duplicar põe a cópia logo depois da original', d.baseDef.views[2].name, 'Tabela (cópia)');
  igual('workspace · renomear', m.renameWorkspaceView(def, 'v_tabela', 'Notas').views[1].name, 'Notas');
  const del = m.deleteWorkspaceView(def, 'v_tabela', 'v_tabela');
  igual('workspace · excluir remove a view', del.def.views.length, 2);
  igual('workspace · excluir a ativa passa para a vizinha', del.activeId, 'v_galeria');
  const so = { ...def, views: [def.views[0]] };
  igual('workspace · a última view nunca é excluída', m.deleteWorkspaceView(so, so.views[0].id, so.views[0].id).def.views.length, 1);

  // Busca
  igual('workspace · busca vazia devolve tudo', m.filterWorkspaceViews(def.views, '').length, 3);
  igual('workspace · busca por nome, sem acento', m.filterWorkspaceViews(def.views, 'calendario').map(v => v.id), ['v_calendario']);
  igual('workspace · busca por tipo', m.filterWorkspaceViews(def.views, 'galeria').map(v => v.id), ['v_galeria']);
  igual('workspace · busca sem resultado', m.filterWorkspaceViews(def.views, 'zzz').length, 0);

  // Pedido de view para o painel: guardado até a Base montar
  const views = [{ id: 'a' }, { id: 'b' }];
  req.requestBaseView('workspace', 'b');
  igual('view-request · outra Base não consome o pedido', req.takePendingView('outra', views), null);
  igual('view-request · a Base certa recebe a view pedida', req.takePendingView('workspace', views), 'b');
  igual('view-request · o pedido vale uma vez só', req.takePendingView('workspace', views), null);
  req.requestBaseView('workspace', 'sumiu');
  igual('view-request · view que não existe mais é ignorada', req.takePendingView('workspace', views), null);

  // Contratos de integração (texto literal nos arquivos)
  const container = await readFile(new URL('../sidepanel/modules/bases/bases-view-container.js', import.meta.url), 'utf8');
  ok('workspace · o painel de Bases atende os pedidos só com options.panel (não as Bases embutidas)',
    container.includes('takePendingView(options.baseId') && container.includes('if (options.panel)') &&
    container.includes('EVT_SELECT_VIEW') && container.includes('EVT_ADD_VIEW') &&
    container.includes('removeEventListener(EVT_SELECT_VIEW') && container.includes('options.onViewChange?.(activeViewId)'));

  const basesView = await readFile(new URL('../sidepanel/modules/bases-view.js', import.meta.url), 'utf8');
  ok('workspace · bases-view.js monta a Base ÚNICA do workspace (não a de uma nota) e grava no rascunho',
    basesView.includes('WORKSPACE_BASE_ID') && basesView.includes('loadWorkspaceYaml()') &&
    basesView.includes('panel: true') && basesView.includes('saveWorkspaceDraft(novoYaml)') &&
    !basesView.includes('getCurrentNoteId') && !basesView.includes('appendBaseBlockToCurrentNote'));

  const lista = await readFile(new URL('../sidepanel/modules/shell/shell-views-list.js', import.meta.url), 'utf8');
  ok('workspace · a lista da aside cria views por tipo, duplica, renomeia e exclui (sem ferramentas separadas)',
    lista.includes('addWorkspaceView') && lista.includes('duplicateWorkspaceView') &&
    lista.includes('deleteWorkspaceView') && lista.includes('renameWorkspaceView') &&
    lista.includes('NEW_VIEW_TYPES') && lista.includes('await createBlankNote()'));

  const shell = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  ok('workspace · a tela inicial é a Base (bases) e nota/quadro têm "Voltar às views"',
    shell.includes("openViewIds = ['bases']") && shell.includes('function setupBackToViews') && shell.includes("'#section-note', '#board-view'"));

  const css = await readFile(new URL('../sidepanel/css/35-shell-v2.css', import.meta.url), 'utf8');
  ok('workspace · o menu de ferramentas (#asideSectionList) e o explorador antigo ficam ocultos no desktop',
    css.includes('#mAside.mode-notes #asideSectionList') && css.includes('#mAside.mode-notes .notes-aside-drawer') &&
    css.includes('display: none !important'));

  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  ok('workspace · os módulos novos estão no pré-cache do PWA',
    ['shell/shell-views-list.js', 'workspace-base-model.js', 'workspace-base.js', 'bases/engine/view-request.js'].every(f => sw.includes(`sidepanel/modules/${f}`)) &&
    !sw.includes('shell-views-data.js'));

  for (const f of ['index.html', '404.html', 'sidepanel/index.html']) {
    const html = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    ok(`workspace · ${f} tem a seção "Views" (nova nota, nova view, busca e lista)`,
      ['id="asideViews"', 'id="asideViewsSearch"', 'id="asideViewsList"', 'id="btnNewBaseView"', 'id="btnNewNoteAside"', 'id="asideNewViewTypes"'].every(s => html.includes(s)) &&
      !html.includes('btnNewBaseAside'));
  }

  // ── Aside direita, seletor de tipo no header e animação de expandir ──
  const tr = await import('../sidepanel/modules/shell/shell-expand-transition.js');
  const box = { top: 50, left: 300, right: 1300, bottom: 800 };
  igual('expandir · recorte mostra só o item (topo/direita/base/esquerda)',
    tr.insetFor({ top: 150, left: 400, right: 700, bottom: 250 }, box), 'inset(100px 600px 550px 100px round 10px)');
  igual('expandir · item fora da tela não gera recorte negativo',
    tr.insetFor({ top: 0, left: 0, right: 100, bottom: 40 }, box), 'inset(0px 1200px 760px 0px round 10px)');
  igual('expandir · sem clique de origem não anima', tr.hasFreshOrigin(), false);

  const container2 = await readFile(new URL('../sidepanel/modules/bases/bases-view-container.js', import.meta.url), 'utf8');
  ok('aside direita · o painel de configuração da view monta no host da aside (settingsHost) e fecha a aside pelo X',
    container2.includes('options.settingsHost') && container2.includes('EVT_SETTINGS_OPEN') &&
    container2.includes('EVT_SETTINGS_CLOSED') && container2.includes('externalSettings'));
  ok('seletor de tipo · o painel troca o tipo da view ativa preservando nome e filtros (EVT_SET_TYPE)',
    container2.includes('EVT_SET_TYPE') && container2.includes('...createView(type, { id: atual.id, name: atual.name }), ...atual, type'));

  const right = await readFile(new URL('../sidepanel/modules/shell/shell-right-aside.js', import.meta.url), 'utf8');
  ok('aside direita · lembra aberta/largura, limita 260–560px e só aparece nas telas com painel (Base, nota, quadro)',
    right.includes("'quickdock:spatial:right-aside-open'") && right.includes("'quickdock:spatial:right-aside-width'") &&
    right.includes('RIGHT_ASIDE_MIN = 260') && right.includes('RIGHT_ASIDE_MAX = 560') &&
    right.includes('bases:') && right.includes('notes:') && right.includes('board:'));
  const asideMod = await import('../sidepanel/modules/shell/shell-right-aside.js');
  igual('aside direita · título por tela', [asideMod.ASIDE_MODES.bases, asideMod.ASIDE_MODES.notes, asideMod.ASIDE_MODES.board],
    ['CONFIGURAÇÕES DA VIEW', 'PAINEL DA NOTA', 'PAINEL DO QUADRO']);
  ok('aside direita · a nota move propriedades e sumário/backlinks para a aside e devolve ao sair',
    (await readFile(new URL('../sidepanel/modules/shell/shell-note-panel.js', import.meta.url), 'utf8')).includes("'note-properties-bar', 'note-outline-sidebar'") &&
    right.includes('showNotePanel(hosts.notes)') && right.includes('hideNotePanel(hosts.notes)'));
  ok('aside direita · o painel do quadro usa só a API exportada pelo motor (resumo, fundo, zoom, encaixar)',
    (await readFile(new URL('../sidepanel/modules/shell/shell-board-panel.js', import.meta.url), 'utf8')).includes('getBoardSummary') &&
    (await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8')).includes('export function setBoardBgMode') &&
    (await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8')).includes('export function setBoardZoomTo'));

  // ── Quadros como itens da Base do workspace ──
  const im = await import('../sidepanel/modules/workspace-items-model.js');
  const item = im.boardToItem({ id: 7, uid: 'b_1', title: 'Roadmap', pasta: 'Trabalho', createdAt: 1000, updatedAt: 2000, cards: [{}, {}], arrows: [{}] });
  igual('itens · quadro vira item com id "board-7"', item.id, 'board-7');
  ok('itens · o item-quadro tem formato de nota (título, pasta, datas) e a marca isBoard',
    item.title === 'Roadmap' && item.pasta === 'Trabalho' && item.createdAt === 1000 && item.updatedAt === 2000 && item.isBoard === true);
  igual('itens · conta cartões e conexões', [item.cardCount, item.arrowCount], [2, 1]);
  igual('itens · quadro sem data usa a de atualização', im.boardToItem({ id: 1, updatedAt: 55 }).createdAt, 55);
  ok('itens · reconhece e extrai o id do quadro', im.isBoardItemId('board-7') && !im.isBoardItemId(7) && !im.isBoardItemId('7') && im.boardIdFromItemId('board-7') === 7 && im.boardIdFromItemId(7) === null);
  igual('itens · notas e quadros ficam numa lista só', im.mergeWorkspaceItems([{ id: 1 }], [{ id: 9, title: 'Q' }]).map(i => i.id), [1, 'board-9']);

  const engine = await import('../sidepanel/modules/bases/bases-engine.js');
  igual('itens · propriedade "Tipo": quadro', engine.getNotePropertyValue(item, 'kind'), 'Quadro');
  igual('itens · propriedade "Tipo": nota', engine.getNotePropertyValue({ id: 1, title: 'x' }, 'tipo'), 'Nota');
  const schema = (await import('../sidepanel/modules/bases/bases-schema.js')).inferBaseSchema([]);
  ok('itens · "Tipo" é propriedade de sistema da Base', schema.kind?.isSystem === true && schema.kind?.label === 'Tipo');

  const openNote = await readFile(new URL('../sidepanel/modules/bases/open-note.js', import.meta.url), 'utf8');
  ok('itens · abrir um item-quadro a partir da Base dispara quickdock:open-board (não o editor de notas)',
    openNote.includes('isBoardItemId(noteId)') && openNote.includes("'quickdock:open-board'"));
  ok('itens · o painel do workspace carrega notas + quadros; Bases embutidas só notas',
    container2.includes('options.panel ? loadWorkspaceItems() : loadAllNotesMeta()'));
  const storage = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
  ok('itens · editar título/pasta de um item-quadro grava no quadro (não quebra a tabela de notas)',
    storage.includes("id.startsWith('board-')") && storage.includes('db.boards.update(Number(id.slice(6))'));
  ok('shell · o app abre o quadro pedido pela Base e tem botão "Novo quadro" na aside esquerda',
    (await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8')).includes("'quickdock:open-board'") &&
    (await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8')).includes('switchBoard(Number(id))') &&
    (await readFile(new URL('../sidepanel/modules/shell/shell-views-list.js', import.meta.url), 'utf8')).includes('btnNewBoardAside'));
  const shell2 = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  ok('shell · nota/quadro crescem a partir do item (playExpandOpen) e o voltar encolhe (playCollapseClose)',
    shell2.includes('playExpandOpen(') && shell2.includes('playCollapseClose(') && shell2.includes('trackExpandOrigin(') &&
    shell2.includes('initRightAside()') && shell2.includes('initViewSwitcher()'));
  const sw2 = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  ok('shell · os módulos da aside direita, do seletor e da animação estão no pré-cache do PWA',
    ['shell-right-aside', 'shell-view-switcher', 'shell-expand-transition'].every(f => sw2.includes(`sidepanel/modules/shell/${f}.js`)));
  const css2 = await readFile(new URL('../sidepanel/css/35-shell-v2.css', import.meta.url), 'utf8');
  ok('shell · grade desktop com a coluna da aside direita e o seletor de tipo expansível no header',
    css2.includes('#mRightAside') && css2.includes('is-right-aside-collapsed') && css2.includes('.view-switcher') && css2.includes('is-switcher-open'));
  for (const f of ['index.html', '404.html', 'sidepanel/index.html']) {
    const html = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    ok(`shell · ${f} tem a aside direita, a alça de redimensionar, o botão de configurações e o seletor de tipo`,
      ['id="mRightAside"', 'id="rightAsideResizer"', 'id="rightAsideViewHost"', 'id="rightAsideViewTools"', 'id="rightAsideNoteHost"', 'id="rightAsideBoardHost"', 'id="btnViewSettings"', 'id="viewSwitcherList"', 'id="btnNewBoardAside"'].every(s => html.includes(s)));
  }

  // ── Animações de abertura (liga/desliga próprio; não herda "reduzir movimento" do sistema) ──
  const motionSrc = await readFile(new URL('../sidepanel/modules/shell/shell-motion.js', import.meta.url), 'utf8');
  ok('animações · a chave de movimento do shell é própria (localStorage), ligada por padrão',
    motionSrc.includes("'quickdock:spatial:animations'") && motionSrc.includes("!== '0'") && !motionSrc.includes('matchMedia'));
  const exp = await readFile(new URL('../sidepanel/modules/shell/shell-expand-transition.js', import.meta.url), 'utf8');
  ok('animações · abrir item usa a chave própria (não o prefers-reduced-motion) e revela o conteúdo depois',
    exp.includes('motionEnabled') && !exp.includes('matchMedia') && exp.includes('delay: 160'));
  const rightSrc = await readFile(new URL('../sidepanel/modules/shell/shell-right-aside.js', import.meta.url), 'utf8');
  ok('animações · a aside direita abre deslizando e a esquerda também', rightSrc.includes('slideIn(aside, 28)') &&
    (await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8')).includes("slideIn(document.getElementById('mAside'), -28)"));
  ok('animações · trocar de tela e de view aparece suavemente (fadeIn)',
    (await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8')).includes('fadeIn(document.querySelector(') &&
    (await readFile(new URL('../sidepanel/modules/bases-view.js', import.meta.url), 'utf8')).includes("fadeIn(bodyEl.querySelector('.base-viewport'))"));
  for (const f of ['index.html', '404.html', 'sidepanel/index.html']) {
    const html = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    ok(`animações · ${f} tem o toggle "Animações de abertura" em Configurações`, html.includes('id="settings-animations"'));
  }
  ok('animações · shell-motion.js está no pré-cache do PWA', (await readFile(new URL('../sw.js', import.meta.url), 'utf8')).includes('sidepanel/modules/shell/shell-motion.js'));

  // ── Expandir a célula do mês (listras da grade correndo até as bordas, como no mockup) ──
  const monthExp = await readFile(new URL('../sidepanel/modules/shell/shell-month-expand.js', import.meta.url), 'utf8');
  ok('mês · a célula expande animando as trilhas da grade (linhas, colunas e cabeçalho dos dias) e o voltar as devolve',
    monthExp.includes('gridTemplateRows') && monthExp.includes('gridTemplateColumns') && monthExp.includes("'is-cell-expanding'") &&
    monthExp.includes('export function expandMonthCell') && monthExp.includes('export function collapseMonthCell') &&
    monthExp.includes('export function resetMonthExpansion') && monthExp.includes('weekdays.style.height'));
  ok('mês · o voltar mede o tamanho natural da grade antes de recolher (a grade pode não ter sido redesenhada)',
    monthExp.includes('resetMonthExpansion();\n  void root.offsetHeight;\n  const natural = measure(root, cell);'));
  const shellSrc = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  ok('mês · o shell expande a célula ANTES de trocar de tela e não usa requestAnimationFrame para recolher',
    shellSrc.includes('expandMonthCell(cell,') && shellSrc.includes("openOrFocusView(viewId, { skipTransition: true })") &&
    shellSrc.includes('collapseMonthCell();') && !shellSrc.includes('requestAnimationFrame(() => collapseMonthCell'));
  ok('mês · voltar à Base por outro caminho não deixa a grade expandida (resetMonthExpansion)',
    shellSrc.includes("viewId === 'bases') resetMonthExpansion()"));
  const origin2 = await readFile(new URL('../sidepanel/modules/shell/shell-expand-transition.js', import.meta.url), 'utf8');
  ok('mês · o clique de origem guarda a célula do mês (getMonthOriginCell)', origin2.includes('.bcal-month-cell[data-ymd]') && origin2.includes('export function getMonthOriginCell'));
  const cssMonth = await readFile(new URL('../sidepanel/css/35-shell-v2.css', import.meta.url), 'utf8');
  ok('mês · CSS: transições das trilhas, células recolhidas sem conteúdo e célula expandida como nova tela',
    cssMonth.includes('.bcal-month.is-cell-animating') && cssMonth.includes('.is-expanded-cell') && cssMonth.includes('is-cell-revealing') &&
    cssMonth.includes('grid-template-rows 340ms'));
  ok('mês · shell-month-expand.js está no pré-cache do PWA', (await readFile(new URL('../sw.js', import.meta.url), 'utf8')).includes('sidepanel/modules/shell/shell-month-expand.js'));

  // ── Ferramentas da view (mês, busca, filtro, Nova Nota) na aside direita ──
  const calView = await readFile(new URL('../sidepanel/modules/bases/bases-calendar-view.js', import.meta.url), 'utf8');
  ok('ferramentas na aside · a barra do calendário vai para callbacks.toolbarHost quando existe (e some o botão de configurar)',
    calView.includes('callbacks.toolbarHost.replaceChildren(barra)') && calView.includes('callbacks.toolbarHost ? undefined : callbacks.onOpenSettings'));
  const cont3 = await readFile(new URL('../sidepanel/modules/bases/bases-view-container.js', import.meta.url), 'utf8');
  ok('ferramentas na aside · busca/exportar/Nova Nota, filtro rápido e barra do calendário montam no toolsHost do painel',
    cont3.includes('options.panel ? options.toolsHost : null') && cont3.includes('toolsHost.append(calBarEl, headerEl)') &&
    cont3.includes('toolbarHost: calBarEl') && cont3.includes('calBarEl?.replaceChildren()'));
  ok('ferramentas na aside · a aside direita abre por padrão e mostra a zona de ferramentas só junto da Base',
    right.includes("readStore(KEY_OPEN) !== '0'") && right.includes("hosts.tools.hidden = !(cfg && focus === 'bases')"));

  // ── P1 · Constelações como modo da aside direita ──
  const graphPanel = await readFile(new URL('../sidepanel/modules/shell/shell-graph-panel.js', import.meta.url), 'utf8');
  const swSrc = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  ok('constelações · host nos 3 HTMLs',
    (await Promise.all(['../index.html', '../404.html', '../sidepanel/index.html'].map(p => readFile(new URL(p, import.meta.url), 'utf8'))))
      .every(h => h.includes('id="rightAsideGraphHost"')));
  ok('constelações · aside tem modo grafo, botão hub e lembra o último modo',
    right.includes("GRAPH_TITLE = 'CONSTELAÇÕES'") && right.includes('data-aside-graph') && right.includes('dataset.asideGraph') && right.includes('KEY_MODE'));
  ok('constelações · o painel move o contêiner do canvas e devolve ao sair; pré-cache no sw.js',
    graphPanel.includes('host.appendChild(el)') && graphPanel.includes('origin.parent.insertBefore') && swSrc.includes('shell/shell-graph-panel.js'));
  ok('ferramentas na aside · CSS da zona de ferramentas', (await readFile(new URL('../sidepanel/css/35-shell-v2.css', import.meta.url), 'utf8')).includes('.right-aside-view-tools .bcal-toolbar'));

  // ── A célula expande até o cabeçalho da tela (ele não "pisca" na troca) ──
  ok('mês · a célula também engole o cabeçalho da tela e o seletor de tipo (altura somada às trilhas)',
    monthExp.includes("getElementById('basesSectionHeader')") && monthExp.includes('natural.weeksH + natural.weekdaysH + natural.headerH') &&
    monthExp.includes("header.style.height = '0px'") && monthExp.includes("'is-month-expanding'"));
  ok('mês · CSS: o cabeçalho da tela recolhe e some junto com a expansão',
    cssMonth.includes('#bases-view.is-month-expanding > #basesSectionHeader') && cssMonth.includes('#bases-view.is-month-animating > #basesSectionHeader'));
}