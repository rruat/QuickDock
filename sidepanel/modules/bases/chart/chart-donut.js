// ── chart-donut.js ──────────────────────────────────────────────────────────
// Pizza/donut e o gráfico "número" (valor único).

import { layoutDonut } from './chart-layout.js';
import { svg, makeMark, serieClass, fmtNum } from './chart-svg.js';

const ponto = (cx, cy, r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;

function arco(cx, cy, r0, r1, a0, a1) {
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  // fatia de 100% vira anel completo (um arco de 360° some no SVG)
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  return `M ${ponto(cx, cy, r1, a0)} A ${r1} ${r1} 0 ${grande} 1 ${ponto(cx, cy, r1, a1)} L ${ponto(cx, cy, r0, a1)} A ${r0} ${r0} 0 ${grande} 0 ${ponto(cx, cy, r0, a0)} Z`;
}

export function renderDonutChart(host, data, { width, onPick }) {
  const { cfg, categories, values, total } = data;
  // um valor por categoria (séries somadas)
  const valores = categories.map((_, i) => values.reduce((t, s) => t + (s[i] || 0), 0));
  const H = cfg.style.height;
  const lado = Math.min(H, Math.max(160, width));
  const R = lado / 2 - 6;
  const root = svg('svg', { class: 'bch-svg bch-svg-donut', viewBox: `0 0 ${lado} ${lado}`, width: lado, height: lado, role: 'group', 'aria-label': 'Gráfico de pizza' });
  layoutDonut(valores).forEach((f, i) => {
    if (f.frac <= 0) return;
    const p = svg('path', { class: `bch-slice ${serieClass(i)}`, d: arco(lado / 2, lado / 2, R * 0.58, R, f.a0, f.a1) });
    makeMark(p, { label: `${categories[i].label}: ${fmtNum(valores[i])} (${Math.round(f.frac * 100)}%)`, onActivate: () => onPick?.(categories[i], null) });
    root.appendChild(p);
  });
  root.appendChild(svg('text', { class: 'bch-center', x: lado / 2, y: lado / 2 + 6, 'text-anchor': 'middle' }, fmtNum(total)));
  host.appendChild(root);

  const l = document.createElement('ul');
  l.className = 'bch-legend bch-legend-right';
  categories.forEach((c, i) => {
    const li = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = `bch-chip ${serieClass(i)}`;
    li.append(chip, document.createTextNode(`${c.label} · ${fmtNum(valores[i])}`));
    l.appendChild(li);
  });
  if (cfg.style.legend !== 'none') host.appendChild(l);
}

export function renderNumberChart(host, data, { label }) {
  const caixa = document.createElement('div');
  caixa.className = 'bch-number';
  const v = document.createElement('div');
  v.className = 'bch-number-value';
  v.textContent = fmtNum(data.single);
  const l = document.createElement('div');
  l.className = 'bch-number-label';
  l.textContent = label;
  caixa.append(v, l);
  host.appendChild(caixa);
}
