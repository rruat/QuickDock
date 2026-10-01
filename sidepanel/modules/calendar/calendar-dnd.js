// ── calendar-dnd.js ──────────────────────────────────────────────────────
// Módulo especializado em Drag and Drop para o Calendário do QuickDock.
// Gerencia soltura de notas arrastadas do backlog ou entre dias.

import { updateNoteMetaById, getNoteById } from '../storage.js';

/**
 * Ativa os ouvintes de Drag and Drop nas células do calendário.
 * @param {HTMLElement} gridContainer
 * @param {Function} onDroppedCallback
 */
export function setupCalendarDropTargets(gridContainer, onDroppedCallback) {
  if (!gridContainer) return;

  const targets = gridContainer.querySelectorAll('.calendar-day, .calendar-week-col');

  targets.forEach(cell => {
    cell.addEventListener('dragover', e => {
      e.preventDefault();
      cell.classList.add('is-drag-over');
    });

    cell.addEventListener('dragleave', () => {
      cell.classList.remove('is-drag-over');
    });

    cell.addEventListener('drop', async e => {
      e.preventDefault();
      cell.classList.remove('is-drag-over');

      const dataStr = cell.dataset.date;
      if (!dataStr) return;

      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const info = JSON.parse(raw);
        if (!info.id) return;

        const nota = await getNoteById(info.id);
        if (!nota) return;

        const props = { ...(nota.properties || {}) };
        props.data = dataStr;
        delete props.daterange; // Converte para o dia solto

        await updateNoteMetaById(info.id, { properties: props });
        onDroppedCallback?.({ noteId: info.id, dataStr });

        document.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view'));
      } catch (err) {
        console.warn('Falha ao processar drop no calendário:', err);
      }
    });
  });
}
