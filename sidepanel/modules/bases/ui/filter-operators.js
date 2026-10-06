// ── filter-operators.js ─────────────────────────────────────────────────────
// Operadores de filtro por tipo de propriedade e o tipo de valor que cada um pede.
// PURO (sem DOM). Os nomes dos operadores são os que o bases-engine.js entende.

const TEXTO = ['contains', 'does_not_contain', 'equals', 'not_equals', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
const NUMERO = ['equals', 'not_equals', 'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal', 'is_empty', 'is_not_empty'];
const CAIXA = ['is_checked', 'is_unchecked'];
const SELECAO = ['is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'];
const LISTA = ['contains', 'does_not_contain', 'is_empty', 'is_not_empty'];
const DATA = [
  'is_today', 'is_yesterday', 'is_tomorrow', 'is_this_week', 'is_last_week', 'is_next_week',
  'is_this_month', 'is_last_month', 'is_next_month', 'is_within_last', 'is_within_next',
  'equals', 'is_before', 'is_after', 'is_on_or_before', 'is_on_or_after', 'is_between',
  'is_empty', 'is_not_empty',
];

export const OPERATOR_LABELS = {
  contains: 'contém', does_not_contain: 'não contém', equals: 'é', not_equals: 'não é',
  starts_with: 'começa com', ends_with: 'termina com', is_empty: 'está vazio', is_not_empty: 'não está vazio',
  greater_than: '>', greater_than_or_equal: '≥', less_than: '<', less_than_or_equal: '≤',
  is_checked: 'está marcado', is_unchecked: 'não está marcado',
  is_any_of: 'é qualquer um de', is_none_of: 'não é nenhum de',
  is_today: 'é hoje', is_yesterday: 'é ontem', is_tomorrow: 'é amanhã',
  is_this_week: 'é esta semana', is_last_week: 'é semana passada', is_next_week: 'é próxima semana',
  is_this_month: 'é este mês', is_last_month: 'é mês passado', is_next_month: 'é próximo mês',
  is_within_last: 'nos últimos N dias', is_within_next: 'nos próximos N dias',
  is_before: 'antes de', is_after: 'depois de', is_on_or_before: 'em ou antes de',
  is_on_or_after: 'em ou depois de', is_between: 'entre',
};

const SEM_VALOR = new Set([
  'is_empty', 'is_not_empty', 'is_checked', 'is_unchecked',
  'is_today', 'is_yesterday', 'is_tomorrow', 'is_this_week', 'is_last_week', 'is_next_week',
  'is_this_month', 'is_last_month', 'is_next_month',
]);

/** Operadores válidos para o tipo (o primeiro é o padrão ao criar uma condição). */
export function operatorsForType(type, key = '') {
  if (key === 'tags') return LISTA;
  if (key === 'folder') return TEXTO;
  switch (type) {
    case 'number': case 'tasks': return NUMERO;
    case 'checkbox': return CAIXA;
    case 'select': case 'status': return SELECAO;
    case 'list': case 'multiselect': case 'tags': return LISTA;
    case 'date': case 'datetime': case 'daterange': return DATA;
    default: return TEXTO;
  }
}

/** Que campo de valor o operador pede: none | text | number | date | date2 | days | options */
export function valueKindFor(operator, type) {
  if (SEM_VALOR.has(operator)) return 'none';
  if (operator === 'is_within_last' || operator === 'is_within_next') return 'days';
  if (operator === 'is_between') return 'date2';
  if (operator === 'is_any_of' || operator === 'is_none_of') return 'options';
  const ehData = ['date', 'datetime', 'daterange'].includes(type);
  if (ehData) return 'date';
  if (type === 'number' || type === 'tasks') return 'number';
  return 'text';
}

/** Valor inicial coerente com o operador (evita value velho de outro formato). */
export function defaultValueFor(operator, type) {
  switch (valueKindFor(operator, type)) {
    case 'none': return undefined;
    case 'days': return 7;
    case 'date2': return ['', ''];
    case 'options': return [];
    default: return '';
  }
}

/** Condição nova para a propriedade `prop` (do schema). */
export function newCondition(prop, type) {
  const operator = operatorsForType(type, prop)[0];
  const cond = { property: prop, operator };
  const v = defaultValueFor(operator, type);
  if (v !== undefined) cond.value = v;
  return cond;
}
