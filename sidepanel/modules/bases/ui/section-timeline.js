// ── section-timeline.js ─────────────────────────────────────────────────────
// Configuração da Linha do tempo: datas (início/fim), escala, tabela lateral, cor, "hoje".
// Grava `date`, `scale`, `table`, `color.by`, `today`.

import { resolveTimelineConfig } from '../timeline/timeline-model.js';
import { TIMELINE_SCALES } from '../timeline/timeline-scale.js';
import { dateProperties, colorableProperties } from './property-options.js';
import { section, row, selectControl, toggle } from './controls.js';

const NENHUMA = '__none__';

export function timelineSections({ view, schema, memoria, patch }) {
  if (view.type !== 'timeline') return [];
  const cfg = resolveTimelineConfig(view);
  const datas = dateProperties(schema).filter(p => p.group !== 'sistema').map(p => ({ value: p.key, label: p.label, group: p.group === 'data' ? 'Datas' : 'Outras propriedades' }));
  const out = [];

  const dt = section('Datas', { chave: 'tl-datas', memoria, dica: 'Sem data de fim, a nota vira um marco de um dia (losango).' });
  dt.body.appendChild(row('Início', id => selectControl({ id, value: cfg.date.start || NENHUMA, options: [{ value: NENHUMA, label: 'Escolher…' }, ...datas], onChange: v => patch({ date: { start: v === NENHUMA ? undefined : v } }) })));
  dt.body.appendChild(row('Fim (opcional)', id => selectControl({ id, value: cfg.date.end || NENHUMA, options: [{ value: NENHUMA, label: 'Nenhum' }, ...datas], onChange: v => patch({ date: { end: v === NENHUMA ? undefined : v } }) }), { dica: 'Com data de fim dá para esticar as pontas da barra.' }));
  dt.body.appendChild(row('Escala', id => selectControl({ id, value: cfg.scale, options: Object.entries(TIMELINE_SCALES).map(([k, m]) => ({ value: k, label: m.label })), onChange: v => patch({ scale: v }) })));
  dt.body.appendChild(row('Linha de hoje', id => toggle({ id, value: cfg.today, onChange: v => patch({ today: v }) })));
  out.push(dt.root);

  const ap = section('Aparência', { chave: 'tl-apar', memoria });
  ap.body.appendChild(row('Mostrar tabela', id => toggle({ id, value: cfg.table.visible, onChange: v => patch({ table: { visible: v } }) })));
  ap.body.appendChild(row('Largura da tabela', id => selectControl({ id, value: cfg.table.width, options: [200, 240, 280, 340, 420].map(w => ({ value: w, label: `${w}px` })), onChange: v => patch({ table: { width: Number(v) } }) })));
  ap.body.appendChild(row('Colorir por', id => selectControl({
    id, value: cfg.colorBy || NENHUMA,
    options: [{ value: NENHUMA, label: 'Sem cor' }, ...colorableProperties(schema).map(p => ({ value: p.key, label: p.label }))],
    onChange: v => patch({ color: { by: v === NENHUMA ? undefined : v } }),
  })));
  out.push(ap.root);
  return out;
}
