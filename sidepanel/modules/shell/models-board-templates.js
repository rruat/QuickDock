// ── models-board-templates.js ───────────────────────────────────────────────
// Quadros MODELO do painel Modelos (padrão do mockup): mapa mental, fluxo e storyboard.
// Dado puro — cartões e setas já posicionados, no mesmo formato do board-engine. As cores são
// as nomeadas do quadro (board-colors.js), que já têm par claro/escuro.

export const BOARD_TEMPLATES = [
  {
    id: 'mapa-mental', name: 'Mapa mental', icon: 'account_tree', desc: 'Tema central com ramos',
    cards: [
      { id: 'c1', x: 0, y: 0, w: 220, h: 100, text: '🧠 Tema central\nEscreva a ideia principal.', color: 'yellow' },
      { id: 'c2', x: -320, y: -170, w: 200, h: 90, text: 'Ramo 1', color: 'blue' },
      { id: 'c3', x: 340, y: -170, w: 200, h: 90, text: 'Ramo 2', color: 'green' },
      { id: 'c4', x: -320, y: 170, w: 200, h: 90, text: 'Ramo 3', color: 'orange' },
      { id: 'c5', x: 340, y: 170, w: 200, h: 90, text: 'Ramo 4', color: 'violet' },
    ],
    links: [['c1', 'c2'], ['c1', 'c3'], ['c1', 'c4'], ['c1', 'c5']],
  },
  {
    id: 'fluxo', name: 'Fluxo', icon: 'account_tree', desc: 'Etapas ligadas em sequência',
    cards: [
      { id: 'c1', x: 0, y: 0, w: 200, h: 90, text: '▶ Início', color: 'green' },
      { id: 'c2', x: 280, y: 0, w: 200, h: 90, text: 'Etapa 1', color: 'blue' },
      { id: 'c3', x: 560, y: 0, w: 200, h: 90, text: 'Decisão?', color: 'yellow' },
      { id: 'c4', x: 840, y: -90, w: 200, h: 90, text: 'Sim → Etapa 2', color: 'blue' },
      { id: 'c5', x: 840, y: 90, w: 200, h: 90, text: 'Não → Revisar', color: 'red' },
    ],
    links: [['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['c3', 'c5']],
  },
  {
    id: 'storyboard', name: 'Storyboard', icon: 'view_column', desc: 'Cenas lado a lado',
    cards: [
      { id: 'c1', x: 0, y: 0, w: 240, h: 160, text: '🎬 Cena 1\nDescreva o que acontece.', color: 'indigo' },
      { id: 'c2', x: 300, y: 0, w: 240, h: 160, text: '🎬 Cena 2', color: 'indigo' },
      { id: 'c3', x: 600, y: 0, w: 240, h: 160, text: '🎬 Cena 3', color: 'indigo' },
      { id: 'c4', x: 900, y: 0, w: 240, h: 160, text: '🎬 Cena 4', color: 'indigo' },
    ],
    links: [['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4']],
  },
];

/** Cartões e setas de um modelo no formato do quadro (setas com ids próprios). */
export function buildBoardFromTemplate(tpl) {
  const cards = tpl.cards.map(c => ({ ...c }));
  const arrows = (tpl.links || []).map(([from, to], i) => ({
    id: `a_tpl_${i}`, from, to, style: 'solid', strokeStyle: 'solid',
    fromSide: null, toSide: null, direction: 'forward', lineStyle: 'straight', color: null, label: null,
  }));
  return { cards, arrows };
}
