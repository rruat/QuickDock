// ── section-format.js ───────────────────────────────────────────────────────
// "Formato das propriedades": como número e data aparecem (moeda, %, barra, data relativa…).
// Grava em baseDef.properties[chave].format (vale para todas as views da Base).

import { NUMBER_KINDS, DATE_KINDS, CURRENCIES } from '../engine/format.js';
import { section, row, el, selectControl, toggle } from './controls.js';

const ehData = t => t === 'date' || t === 'datetime';

export function formatSection({ baseProps, schema, memoria, patchBase }) {
  const alvos = Object.entries(schema).filter(([k, d]) => d?.type === 'number' || ehData(d?.type)).map(([k, d]) => ({ key: d.key || k, def: d }));
  if (!alvos.length) return null;
  const s = section('Formato das propriedades', { chave: 'format', memoria, abertaPorPadrao: false, dica: 'Vale para todas as views desta Base.' });

  for (const { key, def } of alvos) {
    const fmt = def.format && typeof def.format === 'object' ? def.format : {};
    const grava = novo => {
      const existente = baseProps?.[key] || {};
      // preserva a definição explícita (ex.: fórmula); para inferidas grava o tipo já visto
      patchBase({ [key]: { ...(existente.type ? existente : { ...existente, type: def.type }), format: novo } });
    };
    const caixa = el('div', 'bset-filter');
    caixa.appendChild(el('strong', 'bset-derived-name', def.label || key));
    const numero = def.type === 'number';
    caixa.appendChild(row('Mostrar como', id => selectControl({
      id, value: fmt.kind || (numero ? 'plain' : 'absolute'),
      options: numero ? NUMBER_KINDS : DATE_KINDS,
      onChange: v => grava({ ...fmt, kind: v }),
    })));
    if (numero && fmt.kind === 'currency') {
      caixa.appendChild(row('Moeda', id => selectControl({ id, value: fmt.currency || 'BRL', options: CURRENCIES, onChange: v => grava({ ...fmt, currency: v }) })));
    }
    if (numero && ['plain', 'currency', 'percent', undefined].includes(fmt.kind)) {
      caixa.appendChild(row('Casas decimais', id => selectControl({
        id, value: Number.isInteger(fmt.decimals) ? fmt.decimals : 'auto',
        options: [{ value: 'auto', label: 'Automático' }, ...[0, 1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))],
        onChange: v => grava({ ...fmt, decimals: v === 'auto' ? undefined : Number(v) }),
      })));
    }
    if (!numero) {
      caixa.appendChild(row('Mostrar hora', id => toggle({ id, value: !!fmt.showTime, onChange: v => grava({ ...fmt, showTime: v }) })));
    }
    s.body.appendChild(caixa);
  }
  return s.root;
}
