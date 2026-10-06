// ── calendar-nodate.js ──────────────────────────────────────────────────────
// Caixa "Sem data" do calendário: lista as notas que não aparecem no calendário e deixa
// escolher o dia (ou "Hoje" / o dia que está em foco) — grava a propriedade de início.

import { isEditableDateProp } from './calendar-actions.js';
import { todayYMD } from '../engine/date-utils.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export function renderNoDateBox(container, { notes, startProp, anchor, onOpen, onSetDate }) {
  container.querySelector('.bcal-nodate')?.remove();
  if (!notes.length || !isEditableDateProp(startProp)) return;

  const box = el('details', 'bcal-nodate');
  box.appendChild(el('summary', '', `Sem data (${notes.length})`));
  const lista = el('ul', 'bcal-nodate-list');
  for (const n of notes.slice(0, 200)) {
    const li = el('li');
    const a = el('a', 'bcal-nodate-title', n.title || 'Sem título'); a.href = '#';
    a.addEventListener('click', e => { e.preventDefault(); onOpen?.(n.id); });
    const dia = el('input', 'bset-input'); dia.type = 'date';
    dia.setAttribute('aria-label', `Data de ${n.title || 'nota'}`);
    dia.addEventListener('change', () => { if (dia.value) onSetDate(n, dia.value); });
    const hoje = el('button', 'bset-btn', 'Hoje'); hoje.type = 'button';
    hoje.addEventListener('click', () => onSetDate(n, todayYMD()));
    const foco = el('button', 'bset-btn', 'Dia em foco'); foco.type = 'button';
    foco.title = `Definir como ${anchor}`;
    foco.addEventListener('click', () => onSetDate(n, anchor));
    li.append(a, dia, hoje, foco);
    lista.appendChild(li);
  }
  box.appendChild(lista);
  if (notes.length > 200) box.appendChild(el('p', 'bset-hint', `Mostrando 200 de ${notes.length}.`));
  container.appendChild(box);
}
