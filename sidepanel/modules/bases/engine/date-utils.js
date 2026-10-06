// ── date-utils.js ───────────────────────────────────────────────────────────
// Datas das Bases — PURO (sem DOM, sem Dexie), 100% no fuso LOCAL.
//
// Regra do projeto: o "dia" de uma nota é o dia no fuso de quem está olhando. Nunca
// `toISOString().slice(0, 10)` (dá o dia em UTC: no Brasil, depois das 21h já é
// "amanhã"). A aritmética de dias usa `Date.UTC` sobre ano/mês/dia, que não sofre com
// horário de verão.
//
// Convenções:
//   ymd      'YYYY-MM-DD'
//   minutes  minutos desde a meia-noite local (0–1439)
//   weekday  0 = domingo … 6 = sábado

const MS_DIA = 86_400_000;

export const pad2 = n => String(n).padStart(2, '0');

export function localYMD(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayYMD(now = new Date()) {
  return localYMD(now);
}

export function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

function ymdParts(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

function utcMs(ymd) {
  const { y, m, d } = ymdParts(ymd);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function isValidYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return fromUtcMs(utcMs(ymd)) === ymd;
}

export function addDays(ymd, n) {
  return fromUtcMs(utcMs(ymd) + n * MS_DIA);
}

/** Dias de `a` até `b` (b − a). */
export function diffDays(a, b) {
  return Math.round((utcMs(b) - utcMs(a)) / MS_DIA);
}

export function compareYMD(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

export function weekdayOf(ymd) {
  return new Date(utcMs(ymd)).getUTCDay();
}

export function addMonths(ymd, n) {
  const { y, m, d } = ymdParts(ymd);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad2(nm + 1)}-${pad2(Math.min(d, ultimo))}`;
}

export function startOfMonth(ymd) {
  const { y, m } = ymdParts(ymd);
  return `${y}-${pad2(m)}-01`;
}

export function endOfMonth(ymd) {
  const { y, m } = ymdParts(ymd);
  return fromUtcMs(Date.UTC(y, m, 0));
}

/** Primeiro dia da semana que contém `ymd`. `firstDay`: 0 = domingo, 1 = segunda… */
export function startOfWeek(ymd, firstDay = 0) {
  const delta = (weekdayOf(ymd) - firstDay + 7) % 7;
  return addDays(ymd, -delta);
}

/**
 * Dias de uma semana. `showWeekends: false` tira sábado e domingo.
 * @returns {string[]} ymds
 */
export function weekDates(ymd, firstDay = 0, { showWeekends = true } = {}) {
  const inicio = startOfWeek(ymd, firstDay);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
  return showWeekends ? dias : dias.filter(d => { const w = weekdayOf(d); return w !== 0 && w !== 6; });
}

/** Semana ISO 8601 (a que contém a quinta-feira decide o ano). */
export function isoWeekNumber(ymd) {
  const w = (weekdayOf(ymd) + 6) % 7;            // seg = 0 … dom = 6
  const quinta = addDays(ymd, 3 - w);
  const { y } = ymdParts(quinta);
  const primeiraQuinta = addDays(`${y}-01-04`, 3 - ((weekdayOf(`${y}-01-04`) + 6) % 7));
  return 1 + Math.round(diffDays(primeiraQuinta, quinta) / 7);
}

/**
 * Matriz do mês: semanas completas (5 ou 6) começando em `firstDay`.
 * @returns {string[][]} semanas × 7 ymds
 */
export function monthMatrix(ymd, firstDay = 0) {
  const primeiro = startOfMonth(ymd);
  const ultimo = endOfMonth(ymd);
  let cursor = startOfWeek(primeiro, firstDay);
  const semanas = [];
  while (compareYMD(cursor, ultimo) <= 0 || semanas.length < 5) {
    semanas.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
    if (semanas.length >= 6) break;
  }
  return semanas;
}

export function minutesToHHMM(min) {
  const m = Math.max(0, Math.min(1439, Math.round(min)));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function parseHHMM(str, padrao = 0) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str ?? '').trim());
  if (!m) return padrao;
  return Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2])));
}

/** 'YYYY-MM-DDTHH:mm' (naïve, local) — o formato que as propriedades de data e hora guardam. */
export function toLocalDateTimeString(ymd, minutes) {
  return `${ymd}T${minutesToHHMM(minutes)}`;
}

/**
 * Entende os formatos de data que aparecem nas notas.
 * @returns {{ ymd: string, minutes: number|null, hasTime: boolean } | null}
 */
export function parseDateValue(val) {
  if (val === null || val === undefined || val === '') return null;

  const deData = d => (isNaN(d.getTime())
    ? null
    : { ymd: localYMD(d), minutes: nowMinutes(d), hasTime: true });

  if (typeof val === 'number') return deData(new Date(val));
  if (val instanceof Date) return deData(val);

  const s = String(val).trim();
  if (!s) return null;

  // Só a data: o dia escolhido, sem fuso nenhum pra converter
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidYMD(s) ? { ymd: s, minutes: null, hasTime: false } : null;

  // Data e hora "ingênuas" (sem fuso): valem como horário local
  const naive = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
  if (naive) {
    return isValidYMD(naive[1])
      ? { ymd: naive[1], minutes: Number(naive[2]) * 60 + Number(naive[3]), hasTime: true }
      : null;
  }

  // ISO com fuso (Z ou ±hh:mm): converte pro horário local
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return deData(new Date(s));

  // DD/MM/YYYY [HH:mm]
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(s);
  if (br) {
    const ymd = `${br[3]}-${br[2]}-${br[1]}`;
    if (!isValidYMD(ymd)) return null;
    return br[4] !== undefined
      ? { ymd, minutes: Number(br[4]) * 60 + Number(br[5]), hasTime: true }
      : { ymd, minutes: null, hasTime: false };
  }

  return deData(new Date(s));
}

/** Atalho: só o dia (ymd) de qualquer valor de data, ou null. */
export function toYMD(val) {
  return parseDateValue(val)?.ymd ?? null;
}
