// ── subitems.js ─────────────────────────────────────────────────────────────
// Subitens (hierarquia pai → filhos) na tabela — PURO. A propriedade escolhida guarda o PAI de
// cada nota (título como "[[Projeto X]]" ou "Projeto X"). Ciclos são ignorados (a nota vira raiz).

const norm = s => String(s ?? '').trim().toLowerCase();
const tituloDeLink = v => String(Array.isArray(v) ? v[0] : v ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();

/**
 * @param {Array} notes  notas visíveis (já filtradas/ordenadas)
 * @param {string} parentProp
 * @param {(note, prop)=>any} getValue
 * @param {Set<string|number>} [collapsed]  ids de pais recolhidos (seus descendentes somem)
 * @returns {Array<{ note, depth:number, hasChildren:boolean, collapsed:boolean }>}  lista plana na ordem de exibição
 */
export function flattenSubitems(notes, parentProp, getValue, collapsed = new Set()) {
  const porTitulo = new Map();
  for (const n of notes) { const k = norm(n.title || n.titulo); if (k && !porTitulo.has(k)) porTitulo.set(k, n); }

  const paiDe = new Map();                                   // id → nota pai (se o pai está visível e não há ciclo)
  for (const n of notes) {
    const t = norm(tituloDeLink(getValue(n, parentProp)));
    const pai = t ? porTitulo.get(t) : null;
    if (pai && pai.id !== n.id) paiDe.set(n.id, pai);
  }
  // quebra ciclos: sobe pelos pais; se voltar à própria nota, ela vira raiz
  for (const n of notes) {
    const visto = new Set([n.id]);
    let p = paiDe.get(n.id);
    while (p) {
      if (visto.has(p.id)) { paiDe.delete(n.id); break; }
      visto.add(p.id);
      p = paiDe.get(p.id);
    }
  }

  const filhos = new Map();
  const raizes = [];
  for (const n of notes) {
    const pai = paiDe.get(n.id);
    if (!pai) raizes.push(n);
    else { if (!filhos.has(pai.id)) filhos.set(pai.id, []); filhos.get(pai.id).push(n); }
  }

  const out = [];
  const visita = (n, depth) => {
    const f = filhos.get(n.id) || [];
    const fechado = collapsed.has(n.id) || collapsed.has(String(n.id));
    out.push({ note: n, depth, hasChildren: f.length > 0, collapsed: fechado });
    if (!fechado) for (const c of f) visita(c, depth + 1);
  };
  for (const r of raizes) visita(r, 0);
  return out;
}
