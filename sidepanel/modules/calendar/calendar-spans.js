// ── calendar-spans.js ────────────────────────────────────────────────────
// Algoritmo puro de fatiamento de períodos multi-dias em barras contínuas (spans).
// Permite renderizar eventos que duram vários dias no estilo Google Calendar.
// 100% puro, sem dependência de DOM.

/**
 * Divide uma lista plana de células do calendário em linhas de semanas (7 dias cada).
 * @param {Array<Object>} celulas Matriz de 35 ou 42 células
 * @returns {Array<Array<Object>>}
 */
export function agruparCelulasPorSemana(celulas) {
  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) {
    semanas.push(celulas.slice(i, i + 7));
  }
  return semanas;
}

/**
 * Calcula os segmentos visuais horizontais de eventos multi-dias para uma semana específica.
 * @param {Array<Object>} semana Sete células da semana (Dom a Sáb)
 * @param {Array<{ note: Object, start: string, end: string }>} eventosMultiDia
 * @returns {Array<{ note: Object, colStart: number, colSpan: number, isStart: boolean, isEnd: boolean, level: number }>}
 */
export function calcularSpansDaSemana(semana, eventosMultiDia) {
  if (!semana?.length || !eventosMultiDia?.length) return [];

  const dataInicioSemana = semana[0].dataFormatada;
  const dataFimSemana = semana[6].dataFormatada;

  // Filtra eventos que tocam esta semana
  const ativos = eventosMultiDia.filter(ev => {
    return ev.start <= dataFimSemana && ev.end >= dataInicioSemana;
  });

  // Ordena: eventos mais longos primeiro, depois por data de início
  ativos.sort((a, b) => {
    const durA = a.end.localeCompare(a.start);
    const durB = b.end.localeCompare(b.start);
    if (durA !== durB) return durB - durA;
    return a.start.localeCompare(b.start);
  });

  const slotsOcupados = []; // slotsOcupados[level][diaIndex] = boolean
  const segmentos = [];

  for (const ev of ativos) {
    let startIndex = -1;
    let endIndex = -1;

    for (let i = 0; i < 7; i++) {
      const dataDia = semana[i].dataFormatada;
      if (dataDia >= ev.start && startIndex === -1) startIndex = i;
      if (dataDia <= ev.end) endIndex = i;
    }

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) continue;

    const colStart = startIndex;
    const colSpan = (endIndex - startIndex) + 1;
    const isStart = semana[startIndex].dataFormatada === ev.start;
    const isEnd = semana[endIndex].dataFormatada === ev.end;

    // Encontra o nível vertical livre mais baixo nesta semana
    let level = 0;
    while (true) {
      if (!slotsOcupados[level]) slotsOcupados[level] = new Array(7).fill(false);
      let colide = false;
      for (let c = colStart; c <= endIndex; c++) {
        if (slotsOcupados[level][c]) {
          colide = true;
          break;
        }
      }
      if (!colide) break;
      level++;
    }

    // Ocupa o nível para os dias do segmento
    for (let c = colStart; c <= endIndex; c++) {
      slotsOcupados[level][c] = true;
    }

    segmentos.push({
      note: ev.note,
      start: ev.start,
      end: ev.end,
      colStart,
      colSpan,
      isStart,
      isEnd,
      level
    });
  }

  return segmentos;
}
