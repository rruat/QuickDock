// ── calendar-time-grid.js ───────────────────────────────────────────────────
// Grade horária das visões SEMANA e DIA do calendário das Bases: cabeçalho com os dias,
// faixa de "dia inteiro", colunas com horas, eventos lado a lado quando se sobrepõem,
// linha de "agora" e os gestos de mover, redimensionar e criar por arrasto.

import { addDays, diffDays, minutesToHHMM, nowMinutes, isoWeekNumber, todayYMD } from '../engine/date-utils.js';
import { layoutOverlaps, layoutAllDay, verticalBox, isInWindow, snapMinutes, clamp } from './calendar-layout.js';
import { createEventEl } from './calendar-event-el.js';
import { beginPointerGesture } from './calendar-drag.js';
import { DIAS_ABREV } from './calendar-nav.js';
import { weekdayOf } from '../engine/date-utils.js';
import { eventDurationMin } from './calendar-model.js';
import { isEditableDateProp } from './calendar-actions.js';

const HOUR_PX = 56;
const GUTTER_PX = 52;

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * @param {HTMLElement} body
 * @param {{ cfg:Object, days:string[], buckets:Map, events:Object[], schema:Object, hoje:string, now?:Date,
 *           callbacks:{ onOpen:(noteId)=>void, onMove:Function, onResize:Function, onCreate:Function } }} ctx
 * @returns {{ destroy: () => void }}
 */
export function renderTimeGrid(body, ctx) {
  const { cfg, days, buckets, schema, hoje, callbacks } = ctx;
  const { dayStart, dayEnd, slot, snap, showNowLine } = cfg.time;
  const pxPerMin = HOUR_PX / 60;
  const alturaTotal = (dayEnd - dayStart) * pxPerMin;
  const porId = new Map(ctx.events.map(e => [e.id, e]));
  const colunas = `${GUTTER_PX}px repeat(${days.length}, minmax(${days.length > 3 ? 84 : 140}px, 1fr))`;

  body.replaceChildren();
  const raiz = el('div', 'bcal-time');
  raiz.style.setProperty('--bcal-hour-px', `${HOUR_PX}px`);
  raiz.style.setProperty('--bcal-slot-px', `${slot * pxPerMin}px`);
  raiz.style.setProperty('--bcal-cols', colunas);
  body.appendChild(raiz);

  // ── Cabeçalho: dias ────────────────────────────────────────────────────────
  const cab = el('div', 'bcal-time-head');
  const canto = el('div', 'bcal-gutter-cell');
  if (cfg.week.showWeekNumber) {
    canto.textContent = `S${isoWeekNumber(days[0])}`;
    canto.title = `Semana ${isoWeekNumber(days[0])} do ano`;
  }
  cab.appendChild(canto);
  for (const ymd of days) {
    const celula = el('div', 'bcal-day-head' + (ymd === hoje ? ' is-today' : ''));
    celula.dataset.ymd = ymd;
    celula.appendChild(el('span', 'bcal-day-name', DIAS_ABREV[weekdayOf(ymd)]));
    celula.appendChild(el('span', 'bcal-day-num', String(Number(ymd.slice(8)))));
    const add = el('button', 'bcal-day-add');
    add.type = 'button';
    add.title = `Nova nota em ${ymd.split('-').reverse().join('/')}`;
    add.setAttribute('aria-label', add.title);
    add.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add</span>';
    add.addEventListener('click', e => { e.stopPropagation(); callbacks.onCreate({ ymd, minutes: null }, null); });
    celula.appendChild(add);
    cab.appendChild(celula);
  }
  raiz.appendChild(cab);

  // ── Faixa "dia inteiro" ─────────────────────────────────────────────────────
  const todosDiaInteiro = [...new Set(days.flatMap(d => buckets.get(d).allDay))];
  const barras = layoutAllDay(todosDiaInteiro, days);
  const lanes = barras.reduce((m, b) => Math.max(m, b.lane + 1), 1);
  const faixa = el('div', 'bcal-allday');
  faixa.style.gridTemplateColumns = colunas;
  faixa.style.gridTemplateRows = `repeat(${lanes}, 22px)`;
  faixa.appendChild(Object.assign(el('div', 'bcal-gutter-cell bcal-allday-label', 'dia todo'), { style: `grid-row: 1 / span ${lanes}` }));
  days.forEach((ymd, i) => {
    const bg = el('div', 'bcal-allday-cell' + (ymd === hoje ? ' is-today' : ''));
    bg.dataset.ymd = ymd;
    bg.style.gridColumn = String(i + 2);
    bg.style.gridRow = `1 / span ${lanes}`;
    faixa.appendChild(bg);
  });
  for (const b of barras) {
    const barra = createEventEl(b.ev, cfg, schema, { className: 'bcal-allday-bar' + (b.cutLeft ? ' is-cut-left' : '') + (b.cutRight ? ' is-cut-right' : ''), showProps: false });
    barra.dataset.zone = 'allday';
    barra.style.gridColumn = `${b.colStart + 2} / ${b.colEnd + 3}`;
    barra.style.gridRow = String(b.lane + 1);
    faixa.appendChild(barra);
  }
  raiz.appendChild(faixa);

  // ── Corpo com rolagem: gutter de horas + colunas ───────────────────────────────
  const rolagem = el('div', 'bcal-time-scroll');
  const interno = el('div', 'bcal-time-inner');
  interno.style.height = `${alturaTotal}px`;
  interno.style.gridTemplateColumns = colunas;

  const gutter = el('div', 'bcal-gutter');
  for (let h = Math.ceil(dayStart / 60); h * 60 <= dayEnd; h++) {
    if (h * 60 === dayStart) continue;
    const rotulo = el('div', 'bcal-hour-label', `${String(h).padStart(2, '0')}:00`);
    rotulo.style.top = `${(h * 60 - dayStart) * pxPerMin}px`;
    gutter.appendChild(rotulo);
  }
  interno.appendChild(gutter);

  const colEls = new Map();
  for (const ymd of days) {
    const col = el('div', 'bcal-col' + (ymd === hoje ? ' is-today' : ''));
    col.dataset.ymd = ymd;
    colEls.set(ymd, col);

    const pedacos = buckets.get(ymd).timed.filter(p => isInWindow(p.startMin, p.endMin, dayStart, dayEnd));
    layoutOverlaps(pedacos);
    for (const p of pedacos) {
      const caixa = verticalBox(p.startMin, p.endMin, dayStart, dayEnd);
      const evEl = createEventEl(p.ev, cfg, schema, { className: 'bcal-timed', seg: p });
      evEl.dataset.zone = 'timed';
      evEl.dataset.ymd = ymd;
      evEl.style.top = `${caixa.top}%`;
      evEl.style.height = `${caixa.height}%`;
      evEl.style.left = `calc(${(p.col / p.cols) * 100}% + 1px)`;
      evEl.style.width = `calc(${100 / p.cols}% - 3px)`;
      if (!p.continuesAfter && p.ev.canResize) {
        evEl.appendChild(el('span', 'bcal-ev-resize'));
        evEl.classList.add('can-resize');
      }
      if (p.endMin - p.startMin <= 30) evEl.classList.add('is-short');
      col.appendChild(evEl);
    }
    interno.appendChild(col);
  }

  // Linha de "agora" (só no dia de hoje, dentro da janela)
  let timer = null;
  const linhaAgora = el('div', 'bcal-now-line');
  const posicionaAgora = () => {
    const agora = ctx.now ?? new Date();
    const col = colEls.get(todayYMD(agora));
    const min = nowMinutes(agora);
    if (!showNowLine || !col || min < dayStart || min > dayEnd) { linhaAgora.remove(); return; }
    linhaAgora.style.top = `${(min - dayStart) * pxPerMin}px`;
    if (linhaAgora.parentNode !== col) col.appendChild(linhaAgora);
  };
  posicionaAgora();
  if (showNowLine && !ctx.now) timer = setInterval(posicionaAgora, 60_000);

  rolagem.appendChild(interno);
  raiz.appendChild(rolagem);

  // Rolagem inicial: perto de "agora" se estiver na semana; senão, no primeiro evento do dia
  requestAnimationFrame(() => {
    const colHoje = colEls.get(hoje);
    let alvoMin = dayStart;
    if (colHoje) alvoMin = clamp(nowMinutes(ctx.now ?? new Date()) - 90, dayStart, dayEnd);
    else {
      const primeiro = days.flatMap(d => buckets.get(d).timed).reduce((m, p) => Math.min(m, p.startMin), Infinity);
      if (Number.isFinite(primeiro)) alvoMin = clamp(primeiro - 30, dayStart, dayEnd);
    }
    rolagem.scrollTop = Math.max(0, (alvoMin - dayStart) * pxPerMin);
  });

  // ═══ Gestos ═══════════════════════════════════════════════════════════════════
  const colRects = () => days.map(ymd => ({ ymd, rect: colEls.get(ymd).getBoundingClientRect() }));
  const colNoX = x => {
    const rs = colRects();
    return rs.find(r => x >= r.rect.left && x < r.rect.right) ?? (x < rs[0].rect.left ? rs[0] : rs[rs.length - 1]);
  };
  const minutosEm = (y, rect) => dayStart + ((y - rect.top) / rect.height) * (dayEnd - dayStart);
  const rolagemTopo = () => rolagem.getBoundingClientRect().top;

  const fantasma = el('div', 'bcal-ghost');
  const tira = () => { fantasma.remove(); faixa.querySelectorAll('.is-drop-target').forEach(c => c.classList.remove('is-drop-target')); };
  const coloca = (ymd, ini, fim, rotulo) => {
    const col = colEls.get(ymd);
    const c = verticalBox(ini, fim, dayStart, dayEnd, snap);
    fantasma.style.top = `${c.top}%`;
    fantasma.style.height = `${c.height}%`;
    fantasma.textContent = rotulo;
    if (fantasma.parentNode !== col) col.appendChild(fantasma);
  };

  raiz.addEventListener('pointerdown', down => {
    if (down.button !== 0) return;
    const alvo = down.target;
    if (alvo.closest('.bcal-day-add')) return;

    const redim = alvo.closest('.bcal-ev-resize');
    const evEl = alvo.closest('.bcal-ev');
    const colEl = alvo.closest('.bcal-col');

    if (redim && evEl) { iniciaRedimensionar(down, evEl); return; }
    if (evEl) { iniciaMover(down, evEl); return; }
    if (colEl) iniciaCriar(down, colEl);
  });

  // dblclick numa coluna vazia cria um evento no horário clicado
  raiz.addEventListener('dblclick', e => {
    const col = e.target.closest('.bcal-col');
    if (!col || e.target.closest('.bcal-ev')) return;
    const ini = clamp(snapMinutes(minutosEm(e.clientY, col.getBoundingClientRect()), snap), dayStart, dayEnd - snap);
    const fim = cfg.date.end ? addMin(col.dataset.ymd, ini, cfg.date.defaultDuration) : null;
    callbacks.onCreate({ ymd: col.dataset.ymd, minutes: ini }, fim);
  });

  raiz.addEventListener('keydown', e => {
    const evEl = e.target.closest?.('.bcal-ev');
    if (evEl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const ev = porId.get(evEl.dataset.eventId);
      if (ev) callbacks.onOpen(ev.note.id);
    }
  });

  function addMin(ymd, min, delta) {
    const total = min + delta;
    return { ymd: addDays(ymd, Math.floor(total / 1440)), minutes: total % 1440 };
  }

  function iniciaMover(down, evEl) {
    const ev = porId.get(evEl.dataset.eventId);
    if (!ev) return;
    const editavel = isEditableDateProp(ev.startProp) && !evEl.classList.contains('is-cut-top');
    const doDiaInteiro = evEl.dataset.zone === 'allday';
    const ymdDown = colNoX(down.clientX).ymd;
    const colDown = colEls.get(ev.startYmd)?.getBoundingClientRect();
    const grab = (!doDiaInteiro && colDown) ? minutosEm(down.clientY, colDown) - ev.startMin : 0;
    const duracao = ev.allDay ? cfg.date.defaultDuration : eventDurationMin(ev);
    let destino = null;

    beginPointerGesture(down, {
      onStart() { if (editavel) evEl.classList.add('is-dragging'); },
      onMove(e) {
        if (!editavel) return;
        const naFaixa = e.clientY < rolagemTopo() - 2;
        const { ymd, rect } = colNoX(e.clientX);
        tira();
        if (naFaixa) {
          const delta = diffDays(ymdDown, ymd);
          const novoInicio = addDays(ev.startYmd, delta);
          destino = { ymd: ev.allDay ? novoInicio : ymd, minutes: null };
          faixa.querySelector(`.bcal-allday-cell[data-ymd="${ymd}"]`)?.classList.add('is-drop-target');
        } else {
          const min = clamp(snapMinutes(minutosEm(e.clientY, rect) - grab, snap), 0, 1440 - snap);
          destino = { ymd, minutes: min };
          coloca(ymd, min, min + duracao, `${minutesToHHMM(min)}–${minutesToHHMM(Math.min(1439, min + duracao))}`);
        }
      },
      onEnd(_e, moved) {
        evEl.classList.remove('is-dragging');
        tira();
        if (!moved) { callbacks.onOpen(ev.note.id); return; }
        if (!editavel || !destino) return;
        const mudou = destino.ymd !== ev.startYmd || destino.minutes !== ev.startMin;
        if (mudou) callbacks.onMove(ev, destino);
      },
      onCancel() { evEl.classList.remove('is-dragging'); tira(); },
    });
  }

  function iniciaRedimensionar(down, evEl) {
    const ev = porId.get(evEl.dataset.eventId);
    if (!ev || !ev.canResize) return;
    down.stopPropagation();
    const col = evEl.closest('.bcal-col');
    const ymd = col.dataset.ymd;
    const rect = col.getBoundingClientRect();
    const inicioMin = ymd === ev.startYmd ? ev.startMin : 0;
    let fimMin = ev.endMin;

    beginPointerGesture(down, {
      threshold: 2,
      onStart() { evEl.classList.add('is-resizing'); },
      onMove(e) {
        fimMin = clamp(snapMinutes(minutosEm(e.clientY, rect), snap), inicioMin + snap, 1440);
        const c = verticalBox(inicioMin, fimMin, dayStart, dayEnd, snap);
        evEl.style.height = `${c.height}%`;
        const rot = evEl.querySelector('.bcal-ev-time');
        if (rot) rot.textContent = `${minutesToHHMM(inicioMin)}–${fimMin >= 1440 ? '24:00' : minutesToHHMM(fimMin)}`;
      },
      onEnd(_e, moved) {
        evEl.classList.remove('is-resizing');
        if (!moved || fimMin === ev.endMin) return;
        callbacks.onResize(ev, fimMin >= 1440 ? { ymd: addDays(ymd, 1), minutes: 0 } : { ymd, minutes: fimMin });
      },
      onCancel() { evEl.classList.remove('is-resizing'); callbacks.onRerender?.(); },
    });
  }

  function iniciaCriar(down, colEl) {
    const ymd = colEl.dataset.ymd;
    const rect = colEl.getBoundingClientRect();
    const ancora = clamp(snapMinutes(minutosEm(down.clientY, rect), snap), dayStart, dayEnd - snap);
    let ini = ancora, fim = ancora + snap;

    beginPointerGesture(down, {
      onMove(e) {
        const atual = clamp(snapMinutes(minutosEm(e.clientY, rect), snap), dayStart, dayEnd);
        ini = Math.min(ancora, atual);
        fim = Math.max(ancora, atual) || ancora + snap;
        if (fim === ini) fim = ini + snap;
        coloca(ymd, ini, fim, `${minutesToHHMM(ini)}–${minutesToHHMM(Math.min(1439, fim))}`);
      },
      onEnd(_e, moved) {
        tira();
        if (!moved) return;
        callbacks.onCreate({ ymd, minutes: ini }, cfg.date.end ? { ymd, minutes: Math.min(1439, fim) } : null);
      },
      onCancel: tira,
    });
  }

  return { destroy() { if (timer) clearInterval(timer); } };
}
