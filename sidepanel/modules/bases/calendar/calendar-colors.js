// ── calendar-colors.js ──────────────────────────────────────────────────────
// Cor dos eventos do calendário — PURO. "Colorir por" uma propriedade: cada valor ganha
// um MATIZ estável (mesmo valor → mesma cor, sempre). A cor de verdade (fundo, borda,
// texto) é montada no CSS em OKLCH, por tema, a partir do matiz (ver
// docs/PADRAO-DE-CORES-OKLCH.md) — aqui só se escolhe o matiz.

// Os mesmos matizes dos cartões do Espaço (vermelho, laranja, amarelo, verde, azul,
// índigo, violeta) + verde-água e rosa, pra ter 9 cores distinguíveis.
export const EVENT_HUES = [25, 48, 86, 150, 195, 260, 277, 304, 350];

function hash(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Matiz (graus) pro valor, ou null se não há valor (evento fica na cor neutra). */
export function hueForValue(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const chave = Array.isArray(valor) ? String(valor[0] ?? '') : String(valor);
  if (!chave) return null;
  return EVENT_HUES[hash(chave.toLowerCase()) % EVENT_HUES.length];
}
