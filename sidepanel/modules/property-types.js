// ── property-types.js ───────────────────────────────────────────────────────
// Funções puras de tipagem de propriedades de notas.
// Sem DOM, sem Dexie — seguro para ambientes Node.js (test/run.mjs).
//
// Tipos suportados (paridade com Obsidian + Select adicional da QuickDock):
//   text, list, number, checkbox, date, select

/**
 * Mapa de tipos de propriedade: id → { icon, label }
 * O ícone é o nome do Material Symbol correspondente.
 */
export const PROPERTY_TYPES = {
  text:      { icon: 'notes',                  label: 'Texto' },
  list:      { icon: 'label',                  label: 'Lista' },
  number:    { icon: 'tag',                    label: 'Número' },
  checkbox:  { icon: 'check_box',              label: 'Caixa de seleção' },
  date:      { icon: 'calendar_month',         label: 'Data' },
  datetime:  { icon: 'schedule',               label: 'Data e Hora' },
  daterange: { icon: 'date_range',             label: 'Período' },
  location:  { icon: 'location_on',            label: 'Localização' },
  reminder:  { icon: 'alarm',                  label: 'Lembrete TDAH' },
  select:    { icon: 'arrow_drop_down_circle', label: 'Seleção' },
};

/**
 * Infere o tipo de uma propriedade:
 *   1. Usa propertyTypes[chave] se existir (tipo escolhido explicitamente).
 *   2. Caso contrário, infere pelo nome da chave (migração silenciosa de notas antigas).
 *   3. Default: 'text'.
 */
export function inferirTipoPropriedade(chave, propertyTypes = {}) {
  if (chave && chave in propertyTypes) return propertyTypes[chave];
  const cl = (chave || '').toLowerCase();
  if (cl === 'data' || cl === 'date' || cl === 'duedate') return 'date';
  if (cl === 'horario' || cl === 'data_hora' || cl === 'datetime') return 'datetime';
  if (cl === 'periodo' || cl === 'daterange' || cl === 'intervalo') return 'daterange';
  if (cl === 'local' || cl === 'localizacao' || cl === 'location' || cl === 'geolocalizacao') return 'location';
  if (cl === 'lembrete' || cl === 'reminder' || cl === 'alarme') return 'reminder';
  if (cl === 'status') return 'select';
  if (cl === 'categoria' || cl === 'category' || cl === 'tag' || cl === 'tags') return 'list';
  return 'text';
}

/**
 * Converte o valor de uma propriedade para o novo tipo.
 * Preserva o dado — nunca descarta; apenas reformata.
 */
export function migrarPropriedadeParaTipo(chave, valor, tipoNovo) {
  switch (tipoNovo) {
    case 'list': {
      if (Array.isArray(valor)) return valor;
      if (valor === null || valor === undefined || valor === '') return [];
      return [String(valor)];
    }
    case 'text': {
      if (Array.isArray(valor)) return valor.join(', ');
      if (valor === null || valor === undefined) return '';
      return String(valor);
    }
    case 'number': {
      if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
      const n = parseFloat(String(valor ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    }
    case 'checkbox': {
      if (typeof valor === 'boolean') return valor;
      const s = String(valor ?? '').toLowerCase().trim();
      return s === 'true' || s === '1' || s === 'yes' || s === 'sim';
    }
    case 'date': {
      if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10);
      if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().slice(0, 10);
      return '';
    }
    case 'datetime': {
      if (typeof valor === 'string') {
        const s = valor.trim();
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T09:00`;
      }
      if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().slice(0, 16);
      return '';
    }
    case 'daterange': {
      if (valor && typeof valor === 'object') {
        return {
          start: String(valor.start || '').slice(0, 10),
          end: String(valor.end || valor.start || '').slice(0, 10),
          allDay: valor.allDay !== false
        };
      }
      const s = String(valor ?? '').trim();
      const matchDates = [...s.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m => m[0]);
      if (matchDates.length >= 2) {
        return { start: matchDates[0], end: matchDates[1], allDay: true };
      }
      const d = matchDates[0] || '';
      return { start: d, end: d, allDay: true };
    }
    case 'location': {
      if (valor && typeof valor === 'object') {
        return {
          name: String(valor.name || ''),
          lat: typeof valor.lat === 'number' ? valor.lat : null,
          lng: typeof valor.lng === 'number' ? valor.lng : null,
          radius: Number.isFinite(valor.radius) ? valor.radius : 150,
          triggerOn: valor.triggerOn === 'exit' ? 'exit' : 'enter'
        };
      }
      return {
        name: String(valor ?? ''),
        lat: null,
        lng: null,
        radius: 150,
        triggerOn: 'enter'
      };
    }
    case 'reminder': {
      if (valor && typeof valor === 'object') {
        return {
          active: Boolean(valor.active),
          intervalMinutes: Number.isFinite(valor.intervalMinutes) && valor.intervalMinutes > 0 ? valor.intervalMinutes : 5,
          completed: Boolean(valor.completed),
          sound: valor.sound !== false,
          lastNotified: typeof valor.lastNotified === 'number' ? valor.lastNotified : null
        };
      }
      return {
        active: Boolean(valor),
        intervalMinutes: 5,
        completed: false,
        sound: true,
        lastNotified: null
      };
    }
    case 'select': {
      if (Array.isArray(valor)) return String(valor[0] ?? '');
      return String(valor ?? '');
    }
    default:
      return valor;
  }
}
