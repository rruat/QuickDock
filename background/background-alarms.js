// ── background-alarms.js ──────────────────────────────────────────────────
// Gerenciador isolado de alarmes e notificações em background (Service Worker).
// Implementa o ciclo de vida do Lembrete Persistente anti-TDAH.

const PREFIXO_ALARME = 'qd_tdah_rem_';

/**
 * Cria ou reprograma um alarme no chrome.alarms.
 * @param {string} noteId
 * @param {number} delayMinutes
 */
export function agendarAlarmeTDAH(noteId, delayOrTimestamp = 5, isTimestamp = false) {
  if (!chrome.alarms) return;
  const name = `${PREFIXO_ALARME}${noteId}`;
  if (isTimestamp) {
    chrome.alarms.create(name, {
      when: Math.max(Date.now() + 1000, Number(delayOrTimestamp))
    });
  } else {
    chrome.alarms.create(name, {
      delayInMinutes: Math.max(0.5, Number(delayOrTimestamp) || 5)
    });
  }
}

/**
 * Cancela um alarme ativo de uma nota.
 * @param {string} noteId
 */
export function cancelarAlarmeTDAH(noteId) {
  if (!chrome.alarms) return;
  chrome.alarms.clear(`${PREFIXO_ALARME}${noteId}`);
}

/**
 * Dispara uma notificação persistente do sistema com ações.
 * @param {string} noteId
 * @param {string} title
 * @param {number} intervalMinutes
 */
export function dispararNotificacaoTDAH(noteId, title, intervalMinutes = 5) {
  if (!chrome.notifications) return;

  const notifId = `${PREFIXO_ALARME}${noteId}`;
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/128.png',
    title: title || 'Lembrete QuickDock',
    message: `Lembrete pendente (re-notificando a cada ${intervalMinutes} min até concluir).`,
    priority: 2,
    requireInteraction: true,
    buttons: [
      { title: '✓ Concluir' },
      { title: '⏰ Adiar 10m' }
    ]
  });
}

/**
 * Inicializa os ouvintes de eventos de alarmes e notificações.
 */
export function initBackgroundAlarms() {
  if (!chrome.alarms || !chrome.notifications) return;

  // 1. Ouvinte de Alarmes
  chrome.alarms.onAlarm.addListener(alarm => {
    if (!alarm.name.startsWith(PREFIXO_ALARME)) return;
    const noteId = alarm.name.replace(PREFIXO_ALARME, '');

    chrome.storage.local.get(['qd_reminders'], data => {
      const reminders = data.qd_reminders || {};
      const rem = reminders[noteId];
      if (!rem || rem.completed || rem.active === false) return;

      dispararNotificacaoTDAH(noteId, rem.title, rem.intervalMinutes || 5);
      // Mantém o loop persistente: agenda o próximo disparo caso o usuário feche sem concluir
      agendarAlarmeTDAH(noteId, rem.intervalMinutes || 5, false);
    });
  });

  // 2. Ouvinte de Botões da Notificação
  chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
    if (!notifId.startsWith(PREFIXO_ALARME)) return;
    const noteId = notifId.replace(PREFIXO_ALARME, '');

    if (btnIdx === 0) {
      // Concluir
      cancelarAlarmeTDAH(noteId);
      chrome.notifications.clear(notifId);
      chrome.storage.local.get(['qd_reminders'], data => {
        const reminders = data.qd_reminders || {};
        if (reminders[noteId]) {
          reminders[noteId].completed = true;
          reminders[noteId].active = false;
          chrome.storage.local.set({ qd_reminders: reminders });
        }
      });
    } else if (btnIdx === 1) {
      // Adiar 10 minutos
      chrome.notifications.clear(notifId);
      agendarAlarmeTDAH(noteId, 10, false);
    }
  });

  // 3. Clique no corpo da notificação abre o painel
  chrome.notifications.onClicked.addListener(notifId => {
    if (!notifId.startsWith(PREFIXO_ALARME)) return;
    const noteId = notifId.replace(PREFIXO_ALARME, '');
    chrome.windows.getCurrent(win => {
      if (win?.id && chrome.sidePanel) {
        chrome.sidePanel.open({ windowId: win.id }).catch(() => {});
      }
    });
  });

  // 4. Mensagens vindas do painel lateral
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'SCHEDULE_TDAH_REMINDER') {
      const { noteId, title, datetime, intervalMinutes, immediate } = msg;
      const parsedInterval = Number(intervalMinutes) || 5;
      chrome.storage.local.get(['qd_reminders'], data => {
        const reminders = data.qd_reminders || {};
        reminders[noteId] = {
          title,
          datetime: datetime || null,
          intervalMinutes: parsedInterval,
          active: true,
          completed: false
        };
        chrome.storage.local.set({ qd_reminders: reminders }, () => {
          if (immediate) {
            dispararNotificacaoTDAH(noteId, title, parsedInterval);
            agendarAlarmeTDAH(noteId, parsedInterval, false);
          } else if (datetime) {
            const targetMs = new Date(datetime).getTime();
            if (!isNaN(targetMs) && targetMs > Date.now()) {
              agendarAlarmeTDAH(noteId, targetMs, true);
            } else {
              dispararNotificacaoTDAH(noteId, title, parsedInterval);
              agendarAlarmeTDAH(noteId, parsedInterval, false);
            }
          } else {
            agendarAlarmeTDAH(noteId, parsedInterval, false);
          }
          sendResponse({ ok: true });
        });
      });
      return true;
    }
    if (msg?.type === 'CANCEL_TDAH_REMINDER') {
      const { noteId } = msg;
      cancelarAlarmeTDAH(noteId);
      chrome.storage.local.get(['qd_reminders'], data => {
        const reminders = data.qd_reminders || {};
        delete reminders[noteId];
        chrome.storage.local.set({ qd_reminders: reminders }, () => {
          sendResponse({ ok: true });
        });
      });
      return true;
    }
  });
}
