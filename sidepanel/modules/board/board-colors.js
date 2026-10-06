// ── board-colors.js ──────────────────────────────────────────────────────────
// Paleta de cores dos cartões do Quadro Infinito: suporte às 7 cores temáticas
// do arco-íris (Red, Orange, Yellow, Green, Blue, Indigo, Violet) e cor hexadecimal livre.

export const NAMED_COLORS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']);

// Amostras (swatches) em OKLCH — as cores originais do projeto, convertidas de hex sem
// alterar o RGB (docs/PADRAO-DE-CORES-OKLCH.md). Servem sobre fundo claro e escuro.
// Os tons de fundo dos cartões ficam no CSS (board/style.css).
export const RAINBOW_COLORS = [
  { name: 'Padrão', value: 'default', class: 'is-default' },
  { name: 'Vermelho', value: 'red', bg: 'oklch(63.7% 0.208 25.3)' },
  { name: 'Laranja', value: 'orange', bg: 'oklch(70.49% 0.1867 47.6)' },
  { name: 'Amarelo', value: 'yellow', bg: 'oklch(79.52% 0.1617 86.05)' },
  { name: 'Verde', value: 'green', bg: 'oklch(72.3% 0.192 149.6)' },
  { name: 'Azul', value: 'blue', bg: 'oklch(62.3% 0.188 259.8)' },
  { name: 'Índigo', value: 'indigo', bg: 'oklch(58.5% 0.204 277.1)' },
  { name: 'Violeta', value: 'violet', bg: 'oklch(62.7% 0.233 303.9)' }
];

// Cores de seta: as mesmas amostras, como valor CSS (sem a opção "Padrão").
export const ARROW_COLORS = RAINBOW_COLORS.filter(c => c.bg).map(c => ({ name: c.name, value: c.bg }));
export function applyCardColor(el, color) {
  if (!color || color === 'default') {
    delete el.dataset.color;
    delete el.dataset.customColor;
    el.style.removeProperty('--card-custom-color');
    return;
  }
  if (NAMED_COLORS.has(color)) {
    el.dataset.color = color;
    delete el.dataset.customColor;
    el.style.removeProperty('--card-custom-color');
  } else {
    delete el.dataset.color;
    el.dataset.customColor = '';
    el.style.setProperty('--card-custom-color', color);
  }
}
