// Testes da Base única do workspace (modelo puro), da lista de views da aside esquerda
// e dos pedidos de view para o painel de Bases.
import { readFile } from 'node:fs/promises';

export async function runShellViewsListTests({ ok, igual }) {
  const m = await import('../sidepanel/modules/workspace-base-model.js');
  const req = await import('../sidepanel/modules/bases/engine/view-request.js');

  // Base inicial
  const def = m.defaultWorkspaceDef();
  igual('workspace · a Base inicial tem calendário, tabela, galeria e explorador', def.views.map(v => v.type), ['calendar', 'table', 'gallery', 'explorer']);
  igual('workspace · abre no calendário (como o mockup)', def.defaultViewId, 'v_calendario');
  igual('workspace · origem = todos os itens', def.source, { all: true });

  // Leitura do YAML guardado
  igual('workspace · YAML vazio volta para a Base inicial', m.parseWorkspaceDef('').views.length, 4);
  igual('workspace · YAML sem views volta para a Base inicial', m.parseWorkspaceDef('name: X\n').views.length, 4);
  const yaml = m.workspaceDefToYaml(def);
  igual('workspace · YAML gravado e relido mantém as views', m.parseWorkspaceDef(yaml).views.map(v => v.name), ['Calendário', 'Tabela', 'Galeria', 'Explorador']);
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
  igual('rascunho · salvar como nova põe a cópia no fim, com o conteúdo do rascunho', [nova.def.views.length, nova.def.views[4].sort, nova.def.views[4].id === nova.id], [5, mudado.views[1].sort, true]);
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

  // P5 · aparência dos itens
  for (const [arq, marca] of [['calendar/calendar-event-el.js', "dataset.kind = 'quadro'"], ['bases-gallery-view.js', "dataset.kind = 'quadro'"], ['bases-board-view.js', "dataset.kind = 'quadro'"],
    ['bases-list-view.js', "dataset.kind = 'quadro'"], ['bases-table-view.js', "dataset.kind = 'quadro'"]]) {
    ok(`quadros · ${arq} marca o item-quadro com data-kind`, (await readFile(new URL(`../sidepanel/modules/bases/${arq}`, import.meta.url), 'utf8')).includes(marca));
  }
  ok('quadros · calendário sem "colorir por" usa a pasta como cor', (await readFile(new URL('../sidepanel/modules/bases/calendar/calendar-event-el.js', import.meta.url), 'utf8')).includes('hueForValue(ev.note?.pasta)'));
  ok('quadros · views novas do workspace incluem a coluna Tipo', m.defaultWorkspaceDef().views.find(v => v.type === 'table').props.includes('kind') && m.addWorkspaceView(def, 'gallery').def.views[4].props.includes('kind') && !m.addWorkspaceView(def, 'calendar').def.views[4].props);

  // P6 · miniatura do quadro
  const th = await import('../sidepanel/modules/shell/board-thumb.js');
  const exemplo = th.lightBoard(
    [{ id: 'a', x: 0, y: 0, w: 200, h: 100, color: 'blue' }, { id: 'b', x: 300, y: 50, w: 200, h: 100 }, { id: 'c', x: 600, y: 0, w: 200, h: 100, color: 'red', texto: 'x' }],
    [{ from: 'a', to: 'b', style: 'solid' }, { from: 'b', to: 'zzz' }]);
  const svg = th.boardThumbSvg(exemplo);
  igual('miniatura · um retângulo por cartão e linha só para setas válidas', [(svg.match(/<rect/g) || []).length, (svg.match(/<line/g) || []).length], [3, 1]);
  ok('miniatura · viewBox fixo e cores em OKLCH (sem hex)', svg.includes('viewBox="0 0 160 100"') && svg.includes('oklch(') && !/#[0-9a-f]{3,6}\b/i.test(svg));
  igual('miniatura · quadro vazio não desenha retângulos', (th.boardThumbSvg({ cards: [], arrows: [] }).match(/<rect/g) || []).length, 0);
  igual('miniatura · o item leve só leva x, y, w, h, cor e id', Object.keys(exemplo.cards[2]).sort(), ['color', 'h', 'id', 'w', 'x', 'y']);
  igual('miniatura · o item-quadro carrega a miniatura leve', (await import('../sidepanel/modules/workspace-items-model.js')).boardToItem({ id: 3, cards: [{ id: 'a', x: 1, y: 2, w: 3, h: 4 }], arrows: [] }).thumb.cards.length, 1);
  ok('miniatura · a galeria usa a miniatura quando o quadro não tem capa', (await readFile(new URL('../sidepanel/modules/bases/bases-gallery-view.js', import.meta.url), 'utf8')).includes('boardThumbSvg(note.thumb)'));

  // P7 · legenda de grupos
  const gm = await import('../sidepanel/modules/shell/view-groups-model.js');
  const grupos = gm.groupsFromItems([{ pasta: 'Trabalho' }, { pasta: 'Trabalho' }, { pasta: '' }, {}, { pasta: 'Casa' }]);
  igual('grupos · conta por pasta, maiores primeiro, sem pasta com rótulo próprio', grupos.map(g => [g.label, g.count]), [['Sem pasta', 2], ['Trabalho', 2], ['Casa', 1]]);
  igual('grupos · sem pasta não tem matiz (cor neutra); com pasta tem', [grupos.find(g => g.key === '').hue, typeof grupos.find(g => g.key === 'Casa').hue], [null, 'number']);
  const vc = await readFile(new URL('../sidepanel/modules/bases/bases-view-container.js', import.meta.url), 'utf8');
  ok('grupos · o painel anuncia os grupos e atende o filtro rápido por pasta', vc.includes('announceGroups(groupsFromItems(sortedNotes)') && vc.includes('onGroupFilterRequest') && vc.includes('EVT_GROUP_FILTER'));
  ok('grupos · host nos 3 HTMLs e módulos no pré-cache',
    (await Promise.all(['../index.html', '../404.html', '../sidepanel/index.html'].map(p => readFile(new URL(p, import.meta.url), 'utf8')))).every(h => h.includes('id="asideGroups"')) &&
    ['shell-view-groups', 'view-groups-model'].every(n => swP4.includes(`shell/${n}.js`)));

  // P3 · expansão da coluna na semana/dia
  const weekExp = await readFile(new URL('../sidepanel/modules/shell/shell-week-expand.js', import.meta.url), 'utf8');
  ok('semana · mesma API do mês (expand/collapse/reset/active/can)',
    ['expandWeekColumn', 'collapseWeekColumn', 'resetWeekExpansion', 'canExpandWeekColumn', 'weekExpansionActive'].every(n => weekExp.includes(`export function ${n}`) || weekExp.includes(`export const ${n}`)));
  ok('semana · anima as trilhas de colunas do cabeçalho, da faixa "dia inteiro" e do corpo, sem requestAnimationFrame',
    weekExp.includes('.bcal-time-head') && weekExp.includes('.bcal-allday') && weekExp.includes('.bcal-time-inner') && weekExp.includes('gridTemplateColumns') && !weekExp.includes('requestAnimationFrame'));
  ok('semana · o reset devolve as colunas originais do renderer e limpa classes', weekExp.includes('saved.get(inner)') && weekExp.includes("'is-col-expanding', 'is-col-animating', 'is-col-revealing'"));
  ok('semana · o clique guarda a coluna de origem e o shell escolhe mês ou semana',
    (await readFile(new URL('../sidepanel/modules/shell/shell-expand-transition.js', import.meta.url), 'utf8')).includes("weekCol: e.target.closest?.('.bcal-col[data-ymd]')") &&
    ss.includes('expandWeekColumn(col,') && ss.includes('collapseWeekColumn()'));
  ok('semana · CSS das colunas e módulos no pré-cache', (await readFile(new URL('../sidepanel/css/35-shell-v2.css', import.meta.url), 'utf8')).includes('.bcal-time.is-col-animating') && ['shell-week-expand', 'shell-expand-shared'].every(n => swP4.includes(`shell/${n}.js`)));

  // E4/E6/E7 · lote com quadros, leitura fundida, teclado
  const bulk = await import('../sidepanel/modules/bases/engine/bulk-actions.js');
  const quadro = { id: 'board-1', isBoard: true, pasta: 'A', properties: {} };
  igual('lote · propriedade e tag não se aplicam a quadros', [bulk.buildBulkPatch(quadro, { kind: 'addTag', tag: 'x' }), bulk.buildBulkPatch(quadro, { kind: 'setProperty', key: 'k', value: 1 })], [null, null]);
  igual('lote · mover quadro de pasta vale', bulk.buildBulkPatch(quadro, { kind: 'moveFolder', pasta: 'B' }), { pasta: 'B' });
  igual('lote · nota continua recebendo tag', bulk.buildBulkPatch({ id: 1, properties: {} }, { kind: 'addTag', tag: 'x' }).properties.tags, ['x']);
  ok('lote · excluir em lote exclui quadros pelo motor (removeBoard)', (await readFile(new URL('../sidepanel/modules/bases/bases-bulk-controller.js', import.meta.url), 'utf8')).includes('removeBoard(n.uid)'));
  const wi = await readFile(new URL('../sidepanel/modules/workspace-items.js', import.meta.url), 'utf8');
  ok('desempenho · leituras simultâneas dos itens se fundem (uma em andamento + uma seguinte)', wi.includes('let followUp') && wi.includes('inflight.catch(() => {}).then(') && wi.includes('export function loadWorkspaceItems'));
  ok('teclado · setas percorrem a lista de views', (await readFile(new URL('../sidepanel/modules/shell/shell-views-list.js', import.meta.url), 'utf8')).includes("e.key !== 'ArrowDown' && e.key !== 'ArrowUp'"));

  // Quadros no grafo
  const gb = await import('../sidepanel/modules/shell/graph-board-nodes.js');
  const nos = gb.boardGraphNodes([{ id: 4, uid: 'b_x', title: 'Q', pasta: 'P' }, { id: 5 }]);
  igual('grafo · quadros viram nós sem aresta, com id de abertura', [nos[0].id, nos[0].boardId, nos[0].isBoard, nos[0].degree, nos[1].id, nos[1].title], ['b_x', 4, true, 0, 'board-5', 'Quadro sem título']);
  const gv = await readFile(new URL('../sidepanel/modules/graph-view.js', import.meta.url), 'utf8');
  ok('grafo · clicar num quadro dispara open-board', gv.includes('boardGraphNodes(await loadAllBoards()') && gv.includes("'quickdock:open-board'"));

  // E1 · sincronização da Base do workspace
  const ws = await import('../sidepanel/modules/workspace-base-sync.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const decide = (l, b, r) => ws.decidirSyncWorkspace({ localHash: l, baseHash: b, remoteHash: r });
  igual('sync base · tabela de decisão', [decide(null, null, null), decide('a', null, null), decide(null, null, 'r'), decide('a', 'a', 'a'), decide('l', 'b', 'b'), decide('b', 'b', 'r'), decide('l', 'b', 'r'), decide('l', null, 'r')],
    ['nada', 'subir', 'baixar', 'nada', 'subir', 'baixar', 'conflito', 'conflito']);
  igual('sync base · arquivo ilegível ou de outro tipo não é aceito', [ws.lerConfigWorkspace('{'), ws.lerConfigWorkspace('{"tipo":"x","yaml":"a"}'), ws.lerConfigWorkspace(ws.serializarConfigWorkspace('name: A\n'))], [null, null, 'name: A\n']);
  const mkAparelho = (yaml0) => {
    let yaml = yaml0, copia = null; const metas = new Map();
    return {
      local: { ler: () => yaml, gravar: y => { yaml = y; }, guardarCopia: y => { copia = y; } },
      meta: { obter: async k => metas.get(k), salvar: async (k, v) => { metas.set(k, v); } },
      get yaml() { return yaml; }, set yaml(v) { yaml = v; }, get copia() { return copia; },
    };
  };
  const nuvem = new MemorySyncAdapter();
  const A = mkAparelho('name: A\nviews: v1\n'), Bp = mkAparelho(null);
  igual('sync base · A sobe a primeira vez', await ws.sincronizarConfigWorkspace(nuvem, A.local, A.meta), 'subiu');
  igual('sync base · B (nunca mexeu) baixa', [await ws.sincronizarConfigWorkspace(nuvem, Bp.local, Bp.meta), Bp.yaml], ['baixou', 'name: A\nviews: v1\n']);
  igual('sync base · nada muda → nada', await ws.sincronizarConfigWorkspace(nuvem, A.local, A.meta), 'nada');
  A.yaml = 'name: A\nviews: v2\n';
  igual('sync base · A editou → sobe', await ws.sincronizarConfigWorkspace(nuvem, A.local, A.meta), 'subiu');
  igual('sync base · B recebe a edição de A', [await ws.sincronizarConfigWorkspace(nuvem, Bp.local, Bp.meta), Bp.yaml], ['baixou', 'name: A\nviews: v2\n']);
  A.yaml = 'name: A\nviews: v3-de-A\n'; Bp.yaml = 'name: A\nviews: v3-de-B\n';
  await ws.sincronizarConfigWorkspace(nuvem, A.local, A.meta);
  igual('sync base · edição dos dois lados: o remoto vence e o local vira cópia', [await ws.sincronizarConfigWorkspace(nuvem, Bp.local, Bp.meta), Bp.yaml, Bp.copia], ['conflito', 'name: A\nviews: v3-de-A\n', 'name: A\nviews: v3-de-B\n']);
  const ruim = new MemorySyncAdapter(); await ruim.escrever(ws.CAMINHO_CONFIG_WORKSPACE, 'lixo', null);
  const C = mkAparelho('name: C\n');
  igual('sync base · remoto ilegível não é sobrescrito nem baixado', [await ws.sincronizarConfigWorkspace(ruim, C.local, C.meta), C.yaml], ['nada', 'name: C\n']);
  ok('sync base · o controlador sincroniza a Base depois do motor e o app agenda a rodada ao salvar',
    (await readFile(new URL('../sidepanel/modules/sync-controller.js', import.meta.url), 'utf8')).includes('await this._sincronizarBaseDoWorkspace()') &&
    (await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8')).includes("'quickdock:workspace-base-saved'") &&
    swP4.includes('workspace-base-sync.js'));

  // Explorador como view
  const et = await import('../sidepanel/modules/bases/explorer/explorer-tree.js');
  const arvore = et.buildFolderTree([
    { id: 1, title: 'b', pasta: 'Trabalho/Projetos' }, { id: 2, title: 'a', pasta: 'Trabalho' }, { id: 3, title: 'solta' },
    { id: 4, title: 'c', pasta: '/Casa/' }, { id: 5, title: 'q', pasta: 'Trabalho/Projetos' }]);
  igual('explorador · pastas em ordem, com contagem recursiva', arvore.folders.map(f => [f.path, f.count]), [['Casa', 1], ['Trabalho', 3]]);
  igual('explorador · subpasta criada pelo caminho, itens ordenados por título', [arvore.folders[1].folders[0].path, arvore.folders[1].folders[0].items.map(i => i.title)], ['Trabalho/Projetos', ['b', 'q']]);
  igual('explorador · itens sem pasta ficam na raiz e a raiz conta tudo', [arvore.items.map(i => i.title), arvore.count], [['solta'], 5]);
  igual('explorador · todas as pastas, incluindo as aninhadas', et.allFolderPaths(arvore), ['Casa', 'Trabalho', 'Trabalho/Projetos']);
  igual('explorador · entrar em uma pasta: folderAt / parentPath / breadcrumb', [et.folderAt(arvore, 'Trabalho/Projetos').items.length, et.folderAt(arvore, 'x/y'), et.parentPath('A/B/C'), et.parentPath('A'), et.breadcrumb('A/B').map(c => c.path)], [2, null, 'A/B', '', ['', 'A', 'A/B']]);
  igual('explorador · pastas vazias criadas pela pessoa entram na árvore', et.buildFolderTree([], ['Nova/Sub']).folders[0].folders[0].path, 'Nova/Sub');
  igual('explorador · pasta que sumiu volta para a mais próxima que existe', [et.nearestExistingFolder(arvore, 'Trabalho/Projetos/Velho'), et.nearestExistingFolder(arvore, 'Nada/Mais')], ['Trabalho/Projetos', '']);
  igual('explorador · tipo e busca achatada', [et.kindLabel({ isBoard: true }), et.kindLabel({}), et.flattenItems(arvore).length], ['Quadro', 'Nota', 5]);
  const exSrc = await readFile(new URL('../sidepanel/modules/bases/explorer/explorer-view.js', import.meta.url), 'utf8');
  ok('explorador · estilo Windows: endereço, subir/voltar, duplo clique, Backspace, colunas, ícones, nova pasta',
    ['bex-crumbs', "'Subir um nível (Backspace)'", "addEventListener('dblclick'", "e.key === 'Backspace'", 'Data de modificação', "' Ícones'", 'Nova pasta'].every(x => exSrc.includes(x)));
  igual('explorador · mover para a mesma pasta não faz nada; para outra, sim', [et.canMoveToFolder({ pasta: 'A/' }, 'A'), et.canMoveToFolder({ pasta: 'A' }, ''), et.canMoveToFolder({}, '')], [false, true, false]);
  const vmod = await import('../sidepanel/modules/bases/config/view-model.js');
  ok('explorador · é um tipo de view registrado, criável pela aside e desenhado pelo pipeline',
    'explorer' in vmod.VIEW_TYPES && m.NEW_VIEW_TYPES.includes('explorer') &&
    (await readFile(new URL('../sidepanel/modules/bases/bases-view-pipeline.js', import.meta.url), 'utf8')).includes('explorer: renderBaseExplorerView'));
  ok('explorador · arrastar para pasta grava a pasta; CSS e módulos no pré-cache',
    vc.includes('onMoveToFolder') && (await readFile(new URL('../sidepanel/style.css', import.meta.url), 'utf8')).includes('36-explorer-view.css') &&
    ['css/36-explorer-view.css', 'bases/explorer/explorer-tree.js', 'bases/explorer/explorer-view.js'].every(n => swP4.includes(n)));

  // Constelações · quick bar e câmera
  const gq = await readFile(new URL('../sidepanel/modules/shell/shell-graph-quickbar.js', import.meta.url), 'utf8');
  ok('constelações · quick bar: zoom, centralizar, reorganizar e painéis que movem as seções de configuração',
    ['#btn-graph-zoom-in', '#btn-graph-zoom-reset', '#btn-graph-reheat', 'Filtros e exibição', 'Física e forças'].every(x => gq.includes(x)) && gq.includes('current === null') && gq.includes('giveBackSections'));
  const gvSrc = await readFile(new URL('../sidepanel/modules/graph-view.js', import.meta.url), 'utf8');
  ok('constelações · a câmera recentraliza ao iniciar, ao assentar a simulação e ao redimensionar (se não foi mexida)',
    gvSrc.includes('let cameraTouched') && gvSrc.includes('if (!cameraTouched) resetCamera(false); // o layout assentou') && gvSrc.includes('reenquadra no novo tamanho') && gvSrc.includes('panX += (w - lastCanvasW) / 2'));
  ok('constelações · CSS e módulo da quick bar no pré-cache e no style.css',
    (await readFile(new URL('../sidepanel/style.css', import.meta.url), 'utf8')).includes('37-graph-quickbar.css') && ['css/37-graph-quickbar.css', 'shell/shell-graph-quickbar.js'].every(n => swP4.includes(n)));

  const np = await readFile(new URL('../sidepanel/modules/shell/shell-note-panel.js', import.meta.url), 'utf8');
  ok('painel da nota · menu Ações com "Excluir nota" (usa deleteNoteById e some ao sair da nota)',
    np.includes('data-note-delete') && np.includes('deleteNoteById') && np.includes("querySelector('[data-note-actions]')?.remove()") &&
    (await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8')).includes('export async function deleteNoteById'));

  const trans = await readFile(new URL('../sidepanel/modules/shell/shell-expand-transition.js', import.meta.url), 'utf8');
  ok('abrir/fechar · o recorte acompanha o retângulo REAL da célula/coluna (contorno de 1px à mostra) e cabeçalho/conteúdo aparecem aos poucos',
    trans.includes("'#bases-body .is-expanded-cell, #bases-body .is-expanded-col'") && trans.includes('const OUTLINE = 1') && trans.includes('getBoundingClientRect()') && trans.includes('header ? p * 1.4'));
  ok('abrir/fechar · a Base não é escondida nem reordenada durante a animação (display:none/mover nós cancelam as transições da grade)',
    ss.includes('if (!overlayOpen && !overlayClose) reorderMainSections()') && ss.includes('keepVisibleIds.has(id)'));

  ok('abrir · pedidos repetidos durante a animação (a ativação da nota chama openOrFocusView de novo) são ignorados',
    ss.includes('if (monthExpanding && !skipTransition && !overlayOpen && !overlayClose) return;'));

  ok('abrir · sem piscar: seção sobreposta antes do foco mudar, tamanho explícito e recorte/fade já no 1º quadro',
    ss.indexOf("classList.add('is-expand-overlay')") < ss.indexOf('keepVisibleIds = overlayOpen') &&
    trans.includes('frame(start);') && (await readFile(new URL('../sidepanel/css/35-shell-v2.css', import.meta.url), 'utf8')).includes('height: 100% !important;'));

  // Mobile · nav inferior + drawers (esquerdo: painéis; direito: #mRightAside) + gestos
  const mcss = await readFile(new URL('../sidepanel/css/38-mobile-shell-v2.css', import.meta.url), 'utf8');
  ok('mobile · CSS: nav inferior, só os painéis novos no drawer esquerdo, #mRightAside como drawer, views enxutas',
    ['#mNav {', 'html #mAside #asideModels', '#mRightAside {', '--right-x', '.bcal-month-cell .bcal-ev', '.bex-cell-date'].every(x => mcss.includes(x)) &&
    (await readFile(new URL('../sidepanel/style.css', import.meta.url), 'utf8')).includes('38-mobile-shell-v2.css'));
  ok('mobile · nenhuma cor literal (hex/rgb) no CSS novo', !/#[0-9a-fA-F]{3,8}\b(?![\w-])(?=[;\s,)])/.test(mcss.replace(/#m\w+|#app|#asid\w+|#board\w*|#bases\w*|#section\w*|#btn[\w-]*|#rightAsideResizer|#settings[\w-]*/g, '')) && !/rgba?\(/.test(mcss));
  const raSrc = await readFile(new URL('../sidepanel/modules/shell/shell-right-aside.js', import.meta.url), 'utf8');
  ok('mobile · a aside direita vira drawer (estado próprio, não gravado) e tem API setRightAsideOpen/isRightAsideOpen',
    raSrc.includes('export function setRightAsideOpen') && raSrc.includes('export const isRightAsideOpen') && raSrc.includes('let mobileOpen') && raSrc.includes("classList.toggle('is-open-mobile', visible)"));
  const smSrc = await readFile(new URL('../sidepanel/modules/shell/shell-mobile.js', import.meta.url), 'utf8');
  const sgSrc = await readFile(new URL('../sidepanel/modules/shell/shell-mobile-gestures.js', import.meta.url), 'utf8');
  ok('mobile · o drawer direito e os gestos usam #mRightAside; para fechar vale começar o gesto em botão',
    smSrc.includes('setRightAsideOpen(true)') && !smSrc.includes("getElementById('mobileRightDrawer')") && sgSrc.includes("getElementById('mRightAside')") && sgSrc.includes('const onButton'));
  ok('mobile · a nav troca o painel do drawer; o voltar tem a Base como raiz; título da pílula acompanha a view',
    ss.includes('closeMobileLeftDrawer()') && (await readFile(new URL('../sidepanel/modules/shell/shell-mobile-back.js', import.meta.url), 'utf8')).includes("ROOT_VIEW = 'bases'") &&
    (await readFile(new URL('../sidepanel/modules/shell/shell-mobile-title.js', import.meta.url), 'utf8')).includes('closeMobileLeftDrawer') && swP4.includes('shell/shell-mobile-title.js') && swP4.includes('css/38-mobile-shell-v2.css'));
  ok('mobile · usar nota modelo abre a tela de notas; Explorador abre com um toque', (await readFile(new URL('../sidepanel/modules/shell/shell-models-panel.js', import.meta.url), 'utf8')).includes("openView('notes')") && exSrc.includes('touchOpen'));

  // Criar / duplicar / renomear / excluir
  const a = m.addWorkspaceView(def, 'board');
  igual('workspace · nova view entra no fim com o tipo pedido', a.def.views[4].type, 'board');
  igual('workspace · devolve o id da nova view', a.def.views[4].id, a.id);
  igual('workspace · tipo desconhecido vira tabela', m.addWorkspaceView(def, 'xyz').def.views[4].type, 'table');
  igual('workspace · nome repetido ganha número', m.addWorkspaceView(def, 'calendar').def.views[4].name, 'Calendário 2');
  const d = m.duplicateWorkspaceView(def, 'v_tabela');
  igual('workspace · duplicar põe a cópia logo depois da original', d.baseDef.views[2].name, 'Tabela (cópia)');
  igual('workspace · renomear', m.renameWorkspaceView(def, 'v_tabela', 'Notas').views[1].name, 'Notas');
  const del = m.deleteWorkspaceView(def, 'v_tabela', 'v_tabela');
  igual('workspace · excluir remove a view', del.def.views.length, 3);
  igual('workspace · excluir a ativa passa para a vizinha', del.activeId, 'v_galeria');
  const so = { ...def, views: [def.views[0]] };
  igual('workspace · a última view nunca é excluída', m.deleteWorkspaceView(so, so.views[0].id, so.views[0].id).def.views.length, 1);

  // Busca
  igual('workspace · busca vazia devolve tudo', m.filterWorkspaceViews(def.views, '').length, 4);
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
  ok('animações · abrir item usa a chave própria (não o prefers-reduced-motion) e revela o conteúdo desde o primeiro quadro (sem esperar terminar)',
    exp.includes('motionEnabled') && !exp.includes('matchMedia') && !exp.includes('delay: 160') && exp.includes('export function playOverlayOpen') && exp.includes('export function playOverlayClose'));
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
  ok('mês · a nota/quadro abre JUNTO com a expansão da célula (por cima da Base) e fecha do mesmo jeito, sem requestAnimationFrame para recolher',
    shellSrc.includes('expandMonthCell(cell,') && shellSrc.includes("openOrFocusView(viewId, { skipTransition: true, overlayOpen: true })") &&
    shellSrc.includes('overlayClose: document.querySelector(sel)') && shellSrc.includes('keepVisibleIds') &&
    shellSrc.includes('collapseMonthCell();') && !shellSrc.includes('requestAnimationFrame(() => collapseMonthCell'));
  ok('mês · voltar à Base por outro caminho não deixa a grade expandida (resetMonthExpansion)',
    shellSrc.includes("viewId === 'bases') { resetMonthExpansion(); resetWeekExpansion(); }"));
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
    (await readFile(new URL('../sidepanel/modules/shell/shell-expand-shared.js', import.meta.url), 'utf8')).includes("getElementById('basesSectionHeader')") && monthExp.includes('natural.weeksH + natural.weekdaysH + natural.headerH') &&
    monthExp.includes("header.style.height = '0px'") && monthExp.includes("'is-month-expanding'"));
  ok('mês · CSS: o cabeçalho da tela recolhe e some junto com a expansão',
    cssMonth.includes('#bases-view.is-month-expanding > #basesSectionHeader') && cssMonth.includes('#bases-view.is-month-animating > #basesSectionHeader'));
}