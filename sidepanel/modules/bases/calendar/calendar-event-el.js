// ── calendar-event-el.js ────────────────────────────────────────────────────
// Elemento de um evento (cartão) do calendário das Bases — compartilhado por
// mês, semana/dia e agenda. A cor vem de um matiz (--ev-hue) e o CSS monta o resto
// em OKLCH nos dois temas.

import { minutesToHHMM } from '../engine/date-utils.js';
import { formatPropertyValue } from '../bases-schema.js';
import { getNotePropertyValue } from '../bases-engine.js';
import { hueForValue } from './calendar-colors.js';

function propText(note, key, schema) {
  const raw = getNotePropertyValue(note, key);
  if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) return '';
  const def = schema?.[key];
  const v = formatPropertyValue(raw, def?.type ?? 'text', def || {});
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? '✓' : '';
  if (v && typeof v === 'object') return v.alias ?? v.target ?? (('checked' in v) ? `${v.checked}/${v.total}` : '');
  return String(v);
}

export function eventTimeLabel(ev, seg = null) {
  if (ev.allDay) return '';
  const a = seg ? seg.startMin : ev.startMin;
  const b = seg ? seg.endMin : ev.endMin;
  const fim = b >= 1440 ? '24:00' : minutesToHHMM(b);
  return `${minutesToHHMM(a)}–${fim}`;
}

/**
 * @param {Object} ev
 * @param {Object} cfg
 * @param {Object} schema
 * @param {{ className?: string, seg?: Object, showProps?: boolean }} [opts]
 */
export function createEventEl(ev, cfg, schema, { className = '', seg = null, showProps = true } = {}) {
  const el = document.createElement('div');
  el.className = `bcal-ev ${className}`.trim();
  el.dataset.eventId = ev.id;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');

  const hue = cfg.card.colorBy ? hueForValue(getNotePropertyValue(ev.note, cfg.card.colorBy)) : null;
  if (hue !== null) { el.style.setProperty('--ev-hue', String(hue)); el.classList.add('has-hue'); }
  if (ev.fromFallback) el.classList.add('is-fallback-date');

  const titulo = document.createElement('span');
  titulo.className = 'bcal-ev-title';
  titulo.textContent = ev.title;
  el.appendChild(titulo);

  const hora = cfg.card.showTime ? eventTimeLabel(ev, seg) : '';
  if (hora) {
    const t = document.createElement('span');
    t.className = 'bcal-ev-time';
    t.textContent = hora;
    el.appendChild(t);
  }

  if (showProps && cfg.card.props.length) {
    const linha = cfg.card.props
      .map(p => propText(ev.note, p, schema))
      .filter(Boolean)
      .join(' · ');
    if (linha) {
      const p = document.createElement('span');
      p.className = 'bcal-ev-props';
      p.textContent = linha;
      el.appendChild(p);
    }
  }

  const rotulo = [ev.title, hora && `, ${hora}`, ev.fromFallback ? ' (sem data: usando a data de criação)' : ''].join('');
  el.setAttribute('aria-label', rotulo);
  el.title = rotulo;
  if (seg?.continuesBefore) el.classList.add('is-cut-top');
  if (seg?.continuesAfter) el.classList.add('is-cut-bottom');
  return el;
}
