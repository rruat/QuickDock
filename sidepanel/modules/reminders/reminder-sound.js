// ── reminder-sound.js ────────────────────────────────────────────────────────
// Sintetizador Web Audio API para alarmes e notificações sonoras.
// Opera 100% offline, sem arquivos externos, em navegadores, PWA e extensão.

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Toca um sinal sonoro agradável e nítido (dois tons suaves: 880Hz e 1320Hz).
 * @returns {boolean} Retorna true se iniciou a reprodução
 */
export function tocarSomAlarmeFoco() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const agora = ctx.currentTime;

    // Primeiro tom (A5 - 880Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, agora);
    gain1.gain.setValueAtTime(0.2, agora);
    gain1.gain.exponentialRampToValueAtTime(0.001, agora + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(agora);
    osc1.stop(agora + 0.3);

    // Segundo tom (E6 - 1320Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, agora + 0.15);
    gain2.gain.setValueAtTime(0.25, agora + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, agora + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(agora + 0.15);
    osc2.stop(agora + 0.55);

    return true;
  } catch (err) {
    console.warn('QuickDock: Áudio do alarme não pôde ser reproduzido:', err);
    return false;
  }
}

export const tocarSomAlarmeTDAH = tocarSomAlarmeFoco;
