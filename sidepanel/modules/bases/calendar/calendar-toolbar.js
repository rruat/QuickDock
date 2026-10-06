// ── calendar-toolbar.js ─────────────────────────────────────────────────────
// Barra do calendário das Bases: período (título), ‹ Hoje ›, modo (Mês/Semana/Dia/Agenda)
// e o botão de configurar a view.

const MODOS = [
  { id: 'month', label: 'Mês' },
  { id: 'week', label: 'Semana' },
  { id: 'day', label: 'Dia' },
  { id: 'agenda', label: 'Agenda' },
];

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

function iconButton(icone, titulo, onClick) {
  const b = el('button', 'bcal-btn bcal-btn-icon');
  b.type = 'button';
  b.title = titulo;
  b.setAttribute('aria-label', titulo);
  b.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${icone}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * @param {{ title:string, mode:string, onPrev:()=>void, onNext:()=>void, onToday:()=>void,
 *           onMode:(mode:string)=>void, onSettings?:()=>void, canGoToday:boolean }} o
 */
export function createCalendarToolbar(o) {
  const barra = el('div', 'bcal-toolbar');

  const esquerda = el('div', 'bcal-toolbar-left');
  esquerda.appendChild(iconButton('chevron_left', 'Período anterior', o.onPrev));
  const hoje = el('button', 'bcal-btn bcal-btn-today', 'Hoje');
  hoje.type = 'button';
  hoje.disabled = !o.canGoToday;
  hoje.addEventListener('click', o.onToday);
  esquerda.appendChild(hoje);
  esquerda.appendChild(iconButton('chevron_right', 'Próximo período', o.onNext));
  const titulo = el('h3', 'bcal-title', o.title);
  titulo.setAttribute('aria-live', 'polite');
  esquerda.appendChild(titulo);
  barra.appendChild(esquerda);

  const direita = el('div', 'bcal-toolbar-right');
  const grupo = el('div', 'bcal-modes');
  grupo.setAttribute('role', 'group');
  grupo.setAttribute('aria-label', 'Modo do calendário');
  for (const m of MODOS) {
    const b = el('button', 'bcal-mode' + (m.id === o.mode ? ' is-active' : ''), m.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(m.id === o.mode));
    b.addEventListener('click', () => { if (m.id !== o.mode) o.onMode(m.id); });
    grupo.appendChild(b);
  }
  direita.appendChild(grupo);
  if (o.onSettings) direita.appendChild(iconButton('tune', 'Configurar calendário', o.onSettings));
  barra.appendChild(direita);

  return barra;
}
