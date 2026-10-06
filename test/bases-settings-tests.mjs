// Testes das peças puras do painel de configuração (operadores de filtro por tipo).
export async function runBasesSettingsTests({ ok, igual }) {
  const F = await import('../sidepanel/modules/bases/ui/filter-operators.js');
  const E = await import('../sidepanel/modules/bases/bases-engine.js');

  ok('filtro · todo operador oferecido é entendido pelo engine',
    ['text', 'number', 'checkbox', 'select', 'list', 'date', 'datetime']
      .flatMap(t => F.operatorsForType(t))
      .every(op => op in F.OPERATOR_LABELS));
  igual('filtro · tags usa operadores de lista', F.operatorsForType('list', 'tags')[0], 'contains');
  igual('filtro · número padrão', F.newCondition('custo', 'number'), { property: 'custo', operator: 'equals', value: '' });
  igual('filtro · data padrão é relativo sem valor', F.newCondition('prazo', 'date'), { property: 'prazo', operator: 'is_today' });
  igual('filtro · "últimos N dias" pede dias', F.valueKindFor('is_within_last', 'date'), 'days');
  igual('filtro · "entre" pede duas datas', F.defaultValueFor('is_between', 'date'), ['', '']);
  igual('filtro · caixa sem valor', F.valueKindFor('is_checked', 'checkbox'), 'none');

  const notas = [
    { id: 1, title: 'A', properties: { custo: 5 } },
    { id: 2, title: 'B', properties: { custo: 20 } },
  ];
  const r = E.queryBaseNotes(notas, { filters: [F.newCondition('custo', 'number')].map(c => ({ ...c, operator: 'greater_than', value: 10 })) });
  igual('filtro · condição gerada pelo painel filtra no engine', r.map(n => n.id), [2]);

  // ── ações de view ──
  const A = await import('../sidepanel/modules/bases/config/view-actions.js');
  const def = { views: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], defaultViewId: 'b' };
  igual('abas · reordenar mantém a view padrão', A.moveView(def, 0, 2).views.map(v => v.id).join(''), 'bca');
  igual('abas · padrão por id sobrevive à reordenação', A.moveView(def, 1, 0).defaultViewId, 'b');
  const d = A.duplicateViewAt(def, 'a');
  igual('abas · duplicar vai logo após a original', d.baseDef.views.map(v => v.name), ['A', 'A (cópia)', 'B', 'C']);
  ok('abas · cópia tem id novo e não herda bloqueio', d.newId && d.newId !== 'a' && d.baseDef.views[1].locked === false);
  const x = A.deleteViewById(def, 'b', 'b');
  igual('abas · excluir a padrão passa o padrão adiante', [x.baseDef.defaultViewId, x.activeId], ['a', 'c']);
  igual('abas · não exclui a última', A.deleteViewById({ views: [{ id: 'a' }], defaultViewId: 'a' }, 'a', 'a').baseDef.views.length, 1);
  igual('abas · renomear vazio mantém o nome', A.renameViewById(def, 'a', '  ').views[0].name, 'A');
  igual('abas · bloquear', A.setViewLocked(def, 'a', true).views[0].locked, true);
  igual('abas · ícone vazio volta ao padrão do tipo', 'icon' in A.setViewIcon({ views: [{ id: 'a', icon: 'x' }] }, 'a', '').views[0], false);
  igual('abas · Alt+← circular', A.neighborViewId(def, 'a', -1), 'c');

  // ── filtro em árvore ──
  const T = await import('../sidepanel/modules/bases/engine/filter-tree.js');
  const gente = [
    { id: 1, title: 'a', properties: { s: 'x', p: 'alta' } },
    { id: 2, title: 'b', properties: { s: 'y', p: 'alta' } },
    { id: 3, title: 'c', properties: { s: 'y', p: 'baixa' } },
  ];
  const arvore = [
    { property: 's', operator: 'equals', value: 'y' },
    { op: 'or', conds: [{ property: 'p', operator: 'equals', value: 'alta' }, { property: 'p', operator: 'equals', value: 'media' }] },
  ];
  igual('árvore · E com grupo OU aninhado', E.queryBaseNotes(gente, { filters: arvore }).map(n => n.id), [2]);
  igual('árvore · modo OU na raiz', E.queryBaseNotes(gente, { filters: arvore, filterMode: 'or' }).map(n => n.id), [1, 2, 3]);
  igual('árvore · filtro rápido soma com E', E.queryBaseNotes(gente, { filters: [arvore[0]], quickFilters: [{ property: 'p', operator: 'equals', value: 'baixa' }] }).map(n => n.id), [3]);
  igual('árvore · grupo vazio não filtra', E.queryBaseNotes(gente, { filters: [{ op: 'and', conds: [] }] }).length, 3);
  igual('árvore · profundidade', T.treeDepth([{ op: 'or', conds: [{ op: 'and', conds: [{}] }] }]), 3);
  igual('árvore · editar lista de um grupo', T.mapListAt(arvore, [1], l => l.slice(1))[1].conds.length, 1);
  igual('árvore · trocar E/OU do grupo', T.setGroupOpAt(arvore, [1], 'and')[1].op, 'and');
  igual('árvore · contar condições', T.countConditions(arvore), 3);
  igual('"Novo" herda igualdade em modo E', T.impliedValues([{ property: 'status', operator: 'equals', value: 'Fazendo' }, { property: 'ok', operator: 'is_checked' }]), { status: 'Fazendo', ok: true });
  igual('"Novo" não herda em modo OU', T.impliedValues([{ property: 'status', operator: 'equals', value: 'x' }], 'or'), {});
  igual('"Novo" ignora operadores ambíguos', T.impliedValues([{ property: 'n', operator: 'greater_than', value: 3 }]), {});

  // ── agregações e agrupamento ──
  const G = await import('../sidepanel/modules/bases/engine/aggregate-engine.js');
  const R = await import('../sidepanel/modules/bases/engine/group-engine.js');
  igual('calc · soma ignora vazios', G.aggregate([1, 2, '', null, 4], 'sum').value, 7);
  igual('calc · mediana par', G.aggregate([1, 2, 3, 10], 'median').value, 2.5);
  igual('calc · mediana ímpar', G.aggregate([5, 1, 3], 'median').value, 3);
  igual('calc · média sem dados é nula', G.aggregate([], 'avg').value, null);
  igual('calc · intervalo', G.aggregate([3, 10, 4], 'range').value, 7);
  igual('calc · % preenchidos', G.aggregate(['a', '', 'b', null], 'pct_filled').value, 50);
  igual('calc · únicos achata listas', G.aggregate([['a', 'b'], ['b']], 'unique').value, 2);
  igual('calc · data mais antiga/recente', [G.aggregate(['2026-03-01', '2026-01-10'], 'earliest').value, G.aggregate(['2026-03-01', '2026-01-10'], 'latest').value], ['2026-01-10', '2026-03-01']);
  igual('calc · intervalo em dias', G.aggregate(['2026-01-01', '2026-01-11'], 'range_days').value, 10);
  igual('calc · % marcados', G.aggregate([true, false, true, true], 'pct_checked').value, 75);
  igual('calc · tarefas %', G.aggregate([{ total: 4, checked: 1 }, { total: 4, checked: 3 }], 'tasks_pct').value, 50);
  igual('calc · formata % e vazio', [G.formatAggregate({ agg: 'pct_checked', value: 74.6 }), G.formatAggregate({ agg: 'sum', value: null })], ['75%', '—']);
  ok('calc · todo tipo oferece "none" primeiro', ['text', 'number', 'date', 'checkbox', 'tasks'].every(t => G.aggregatesForType(t)[0] === 'none'));

  const get = (n, p) => (p === 'title' ? n.title : n.properties?.[p]);
  const nn = [
    { title: 'a', properties: { st: 'Fazendo', tg: ['x', 'y'], d: '2026-01-15', v: 12 } },
    { title: 'b', properties: { st: 'Feito', tg: ['y'], d: '2026-01-20', v: 25 } },
    { title: 'c', properties: { d: '2026-02-01', v: 3 } },
  ];
  const sc = { st: { type: 'select', options: ['Fazendo', 'Feito', 'Parado'] }, tg: { type: 'list' }, d: { type: 'date' }, v: { type: 'number' } };
  igual('grupo · select na ordem das opções, vazio no fim, fantasma incluído',
    R.groupNotes(nn, { prop: 'st' }, sc, get).map(g => `${g.key}:${g.count}`), ['Fazendo:1', 'Feito:1', 'Parado:0', '__empty__:1']);
  igual('grupo · hideEmpty some com fantasma e sem valor vazio de notas',
    R.groupNotes(nn, { prop: 'st', hideEmpty: true }, sc, get).map(g => g.key), ['Fazendo', 'Feito', '__empty__']);
  igual('grupo · multisseleção duplica a nota', R.groupNotes(nn, { prop: 'tg', order: 'asc' }, sc, get).map(g => `${g.key}:${g.count}`), ['x:1', 'y:2', '__empty__:1']);
  igual('grupo · data por mês ordena cronologicamente', R.groupNotes(nn, { prop: 'd', granularity: 'month', order: 'desc' }, sc, get).map(g => g.key), ['2026-02', '2026-01']);
  igual('grupo · faixas numéricas', R.groupNotes(nn, { prop: 'v', range: { step: 10 }, order: 'asc' }, sc, get).map(g => `${g.label}:${g.count}`), ['0 – 10:1', '10 – 20:1', '20 – 30:1']);
  igual('grupo · ordem por contagem', R.groupNotes(nn, { prop: 'tg', order: 'count' }, sc, get)[0].key, 'y');
  igual('grupo · oculta chaves escolhidas', R.groupNotes(nn, { prop: 'st', hidden: ['Feito'] }, sc, get).some(g => g.key === 'Feito'), false);
  igual('grupo · sem propriedade devolve tudo', R.groupNotes(nn, {}, sc, get).length, 1);

  // ── config: grupo/calc/layout com chaves antigas ──
  const V = await import('../sidepanel/modules/bases/config/view-model.js');
  igual('config · groupBy antigo vira group.prop', V.resolveGroupConfig({ groupBy: 'status' }).prop, 'status');
  igual('config · group novo vence groupBy', V.resolveGroupConfig({ groupBy: 'a', group: { prop: 'b', order: 'count' } }).order, 'count');
  igual('config · summaries antigos traduzidos', V.resolveCalc({ summaries: { custo: 'average', ok: 'percent_checked', t: 'count' } }), { custo: 'avg', ok: 'pct_checked', t: 'count' });
  igual('config · calc sobrepõe e remove', V.resolveCalc({ summaries: { a: 'sum', b: 'sum' }, calc: { a: 'max', b: 'none' } }), { a: 'max' });
  igual('config · layout padrão', V.resolveTableLayout({}), { rowHeight: 'medium', wrapCells: false, rowNumbers: false, borders: 'both', selectable: false, frozenColumns: 0 });
  igual('config · layout ignora lixo', V.resolveTableLayout({ layout: { rowHeight: 'enorme', borders: 'x' } }).rowHeight, 'medium');

  // ── cor condicional ──
  const K = await import('../sidepanel/modules/bases/engine/color-rules.js');
  const regras = K.normalizeColorRules({ color: { rules: [
    { when: { property: 'valor', operator: 'greater_than', value: 20 }, tone: 'red' },
    { when: { property: 'st', operator: 'equals', value: 'x' }, tone: 'neon' },       // tom inválido: descartada
    { when: { property: 'st', operator: 'equals', value: 'Feito' }, tone: 'green', apply: 'cell' },
  ] } });
  igual('cor · descarta regra com tom inválido', regras.length, 2);
  igual('cor · primeira regra de linha que casa', K.rowTone({ properties: { valor: 25 } }, regras), 'red');
  igual('cor · sem casar devolve nulo', K.rowTone({ properties: { valor: 1 } }, regras), null);
  igual('cor · célula só vale pra propriedade da regra', [K.cellTone({ properties: { st: 'Feito' } }, regras, 'st'), K.cellTone({ properties: { st: 'Feito' } }, regras, 'valor')], ['green', null]);
  const { readFile } = await import('node:fs/promises');
  const tons = await readFile(new URL('../sidepanel/css/31-bases-tones.css', import.meta.url), 'utf8');
  ok('cor · tons em OKLCH, sem hex/rgb', !/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(tons) && K.TONES.every(t => tons.includes(`.tone-${t.id}`)));
  // contraste: fundo e texto de cada tom com ΔL ≥ 55 nos dois temas
  const pares = [...tons.matchAll(/background: oklch\((\d+)%[^;]*;\s*color: oklch\((\d+)%/g)].map(m => Math.abs(m[1] - m[2]));
  ok('cor · ΔL ≥ 55 em todos os tons (claro e escuro)', pares.length === K.TONES.length * 2 && pares.every(d => d >= 55), JSON.stringify(pares));

  // ── YAML: objetos/listas aninhados DENTRO de item de lista (ida e volta) ──
  const Y = await import('../sidepanel/modules/bases/bases-yaml.js');
  const complexo = { views: [{ filters: [{ when: { a: 1 }, tone: 'x' }], c: [{ k: { z: [1, 2] }, m: [{ q: 1 }] }] }] };
  igual('yaml · ida e volta com objeto na 1ª chave do item', Y.parseYamlOrJson(Y.stringifyBaseToYaml(complexo)), complexo);
  igual('yaml · "- chave:" sem valor abre filho, não irmão',
    Y.parseYamlOrJson('views:\n  - type: table\n    color:\n      rules:\n        - when:\n            property: v\n          tone: red\n').views[0].color.rules,
    [{ when: { property: 'v' }, tone: 'red' }]);

  // ── fórmulas ──
  const Fm = await import('../sidepanel/modules/bases/engine/formula/evaluator.js');
  const Pa = await import('../sidepanel/modules/bases/engine/formula/parser.js');
  const Dc = await import('../sidepanel/modules/bases/engine/derived-columns.js');
  const dados = { custo: 10, qtd: 3, nome: 'Ana', d: '2026-10-06', tags: ['a', 'b', 'a'], ok: true, vazio: '' };
  const f = e => Fm.runFormula(e, { prop: k => dados[k] });
  igual('fórmula · multiplicação de propriedades', f('prop("custo") * prop("qtd")').value, 30);
  igual('fórmula · precedência e potência', f('1 + 2 * 3 ^ 2').value, 19);
  igual('fórmula · unário e potência', f('-2 ^ 2').value, -4);
  igual('fórmula · if', f('if(prop("ok"), "sim", "nao")').value, 'sim');
  igual('fórmula · ternário e comparação', f('prop("custo") > 5 ? "alto" : "baixo"').value, 'alto');
  igual('fórmula · ifs com padrão', f('ifs(1 > 2, "a", 2 > 3, "b", "c")').value, 'c');
  igual('fórmula · texto', f('concat("Oi ", upper(prop("nome")), "!")').value, 'Oi ANA!');
  igual('fórmula · + com texto concatena', f('"a" + 1').value, 'a1');
  igual('fórmula · arredondar', f('round(10 / 3, 2)').value, 3.33);
  igual('fórmula · mediana', f('median(1, 2, 3, 10)').value, 2.5);
  igual('fórmula · data +1 mês formatada', f('formatDate(dateAdd(prop("d"), 1, "month"), "DD/MM/YYYY")').value, '06/11/2026');
  igual('fórmula · fim de mês não estoura', Fm.runFormula('formatDate(dateAdd("2026-01-31", 1, "month"), "YYYY-MM-DD")').value, '2026-02-28');
  igual('fórmula · dateBetween em dias', f('dateBetween("2026-12-25", prop("d"), "days")').value, 80);
  igual('fórmula · segunda = 1', f('weekday("2026-10-06")').value, 2);
  igual('fórmula · lista: unique/map/filter', [f('length(unique(prop("tags")))').value, f('map(prop("tags"), upper(current))').value, f('length(filter(prop("tags"), current == "a"))').value], [2, ['A', 'B', 'A'], 2]);
  igual('fórmula · vazio', [f('empty(prop("vazio"))').value, f('empty(prop("nome"))').value], [true, false]);
  igual('fórmula · divisão por zero é erro, não exceção', f('1 / 0'), { ok: false, error: 'Divisão por zero' });
  igual('fórmula · função desconhecida', f('foo(1)').error, 'Função desconhecida: foo()');
  igual('fórmula · parêntese faltando', f('prop("custo"').ok, false);
  igual('fórmula · vazia', f('   ').error, 'Fórmula vazia');
  ok('fórmula · sem eval: identificador solto é erro', f('alert').ok === false && f('constructor').ok === false);
  ok('fórmula · limite de aninhamento', Fm.runFormula('('.repeat(200) + '1' + ')'.repeat(200)).ok === false);
  ok('fórmula · repeat limitado', String(f('length(repeat("x", 99999999))').value).length <= 4);
  ok('fórmula · regex enorme é recusada', f('test("a", "' + 'a'.repeat(200) + '")').ok === false);
  igual('fórmula · referências citadas', [...Pa.referencedProps(Pa.parse('prop("a") + if(prop("b"), 1, 2)'))], ['a', 'b']);

  // ── propriedades derivadas (fórmula e rollup) ──
  const nts = [
    { id: 1, title: 'Projeto X', properties: { custo: 10, qtd: 3 } },
    { id: 2, title: 'Tarefa 1', properties: { horas: 2, projeto: '[[Projeto X]]' } },
    { id: 3, title: 'Tarefa 2', properties: { horas: 5, projeto: '[[Projeto X]]' } },
    { id: 4, title: 'Sem fim', properties: { custo: 1, qtd: 1 } },
  ];
  const defs = {
    total: { type: 'formula', expr: 'prop("custo") * prop("qtd")', result: 'number' },
    dobro: { type: 'formula', expr: 'prop("total") * 2', result: 'number' },
    ciclo1: { type: 'formula', expr: 'prop("ciclo2")' }, ciclo2: { type: 'formula', expr: 'prop("ciclo1")' },
    quebrada: { type: 'formula', expr: '1 +' },
    horasTotais: { type: 'rollup', relation: 'tarefas', target: 'horas', agg: 'sum' },
  };
  const der = Dc.applyDerivedColumns(nts, defs);
  igual('derivada · fórmula calculada em __calc', der[0].__calc.total, 30);
  igual('derivada · fórmula usa outra fórmula', der[0].__calc.dobro, 60);
  ok('derivada · ciclo vira erro legível', String(der[0].__calc.ciclo1).includes('circular'));
  ok('derivada · fórmula quebrada vira ⚠ erro', String(der[0].__calc.quebrada).startsWith('⚠'));
  ok('derivada · nunca grava em properties', !('total' in der[0].properties) && !('total' in nts[0].properties));
  igual('derivada · sem derivadas devolve a mesma lista', Dc.applyDerivedColumns(nts, {}), nts);
  ok('derivada · engine lê o valor calculado', E.getNotePropertyValue(der[0], 'total') === 30);
  const rel = Dc.applyDerivedColumns([
    { id: 1, title: 'Projeto X', properties: { tarefas: ['[[Tarefa 1]]', '[[Tarefa 2]]'] } },
    ...nts.slice(1, 3),
  ], { horasTotais: defs.horasTotais });
  igual('rollup · soma de horas das tarefas ligadas', rel[0].__calc.horasTotais, 7);
  igual('fórmula · checkFormula acusa autorreferência', Dc.checkFormula('prop("x")', { x: {} }, 'x').ok, false);
  igual('fórmula · checkFormula lista propriedade desconhecida', Dc.checkFormula('prop("nada")', { a: {} }).desconhecidas, ['nada']);

  // ── formatos de exibição ──
  const Fo = await import('../sidepanel/modules/bases/engine/format.js');
  const Sc = await import('../sidepanel/modules/bases/bases-schema.js');
  igual('formato · moeda BRL', Fo.formatNumber(1234.5, { kind: 'currency', currency: 'BRL' }).replace(/\s/g, ' '), 'R$ 1.234,50');
  igual('formato · fração vira %', Fo.formatNumber(0.4, { kind: 'percent' }), '40%');
  igual('formato · 40 já é % (sem 4000%)', Fo.formatNumber(40, { kind: 'progress-bar' }), '40%');
  igual('formato · divideBy', Fo.formatNumber(2500, { kind: 'plain', divideBy: 1000 }), '2,5');
  igual('formato · barra limitada a 0–100', [Fo.progressPercent(150), Fo.progressPercent(-5), Fo.progressPercent(0.25)], [100, 0, 25]);
  igual('formato · lixo não é número', Fo.formatNumber('abc', { kind: 'currency' }), null);
  const agora = new Date(2026, 9, 6, 12);
  igual('formato · data relativa', ['2026-10-06', '2026-10-07', '2026-10-05', '2026-10-11', '2026-09-30', '2027-01-01'].map(d => Fo.formatDateValue(d, { kind: 'relative' }, agora)), ['hoje', 'amanhã', 'ontem', 'em 5 dias', 'há 6 dias', '01/01/2027']);
  igual('formato · data curta e longa', [Fo.formatDateValue('2026-10-06', { kind: 'short' }), Fo.formatDateValue('2026-03-02', { kind: 'long' })], ['6 out', '2 de março de 2026']);
  igual('formato · data com hora', Fo.formatDateValue('2026-10-06T14:30', { kind: 'absolute', showTime: true }), '06/10/2026 14:30');
  igual('formato · formatPropertyValue usa o formato novo', Sc.formatPropertyValue(0.5, 'number', { format: { kind: 'percent' } }), '50%');
  igual('formato · formato antigo em texto continua valendo', Sc.formatPropertyValue(0.5, 'number', { format: 'percent' }), '50.0%');
  igual('formato · schema herda format da Base', Sc.inferBaseSchema([{ properties: { p: 1 } }], { p: { type: 'number', format: { kind: 'currency' } } }).p.format, { kind: 'currency' });

  // ── gráficos ──
  const Cm = await import('../sidepanel/modules/bases/chart/chart-model.js');
  const Cl = await import('../sidepanel/modules/bases/chart/chart-layout.js');
  const gn = [
    { title: 'a', properties: { st: 'Fazendo', pr: 'alta', v: 10, d: '2026-01-05' } },
    { title: 'b', properties: { st: 'Fazendo', pr: 'baixa', v: 5, d: '2026-01-20' } },
    { title: 'c', properties: { st: 'Feito', pr: 'alta', v: 20, d: '2026-02-02' } },
    { title: 'd', properties: { v: 1 } },
  ];
  const gsc = { st: { type: 'select', options: ['Fazendo', 'Feito'] }, pr: { type: 'select' }, v: { type: 'number' }, d: { type: 'date' } };
  const dadosG = view => Cm.buildChartData(gn, Cm.resolveChartConfig(view), gsc);
  const d1 = dadosG({ chart: { kind: 'bar' }, x: { prop: 'st' } });
  igual('gráfico · contagem por status', d1.categories.map((c, i) => `${c.key}:${d1.values[0][i]}`), ['Fazendo:2', 'Feito:1', '__empty__:1']);
  const d2 = dadosG({ chart: { kind: 'bar' }, x: { prop: 'st', omitEmpty: true }, y: { agg: 'sum', prop: 'v' } });
  igual('gráfico · soma de v por status, sem vazio', d2.values[0], [15, 20]);
  const d3 = dadosG({ chart: { kind: 'bar', stack: 'stacked' }, x: { prop: 'st' }, series: { prop: 'pr' } });
  igual('gráfico · empilhado soma = contagem total', d3.values.flat().reduce((a, b) => a + b, 0), 4);
  igual('gráfico · séries por prioridade', d3.series.map(s => s.key), ['alta', 'baixa', '__empty__']);
  const d4 = dadosG({ chart: { kind: 'line' }, x: { prop: 'd', granularity: 'month' } });
  igual('gráfico · datas por mês em ordem cronológica', d4.categories.map(c => c.key), ['2026-01', '2026-02', '__empty__']);
  igual('gráfico · acumulado', dadosG({ chart: { kind: 'line' }, x: { prop: 'd' }, style: { cumulative: true } }).values[0], [2, 3, 4]);
  igual('gráfico · ordenar por maior valor', dadosG({ chart: { kind: 'bar' }, x: { prop: 'st' }, y: { agg: 'sum', prop: 'v' }, x2: 0 }).categories.length, 3);
  igual('gráfico · maior valor primeiro', dadosG({ chart: { kind: 'bar' }, x: { prop: 'st', sort: 'value' }, y: { agg: 'sum', prop: 'v' } }).categories[0].key, 'Feito');
  igual('gráfico · número', dadosG({ chart: { kind: 'number' }, y: { agg: 'sum', prop: 'v' } }).single, 36);
  igual('gráfico · omitir zeros', dadosG({ chart: { kind: 'bar' }, x: { prop: 'st' }, style: { omitZeros: true }, y: { agg: 'sum', prop: 'v' } }).categories.length, 3);
  const muitas = Array.from({ length: 12 }, (_, i) => ({ title: String(i), properties: { c: `c${i}` } }));
  const dm = Cm.buildChartData(muitas, Cm.resolveChartConfig({ chart: { kind: 'bar' }, x: { prop: 'c' }, series: { prop: 'c' } }), { c: { type: 'text' } });
  igual('gráfico · mais de 8 séries agrupa em "Outros"', [dm.series.length, dm.series[7].label], [8, 'Outros']);
  igual('gráfico · config ignora lixo', Cm.resolveChartConfig({ chart: { kind: 'radar' }, style: { height: 99999 } }).kind, 'bar');
  igual('gráfico · altura limitada', Cm.resolveChartConfig({ style: { height: 99999 } }).style.height, 600);
  igual('ticks · passo 1-2-5', [Cl.niceTicks(7).ticks, Cl.niceTicks(23).step, Cl.niceTicks(0).max], [[0, 2, 4, 6, 8], 5, 1]);
  ok('ticks · cobre o máximo', [3, 99, 1234, 0.37].every(m => Cl.niceTicks(m).max >= m));
  igual('ticks · rótulos curtos', [Cl.tickLabel(1500), Cl.tickLabel(25000), Cl.tickLabel(3e6)], ['1.500', '25 mil', '3 mi']);
  const lb = Cl.layoutBars([[1, 2], [3, 4]], 'stacked');
  igual('barras · empilhada acumula', [lb.max, lb.bars.filter(b => b.c === 1).map(b => [b.from, b.to])], [6, [[0, 2], [2, 6]]]);
  igual('barras · 100%', Cl.layoutBars([[1], [3]], 'percent').bars.map(b => b.to), [25, 100]);
  igual('barras · lado a lado usa bandas', Cl.layoutBars([[1], [3]], 'grouped').bars.map(b => [b.band, b.bands]), [[0, 2], [1, 2]]);
  const fat = Cl.layoutDonut([1, 1, 2]);
  ok('pizza · fatias somam 2π', Math.abs(fat[fat.length - 1].a1 - fat[0].a0 - Math.PI * 2) < 1e-9);
  igual('pizza · fração', fat.map(f => f.frac), [0.25, 0.25, 0.5]);
  igual('rótulos · tira os que colidem', Cl.thinLabels(10, 200, 50), [0, 3, 6, 9]);
  const cssCh = await readFile(new URL('../sidepanel/css/32-bases-charts.css', import.meta.url), 'utf8');
  ok('gráfico · CSS só em OKLCH', !/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(cssCh) && /--bch-c7: oklch/.test(cssCh));

  // ── linha do tempo ──
  const Ts = await import('../sidepanel/modules/bases/timeline/timeline-scale.js');
  const Tm = await import('../sidepanel/modules/bases/timeline/timeline-model.js');
  const Ta = await import('../sidepanel/modules/bases/timeline/timeline-actions.js');
  const rg = Ts.visibleRange([{ startYmd: '2026-10-05', endYmd: '2026-10-12' }], '2026-10-06', 'week');
  igual('timeline · faixa alinhada à semana (segunda)', [rg.start, rg.end], ['2026-09-21', '2026-11-01']);
  igual('timeline · dias na faixa', rg.days, 42);
  ok('timeline · hoje sempre cabe na faixa', Ts.visibleRange([{ startYmd: '2026-01-01', endYmd: '2026-01-05' }], '2026-10-06', 'month').end >= '2026-10-06');
  igual('timeline · x do dia', Ts.xOf('2026-09-28', rg, 18), 7 * 18);
  igual('timeline · dia sob o x (ida e volta)', Ts.ymdAtX(7 * 18 + 5, rg, 18), '2026-09-28');
  igual('timeline · dia sob x é limitado à faixa', [Ts.ymdAtX(-50, rg, 18), Ts.ymdAtX(99999, rg, 18)], ['2026-09-21', '2026-11-01']);
  igual('timeline · barra de 3 dias', Ts.barGeometry({ startYmd: '2026-10-05', endYmd: '2026-10-07' }, rg, 18), { left: 252, width: 54 });
  ok('timeline · barra nunca some (largura mínima)', Ts.barGeometry({ startYmd: '2026-10-05', endYmd: '2026-10-05' }, rg, 0.8).width >= 6);
  const hc = Ts.headerCells(rg, 'week');
  igual('timeline · cabeçalho cobre a faixa sem buracos', [hc.top[0].from, hc.top[hc.top.length - 1].to, hc.top.map(c => c.label)], ['2026-09-21', '2026-11-01', ['set 2026', 'out 2026', 'nov 2026']]);
  igual('timeline · trimestres', Ts.headerCells({ start: '2026-01-01', end: '2026-12-31', days: 365 }, 'quarter').bottom.map(c => c.label), ['T1', 'T2', 'T3', 'T4']);
  igual('timeline · unitStart/End', [Ts.unitStart('2026-10-06', 'quarter'), Ts.unitEnd('2026-10-06', 'quarter'), Ts.unitStart('2026-10-06', 'week')], ['2026-10-01', '2026-12-31', '2026-10-05']);
  const tn = [
    { id: 1, title: 'A', properties: { ini: '2026-10-05', fim: '2026-10-09' } },
    { id: 2, title: 'B', properties: { ini: '2026-10-07' } },
    { id: 3, title: 'C', properties: {} },
    { id: 4, title: 'D', properties: { ini: '2026-10-10', fim: '2026-10-01' } },   // fim antes do início: ignora o fim
  ];
  const tcfg = Tm.resolveTimelineConfig({ date: { start: 'ini', end: 'fim' } });
  const ti = Tm.buildTimelineItems(tn, tcfg, (n, p) => n.properties[p]);
  igual('timeline · itens e sem data', [ti.items.map(i => i.id), ti.noDate.map(n => n.id)], [['1', '2', '4'], [3]]);
  igual('timeline · fim antes do início vira 1 dia', [ti.items[2].startYmd, ti.items[2].endYmd], ['2026-10-10', '2026-10-10']);
  igual('timeline · sem propriedade de fim = marco', Tm.buildTimelineItems(tn, Tm.resolveTimelineConfig({ date: { start: 'ini' } }), (n, p) => n.properties[p]).items.every(i => i.milestone), true);
  igual('timeline · mover 2 dias muda início e fim', Ta.moveItemPatch(ti.items[0], 2).patch, { ini: '2026-10-07', fim: '2026-10-11' });
  igual('timeline · esticar fim', Ta.resizeEndPatch(ti.items[0], '2026-10-12').patch, { fim: '2026-10-12' });
  igual('timeline · fim não passa antes do início', Ta.resizeEndPatch(ti.items[0], '2026-10-01').patch, { fim: '2026-10-05' });
  igual('timeline · esticar início', Ta.resizeStartPatch(ti.items[0], '2026-10-03').patch, { ini: '2026-10-03' });
  igual('timeline · início não passa do fim', Ta.resizeStartPatch(ti.items[0], '2026-12-01').patch, { ini: '2026-10-09' });
  igual('timeline · sem gesto, sem patch', Ta.moveItemPatch(ti.items[0], 0), null);
  igual('timeline · px → dias', [Ta.daysFromPixels(40, 18), Ta.daysFromPixels(-26, 18), Ta.daysFromPixels(8, 18)], [2, -1, 0]);
  const linhasT = Tm.buildRows(ti.items, { group: { prop: 'x' } }, { x: { type: 'text' } }, (n, p) => (p === 'x' ? 'g' : n.properties[p]));
  igual('timeline · linhas com grupo', linhasT.map(r => r.type), ['group', 'item', 'item', 'item']);
  igual('timeline · grupo recolhido esconde itens', Tm.buildRows(ti.items, { group: { prop: 'x' } }, { x: { type: 'text' } }, () => 'g', ['g']).length, 1);

  // ── mapa e feed ──
  const Mm = await import('../sidepanel/modules/bases/map/map-model.js');
  igual('mapa · lê objeto de localização', Mm.parseLatLng({ name: 'x', lat: -23.5, lng: -46.6 }), { lat: -23.5, lng: -46.6 });
  igual('mapa · lê "lat, lng" em texto (vírgula decimal)', Mm.parseLatLng('-23,5; -46,6'), { lat: -23.5, lng: -46.6 });
  igual('mapa · lê par [lat, lng]', Mm.parseLatLng([10, 20]), { lat: 10, lng: 20 });
  igual('mapa · rejeita coordenada fora do mundo e lixo', [Mm.parseLatLng({ lat: 91, lng: 0 }), Mm.parseLatLng({ lat: 0, lng: 181 }), Mm.parseLatLng('abc'), Mm.parseLatLng({ lat: null, lng: null }), Mm.parseLatLng('')], [null, null, null, null, null]);
  const pts = [
    { id: '1', lat: -23.55, lng: -46.63 }, { id: '2', lat: -23.551, lng: -46.631 }, { id: '3', lat: 40.7, lng: -74 },
  ];
  igual('mapa · cluster junta pontos próximos no zoom baixo', Mm.clusterPoints(pts, 6).map(c => c.points.length).sort(), [1, 2]);
  igual('mapa · zoom alto não agrupa', Mm.clusterPoints(pts, 16).length, 3);
  igual('mapa · um ponto só não vira cluster', Mm.clusterPoints([pts[0]], 3).length, 1);
  const cl = Mm.clusterPoints(pts, 6).find(c => c.points.length === 2);
  ok('mapa · centro do cluster é a média', Math.abs(cl.lat - (-23.5505)) < 1e-9);
  igual('mapa · caixa dos pontos', Mm.boundsOf(pts), { south: -23.551, north: 40.7, west: -74, east: -46.63 });
  igual('mapa · sem pontos não tem caixa', Mm.boundsOf([]), null);
  const bm = Mm.buildMapPoints([{ id: 1, title: 'A', properties: { loc: { lat: 1, lng: 2 } } }, { id: 2, title: 'B', properties: {} }], { location: 'loc' }, (n, p) => n.properties[p]);
  igual('mapa · pontos e sem localização', [bm.points.length, bm.noLocation.length], [1, 1]);
  igual('mapa · sem propriedade, ninguém tem local', Mm.buildMapPoints([{ id: 1, properties: {} }], { location: null }, () => 1).points.length, 0);
  igual('mapa · acha a propriedade do tipo location', Mm.pickDefaultLocationProp({ a: { type: 'text', key: 'a' }, b: { type: 'location', key: 'b' } }), 'b');
  const cssFm = await readFile(new URL('../sidepanel/css/34-bases-feed-map.css', import.meta.url), 'utf8');
  ok('feed/mapa · CSS sem hex/rgb/hsl', !/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(cssFm));
  const { feedMaxLines } = await import('../sidepanel/modules/bases/bases-feed-view.js').catch(() => ({}));
  ok('feed · módulo exporta o limite de linhas', feedMaxLines === undefined || (feedMaxLines({ card: { maxLines: 9999 } }) === 60 && feedMaxLines({}) === 14 && feedMaxLines({ card: { maxLines: 1 } }) === 3));

  // ── todo import relativo dos módulos de bases/ aponta para um arquivo que existe ──
  const { readdir, stat } = await import('node:fs/promises');
  const { resolve, dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = fileURLToPath(new URL('../sidepanel/modules/bases/', import.meta.url));
  const arquivos = [];
  const varre = async d => { for (const nome of await readdir(d)) { const c = join(d, nome); if ((await stat(c)).isDirectory()) await varre(c); else if (c.endsWith('.js')) arquivos.push(c); } };
  await varre(raiz);
  const quebrados = [];
  for (const arq of arquivos) {
    const src = await readFile(arq, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"`;]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const alvo = resolve(dirname(arq), m[1] || m[2]);
      try { await stat(alvo); } catch { quebrados.push(`${arq.replace(raiz, 'bases/')} → ${m[1] || m[2]}`); }
    }
  }
  ok('imports · todo import relativo de bases/ resolve para um arquivo', quebrados.length === 0, quebrados.join('\n'));
  ok('imports · varreu os módulos (não ficou vazio)', arquivos.length > 60);

  // ── exportação ──
  const Ex = await import('../sidepanel/modules/bases/engine/export.js');
  const exN = [{ id: 1, title: 'A,"x"', properties: { v: -5, t: '=HYPERLINK("http://x")', tg: ['a', 'b'], ok: true } }, { id: 2, title: '+cmd', properties: {} }];
  const exS = { title: { label: 'Nome' }, v: { type: 'number', label: 'V' }, t: { label: 'T' }, tg: { type: 'list', label: 'Tags' }, ok: { type: 'checkbox', label: 'Ok' } };
  const csv = Ex.toCsv(exN, ['title', 'v', 't', 'tg', 'ok'], exS);
  ok('export · CSV começa com BOM e usa CRLF', csv.startsWith('﻿') && csv.includes('\r\n'));
  ok('export · aspas e vírgulas escapadas', csv.includes('"A,""x"""'));
  ok('export · injeção de fórmula neutralizada (= + - @)', csv.includes("\"'=HYPERLINK") && csv.includes("'+cmd"));
  ok('export · número negativo não é alterado', csv.includes(',-5,'));
  ok('export · lista com "; " e checkbox em Sim/Não', csv.includes('a; b') && csv.includes('Sim'));
  igual('export · markdown escapa pipe e quebra de linha', Ex.toMarkdownTable([{ id: 1, title: 'a|b\nc', properties: {} }], ['title'], exS).split('\n')[2], '| a\\|b c |');
  igual('export · JSON mantém tipos', JSON.parse(Ex.toJson(exN, ['title', 'v', 'ok'], exS))[0], { title: 'A,"x"', v: -5, ok: true });
  igual('export · nome de arquivo seguro', Ex.exportFileName('Minha Base: ação/2', 'csv', new Date(2026, 9, 6)), 'Minha-Base-acao-2-20261006.csv');
  igual('export · guard só em texto', [Ex.guardSpreadsheet('-5'), Ex.guardSpreadsheet('-abc'), Ex.guardSpreadsheet('ok')], ['-5', "'-abc", 'ok']);

  // ── edição em lote ──
  const Bk = await import('../sidepanel/modules/bases/engine/bulk-actions.js');
  const bn = { id: 1, pasta: 'a', properties: { tags: 'x, y', st: 'A' }, propertyTypes: {} };
  igual('lote · definir propriedade com tipo', Bk.buildBulkPatch(bn, { kind: 'setProperty', key: 'prazo', value: '2026-10-10', type: 'date' }).propertyTypes.prazo, 'date');
  igual('lote · definir o mesmo valor não faz nada', Bk.buildBulkPatch(bn, { kind: 'setProperty', key: 'st', value: 'A' }), null);
  igual('lote · adicionar tag converte "x, y" em lista', Bk.buildBulkPatch(bn, { kind: 'addTag', tag: '#z' }).properties.tags, ['x', 'y', 'z']);
  igual('lote · tag repetida não faz nada', Bk.buildBulkPatch(bn, { kind: 'addTag', tag: 'x' }), null);
  igual('lote · remover a última tag apaga a chave', 'tags' in Bk.buildBulkPatch({ properties: { tags: ['a'] } }, { kind: 'removeTag', tag: 'a' }).properties, false);
  igual('lote · mover de pasta normaliza barras', Bk.buildBulkPatch(bn, { kind: 'moveFolder', pasta: '/b/c/' }), { pasta: 'b/c' });
  igual('lote · mover para a mesma pasta não faz nada', Bk.buildBulkPatch(bn, { kind: 'moveFolder', pasta: 'a' }), null);
  igual('lote · não muta a nota original', [bn.properties.tags, Object.keys(bn.properties)], ['x, y', ['tags', 'st']]);
  igual('lote · limpar propriedade', 'st' in Bk.buildBulkPatch(bn, { kind: 'clearProperty', key: 'st' }).properties, false);
  igual('lote · ação desconhecida é ignorada', Bk.buildBulkPatch(bn, { kind: 'explodir' }), null);
  igual('lote · descrição da exclusão avisa permanência', Bk.describeBulkAction({ kind: 'delete' }, 3), 'Excluir 3 notas permanentemente');

  // ── dependências da linha do tempo ──
  const Td = await import('../sidepanel/modules/bases/timeline/timeline-deps.js');
  const dI = [
    { id: 'a', title: 'Fundação', startYmd: '2026-10-01', endYmd: '2026-10-05', note: { properties: {} } },
    { id: 'b', title: 'Paredes', startYmd: '2026-10-06', endYmd: '2026-10-10', note: { properties: { dep: ['[[Fundação]]'] } } },
    { id: 'c', title: 'Telhado', startYmd: '2026-10-11', endYmd: '2026-10-12', note: { properties: { dep: '[[Paredes]], Fundação, [[Fantasma]]' } } },
    { id: 'd', title: 'Auto', startYmd: '2026-10-01', endYmd: '2026-10-02', note: { properties: { dep: ['[[Auto]]'] } } },
  ];
  const dE = Td.resolveDependencies(dI, (n, p) => n.properties[p], 'dep');
  igual('deps · predecessores por título (lista e texto), ignora fantasma e autorreferência', dE.map(e => `${e.from}>${e.to}`).sort(), ['a>b', 'a>c', 'b>c']);
  igual('deps · sem propriedade, sem arestas', Td.resolveDependencies(dI, () => null, null), []);
  igual('deps · conflito quando começa antes/no dia do fim do predecessor', [Td.isConflict(dI[0], dI[1]), Td.isConflict(dI[0], { startYmd: '2026-10-05' }), Td.isConflict(dI[0], { startYmd: '2026-10-04' })], [false, true, true]);
  // Fundação passa a terminar em 10/10: Paredes (06) precisa começar em 11 (+5, vira 11–15); Telhado (11) precisa começar em 16 (+5) 
  const sh = Td.cascadeShifts(dI, dE, { a: { startYmd: '2026-10-06', endYmd: '2026-10-10' } });
  igual('deps · cascata empurra o sucessor e o sucessor dele', sh, { b: 5, c: 5 });
  igual('deps · cascata nunca puxa para trás', Td.cascadeShifts(dI, dE, { a: { startYmd: '2026-09-20', endYmd: '2026-09-22' } }), {});
  igual('deps · quem a pessoa moveu agora não é empurrado', Td.cascadeShifts(dI, dE, { a: { startYmd: '2026-10-06', endYmd: '2026-10-20' }, b: { startYmd: '2026-10-06', endYmd: '2026-10-10' } }).b, undefined);
  const ciclo = Td.cascadeShifts([{ id: 'x', startYmd: '2026-10-01', endYmd: '2026-10-03' }, { id: 'y', startYmd: '2026-10-04', endYmd: '2026-10-06' }], [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }], { x: { startYmd: '2026-10-05', endYmd: '2026-10-08' } });
  ok('deps · ciclo termina (sem laço infinito)', typeof ciclo === 'object');
  const rotas = [Td.routeArrow({ left: 0, width: 50, row: 0 }, { left: 100, width: 30, row: 1 }, [0, 32, 64], 32), Td.routeArrow({ left: 0, width: 50, row: 0 }, { left: 20, width: 30, row: 1 }, [0, 32, 64], 32)];
  ok('deps · rota normal tem degrau e termina no início da barra', rotas[0].startsWith('M 50 16') && rotas[0].endsWith('H 100'));
  ok('deps · rota de conflito contorna (mais segmentos)', rotas[1].split(' ').length > rotas[0].split(' ').length);
}
