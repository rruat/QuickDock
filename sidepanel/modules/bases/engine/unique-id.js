// ── unique-id.js ────────────────────────────────────────────────────────────
// ID único por Base ("TAREFA-12") — PURO. O número só cresce: nunca reaproveita um ID já usado,
// mesmo que a nota dele tenha sido excluída (o maior número existente manda). Gerar IDs é uma
// AÇÃO explícita (botão no painel e criação de nota pela Base); abrir uma view nunca grava nada.

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function formatId(prefix, n, digits = 0) {
  const num = digits > 0 ? String(n).padStart(digits, '0') : String(n);
  return prefix ? `${prefix}-${num}` : num;
}

/** Maior número já usado por esse prefixo nas notas (0 se nenhum). */
export function maxIdNumber(notes, key, prefix) {
  const re = new RegExp(`^${prefix ? `${esc(prefix)}-` : ''}(\\d+)$`);
  let max = 0;
  for (const n of notes) {
    const m = re.exec(String(n.properties?.[key] ?? '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** Próximo ID livre. */
export function nextId(notes, key, prefix = '', digits = 0) {
  return formatId(prefix, maxIdNumber(notes, key, prefix) + 1, digits);
}

/**
 * IDs para as notas que ainda não têm, na ordem de criação (depois de createdAt/ id).
 * @returns {Array<{ id, value }>}
 */
export function planMissingIds(notes, key, prefix = '', digits = 0) {
  let atual = maxIdNumber(notes, key, prefix);
  const semId = notes.filter(n => !String(n.properties?.[key] ?? '').trim())
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
  return semId.map(n => ({ id: n.id, value: formatId(prefix, ++atual, digits) }));
}

/** IDs repetidos (importação, cópia): { valor: [ids…] } só dos que se repetem. */
export function duplicateIds(notes, key) {
  const por = new Map();
  for (const n of notes) {
    const v = String(n.properties?.[key] ?? '').trim();
    if (!v) continue;
    if (!por.has(v)) por.set(v, []);
    por.get(v).push(n.id);
  }
  return Object.fromEntries([...por].filter(([, ids]) => ids.length > 1));
}
