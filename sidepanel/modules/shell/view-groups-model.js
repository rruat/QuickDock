// ── view-groups-model.js ────────────────────────────────────────────────────
// Legenda de GRUPOS da aside esquerda (mockup: "Grupos" com contagem): os itens da view ativa
// agrupados por pasta, com o mesmo matiz que o calendário usa para colorir por pasta. PURO.

import { hueForValue } from '../bases/calendar/calendar-colors.js';

export const NO_FOLDER_LABEL = 'Sem pasta';

/** [{ key, label, count, hue }] — maiores grupos primeiro; `key` '' = itens sem pasta. */
export function groupsFromItems(items = []) {
  const map = new Map();
  for (const it of items) {
    const key = (it?.pasta || '').trim();
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: key || NO_FOLDER_LABEL, count, hue: hueForValue(key) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}
