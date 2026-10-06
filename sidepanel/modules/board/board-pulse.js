// ── board-pulse.js ──────────────────────────────────────────────────────────
// "Pulse": uma partícula (círculo ou estrelinha, com rastro) que percorre a
// seta do cartão de origem até o de destino, em loop — mais uma pista visual
// de qual é o fluxo ativo. O movimento é SMIL (`animateMotion`) sobre o mesmo
// `d` da seta, então acompanha curvas e rotas ortogonais sem JS por frame.
//
// Dados: `arrow.pulse` (boolean) e `arrow.pulseShape` ('circle' | 'star').

import { positionPopover } from '../popover.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PARTICLES = 3;        // cabeça + 2 de rastro
const LAG = 0.06;           // atraso do rastro, em fração do ciclo
const SPEED = 170;          // px do mundo por segundo

const STAR_POINTS = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 7 : 3;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(' ');
})();

function particle(shape, index) {
  const scale = 1 - index * 0.25;
  const el = shape === 'star'
    ? document.createElementNS(SVG_NS, 'polygon')
    : document.createElementNS(SVG_NS, 'circle');
  if (shape === 'star') {
    el.setAttribute('points', STAR_POINTS);
    el.setAttribute('transform', `scale(${scale})`);
  } else {
    el.setAttribute('r', String(4.5 * scale));
  }
  el.setAttribute('class', 'board-pulse-dot');
  el.style.opacity = String(1 - index * 0.32);
  const motion = document.createElementNS(SVG_NS, 'animateMotion');
  motion.setAttribute('repeatCount', 'indefinite');
  motion.setAttribute('rotate', '0');
  el.appendChild(motion);
  return el;
}

function buildGroup(shape) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'board-arrow-pulse');
  g.setAttribute('pointer-events', 'none');
  // do rastro pra cabeça, pra cabeça ficar por cima
  for (let i = PARTICLES - 1; i >= 0; i--) g.appendChild(particle(shape, i));
  return g;
}

/**
 * Cria/atualiza/remove o pulse de uma seta. Chamado a cada renderArrows().
 * `dom` é o registro DOM da seta ({ path, pulse? }); `d` é o path atual.
 */
export function syncArrowPulse(dom, arrow, d, parent) {
  if (!arrow.pulse) {
    if (dom.pulse) { dom.pulse.remove(); dom.pulse = null; dom.pulseKey = null; }
    return;
  }
  const shape = arrow.pulseShape === 'star' ? 'star' : 'circle';
  if (!dom.pulse || dom.pulseShape !== shape) {
    dom.pulse?.remove();
    dom.pulse = buildGroup(shape);
    dom.pulseShape = shape;
    dom.pulseKey = null;
    parent.appendChild(dom.pulse);
  }
  // mesma cor da linha: a da seta, ou a padrão do CSS (.board-arrow-path)
  dom.pulse.style.color = arrow.color || '';

  let len = 0;
  try { len = dom.path.getTotalLength(); } catch {}
  const dur = Math.min(7, Math.max(1.2, (len || 240) / SPEED));
  const key = `${d}|${dur.toFixed(2)}`;
  if (dom.pulseKey === key) return;
  dom.pulseKey = key;

  const motions = dom.pulse.querySelectorAll('animateMotion');
  // children estão na ordem rastro→cabeça; índice real da partícula = PARTICLES-1-i
  motions.forEach((m, i) => {
    const idx = PARTICLES - 1 - i;
    m.setAttribute('path', d);
    m.setAttribute('dur', `${dur.toFixed(2)}s`);
    // todas começam "no meio do ciclo" (begin negativo) pra nenhuma ficar parada em (0,0)
    m.setAttribute('begin', `${(-(PARTICLES * LAG) * dur + idx * LAG * dur).toFixed(3)}s`);
  });
}

export function removeArrowPulse(dom) {
  dom.pulse?.remove();
  dom.pulse = null;
}

// ── Popover do botão Pulse ──────────────────────────────────────────────────
let aberto = null;

export function closePulsePopover() {
  aberto?.remove();
  aberto = null;
}

/**
 * @param {HTMLElement} anchor
 * @param {{ getArrows:()=>Array<object>, scopeLabel:()=>string, onChange:()=>void }} ctx
 *   getArrows → setas no escopo (selecionadas ou todas); onChange → re-render + salvar
 */
export function togglePulsePopover(anchor, ctx) {
  if (aberto) { closePulsePopover(); return; }

  const pop = document.createElement('div');
  pop.className = 'board-pulse-popover board-theme-scope';

  const render = () => {
    const arrows = ctx.getArrows();
    const allOn = arrows.length > 0 && arrows.every(a => a.pulse);
    const shape = arrows.find(a => a.pulse)?.pulseShape === 'star' ? 'star' : 'circle';
    pop.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'board-popover-title';
    title.textContent = `Pulse · ${ctx.scopeLabel()}`;
    pop.appendChild(title);

    if (arrows.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'board-insert-hint';
      vazio.textContent = 'Nenhuma seta aqui ainda. Conecte cartões para ver o fluxo pulsar.';
      pop.appendChild(vazio);
      return;
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `board-pulse-toggle ${allOn ? 'is-on' : ''}`;
    toggle.innerHTML = `<span class="qd-icon material-symbols-rounded">${allOn ? 'toggle_on' : 'toggle_off'}</span><span>${allOn ? 'Pulse ligado' : 'Ligar pulse'} (${arrows.length} seta${arrows.length > 1 ? 's' : ''})</span>`;
    toggle.addEventListener('click', () => {
      for (const a of arrows) a.pulse = !allOn;
      ctx.onChange();
      render();
    });
    pop.appendChild(toggle);

    const row = document.createElement('div');
    row.className = 'board-popover-row';
    const label = document.createElement('span');
    label.className = 'board-popover-label';
    label.textContent = 'Formato:';
    const group = document.createElement('div');
    group.className = 'board-popover-btn-group';
    for (const [id, text] of [['circle', '● Círculo'], ['star', '★ Estrela']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `board-popover-btn ${shape === id ? 'is-active' : ''}`;
      b.textContent = text;
      b.addEventListener('click', () => {
        for (const a of arrows) a.pulseShape = id;
        ctx.onChange();
        render();
      });
      group.appendChild(b);
    }
    row.append(label, group);
    pop.appendChild(row);
  };

  render();
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  pop.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(pop);
  positionPopover(pop, anchor);
  aberto = pop;
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (aberto && !aberto.contains(e.target) && !e.target.closest('#tool-pulse')) closePulsePopover();
  }, true);
}
