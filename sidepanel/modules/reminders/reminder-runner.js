// ── reminder-runner.js ──────────────────────────────────────────────────────
// Monitor em tempo real de Lembretes de Foco Persistentes e agendamento data/hora.
// Opera de forma unificada no PWA, Web e Extensão Chrome.

import { loadAllNotesMeta, updateNoteMetaById, getNoteById } from '../storage.js';
import { deveDispararLembrete, aplicarAcaoLembrete } from './persistent-reminder.js';
import { tocarSomAlarmeFoco, tocarSomAlarmeTDAH } from './reminder-sound.js';

let intervalRunnerId = null;
let bannerContainerEl = null;

function getBannerContainer() {
  if (typeof document === 'undefined') return null;
  if (!bannerContainerEl || !document.body.contains(bannerContainerEl)) {
    bannerContainerEl = document.getElementById('quickdock-alarm-banners-container');
    if (!bannerContainerEl) {
      bannerContainerEl = document.createElement('div');
      bannerContainerEl.id = 'quickdock-alarm-banners-container';
      bannerContainerEl.className = 'quickdock-alarm-banners-container';
      document.body.appendChild(bannerContainerEl);
    }
  }
  return bannerContainerEl;
}

/**
 * Exibe um banner visual flutuante insistente com ações rápidas para o usuário.
 * @param {Object} note
 * @param {Object} rem
 */
export function exibirAlarmeVisualToast(note, rem = {}) {
  const container = getBannerContainer();
  if (!container) return;

  const bannerId = `alarm-toast-${note.id || 'test'}`;
  // Remove se já existia um banner anterior da mesma nota
  document.getElementById(bannerId)?.remove();

  const toast = document.createElement('div');
  toast.id = bannerId;
  toast.className = 'quickdock-tdah-alarm-banner quickdock-focus-alarm-banner';
  toast.setAttribute('role', 'alert');

  const tituloNota = note.title || 'Lembrete QuickDock';
  const intervaloMin = rem.intervalMinutes || 5;

  toast.innerHTML = `
    <div class="alarm-banner-icon-wrap">
      <span class="qd-icon material-symbols-rounded alarm-pulse-icon">alarm_on</span>
    </div>
    <div class="alarm-banner-content">
      <div class="alarm-banner-title">${tituloNota}</div>
      <div class="alarm-banner-desc">Lembrete de Foco pendente · Repetindo a cada ${intervaloMin}m</div>
    </div>
    <div class="alarm-banner-actions">
      <button type="button" class="alarm-banner-btn complete-btn" title="Marcar tarefa como concluída">
        <span class="qd-icon material-symbols-rounded">check</span>
        <span>Concluir</span>
      </button>
      <button type="button" class="alarm-banner-btn snooze-btn" title="Adiar por 5 minutos">
        <span class="qd-icon material-symbols-rounded">snooze</span>
        <span>5 min</span>
      </button>
      <button type="button" class="alarm-banner-btn close-btn" title="Dispensar aviso">
        <span class="qd-icon material-symbols-rounded">close</span>
      </button>
    </div>
  `;

  // Ação: Concluir
  toast.querySelector('.complete-btn')?.addEventListener('click', async () => {
    toast.remove();
    if (note.id) {
      const notaAtual = await getNoteById(note.id);
      if (notaAtual) {
        const props = { ...(notaAtual.properties || {}) };
        const r = props.reminder || props.lembrete || rem;
        const atualizado = aplicarAcaoLembrete(r, 'complete');
        if (props.lembrete && !props.reminder) props.lembrete = atualizado;
        else props.reminder = atualizado;
        await updateNoteMetaById(note.id, { properties: props });
        document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
          detail: { noteId: note.id, properties: props }
        }));
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CANCEL_TDAH_REMINDER', noteId: note.id });
      }
    }
  });

  // Ação: Adiar 5 minutos
  toast.querySelector('.snooze-btn')?.addEventListener('click', async () => {
    toast.remove();
    if (note.id) {
      const notaAtual = await getNoteById(note.id);
      if (notaAtual) {
        const props = { ...(notaAtual.properties || {}) };
        const r = props.reminder || props.lembrete || rem;
        const atualizado = aplicarAcaoLembrete(r, 'snooze', Date.now(), { minutes: 5 });
        if (props.lembrete && !props.reminder) props.lembrete = atualizado;
        else props.reminder = atualizado;
        await updateNoteMetaById(note.id, { properties: props });
        document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
          detail: { noteId: note.id, properties: props }
        }));
      }
    }
  });

  // Ação: Fechar aviso (o loop insistente re-notificará no próximo intervalo)
  toast.querySelector('.close-btn')?.addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);
}

/**
 * Dispara teste imediato de som e notificação.
 * @param {Object} [note]
 */
export async function testarAlarmeFoco(note = null) {
  // 1. Toca o som sintetizado
  tocarSomAlarmeFoco();

  // 2. Exibe o banner visual interativo na tela
  const n = note || { title: 'Teste de Lembrete de Foco' };
  exibirAlarmeVisualToast(n, { intervalMinutes: 5 });

  // 3. Pede permissão de notificação se ainda não solicitada
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (_) {}
    }
    if (Notification.permission === 'granted') {
      try {
        new Notification('⏰ Teste de Alarme QuickDock', {
          body: n.title ? `Nota: "${n.title}"` : 'Lembrete insistente funcionando!',
          icon: 'icons/128.png'
        });
      } catch (_) {}
    }
  }

  // 4. Se estiver em extensão, envia mensagem para o background também
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'TRIGGER_TEST_NOTIFICATION',
      title: '⏰ Teste de Alarme QuickDock',
      message: n.title ? `Nota: "${n.title}"` : 'Lembrete insistente funcionando!'
    });
  }

  return true;
}

/**
 * Ciclo periódico de verificação de lembretes ativos.
 */
async function verificarLembretesAtivos() {
  try {
    const notas = await loadAllNotesMeta();
    if (!notas || !notas.length) return;

    const agora = Date.now();

    for (const nota of notas) {
      const props = nota.properties || {};
      const rem = props.reminder || props.lembrete;
      if (!rem || rem.active === false || rem.completed) continue;

      if (deveDispararLembrete(rem, agora)) {
        // Dispara som e banner visual
        tocarSomAlarmeTDAH();
        exibirAlarmeVisualToast(nota, rem);

        // Notificação nativa do sistema operacional
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(`⏰ ${nota.title || 'Lembrete QuickDock'}`, {
              body: `Lembrete pendente (a cada ${rem.intervalMinutes || 5} min até concluir).`,
              icon: 'icons/128.png',
              requireInteraction: true
            });
          } catch (_) {}
        }

        // Atualiza o estado da nota com o último disparo realizado
        const notaCompleta = await getNoteById(nota.id);
        if (notaCompleta) {
          const p = { ...(notaCompleta.properties || {}) };
          const rAtual = p.reminder || p.lembrete || rem;
          const atualizado = aplicarAcaoLembrete(rAtual, 'notify', agora);
          if (p.lembrete && !p.reminder) p.lembrete = atualizado;
          else p.reminder = atualizado;
          await updateNoteMetaById(nota.id, { properties: p });
        }
      }
    }
  } catch (err) {
    console.warn('QuickDock: Erro ao verificar lembretes pendentes:', err);
  }
}

/**
 * Inicia o monitor de lembretes na aba/PWA.
 */
export function initReminderRunner() {
  if (intervalRunnerId !== null) return;
  // Verifica a cada 2.5 segundos
  intervalRunnerId = setInterval(verificarLembretesAtivos, 2500);

  // Ouve evento disparado por geocercas para tocar som e alertar
  document.addEventListener('quickdock:geofence-triggered', e => {
    const detail = e.detail || {};
    tocarSomAlarmeFoco();
    if (detail.noteId) {
      getNoteById(detail.noteId).then(note => {
        if (note) {
          exibirAlarmeVisualToast(note, detail.geocerca || {});
        }
      });
    }
  });
}

export const testarAlarmeTDAH = testarAlarmeFoco;
