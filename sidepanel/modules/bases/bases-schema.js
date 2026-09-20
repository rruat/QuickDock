// ── bases-schema.js ────────────────────────────────────────────────────────
// Esquema, tipos de dados e inferência de propriedades para o QuickDock Bases.
// Funções puras sem DOM nem Dexie — 100% testável no Node.js.

import { PROPERTY_TYPES, inferirTipoPropriedade } from '../property-types.js';

/**
 * Catálogo estendido de tipos de propriedade suportados nas Bases:
 *   - text, number, date, datetime, checkbox, select, list, link, url, formula, folder, tasks
 */
export const BASE_PROPERTY_TYPES = {
  ...PROPERTY_TYPES,
  datetime: { icon: 'schedule',               label: 'Data e hora' },
  link:     { icon: 'link',                   label: 'Link interno' },
  url:      { icon: 'open_in_new',            label: 'URL' },
  formula:  { icon: 'functions',              label: 'Fórmula' },
  folder:   { icon: 'folder',                 label: 'Pasta' },
  tasks:    { icon: 'checklist_rtl',          label: 'Tarefas' },
};

/**
 * Formata o valor bruto de uma propriedade de acordo com o seu tipo para exibição.
 */
export function formatPropertyValue(val, type = 'text', options = {}) {
  if (val === null || val === undefined) return '';

  switch (type) {
    case 'checkbox':
      return !!val;

    case 'number': {
      const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
      if (!Number.isFinite(n)) return '';
      if (options.format === 'currency_brl') {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
      }
      if (options.format === 'percent') {
        return `${(n * 100).toFixed(options.decimals ?? 1)}%`;
      }
      return n.toLocaleString('pt-BR', { maximumFractionDigits: options.decimals ?? 2 });
    }

    case 'date': {
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        const [y, m, d] = val.slice(0, 10).split('-');
        return `${d}/${m}/${y}`;
      }
      if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toLocaleDateString('pt-BR');
      }
      return String(val);
    }

    case 'datetime': {
      const d = val instanceof Date ? val : new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    case 'list': {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        return val.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [String(val)];
    }

    case 'link': {
      const s = String(val).trim();
      const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(s);
      if (m) return { target: m[1].trim(), alias: m[2] ? m[2].trim() : m[1].trim() };
      return { target: s, alias: s };
    }

    case 'tasks': {
      if (typeof val === 'object' && val !== null && 'total' in val) {
        return { total: val.total || 0, checked: val.checked || 0 };
      }
      return { total: 0, checked: 0 };
    }

    case 'folder':
    case 'select':
    case 'text':
    case 'url':
    default:
      return String(val);
  }
}

/**
 * Converte e valida o valor digitado pelo usuário para salvar no frontmatter/metadados da nota.
 */
export function parsePropertyInput(rawInput, type = 'text') {
  if (rawInput === null || rawInput === undefined) return null;

  switch (type) {
    case 'checkbox':
      if (typeof rawInput === 'boolean') return rawInput;
      return String(rawInput).toLowerCase().trim() === 'true';

    case 'number': {
      if (typeof rawInput === 'number' && Number.isFinite(rawInput)) return rawInput;
      let s = String(rawInput).trim().replace(/[^\d.,-]/g, '');
      if (s.includes('.') && s.includes(',')) {
        if (s.indexOf('.') < s.indexOf(',')) {
          // Formato brasileiro: 1.250,50 -> 1250.50
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          // Formato americano: 1,250.50 -> 1250.50
          s = s.replace(/,/g, '');
        }
      } else if (s.includes(',')) {
        s = s.replace(',', '.');
      }
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    }

    case 'date': {
      const s = String(rawInput).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        const [d, m, y] = s.split('/');
        return `${y}-${m}-${d}`;
      }
      return s || null;
    }

    case 'datetime': {
      const s = String(rawInput).trim();
      const d = new Date(s);
      return isNaN(d.getTime()) ? s || null : d.toISOString();
    }

    case 'list': {
      if (Array.isArray(rawInput)) return rawInput.map(x => String(x).trim()).filter(Boolean);
      return String(rawInput)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }

    case 'select':
      return String(rawInput).trim() || null;

    case 'link': {
      let s = String(rawInput).trim();
      if (!s) return null;
      if (!s.startsWith('[[') && !s.endsWith(']]')) s = `[[${s}]]`;
      return s;
    }

    case 'url':
    case 'text':
    default:
      return String(rawInput).trim();
  }
}

/**
 * Infere o schema de propriedades a partir de uma coleção de notas.
 * Analisa as propriedades existentes no frontmatter das notas e mescla
 * com o schema explícito fornecido na definição da base.
 *
 * @param {Array<Object>} notes Lista de notas com metadados e properties
 * @param {Object} explicitProperties Propriedades declaradas na base
 * @returns {Object} Mapa de propriedades: chave -> { key, label, type, options, width, isSystem }
 */
export function inferBaseSchema(notes = [], explicitProperties = {}) {
  const schema = {};

  // Colunas nativas padrão sempre disponíveis
  schema['title'] = {
    key: 'title',
    label: 'Nome da Nota',
    type: 'title',
    width: 260,
    isSystem: true,
  };

  schema['folder'] = {
    key: 'folder',
    label: 'Pasta',
    type: 'folder',
    width: 150,
    isSystem: true,
  };

  schema['tags'] = {
    key: 'tags',
    label: 'Tags',
    type: 'list',
    width: 180,
    isSystem: true,
  };

  schema['createdAt'] = {
    key: 'createdAt',
    label: 'Criado em',
    type: 'datetime',
    width: 140,
    isSystem: true,
  };

  schema['updatedAt'] = {
    key: 'updatedAt',
    label: 'Modificado em',
    type: 'datetime',
    width: 140,
    isSystem: true,
  };

  schema['tasks'] = {
    key: 'tasks',
    label: 'Tarefas',
    type: 'tasks',
    width: 120,
    isSystem: true,
  };

  // Descobre propriedades de frontmatter nas notas
  for (const note of notes) {
    if (!note || !note.properties || typeof note.properties !== 'object') continue;
    for (const [propKey, propVal] of Object.entries(note.properties)) {
      if (propKey in schema) continue;

      let detectedType = 'text';
      if (note.propertyTypes && note.propertyTypes[propKey]) {
        detectedType = note.propertyTypes[propKey];
      } else if (typeof propVal === 'boolean') {
        detectedType = 'checkbox';
      } else if (typeof propVal === 'number') {
        detectedType = 'number';
      } else if (Array.isArray(propVal)) {
        detectedType = 'list';
      } else if (typeof propVal === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(propVal)) detectedType = 'date';
        else if (/^https?:\/\//i.test(propVal)) detectedType = 'url';
        else if (/^\[\[.+\]\]$/.test(propVal)) detectedType = 'link';
        else detectedType = inferirTipoPropriedade(propKey, note.propertyTypes);
      }

      schema[propKey] = {
        key: propKey,
        label: propKey.charAt(0).toUpperCase() + propKey.slice(1).replace(/[_-]/g, ' '),
        type: detectedType,
        width: 160,
        isSystem: false,
      };
    }
  }

  // Mescla com as propriedades explícitas da Base (sobrescreve tipo, label, width e options)
  for (const [key, def] of Object.entries(explicitProperties || {})) {
    if (!schema[key]) {
      schema[key] = {
        key,
        label: def.label || key,
        type: def.type || 'text',
        width: def.width || 160,
        options: def.options || [],
        isSystem: false,
      };
    } else {
      if (def.label)   schema[key].label = def.label;
      if (def.type)    schema[key].type = def.type;
      if (def.width)   schema[key].width = def.width;
      if (def.options) schema[key].options = def.options;
    }
  }

  return schema;
}

/**
 * Normaliza uma definição de Base para garantir integridade e valores padrão.
 */
export function normalizeBaseDefinition(rawDef = {}) {
  const def = {
    source: {},
    properties: {},
    views: [],
    ...rawDef,
  };

  // Normalização de source
  if (typeof def.source === 'string') {
    if (def.source.startsWith('#')) def.source = { tag: def.source };
    else def.source = { folder: def.source };
  } else if (!def.source || typeof def.source !== 'object') {
    def.source = { all: true };
  }

  // Visualização padrão caso nenhuma tenha sido declarada
  if (!Array.isArray(def.views) || def.views.length === 0) {
    def.views = [
      {
        id: 'v_default_table',
        name: 'Tabela',
        type: 'table',
        columns: ['title', 'folder', 'tags', 'updatedAt'],
        sort: [{ property: 'title', direction: 'asc' }],
      },
    ];
  }

  return def;
}
