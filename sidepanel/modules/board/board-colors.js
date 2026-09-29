// ── board-colors.js ──────────────────────────────────────────────────────────
// Paleta de cores dos cartões do Quadro Infinito: suporte às 7 cores temáticas
// do arco-íris (Red, Orange, Yellow, Green, Blue, Indigo, Violet) e cor hexadecimal livre.

export const NAMED_COLORS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']);

export const RAINBOW_COLORS = [
  { name: 'Padrão', value: 'default', class: 'is-default' },
  { name: 'Vermelho', value: 'red', bg: '#ef4444' },
  { name: 'Laranja', value: 'orange', bg: '#f97316' },
  { name: 'Amarelo', value: 'yellow', bg: '#eab308' },
  { name: 'Verde', value: 'green', bg: '#22c55e' },
  { name: 'Azul', value: 'blue', bg: '#3b82f6' },
  { name: 'Índigo', value: 'indigo', bg: '#6366f1' },
  { name: 'Violeta', value: 'violet', bg: '#a855f7' }
];

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
