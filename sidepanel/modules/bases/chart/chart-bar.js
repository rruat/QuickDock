// ── chart-bar.js ────────────────────────────────────────────────────────────
// Barras (vertical/horizontal; agrupadas, empilhadas, 100%) e linha. Texto do eixo em
// <text> com classes CSS; nada de cor inline.

import { niceTicks, tickLabel, layoutBars, thinLabels } from './chart-layout.js';
import { svg, makeMark, serieClass, fmtNum } from './chart-svg.js';

const M = { top: 12, right: 16, bottom: 34, left: 48 };

export function renderBarChart(host, data, { width, onPick }) {
  const { cfg, categories, series, values } = data;
  const H = cfg.style.height;
  const horizontal = cfg.orientation === 'horizontal';
  const modo = cfg.stack;
  const { max: maxBruto, bars } = layoutBars(values, modo);
  const metaMax = cfg.style.goal && modo !== 'percent' ? Math.max(maxBruto, cfg.style.goal) : maxBruto;
  const { ticks, max } = niceTicks(metaMax);

  const left = horizontal ? Math.min(140, 24 + Math.max(0, ...categories.map(c => c.label.length)) * 6) : M.left;
  const W = Math.max(280, width);
  const pw = W - left - M.right;
  const ph = H - M.top - M.bottom;
  const root = svg('svg', { class: 'bch-svg', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'group', 'aria-label': 'Gráfico de barras' });

  // grade + eixo de valores
  for (const t of ticks) {
    const pos = horizontal ? left + (t / max) * pw : M.top + ph - (t / max) * ph;
    if (cfg.style.grid) root.appendChild(horizontal ? svg('line', { class: 'bch-grid', x1: pos, x2: pos, y1: M.top, y2: M.top + ph }) : svg('line', { class: 'bch-grid', x1: left, x2: left + pw, y1: pos, y2: pos }));
    root.appendChild(horizontal
      ? svg('text', { class: 'bch-tick', x: pos, y: H - 12, 'text-anchor': 'middle' }, modo === 'percent' ? `${t}%` : tickLabel(t))
      : svg('text', { class: 'bch-tick', x: left - 6, y: pos + 4, 'text-anchor': 'end' }, modo === 'percent' ? `${t}%` : tickLabel(t)));
  }

  const n = categories.length;
  const banda = (horizontal ? ph : pw) / Math.max(1, n);
  const visiveis = new Set(thinLabels(n, horizontal ? ph : pw, horizontal ? 16 : 64));
  categories.forEach((c, i) => {
    if (!visiveis.has(i)) return;
    const centro = (horizontal ? M.top : left) + banda * (i + 0.5);
    const rotulo = c.label.length > 14 && !horizontal ? `${c.label.slice(0, 13)}…` : c.label;
    root.appendChild(horizontal
      ? svg('text', { class: 'bch-cat', x: left - 6, y: centro + 4, 'text-anchor': 'end' }, rotulo)
      : svg('text', { class: 'bch-cat', x: centro, y: M.top + ph + 16, 'text-anchor': 'middle' }, rotulo));
  });
  root.appendChild(horizontal ? svg('line', { class: 'bch-axis', x1: left, x2: left, y1: M.top, y2: M.top + ph }) : svg('line', { class: 'bch-axis', x1: left, x2: left + pw, y1: M.top + ph, y2: M.top + ph }));

  // barras
  const pad = Math.min(8, banda * 0.15);
  for (const b of bars) {
    const c = categories[b.c];
    const larg = (banda - pad * 2) / b.bands;
    const ini = (horizontal ? M.top : left) + banda * b.c + pad + larg * b.band;
    const a = (b.from / max), z = (b.to / max);
    const r = horizontal
      ? svg('rect', { class: `bch-bar ${serieClass(b.s)}`, x: left + a * pw, y: ini, width: Math.max(0, (z - a) * pw), height: Math.max(1, larg - 1), rx: 2 })
      : svg('rect', { class: `bch-bar ${serieClass(b.s)}`, x: ini, y: M.top + ph - z * ph, width: Math.max(1, larg - 1), height: Math.max(0, (z - a) * ph), rx: 2 });
    const nome = series.length > 1 ? `${c.label} · ${series[b.s].label}` : c.label;
    makeMark(r, { label: `${nome}: ${modo === 'percent' ? `${fmtNum(b.to - b.from)}%` : fmtNum(b.v)}`, onActivate: () => onPick?.(c, series[b.s]) });
    root.appendChild(r);
    if (cfg.style.labels && b.v !== 0 && larg > 22 && banda > 26) {
      const meio = (a + z) / 2;
      root.appendChild(horizontal
        ? svg('text', { class: 'bch-val', x: left + z * pw + 4, y: ini + larg / 2 + 4 }, fmtNum(b.v))
        : svg('text', { class: 'bch-val', x: ini + larg / 2, y: M.top + ph - (modo === 'grouped' ? z : meio) * ph - (modo === 'grouped' ? 4 : -4), 'text-anchor': 'middle' }, fmtNum(b.v)));
    }
  }

  // linha de meta
  if (cfg.style.goal && modo !== 'percent') {
    const g = cfg.style.goal / max;
    root.appendChild(horizontal ? svg('line', { class: 'bch-goal', x1: left + g * pw, x2: left + g * pw, y1: M.top, y2: M.top + ph }) : svg('line', { class: 'bch-goal', x1: left, x2: left + pw, y1: M.top + ph - g * ph, y2: M.top + ph - g * ph }));
  }
  host.appendChild(root);
}

export function renderLineChart(host, data, { width, onPick }) {
  const { cfg, categories, series, values } = data;
  const H = cfg.style.height;
  const { ticks, max } = niceTicks(Math.max(cfg.style.goal || 0, ...values.flat(), 0));
  const W = Math.max(280, width);
  const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
  const root = svg('svg', { class: 'bch-svg', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'group', 'aria-label': 'Gráfico de linhas' });
  const n = categories.length;
  const x = i => M.left + (n <= 1 ? pw / 2 : (pw * i) / (n - 1));
  const y = v => M.top + ph - (v / max) * ph;

  for (const t of ticks) {
    if (cfg.style.grid) root.appendChild(svg('line', { class: 'bch-grid', x1: M.left, x2: M.left + pw, y1: y(t), y2: y(t) }));
    root.appendChild(svg('text', { class: 'bch-tick', x: M.left - 6, y: y(t) + 4, 'text-anchor': 'end' }, tickLabel(t)));
  }
  for (const i of thinLabels(n, pw, 64)) root.appendChild(svg('text', { class: 'bch-cat', x: x(i), y: M.top + ph + 16, 'text-anchor': 'middle' }, categories[i].label.length > 14 ? `${categories[i].label.slice(0, 13)}…` : categories[i].label));
  root.appendChild(svg('line', { class: 'bch-axis', x1: M.left, x2: M.left + pw, y1: M.top + ph, y2: M.top + ph }));

  series.forEach((s, si) => {
    const pts = values[si].map((v, i) => `${x(i)},${y(v)}`).join(' ');
    root.appendChild(svg('polyline', { class: `bch-line ${serieClass(si)}`, points: pts, fill: 'none' }));
    values[si].forEach((v, i) => {
      const dot = svg('circle', { class: `bch-dot ${serieClass(si)}`, cx: x(i), cy: y(v), r: 4 });
      makeMark(dot, { label: `${categories[i].label}${series.length > 1 ? ` · ${s.label}` : ''}: ${fmtNum(v)}`, onActivate: () => onPick?.(categories[i], s) });
      root.appendChild(dot);
    });
  });
  if (cfg.style.goal) root.appendChild(svg('line', { class: 'bch-goal', x1: M.left, x2: M.left + pw, y1: y(cfg.style.goal), y2: y(cfg.style.goal) }));
  host.appendChild(root);
}
