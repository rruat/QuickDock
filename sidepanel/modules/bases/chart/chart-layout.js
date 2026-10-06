// ── chart-layout.js ─────────────────────────────────────────────────────────
// Escalas, ticks "bonitos", empilhamento e ângulos — PURO (sem DOM).

/** Passo "bonito" (1, 2, 5 × 10ⁿ) e ticks de 0 até ≥ max. */
export function niceTicks(max, alvo = 5) {
  if (!(max > 0)) return { ticks: [0, 1], max: 1, step: 1 };
  const bruto = max / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / mag;
  const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const topo = Math.ceil(max / passo) * passo;
  const ticks = [];
  for (let v = 0; v <= topo + passo / 1e6; v += passo) ticks.push(Math.round(v / passo) * passo);
  return { ticks, max: topo, step: passo };
}

/** Rótulo curto de número no eixo (1,2 mil · 3,4 mi). */
export function tickLabel(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e4) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Posições das barras. values[s][c]; modo: grouped | stacked | percent.
 * @returns {{ max:number, bars: Array<{ s:number, c:number, v:number, from:number, to:number, band:number, bands:number }> }}
 * `from/to` = extremos no eixo de valor; `band/bands` = posição da barra dentro do grupo (grouped).
 */
export function layoutBars(values, modo = 'grouped') {
  const nS = values.length;
  const nC = nS ? values[0].length : 0;
  const bars = [];
  let max = 0;
  for (let c = 0; c < nC; c++) {
    let acc = 0;
    const total = values.reduce((t, ser) => t + Math.max(0, ser[c]), 0);
    for (let s = 0; s < nS; s++) {
      const v = values[s][c];
      if (modo === 'grouped') {
        bars.push({ s, c, v, from: 0, to: v, band: s, bands: nS });
        max = Math.max(max, v);
      } else {
        const parte = modo === 'percent' ? (total ? (Math.max(0, v) / total) * 100 : 0) : Math.max(0, v);
        bars.push({ s, c, v, from: acc, to: acc + parte, band: 0, bands: 1 });
        acc += parte;
        max = Math.max(max, acc);
      }
    }
  }
  return { max: modo === 'percent' ? 100 : max, bars };
}

/** Fatias de pizza/donut: ângulos em radianos a partir do topo (−π/2), sentido horário. */
export function layoutDonut(valores) {
  const total = valores.reduce((a, b) => a + Math.max(0, b), 0);
  let ang = -Math.PI / 2;
  return valores.map(v => {
    const frac = total ? Math.max(0, v) / total : 0;
    const a0 = ang, a1 = ang + frac * Math.PI * 2;
    ang = a1;
    return { a0, a1, frac };
  });
}

/** Posição (px) de um ponto de linha: índice → x numa banda; valor → y invertido. */
export const scaleLinear = (v, max, tamanho) => (max > 0 ? (v / max) * tamanho : 0);

/** Tira rótulos que colidiriam: devolve os índices a mostrar dado o espaço por rótulo. */
export function thinLabels(n, larguraTotal, larguraRotulo) {
  if (n <= 0) return [];
  const cabem = Math.max(1, Math.floor(larguraTotal / Math.max(1, larguraRotulo)));
  const passo = Math.max(1, Math.ceil(n / cabem));
  const idx = [];
  for (let i = 0; i < n; i += passo) idx.push(i);
  return idx;
}
