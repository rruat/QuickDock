// ── bases-engine.js ────────────────────────────────────────────────────────
// Motor central de consulta, filtragem, ordenação, agrupamento e cálculos
// de estatísticas para o QuickDock Bases.
// Funções puras sem DOM nem Dexie — 100% testável no Node.js.

import { formatPropertyValue } from './bases-schema.js';

/**
 * Extrai o valor de uma propriedade (seja nativa/sistema ou de frontmatter) de uma nota.
 */
export function getNotePropertyValue(note, propKey) {
  if (!note) return undefined;

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
export function evaluateFilterCondition(note, filter) {
  if (!filter || !filter.property) return true;

  const { property, operator = 'equals', value } = filter;
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

    case 'is_today': {
      if (!rawVal) return false;
      const dStr = typeof rawVal === 'string' ? rawVal.slice(0, 10) : new Date(rawVal).toISOString().slice(0, 10);
      const todayStr = new Date().toISOString().slice(0, 10);
      return dStr === todayStr;
    }

    case 'is_before': {
      if (!rawVal || !value) return false;
      return String(rawVal).slice(0, 10) < String(value).slice(0, 10);
    }

    case 'is_after': {
      if (!rawVal || !value) return false;
      return String(rawVal).slice(0, 10) > String(value).slice(0, 10);
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
 * Filtra a coleção de notas de acordo com a cláusula de origem (source),
 * lista de filtros (AND/OR) e busca rápida.
 */
export function queryBaseNotes(notes = [], options = {}) {
  const { source = {}, filters = [], filterMode = 'and', quickSearch = '' } = options;

  let result = notes.filter(note => {
    // 1. Cláusula de origem (source)
    if (source.folder) {
      const fLower = String(source.folder).toLowerCase().trim();
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
    if (Array.isArray(filters) && filters.length > 0) {
      if (filterMode === 'or') {
        const passesAny = filters.some(f => evaluateFilterCondition(note, f));
        if (!passesAny) return false;
      } else {
        const passesAll = filters.every(f => evaluateFilterCondition(note, f));
        if (!passesAll) return false;
      }
    }

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
        cmp = String(valA).localeCompare(String(valB));
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
