// ── filter-tree.js ──────────────────────────────────────────────────────────
// Filtros em árvore: uma condição ({ property, operator, value }) ou um grupo
// ({ op: 'and'|'or', conds: [...] }), até MAX_DEPTH níveis. PURO.

export const MAX_DEPTH = 3;

export const isGroup = n => !!n && typeof n === 'object' && Array.isArray(n.conds);

/** Avalia um nó contra uma nota. `evalCond(note, cond)` decide as folhas. Grupo vazio = verdadeiro. */
export function evaluateFilterNode(note, node, evalCond) {
  if (!isGroup(node)) return evalCond(note, node);
  if (!node.conds.length) return true;
  return String(node.op).toLowerCase() === 'or'
    ? node.conds.some(c => evaluateFilterNode(note, c, evalCond))
    : node.conds.every(c => evaluateFilterNode(note, c, evalCond));
}

/** Substitui a lista de condições que está em `path` (índices de grupos; [] = raiz). Não muta. */
export function mapListAt(rootConds, path, fn) {
  if (!path.length) return fn(rootConds);
  const [i, ...resto] = path;
  return rootConds.map((n, j) => (j === i && isGroup(n) ? { ...n, conds: mapListAt(n.conds, resto, fn) } : n));
}

/** Troca E/OU do grupo em `path` (não vale para a raiz — o modo da raiz é `filterMode`). */
export function setGroupOpAt(rootConds, path, op) {
  const [i, ...resto] = path;
  return rootConds.map((n, j) => {
    if (j !== i || !isGroup(n)) return n;
    return resto.length ? { ...n, conds: setGroupOpAt(n.conds, resto, op) } : { ...n, op };
  });
}

/** Profundidade máxima da árvore (raiz = 1). */
export function treeDepth(conds) {
  return 1 + Math.max(0, ...(conds || []).map(n => (isGroup(n) ? treeDepth(n.conds) : 0)));
}

/** Quantas condições-folha existem na árvore. */
export function countConditions(conds) {
  return (conds || []).reduce((t, n) => t + (isGroup(n) ? countConditions(n.conds) : 1), 0);
}

/**
 * Valores "implícitos" que uma nota nova deve ter para continuar visível na view:
 * condições de igualdade na raiz em modo E (e dentro de grupos E). Só as inequívocas.
 * @returns {Record<string, any>} { propriedade: valor }
 */
export function impliedValues(conds, modo = 'and') {
  const out = {};
  if (String(modo).toLowerCase() === 'or') return out;
  for (const n of conds || []) {
    if (isGroup(n)) { if (String(n.op).toLowerCase() !== 'or') Object.assign(out, impliedValues(n.conds, 'and')); continue; }
    if (!n?.property) continue;
    if (n.operator === 'equals' && n.value !== '' && n.value != null) out[n.property] = n.value;
    else if (n.operator === 'is_any_of' && Array.isArray(n.value) && n.value.length === 1) out[n.property] = n.value[0];
    else if (n.operator === 'is_checked') out[n.property] = true;
    else if (n.operator === 'is_unchecked') out[n.property] = false;
  }
  return out;
}
