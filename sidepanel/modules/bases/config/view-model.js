// ── view-model.js ───────────────────────────────────────────────────────────
// Modelo de configuração das views de uma Base — PURO (sem DOM, sem Dexie).
// Normaliza o que vem do YAML (formato antigo ou novo) pra um objeto previsível,
// dá `id` estável a cada view e resolve os padrões de cada tipo.
//
// Compatibilidade: Base antiga abre igual. Nada é migrado em massa — as chaves antigas
// continuam sendo lidas, e o formato novo só é gravado quando a pessoa edita a view
// (ver docs/PLANEJAMENTO-BASES-VIEWS-NOTION.md, parte 8).

export const VIEW_TYPES = {
  table:    { label: 'Tabela',           icon: 'table_chart' },
  board:    { label: 'Quadro (Kanban)',  icon: 'view_kanban' },
  gallery:  { label: 'Galeria',          icon: 'grid_view' },
  list:     { label: 'Lista',            icon: 'format_list_bulleted' },
  calendar: { label: 'Calendário',       icon: 'calendar_today' },
};

// Hash curto e determinístico: uma view SEM id recebe sempre o mesmo id enquanto não for
// editada, então a aba ativa não "pula" a cada renderização.
function hash36(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export function viewIdFor(view, index) {
  return view?.id || `v_${hash36(`${index}|${view?.type ?? ''}|${view?.name ?? ''}`)}`;
}

export function newViewId(existentes = []) {
  const usados = new Set(existentes);
  for (let i = 0; i < 20; i++) {
    const id = `v_${Math.random().toString(36).slice(2, 8)}`;
    if (!usados.has(id)) return id;
  }
  return `v_${Date.now().toString(36)}`;
}

/**
 * Garante `id` único em toda view e resolve a view padrão por id.
 * Não muta a entrada. `defaultView` (índice, formato antigo) vira `defaultViewId`.
 */
export function normalizeViews(baseDef) {
  const views = Array.isArray(baseDef?.views) ? baseDef.views : [];
  const usados = new Set();
  const normalizadas = views.map((v, i) => {
    let id = viewIdFor(v, i);
    if (usados.has(id)) id = newViewId([...usados]);
    usados.add(id);
    return v.id === id ? v : { ...v, id };
  });

  let defaultViewId = baseDef?.defaultViewId;
  if (!normalizadas.some(v => v.id === defaultViewId)) {
    const porIndice = Number.isInteger(baseDef?.defaultView) ? normalizadas[baseDef.defaultView] : null;
    defaultViewId = (porIndice ?? normalizadas[0])?.id ?? null;
  }
  return { ...baseDef, views: normalizadas, defaultViewId };
}

/**
 * Quais propriedades a view mostra. O mesmo conceito tinha quatro nomes
 * (columns · cardProperties · visibleProperties · properties); `props` é o nome novo.
 * Aceita itens como string ou como `{ key, visible }`.
 */
export function getViewProps(view, padrao = []) {
  const bruto = view?.props ?? view?.visibleProperties ?? view?.properties ?? view?.columns ?? view?.cardProperties;
  if (!Array.isArray(bruto)) return [...padrao];
  return bruto
    .map(p => (p && typeof p === 'object' ? (p.visible === false ? null : p.key) : p))
    .filter(p => typeof p === 'string' && p);
}

// ── Calendário ───────────────────────────────────────────────────────────────

const DIAS = { dom: 0, sun: 0, seg: 1, mon: 1, ter: 2, tue: 2, qua: 3, wed: 3, qui: 4, thu: 4, sex: 5, fri: 5, sab: 6, sáb: 6, sat: 6 };

export function parseFirstDay(valor, padrao = 0) {
  if (Number.isInteger(valor) && valor >= 0 && valor <= 6) return valor;
  const k = String(valor ?? '').toLowerCase().slice(0, 3);
  return k in DIAS ? DIAS[k] : padrao;
}

export const CALENDAR_MODES = ['month', 'week', 'day', 'agenda'];

export function calendarDefaults() {
  return {
    mode: 'month',
    date: { start: null, end: null, fallback: 'createdAt', defaultDuration: 60 },
    week: { firstDay: 'sun', showWeekends: true, showWeekNumber: false },
    time: { dayStart: '07:00', dayEnd: '21:00', slot: 30, snap: 15, showNowLine: true },
    card: { props: [], colorBy: null, showTime: true },
    month: { maxPerDay: 3, showOtherMonthDays: true },
  };
}

const num = (v, padrao, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/**
 * Configuração efetiva do calendário (padrões + o que a view define + chaves antigas).
 * Sempre devolve valores válidos, mesmo com YAML escrito à mão.
 */
export function resolveCalendarConfig(view = {}) {
  const d = calendarDefaults();
  const date = { ...d.date, ...(view.date && typeof view.date === 'object' ? view.date : {}) };
  // chaves antigas (criadas antes do painel): dateProperty / fallbackDateProperty
  if (!date.start && view.dateProperty) date.start = view.dateProperty;
  if (view.fallbackDateProperty !== undefined && !(view.date && 'fallback' in view.date)) date.fallback = view.fallbackDateProperty;
  if (date.fallback === 'none' || date.fallback === '' || date.fallback === false) date.fallback = null;

  const week = { ...d.week, ...(view.week && typeof view.week === 'object' ? view.week : {}) };
  const time = { ...d.time, ...(view.time && typeof view.time === 'object' ? view.time : {}) };
  const card = { ...d.card, ...(view.card && typeof view.card === 'object' ? view.card : {}) };
  const month = { ...d.month, ...(view.month && typeof view.month === 'object' ? view.month : {}) };

  const hhmm = (s, pad) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
    return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : pad;
  };
  let dayStart = hhmm(time.dayStart, 7 * 60);
  let dayEnd = hhmm(time.dayEnd, 21 * 60);
  if (dayEnd <= dayStart) { dayStart = 7 * 60; dayEnd = 21 * 60; }

  return {
    mode: CALENDAR_MODES.includes(view.mode) ? view.mode : 'month',
    date: {
      start: date.start || null,
      end: date.end || null,
      fallback: date.fallback || null,
      defaultDuration: num(date.defaultDuration, 60, 15, 24 * 60),
    },
    week: {
      firstDay: parseFirstDay(week.firstDay, 0),
      showWeekends: week.showWeekends !== false && week.showWeekends !== 'false',
      showWeekNumber: week.showWeekNumber === true || week.showWeekNumber === 'true',
    },
    time: {
      dayStart,
      dayEnd,
      slot: [15, 30, 60].includes(Number(time.slot)) ? Number(time.slot) : 30,
      snap: [5, 10, 15, 30, 60].includes(Number(time.snap)) ? Number(time.snap) : 15,
      showNowLine: time.showNowLine !== false && time.showNowLine !== 'false',
    },
    card: {
      props: Array.isArray(card.props) ? card.props.filter(p => typeof p === 'string') : [],
      colorBy: card.colorBy || null,
      showTime: card.showTime !== false && card.showTime !== 'false',
    },
    month: {
      maxPerDay: Math.round(num(month.maxPerDay, 3, 1, 10)),
      showOtherMonthDays: month.showOtherMonthDays !== false && month.showOtherMonthDays !== 'false',
    },
  };
}

/** Cria uma view nova com os padrões do tipo. */
export function createView(type, { name, id, extra = {} } = {}) {
  const meta = VIEW_TYPES[type] ?? VIEW_TYPES.table;
  const base = { id, type, name: name || meta.label };
  if (type === 'calendar') return { ...base, mode: 'month', date: { fallback: 'createdAt' }, ...extra };
  if (type === 'gallery') return { ...base, cardSize: 'medium', props: ['title', 'tags', 'updatedAt'], ...extra };
  return { ...base, props: ['title', 'tags', 'updatedAt'], ...extra };
}

/** Cópia profunda de uma view com id novo e nome "… (cópia)". */
export function duplicateView(view, existentes = []) {
  const copia = JSON.parse(JSON.stringify(view));
  copia.id = newViewId(existentes);
  copia.name = `${view.name || VIEW_TYPES[view.type]?.label || 'View'} (cópia)`;
  return copia;
}

// ── Alteração de uma view ────────────────────────────────────────────────────

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Aplica um "patch" numa view SEM mutar: objetos se mesclam em profundidade (mudar
 * `date.start` não perde `date.end`), listas e valores simples são substituídos,
 * e `undefined` apaga a chave (voltar ao padrão).
 */
export function applyViewPatch(view, patch) {
  const saida = { ...view };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) delete saida[k];
    else if (ehObjeto(v) && ehObjeto(saida[k])) saida[k] = applyViewPatch(saida[k], v);
    else saida[k] = v;
  }
  return saida;
}
// ── Agrupar · Cálculos · Layout da tabela (compatíveis com as chaves antigas) ──

const SUMMARY_LEGADO = { average: 'avg', percent_checked: 'pct_checked', count_filled: 'filled', count_unique: 'unique' };

/** `group` (novo) ou `groupBy` (antigo, só quadro). Sempre devolve um objeto completo. */
export function resolveGroupConfig(view = {}) {
  const g = view.group && typeof view.group === 'object' ? view.group : {};
  const lista = v => (Array.isArray(v) ? v.map(String) : []);
  return {
    prop: g.prop || view.groupBy || null,
    granularity: ['day', 'week', 'month', 'year'].includes(g.granularity) ? g.granularity : 'month',
    range: g.range && Number(g.range.step) > 0 ? { step: Number(g.range.step) } : null,
    order: ['manual', 'asc', 'desc', 'count'].includes(g.order) ? g.order : 'manual',
    hideEmpty: g.hideEmpty === true || g.hideEmpty === 'true',
    hidden: lista(g.hidden),
    collapsed: lista(g.collapsed),
    showCounts: g.showCounts !== false && g.showCounts !== 'false',
  };
}

/** Cálculos por coluna: `calc` (novo) ou `summaries` (antigo, com nomes antigos traduzidos). */
export function resolveCalc(view = {}) {
  const calc = {};
  for (const [k, v] of Object.entries(view.summaries || {})) if (v && v !== 'none') calc[k] = SUMMARY_LEGADO[v] || v;
  for (const [k, v] of Object.entries(view.calc || {})) { if (v && v !== 'none') calc[k] = v; else delete calc[k]; }
  return calc;
}

export function resolveTableLayout(view = {}) {
  const l = view.layout && typeof view.layout === 'object' ? view.layout : {};
  return {
    rowHeight: ['short', 'medium', 'tall'].includes(l.rowHeight) ? l.rowHeight : 'medium',
    wrapCells: l.wrapCells === true || l.wrapCells === 'true',
    rowNumbers: l.rowNumbers === true || l.rowNumbers === 'true',
    borders: ['both', 'rows', 'none'].includes(l.borders) ? l.borders : 'both',
  };
}
