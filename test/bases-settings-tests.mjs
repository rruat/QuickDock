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
  igual('config · layout padrão', V.resolveTableLayout({}), { rowHeight: 'medium', wrapCells: false, rowNumbers: false, borders: 'both' });
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
}
