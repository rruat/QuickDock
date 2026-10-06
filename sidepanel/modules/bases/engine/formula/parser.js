// ── parser.js ───────────────────────────────────────────────────────────────
// Parser de Pratt: tokens → AST. PURO.
// Nós: { k:'num'|'str'|'bool', v } · { k:'id', name } · { k:'call', name, args } ·
//      { k:'un', op, x } · { k:'bin', op, a, b } · { k:'tern', c, a, b }

import { tokenize, FormulaError } from './tokenizer.js';

// precedência (maior = liga mais forte)
const BIN = {
  '||': [1, 'L'], '&&': [2, 'L'],
  '==': [3, 'L'], '!=': [3, 'L'], '<': [4, 'L'], '>': [4, 'L'], '<=': [4, 'L'], '>=': [4, 'L'],
  '+': [5, 'L'], '-': [5, 'L'], '*': [6, 'L'], '/': [6, 'L'], '%': [6, 'L'], '^': [8, 'R'],
};
const UN_PREC = 7;
const MAX_DEPTH = 60;

export function parse(src) {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const eatOp = v => { const t = peek(); if (t.type === 'op' && t.value === v) { p++; return true; } return false; };
  const expectOp = v => { if (!eatOp(v)) throw new FormulaError(`Esperava "${v}"`, peek().pos); };

  function expr(minPrec, depth) {
    if (depth > MAX_DEPTH) throw new FormulaError('Fórmula aninhada demais', peek().pos);
    let left = prefix(depth);
    for (;;) {
      const t = peek();
      if (t.type === 'op' && t.value === '?' && minPrec <= 0) {
        next();
        const a = expr(0, depth + 1);
        expectOp(':');
        const b = expr(0, depth + 1);
        left = { k: 'tern', c: left, a, b };
        continue;
      }
      const info = t.type === 'op' ? BIN[t.value] : null;
      if (!info || info[0] < minPrec) break;
      next();
      const right = expr(info[1] === 'R' ? info[0] : info[0] + 1, depth + 1);
      left = { k: 'bin', op: t.value, a: left, b: right };
    }
    return left;
  }

  function prefix(depth) {
    const t = next();
    switch (t.type) {
      case 'num': return { k: 'num', v: t.value };
      case 'str': return { k: 'str', v: t.value };
      case 'bool': return { k: 'bool', v: t.value };
      case 'id': {
        if (eatOp('(')) {
          const args = [];
          if (!eatOp(')')) {
            do { args.push(expr(0, depth + 1)); } while (eatOp(','));
            expectOp(')');
          }
          return { k: 'call', name: t.value, args };
        }
        return { k: 'id', name: t.value };
      }
      case 'op':
        if (t.value === '(') { const e = expr(0, depth + 1); expectOp(')'); return e; }
        if (t.value === '-' || t.value === '+' || t.value === '!') return { k: 'un', op: t.value, x: expr(UN_PREC, depth + 1) };
        throw new FormulaError(`Símbolo inesperado "${t.value}"`, t.pos);
      default:
        throw new FormulaError('Fórmula incompleta', t.pos);
    }
  }

  if (tokens.length === 1) throw new FormulaError('Fórmula vazia', 0);
  const ast = expr(0, 0);
  if (peek().type !== 'eof') throw new FormulaError(`Sobrou "${peek().value ?? ''}" no fim da fórmula`, peek().pos);
  return ast;
}

/** Nomes de propriedades citados em prop("...") — pra detectar dependências/ciclos. */
export function referencedProps(ast, out = new Set()) {
  if (!ast || typeof ast !== 'object') return out;
  if (ast.k === 'call') {
    if (ast.name === 'prop' && ast.args[0]?.k === 'str') out.add(ast.args[0].v);
    ast.args.forEach(a => referencedProps(a, out));
  } else if (ast.k === 'bin') { referencedProps(ast.a, out); referencedProps(ast.b, out); }
  else if (ast.k === 'un') referencedProps(ast.x, out);
  else if (ast.k === 'tern') { referencedProps(ast.c, out); referencedProps(ast.a, out); referencedProps(ast.b, out); }
  return out;
}
