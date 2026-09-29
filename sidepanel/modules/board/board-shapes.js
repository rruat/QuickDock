// ── board-shapes.js ──────────────────────────────────────────────────────────
// Formatos e representações vetoriais de formas geométricas de fluxogramas
// (Processo, Decisão, Início/Fim, Dados E/S, Documento, Subprocesso e Banco).

export const FLOWCHART_SHAPES = [
  { id: 'process',    label: 'Processo',       desc: 'Ação ou etapa padrão (Retângulo)', icon: 'crop_square' },
  { id: 'decision',   label: 'Decisão',        desc: 'Condição ou ramificação Sim/Não (Losango)', icon: 'diamond' },
  { id: 'terminal',   label: 'Início / Fim',   desc: 'Ponto de início ou término do fluxo (Pílula)', icon: 'stadium' },
  { id: 'data',       label: 'Entrada / Saída', desc: 'Dados recebidos ou gerados (Paralelogramo)', icon: 'change_history' },
  { id: 'document',   label: 'Documento',      desc: 'Relatório ou arquivo físico/digital', icon: 'description' },
  { id: 'subprocess', label: 'Subprocesso',    desc: 'Fluxo predefinido ou rotina aninhada', icon: 'view_agenda' },
  { id: 'database',   label: 'Dados',          desc: 'Banco de dados ou armazenamento', icon: 'database' }
];

export function isFlowchartShape(shape) {
  return FLOWCHART_SHAPES.some(s => s.id === shape);
}

export function getShapeSvgBackgroundHtml(shape) {
  if (!shape || shape === 'process' || shape === 'rectangle') return '';
  switch (shape) {
    case 'decision':
      return `<svg class="board-card-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon class="board-card-shape-path" points="50,2 98,50 50,98 2,50" />
      </svg>`;
    case 'terminal':
      return `<svg class="board-card-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect class="board-card-shape-path" x="2" y="2" width="96" height="96" rx="48" ry="48" />
      </svg>`;
    case 'data':
      return `<svg class="board-card-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon class="board-card-shape-path" points="18,2 98,2 82,98 2,98" />
      </svg>`;
    case 'document':
      return `<svg class="board-card-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path class="board-card-shape-path" d="M 2,2 L 98,2 L 98,82 C 74,96 50,72 26,86 C 14,92 2,86 2,86 Z" />
      </svg>`;
    case 'subprocess':
      return `<svg class="board-card-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect class="board-card-shape-path" x="2" y="2" width="96" height="96" rx="4" />
        <line class="board-card-shape-line" x1="14" y1="2" x2="14" y2="98" />
        <line class="board-card-shape-line" x1="86" y1="2" x2="86" y2="98" />
      </svg>`;
    case 'database':
      return `<svg class="board-card-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path class="board-card-shape-path" d="M 2,16 A 48 14 0 0 0 98,16 V 84 A 48 14 0 0 1 2,84 Z" />
        <ellipse class="board-card-shape-line" cx="50" cy="16" rx="48" ry="14" />
      </svg>`;
    default:
      return '';
  }
}

export const generateShapeSvg = getShapeSvgBackgroundHtml;
