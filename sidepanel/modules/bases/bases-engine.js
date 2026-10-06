// ── bases-engine.js ────────────────────────────────────────────────────────
// Motor central de consulta, filtragem, ordenação, agrupamento e cálculos
// de estatísticas para o QuickDock Bases.
// Funções puras sem DOM nem Dexie — 100% testável no Node.js.

import { formatPropertyValue } from './bases-schema.js';

/**
 * Extrai o valor de uma propriedade (seja nativa/sistema ou de frontmatter) de uma nota.
 */
import {
  toYMD, todayYMD, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth, compareYMD,
} from './engine/date-utils.js';
import { evaluateFilterNode } from './engine/filter-tree.js';

export function getNotePropertyValue(note, propKey) {
  if (!note) return undefined;
  // propriedade derivada (fórmula/rollup): calculada por engine/derived-columns.js
  if (note.__calc && propKey in note.__calc) return note.__calc[propKey];

  switch (propKey) {
    case 'title':
    case 'name':
      return note.title || note.titulo || 'Sem título';

    case 'folder':
    case 'pasta':
      return note.pasta || '';

    case 'tags': {
      const tags = new Set();
      // Tags das propriedades frontmatter
      const pTags = note.properties?.tags ?? note.properties?.tag ?? note.properties?.categoria;
      if (Array.isArray(pTags)) pTags.forEach(t => tags.add(String(t).replace(/^#/, '')));
      else if (typeof pTags === 'string' && pTags.trim()) {
        pTags.split(',').forEach(t => tags.add(t.trim().replace(/^#/, '')));
      }

      // Tags inline no conteúdo
      if (note.content && typeof note.content === 'string') {
        const re = /(?:^|(?<=[\s,.:;!?'"([{<]))#([a-zA-Z\u00C0-\u017F0-9_\-]+(?:\/[a-zA-Z\u00C0-\u017F0-9_\-]+)*)(?=$|[\s,.:;!?'")\]}>])/g;
        let m;
        while ((m = re.exec(note.content)) !== null) {
          if (!/^\d+$/.test(m[1])) tags.add(m[1]);
        }
      }
      return [...tags];
    }

    case 'createdAt':
    case 'criadoEm':
      return note.createdAt || note.criadoEm || '';

    case 'updatedAt':
    case 'atualizadoEm':
      return note.updatedAt || note.atualizadoEm || '';

    case 'tasks': {
      let total = 0, checked = 0;
      if (Array.isArray(note.blocks)) {
        for (const b of note.blocks) {
          if (b && b.type === 'checklist') {
            total++;
            if (b.checked === true || b.checked === 'true') checked++;
          }
        }
      }
      return { total, checked, percent: total > 0 ? (checked / total) : 0 };
    }

    default:
      return note.properties?.[propKey] ?? undefined;
  }
}

/**
 * Avalia se uma nota corresponde a uma única condição de filtro.
 */
export function evaluateFilterCondition(note, filter, ctx = {}) {
  if (!filter || !filter.property) return true;

  const { property, operator = 'equals', value } = filter;
  const agora = ctx.now instanceof Date ? ctx.now : new Date();
  const rawVal = getNotePropertyValue(note, property);

  switch (operator) {
    case 'is_empty':
      return rawVal === undefined || rawVal === null || rawVal === '' || (Array.isArray(rawVal) && rawVal.length === 0);

    case 'is_not_empty':
      return rawVal !== undefined && rawVal !== null && rawVal !== '' && (!Array.isArray(rawVal) || rawVal.length > 0);

    case 'equals':
      if (typeof rawVal === 'boolean') return rawVal === (value === true || value === 'true');
      if (typeof rawVal === 'number') return rawVal === Number(value);
      return String(rawVal ?? '').toLowerCase() === String(value ?? '').toLowerCase();

    case 'not_equals':
      if (typeof rawVal === 'boolean') return rawVal !== (value === true || value === 'true');
      if (typeof rawVal === 'number') return rawVal !== Number(value);
      return String(rawVal ?? '').toLowerCase() !== String(value ?? '').toLowerCase();

    case 'contains':
      if (Array.isArray(rawVal)) {
        const query = String(value ?? '').toLowerCase().replace(/^#/, '');
        return rawVal.some(item => String(item).toLowerCase().includes(query));
      }
      return String(rawVal ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());

    case 'does_not_contain':
      if (Array.isArray(rawVal)) {
        const query = String(value ?? '').toLowerCase().replace(/^#/, '');
        return !rawVal.some(item => String(item).toLowerCase().includes(query));
      }
      return !String(rawVal ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());

    case 'starts_with':
      return String(rawVal ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());

    case 'ends_with':
      return String(rawVal ?? '').toLowerCase().endsWith(String(value ?? '').toLowerCase());

    case 'greater_than':
    case '>':
      return Number(rawVal) > Number(value);

    case 'greater_than_or_equal':
    case '>=':
      return Number(rawVal) >= Number(value);

    case 'less_than':
    case '<':
      return Number(rawVal) < Number(value);

    case 'less_than_or_equal':
    case '<=':
      return Number(rawVal) <= Number(value);

    case 'is_checked':
      return rawVal === true || rawVal === 'true';

    case 'is_unchecked':
      return rawVal === false || rawVal === 'false' || !rawVal;

    // ── Datas (todas no dia LOCAL; semana começa na segunda) ──────────────────
    case 'is_today':
    case 'is_yesterday':
    case 'is_tomorrow':
    case 'is_this_week':
    case 'is_last_week':
    case 'is_next_week':
    case 'is_this_month':
    case 'is_last_month':
    case 'is_next_month':
    case 'is_within_last':
    case 'is_within_next':
    case 'is_on_or_before':
    case 'is_on_or_after':
    case 'is_between': {
      const dia = toYMD(rawVal);
      if (!dia) return false;
      const hoje = todayYMD(agora);
      const intervalo = intervaloRelativo(operator, hoje, value);
      if (intervalo) return compareYMD(dia, intervalo[0]) >= 0 && compareYMD(dia, intervalo[1]) <= 0;
      return false;
    }

    case 'is_before': {
      const dia = toYMD(rawVal), alvo = toYMD(value);
      return !!dia && !!alvo && compareYMD(dia, alvo) < 0;
    }

    case 'is_after': {
      const dia = toYMD(rawVal), alvo = toYMD(value);
      return !!dia && !!alvo && compareYMD(dia, alvo) > 0;
    }

    case 'is_any_of': {
      const allowed = Array.isArray(value) ? value : [value];
      if (Array.isArray(rawVal)) {
        return rawVal.some(item => allowed.map(String).includes(String(item)));
      }
      return allowed.map(String).includes(String(rawVal));
    }

    case 'is_none_of': {
      const excluded = Array.isArray(value) ? value : [value];
      if (Array.isArray(rawVal)) {
        return !rawVal.some(item => excluded.map(String).includes(String(item)));
      }
      return !excluded.map(String).includes(String(rawVal));
    }

    default:
      return true;
  }
}

/**
 * Intervalo [início, fim] (ymds, inclusivo) que um operador de data relativo representa.
 * Exportado pra UI mostrar o intervalo e pros testes. `null` se o operador não é relativo.
 */
export function intervaloRelativo(operator, hoje, value) {
  const segunda = d => startOfWeek(d, 1);
  switch (operator) {
    case 'is_today':      return [hoje, hoje];
    case 'is_yesterday':  return [addDays(hoje, -1), addDays(hoje, -1)];
    case 'is_tomorrow':   return [addDays(hoje, 1), addDays(hoje, 1)];
    case 'is_this_week':  return [segunda(hoje), addDays(segunda(hoje), 6)];
    case 'is_last_week':  return [addDays(segunda(hoje), -7), addDays(segunda(hoje), -1)];
    case 'is_next_week':  return [addDays(segunda(hoje), 7), addDays(segunda(hoje), 13)];
    case 'is_this_month': return [startOfMonth(hoje), endOfMonth(hoje)];
    case 'is_last_month': { const m = addMonths(hoje, -1); return [startOfMonth(m), endOfMonth(m)]; }
    case 'is_next_month': { const m = addMonths(hoje, 1); return [startOfMonth(m), endOfMonth(m)]; }
    case 'is_within_last': { const n = Math.max(0, Number(value) || 0); return [addDays(hoje, -n), hoje]; }
    case 'is_within_next': { const n = Math.max(0, Number(value) || 0); return [hoje, addDays(hoje, n)]; }
    case 'is_on_or_before': { const a = toYMD(value); return a ? ['0000-01-01', a] : ['9999-12-31', '0000-01-01']; }
    case 'is_on_or_after':  { const a = toYMD(value); return a ? [a, '9999-12-31'] : ['9999-12-31', '0000-01-01']; }
    case 'is_between': {
      const [a, b] = Array.isArray(value) ? value : String(value ?? '').split(',');
      const x = toYMD(a), y = toYMD(b);
      if (!x || !y) return ['9999-12-31', '0000-01-01'];
      return compareYMD(x, y) <= 0 ? [x, y] : [y, x];
    }
    default: return null;
  }
}

/**
 * Filtra a coleção de notas de acordo com a cláusula de origem (source),
 * lista de filtros (AND/OR) e busca rápida.
 */
export function queryBaseNotes(notes = [], options = {}) {
  const { source = {}, filters = [], quickFilters = [], quickSearch = '', now } = options;
  // O modo E/OU já foi gravado com dois nomes (filterMode e filterOperator): vale qualquer um
  const filterMode = String(options.filterMode ?? options.filterOperator ?? 'and').toLowerCase() === 'or' ? 'or' : 'and';
  const ctx = { now };

  let result = notes.filter(note => {
    // 1. Cláusula de origem (source)
    // "/" (ou vazio) é a raiz = todas as notas; sem esta normalização "/" casava com NENHUMA
    // nota assim que o parser de YAML passou a entender `source:` aninhado.
    const pastaDaOrigem = String(source.folder ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (pastaDaOrigem) {
      const fLower = pastaDaOrigem.toLowerCase();
      const noteFolder = String(note.pasta || '').toLowerCase().trim();
      if (source.includeSubfolders !== false) {
        const matches = noteFolder === fLower || noteFolder.startsWith(`${fLower}/`);
        if (!matches) return false;
      } else {
        if (noteFolder !== fLower) return false;
      }
    }

    if (source.tag) {
      const reqTag = String(source.tag).toLowerCase().trim().replace(/^#/, '');
      const noteTags = getNotePropertyValue(note, 'tags');
      const matches = noteTags.some(t => {
        const tl = String(t).toLowerCase();
        return tl === reqTag || tl.startsWith(`${reqTag}/`);
      });
      if (!matches) return false;
    }

    if (source.property) {
      const propVal = getNotePropertyValue(note, source.property);
      if (propVal === undefined || propVal === null || propVal === '') return false;
    }

    // 2. Filtros de visualização (filters)
    const avalia = (n, f) => evaluateFilterNode(n, f, (x, c) => evaluateFilterCondition(x, c, ctx));
    if (Array.isArray(filters) && filters.length > 0) {
      const passa = filterMode === 'or' ? filters.some(f => avalia(note, f)) : filters.every(f => avalia(note, f));
      if (!passa) return false;
    }
    // Filtros rápidos (chips da barra): sempre E, por cima dos filtros salvos na view
    if (Array.isArray(quickFilters) && quickFilters.length > 0 && !quickFilters.every(f => avalia(note, f))) return false;

    // 3. Busca rápida (quickSearch)
    if (quickSearch && typeof quickSearch === 'string' && quickSearch.trim()) {
      const q = quickSearch.toLowerCase().trim();
      const title = String(note.title || note.titulo || '').toLowerCase();
      if (title.includes(q)) return true;

      const pasta = String(note.pasta || '').toLowerCase();
      if (pasta.includes(q)) return true;

      const content = String(note.content || '').toLowerCase();
      if (content.includes(q)) return true;

      // Busca nos valores das propriedades
      if (note.properties && typeof note.properties === 'object') {
        for (const val of Object.values(note.properties)) {
          if (val !== null && val !== undefined && String(val).toLowerCase().includes(q)) {
            return true;
          }
        }
      }

      return false;
    }

    return true;
  });

  return result;
}

// Instante (ms) de um valor de data pra comparar; sem data válida vai pro fim da comparação
function parseDateOrder(v) {
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ordena a lista de notas com suporte a múltiplos níveis de ordenação.
 */
export function sortBaseNotes(notes = [], sorts = [], schema = {}) {
  if (!Array.isArray(sorts) || sorts.length === 0) return [...notes];

  return [...notes].sort((a, b) => {
    for (const { property, direction = 'asc' } of sorts) {
      if (!property) continue;

      const propDef = schema[property] || {};
      const type = propDef.type || 'text';

      let valA = getNotePropertyValue(a, property);
      let valB = getNotePropertyValue(b, property);

      // Nulos / indefinidos vão para o final
      const emptyA = valA === undefined || valA === null || valA === '';
      const emptyB = valB === undefined || valB === null || valB === '';
      if (emptyA && emptyB) continue;
      if (emptyA) return 1;
      if (emptyB) return -1;

      let cmp = 0;
      if (type === 'number') {
        cmp = Number(valA) - Number(valB);
      } else if (type === 'checkbox') {
        cmp = (valA ? 1 : 0) - (valB ? 1 : 0);
      } else if (type === 'date' || type === 'datetime') {
        const a = parseDateOrder(valA), b = parseDateOrder(valB);
        cmp = (a === b) ? String(valA).localeCompare(String(valB)) : a - b;
      } else if (type === 'tasks') {
        const pA = valA.percent ?? 0;
        const pB = valB.percent ?? 0;
        cmp = pA - pB;
      } else {
        cmp = String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base', numeric: true });
      }

      if (cmp !== 0) {
        return direction === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });
}

/**
 * Agrupa notas por uma propriedade escolhida.
 * Retorna um array de grupos: [{ key, label, notes: [] }]
 */
export function groupBaseNotes(notes = [], groupProperty = '', schema = {}) {
  if (!groupProperty) return [{ key: '__all__', label: 'Todas as notas', notes: [...notes] }];

  const propDef = schema[groupProperty] || {};
  const groupsMap = new Map();

  for (const note of notes) {
    const raw = getNotePropertyValue(note, groupProperty);
    const key = (raw === null || raw === undefined || raw === '') ? '__empty__' : String(raw);
    const label = key === '__empty__' ? 'Sem valor' : formatPropertyValue(raw, propDef.type, propDef);

    if (!groupsMap.has(key)) {
      groupsMap.set(key, { key, label, notes: [] });
    }
    groupsMap.get(key).notes.push(note);
  }

  return [...groupsMap.values()];
}

/**
 * Calcula os resumos e métricas para o rodapé da tabela da Base.
 * @param {Array<Object>} notes
 * @param {Object} summariesConfig Mapa: propKey -> 'count'|'sum'|'average'|'min'|'max'|'percent_checked'
 * @param {Object} schema
 */
export function calculateBaseSummaries(notes = [], summariesConfig = {}, schema = {}) {
  const results = {};

  for (const [propKey, metric] of Object.entries(summariesConfig || {})) {
    if (!metric || metric === 'none') continue;

    const values = notes.map(n => getNotePropertyValue(n, propKey)).filter(v => v !== undefined && v !== null && v !== '');

    switch (metric) {
      case 'count':
        results[propKey] = { metric: 'Contagem', value: notes.length };
        break;

      case 'count_filled':
        results[propKey] = { metric: 'Preenchidos', value: values.length };
        break;

      case 'count_unique':
        results[propKey] = { metric: 'Únicos', value: new Set(values.map(String)).size };
        break;

      case 'sum': {
        const nums = values.map(Number).filter(Number.isFinite);
        const sum = nums.reduce((acc, n) => acc + n, 0);
        results[propKey] = { metric: 'Soma', value: sum };
        break;
      }

      case 'average': {
        const nums = values.map(Number).filter(Number.isFinite);
        const avg = nums.length > 0 ? nums.reduce((acc, n) => acc + n, 0) / nums.length : 0;
        results[propKey] = { metric: 'Média', value: avg };
        break;
      }

      case 'min': {
        const nums = values.map(Number).filter(Number.isFinite);
        const min = nums.length > 0 ? Math.min(...nums) : 0;
        results[propKey] = { metric: 'Mínimo', value: min };
        break;
      }

      case 'max': {
        const nums = values.map(Number).filter(Number.isFinite);
        const max = nums.length > 0 ? Math.max(...nums) : 0;
        results[propKey] = { metric: 'Máximo', value: max };
        break;
      }

      case 'percent_checked': {
        const bools = notes.map(n => getNotePropertyValue(n, propKey));
        const checkedCount = bools.filter(b => b === true || b === 'true').length;
        const pct = notes.length > 0 ? (checkedCount / notes.length) * 100 : 0;
        results[propKey] = { metric: '% Concluído', value: `${pct.toFixed(0)}%` };
        break;
      }

      default:
        break;
    }
  }

  return results;
}
