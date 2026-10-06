// ── board-beautify.js ───────────────────────────────────────────────────────
// Auto-organização de fluxos ("Beautify"): recebe cartões + setas e devolve as
// novas posições, em camadas, na direção pedida. Função pura — não toca no DOM
// nem no estado do quadro; quem chama aplica o resultado.
//
// Método (versão enxuta de Sugiyama): 1) quebra ciclos ignorando arestas de
// retorno, 2) camadas por caminho mais longo, 3) ordem dentro da camada por
// baricentro (partindo da ordem visual atual, pra preservar a intenção de
// quem desenhou), 4) coordenadas puxando cada nó pra perto dos vizinhos sem
// sobrepor, 5) cartões soltos (sem setas) ficam numa grade depois do fluxo.

const GAP_LAYER = 90;
const GAP_NODE = 48;
const SNAP = 10;

const snap = v => Math.round(v / SNAP) * SNAP;

/**
 * @param {Array<{id:string,x:number,y:number,w:number,h:number,type?:string}>} cards
 * @param {Array<{id:string,from:string,to:string}>} arrows
 * @param {'vertical'|'horizontal'} direction  vertical: fluxo de cima pra baixo
 * @returns {{ positions: Map<string,{x:number,y:number}>,
 *             sides: Map<string,{fromSide:string,toSide:string}> }}
 */
export function computeBeautifyLayout(cards, arrows, direction = 'vertical') {
  const vertical = direction !== 'horizontal';
  const nodes = cards.filter(c => c && c.type !== 'group');
  const byId = new Map(nodes.map(n => [n.id, n]));

  // tamanho no eixo da camada (along) e no eixo de dentro da camada (across)
  const along = n => (vertical ? n.h : n.w);
  const across = n => (vertical ? n.w : n.h);
  const crossCenter = n => (vertical ? n.x + n.w / 2 : n.y + n.h / 2);

  // Arestas válidas, sem duplicata nem laço
  const edges = [];
  const seen = new Set();
  for (const a of arrows) {
    if (!byId.has(a.from) || !byId.has(a.to) || a.from === a.to) continue;
    const key = `${a.from}>${a.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: a.id, from: a.from, to: a.to, back: false });
  }

  const positions = new Map();
  const sides = new Map();
  if (nodes.length === 0) return { positions, sides };

  const touched = new Set();
  for (const e of edges) { touched.add(e.from); touched.add(e.to); }
  const flowNodes = nodes.filter(n => touched.has(n.id));
  const loose = nodes.filter(n => !touched.has(n.id));

  // ── 1) Ciclos: DFS marcando arestas de retorno ────────────────────────────
  const out = new Map(flowNodes.map(n => [n.id, []]));
  for (const e of edges) out.get(e.from).push(e);
  const state = new Map();
  const visit = id => {
    state.set(id, 1);
    for (const e of out.get(id)) {
      const s = state.get(e.to) || 0;
      if (s === 1) e.back = true;
      else if (s === 0) visit(e.to);
    }
    state.set(id, 2);
  };
  const inDeg = new Map(flowNodes.map(n => [n.id, 0]));
  for (const e of edges) inDeg.set(e.to, inDeg.get(e.to) + 1);
  // raízes primeiro (sem entrada), na ordem visual; depois o que sobrou
  const visualOrder = [...flowNodes].sort((a, b) => crossCenter(a) - crossCenter(b));
  const roots = visualOrder.filter(n => inDeg.get(n.id) === 0);
  for (const n of [...roots, ...visualOrder]) if (!state.get(n.id)) visit(n.id);

  const dag = edges.filter(e => !e.back);
  const preds = new Map(flowNodes.map(n => [n.id, []]));
  const succs = new Map(flowNodes.map(n => [n.id, []]));
  for (const e of dag) { preds.get(e.to).push(e.from); succs.get(e.from).push(e.to); }

  // ── 2) Camadas por caminho mais longo (Kahn) ──────────────────────────────
  const layer = new Map(flowNodes.map(n => [n.id, 0]));
  const pending = new Map(flowNodes.map(n => [n.id, preds.get(n.id).length]));
  const queue = flowNodes.filter(n => pending.get(n.id) === 0).map(n => n.id);
  const topo = [];
  while (queue.length) {
    const id = queue.shift();
    topo.push(id);
    for (const to of succs.get(id)) {
      layer.set(to, Math.max(layer.get(to), layer.get(id) + 1));
      pending.set(to, pending.get(to) - 1);
      if (pending.get(to) === 0) queue.push(to);
    }
  }
  // fontes sobem até colar no primeiro filho — evita fio longo saindo do topo
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i];
    if (preds.get(id).length === 0 && succs.get(id).length > 0) {
      layer.set(id, Math.min(...succs.get(id).map(s => layer.get(s))) - 1);
    }
  }
  const minLayer = Math.min(...flowNodes.map(n => layer.get(n.id)));
  for (const n of flowNodes) layer.set(n.id, layer.get(n.id) - minLayer);

  const layers = [];
  for (const n of visualOrder) {
    const l = layer.get(n.id);
    (layers[l] ||= []).push(n.id);
  }
  for (let l = 0; l < layers.length; l++) layers[l] ||= [];

  // ── 3) Ordem dentro da camada: baricentro ─────────────────────────────────
  const indexIn = new Map();
  const reindex = () => layers.forEach(ids => ids.forEach((id, i) => indexIn.set(id, i)));
  reindex();
  const sweep = (from, to, step, neighbors) => {
    for (let l = from; l !== to; l += step) {
      const bary = new Map();
      for (const id of layers[l]) {
        const ns = neighbors.get(id);
        bary.set(id, ns.length ? ns.reduce((s, x) => s + indexIn.get(x), 0) / ns.length : indexIn.get(id));
      }
      layers[l].sort((a, b) => bary.get(a) - bary.get(b));
      layers[l].forEach((id, i) => indexIn.set(id, i));
    }
  };
  for (let i = 0; i < 4; i++) {
    sweep(1, layers.length, 1, preds);
    sweep(layers.length - 2, -1, -1, succs);
  }

  // ── 4) Coordenadas ────────────────────────────────────────────────────────
  const pos = new Map(); // id → início no eixo "across"
  for (const ids of layers) {
    const total = ids.reduce((s, id) => s + across(byId.get(id)), 0) + GAP_NODE * Math.max(0, ids.length - 1);
    let cursor = -total / 2;
    for (const id of ids) {
      pos.set(id, cursor);
      cursor += across(byId.get(id)) + GAP_NODE;
    }
  }
  const centerOf = id => pos.get(id) + across(byId.get(id)) / 2;
  const relax = (l, neighbors) => {
    const ids = layers[l];
    const want = ids.map(id => {
      const ns = neighbors.get(id);
      return ns.length ? ns.reduce((s, x) => s + centerOf(x), 0) / ns.length : centerOf(id);
    });
    // empurra pra direita respeitando a ordem e o espaçamento…
    const placed = [];
    let prevEnd = -Infinity;
    ids.forEach((id, i) => {
      const size = across(byId.get(id));
      const start = Math.max(want[i] - size / 2, prevEnd + GAP_NODE);
      placed.push(start);
      prevEnd = start + size;
    });
    // …e recentra a camada pra o empurrão não derivar tudo pra um lado
    const drift = ids.reduce((s, id, i) => s + (want[i] - (placed[i] + across(byId.get(id)) / 2)), 0) / ids.length;
    ids.forEach((id, i) => pos.set(id, placed[i] + drift));
  };
  for (let i = 0; i < 6; i++) {
    for (let l = 1; l < layers.length; l++) relax(l, preds);
    for (let l = layers.length - 2; l >= 0; l--) relax(l, succs);
  }

  // eixo da camada: espessura = maior nó, nós centralizados na faixa
  const thickness = layers.map(ids => Math.max(0, ...ids.map(id => along(byId.get(id)))));
  const layerStart = [];
  let acc = 0;
  thickness.forEach((t, l) => { layerStart[l] = acc; acc += t + GAP_LAYER; });
  const flowEnd = acc - GAP_LAYER;

  const raw = new Map(); // id → {x,y} sem âncora
  layers.forEach((ids, l) => {
    for (const id of ids) {
      const n = byId.get(id);
      const a = layerStart[l] + (thickness[l] - along(n)) / 2;
      const c = pos.get(id);
      raw.set(id, vertical ? { x: c, y: a } : { x: a, y: c });
    }
  });

  // ── 5) Cartões soltos: grade depois do fluxo ──────────────────────────────
  if (loose.length) {
    let minC = Infinity, maxC = -Infinity;
    for (const [id, p] of raw) {
      const n = byId.get(id);
      const c = vertical ? p.x : p.y;
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c + across(n));
    }
    const span = Math.max(maxC - minC, 720);
    let cursorC = Number.isFinite(minC) ? minC : 0;
    let cursorA = Number.isFinite(flowEnd) && flowEnd > 0 ? flowEnd + GAP_LAYER : 0;
    let rowThickness = 0;
    const start = cursorC;
    for (const n of loose) {
      if (cursorC > start && cursorC + across(n) > start + span) {
        cursorC = start;
        cursorA += rowThickness + GAP_NODE;
        rowThickness = 0;
      }
      raw.set(n.id, vertical ? { x: cursorC, y: cursorA } : { x: cursorA, y: cursorC });
      cursorC += across(n) + GAP_NODE;
      rowThickness = Math.max(rowThickness, along(n));
    }
  }

  // ── 6) Âncora: mantém o canto superior esquerdo de onde o fluxo já estava ─
  let rawMinX = Infinity, rawMinY = Infinity;
  for (const p of raw.values()) { rawMinX = Math.min(rawMinX, p.x); rawMinY = Math.min(rawMinY, p.y); }
  const origMinX = Math.min(...nodes.map(n => n.x));
  const origMinY = Math.min(...nodes.map(n => n.y));
  for (const [id, p] of raw) {
    positions.set(id, { x: snap(origMinX + p.x - rawMinX), y: snap(origMinY + p.y - rawMinY) });
  }

  // ── 7) Lados das setas: entra e sai pelo eixo do fluxo ────────────────────
  const [fwdFrom, fwdTo] = vertical ? ['bottom', 'top'] : ['right', 'left'];
  const backSide = vertical ? 'right' : 'bottom';
  for (const e of edges) {
    sides.set(e.id, e.back
      ? { fromSide: backSide, toSide: backSide }
      : { fromSide: fwdFrom, toSide: fwdTo });
  }

  return { positions, sides };
}
