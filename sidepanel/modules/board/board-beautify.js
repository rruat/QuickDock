// ── board-beautify.js ───────────────────────────────────────────────────────
// Auto-organização de fluxos ("Beautify"): recebe cartões + setas e devolve as
// novas posições na direção pedida — vertical, horizontal ou radial
// (multidirecional, espalhando a partir da origem). Função pura — não toca no
// DOM nem no estado do quadro; quem chama aplica o resultado.
//
// Método (versão enxuta de Sugiyama): 1) quebra ciclos ignorando arestas de
// retorno, 2) camadas por caminho mais longo, 3) ordem dentro da camada por
// baricentro (partindo da ordem visual atual, pra preservar a intenção de
// quem desenhou), 4) coordenadas — linear (puxando cada nó pra perto dos
// vizinhos sem sobrepor) ou radial (camadas viram anéis concêntricos, cada nó
// no ângulo médio dos pais), 5) cartões soltos (sem setas) ficam numa grade
// depois do fluxo.

const GAP_LAYER = 90;
const GAP_NODE = 48;
const SNAP = 10;

const snap = v => Math.round(v / SNAP) * SNAP;

/**
 * @param {Array<{id:string,x:number,y:number,w:number,h:number,type?:string}>} cards
 * @param {Array<{id:string,from:string,to:string}>} arrows
 * @param {'vertical'|'horizontal'|'radial'} direction
 * @returns {{ positions: Map<string,{x:number,y:number}>,
 *             sides: Map<string,{fromSide:string|null,toSide:string|null}> }}
 */
export function computeBeautifyLayout(cards, arrows, direction = 'vertical') {
  const radial = direction === 'radial';
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
  layers.forEach(ids => ids.forEach((id, i) => indexIn.set(id, i)));
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

  // ── 4) Coordenadas (canto superior esquerdo, sem âncora) ──────────────────
  let raw;
  if (radial) {
    const rl = radialLayers(flowNodes, edges, byId);
    raw = placeRadial(rl.layers, byId, rl.preds);
  } else {
    raw = placeLinear(layers, byId, preds, succs, vertical, along, across);
  }

  // ── 5) Cartões soltos: grade depois do fluxo (abaixo, ou à direita no horizontal) ─
  if (loose.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [id, p] of raw) {
      const n = byId.get(id);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + n.w); maxY = Math.max(maxY, p.y + n.h);
    }
    const has = Number.isFinite(minX);
    if (!has) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
    const flowRight = !vertical && !radial; // horizontal: coluna nova à direita
    const startC = flowRight ? minY : minX;
    const span = Math.max((flowRight ? maxY - minY : maxX - minX), 720);
    let cursorC = startC;
    let cursorA = has ? (flowRight ? maxX : maxY) + GAP_LAYER : 0;
    let rowThickness = 0;
    const acr = n => (flowRight ? n.h : n.w);
    const alg = n => (flowRight ? n.w : n.h);
    for (const n of loose) {
      if (cursorC > startC && cursorC + acr(n) > startC + span) {
        cursorC = startC;
        cursorA += rowThickness + GAP_NODE;
        rowThickness = 0;
      }
      raw.set(n.id, flowRight ? { x: cursorA, y: cursorC } : { x: cursorC, y: cursorA });
      cursorC += acr(n) + GAP_NODE;
      rowThickness = Math.max(rowThickness, alg(n));
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

  // ── 7) Lados das setas ────────────────────────────────────────────────────
  if (radial) {
    // sai/entra pelo lado voltado pro outro cartão, já nas posições finais
    const center = id => {
      const p = positions.get(id), n = byId.get(id);
      return { x: p.x + n.w / 2, y: p.y + n.h / 2 };
    };
    for (const e of edges) {
      const a = center(e.from), b = center(e.to);
      const dx = b.x - a.x, dy = b.y - a.y;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      sides.set(e.id, horizontal
        ? { fromSide: dx > 0 ? 'right' : 'left', toSide: dx > 0 ? 'left' : 'right' }
        : { fromSide: dy > 0 ? 'bottom' : 'top', toSide: dy > 0 ? 'top' : 'bottom' });
    }
  } else {
    const [fwdFrom, fwdTo] = vertical ? ['bottom', 'top'] : ['right', 'left'];
    const backSide = vertical ? 'right' : 'bottom';
    for (const e of edges) {
      sides.set(e.id, e.back
        ? { fromSide: backSide, toSide: backSide }
        : { fromSide: fwdFrom, toSide: fwdTo });
    }
  }

  return { positions, sides };
}

// Radial: o centro é o cartão mais conectado (o "hub" do fluxo) e os anéis são a
// distância em setas até ele, ignorando o sentido — por isso o fluxo se abre pra
// todos os lados. Dentro de cada anel, a ordem inicial segue o ângulo em que os
// cartões já estavam em relação ao hub (preserva a intenção de quem desenhou).
function radialLayers(flowNodes, edges, byId) {
  const adj = new Map(flowNodes.map(n => [n.id, new Set()]));
  const inDegree = new Map(flowNodes.map(n => [n.id, 0]));
  for (const e of edges) {
    adj.get(e.from).add(e.to);
    adj.get(e.to).add(e.from);
    inDegree.set(e.to, inDegree.get(e.to) + 1);
  }
  const hub = [...flowNodes].sort((a, b) =>
    (adj.get(b.id).size - adj.get(a.id).size) || (inDegree.get(a.id) - inDegree.get(b.id)))[0];
  const hubC = { x: hub.x + hub.w / 2, y: hub.y + hub.h / 2 };
  const visualAngle = id => {
    const n = byId.get(id);
    return Math.atan2(n.y + n.h / 2 - hubC.y, n.x + n.w / 2 - hubC.x);
  };

  const dist = new Map([[hub.id, 0]]);
  const queue = [hub.id];
  while (queue.length) {
    const id = queue.shift();
    for (const nb of adj.get(id)) {
      if (!dist.has(nb)) { dist.set(nb, dist.get(id) + 1); queue.push(nb); }
    }
  }
  const layers = [];
  const preds = new Map(flowNodes.map(n => [n.id, []]));
  for (const n of flowNodes) {
    // pedaços desconectados do hub entram no anel seguinte ao último
    const d = dist.has(n.id) ? dist.get(n.id) : (Math.max(...dist.values()) + 1);
    (layers[d] ||= []).push(n.id);
    for (const nb of adj.get(n.id)) if (dist.get(nb) === d - 1) preds.get(n.id).push(nb);
  }
  for (let l = 0; l < layers.length; l++) {
    layers[l] ||= [];
    if (l > 0) layers[l].sort((a, b) => visualAngle(a) - visualAngle(b));
  }
  return { layers, preds };
}
// Camadas lado a lado num eixo, cada nó puxado pra perto dos vizinhos.
function placeLinear(layers, byId, preds, succs, vertical, along, across) {
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
    if (!ids.length) return;
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

  const raw = new Map();
  layers.forEach((ids, l) => {
    for (const id of ids) {
      const n = byId.get(id);
      const a = layerStart[l] + (thickness[l] - along(n)) / 2;
      const c = pos.get(id);
      raw.set(id, vertical ? { x: c, y: a } : { x: a, y: c });
    }
  });
  return raw;
}

// Camadas viram anéis concêntricos; cada nó vai pro ângulo médio dos pais, com
// separação mínima pelo tamanho dos cartões (o anel cresce se não couber).
function placeRadial(layers, byId, preds) {
  const TAU = Math.PI * 2;
  const radiusOf = id => Math.hypot(byId.get(id).w, byId.get(id).h) / 2;
  const angle = new Map();
  const ringR = [];
  const raw = new Map();

  layers.forEach((ids, l) => {
    if (!ids.length) { ringR[l] = ringR[l - 1] || 0; return; }
    const maxR = Math.max(...ids.map(radiusOf));
    const circumference = ids.reduce((s, id) => s + radiusOf(id) * 2 + GAP_NODE, 0);

    if (l === 0) {
      ringR[0] = ids.length === 1 ? 0 : Math.max(circumference / TAU, maxR + GAP_NODE);
    } else {
      const prevMax = Math.max(0, ...layers[l - 1].map(radiusOf));
      ringR[l] = Math.max(ringR[l - 1] + prevMax + maxR + GAP_LAYER, circumference / TAU);
    }
    const R = ringR[l];

    // ângulo desejado: média circular dos pais; sem pai, distribui por posição
    const want = ids.map((id, i) => {
      const ps = ringR[l - 1] > 0 ? preds.get(id).filter(p => angle.has(p)) : [];
      if (ps.length) {
        const s = ps.reduce((a, p) => a + Math.sin(angle.get(p)), 0);
        const c = ps.reduce((a, p) => a + Math.cos(angle.get(p)), 0);
        return Math.atan2(s, c);
      }
      return -Math.PI / 2 + (TAU * i) / ids.length;
    });

    if (R === 0) { // origem única no centro
      angle.set(ids[0], 0);
      raw.set(ids[0], { x: -byId.get(ids[0]).w / 2, y: -byId.get(ids[0]).h / 2 });
      return;
    }

    // ordena por ângulo, começando pelo maior "vão" pra minimizar empurrões
    const order = ids.map((id, i) => ({ id, a: ((want[i] % TAU) + TAU) % TAU })).sort((p, q) => p.a - q.a);
    let startIdx = 0;
    if (order.length > 1) {
      let best = -1;
      order.forEach((o, i) => {
        const next = order[(i + 1) % order.length].a + (i === order.length - 1 ? TAU : 0);
        if (next - o.a > best) { best = next - o.a; startIdx = (i + 1) % order.length; }
      });
    }
    const seq = [...order.slice(startIdx), ...order.slice(0, startIdx)];
    // desenrola numa reta crescente e empurra pra respeitar a separação mínima
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const placed = [];
    seq.forEach((o, i) => {
      let a = o.a;
      while (a < seq[0].a - 1e-9) a += TAU;
      const sep = i ? (radiusOf(o.id) + radiusOf(seq[i - 1].id) + GAP_NODE) / R : 0;
      placed.push(i ? Math.max(a, placed[i - 1] + sep) : a);
    });
    // recentra pra o empurrão não rodar o anel inteiro
    const drift = seq.reduce((s, o, i) => s + wrap(o.a - placed[i]), 0) / seq.length;
    seq.forEach((o, i) => {
      const a = placed[i] + drift;
      angle.set(o.id, a);
      const n = byId.get(o.id);
      raw.set(o.id, { x: R * Math.cos(a) - n.w / 2, y: R * Math.sin(a) - n.h / 2 });
    });
  });
  return raw;
}
