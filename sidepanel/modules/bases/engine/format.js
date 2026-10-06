// ── format.js ───────────────────────────────────────────────────────────────
// Formatos de exibição por propriedade (4.5): número e data. PURO.
//   número: { kind: plain|currency|percent|progress-bar|progress-ring, currency?, decimals?, divideBy? }
//   data:   { kind: absolute|relative|short|long, showTime? }

import { toYMD, todayYMD, diffDays, parseDateValue } from './date-utils.js';

export const NUMBER_KINDS = [
  { value: 'plain', label: 'Número' }, { value: 'currency', label: 'Moeda' }, { value: 'percent', label: 'Percentual' },
  { value: 'progress-bar', label: 'Barra de progresso' }, { value: 'progress-ring', label: 'Anel de progresso' },
];
export const DATE_KINDS = [
  { value: 'absolute', label: 'dd/mm/aaaa' }, { value: 'short', label: '6 out' }, { value: 'long', label: '6 de outubro de 2026' },
  { value: 'relative', label: 'Relativa (hoje, amanhã…)' },
];
export const CURRENCIES = [{ value: 'BRL', label: 'Real (R$)' }, { value: 'USD', label: 'Dólar (US$)' }, { value: 'EUR', label: 'Euro (€)' }];

const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Texto do número no formato (barras/anéis também têm texto, ex.: "40%"). null se não for número. */
export function formatNumber(value, fmt = {}) {
  let n = num(value);
  if (n === null) return null;
  if (fmt.divideBy > 0) n /= fmt.divideBy;
  const casas = Number.isInteger(fmt.decimals) ? Math.min(8, Math.max(0, fmt.decimals)) : null;
  switch (fmt.kind) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: fmt.currency || 'BRL', ...(casas !== null ? { minimumFractionDigits: casas, maximumFractionDigits: casas } : {}) }).format(n);
    case 'percent':
    case 'progress-bar':
    case 'progress-ring':
      // 0–1 = fração; acima de 1 já é porcentagem (ex.: 40 → 40%) — evita "4000%"
      return `${(n <= 1 && n >= 0 ? n * 100 : n).toLocaleString('pt-BR', { maximumFractionDigits: casas ?? 0 })}%`;
    default:
      return n.toLocaleString('pt-BR', { maximumFractionDigits: casas ?? 2, ...(casas !== null ? { minimumFractionDigits: casas } : {}) });
  }
}

/** 0–100 para barras/anéis. */
export function progressPercent(value, fmt = {}) {
  let n = num(value);
  if (n === null) return 0;
  if (fmt.divideBy > 0) n /= fmt.divideBy;
  return Math.max(0, Math.min(100, n <= 1 && n >= 0 ? n * 100 : n));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Texto da data no formato. null se não for data. `now` injetável pros testes. */
export function formatDateValue(value, fmt = {}, now = new Date()) {
  const ymd = toYMD(value);
  if (!ymd) return null;
  const [a, m, d] = ymd.split('-');
  const p = parseDateValue(value);
  const hora = fmt.showTime && p?.hasTime ? ` ${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}` : '';
  switch (fmt.kind) {
    case 'short': return `${Number(d)} ${MESES[Number(m) - 1]}${hora}`;
    case 'long': return `${Number(d)} de ${MESES_LONGOS[Number(m) - 1]} de ${a}${hora}`;
    case 'relative': {
      const dif = diffDays(todayYMD(now), ymd);
      if (dif === 0) return 'hoje' + hora;
      if (dif === 1) return 'amanhã' + hora;
      if (dif === -1) return 'ontem' + hora;
      if (dif > 1 && dif < 31) return `em ${dif} dias`;
      if (dif < -1 && dif > -31) return `há ${-dif} dias`;
      return `${d}/${m}/${a}${hora}`;
    }
    default: return `${d}/${m}/${a}${hora}`;
  }
}
