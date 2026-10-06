// ── bases-chart-view.js ─────────────────────────────────────────────────────
// View "Gráfico" das Bases: barra (vertical/horizontal; agrupada, empilhada, 100%), linha,
// pizza/donut e número. Só monta a view — dados em chart/chart-model.js (puro),
// geometria em chart/chart-layout.js (puro), desenho em chart/chart-{bar,donut}.js (SVG).
// Clicar numa barra/fatia aplica um filtro rápido (callbacks.onQuickFilter).

import { resolveChartConfig, buildChartData } from './chart/chart-model.js';
import { renderBarChart, renderLineChart } from './chart/chart-bar.js';
import { renderDonutChart, renderNumberChart } from './chart/chart-donut.js';
import { renderLegend } from './chart/chart-svg.js';
import { AGG_LABELS } from './engine/aggregate-engine.js';
import { EMPTY_KEY } from './engine/group-engine.js';
import { operatorsForType } from './ui/filter-operators.js';

function descricao(cfg, schema) {
  const y = cfg.y.agg === 'count' || !cfg.y.prop ? 'Notas' : `${AGG_LABELS[cfg.y.agg] || cfg.y.agg} de ${schema[cfg.y.prop]?.label || cfg.y.prop}`;
  return cfg.kind === 'number' ? y : `${y} por ${schema[cfg.x.prop]?.label || cfg.x.prop || 'tudo'}`;
}

export function renderBaseChartView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.className = 'base-view-container base-chart-container';
  container.replaceChildren();

  const cfg = resolveChartConfig(viewConfig);
  if (cfg.kind !== 'number' && !cfg.x.prop) {
    const vazio = document.createElement('div');
    vazio.className = 'bch-empty';
    vazio.innerHTML = '<p>Escolha a propriedade do eixo X para montar o gráfico.</p>';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bset-btn'; b.textContent = 'Configurar view';
    b.addEventListener('click', () => callbacks.onOpenSettings?.());
    vazio.appendChild(b);
    container.appendChild(vazio);
    return;
  }

  const data = buildChartData(notes, cfg, schema);
  const titulo = document.createElement('div');
  titulo.className = 'bch-title';
  titulo.textContent = descricao(cfg, schema);
  container.appendChild(titulo);

  const quadro = document.createElement('div');
  quadro.className = `bch-frame bch-legend-pos-${cfg.style.legend}`;
  container.appendChild(quadro);
  const area = document.createElement('div');
  area.className = 'bch-area';
  quadro.appendChild(area);

  if (cfg.kind !== 'number' && !data.categories.length) {
    area.innerHTML = '<p class="bch-empty-msg">Nenhuma nota para exibir.</p>';
    return;
  }

  const width = container.clientWidth ? container.clientWidth - 24 : 640;
  const onPick = (categoria, serie) => {
    if (!callbacks.onQuickFilter || !cfg.x.prop) return;
    const tipo = schema[cfg.x.prop]?.type;
    // só filtra quando o grupo corresponde a um valor exato (datas por mês etc. ficam sem filtro)
    if (['date', 'datetime', 'daterange', 'number'].includes(tipo)) return;
    // o operador precisa existir para o tipo (ver ui/filter-operators.js), senão o chip mostra "não encontrada"
    const op = operatorsForType(tipo, cfg.x.prop);
    if (categoria.key === EMPTY_KEY) { callbacks.onQuickFilter({ property: cfg.x.prop, operator: 'is_empty' }); return; }
    if (op.includes('is_any_of')) callbacks.onQuickFilter({ property: cfg.x.prop, operator: 'is_any_of', value: [categoria.key] });
    else if (op.includes('contains') && (tipo === 'list' || cfg.x.prop === 'tags')) callbacks.onQuickFilter({ property: cfg.x.prop, operator: 'contains', value: categoria.key });
    else if (op.includes('equals')) callbacks.onQuickFilter({ property: cfg.x.prop, operator: 'equals', value: categoria.key });
  };

  switch (cfg.kind) {
    case 'number': renderNumberChart(area, data, { label: descricao(cfg, schema) }); break;
    case 'donut': renderDonutChart(area, data, { width, onPick }); break;
    case 'line': renderLineChart(area, data, { width, onPick }); renderLegend(quadro, data.series, cfg.style.legend); break;
    default: renderBarChart(area, data, { width, onPick }); renderLegend(quadro, data.series, cfg.style.legend);
  }
}
