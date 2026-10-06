// ── section-dashboard.js ────────────────────────────────────────────────────
// Configuração do Dashboard: colunas e lista de widgets (cada um = outra view da Base).

import { VIEW_TYPES } from '../config/view-model.js';
import { resolveDashboardConfig } from '../bases-dashboard-view.js';
import { section, row, el, selectControl } from './controls.js';

export function dashboardSections({ view, views, memoria, patch }) {
  if (view.type !== 'dashboard') return [];
  const cfg = resolveDashboardConfig(view);
  const candidatas = views.filter(v => v.id !== view.id && v.type !== 'dashboard');
  const nomeDe = id => candidatas.find(v => v.id === id)?.name || `${id} (não encontrada)`;
  const grava = lista => patch({ widgets: lista });

  const s = section('Widgets', { chave: 'dash', memoria, dica: 'Cada widget mostra outra view desta Base, com os filtros e a ordenação dela.' });
  s.body.appendChild(row('Colunas', id => selectControl({ id, value: cfg.columns, options: [2, 3, 4].map(n => ({ value: n, label: String(n) })), onChange: v => patch({ layout: { columns: Number(v) } }) })));

  cfg.widgets.forEach((w, i) => {
    const caixa = el('div', 'bset-filter');
    const topo = el('div', 'bset-rule');
    topo.appendChild(selectControl({ value: w.view, ariaLabel: 'View do widget',
      options: candidatas.map(v => ({ value: v.id, label: `${VIEW_TYPES[v.type]?.label || v.type} · ${v.name}` })).concat(candidatas.some(v => v.id === w.view) ? [] : [{ value: w.view, label: nomeDe(w.view) }]),
      onChange: v => grava(cfg.widgets.map((x, j) => (j === i ? { ...x, view: v } : x))) }));
    const sobe = el('button', 'bset-icon-btn', '↑'); sobe.type = 'button'; sobe.title = 'Mover para cima'; sobe.setAttribute('aria-label', 'Mover widget para cima'); sobe.disabled = i === 0;
    sobe.addEventListener('click', () => { const l = [...cfg.widgets]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; grava(l); });
    const rm = el('button', 'bset-icon-btn', '✕'); rm.type = 'button'; rm.title = 'Remover widget'; rm.setAttribute('aria-label', 'Remover widget');
    rm.addEventListener('click', () => grava(cfg.widgets.filter((_, j) => j !== i)));
    topo.append(sobe, rm);
    caixa.appendChild(topo);
    const baixo = el('div', 'bset-rule');
    baixo.appendChild(selectControl({ value: w.span, ariaLabel: 'Largura', options: Array.from({ length: cfg.columns }, (_, k) => ({ value: k + 1, label: k === 0 ? '1 coluna' : `${k + 1} colunas` })), onChange: v => grava(cfg.widgets.map((x, j) => (j === i ? { ...x, span: Number(v) } : x))) }));
    baixo.appendChild(selectControl({ value: w.height, ariaLabel: 'Altura máxima', options: [240, 320, 420, 520].map(h => ({ value: h, label: `${h}px` })), onChange: v => grava(cfg.widgets.map((x, j) => (j === i ? { ...x, height: Number(v) } : x))) }));
    caixa.appendChild(baixo);
    s.body.appendChild(caixa);
  });
  if (!cfg.widgets.length) s.body.appendChild(el('p', 'bset-hint', 'Nenhum widget.'));

  const add = el('button', 'bset-btn', '+ Widget'); add.type = 'button';
  add.disabled = !candidatas.length;
  add.title = candidatas.length ? '' : 'Crie outras views (gráfico, lista…) para usar como widgets';
  add.addEventListener('click', () => grava([...cfg.widgets, { view: candidatas[0].id, span: 1, height: 320 }]));
  s.body.appendChild(add);
  return [s.root];
}
