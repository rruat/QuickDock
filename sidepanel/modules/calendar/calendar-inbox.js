// ── calendar-inbox.js ────────────────────────────────────────────────────
// Gaveta retrátil de notas não agendadas (Inbox / Backlog temporal).
// Exibe notas que ainda não possuem data de agendamento, mostrando quando foram criadas.
// Permite agendamento com um clique ou arrastar e soltar (Drag and Drop).

import { extrairDataCriacaoNota, extrairDataDaNota } from './calendar-engine.js';

/**
 * Filtra as notas que estão no Inbox (sem data de agendamento).
 * @param {Array<Object>} notas
 * @returns {Array<Object>}
 */
export function filtrarNotasSemData(notas) {
  if (!Array.isArray(notas)) return [];
  return notas.filter(n => !extrairDataDaNota(n, 'schedule'));
}

/**
 * Renderiza o painel retrátil de notas não agendadas (Backlog).
 * @param {HTMLElement} containerEl
 * @param {Array<Object>} notas
 * @param {{ onAgendarNota: Function, onOpenNote: Function }} callbacks
 */
export function renderCalendarInbox(containerEl, notas, callbacks = {}) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  containerEl.className = 'calendar-inbox-panel';

  const notasSemData = filtrarNotasSemData(notas);

  const headerEl = document.createElement('div');
  headerEl.className = 'calendar-inbox-header';
  headerEl.innerHTML = `
    <div class="inbox-header-title">
      <span class="qd-icon material-symbols-rounded">inbox</span>
      <span>Sem data / Backlog</span>
      <span class="inbox-count-badge">${notasSemData.length}</span>
    </div>
  `;
  containerEl.appendChild(headerEl);

  const listEl = document.createElement('div');
  listEl.className = 'calendar-inbox-list';

  for (const nota of notasSemData) {
    const itemEl = document.createElement('div');
    itemEl.className = 'calendar-inbox-item';
    itemEl.draggable = true;
    itemEl.dataset.noteId = nota.id || nota.uid;

    if (nota.color) itemEl.style.borderLeftColor = nota.color;

    const dataCriacao = extrairDataCriacaoNota(nota);
    const dataCriacaoFmt = dataCriacao ? dataCriacao.split('-').reverse().slice(0, 2).join('/') : '';

    itemEl.innerHTML = `
      <div class="inbox-item-body">
        <span class="inbox-item-title">${nota.title || 'Sem título'}</span>
        ${dataCriacaoFmt ? `<span class="inbox-item-created" title="Data de criação"><span class="qd-icon material-symbols-rounded">history</span> Criada em ${dataCriacaoFmt}</span>` : ''}
      </div>
      <button type="button" class="inbox-schedule-today-btn" title="Agendar para hoje">
        <span class="qd-icon material-symbols-rounded">event</span>
      </button>
    `;

    // Evento de Drag para o dia do calendário
    itemEl.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: nota.id,
        uid: nota.uid,
        title: nota.title
      }));
      itemEl.classList.add('is-dragging');
    });

    itemEl.addEventListener('dragend', () => {
      itemEl.classList.remove('is-dragging');
    });

    // Clique para abrir a nota
    itemEl.querySelector('.inbox-item-body')?.addEventListener('click', () => {
      callbacks.onOpenNote?.(nota);
    });

    // Botão de agendar rápido para hoje
    itemEl.querySelector('.inbox-schedule-today-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const hoje = new Date();
      const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      callbacks.onAgendarNota?.(nota, hojeStr);
    });

    listEl.appendChild(itemEl);
  }

  if (notasSemData.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'calendar-inbox-empty';
    vazio.innerHTML = '<span class="qd-icon material-symbols-rounded">task_alt</span><p>Tudo agendado! Nenhuma nota pendente.</p>';
    listEl.appendChild(vazio);
  }

  containerEl.appendChild(listEl);
}
