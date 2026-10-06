// ── calendar-actions.js ─────────────────────────────────────────────────────
// Transforma gestos do calendário (mover, redimensionar, criar) em alterações de
// propriedades da nota — PURO: só monta os "patches"; quem grava é o container.
//
// Formatos gravados: dia inteiro → 'YYYY-MM-DD'; com horário → 'YYYY-MM-DDTHH:mm' (local).
// Ao primeiro horário numa propriedade de data, o tipo dela passa a `datetime` — senão a
// barra de propriedades da nota mostraria o texto cru no lugar do seletor de data e hora.

import { addDays, diffDays, toLocalDateTimeString } from '../engine/date-utils.js';
import { eventDurationMin } from './calendar-model.js';

const DIA_MIN = 1440;

// Propriedades que a Base mostra mas que não são "campos de data" editáveis
export const NON_EDITABLE_DATE_PROPS = new Set(['createdAt', 'criadoEm', 'updatedAt', 'atualizadoEm', 'title', 'name', 'folder', 'pasta', 'tags', 'tasks']);

export function isEditableDateProp(prop) {
  return !!prop && !NON_EDITABLE_DATE_PROPS.has(prop);
}

/** Valor a gravar: só data ou data+hora. */
export function formatDateValue(ymd, minutes) {
  return minutes === null || minutes === undefined ? ymd : toLocalDateTimeString(ymd, minutes);
}

const typeFor = minutes => (minutes === null || minutes === undefined ? 'date' : 'datetime');

/** Soma minutos a (ymd, min) respeitando a virada de dia. */
export function addMinutes(ymd, minutes, delta) {
  const total = minutes + delta;
  const dias = Math.floor(total / DIA_MIN);
  return { ymd: addDays(ymd, dias), minutes: ((total % DIA_MIN) + DIA_MIN) % DIA_MIN };
}

function rangeObject(ev) {
  const v = ev.note?.properties?.[ev.startProp];
  return v && typeof v === 'object' && !Array.isArray(v) && v.start ? v : null;
}

/**
 * Mover o evento pra um novo início. Mantém a duração (dias ou minutos).
 * @param {Object} ev
 * @param {{ ymd: string, minutes: number|null }} destino  minutes = null → dia inteiro
 * @returns {{ patch: Record<string, any>, types: Record<string, string> } | null}
 */
export function buildMovePatch(ev, destino) {
  if (!isEditableDateProp(ev.startProp)) return null;
  const patch = {};
  const types = {};
  const timed = destino.minutes !== null && destino.minutes !== undefined;

  // fim novo: mesma duração
  let fim = null;
  if (ev.allDay && !timed) {
    fim = { ymd: addDays(destino.ymd, diffDays(ev.startYmd, ev.endYmd)), minutes: null };
  } else if (!ev.allDay && timed) {
    fim = addMinutes(destino.ymd, destino.minutes, eventDurationMin(ev));
  } else if (timed) {
    // dia inteiro → com horário: duração padrão (1h) — o fim só é gravado se houver onde gravar
    fim = addMinutes(destino.ymd, destino.minutes, 60);
  } else {
    // com horário → dia inteiro: fica um dia só
    fim = { ymd: destino.ymd, minutes: null };
  }

  const faixa = rangeObject(ev);
  if (faixa) {
    patch[ev.startProp] = {
      ...faixa,
      start: formatDateValue(destino.ymd, destino.minutes ?? null),
      end: formatDateValue(fim.ymd, fim.minutes),
      allDay: !timed,
    };
    return { patch, types };
  }

  patch[ev.startProp] = formatDateValue(destino.ymd, destino.minutes ?? null);
  types[ev.startProp] = typeFor(destino.minutes);
  if (ev.endProp && isEditableDateProp(ev.endProp)) {
    patch[ev.endProp] = formatDateValue(fim.ymd, fim.minutes);
    types[ev.endProp] = typeFor(fim.minutes);
  }
  return { patch, types };
}

/** Redimensionar: muda só o fim. Exige a propriedade "fim" configurada. */
export function buildResizePatch(ev, fim) {
  if (!ev.endProp || !isEditableDateProp(ev.endProp)) return null;
  const faixa = rangeObject(ev);
  if (faixa) return { patch: { [ev.startProp]: { ...faixa, end: formatDateValue(fim.ymd, fim.minutes) } }, types: {} };
  return {
    patch: { [ev.endProp]: formatDateValue(fim.ymd, fim.minutes) },
    types: { [ev.endProp]: typeFor(fim.minutes) },
  };
}

/** Propriedades de uma nota criada pelo calendário (clique/arrasto num horário ou dia). */
export function buildCreateProps(cfg, inicio, fim = null) {
  const { start, end } = cfg.date;
  const props = {};
  const types = {};
  if (!isEditableDateProp(start)) return { props, types };
  props[start] = formatDateValue(inicio.ymd, inicio.minutes ?? null);
  types[start] = typeFor(inicio.minutes);
  if (fim && end && isEditableDateProp(end)) {
    props[end] = formatDateValue(fim.ymd, fim.minutes ?? null);
    types[end] = typeFor(fim.minutes);
  }
  return { props, types };
}
