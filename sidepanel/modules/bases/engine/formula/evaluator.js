// ── evaluator.js ────────────────────────────────────────────────────────────
// Avaliador de fórmulas — sem eval, sem DOM, sem rede. Limite de passos e de profundidade.
// evaluate(ast, ctx) lança FormulaError; use runFormula() pra ter { ok, value | error }.
//   ctx: { prop(nome) → valor, now?: Date }

import { parse } from './parser.js';
import { FormulaError } from './tokenizer.js';
import { FUNCS, vazio, num, str } from './functions.js';
import { parseDateValue } from '../date-utils.js';

const MAX_STEPS = 20000;

const eqv = (a, b) => (a instanceof Date || b instanceof Date ? (a?.getTime?.() ?? a) === (b?.getTime?.() ?? b) : typeof a === 'number' && typeof b === 'number' ? a === b : str(a) === str(b));
const cmp = (a, b) => {
  const x = a instanceof Date ? a.getTime() : a, y = b instanceof Date ? b.getTime() : b;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  const nx = Number(x), ny = Number(y);
  if (x !== '' && y !== '' && Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
  return str(a).localeCompare(str(b), 'pt-BR', { numeric: true });
};

export function evaluate(ast, ctx = {}) {
  let passos = 0;
  const vars = []; // pilha de { v: item, i: posição } (map/filter/...)

  const ev = (n, d) => {
    if (++passos > MAX_STEPS) throw new FormulaError('Fórmula complexa demais');
    if (d > 80) throw new FormulaError('Fórmula aninhada demais');
    switch (n.k) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'id':
        if (n.name === 'current') { if (!vars.length) throw new FormulaError('"current" só existe dentro de map/filter/some/every/find'); return vars[vars.length - 1].v; }
        if (n.name === 'index') { if (!vars.length) throw new FormulaError('"index" só existe dentro de map/filter/some/every/find'); return vars[vars.length - 1].i; }
        throw new FormulaError(`"${n.name}" não é uma função ou valor conhecido — use prop("${n.name}") para uma propriedade`);
      case 'un': {
        const v = ev(n.x, d + 1);
        return n.op === '!' ? !v : n.op === '-' ? -num(v) : num(v);
      }
      case 'tern': return ev(n.c, d + 1) ? ev(n.a, d + 1) : ev(n.b, d + 1);
      case 'bin': return bin(n, d);
      case 'call': return call(n, d);
      default: throw new FormulaError('Nó desconhecido');
    }
  };

  const bin = (n, d) => {
    if (n.op === '&&') return !!ev(n.a, d + 1) && !!ev(n.b, d + 1);
    if (n.op === '||') return !!ev(n.a, d + 1) || !!ev(n.b, d + 1);
    const a = ev(n.a, d + 1), b = ev(n.b, d + 1);
    switch (n.op) {
      case '+': return typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a) + num(b);
      case '-': return a instanceof Date && b instanceof Date ? (a - b) / 86400000 : num(a) - num(b);
      case '*': return num(a) * num(b);
      case '/': { const z = num(b); if (z === 0) throw new FormulaError('Divisão por zero'); return num(a) / z; }
      case '%': { const z = num(b); if (z === 0) throw new FormulaError('Divisão por zero'); return num(a) % z; }
      case '^': return num(a) ** num(b);
      case '==': return eqv(a, b);
      case '!=': return !eqv(a, b);
      case '<': return cmp(a, b) < 0;
      case '>': return cmp(a, b) > 0;
      case '<=': return cmp(a, b) <= 0;
      case '>=': return cmp(a, b) >= 0;
      default: throw new FormulaError(`Operador desconhecido ${n.op}`);
    }
  };

  const call = (n, d) => {
    const nome = n.name;
    const A = n.args;
    switch (nome) {
      case 'prop': {
        if (A.length !== 1) throw new FormulaError('prop() espera 1 argumento: prop("nome")');
        const k = ev(A[0], d + 1);
        const v = ctx.prop ? ctx.prop(String(k)) : undefined;
        return normalizaValor(v);
      }
      case 'if': { if (A.length < 2 || A.length > 3) throw new FormulaError('if(condição, então, senão)'); return ev(A[0], d + 1) ? ev(A[1], d + 1) : (A[2] ? ev(A[2], d + 1) : null); }
      case 'ifs': {
        for (let i = 0; i + 1 < A.length; i += 2) if (ev(A[i], d + 1)) return ev(A[i + 1], d + 1);
        return A.length % 2 ? ev(A[A.length - 1], d + 1) : null;
      }
      case 'and': return A.every(a => !!ev(a, d + 1));
      case 'or': return A.some(a => !!ev(a, d + 1));
      case 'map': case 'filter': case 'some': case 'every': case 'find': {
        if (A.length !== 2) throw new FormulaError(`${nome}(lista, expressão com current)`);
        const l = ev(A[0], d + 1);
        if (!Array.isArray(l)) throw new FormulaError(`${nome} espera uma lista`);
        // `current` = item; `index` = posição (guardados numa pilha para aninhar map dentro de map)
        const run = (item, i) => { const slot = { v: item, i }; vars.push(slot); try { return ev(A[1], d + 1); } finally { vars.pop(); } };
        if (nome === 'map') return l.map((x, i) => run(x, i));
        if (nome === 'filter') return l.filter((x, i) => !!run(x, i));
        if (nome === 'some') return l.some((x, i) => !!run(x, i));
        if (nome === 'every') return l.every((x, i) => !!run(x, i));
        return l.find((x, i) => !!run(x, i)) ?? null;
      }
      default: {
        const fn = FUNCS[nome];
        if (!fn) throw new FormulaError(`Função desconhecida: ${nome}()`);
        return fn(A.map(a => ev(a, d + 1)));
      }
    }
  };

  return ev(ast, 0);
}

// Valores vindos das notas: números em texto viram número; datas ISO viram Date; "" vira null.
function normalizaValor(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(v)) {
    const p = parseDateValue(v);
    if (p) { const [a, m, dd] = p.ymd.split('-').map(Number); return new Date(a, m - 1, dd, p.hasTime ? Math.floor(p.minutes / 60) : 0, p.hasTime ? p.minutes % 60 : 0); }
  }
  if (typeof v === 'object' && !Array.isArray(v) && 'total' in v) return v.total ? v.checked / v.total : 0; // tarefas → fração
  return v;
}

/** Roda uma fórmula em texto. Nunca lança. @returns {{ok:true,value}|{ok:false,error:string}} */
export function runFormula(expr, ctx) {
  try {
    const ast = typeof expr === 'string' ? parse(expr) : expr;
    return { ok: true, value: evaluate(ast, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof FormulaError ? e.message : `Erro inesperado: ${e?.message || e}` };
  }
}

export { vazio };
