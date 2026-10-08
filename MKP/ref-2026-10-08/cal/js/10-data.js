// Notas e quadros fictícios, modelos de quadro e miniatura
// ══ NOTAS FAKES (SÓ MODELO) + VIEWS DE DADOS ══
// Toda nota aparece no calendário pela data de criação; tabela e galeria são
// outras formas de ver as mesmas notas (conceito de Bases).
const GROUP_LABEL = { projeto: 'Projeto', reuniao: 'Reunião', ideia: 'Ideia', pessoal: 'Pessoal' };
const GROUP_ICON = { projeto: 'rocket_launch', reuniao: 'groups', ideia: 'lightbulb', pessoal: 'person' };
const FAKE_NOTES = [
  { day: 1,  time: '09:00', group: 'projeto', title: 'Revisar backlog de Bases',       text: 'Priorizar as views pendentes: tabela, galeria e linha do tempo.' },
  { day: 1,  time: '15:00', group: 'pessoal', title: 'Lista de compras do escritório',  text: 'Café, papel A4, cabos USB-C e um suporte de monitor.' },
  { day: 2,  time: '14:00', group: 'ideia',   title: 'Ideia: calendário como Base',     text: 'Toda nota aparece pela data de criação; outra data vira propriedade.' },
  { day: 3,  time: '11:00', group: 'pessoal', title: 'Receitas para o fim de semana',   text: 'Testar o risoto de limão siciliano e o pão de fermentação longa.' },
  { day: 5,  time: '10:00', group: 'projeto', title: 'Planejar sprint',                 text: 'Definir metas da semana: aside separada das views e grafo de conexões.' },
  { day: 5,  time: '15:00', group: 'reuniao', title: '1:1 com Marina',                  text: 'Feedback do mockup, dúvidas sobre o fluxo mobile.' },
  { day: 6,  time: '16:00', group: 'ideia',   title: 'Rascunho do PRD Constelações',    text: 'Constelações vira aside que abre do calendário e da nota.' },
  { day: 7,  time: '10:00', group: 'reuniao', title: 'Nota do dia 7',                   text: 'Reunião de alinhamento QuickDock Spatial Shell • Revisão das views.' },
  { day: 7,  time: '14:00', group: 'reuniao', title: 'Reunião de alinhamento',          text: 'Alinhar escopo de Bases com o time e revisar o cronograma.' },
  { day: 7,  time: '17:00', group: 'ideia',   title: 'Ideias de ícones para as views',  text: 'Testar hub, table_rows e grid_view como ícones padrão.' },
  { day: 8,  time: '16:00', group: 'reuniao', title: 'Retro da semana',                 text: 'O que funcionou, o que travou e o que muda na próxima.' },
  { day: 9,  time: '09:00', group: 'projeto', title: 'Checklist de release',            text: 'Bumpar CACHE_NAME do sw.js e rodar node test/run.mjs.' },
  { day: 12, time: '18:00', group: 'pessoal', title: 'Estudar OKLCH',                   text: 'Ajustar a paleta: diferença de L ≥ 55 entre fundo e texto.' },
  { day: 14, time: '11:00', group: 'reuniao', title: 'Entrevista com designer',         text: 'Perguntar sobre sistemas de design e prototipação no mobile.' },
  { day: 15, time: '10:00', group: 'projeto', title: 'Roteiro do vídeo demo',           text: 'Abrir o calendário, expandir uma célula e mostrar o grafo.' },
  { day: 19, time: '15:00', group: 'projeto', title: 'Mockup da galeria',               text: 'Cartões com capa, prévia de três linhas e grupo da nota.' },
  { day: 20, time: '09:00', group: 'ideia',   title: 'Ideia: widgets de nota',          text: 'Mini-calendário e contagem de notas por grupo no dashboard.' },
  { day: 22, time: '10:00', group: 'reuniao', title: 'Planejamento do Q4',              text: 'Metas de trimestre, riscos e dependências entre os módulos.' },
  { day: 26, time: '16:00', group: 'projeto', title: 'Release v0.9',                    text: 'Publicar a versão com Bases e o novo calendário.' },
  { day: 28, time: '13:00', group: 'pessoal', title: 'Notas da conferência',            text: 'Três ideias de UX para espaços de trabalho espaciais.' }
];

// Quadros (espaço infinito): são JSON com data, exatamente como as notas
FAKE_NOTES.push(
  { kind: 'quadro', tpl: 'mapa',  day: 2,  time: '10:00', group: 'projeto', title: 'Mapa do produto',        text: 'Visão geral de notas, bases, quadros e constelações.' },
  { kind: 'quadro', tpl: 'fluxo', day: 6,  time: '14:00', group: 'projeto', title: 'Fluxo de onboarding',    text: 'Do primeiro acesso até a primeira nota compartilhada.' },
  { kind: 'quadro', tpl: 'fluxo', day: 7,  time: '16:00', group: 'reuniao', title: 'Roadmap do Q4',          text: 'Entregas do trimestre e dependências entre os módulos.' },
  { kind: 'quadro', tpl: 'mapa',  day: 9,  time: '11:00', group: 'ideia',   title: 'Brainstorm de ícones',   text: 'Referências e variações para os ícones das views.' },
  { kind: 'quadro', tpl: 'story', day: 13, time: '15:00', group: 'projeto', title: 'Storyboard do vídeo',    text: 'Cenas do vídeo demo do calendário com Bases.' },
  { kind: 'quadro', tpl: 'mapa',  day: 16, time: '10:00', group: 'pessoal', title: 'Planejamento da viagem', text: 'Roteiro, reservas e ideias de passeios.' },
  { kind: 'quadro', tpl: 'fluxo', day: 21, time: '14:00', group: 'ideia',   title: 'Arquitetura Spatial Shell', text: 'Asides separadas das views e como cada uma abre.' },
  { kind: 'quadro', tpl: 'mapa',  day: 23, time: '09:00', group: 'reuniao', title: 'Mapa de OKRs',           text: 'Objetivos e resultados-chave do trimestre.' },
  { kind: 'quadro', tpl: 'story', day: 27, time: '15:00', group: 'projeto', title: 'Retro visual',           text: 'Antes e depois das telas redesenhadas.' }
);
FAKE_NOTES.forEach((n, i) => { n.id = String(i); n.kind = n.kind || 'nota'; });
const ITEM_BY_ID = Object.fromEntries(FAKE_NOTES.map(n => [n.id, n]));

// Pasta de cada item (usada pelos filtros das views)
const FOLDER_BY_GROUP = { projeto: 'Produto', reuniao: 'Reuniões', ideia: 'Ideias', pessoal: 'Pessoal' };
const DESIGN_TITLES = ['Brainstorm de ícones', 'Mockup da galeria', 'Ideias de ícones para as views', 'Retro visual', 'Storyboard do vídeo'];
FAKE_NOTES.forEach(n => { n.folder = DESIGN_TITLES.includes(n.title) ? 'Design' : FOLDER_BY_GROUP[n.group]; });
const FOLDERS = [...new Set(FAKE_NOTES.map(n => n.folder))];

// Conteúdo fictício de cada tipo de quadro: [x, y, texto] + conexões [de, para]
const BOARD_TPL = {
  mapa:  { cards: [[260, 170, 'Produto'], [30, 30, 'Notas'], [490, 30, 'Bases'], [30, 310, 'Quadros'], [490, 310, 'Constelações'], [260, 350, 'Calendário']],
           edges: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] },
  fluxo: { cards: [[20, 170, 'Ideia'], [230, 170, 'Rascunho'], [440, 50, 'Revisão'], [440, 290, 'Protótipo'], [650, 170, 'Entrega']],
           edges: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4]] },
  story: { cards: [[20, 30, 'Cena 1'], [250, 30, 'Cena 2'], [20, 230, 'Cena 3'], [250, 230, 'Cena 4'], [480, 130, 'Fim']],
           edges: [[0, 1], [1, 2], [2, 3], [3, 4]] }
};
const GROUP_ORDER = ['projeto', 'reuniao', 'ideia', 'pessoal'];
const CARD_W = 150, CARD_H = 60;
const boardLayout = item => {
  const tpl = BOARD_TPL[item.tpl];
  const base = GROUP_ORDER.indexOf(item.group);
  return {
    cards: tpl.cards.map(([x, y, t], i) => ({ x, y, t, group: GROUP_ORDER[(base + i) % GROUP_ORDER.length] })),
    edges: tpl.edges
  };
};

// Miniatura SVG do quadro (galeria)
function boardThumb(item) {
  const L = boardLayout(item);
  const minX = Math.min(...L.cards.map(c => c.x)) - 20, minY = Math.min(...L.cards.map(c => c.y)) - 20;
  const maxX = Math.max(...L.cards.map(c => c.x + CARD_W)) + 20, maxY = Math.max(...L.cards.map(c => c.y + CARD_H)) + 20;
  const lines = L.edges.map(([a, b]) => {
    const A = L.cards[a], B = L.cards[b];
    return `<line x1="${A.x + CARD_W / 2}" y1="${A.y + CARD_H / 2}" x2="${B.x + CARD_W / 2}" y2="${B.y + CARD_H / 2}"/>`;
  }).join('');
  const rects = L.cards.map(c => `<rect x="${c.x}" y="${c.y}" width="${CARD_W}" height="${CARD_H}" rx="14" style="--tc: var(--graph-${c.group === 'pessoal' ? 'pessoa' : c.group})"/>`).join('');
  return `<svg class="board-thumb" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${lines}${rects}</svg>`;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Só os itens que passam nos filtros da view ativa (ver 11-views-model.js)
const notesOfDay = d => visibleItems().filter(n => n.day === Number(d)).sort((a, b) => a.time.localeCompare(b.time));
const noteDateLabel = n => `${WEEKDAYS[(n.day + 3) % 7]}, ${n.day} de Outubro • ${n.time}`; // 1/out/2026 = quinta


