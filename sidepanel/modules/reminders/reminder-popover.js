// ── reminder-popover.js ──────────────────────────────────────────────────
// Popover dedicado e intuitivo para configuração de Lembretes de Foco Persistentes na nota.
// Permite ativar/desativar com 1 clique, definir horário inicial, intervalo de repetição e testar.

import { positionPopover } from '../popover.js';
import { updateNoteMetaById } from '../storage.js';
import { criarLembreteFoco, INTERVALOS_FOCO_MINUTOS } from './reminder-types.js';

let activeReminderPopover = null;

export function closeReminderPopover() {
  if (activeReminderPopover) {
    activeReminderPopover.remove();
    activeReminderPopover = null;
  }
}

export function closeReminderPopoverIfOutside(target) {
  if (activeReminderPopover && !activeReminderPopover.contains(target) && !target.closest('#btn-note-header-reminder')) {
    closeReminderPopover();
  }
}

/**
 * Abre o popover do Lembrete de Foco ancorado em um elemento.
 * @param {HTMLElement} anchorEl
 * @param {Object} note
 * @param {Function} [onSaved]
 */
export function openReminderPopover(anchorEl, note, onSaved) {
  if (activeReminderPopover && activeReminderPopover.dataset.noteId === String(note.id)) {
    closeReminderPopover();
    return;
  }
  closeReminderPopover();
  if (!anchorEl || !note) return;

  const props = { ...(note.properties || {}) };
  const rem = props.reminder || props.lembrete || {
    active: false,
    intervalMinutes: 5,
    firstTriggerAt: null,
    completed: false
  };

  const pop = document.createElement('div');
  pop.className = 'copy-menu reminder-popover';
  pop.dataset.noteId = String(note.id);

  // Formata data ISO para datetime-local
  const agora = new Date();
  const formatIsoForInput = d => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const initialDateTime = rem.firstTriggerAt
    ? formatIsoForInput(new Date(rem.firstTriggerAt))
    : formatIsoForInput(new Date(Date.now() + 10 * 60 * 1000));

  pop.innerHTML = `
    <div class="reminder-popover-header">
      <div class="popover-title-row">
        <span class="qd-icon material-symbols-rounded">alarm</span>
        <span class="popover-title">Lembrete de Foco Persistente</span>
      </div>
      <button type="button" class="icon-btn reminder-close-btn" title="Fechar">
        <span class="qd-icon material-symbols-rounded">close</span>
      </button>
    </div>

    <div class="reminder-popover-body">
      <div class="reminder-toggle-row">
        <span class="reminder-toggle-label">Ativar Lembrete</span>
        <label class="graph-switch">
          <input type="checkbox" id="reminder-active-toggle" ${rem.active && !rem.completed ? 'checked' : ''}>
          <span class="graph-switch-slider"></span>
        </label>
      </div>

      <div class="reminder-config-section" id="reminder-config-section" ${rem.active && !rem.completed ? '' : 'style="opacity: 0.6;"'}>
        <div class="reminder-field">
          <label for="reminder-time-input" class="reminder-field-label">Horário do primeiro alarme</label>
          <input type="datetime-local" id="reminder-time-input" class="property-input property-input-datetime" value="${initialDateTime}">
        </div>

        <div class="reminder-quick-presets">
          <button type="button" class="preset-btn" data-min="10">+10 min</button>
          <button type="button" class="preset-btn" data-min="30">+30 min</button>
          <button type="button" class="preset-btn" data-min="60">+1 hora</button>
          <button type="button" class="preset-btn" data-preset="tomorrow">Amanhã 09:00</button>
        </div>

        <div class="reminder-field">
          <label for="reminder-interval-select" class="reminder-field-label">
            Loop de Foco: Repetir a cada
          </label>
          <select id="reminder-interval-select" class="property-select">
            ${INTERVALOS_FOCO_MINUTOS.map(m => `
              <option value="${m}" ${m === (rem.intervalMinutes || 5) ? 'selected' : ''}>
                A cada ${m} minutos
              </option>
            `).join('')}
          </select>
        </div>

        <div class="reminder-info-box">
          <span class="qd-icon material-symbols-rounded">info</span>
          <span>Se você fechar ou ignorar a notificação, ela voltará a tocar até ser marcada como concluída.</span>
        </div>
      </div>

      <div class="reminder-popover-actions">
        <button type="button" id="btn-test-notification" class="preset-btn test-btn" title="Dispara uma notificação de teste imediatamente">
          <span class="qd-icon material-symbols-rounded">notifications_active</span> Testar Alarme
        </button>
        <button type="button" id="btn-save-reminder" class="calendar-action-btn primary">
          Salvar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(pop);
  positionPopover(pop, anchorEl);
  activeReminderPopover = pop;

  const toggleActive = pop.querySelector('#reminder-active-toggle');
  const sectionConfig = pop.querySelector('#reminder-config-section');
  const inputTime = pop.querySelector('#reminder-time-input');
  const selectInterval = pop.querySelector('#reminder-interval-select');

  toggleActive.addEventListener('change', () => {
    sectionConfig.style.opacity = toggleActive.checked ? '1' : '0.6';
  });

  // Presets rápidos de tempo
  pop.querySelectorAll('.preset-btn[data-min]').forEach(btn => {
    btn.addEventListener('click', () => {
      const min = Number(btn.dataset.min);
      const d = new Date(Date.now() + min * 60 * 1000);
      inputTime.value = formatIsoForInput(d);
      toggleActive.checked = true;
      sectionConfig.style.opacity = '1';
    });
  });

  pop.querySelector('.preset-btn[data-preset="tomorrow"]')?.addEventListener('click', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    inputTime.value = formatIsoForInput(d);
    toggleActive.checked = true;
    sectionConfig.style.opacity = '1';
  });

  pop.querySelector('.reminder-close-btn')?.addEventListener('click', closeReminderPopover);

  // Testar notificação
  pop.querySelector('#btn-test-notification')?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'TRIGGER_TEST_NOTIFICATION',
        title: note.title || 'Lembrete QuickDock',
        message: 'Teste de alarme de foco persistente funcionando!'
      });
    } else if (typeof Notification !== 'undefined') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification(note.title || 'QuickDock', { body: 'Teste de alarme de foco!' });
      });
    }
  });

  // Salvar
  pop.querySelector('#btn-save-reminder')?.addEventListener('click', async () => {
    const isAtivo = toggleActive.checked;
    const intervalMinutes = Number(selectInterval.value) || 5;
    const firstTriggerAt = inputTime.value ? new Date(inputTime.value).getTime() : Date.now();

    const novoLembrete = isAtivo
      ? criarLembreteFoco({
          active: true,
          intervalMinutes,
          firstTriggerAt,
          completed: false
        })
      : { active: false, intervalMinutes, completed: false };

    props.reminder = novoLembrete;
    note.properties = { ...props };
    await updateNoteMetaById(note.id, { properties: note.properties });

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      if (isAtivo) {
        chrome.runtime.sendMessage({
          type: 'SCHEDULE_TDAH_REMINDER',
          noteId: note.id,
          title: note.title,
          intervalMinutes,
          firstTriggerAt
        });
      } else {
        chrome.runtime.sendMessage({ type: 'CANCEL_TDAH_REMINDER', noteId: note.id });
      }
    }

    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));

    closeReminderPopover();
    onSaved?.(novoLembrete);
  });
}
