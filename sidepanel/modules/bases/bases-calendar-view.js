// ── bases-calendar-view.js ───────────────────────────────────────────────────
// Visualização em CALENDÁRIO das Bases: mês, semana, dia e agenda.
// Este arquivo só monta a visão e liga as peças — o trabalho está em bases/calendar/*:
//   calendar-model.js   notas → eventos (puro)        calendar-time-grid.js   semana/dia
//   calendar-layout.js  posições e sobreposição       calendar-month-grid.js  mês
//   calendar-nav.js     intervalos e títulos          calendar-agenda.js      agenda
//   calendar-actions.js gestos → propriedades         calendar-toolbar.js     barra
// Configuração da view: ver resolveCalendarConfig (config/view-model.js).

import { getNotePropertyValue } from './bases-engine.js';
import { resolveCalendarConfig } from './config/view-model.js';
import { toYMD, todayYMD, addMonths } from './engine/date-utils.js';
import { buildCalendarEvents, bucketEventsByDay, pickDefaultDateProp, eventDays } from './calendar/calendar-model.js';
import { visibleRange, shiftAnchor, sanitizeAnchor } from './calendar/calendar-nav.js';
import { buildMovePatch, buildResizePatch, buildCreateProps } from './calendar/calendar-actions.js';
import { createCalendarToolbar } from './calendar/calendar-toolbar.js';
import { renderNoDateBox } from './calendar/calendar-nodate.js';
import { renderMiniCalendar } from './calendar/calendar-minical.js';
import { holidaysForDays } from './engine/holidays.js';
import { renderTimeGrid } from './calendar/calendar-time-grid.js';
import { renderMonthGrid } from './calendar/calendar-month-grid.js';
import { renderAgenda } from './calendar/calendar-agenda.js';

// Mantido por compatibilidade (testes e quem já importava daqui): dia LOCAL de qualquer valor de data
export { toYMD as normalizeDateToYMD };

/**
 * @param {HTMLElement} container
 * @param {Array<Object>} notes
 * @param {Object} schema  mapa chave → definição
 * @param {Object} viewConfig
 * @param {Object} callbacks { onOpenNote, onAddNote(props, types), onUpdateView(patch),
 *                             onUpdateNoteProperties(note, patch, types), onOpenSettings() }
 */
export function renderBaseCalendarView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container._calendarCleanup?.();
  container.className = 'base-view-container base-calendar-container';
  container.replaceChildren();

  const cfg = resolveCalendarConfig(viewConfig);
  if (!cfg.date.start) cfg.date.start = pickDefaultDateProp(schema);

  const hoje = todayYMD();
  const anchor = sanitizeAnchor(container._calAnchor, hoje);
  container._calAnchor = anchor;
  // Sem onUpdateView (visão fora de uma Base) o modo fica só na memória do contêiner
  const mode = callbacks.onUpdateView ? cfg.mode : (container._calMode ?? cfg.mode);
  container._calMode = mode;

  const rerender = () => renderBaseCalendarView(container, notes, schema, viewConfig, callbacks);
  const range = visibleRange(mode, anchor, cfg);
  const events = buildCalendarEvents(notes, cfg, getNotePropertyValue);
  const buckets = bucketEventsByDay(events, range.days);

  // ── Barra ────────────────────────────────────────────────────────────────────
  container.appendChild(createCalendarToolbar({
    title: range.title,
    mode,
    canGoToday: !range.days.includes(hoje),
    onPrev: () => { container._calAnchor = shiftAnchor(mode, anchor, -1); rerender(); },
    onNext: () => { container._calAnchor = shiftAnchor(mode, anchor, 1); rerender(); },
    onToday: () => { container._calAnchor = hoje; rerender(); },
    onMode: novo => {
      if (callbacks.onUpdateView) callbacks.onUpdateView({ mode: novo });
      else { container._calMode = novo; rerender(); }
    },
    onSettings: callbacks.onOpenSettings,
  }));

  // Corpo (+ mini-calendário lateral opcional, ao lado da grade)
  const area = document.createElement('div');
  area.className = 'bcal-area' + (cfg.sidebar.miniCalendar ? ' has-minical' : '');
  container.appendChild(area);
  if (cfg.sidebar.miniCalendar) {
    const lateral = document.createElement('aside');
    lateral.setAttribute('aria-label', 'Mini-calendário');
    area.appendChild(lateral);
    const mostrado = container._miniShown ? sanitizeAnchor(container._miniShown, anchor) : anchor;
    const diasComEvento = new Set(events.flatMap(ev => eventDays(ev)));
    renderMiniCalendar(lateral, {
      shown: mostrado, anchor, firstDay: cfg.week.firstDay, eventDays: diasComEvento,
      onPick: ymd => { container._calAnchor = ymd; container._miniShown = ymd; rerender(); },
      onShift: delta => { container._miniShown = addMonths(mostrado, delta); rerender(); },
    });
  }
  const corpo = document.createElement('div');
  corpo.className = 'bcal-body';
  area.appendChild(corpo);

  // ── Gestos → propriedades ────────────────────────────────────────────────────
  const gravar = async (resultado) => {
    if (!resultado) return;
    await callbacks.onUpdateNoteProperties?.(resultado.ev.note, resultado.patch, resultado.types);
    rerender();
  };

  const acoes = {
    onOpen: noteId => callbacks.onOpenNote?.(noteId),
    onMove: (ev, destino) => { const r = buildMovePatch(ev, destino); return gravar(r && { ev, ...r }); },
    onResize: (ev, fim) => { const r = buildResizePatch(ev, fim); return gravar(r && { ev, ...r }); },
    onCreate: (inicio, fim) => {
      const { props, types } = buildCreateProps(cfg, inicio, fim);
      return callbacks.onAddNote?.(props, types);
    },
    onRerender: rerender,
  };

  // feriados do período (inclui os dias de outros meses que aparecem na grade)
  const holidays = cfg.holidays.country ? holidaysForDays(range.days, cfg.holidays.country) : new Map();
  const ctx = { cfg, days: range.days, buckets, events, schema, hoje, callbacks: acoes, anchor, holidays };
  let vista;
  if (mode === 'month') vista = renderMonthGrid(corpo, { ...ctx, weeks: range.weeks });
  else if (mode === 'agenda') vista = renderAgenda(corpo, ctx);
  else vista = renderTimeGrid(corpo, ctx);   // semana e dia

  // Notas sem data: caixa recolhível; escolher um dia posiciona a nota no calendário
  const comData = new Set(events.map(e => e.id));
  renderNoDateBox(container, {
    notes: notes.filter(n => !comData.has(String(n.id))),
    startProp: cfg.date.start,
    anchor,
    onOpen: id => callbacks.onOpenNote?.(id),
    onSetDate: async (note, ymd) => {
      await callbacks.onUpdateNoteProperties?.(note, { [cfg.date.start]: ymd }, { [cfg.date.start]: 'date' });
      rerender();
    },
  });

  container._calendarCleanup = () => { vista?.destroy?.(); container._calendarCleanup = null; };
}
