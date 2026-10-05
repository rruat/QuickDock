// ── reminder-ui.js ────────────────────────────────────────────────────────
// Componentes visuais para configuração e status de Lembretes de Foco Persistentes e Geocercas.
// Módulo leve focado em interface, sem dependência pesada de outros módulos.

import { INTERVALOS_FOCO_MINUTOS, criarLembreteFoco, criarAlvoGeocerca } from './reminder-types.js';
import { aplicarAcaoLembrete } from './persistent-reminder.js';
import { registrarGeocerca, desregistrarGeocerca } from './geo-watcher.js';

/**
 * Renderiza o widget de Lembrete Persistente dentro de um contêiner DOM.
 * @param {HTMLElement} container
 * @param {Object} note
 * @param {Function} onUpdateCallback
 */
export function renderReminderWidget(container, note, onUpdateCallback) {
  if (!container) return;
  container.innerHTML = '';
  container.className = 'note-reminder-widget';

  const props = note.properties || {};
  const rem = props.reminder || props.lembrete || null;

  if (!rem || !rem.active) {
    const btnAtivar = document.createElement('button');
    btnAtivar.type = 'button';
    btnAtivar.className = 'reminder-activate-btn';
    btnAtivar.innerHTML = '<span class="qd-icon material-symbols-rounded">alarm_add</span> Adicionar Lembrete de Foco';
    btnAtivar.addEventListener('click', () => {
      const novoRem = criarLembreteFoco({ intervalMinutes: 5, active: true });
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SCHEDULE_TDAH_REMINDER',
          noteId: note.id,
          title: note.title,
          intervalMinutes: 5
        });
      }
      onUpdateCallback?.({ reminder: novoRem });
    });
    container.appendChild(btnAtivar);
    return;
  }

  // Card do Lembrete Ativo
  const card = document.createElement('div');
  card.className = 'reminder-active-card' + (rem.completed ? ' is-completed' : '');

  const iconEl = document.createElement('span');
  iconEl.className = 'qd-icon material-symbols-rounded reminder-icon';
  iconEl.textContent = rem.completed ? 'task_alt' : (rem.snoozeUntil ? 'snooze' : 'alarm');

  const infoEl = document.createElement('div');
  infoEl.className = 'reminder-info';

  const titleEl = document.createElement('span');
  titleEl.className = 'reminder-label';
  titleEl.textContent = rem.completed
    ? 'Concluído'
    : (rem.snoozeUntil ? `Soneca ativa` : `Repetindo a cada ${rem.intervalMinutes || 5} min`);

  const selectInterval = document.createElement('select');
  selectInterval.className = 'reminder-interval-select';
  selectInterval.disabled = rem.completed;
  for (const m of INTERVALOS_FOCO_MINUTOS) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = `${m} min`;
    if (m === rem.intervalMinutes) opt.selected = true;
    selectInterval.appendChild(opt);
  }
  selectInterval.addEventListener('change', e => {
    const min = Number(e.target.value);
    const atualizado = { ...rem, intervalMinutes: min };
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'SCHEDULE_TDAH_REMINDER',
        noteId: note.id,
        title: note.title,
        intervalMinutes: min
      });
    }
    onUpdateCallback?.({ reminder: atualizado });
  });

  infoEl.appendChild(titleEl);
  if (!rem.completed) infoEl.appendChild(selectInterval);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'reminder-actions';

  if (!rem.completed) {
    const btnConcluir = document.createElement('button');
    btnConcluir.type = 'button';
    btnConcluir.className = 'reminder-btn-action complete';
    btnConcluir.title = 'Marcar como concluída';
    btnConcluir.innerHTML = '<span class="qd-icon material-symbols-rounded">check</span>';
    btnConcluir.addEventListener('click', () => {
      const atualizado = aplicarAcaoLembrete(rem, 'complete');
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CANCEL_TDAH_REMINDER', noteId: note.id });
      }
      onUpdateCallback?.({ reminder: atualizado });
    });

    const btnSnooze = document.createElement('button');
    btnSnooze.type = 'button';
    btnSnooze.className = 'reminder-btn-action snooze';
    btnSnooze.title = 'Adiar por 15 minutos';
    btnSnooze.innerHTML = '<span class="qd-icon material-symbols-rounded">snooze</span>';
    btnSnooze.addEventListener('click', () => {
      const atualizado = aplicarAcaoLembrete(rem, 'snooze', Date.now(), { minutes: 15 });
      onUpdateCallback?.({ reminder: atualizado });
    });

    actionsEl.appendChild(btnConcluir);
    actionsEl.appendChild(btnSnooze);
  }

  const btnRemover = document.createElement('button');
  btnRemover.type = 'button';
  btnRemover.className = 'reminder-btn-action remove';
  btnRemover.title = 'Desativar alarme';
  btnRemover.innerHTML = '<span class="qd-icon material-symbols-rounded">close</span>';
  btnRemover.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'CANCEL_TDAH_REMINDER', noteId: note.id });
    }
    onUpdateCallback?.({ reminder: null });
  });
  actionsEl.appendChild(btnRemover);

  card.appendChild(iconEl);
  card.appendChild(infoEl);
  card.appendChild(actionsEl);
  container.appendChild(card);
}
