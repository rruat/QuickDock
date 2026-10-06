// ── functions.js ────────────────────────────────────────────────────────────
// Funções "ansiosas" (argumentos já avaliados) das fórmulas. PURO. Datas = objetos Date (local).

import { FormulaError } from './tokenizer.js';
import { parseDateValue, localYMD } from '../date-utils.js';

const MS_DIA = 86400000;
const vazio = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && Number.isNaN(v));
const num = (v, nome = 'valor') => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new FormulaError(`"${v}" não é um número (${nome})`);
  return n;
};
const str = v => (v === null || v === undefined ? '' : v instanceof Date ? fmtData(v) : Array.isArray(v) ? v.map(str).join(', ') : String(v));
const lista = (v, nome) => { if (!Array.isArray(v)) throw new FormulaError(`${nome} espera uma lista`); return v; };
const data = (v, nome) => {
  if (v instanceof Date) return v;
  const p = parseDateValue(v);
  if (!p) throw new FormulaError(`"${str(v)}" não é uma data (${nome})`);
  const [a, m, d] = p.ymd.split('-').map(Number);
  return new Date(a, m - 1, d, p.hasTime ? Math.floor(p.minutes / 60) : 0, p.hasTime ? p.minutes % 60 : 0);
};
const flat = args => args.flatMap(a => (Array.isArray(a) ? a : [a]));
const nums = args => flat(args).filter(v => !vazio(v)).map(v => num(v));

export function fmtData(d) {
  const ymd = localYMD(d);
  return d.getHours() || d.getMinutes() ? `${ymd} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ymd;
}

const UNIDADES = { years: 'y', year: 'y', anos: 'y', ano: 'y', months: 'M', month: 'M', meses: 'M', mes: 'M', mês: 'M', weeks: 'w', week: 'w', semanas: 'w', semana: 'w', days: 'd', day: 'd', dias: 'd', dia: 'd', hours: 'h', hour: 'h', horas: 'h', hora: 'h', minutes: 'm', minute: 'm', minutos: 'm', minuto: 'm' };
const unid = u => UNIDADES[String(u).toLowerCase()] || (() => { throw new FormulaError(`Unidade de tempo desconhecida: "${u}"`); })();

function somaTempo(d, n, u, sinal) {
  const r = new Date(d.getTime());
  const k = sinal * num(n);
  switch (unid(u)) {
    case 'y': r.setFullYear(r.getFullYear() + k); break;
    case 'M': {
      const dia = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + k);
      r.setDate(Math.min(dia, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); break;
    }
    case 'w': r.setDate(r.getDate() + 7 * k); break;
    case 'd': r.setDate(r.getDate() + k); break;
    case 'h': r.setHours(r.getHours() + k); break;
    default: r.setMinutes(r.getMinutes() + k);
  }
  return r;
}

function diffTempo(a, b, u) {
  const k = unid(u);
  if (k === 'y') return a.getFullYear() - b.getFullYear();
  if (k === 'M') return (a.getFullYear() - b.getFullYear()) * 12 + a.getMonth() - b.getMonth();
  const ms = a.getTime() - b.getTime();
  return Math.trunc(ms / { w: 7 * MS_DIA, d: MS_DIA, h: 3600000, m: 60000 }[k]);
}

export const FUNCS = {
  // números
  abs: ([x]) => Math.abs(num(x)),
  round: ([x, casas = 0]) => { const f = 10 ** num(casas); return Math.round((num(x) + Number.EPSILON) * f) / f; },
  floor: ([x]) => Math.floor(num(x)),
  ceil: ([x]) => Math.ceil(num(x)),
  min: a => { const n = nums(a); return n.length ? Math.min(...n) : null; },
  max: a => { const n = nums(a); return n.length ? Math.max(...n) : null; },
  sum: a => nums(a).reduce((x, y) => x + y, 0),
  mean: a => { const n = nums(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : null; },
  median: a => { const n = nums(a).sort((x, y) => x - y); if (!n.length) return null; const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
  pow: ([x, y]) => num(x) ** num(y),
  sqrt: ([x]) => { if (num(x) < 0) throw new FormulaError('Raiz de número negativo'); return Math.sqrt(num(x)); },
  log: ([x, base]) => (base === undefined ? Math.log(num(x)) : Math.log(num(x)) / Math.log(num(base))),
  exp: ([x]) => Math.exp(num(x)),
  toNumber: ([x]) => { const n = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; },
  // texto
  concat: a => a.map(str).join(''),
  format: ([x]) => str(x),
  lower: ([x]) => str(x).toLowerCase(),
  upper: ([x]) => str(x).toUpperCase(),
  trim: ([x]) => str(x).trim(),
  repeat: ([x, n]) => str(x).repeat(Math.min(1000, Math.max(0, Math.floor(num(n))))),
  replace: ([x, de, para]) => str(x).replace(str(de), str(para)),
  replaceAll: ([x, de, para]) => str(x).split(str(de)).join(str(para)),
  split: ([x, sep]) => str(x).split(str(sep)),
  join: ([l, sep = ', ']) => lista(l, 'join').map(str).join(str(sep)),
  test: ([x, padrao]) => {
    // regex "segura": limite de tamanho do padrão e do texto contra backtracking catastrófico
    if (str(padrao).length > 80 || str(x).length > 2000) throw new FormulaError('Expressão regular grande demais');
    try { return new RegExp(str(padrao), 'iu').test(str(x)); } catch { throw new FormulaError('Expressão regular inválida'); }
  },
  // datas
  now: () => new Date(),
  today: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); },
  dateAdd: ([d, n, u]) => somaTempo(data(d, 'dateAdd'), n, u, 1),
  dateSubtract: ([d, n, u]) => somaTempo(data(d, 'dateSubtract'), n, u, -1),
  dateBetween: ([a, b, u]) => diffTempo(data(a, 'dateBetween'), data(b, 'dateBetween'), u),
  formatDate: ([d, padrao]) => {
    const x = data(d, 'formatDate');
    if (padrao === undefined) return fmtData(x);
    const p2 = n => String(n).padStart(2, '0');
    return str(padrao).replace(/YYYY|YY|MM|DD|HH|mm/g, t => ({ YYYY: x.getFullYear(), YY: String(x.getFullYear()).slice(2), MM: p2(x.getMonth() + 1), DD: p2(x.getDate()), HH: p2(x.getHours()), mm: p2(x.getMinutes()) }[t]));
  },
  year: ([d]) => data(d, 'year').getFullYear(),
  month: ([d]) => data(d, 'month').getMonth() + 1,
  day: ([d]) => data(d, 'day').getDate(),
  weekday: ([d]) => { const w = data(d, 'weekday').getDay(); return w === 0 ? 7 : w; },   // 1 = segunda … 7 = domingo
  hour: ([d]) => data(d, 'hour').getHours(),
  minute: ([d]) => data(d, 'minute').getMinutes(),
  timestamp: ([d]) => data(d, 'timestamp').getTime(),
  fromTimestamp: ([n]) => new Date(num(n)),
  // lógica / listas (também texto, onde fizer sentido)
  empty: ([x]) => vazio(x),
  equal: ([a, b]) => str(a) === str(b),
  unequal: ([a, b]) => str(a) !== str(b),
  not: ([x]) => !x,
  length: ([x]) => (Array.isArray(x) ? x.length : str(x).length),
  at: ([l, i]) => lista(l, 'at')[Math.floor(num(i))] ?? null,
  first: ([l]) => lista(l, 'first')[0] ?? null,
  last: ([l]) => { const x = lista(l, 'last'); return x.length ? x[x.length - 1] : null; },
  slice: ([x, a, b]) => (Array.isArray(x) ? x.slice(num(a), b === undefined ? undefined : num(b)) : str(x).slice(num(a), b === undefined ? undefined : num(b))),
  sort: ([l]) => [...lista(l, 'sort')].sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : str(x).localeCompare(str(y), 'pt-BR', { numeric: true }))),
  reverse: ([l]) => [...lista(l, 'reverse')].reverse(),
  unique: ([l]) => [...new Set(lista(l, 'unique').map(x => (x instanceof Date ? x.getTime() : x)))],
  includes: ([x, v]) => (Array.isArray(x) ? x.some(i => str(i) === str(v)) : str(x).includes(str(v))),
  contains: ([x, v]) => (Array.isArray(x) ? x.some(i => str(i) === str(v)) : str(x).toLowerCase().includes(str(v).toLowerCase())),
};

export { vazio, num, str };
