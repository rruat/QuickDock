// ── tokenizer.js ────────────────────────────────────────────────────────────
// Fórmulas: texto → lista de tokens. PURO. Nunca lança: erro vira { error } com posição.

const DOIS = ['==', '!=', '<=', '>=', '&&', '||'];
const UM = '+-*/%^<>(),!?:';

export class FormulaError extends Error {
  constructor(message, pos = null) { super(message); this.name = 'FormulaError'; this.pos = pos; }
}

export function tokenize(src) {
  const t = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.') { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
      t.push({ type: 'num', value: Number(src.slice(i, j)), pos: i });
      i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < n) { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; }
        else s += src[j++];
      }
      if (j >= n) throw new FormulaError('Texto sem aspas de fechamento', i);
      t.push({ type: 'str', value: s, pos: i });
      i = j + 1; continue;
    }
    if (/[\p{L}_]/u.test(c)) {
      let j = i;
      while (j < n && /[\p{L}\p{N}_]/u.test(src[j])) j++;
      const w = src.slice(i, j);
      t.push({ type: w === 'true' || w === 'false' ? 'bool' : 'id', value: w === 'true' ? true : w === 'false' ? false : w, pos: i });
      i = j; continue;
    }
    const par = src.slice(i, i + 2);
    if (DOIS.includes(par)) { t.push({ type: 'op', value: par, pos: i }); i += 2; continue; }
    if (UM.includes(c)) { t.push({ type: 'op', value: c, pos: i }); i++; continue; }
    throw new FormulaError(`Caractere inesperado "${c}"`, i);
  }
  t.push({ type: 'eof', pos: n });
  return t;
}
