// Testes das peças puras do calendário das Bases (datas, modelo de view, eventos, layout,
// navegação, gestos→propriedades, YAML aninhado e filtros relativos).
// Chamado por test/run.mjs: await runBasesCalendarTests({ ok, igual }).

export async function runBasesCalendarTests({ ok, igual }) {
  const D = await import('../sidepanel/modules/bases/engine/date-utils.js');
  const V = await import('../sidepanel/modules/bases/config/view-model.js');
  const M = await import('../sidepanel/modules/bases/calendar/calendar-model.js');
  const L = await import('../sidepanel/modules/bases/calendar/calendar-layout.js');
  const N = await import('../sidepanel/modules/bases/calendar/calendar-nav.js');
  const A = await import('../sidepanel/modules/bases/calendar/calendar-actions.js');
  const C = await import('../sidepanel/modules/bases/calendar/calendar-colors.js');
  const E = await import('../sidepanel/modules/bases/bases-engine.js');
  const Y = await import('../sidepanel/modules/bases/bases-yaml.js');

  // ── date-utils ──
  igual('datas · addDays atravessa mês', D.addDays('2026-10-31', 1), '2026-11-01');
  igual('datas · addMonths limita ao último dia', D.addMonths('2026-01-31', 1), '2026-02-28');
  igual('datas · diffDays', D.diffDays('2026-10-01', '2026-10-06'), 5);
  igual('datas · startOfWeek domingo', D.startOfWeek('2026-10-07', 0), '2026-10-04');
  igual('datas · startOfWeek segunda', D.startOfWeek('2026-10-07', 1), '2026-10-05');
  igual('datas · semana ISO 2025-12-29 é a 1', D.isoWeekNumber('2025-12-29'), 1);
  igual('datas · weekDates sem fim de semana', D.weekDates('2026-10-07', 1, { showWeekends: false }).length, 5);
  igual('datas · parseDateValue com hora', D.parseDateValue('2026-10-06T14:30'), { ymd: '2026-10-06', minutes: 14 * 60 + 30, hasTime: true });
  igual('datas · parseDateValue só dia', D.parseDateValue('2026-10-06')?.hasTime, false);
  igual('datas · parseDateValue lixo', D.parseDateValue('abc'), null);
  igual('datas · minutesToHHMM', D.minutesToHHMM(65), '01:05');
  igual('datas · localYMD usa o dia local', D.localYMD(new Date(2026, 9, 6, 23, 30)), '2026-10-06');

  // ── view-model ──
  const base = V.normalizeViews({ views: [{ type: 'table', name: 'A' }, { type: 'calendar', name: 'B' }], defaultView: 1 });
  ok('views · todas ganham id', base.views.every(v => v.id));
  igual('views · defaultView (índice) vira defaultViewId', base.defaultViewId, base.views[1].id);
  igual('views · ids estáveis entre chamadas', V.normalizeViews({ views: [{ type: 'table', name: 'A' }] }).views[0].id, V.normalizeViews({ views: [{ type: 'table', name: 'A' }] }).views[0].id);
  igual('views · getViewProps lê nomes antigos', V.getViewProps({ columns: ['title', 'tags'] }), ['title', 'tags']);
  igual('views · getViewProps esconde {visible:false}', V.getViewProps({ props: [{ key: 'a' }, { key: 'b', visible: false }] }), ['a']);
  const cfg = V.resolveCalendarConfig({ type: 'calendar', dateProperty: 'prazo', week: { firstDay: 'seg' }, time: { dayStart: '08:00', dayEnd: '18:00' } });
  igual('calendário · chave antiga dateProperty', cfg.date.start, 'prazo');
  igual('calendário · primeiro dia segunda', cfg.week.firstDay, 1);
  igual('calendário · janela do dia em minutos', [cfg.time.dayStart, cfg.time.dayEnd], [480, 1080]);
  igual('calendário · fim antes do início volta ao padrão', V.resolveCalendarConfig({ time: { dayStart: '20:00', dayEnd: '08:00' } }).time.dayStart, 420);
  igual('calendário · fallback "none" vira nulo', V.resolveCalendarConfig({ date: { fallback: 'none' } }).date.fallback, null);
  igual('calendário · modo inválido cai em mês', V.resolveCalendarConfig({ mode: 'xyz' }).mode, 'month');
  const p1 = V.applyViewPatch({ date: { start: 'a', end: 'b' }, mode: 'week' }, { date: { start: 'c' } });
  igual('applyViewPatch · mescla em profundidade', p1.date, { start: 'c', end: 'b' });
  igual('applyViewPatch · undefined apaga a chave', V.applyViewPatch({ date: { start: 'a', end: 'b' } }, { date: { end: undefined } }).date, { start: 'a' });
  igual('applyViewPatch · não muta a entrada', (() => { const v = { mode: 'week' }; V.applyViewPatch(v, { mode: 'day' }); return v.mode; })(), 'week');

  // ── eventos ──
  const cal = V.resolveCalendarConfig({ date: { start: 'inicio', end: 'fim', fallback: 'createdAt', defaultDuration: 60 } });
  const get = (n, k) => (k === 'createdAt' ? n.createdAt : n.properties?.[k]);
  const notas = [
    { id: 1, title: 'Reunião', properties: { inicio: '2026-10-06T09:00', fim: '2026-10-06T10:30' }, createdAt: new Date(2026, 8, 1).getTime() },
    { id: 2, title: 'Sem data', properties: {}, createdAt: new Date(2026, 9, 6, 15, 0).getTime() },
    { id: 3, title: 'Madrugada', properties: { inicio: '2026-10-06T23:00', fim: '2026-10-07T01:00' }, createdAt: 0 },
  ];
  const evs = M.buildCalendarEvents(notas, cal, get);
  igual('eventos · um por nota', evs.length, 3);
  const e1 = evs.find(e => e.note.id === 1), e2 = evs.find(e => e.note.id === 2);
  igual('eventos · horário parseado', [e1.startMin, e1.endMin, e1.allDay], [540, 630, false]);
  ok('eventos · sem data usa criação, dia inteiro e marcado', e2.fromFallback && e2.allDay && e2.startYmd === '2026-10-06');
  const dias = ['2026-10-06', '2026-10-07'];
  const b = M.bucketEventsByDay(evs, dias);
  igual('eventos · evento que cruza meia-noite aparece nos dois dias', [b.get('2026-10-06').timed.length, b.get('2026-10-07').timed.length], [2, 1]);
  const noite = b.get('2026-10-06').timed.find(p => p.ev.note.id === 3);
  ok('eventos · pedaço do primeiro dia marca continua depois', noite.continuesAfter === true && noite.endMin === 1440);

  // ── layout ──
  const lay = L.layoutOverlaps([{ startMin: 60, endMin: 120 }, { startMin: 90, endMin: 150 }, { startMin: 200, endMin: 220 }]);
  igual('layout · sobrepostos dividem colunas', [lay[0].col, lay[0].cols, lay[1].col, lay[1].cols], [0, 2, 1, 2]);
  igual('layout · isolado ocupa tudo', [lay[2].col, lay[2].cols], [0, 1]);
  igual('layout · snapMinutes', [L.snapMinutes(67, 15), L.snapMinutes(68, 15)], [60, 75]);

  // ── navegação ──
  const r = N.visibleRange('week', '2026-10-07', cal);
  igual('nav · semana tem 7 dias começando no primeiro dia', r.days.length, 7);
  igual('nav · shiftAnchor semana', N.shiftAnchor('week', '2026-10-07', 1), '2026-10-14');
  igual('nav · shiftAnchor mês', N.shiftAnchor('month', '2026-01-31', 1), '2026-02-28');
  igual('nav · sanitizeAnchor inválido usa hoje', N.sanitizeAnchor('lixo', '2026-10-06'), '2026-10-06');
  const mes = N.visibleRange('month', '2026-10-15', V.resolveCalendarConfig({}));
  ok('nav · mês vem em semanas completas', mes.weeks.every(w => w.length === 7) && mes.days.length === mes.weeks.length * 7);

  // ── gestos → propriedades ──
  igual('ações · formatDateValue só dia', A.formatDateValue('2026-10-06', null), '2026-10-06');
  igual('ações · formatDateValue com hora', A.formatDateValue('2026-10-06', 570), '2026-10-06T09:30');
  const mv = A.buildMovePatch(e1, { ymd: '2026-10-08', minutes: 600 });
  igual('ações · mover mantém a duração no fim', [mv.patch.inicio, mv.patch.fim], ['2026-10-08T10:00', '2026-10-08T11:30']);
  const rs = A.buildResizePatch(e1, { ymd: '2026-10-06', minutes: 720 });
  igual('ações · redimensionar muda só o fim', rs.patch, { fim: '2026-10-06T12:00' });
  ok('ações · propriedade de sistema não é editável', !A.isEditableDateProp('createdAt') && A.isEditableDateProp('inicio'));
  const cr = A.buildCreateProps(cal, { ymd: '2026-10-06', minutes: 540 }, { ymd: '2026-10-06', minutes: 600 });
  igual('ações · criar preenche início e fim', [cr.props.inicio, cr.props.fim], ['2026-10-06T09:00', '2026-10-06T10:00']);

  // ── cores ──
  igual('cores · mesmo valor, mesmo matiz', C.hueForValue('Alta'), C.hueForValue('Alta'));
  ok('cores · matiz vem da paleta', C.EVENT_HUES.includes(C.hueForValue('Média')));

  // ── motor: filtros relativos e modo OR ──
  const hoje = '2026-10-07'; // quarta
  const agora = new Date(2026, 9, 7, 12, 0);
  const iv = E.intervaloRelativo('is_this_week', hoje, null);
  igual('motor · esta semana começa na segunda', iv?.[0] ?? iv?.start, '2026-10-05');
  const mk = (id, data) => ({ id, title: String(id), pasta: '', properties: { d: data }, propertyTypes: { d: 'date' } });
  const lista = [mk(1, '2026-10-07'), mk(2, '2026-10-06'), mk(3, '2026-10-20')];
  const q = op => E.queryBaseNotes(lista, { filters: [{ property: 'd', operator: op, value: '' }], now: agora }).map(n => n.id);
  igual('motor · is_today', q('is_today'), [1]);
  igual('motor · is_yesterday', q('is_yesterday'), [2]);
  const or = E.queryBaseNotes(lista, { filters: [{ property: 'd', operator: 'is_today' }, { property: 'd', operator: 'is_yesterday' }], filterMode: 'or', now: agora }).map(n => n.id);
  igual('motor · modo OR (filterMode)', or, [1, 2]);
  const or2 = E.queryBaseNotes(lista, { filters: [{ property: 'd', operator: 'is_today' }, { property: 'd', operator: 'is_yesterday' }], filterOperator: 'or', now: agora }).map(n => n.id);
  igual('motor · modo OR (filterOperator legado)', or2, [1, 2]);
  igual('motor · pasta "/" significa todas as notas', E.queryBaseNotes(lista, { source: { folder: '/' } }).length, 3);

  // ── YAML aninhado ──
  const yaml = 'source:\n  folder: Projetos\nviews:\n  - type: calendar\n    name: Agenda\n    week:\n      firstDay: seg\n';
  const obj = Y.parseYamlOrJson(yaml);
  igual('yaml · objeto aninhado abre filho', obj.source, { folder: 'Projetos' });
  igual('yaml · aninhado dentro de item de lista', obj.views[0].week, { firstDay: 'seg' });
  const volta = Y.parseYamlOrJson(Y.stringifyBaseToYaml(obj));
  igual('yaml · ida e volta preserva a view de calendário', volta.views[0], obj.views[0]);
}
