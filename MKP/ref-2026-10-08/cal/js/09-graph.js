// Grafo de conexões com notas fictícias
// ── GRAFO DE CONEXÕES (notas fictícias, só para modelo) ──
(function initNoteGraph() {
  const svg = document.getElementById('noteGraph');
  const info = document.getElementById('graphInfo');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const nodes = [
    { id: 'dia7',  t: 'Nota do dia 7',        g: 'reuniao', x: 150, y: 175, active: true },
    { id: 'shell', t: 'Spatial Shell',        g: 'projeto', x: 78,  y: 100 },
    { id: 'views', t: 'Views Mês/Semana/Dia', g: 'projeto', x: 205, y: 80 },
    { id: 'bases', t: 'Bases',                g: 'projeto', x: 245, y: 165 },
    { id: 'road',  t: 'Roadmap Q4',           g: 'projeto', x: 55,  y: 205 },
    { id: 'alin',  t: 'Alinhamento',          g: 'reuniao', x: 150, y: 265 },
    { id: 'retro', t: 'Retro semanal',        g: 'reuniao', x: 242, y: 250 },
    { id: 'const', t: 'Ideia: constelações',  g: 'ideia',   x: 40,  y: 125 },
    { id: 'datas', t: 'Ideia: notas por data',g: 'ideia',   x: 120, y: 38 },
    { id: 'marina',t: 'Marina',               g: 'pessoa',  x: 70,  y: 295 },
    { id: 'caio',  t: 'Caio',                 g: 'pessoa',  x: 215, y: 318 }
  ];
  const edges = [
    ['dia7','shell'], ['dia7','views'], ['dia7','alin'], ['dia7','const'],
    ['shell','views'], ['shell','const'], ['views','bases'], ['views','datas'],
    ['bases','datas'], ['bases','retro'], ['road','shell'], ['road','alin'],
    ['alin','marina'], ['alin','caio'], ['retro','caio'], ['road','marina']
  ];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const el = (name, attrs) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const links = edges.map(([a, b]) => {
    const l = el('line', { class: 'g-edge', x1: byId[a].x, y1: byId[a].y, x2: byId[b].x, y2: byId[b].y });
    l.dataset.a = a; l.dataset.b = b;
    svg.appendChild(l);
    return l;
  });
  const neighbors = id => edges.filter(e => e.includes(id)).map(e => e[0] === id ? e[1] : e[0]);
  const groupNames = { projeto: 'Projeto', reuniao: 'Reunião', ideia: 'Ideia', pessoa: 'Pessoa' };
  const nodeEls = nodes.map(n => {
    const g = el('g', { class: 'g-node' + (n.active ? ' is-active' : ''), transform: `translate(${n.x} ${n.y})` });
    g.dataset.id = n.id;
    g.appendChild(el('circle', { r: n.active ? 9 : 6.5, fill: `var(--graph-${n.g})` }));
    const label = el('text', { y: n.active ? 21 : 18 });
    label.textContent = n.t;
    g.appendChild(label);
    svg.appendChild(g);
    return g;
  });
  const showInfo = id => {
    const n = byId[id];
    const c = neighbors(id).length;
    info.innerHTML = '';
    const s = document.createElement('strong');
    s.textContent = n.t;
    info.append(s, `${groupNames[n.g]} • ${c} conexõe${c === 1 ? '' : 's'}`);
  };
  const focusNode = id => {
    const near = new Set([id, ...neighbors(id)]);
    svg.classList.add('has-focus');
    nodeEls.forEach(g => g.classList.toggle('is-near', near.has(g.dataset.id)));
    links.forEach(l => l.classList.toggle('is-near', l.dataset.a === id || l.dataset.b === id));
    showInfo(id);
  };
  const clearFocus = () => {
    svg.classList.remove('has-focus');
    showInfo('dia7');
  };
  nodeEls.forEach(g => {
    g.addEventListener('mouseenter', () => focusNode(g.dataset.id));
    g.addEventListener('mouseleave', clearFocus);
  });
  showInfo('dia7');
})();


