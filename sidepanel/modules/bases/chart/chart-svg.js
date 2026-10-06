// ── chart-svg.js ────────────────────────────────────────────────────────────
// Peças SVG comuns (elemento, eixos, grade, legenda). Cores via classes/variáveis CSS (OKLCH).

const NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export const serieClass = i => `bch-s${i % 8}`;

/** Marca interativa: foco por teclado, rótulo para leitor de tela, clique e Enter/Espaço. */
export function makeMark(el, { label, onActivate }) {
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.appendChild(svg('title', {}, label));
  if (onActivate) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', onActivate);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } });
  }
  return el;
}

/** Legenda HTML (não SVG) — quebra de linha e leitura por teclado ficam por conta do navegador. */
export function renderLegend(host, series, posicao) {
  if (posicao === 'none' || series.length <= 1) return;
  const l = document.createElement('ul');
  l.className = `bch-legend bch-legend-${posicao}`;
  series.forEach((s, i) => {
    const li = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = `bch-chip ${serieClass(i)}`;
    li.append(chip, document.createTextNode(s.label));
    l.appendChild(li);
  });
  host.appendChild(l);
}

export const fmtNum = n => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—');
