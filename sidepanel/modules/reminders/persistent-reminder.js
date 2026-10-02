// ── persistent-reminder.js ───────────────────────────────────────────────
// Máquina de estados para Lembretes Persistentes (Loop insistente anti-TDAH).
// Lógica pura, sem DOM, 100% testável.

export { criarLembreteTDAH, INTERVALOS_TDAH_MINUTOS, INTERVALO_PADRAO_MINUTOS } from './reminder-types.js';

/**
 * Avalia se um lembrete persistente deve disparar no momento atual.
 * @param {Object} lembrete
 * @param {number} [agoraMs]
 * @returns {boolean}
 */
export function deveDispararLembrete(lembrete, agoraMs = Date.now()) {
  if (!lembrete || lembrete.active === false || lembrete.completed) {
    return false;
  }

  // Se estiver em modo soneca (snooze), respeita o prazo
  if (typeof lembrete.snoozeUntil === 'number' && agoraMs < lembrete.snoozeUntil) {
    return false;
  }

  // Se tem data e hora agendada no futuro, aguarda até o momento exato
  if (lembrete.datetime) {
    const targetMs = new Date(lembrete.datetime).getTime();
    if (!isNaN(targetMs) && agoraMs < targetMs) {
      return false;
    }
  }

  // Primeiro disparo após o horário agendado (ou imediato se não tiver datetime)
  if (!lembrete.lastNotified) {
    return true;
  }

  const intervaloMs = (lembrete.intervalMinutes || 5) * 60 * 1000;
  return (agoraMs - lembrete.lastNotified) >= intervaloMs;
}

/**
 * Calcula o timestamp (ms) do próximo disparo programado.
 * @param {Object} lembrete
 * @param {number} [agoraMs]
 * @returns {number|null}
 */
export function calcularProximoDisparo(lembrete, agoraMs = Date.now()) {
  if (!lembrete || lembrete.active === false || lembrete.completed) {
    return null;
  }

  if (typeof lembrete.snoozeUntil === 'number' && agoraMs < lembrete.snoozeUntil) {
    return lembrete.snoozeUntil;
  }

  if (lembrete.datetime && !lembrete.lastNotified) {
    const targetMs = new Date(lembrete.datetime).getTime();
    if (!isNaN(targetMs) && targetMs > agoraMs) {
      return targetMs;
    }
  }

  if (!lembrete.lastNotified) {
    return agoraMs;
  }

  const intervaloMs = (lembrete.intervalMinutes || 5) * 60 * 1000;
  return lembrete.lastNotified + intervaloMs;
}

/**
 * Aplica uma ação do usuário ao lembrete (concluir, adiar, dispensar/notificado).
 * @param {Object} lembrete
 * @param {'complete'|'snooze'|'notify'|'reactivate'} acao
 * @param {number} [agoraMs]
 * @param {{ minutes?: number }} [params]
 * @returns {Object} Novo objeto de lembrete com estado atualizado
 */
export function aplicarAcaoLembrete(lembrete, acao, agoraMs = Date.now(), params = {}) {
  const base = { ...lembrete };

  switch (acao) {
    case 'complete':
      return {
        ...base,
        completed: true,
        active: false,
        snoozeUntil: null
      };

    case 'snooze': {
      const mins = Number.isFinite(params.minutes) && params.minutes > 0 ? params.minutes : 15;
      return {
        ...base,
        snoozeUntil: agoraMs + (mins * 60 * 1000)
      };
    }

    case 'notify':
      return {
        ...base,
        lastNotified: agoraMs,
        triggerCount: (base.triggerCount || 0) + 1,
        snoozeUntil: null
      };

    case 'reactivate':
      return {
        ...base,
        active: true,
        completed: false,
        lastNotified: null,
        snoozeUntil: null,
        triggerCount: 0
      };

    default:
      return base;
  }
}
