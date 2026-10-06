// ── derived-columns.js ──────────────────────────────────────────────────────
// Propriedades derivadas da Base (definidas em `properties:` da Base): FÓRMULA e ROLLUP.
// Os valores calculados ficam em `note.__calc` (cópia rasa da nota) — nunca em
// note.properties, então não são gravados na nota quando outra célula é editada. PURO.

import { runFormula } from './formula/evaluator.js';
import { parse, referencedProps } from './formula/parser.js';
import { aggregate } from './aggregate-engine.js';
import { getNotePropertyValue } from '../bases-engine.js';
import { fmtData } from './formula/functions.js';

export const isDerivedDef = def => def && (def.type === 'formula' || def.type === 'rollup');

const norm = s => String(s ?? '').trim().toLowerCase();
const tituloDeLink = v => String(v ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();

/** Resultado de fórmula → valor gravável em __calc (Date vira texto; erro vira "⚠ …"). */
function paraValor(r) {
  if (!r.ok) return `⚠ ${r.error}`;
  const v = r.value;
  if (v instanceof Date) return fmtData(v).replace(' ', 'T');
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/**
 * @param {Array} notes  notas (todas, pra relação e rollup achar o alvo)
 * @param {Object} baseProps  baseDef.properties
 * @param {{ now?: Date }} [opts]
 * @returns {Array} notas com `__calc` quando há propriedades derivadas; senão a própria lista
 */
export function applyDerivedColumns(notes, baseProps = {}, opts = {}) {
  const derivadas = Object.entries(baseProps || {}).filter(([, d]) => isDerivedDef(d));
  if (!derivadas.length) return notes;

  const defs = new Map(derivadas);
  const porNome = new Map();                       // nome/rótulo (minúsculo) → chave
  for (const [k, d] of Object.entries(baseProps)) { porNome.set(norm(k), k); if (d?.label) porNome.set(norm(d.label), k); }
  const asts = new Map();
  for (const [k, d] of derivadas) {
    if (d.type !== 'formula') continue;
    try { asts.set(k, { ast: parse(String(d.expr ?? '')) }); } catch (e) { asts.set(k, { erro: e.message }); }
  }
  const porTitulo = new Map();
  for (const n of notes) porTitulo.set(norm(n.title || n.titulo), n);

  const out = notes.map(n => ({ ...n, __calc: {} }));
  const vistas = new Map(out.map(n => [n.id, n]));

  function valor(note, chave, visitando) {
    const def = defs.get(chave);
    if (!def) return getNotePropertyValue(note, chave);
    if (chave in note.__calc) return note.__calc[chave];
    if (visitando.has(chave)) return '⚠ Referência circular';
    visitando.add(chave);
    let v;
    if (def.type === 'formula') {
      const a = asts.get(chave);
      v = a.erro ? `⚠ ${a.erro}` : paraValor(runFormula(a.ast, {
        now: opts.now,
        prop: nome => {
          const k = porNome.get(norm(nome)) ?? nome;
          return valor(note, k, visitando);
        },
      }));
    } else {
      v = rollup(note, def, visitando);
    }
    visitando.delete(chave);
    note.__calc[chave] = v;
    return v;
  }

  function rollup(note, def, visitando) {
    const relKey = porNome.get(norm(def.relation)) ?? def.relation;
    const bruto = valor(note, relKey, visitando);
    const titulos = (Array.isArray(bruto) ? bruto : bruto ? [bruto] : []).map(tituloDeLink).filter(Boolean);
    const alvos = titulos.map(t => porTitulo.get(norm(t))).filter(Boolean).map(n => vistas.get(n.id) || n);
    const alvoKey = porNome.get(norm(def.target)) ?? def.target;
    const vals = alvos.map(a => valor(a, alvoKey, visitando));
    const r = aggregate(vals, def.agg || 'count', def.targetType || 'text');
    return r.value;
  }

  for (const n of out) for (const [k] of derivadas) valor(n, k, new Set());
  return out;
}

/** Valida uma fórmula sem avaliar (pra UI): { ok } | { ok:false, error, pos }. */
export function checkFormula(expr, baseProps = {}, selfKey = null) {
  try {
    const ast = parse(String(expr ?? ''));
    const nomes = new Set([...Object.keys(baseProps), ...Object.values(baseProps).map(d => d?.label).filter(Boolean)].map(norm));
    const refs = [...referencedProps(ast)];
    if (selfKey && refs.some(r => norm(r) === norm(selfKey))) return { ok: false, error: 'A fórmula não pode usar a própria propriedade' };
    return { ok: true, refs, desconhecidas: refs.filter(r => !nomes.has(norm(r))) };
  } catch (e) {
    return { ok: false, error: e.message, pos: e.pos ?? null };
  }
}
