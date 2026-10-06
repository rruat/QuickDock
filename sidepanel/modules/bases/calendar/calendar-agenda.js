// ── calendar-agenda.js ──────────────────────────────────────────────────────
// Visão AGENDA do calendário das Bases: lista dos próximos dias, só com o que tem
// evento, agrupada por dia (horário, título e propriedades escolhidas).

import { weekdayOf } from '../engine/date-utils.js';
import { createEventEl } from './calendar-event-el.js';
import { DIAS_SEMANA, MESES } from './calendar-nav.js';

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * @param {HTMLElement} body
 * @param {{ cfg:Object, days:string[], buckets:Map, events:Object[], schema:Object, hoje:string,
 *           callbacks:{ onOpen:Function, onCreate:Function } }} ctx
 */
export function renderAgenda(body, ctx) {
  const { cfg, days, buckets, schema, hoje, callbacks } = ctx;
  const porId = new Map(ctx.events.map(e => [e.id, e]));

  body.replaceChildren();
  const raiz = el('div', 'bcal-agenda');
  body.appendChild(raiz);

  let total = 0;
  for (const ymd of days) {
    const b = buckets.get(ymd);
    const itens = [
      ...b.allDay.map(ev => ({ ev })),
      ...b.timed.map(p => ({ ev: p.ev, seg: p })),
    ].sort((a, c) => (a.ev.allDay === c.ev.allDay ? (a.seg?.startMin ?? 0) - (c.seg?.startMin ?? 0) : (a.ev.allDay ? -1 : 1)));
    if (!itens.length) continue;
    total += itens.length;

    const [, m, d] = ymd.split('-').map(Number);
    const dia = el('section', 'bcal-agenda-day' + (ymd === hoje ? ' is-today' : ''));
    const cab = el('header', 'bcal-agenda-day-head');
    cab.appendChild(el('span', 'bcal-agenda-day-num', String(d)));
    const nome = el('span', 'bcal-agenda-day-name');
    nome.textContent = `${ymd === hoje ? 'Hoje · ' : ''}${DIAS_SEMANA[weekdayOf(ymd)]}, ${MESES[m - 1]}`;
    cab.appendChild(nome);
    dia.appendChild(cab);

    const lista = el('div', 'bcal-agenda-list');
    for (const { ev, seg } of itens) {
      const linha = createEventEl(ev, cfg, schema, { className: 'bcal-agenda-ev', seg });
      linha.addEventListener('click', () => callbacks.onOpen(ev.note.id));
      lista.appendChild(linha);
    }
    dia.appendChild(lista);
    raiz.appendChild(dia);
  }

  if (!total) {
    const vazio = el('div', 'bcal-agenda-empty');
    vazio.appendChild(el('span', 'qd-icon material-symbols-rounded', 'event_available'));
    vazio.appendChild(el('p', '', 'Nenhum evento nos próximos 14 dias.'));
    const novo = el('button', 'base-btn base-btn-primary', 'Nova nota hoje');
    novo.type = 'button';
    novo.addEventListener('click', () => callbacks.onCreate({ ymd: hoje, minutes: null }, null));
    vazio.appendChild(novo);
    raiz.appendChild(vazio);
  }

  raiz.addEventListener('keydown', e => {
    const item = e.target.closest?.('.bcal-ev');
    if (item && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const ev = porId.get(item.dataset.eventId);
      if (ev) callbacks.onOpen(ev.note.id);
    }
  });

  return { destroy() {} };
}
