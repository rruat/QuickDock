// ── note-id.js ──────────────────────────────────────────────────────────────
// Ids de nota são números; alguns módulos (linha do tempo, mapa) guardam o id como TEXTO — e o
// app compara com `===` ao ativar uma nota, então "3" nunca achava a nota 3. PURO.

export const normalizeNoteId = id => (typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id);
