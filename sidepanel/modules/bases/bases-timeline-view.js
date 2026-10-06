// ── bases-timeline-view.js ──────────────────────────────────────────────────
// View "Linha do tempo" (Gantt) das Bases. Só monta: escala/faixa em timeline/timeline-scale.js,
// itens e linhas em timeline/timeline-model.js, gestos em timeline/timeline-actions.js,
// barras em timeline/timeline-bars.js. Tabela à esquerda sincronizada com a grade.

import { getNotePropertyValue } from './bases-engine.js';
import { resolveTimelineConfig, buildTimelineItems, buildRows } from './timeline/timeline-model.js';
import { TIMELINE_SCALES, visibleRange, headerCells, cellWidth, xOf, ymdAtX } from './timeline/timeline-scale.js';
import { createBar } from './timeline/timeline-bars.js';
import { resolveDependencies, isConflict, routeArrow, cascadeShifts } from './timeline/timeline-deps.js';
import { moveItemPatch } from './timeline/timeline-actions.js';
import { pickDefaultDateProp } from './calendar/calendar-model.js';
import { resolveGroupConfig, getViewProps } from './config/view-model.js';
import { todayYMD, diffDays } from './engine/date-utils.js';
import { TONES } from './engine/color-rules.js';
import { formatPropertyValue } from './bases-schema.js';

const ALTURA_LINHA = 32;
const ALTURA_CAB = 26;

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export function renderBaseTimelineView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.className = 'base-view-container base-timeline-container';
  container.replaceChildren();

  const cfg = resolveTimelineConfig(viewConfig);
  if (!cfg.date.start) cfg.date.start = pickDefaultDateProp(schema);
  const hoje = todayYMD();
  const ppd = TIMELINE_SCALES[cfg.scale].ppd;

  const { items, noDate } = buildTimelineItems(notes, cfg, getNotePropertyValue);
  // A faixa visível é lembrada enquanto os itens couberem nela (mesma view e escala): assim as
  // barras não "pulam" depois de uma edição — a Base recarrega as notas e redesenha tudo.
  const calculada = visibleRange(items, hoje, cfg.scale);
  const anterior = container._tlRange;
  const cabe = r => items.every(i => i.startYmd >= r.start && i.endYmd <= r.end) && hoje >= r.start && hoje <= r.end;
  const range = anterior && anterior.scale === cfg.scale && anterior.viewId === viewConfig.id && cabe(anterior) ? anterior : calculada;
  range.scale = cfg.scale;
  range.viewId = viewConfig.id;
  container._tlRange = range;
  const colapsados = resolveGroupConfig(viewConfig).collapsed;
  const linhas = buildRows(items, viewConfig, schema, getNotePropertyValue, colapsados);

  // cor por propriedade: cada valor distinto → um tom (ciclando)
  const tonsPorValor = new Map();
  const tomDe = item => {
    if (!cfg.colorBy) return 'blue';
    const v = String(getNotePropertyValue(item.note, cfg.colorBy) ?? '');
    if (!tonsPorValor.has(v)) tonsPorValor.set(v, TONES[1 + (tonsPorValor.size % (TONES.length - 1))].id);
    return tonsPorValor.get(v);
  };

  // ── barra superior ──
  const barra = el('div', 'btl-toolbar');
  const escalas = el('div', 'bset-segmented');
  escalas.setAttribute('role', 'group'); escalas.setAttribute('aria-label', 'Escala de tempo');
  let corpoScroll = null;
  for (const [k, m] of Object.entries(TIMELINE_SCALES)) {
    const b = el('button', 'bset-seg' + (k === cfg.scale ? ' is-active' : ''), m.label);
    b.type = 'button'; b.setAttribute('aria-pressed', String(k === cfg.scale));
    b.addEventListener('click', () => {
      if (k === cfg.scale) return;
      // zoom mantém o centro: guarda a data do meio e restaura depois de redesenhar
      if (corpoScroll) container._tlCenter = ymdAtX(corpoScroll.scrollLeft + corpoScroll.clientWidth / 2, range, ppd);
      callbacks.onUpdateView?.({ scale: k });
    });
    escalas.appendChild(b);
  }
  barra.appendChild(escalas);
  const btHoje = el('button', 'bset-btn', 'Hoje'); btHoje.type = 'button';
  barra.appendChild(btHoje);
  barra.appendChild(el('span', 'btl-count', `${items.length} ${items.length === 1 ? 'item' : 'itens'}`));
  container.appendChild(barra);

  if (!items.length) {
    const vazio = el('div', 'bch-empty');
    vazio.appendChild(el('p', '', cfg.date.start ? `Nenhuma nota com a propriedade "${schema[cfg.date.start]?.label || cfg.date.start}" preenchida.` : 'Escolha a propriedade de data de início.'));
    const b = el('button', 'bset-btn', 'Configurar view'); b.type = 'button';
    b.addEventListener('click', () => callbacks.onOpenSettings?.());
    vazio.appendChild(b);
    container.appendChild(vazio);
    return;
  }

  // ── corpo: tabela + grade ──
  const corpo = el('div', 'btl-body');
  container.appendChild(corpo);

  let tabela = null;
  if (cfg.table.visible) {
    tabela = el('div', 'btl-table');
    tabela.style.width = `${cfg.table.width}px`;
    tabela.appendChild(el('div', 'btl-table-head', 'Nome')).style.height = `${ALTURA_CAB * 2}px`;
    const props = getViewProps(viewConfig).filter(p => p !== 'title').slice(0, 2);
    for (const r of linhas) {
      const l = el('div', r.type === 'group' ? 'btl-trow btl-trow-group' : 'btl-trow');
      l.style.height = `${r.type === 'group' ? ALTURA_CAB : ALTURA_LINHA}px`;
      if (r.type === 'group') {
        const fechado = colapsados.includes(r.key);
        const tg = el('button', 'base-group-toggle'); tg.type = 'button';
        tg.setAttribute('aria-expanded', String(!fechado));
        tg.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${fechado ? 'chevron_right' : 'expand_more'}</span>`;
        tg.appendChild(el('span', 'base-group-label', r.label));
        tg.appendChild(el('span', 'base-group-count', String(r.count)));
        tg.addEventListener('click', () => callbacks.onUpdateView?.({ group: { collapsed: fechado ? colapsados.filter(k => k !== r.key) : [...colapsados, r.key] } }));
        l.appendChild(tg);
      } else {
        const a = el('a', 'btl-name', r.item.title); a.href = '#';
        a.addEventListener('click', e => { e.preventDefault(); callbacks.onOpenNote?.(r.item.id); });
        l.appendChild(a);
        for (const p of props) {
          const v = getNotePropertyValue(r.item.note, p);
          if (v == null || v === '') continue;
          const f = formatPropertyValue(v, schema[p]?.type, schema[p]);
          l.appendChild(el('span', 'btl-prop', Array.isArray(f) ? f.join(', ') : typeof f === 'string' ? f : String(v)));
        }
      }
      tabela.appendChild(l);
    }
    corpo.appendChild(tabela);
  }

  const scroll = el('div', 'btl-scroll');
  corpoScroll = scroll;
  corpo.appendChild(scroll);
  const larguraTotal = range.days * ppd;
  const canvas = el('div', 'btl-canvas');
  canvas.style.width = `${larguraTotal}px`;
  scroll.appendChild(canvas);

  // cabeçalho em dois níveis (fixo no topo da grade)
  const cab = el('div', 'btl-head');
  cab.style.height = `${ALTURA_CAB * 2}px`;
  const h = headerCells(range, cfg.scale);
  for (const nivel of ['top', 'bottom']) {
    const faixa = el('div', `btl-head-row btl-head-${nivel}`);
    faixa.style.height = `${ALTURA_CAB}px`;
    for (const c of h[nivel]) {
      const cel = el('div', 'btl-head-cell', c.label);
      cel.style.left = `${xOf(c.from, range, ppd)}px`;
      cel.style.width = `${cellWidth(c, ppd)}px`;
      faixa.appendChild(cel);
    }
    cab.appendChild(faixa);
  }
  canvas.appendChild(cab);

  // grade vertical (limites das células de baixo) + linha de hoje
  const grade = el('div', 'btl-grid');
  for (const c of h.bottom) { const l = el('div', 'btl-vline'); l.style.left = `${xOf(c.from, range, ppd)}px`; grade.appendChild(l); }
  canvas.appendChild(grade);
  if (cfg.today) {
    const t = el('div', 'btl-today');
    t.style.left = `${xOf(hoje, range, ppd) + ppd / 2}px`;
    t.title = 'Hoje';
    canvas.appendChild(t);
  }

  // datas do item DEPOIS do patch gravado (para a cascata)
  const reaplica = (item, r) => {
    const ev = item.ev;
    const dia = v => (v && typeof v === 'object' && !Array.isArray(v) ? v.start : v);
    const fimRaw = r.patch[ev.endProp];
    const iniRaw = r.patch[ev.startProp];
    const ymd = x => (x ? String(dia(x)).slice(0, 10) : null);
    const faixa = iniRaw && typeof iniRaw === 'object' ? iniRaw : null;
    return {
      startYmd: ymd(iniRaw) || item.startYmd,
      endYmd: (faixa ? String(faixa.end).slice(0, 10) : ymd(fimRaw)) || item.endYmd,
    };
  };
  const barGeometryOf = it => ({ left: xOf(it.startYmd, range, ppd), width: Math.max((diffDays(it.startYmd, it.endYmd) + 1) * ppd, 12) });
  const aoGravar = async (item, r) => {
    if (!r) return;
    await callbacks.onUpdateNoteProperties?.(item.note, r.patch, r.types);
    // reagendamento automático: empurra os sucessores que ficaram em conflito
    if (cfg.deps.autoShift && cfg.deps.prop) {
      const novo = reaplica(item, r);
      const empurroes = cascadeShifts(items, arestas, { [item.id]: novo });
      for (const [id, delta] of Object.entries(empurroes)) {
        const alvo = items.find(i => i.id === id);
        const pr = alvo && moveItemPatch(alvo, delta);
        if (pr) await callbacks.onUpdateNoteProperties?.(alvo.note, pr.patch, pr.types);
      }
    }
    container._tlKeep = { left: scroll.scrollLeft, top: scroll.scrollTop };
    renderBaseTimelineView(container, notes, schema, viewConfig, callbacks);
  };

  const linhasEl = el('div', 'btl-rows');
  for (const r of linhas) {
    const l = el('div', r.type === 'group' ? 'btl-row btl-row-group' : 'btl-row');
    l.style.height = `${r.type === 'group' ? ALTURA_CAB : ALTURA_LINHA}px`;
    if (r.type === 'item') {
      createBar(l, r.item, {
        range, ppd, tom: tomDe(r.item),
        canResizeEnd: !!cfg.date.end,
        onOpen: id => { if (!container._tlNoClick) callbacks.onOpenNote?.(id); },
        suppressClick: () => { container._tlNoClick = true; setTimeout(() => { container._tlNoClick = false; }, 0); },
        onCommit: callbacks.onUpdateNoteProperties ? aoGravar : null,
      });
    }
    linhasEl.appendChild(l);
  }
  canvas.appendChild(linhasEl);

  // dependências: setas SVG por cima das barras (fim do predecessor → início da nota)
  const arestas = resolveDependencies(items, getNotePropertyValue, cfg.deps.prop);
  if (arestas.length && cfg.deps.showArrows) {
    const tops = []; let y = ALTURA_CAB * 2;
    const linhaDoItem = new Map();
    linhas.forEach((r, i) => { tops.push(y); if (r.type === 'item') linhaDoItem.set(r.item.id, i); y += r.type === 'group' ? ALTURA_CAB : ALTURA_LINHA; });
    const porId = new Map(items.map(i => [i.id, i]));
    const NS = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(NS, 'svg');
    svgEl.setAttribute('class', 'btl-deps');
    svgEl.setAttribute('width', String(larguraTotal)); svgEl.setAttribute('height', String(y));
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.innerHTML = '<defs><marker id="btl-seta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="btl-seta-ponta"/></marker></defs>';
    for (const a of arestas) {
      const pred = porId.get(a.from), suc = porId.get(a.to);
      if (!pred || !suc || !linhaDoItem.has(pred.id) || !linhaDoItem.has(suc.id)) continue;   // grupo recolhido
      const g = it => ({ ...barGeometryOf(it), row: linhaDoItem.get(it.id) });
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', routeArrow(g(pred), g(suc), tops, ALTURA_LINHA));
      path.setAttribute('class', 'btl-dep' + (isConflict(pred, suc) ? ' is-conflict' : ''));
      path.setAttribute('marker-end', 'url(#btl-seta)');
      svgEl.appendChild(path);
    }
    canvas.appendChild(svgEl);
  }

  // tabela acompanha a rolagem vertical da grade (e a roda do mouse sobre a tabela rola a grade)
  if (tabela) {
    scroll.addEventListener('scroll', () => { tabela.scrollTop = scroll.scrollTop; });
    tabela.addEventListener('wheel', e => { scroll.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
  }

  // posição inicial: mantém a rolagem após gravar; restaura o centro do zoom; senão centraliza em "hoje"
  const aplicaScroll = () => {
    if (container._tlKeep) { scroll.scrollLeft = container._tlKeep.left; scroll.scrollTop = container._tlKeep.top; container._tlKeep = null; return; }
    const alvo = container._tlCenter || hoje;
    container._tlCenter = null;
    scroll.scrollLeft = Math.max(0, xOf(alvo, range, ppd) - scroll.clientWidth / 2);
  };
  btHoje.addEventListener('click', () => { scroll.scrollLeft = Math.max(0, xOf(hoje, range, ppd) - scroll.clientWidth / 2); });
  requestAnimationFrame(aplicaScroll);
  aplicaScroll();

  // notas sem data
  if (noDate.length) {
    const d = el('details', 'btl-nodate');
    d.appendChild(el('summary', '', `Sem data (${noDate.length})`));
    const ul = el('ul', 'btl-nodate-list');
    for (const n of noDate) {
      const li = el('li');
      const a = el('a', '', n.title || 'Sem título'); a.href = '#';
      a.addEventListener('click', e => { e.preventDefault(); callbacks.onOpenNote?.(n.id); });
      li.appendChild(a); ul.appendChild(li);
    }
    d.appendChild(ul);
    container.appendChild(d);
  }
}
