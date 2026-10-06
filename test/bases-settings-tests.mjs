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
}
