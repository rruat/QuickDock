// ── calendar-engine.js ───────────────────────────────────────────────────
// Motor puro de cálculos temporais para o Calendário do QuickDock.
// Funções 100% puras, sem DOM, sem Dexie — seguro para Node.js e testes unitários.

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Normaliza qualquer valor para string YYYY-MM-DD segura sem erro de timezone UTC.
 * @param {string|number|Date} val
 * @returns {string|null}
 */
export function normalizarDataString(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const s = val.trim();
    // YYYY-MM-DD puro: retorna direto sem passar por Date (evita shift UTC-3)
    const mIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
    // DD/MM/YYYY
    const mBr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    if (mBr) return `${mBr[3]}-${mBr[2]}-${mBr[1]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dia}`;
    }
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dia}`;
    }
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const dia = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
  }
  return null;
}

/**
 * Extrai a data associada a uma nota conforme a fonte temporal selecionada.
 * @param {Object} nota
 * @param {'schedule'|'created'|'updated'|'auto'} [fonte='schedule']
 * @returns {string|null} YYYY-MM-DD
 */
export function extrairDataDaNota(nota, fonte = 'schedule') {
  if (!nota) return null;

  if (fonte === 'created') {
    return normalizarDataString(nota.createdAt || nota.criadoEm);
  }
  if (fonte === 'updated') {
    return normalizarDataString(nota.updatedAt || nota.atualizadoEm);
  }

  const props = nota.properties || {};
  if (props.daterange && typeof props.daterange === 'object' && props.daterange.start) {
    return normalizarDataString(props.daterange.start);
  }
  const raw = props.data ?? props.date ?? props.dueDate ?? props.datetime ?? props.horario ?? nota.data ?? nota.date;
  const dataAgendada = normalizarDataString(raw);

  if (fonte === 'auto' && !dataAgendada) {
    return normalizarDataString(nota.createdAt || nota.criadoEm);
  }

  return dataAgendada;
}

/**
 * Retorna a data de criação pura de uma nota.
 * @param {Object} nota
 * @returns {string|null} YYYY-MM-DD
 */
export function extrairDataCriacaoNota(nota) {
  if (!nota) return null;
  return normalizarDataString(nota.createdAt || nota.criadoEm);
}

/**
 * Extrai o intervalo completo de período e horários de uma nota.
 * @param {Object} nota
 * @returns {{ start: string, end: string, allDay: boolean, startTime?: string, endTime?: string } | null}
 */
export function extrairIntervaloDaNota(nota) {
  if (!nota) return null;
  const props = nota.properties || {};
  if (props.daterange && typeof props.daterange === 'object' && props.daterange.start) {
    const start = normalizarDataString(props.daterange.start);
    const end = normalizarDataString(props.daterange.end || props.daterange.start);
    if (!start) return null;
    return {
      start,
      end: end || start,
      allDay: props.daterange.allDay !== false
    };
  }

  const dtRaw = props.datetime ?? props.horario;
  if (typeof dtRaw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dtRaw)) {
    const ymd = dtRaw.slice(0, 10);
    const time = dtRaw.slice(11, 16);
    return { start: ymd, end: ymd, allDay: false, startTime: time };
  }

  const s = extrairDataDaNota(nota);
  if (!s) return null;
  return { start: s, end: s, allDay: true };
}

/**
 * Retorna o título por extenso do mês e ano em português.
 * @param {number} ano
 * @param {number} mes (0 a 11)
 * @returns {string} Ex: "Outubro de 2026"
 */
export function formatarMesAno(ano, mes) {
  const nomeMes = MESES[mes] ?? '';
  return `${nomeMes} de ${ano}`;
}

/**
 * Gera a matriz de células do calendário para o mês fornecido (7 colunas).
 * Retorna no mínimo 35 células e no máximo 42 células.
 * @param {number} ano
 * @param {number} mes (0 a 11)
 * @param {Date} [dataReferencia]
 * @returns {Array<Object>}
 */
export function gerarMatrizCalendario(ano, mes, dataReferencia = new Date()) {
  const hojeString = `${dataReferencia.getFullYear()}-${String(dataReferencia.getMonth() + 1).padStart(2, '0')}-${String(dataReferencia.getDate()).padStart(2, '0')}`;
  const primeiroDiaDoMes = new Date(ano, mes, 1);
  const diaSemanaInicio = primeiroDiaDoMes.getDay(); // 0 = Dom, 1 = Seg...
  const totalDiasMes = new Date(ano, mes + 1, 0).getDate();
  const totalDiasMesAnterior = new Date(ano, mes, 0).getDate();

  const celulas = [];

  // 1. Dias do mês anterior
  for (let i = diaSemanaInicio - 1; i >= 0; i--) {
    const d = totalDiasMesAnterior - i;
    const mesAnt = mes === 0 ? 11 : mes - 1;
    const anoAnt = mes === 0 ? ano - 1 : ano;
    const dataStr = `${anoAnt}-${String(mesAnt + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celulas.push({
      ano: anoAnt,
      mes: mesAnt,
      dia: d,
      dataFormatada: dataStr,
      outroMes: true,
      ehHoje: dataStr === hojeString
    });
  }

  // 2. Dias do mês corrente
  for (let d = 1; d <= totalDiasMes; d++) {
    const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celulas.push({
      ano,
      mes,
      dia: d,
      dataFormatada: dataStr,
      outroMes: false,
      ehHoje: dataStr === hojeString
    });
  }

  // 3. Dias do mês seguinte até completar múltiplo de 7 (mínimo 35)
  const resto = celulas.length % 7;
  const diasExtras = resto === 0 ? 0 : 7 - resto;
  const totalAlvo = (celulas.length + diasExtras < 35) ? 35 : celulas.length + diasExtras;
  const diasAAdicionar = totalAlvo - celulas.length;

  for (let d = 1; d <= diasAAdicionar; d++) {
    const mesProx = mes === 11 ? 0 : mes + 1;
    const anoProx = mes === 11 ? ano + 1 : ano;
    const dataStr = `${anoProx}-${String(mesProx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celulas.push({
      ano: anoProx,
      mes: mesProx,
      dia: d,
      dataFormatada: dataStr,
      outroMes: true,
      ehHoje: dataStr === hojeString
    });
  }

  return celulas;
}

/**
 * Gera os 7 dias da semana contendo uma data específica.
 * @param {number} ano
 * @param {number} mes
 * @param {number} dia
 * @param {Date} [dataReferencia]
 * @returns {Array<Object>}
 */
export function gerarMatrizSemana(ano, mes, dia, dataReferencia = new Date()) {
  const alvo = new Date(ano, mes, dia);
  const diaSemana = alvo.getDay(); // 0 a 6
  const domingo = new Date(ano, mes, dia - diaSemana);
  const hojeString = `${dataReferencia.getFullYear()}-${String(dataReferencia.getMonth() + 1).padStart(2, '0')}-${String(dataReferencia.getDate()).padStart(2, '0')}`;

  const semana = [];
  for (let i = 0; i < 7; i++) {
    const curr = new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate() + i);
    const dataStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
    semana.push({
      ano: curr.getFullYear(),
      mes: curr.getMonth(),
      dia: curr.getDate(),
      diaSemana: i,
      diaSemanaNome: DIAS_SEMANA_ABREV[i],
      dataFormatada: dataStr,
      ehHoje: dataStr === hojeString
    });
  }
  return semana;
}
