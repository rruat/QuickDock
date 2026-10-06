// ── color-rules.js ──────────────────────────────────────────────────────────
// Formatação condicional: regras { when: condição, tone, apply: 'row'|'cell' } avaliadas
// na ordem (a primeira que casar vence). PURO. As cores em si vivem em
// css/31-bases-tones.css (OKLCH, claro e escuro).

import { evaluateFilterCondition } from '../bases-engine.js';

export const TONES = [
  { id: 'gray', label: 'Cinza' }, { id: 'red', label: 'Vermelho' }, { id: 'orange', label: 'Laranja' },
  { id: 'yellow', label: 'Amarelo' }, { id: 'green', label: 'Verde' }, { id: 'teal', label: 'Turquesa' },
  { id: 'blue', label: 'Azul' }, { id: 'purple', label: 'Roxo' }, { id: 'pink', label: 'Rosa' },
];
const TONE_IDS = new Set(TONES.map(t => t.id));

/** Regras válidas (descarta lixo escrito à mão). */
export function normalizeColorRules(view = {}) {
  const lista = view.color?.rules ?? view.colorRules;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter(r => r && r.when && r.when.property && TONE_IDS.has(r.tone))
    .map(r => ({ when: r.when, tone: r.tone, apply: r.apply === 'cell' ? 'cell' : 'row' }));
}

/** Primeira regra que casa com a nota, ou null. */
export function matchColorRule(note, rules, ctx = {}) {
  for (const r of rules) if (evaluateFilterCondition(note, r.when, ctx)) return r;
  return null;
}

/** Tom da nota inteira (apply: row) — o que cartões, linhas de lista e linhas de tabela usam. */
export function rowTone(note, rules, ctx) {
  const r = matchColorRule(note, rules.filter(x => x.apply === 'row'), ctx);
  return r ? r.tone : null;
}

/** Tom da célula (apply: cell) de uma propriedade específica. */
export function cellTone(note, rules, propKey, ctx) {
  const r = matchColorRule(note, rules.filter(x => x.apply === 'cell' && x.when.property === propKey), ctx);
  return r ? r.tone : null;
}
