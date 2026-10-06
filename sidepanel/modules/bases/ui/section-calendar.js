// ── section-calendar.js ─────────────────────────────────────────────────────
// Seções do painel de configuração específicas do Calendário. Cada controle grava
// um patch parcial na view (mesclado em profundidade por applyViewPatch).

import { resolveCalendarConfig } from '../config/view-model.js';
import { dateProperties, colorableProperties, allProperties } from './property-options.js';
import { section, row, selectControl, segmented, toggle, checkList } from './controls.js';

const NENHUMA = '__none__';
const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function horas(de, ate) {
  const out = [];
  for (let h = de; h <= ate; h++) out.push({ value: `${String(h).padStart(2, '0')}:00`, label: `${String(h).padStart(2, '0')}:00` });
  return out;
}

/** @returns {HTMLElement[]} seções prontas pra anexar ao painel */
export function calendarSections({ view, schema, memoria, patch }) {
  const cfg = resolveCalendarConfig(view);
  const datas = dateProperties(schema);
  const opData = datas.map(p => ({
    value: p.key, label: p.label,
    group: p.group === 'data' ? 'Datas' : p.group === 'sistema' ? 'Sistema' : 'Outras propriedades',
  }));
  const semData = [{ value: NENHUMA, label: 'Nenhuma' }, ...opData];
  const saida = [];

  // ── Exibição ──
  const exib = section('Exibição', { chave: 'cal-exib', memoria });
  exib.body.appendChild(row('Modo', () => segmented({
    ariaLabel: 'Modo do calendário',
    value: cfg.mode,
    options: [{ value: 'month', label: 'Mês' }, { value: 'week', label: 'Semana' }, { value: 'day', label: 'Dia' }, { value: 'agenda', label: 'Agenda' }],
    onChange: v => patch({ mode: v }),
  })));
  exib.body.appendChild(row('Primeiro dia da semana', id => selectControl({
    id, value: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][cfg.week.firstDay],
    options: [{ value: 'dom', label: 'Domingo' }, { value: 'seg', label: 'Segunda-feira' }, { value: 'sab', label: 'Sábado' }],
    onChange: v => patch({ week: { firstDay: v } }),
  })));
  exib.body.appendChild(row('Mostrar fins de semana', id => toggle({
    id, value: cfg.week.showWeekends, onChange: v => patch({ week: { showWeekends: v } }),
  })));
  exib.body.appendChild(row('Mostrar número da semana', id => toggle({
    id, value: cfg.week.showWeekNumber, onChange: v => patch({ week: { showWeekNumber: v } }),
  })));
  exib.body.appendChild(row('Mini-calendário lateral', id => toggle({
    id, value: cfg.sidebar.miniCalendar, onChange: v => patch({ sidebar: { miniCalendar: v } }),
  })));
  exib.body.appendChild(row('Feriados', id => selectControl({
    id, value: cfg.holidays.country || 'none',
    options: [{ value: 'none', label: 'Não mostrar' }, { value: 'BR', label: 'Brasil (nacionais)' }],
    onChange: v => patch({ holidays: { country: v === 'none' ? undefined : v } }),
  }), { dica: 'Feriados nacionais, incluindo os móveis (Carnaval, Sexta Santa, Corpus Christi).' }));
  saida.push(exib.root);

  // ── Datas ──
  const dt = section('Datas', { chave: 'cal-datas', memoria, dica: 'Qual propriedade posiciona a nota no calendário.' });
  dt.body.appendChild(row('Data de início', id => selectControl({
    id, value: cfg.date.start, options: opData,
    onChange: v => patch({ date: { start: v } }),
  })));
  dt.body.appendChild(row('Data de fim (opcional)', id => selectControl({
    id, value: cfg.date.end || NENHUMA, options: semData,
    onChange: v => patch({ date: { end: v === NENHUMA ? undefined : v } }),
  }), { dica: 'Com data de fim, a nota vira um período (bloco que se estende por vários dias ou horas).' }));
  dt.body.appendChild(row('Se a nota não tiver data', id => selectControl({
    id, value: cfg.date.fallback || NENHUMA,
    options: [{ value: NENHUMA, label: 'Não mostrar' }, ...opData],
    onChange: v => patch({ date: { fallback: v === NENHUMA ? 'none' : v } }),
  }), { dica: 'Usa outra data no lugar (padrão: criação), marcada com borda tracejada.' }));
  dt.body.appendChild(row('Duração padrão', id => selectControl({
    id, value: cfg.date.defaultDuration,
    options: [15, 30, 45, 60, 90, 120, 180].map(m => ({ value: m, label: m >= 60 ? `${m / 60 === Math.floor(m / 60) ? m / 60 : (m / 60).toFixed(1)} h` : `${m} min` })),
    onChange: v => patch({ date: { defaultDuration: Number(v) } }),
  })));
  saida.push(dt.root);

  // ── Horário (semana/dia) ──
  const hr = section('Horário (semana e dia)', { chave: 'cal-hora', memoria });
  hr.body.appendChild(row('Início do dia', id => selectControl({
    id, value: hhmm(cfg.time.dayStart), options: horas(0, 22), onChange: v => patch({ time: { dayStart: v } }),
  })));
  hr.body.appendChild(row('Fim do dia', id => selectControl({
    id, value: hhmm(cfg.time.dayEnd), options: horas(1, 23), onChange: v => patch({ time: { dayEnd: v } }),
  })));
  hr.body.appendChild(row('Intervalo da grade', id => selectControl({
    id, value: cfg.time.slot, options: [15, 30, 60].map(m => ({ value: m, label: `${m} min` })),
    onChange: v => patch({ time: { slot: Number(v) } }),
  })));
  hr.body.appendChild(row('Encaixe ao arrastar', id => selectControl({
    id, value: cfg.time.snap, options: [5, 10, 15, 30, 60].map(m => ({ value: m, label: `${m} min` })),
    onChange: v => patch({ time: { snap: Number(v) } }),
  })));
  hr.body.appendChild(row('Linha do horário atual', id => toggle({
    id, value: cfg.time.showNowLine, onChange: v => patch({ time: { showNowLine: v } }),
  })));
  saida.push(hr.root);

  // ── Mês ──
  const ms = section('Mês', { chave: 'cal-mes', memoria, abertaPorPadrao: false });
  ms.body.appendChild(row('Itens por dia antes de "+N mais"', id => selectControl({
    id, value: cfg.month.maxPerDay, options: [1, 2, 3, 4, 5, 6, 8, 10].map(n => ({ value: n, label: String(n) })),
    onChange: v => patch({ month: { maxPerDay: Number(v) } }),
  })));
  ms.body.appendChild(row('Dias de outros meses', id => toggle({
    id, value: cfg.month.showOtherMonthDays, onChange: v => patch({ month: { showOtherMonthDays: v } }),
  })));
  saida.push(ms.root);

  // ── Cartões ──
  const cd = section('Cartões', { chave: 'cal-card', memoria });
  cd.body.appendChild(row('Colorir por', id => selectControl({
    id, value: cfg.card.colorBy || NENHUMA,
    options: [{ value: NENHUMA, label: 'Sem cor' }, ...colorableProperties(schema).map(p => ({ value: p.key, label: p.label }))],
    onChange: v => patch({ card: { colorBy: v === NENHUMA ? undefined : v } }),
  })));
  cd.body.appendChild(row('Mostrar horário', id => toggle({
    id, value: cfg.card.showTime, onChange: v => patch({ card: { showTime: v } }),
  })));
  const rotuloProps = document.createElement('div');
  rotuloProps.className = 'bset-label';
  rotuloProps.textContent = 'Propriedades no cartão';
  cd.body.appendChild(rotuloProps);
  cd.body.appendChild(checkList({
    options: allProperties(schema).map(p => ({ value: p.key, label: p.label })),
    values: cfg.card.props,
    onChange: v => patch({ card: { props: v } }),
  }));
  saida.push(cd.root);

  return saida;
}
