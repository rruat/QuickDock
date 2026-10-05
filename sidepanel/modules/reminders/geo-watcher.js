// ── geo-watcher.js ────────────────────────────────────────────────────────
// Monitor de geolocalização e geofencing para lembretes baseados em localização.
// Opera com baixo consumo e debounce de leituras.

import { avaliarDisparoGeocerca } from './geo-math.js';

let watchId = null;
let ultimaPosicao = null;
const geocercasAtivas = new Map(); // noteId -> geocerca

/**
 * Registra ou atualiza uma geocerca para monitoramento.
 * @param {string} noteId
 * @param {Object} geocerca { name, lat, lng, radius, triggerOn, triggered, active }
 */
export function registrarGeocerca(arg1, arg2) {
  const noteId = typeof arg1 === 'string' ? arg1 : (arg1?.noteId || arg1?.id);
  const geocerca = (typeof arg1 === 'object' && !arg2) ? arg1 : arg2;
  if (!noteId || !geocerca || geocerca.active === false || geocerca.lat == null) {
    if (noteId) geocercasAtivas.delete(noteId);
    return;
  }
  geocercasAtivas.set(noteId, { ...geocerca, noteId });
  iniciarMonitoramentoSeNecessario();
}

/**
 * Remove o monitoramento de uma geocerca.
 * @param {string} noteId
 */
export function desregistrarGeocerca(noteId) {
  geocercasAtivas.delete(noteId);
  if (geocercasAtivas.size === 0) {
    pararMonitoramento();
  }
}

/**
 * Inicia o watchPosition de geolocalização se houver alvos cadastrados.
 */
export function iniciarMonitoramentoSeNecessario() {
  if (watchId !== null || geocercasAtivas.size === 0) return;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;

  try {
    watchId = navigator.geolocation.watchPosition(
      pos => {
        const novaPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao: pos.coords.accuracy
        };
        processarNovaPosicao(novaPos);
      },
      err => {
        console.warn('QuickDock Geolocation warning:', err.message);
      },
      {
        enableHighAccuracy: false, // Baixo consumo de bateria
        maximumAge: 60000,         // Cache de 1 minuto
        timeout: 27000
      }
    );
  } catch (err) {
    console.warn('QuickDock Geolocation indisponível:', err);
  }
}

/**
 * Para o monitoramento de geolocalização.
 */
export function pararMonitoramento() {
  if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    ultimaPosicao = null;
  }
}

/**
 * Processa a atualização de coordenadas e dispara eventos caso entre/saia de uma geocerca.
 * @param {{ lat: number, lng: number }} posAtual
 */
export function processarNovaPosicao(posAtual) {
  if (!posAtual) return;

  for (const [noteId, geocerca] of geocercasAtivas.entries()) {
    const { deveDisparar, novoEstadoTriggered } = avaliarDisparoGeocerca(ultimaPosicao, posAtual, geocerca);
    geocerca.triggered = novoEstadoTriggered;

    if (deveDisparar) {
      document.dispatchEvent(new CustomEvent('quickdock:geofence-triggered', {
        detail: { noteId, geocerca, posAtual }
      }));

      const verbo = geocerca.triggerOn === 'exit' ? 'Você saiu de' : 'Você chegou em';
      const tituloAlarme = `📍 ${verbo} ${geocerca.name || 'Local Marcado'}`;

      // Ativa o loop persistente de foco se configurado (padrão ativo)
      if (geocerca.persistentTdah !== false) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'SCHEDULE_TDAH_REMINDER',
            noteId,
            title: tituloAlarme,
            intervalMinutes: geocerca.intervalMinutes || 5,
            immediate: true
          });
        }
      }

      // Notificação nativa se disponível
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(tituloAlarme, {
          body: `Lembrete ativo no QuickDock!`,
          icon: 'icons/128.png'
        });
      }
    }
  }

  ultimaPosicao = posAtual;
}
