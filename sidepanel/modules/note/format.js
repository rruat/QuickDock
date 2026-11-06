import { t as tr } from '../i18n.js';
export function parseDate(raw) {
  const s = raw.trim();
  let day, month, year;

  if (/^\d{8}$/.test(s)) {
    year = +s.slice(0, 4); month = +s.slice(4, 6); day = +s.slice(6, 8);
  } else if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(s)) {
    [year, month, day] = s.split(/[-\/]/).map(Number);
  } else if (/^\d{2}[\/\-\. ]\d{2}[\/\-\. ]\d{4}$/.test(s)) {
    [day, month, year] = s.split(/[\/\-\. ]/).map(Number);
  } else {
    return null;
  }

  if (!day || !month || !year) return null;
  if (month < 1 || month > 12) return null;
  if (day   < 1 || day   > 31) return null;
  if (year  < 1900 || year > new Date().getFullYear()) return null;

  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function calculateAge(date) {
  const now = new Date();
  let age   = now.getFullYear() - date.getFullYear();
  const m   = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age--;
  return age;
}

export function formatDateBR(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

export const ATE_RE = /[ \t]+at[eé][ \t]+/i;

export function parseDateRange(raw) {
  const parts = raw.split(ATE_RE);
  if (parts.length !== 2) return null;
  const d1 = parseDate(parts[0].trim());
  const d2 = parseDate(parts[1].trim());
  if (!d1 || !d2) return null;
  const days = Math.round((d2 - d1) / 86400000);
  return { d1, d2, days };
}

export function parseTime(raw) {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = +m[1], min = +m[2], sec = m[3] ? +m[3] : 0;
  if (h > 23 || min > 59 || sec > 59) return null;
  return { h, min, sec, totalSec: h * 3600 + min * 60 + sec };
}

export function fmtTime(t) {
  return `${String(t.h).padStart(2,'0')}:${String(t.min).padStart(2,'0')}`;
}

export function parseTimeRange(raw) {
  const parts = raw.split(ATE_RE);
  if (parts.length !== 2) return null;
  const t1 = parseTime(parts[0].trim());
  const t2 = parseTime(parts[1].trim());
  if (!t1 || !t2) return null;
  return { t1, t2, diffSec: t2.totalSec - t1.totalSec };
}

export function parseDateTime(raw) {
  const m = raw.trim().match(/^(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})[ \t]+(\d{1,2}:\d{2}(?::\d{2})?)$/);
  if (!m) return null;
  const d = parseDate(m[1]);
  const t = parseTime(m[2]);
  if (!d || !t) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.min, t.sec);
}

export function parseDateTimeRange(raw) {
  const parts = raw.split(ATE_RE);
  if (parts.length !== 2) return null;
  const dt1 = parseDateTime(parts[0].trim());
  const dt2 = parseDateTime(parts[1].trim());
  if (!dt1 || !dt2) return null;
  return { dt1, dt2, diffSec: Math.round((dt2 - dt1) / 1000) };
}

export function fmtTimeDiff(absSec) {
  const d   = Math.floor(absSec / 86400);
  const rem = absSec % 86400;
  const h   = Math.floor(rem / 3600);
  const min = Math.floor((rem % 3600) / 60);
  const parts = [];
  if (d   > 0)              parts.push(`${d} ${d === 1 ? 'dia' : 'dias'}`);
  if (h   > 0)              parts.push(`${h}h`);
  if (min > 0 || d + h === 0) parts.push(`${min}min`);
  return parts.join(' ');
}

export function onlyDigits(str) { return str.replace(/\D/g, ''); }

export function maskCPF(n)   { return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`; }

export function maskCNPJ(n)  { return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`; }

export function validateCPF(raw) {
  const n = raw.replace(/\D/g, '');
  if (n.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(n)) return false;
  const d = n.split('').map(Number);
  const dig = (len, base) => {
    const r = d.slice(0, len).reduce((s, v, i) => s + v * (base - i), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dig(9, 10) === d[9] && dig(10, 11) === d[10];
}

export function validateCNPJ(raw) {
  const n = raw.replace(/[.\-\/]/g, '').toUpperCase();
  if (n.length !== 14) return false;
  if (/^(.)\1{13}$/.test(n)) return false;
  if (!/^[A-Z0-9]{12}\d{2}$/.test(n)) return false;
  const val = c => c.charCodeAt(0) - 48;
  const chars = n.split('');
  const dig = (len, w) => {
    const r = chars.slice(0, len).reduce((s, c, i) => s + val(c) * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dig(12, [5,4,3,2,9,8,7,6,5,4,3,2]) === +n[12] &&
         dig(13, [6,5,4,3,2,9,8,7,6,5,4,3,2]) === +n[13];
}

export function maskCEP(n)   { return `${n.slice(0,5)}-${n.slice(5)}`; }

export function maskPhone(n) {
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return n;
}

export const TYPE_LABELS = { cpf: 'CPF', cnpj: 'CNPJ', phone: tr('Telefone'), date: tr('Data'), daterange: tr('Período'), timerange: tr('Intervalo de horas'), datetimerange: tr('Período com hora'), cep: 'CEP', email: tr('E-mail'), math: tr('Cálculo') };
