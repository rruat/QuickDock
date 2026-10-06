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
}
