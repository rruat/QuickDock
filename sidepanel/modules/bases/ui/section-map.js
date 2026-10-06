// ── section-map.js ──────────────────────────────────────────────────────────
// Configuração do Mapa: propriedade de localização, cor dos pinos, agrupamento, ajuste. Grava
// `location`, `pin.colorBy`, `cluster`, `fit`, `height`.

import { resolveMapConfig } from '../map/map-model.js';
import { colorableProperties } from './property-options.js';
import { section, row, selectControl, toggle } from './controls.js';

const NENHUMA = '__none__';

export function mapSections({ view, schema, memoria, patch }) {
  if (view.type !== 'map') return [];
  const cfg = resolveMapConfig(view);
  const locais = Object.entries(schema)
    .filter(([, d]) => d?.type === 'location' || d?.type === 'text')
    .map(([k, d]) => ({ value: d.key || k, label: d.label || k, group: d.type === 'location' ? 'Localização' : 'Texto "lat, lng"' }));
  const s = section('Mapa', { chave: 'map', memoria, dica: 'Os mapas de fundo precisam de internet; sem rede os pinos continuam aparecendo.' });
  s.body.appendChild(row('Propriedade de localização', id => selectControl({
    id, value: cfg.location || NENHUMA, options: [{ value: NENHUMA, label: 'Escolher…' }, ...locais],
    onChange: v => patch({ location: v === NENHUMA ? undefined : v }),
  })));
  s.body.appendChild(row('Colorir pinos por', id => selectControl({
    id, value: cfg.colorBy || NENHUMA,
    options: [{ value: NENHUMA, label: 'Sem cor' }, ...colorableProperties(schema).map(p => ({ value: p.key, label: p.label }))],
    onChange: v => patch({ pin: { colorBy: v === NENHUMA ? undefined : v } }),
  })));
  s.body.appendChild(row('Agrupar pinos próximos', id => toggle({ id, value: cfg.cluster, onChange: v => patch({ cluster: v }) })));
  s.body.appendChild(row('Ajustar ao abrir', id => toggle({ id, value: cfg.fit, onChange: v => patch({ fit: v }) })));
  s.body.appendChild(row('Altura mínima', id => selectControl({ id, value: cfg.height, options: [320, 480, 640, 800].map(h => ({ value: h, label: `${h}px` })), onChange: v => patch({ height: Number(v) }) })));
  return [s.root];
}
