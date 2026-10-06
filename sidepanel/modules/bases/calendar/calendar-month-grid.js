// ── calendar-month-grid.js ──────────────────────────────────────────────────
// Visão MÊS do calendário das Bases: semanas em linhas, eventos como chips, "+N mais"
// quando o dia enche, número da semana opcional e arrastar o evento para outro dia.

import { addDays, diffDays, isoWeekNumber, weekdayOf } from '../engine/date-utils.js';
import { createEventEl } from './calendar-event-el.js';
import { beginPointerGesture } from './calendar-drag.js';
import { DIAS_ABREV } from './calendar-nav.js';
import { isEditableDateProp } from './calendar-actions.js';

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * @param {HTMLElement} body
 * @param {{ cfg:Object, weeks:string[][], anchor:string, buckets:Map, events:Object[], schema:Object, hoje:string,
 *           callbacks:{ onOpen:Function, onMove:Function, onCreate:Function } }} ctx
 */
export function renderMonthGrid(body, ctx) {
  const { cfg, weeks, anchor, buckets, schema, hoje, callbacks } = ctx;
  const porId = new Map(ctx.events.map(e => [e.id, e]));
  const mesAncora = anchor.slice(0, 7);
  const colunasN = weeks[0].length;
  const comNumero = cfg.week.showWeekNumber;

  body.replaceChildren();
  const raiz = el('div', 'bcal-month');
  raiz.style.setProperty('--bcal-month-cols', `${comNumero ? '34px ' : ''}repeat(${colunasN}, minmax(0, 1fr))`);
  body.appendChild(raiz);

  const cab = el('div', 'bcal-month-weekdays');
  if (comNumero) cab.appendChild(el('div', 'bcal-weeknum-head', 'S'));
  for (const ymd of weeks[0]) cab.appendChild(el('div', 'bcal-weekday', DIAS_ABREV[weekdayOf(ymd)]));
  raiz.appendChild(cab);

  const grade = el('div', 'bcal-month-weeks');
  grade.style.gridTemplateRows = `repeat(${weeks.length}, minmax(96px, 1fr))`;
  raiz.appendChild(grade);

  for (const semana of weeks) {
    const linha = el('div', 'bcal-month-week');
    if (comNumero) {
      const n = el('div', 'bcal-weeknum', String(isoWeekNumber(semana[0])));
      n.title = `Semana ${n.textContent}`;
      linha.appendChild(n);
    }
    for (const ymd of semana) {
      const outroMes = ymd.slice(0, 7) !== mesAncora;
      if (outroMes && !cfg.month.showOtherMonthDays) { linha.appendChild(el('div', 'bcal-month-cell is-blank')); continue; }

      const cel = el('div', 'bcal-month-cell' + (outroMes ? ' is-other-month' : '') + (ymd === hoje ? ' is-today' : ''));
      cel.dataset.ymd = ymd;

      const topo = el('div', 'bcal-month-cell-head');
      topo.appendChild(el('span', 'bcal-month-day-num', String(Number(ymd.slice(8)))));
      const feriado = ctx.holidays?.get(ymd);
      if (feriado) { const f = el('span', 'bcal-holiday', feriado); f.title = feriado; cel.classList.add('is-holiday'); topo.appendChild(f); }
      const add = el('button', 'bcal-day-add');
      add.type = 'button';
      add.title = `Nova nota em ${ymd.split('-').reverse().join('/')}`;
      add.setAttribute('aria-label', add.title);
      add.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add</span>';
      add.addEventListener('click', e => { e.stopPropagation(); callbacks.onCreate({ ymd, minutes: null }, null); });
      topo.appendChild(add);
      cel.appendChild(topo);

      // todos os eventos do dia, com horário primeiro (por horário), depois dia inteiro
      const bal = buckets.get(ymd) ?? { allDay: [], timed: [] };
      const doDia = [
        ...bal.allDay.map(ev => ({ ev, ymd })),
        ...bal.timed.map(p => ({ ev: p.ev, ymd, seg: p })),
      ].sort((a, b) => (a.ev.allDay === b.ev.allDay ? (a.ev.startMin ?? -1) - (b.ev.startMin ?? -1) : (a.ev.allDay ? -1 : 1)));

      const lista = el('div', 'bcal-month-events');
      const limite = cfg.month.maxPerDay;
      doDia.forEach(({ ev, seg }, i) => {
        const chip = createEventEl(ev, cfg, schema, { className: 'bcal-chip' + (i >= limite ? ' is-overflow' : ''), seg, showProps: false });
        chip.dataset.ymd = ymd;
        const continuaAntes = ymd !== ev.startYmd, continuaDepois = ymd !== ev.endYmd;
        if (continuaAntes) chip.classList.add('is-cut-left');
        if (continuaDepois) chip.classList.add('is-cut-right');
        lista.appendChild(chip);
      });
      cel.appendChild(lista);

      if (doDia.length > limite) {
        const mais = el('button', 'bcal-more', `+${doDia.length - limite} mais`);
        mais.type = 'button';
        mais.addEventListener('click', e => {
          e.stopPropagation();
          const aberto = cel.classList.toggle('is-expanded');
          mais.textContent = aberto ? 'mostrar menos' : `+${doDia.length - limite} mais`;
        });
        cel.appendChild(mais);
      }

      cel.addEventListener('dblclick', e => {
        if (e.target.closest('.bcal-ev') || e.target.closest('.bcal-day-add')) return;
        callbacks.onCreate({ ymd, minutes: null }, null);
      });
      linha.appendChild(cel);
    }
    grade.appendChild(linha);
  }

  // ── Gestos: clique abre; arrastar muda o dia (mantém horário e duração) ─────
  raiz.addEventListener('pointerdown', down => {
    if (down.button !== 0) return;
    const chip = down.target.closest('.bcal-chip');
    if (!chip) return;
    const ev = porId.get(chip.dataset.eventId);
    if (!ev) return;
    const editavel = isEditableDateProp(ev.startProp);
    const ymdOrigem = chip.dataset.ymd;
    let alvo = null;
    let rotulo = null;

    beginPointerGesture(down, {
      onStart() {
        if (!editavel) return;
        chip.classList.add('is-dragging');
        rotulo = el('div', 'bcal-drag-label');
        document.body.appendChild(rotulo);
      },
      onMove(e) {
        if (!editavel) return;
        const cel = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.bcal-month-cell[data-ymd]');
        raiz.querySelectorAll('.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
        alvo = cel?.dataset.ymd ?? null;
        if (cel) cel.classList.add('is-drop-target');
        if (rotulo) {
          rotulo.textContent = alvo ? alvo.split('-').reverse().join('/') : '';
          rotulo.style.left = `${e.clientX + 12}px`;
          rotulo.style.top = `${e.clientY + 12}px`;
        }
      },
      onEnd(_e, moved) {
        chip.classList.remove('is-dragging');
        rotulo?.remove();
        raiz.querySelectorAll('.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
        if (!moved) { callbacks.onOpen(ev.note.id); return; }
        if (!editavel || !alvo || alvo === ymdOrigem) return;
        // arrastou o pedaço do dia X pro dia Y: o evento inteiro anda a mesma distância
        const novoInicio = addDays(ev.startYmd, diffDays(ymdOrigem, alvo));
        callbacks.onMove(ev, { ymd: novoInicio, minutes: ev.allDay ? null : ev.startMin });
      },
      onCancel() { chip.classList.remove('is-dragging'); rotulo?.remove(); },
    });
  });

  raiz.addEventListener('keydown', e => {
    const chip = e.target.closest?.('.bcal-chip');
    if (chip && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const ev = porId.get(chip.dataset.eventId);
      if (ev) callbacks.onOpen(ev.note.id);
    }
  });

  return { destroy() {} };
}
