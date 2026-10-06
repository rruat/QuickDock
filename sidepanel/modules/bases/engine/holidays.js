// ── holidays.js ─────────────────────────────────────────────────────────────
// Feriados nacionais (extra além do Notion) — PURO. Hoje: Brasil. Datas móveis a partir da Páscoa
// (algoritmo de Meeus/Jones/Butcher). Municipais/estaduais não entram (variam demais).

import { addDays } from './date-utils.js';

const z = n => String(n).padStart(2, '0');

/** Domingo de Páscoa do ano (ymd). */
export function easterSunday(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${z(mes)}-${z(dia)}`;
}

/** @returns {Map<string,string>} ymd → nome */
export function holidaysBR(ano) {
  const pascoa = easterSunday(ano);
  const lista = [
    [`${ano}-01-01`, 'Confraternização Universal'],
    [addDays(pascoa, -48), 'Segunda de Carnaval'],
    [addDays(pascoa, -47), 'Carnaval'],
    [addDays(pascoa, -2), 'Sexta-feira Santa'],
    [pascoa, 'Páscoa'],
    [`${ano}-04-21`, 'Tiradentes'],
    [`${ano}-05-01`, 'Dia do Trabalho'],
    [addDays(pascoa, 60), 'Corpus Christi'],
    [`${ano}-09-07`, 'Independência do Brasil'],
    [`${ano}-10-12`, 'Nossa Senhora Aparecida'],
    [`${ano}-11-02`, 'Finados'],
    [`${ano}-11-15`, 'Proclamação da República'],
  ];
  if (ano >= 2024) lista.push([`${ano}-11-20`, 'Dia da Consciência Negra']);
  lista.push([`${ano}-12-25`, 'Natal']);
  return new Map(lista);
}

/** Feriados que cobrem os dias dados (vários anos, ex.: semana de virada de ano). */
export function holidaysForDays(days, country = 'BR') {
  const out = new Map();
  if (country !== 'BR') return out;
  const anos = new Set(days.map(d => Number(d.slice(0, 4))));
  for (const ano of anos) for (const [k, v] of holidaysBR(ano)) out.set(k, v);
  return out;
}
