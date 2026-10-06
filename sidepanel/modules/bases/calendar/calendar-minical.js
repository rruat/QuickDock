// ── calendar-minical.js ─────────────────────────────────────────────────────
// Mini-calendário lateral: mês pequeno com pontos nos dias que têm eventos; clicar num dia leva
// o calendário até ele; as setas só mudam o mês mostrado aqui (o calendário principal não mexe).

import { monthMatrix, addMonths, todayYMD } from '../engine/date-utils.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/**
 * @param {HTMLElement} host
 * @param {{ shown:string, anchor:string, firstDay:number, eventDays:Set<string>, onPick(ymd), onShift(delta) }} o
 *   shown = qualquer dia do mês exibido (a navegação das setas vive no chamador)
 */
export function renderMiniCalendar(host, { shown, anchor, firstDay, eventDays, onPick, onShift }) {
  host.replaceChildren();
  host.classList.add('bcal-mini');
  const hoje = todayYMD();
  const [ano, mes] = shown.split('-').map(Number);

  const cab = el('div', 'bcal-mini-head');
  const prev = el('button', 'bcal-mini-nav', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Mês anterior');
  const prox = el('button', 'bcal-mini-nav', '›'); prox.type = 'button'; prox.setAttribute('aria-label', 'Próximo mês');
  prev.addEventListener('click', () => onShift(-1)); prox.addEventListener('click', () => onShift(1));
  cab.append(prev, el('span', 'bcal-mini-title', `${MESES[mes - 1]} ${ano}`), prox);
  host.appendChild(cab);

  const grade = el('div', 'bcal-mini-grid');
  grade.setAttribute('role', 'grid');
  for (let i = 0; i < 7; i++) grade.appendChild(el('span', 'bcal-mini-dow', DIAS[(i + firstDay) % 7]));
  for (const semana of monthMatrix(shown, firstDay)) {
    for (const d of semana) {
      const fora = d.slice(0, 7) !== shown.slice(0, 7);
      const b = el('button', 'bcal-mini-day' + (fora ? ' is-out' : '') + (d === hoje ? ' is-today' : '') + (d === anchor ? ' is-anchor' : '') + (eventDays.has(d) ? ' has-events' : ''), String(Number(d.slice(8))));
      b.type = 'button';
      b.setAttribute('aria-label', `${d}${eventDays.has(d) ? ', com eventos' : ''}`);
      if (d === anchor) b.setAttribute('aria-current', 'date');
      b.addEventListener('click', () => onPick(d));
      grade.appendChild(b);
    }
  }
  host.appendChild(grade);
}

export { addMonths };
