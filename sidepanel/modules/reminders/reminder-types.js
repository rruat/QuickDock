// ── reminder-types.js ───────────────────────────────────────────────────
// Constantes e validadores para o sistema de Lembretes Persistentes (TDAH) e Geocercas.
// Sem dependências externas, 100% puro.

export const INTERVALOS_TDAH_MINUTOS = [3, 5, 10, 15, 30];
export const INTERVALO_PADRAO_MINUTOS = 5;
export const RAIO_PADRAO_METROS = 150;

/**
 * Cria a estrutura inicial para um lembrete persistente anti-TDAH.
 * @param {Object} [parciais]
 * @returns {Object}
 */
export function criarLembreteTDAH(parciais = {}) {
  const intervalo = Number.isFinite(parciais.intervalMinutes) && parciais.intervalMinutes > 0
    ? parciais.intervalMinutes
    : INTERVALO_PADRAO_MINUTOS;

  return {
    active: parciais.active !== false,
    intervalMinutes: intervalo,
    completed: Boolean(parciais.completed),
    sound: parciais.sound !== false,
    lastNotified: typeof parciais.lastNotified === 'number' ? parciais.lastNotified : null,
    snoozeUntil: typeof parciais.snoozeUntil === 'number' ? parciais.snoozeUntil : null,
    triggerCount: typeof parciais.triggerCount === 'number' ? parciais.triggerCount : 0
  };
}

/**
 * Cria a estrutura para um alvo de geolocalização.
 * @param {Object} [parciais]
 * @returns {Object}
 */
export function criarAlvoGeocerca(parciais = {}) {
  return {
    name: String(parciais.name || 'Local sem nome').trim(),
    lat: typeof parciais.lat === 'number' ? parciais.lat : null,
    lng: typeof parciais.lng === 'number' ? parciais.lng : null,
    radius: Number.isFinite(parciais.radius) && parciais.radius >= 20 ? parciais.radius : RAIO_PADRAO_METROS,
    triggerOn: parciais.triggerOn === 'exit' ? 'exit' : 'enter',
    triggered: Boolean(parciais.triggered),
    active: parciais.active !== false
  };
}
