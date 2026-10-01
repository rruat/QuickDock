// ── calendar-week-view.js ────────────────────────────────────────────────
// Visualização Semanal detalhada para o Calendário do QuickDock.
// Exibe os 7 dias da semana com slots verticais e cartões de compromissos com horário.
// Módulo leve focado na montagem da grade da semana.

import { gerarMatrizSemana } from './calendar-engine.js';

/**
 * Renderiza a visualização semanal no contêiner fornecido.
 * @param {HTMLElement} containerEl
 * @param {number} ano
 * @param {number} mes (0 a 11)
 * @param {number} dia
 * @param {Map<string, Array<Object>>} notasPorData
 * @param {Array<{ note: Object, start: string, end: string }>} eventosMultiDia
 * @param {{ onOpenNote: Function, onAddNote: Function }} callbacks
 */
export function renderWeekView(containerEl, ano, mes, dia, notasPorData, eventosMultiDia = [], callbacks = {}) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  containerEl.className = 'calendar-grid calendar-week-grid';

  const diasSemana = gerarMatrizSemana(ano, mes, dia);

  // 1. Cabeçalho das 7 Colunas da Semana
  const headerGrid = document.createElement('div');
  headerGrid.className = 'calendar-week-header-grid';

  for (const d of diasSemana) {
    const colHeader = document.createElement('div');
    colHeader.className = 'calendar-week-col-header' + (d.ehHoje ? ' is-today' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'week-col-name';
    nameEl.textContent = d.diaSemanaNome;

    const numEl = document.createElement('span');
    numEl.className = 'week-col-num';
    numEl.textContent = String(d.dia);

    const btnAdd = document.createElement('button');
    btnAdd.type = 'button';
    btnAdd.className = 'calendar-day-add-btn';
    btnAdd.title = `Adicionar em ${d.dataFormatada}`;
    btnAdd.innerHTML = '<span class="qd-icon material-symbols-rounded">add</span>';
    btnAdd.addEventListener('click', e => {
      e.stopPropagation();
      callbacks.onAddNote?.(d.dataFormatada);
    });

    colHeader.appendChild(nameEl);
    colHeader.appendChild(numEl);
    colHeader.appendChild(btnAdd);
    headerGrid.appendChild(colHeader);
  }
  containerEl.appendChild(headerGrid);

  // 2. Colunas de Conteúdo da Semana
  const bodyGrid = document.createElement('div');
  bodyGrid.className = 'calendar-week-body-grid';

  for (const d of diasSemana) {
    const colEl = document.createElement('div');
    colEl.className = 'calendar-week-col' + (d.ehHoje ? ' is-today' : '');
    colEl.dataset.date = d.dataFormatada;

    const notasDoDia = notasPorData.get(d.dataFormatada) || [];

    for (const nota of notasDoDia) {
      const cardEl = document.createElement('div');
      cardEl.className = 'calendar-week-card';
      if (nota.color) cardEl.style.borderLeftColor = nota.color;

      const titleEl = document.createElement('div');
      titleEl.className = 'week-card-title';
      titleEl.textContent = nota.title || 'Sem título';

      cardEl.appendChild(titleEl);

      const props = nota.properties || {};
      const time = props.datetime ? props.datetime.slice(11, 16) : null;
      if (time) {
        const timeEl = document.createElement('span');
        timeEl.className = 'week-card-time';
        timeEl.innerHTML = `<span class="qd-icon material-symbols-rounded">schedule</span> ${time}`;
        cardEl.appendChild(timeEl);
      }

      cardEl.addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onOpenNote?.(nota);
      });

      colEl.appendChild(cardEl);
    }

    colEl.addEventListener('dblclick', e => {
      if (e.target.closest('.calendar-week-card')) return;
      callbacks.onAddNote?.(d.dataFormatada);
    });

    bodyGrid.appendChild(colEl);
  }

  containerEl.appendChild(bodyGrid);
}
