// ── calendar-month-view.js ───────────────────────────────────────────────
// Renderização especializada da grade mensal do Calendário do QuickDock.
// Suporta chips de notas diárias e barras contínuas horizontais (multi-day spans).
// Módulo leve focado exclusivamente na montagem do DOM mensal.

import { agruparCelulasPorSemana, calcularSpansDaSemana } from './calendar-spans.js';

/**
 * Renderiza a grade mensal no elemento container.
 * @param {HTMLElement} gridEl
 * @param {Array<Object>} matriz Matriz de 35 ou 42 células
 * @param {Map<string, Array<Object>>} notasPorData
 * @param {Array<{ note: Object, start: string, end: string }>} eventosMultiDia
 * @param {{ onOpenNote: Function, onAddNote: Function }} callbacks
 */
export function renderMonthGrid(gridEl, matriz, notasPorData, eventosMultiDia = [], callbacks = {}) {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  gridEl.className = 'calendar-grid calendar-month-grid';

  const semanas = agruparCelulasPorSemana(matriz);

  for (const semana of semanas) {
    const semanaRowEl = document.createElement('div');
    semanaRowEl.className = 'calendar-week-row';

    // 1. Linha dos dias (7 células)
    const daysContainer = document.createElement('div');
    daysContainer.className = 'calendar-week-days';

    for (const celula of semana) {
      const diaEl = document.createElement('div');
      diaEl.className = 'calendar-day'
        + (celula.outroMes ? ' calendar-day-other-month' : '')
        + (celula.ehHoje ? ' calendar-day-today' : '');
      diaEl.dataset.date = celula.dataFormatada;

      // Cabeçalho do dia
      const headerEl = document.createElement('div');
      headerEl.className = 'calendar-day-header';

      const numEl = document.createElement('span');
      numEl.className = 'calendar-day-number';
      numEl.textContent = String(celula.dia);

      const btnAddEl = document.createElement('button');
      btnAddEl.type = 'button';
      btnAddEl.className = 'calendar-day-add-btn';
      btnAddEl.title = `Adicionar nota em ${celula.dataFormatada}`;
      btnAddEl.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add</span>';
      btnAddEl.addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onAddNote?.(celula.dataFormatada);
      });

      headerEl.appendChild(numEl);
      headerEl.appendChild(btnAddEl);
      diaEl.appendChild(headerEl);

      // Notas pontuais deste dia (exclui notas multi-dias que já aparecem na barra horizontal)
      const notasDiaEl = document.createElement('div');
      notasDiaEl.className = 'calendar-day-notes';

      const notasDesteDia = notasPorData.get(celula.dataFormatada) || [];
      const idsMultiDia = new Set(eventosMultiDia.map(e => e.note.id || e.note.uid));

      for (const nota of notasDesteDia) {
        const idNota = nota.id || nota.uid;
        // Se for evento multi-dia, já será renderizado na barra da semana
        if (idsMultiDia.has(idNota)) continue;

        const chipEl = criarChipNota(nota, callbacks.onOpenNote);
        notasDiaEl.appendChild(chipEl);
      }

      diaEl.appendChild(notasDiaEl);

      // Duplo clique na célula vazia adiciona nota
      diaEl.addEventListener('dblclick', e => {
        if (e.target.closest('.calendar-note-chip') || e.target.closest('.calendar-day-add-btn')) return;
        callbacks.onAddNote?.(celula.dataFormatada);
      });

      daysContainer.appendChild(diaEl);
    }

    semanaRowEl.appendChild(daysContainer);

    // 2. Camada de Barras Contínuas Multi-Dias (Spans)
    const spansSemana = calcularSpansDaSemana(semana, eventosMultiDia);
    if (spansSemana.length > 0) {
      const spansContainer = document.createElement('div');
      spansContainer.className = 'calendar-week-spans';

      for (const span of spansSemana) {
        const barEl = document.createElement('div');
        barEl.className = 'calendar-span-bar'
          + (span.isStart ? ' span-is-start' : '')
          + (span.isEnd ? ' span-is-end' : '');
        barEl.style.gridColumnStart = String(span.colStart + 1);
        barEl.style.gridColumnEnd = `span ${span.colSpan}`;
        barEl.style.top = `${28 + (span.level * 22)}px`;

        if (span.note.color) {
          barEl.style.borderLeftColor = span.note.color;
        }

        const titleEl = document.createElement('span');
        titleEl.className = 'calendar-span-title';
        titleEl.textContent = span.note.title || 'Sem título';
        barEl.appendChild(titleEl);

        barEl.addEventListener('click', e => {
          e.stopPropagation();
          callbacks.onOpenNote?.(span.note);
        });

        spansContainer.appendChild(barEl);
      }
      semanaRowEl.appendChild(spansContainer);
    }

    gridEl.appendChild(semanaRowEl);
  }
}

/**
 * Cria o elemento chip de nota diária.
 */
function criarChipNota(nota, onOpenNote) {
  const chipEl = document.createElement('div');
  chipEl.className = 'calendar-note-chip';
  chipEl.title = nota.title || 'Sem título';

  const dotEl = document.createElement('span');
  dotEl.className = 'calendar-chip-dot';
  if (nota.color) dotEl.style.backgroundColor = nota.color;

  const titleEl = document.createElement('span');
  titleEl.className = 'calendar-chip-title';
  titleEl.textContent = nota.title || 'Sem título';

  chipEl.appendChild(dotEl);
  chipEl.appendChild(titleEl);

  const props = nota.properties || {};
  const cat = props.categoria ?? props.category ?? props.tag ?? '';
  if (cat && typeof cat === 'string') {
    const catBadge = document.createElement('span');
    catBadge.className = 'calendar-chip-cat';
    catBadge.textContent = cat.trim();
    chipEl.appendChild(catBadge);
  }

  chipEl.addEventListener('click', e => {
    e.stopPropagation();
    onOpenNote?.(nota);
  });

  return chipEl;
}
