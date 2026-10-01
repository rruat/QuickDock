// ── calendar-agenda-view.js ──────────────────────────────────────────────
// Visualização em Agenda (Lista Cronológica) para o Calendário do QuickDock.
// Otimizada para painéis laterais estreitos (320px–450px) e telas móveis.
// Agrupa os eventos em blocos: Atrasadas, Hoje, Amanhã, Esta Semana e Próximos.

/**
 * Renderiza a visualização em lista corrida (Agenda).
 * @param {HTMLElement} containerEl
 * @param {Array<{ note: Object, date: string, formattedDate: string }>} itensAgendados
 * @param {Date} [dataHoje]
 * @param {{ onOpenNote: Function, onAddNote: Function }} callbacks
 */
export function renderAgendaView(containerEl, itensAgendados, dataHoje = new Date(), callbacks = {}) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  containerEl.className = 'calendar-agenda-container';

  const hojeYMD = `${dataHoje.getFullYear()}-${String(dataHoje.getMonth() + 1).padStart(2, '0')}-${String(dataHoje.getDate()).padStart(2, '0')}`;
  const amanha = new Date(dataHoje.getFullYear(), dataHoje.getMonth(), dataHoje.getDate() + 1);
  const amanhaYMD = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;

  const grupos = {
    atrasadas: { titulo: 'Atrasadas', itens: [], cor: '#ef4444' },
    hoje:      { titulo: 'Hoje', itens: [], cor: 'var(--accent)' },
    amanha:    { titulo: 'Amanhã', itens: [], cor: '#3b82f6' },
    futuras:   { titulo: 'Próximas', itens: [], cor: 'var(--text-muted)' }
  };

  const ordenados = [...itensAgendados].sort((a, b) => a.date.localeCompare(b.date));

  for (const item of ordenados) {
    if (item.date < hojeYMD) {
      grupos.atrasadas.itens.push(item);
    } else if (item.date === hojeYMD) {
      grupos.hoje.itens.push(item);
    } else if (item.date === amanhaYMD) {
      grupos.amanha.itens.push(item);
    } else {
      grupos.futuras.itens.push(item);
    }
  }

  let temItens = false;

  for (const [chave, grupo] of Object.entries(grupos)) {
    if (grupo.itens.length === 0) continue;
    temItens = true;

    const grupoSection = document.createElement('div');
    grupoSection.className = `calendar-agenda-group group-${chave}`;

    const grupoHeader = document.createElement('div');
    grupoHeader.className = 'agenda-group-header';
    grupoHeader.innerHTML = `<span class="agenda-group-dot" style="background:${grupo.cor}"></span><span class="agenda-group-title">${grupo.titulo}</span><span class="agenda-group-count">${grupo.itens.length}</span>`;
    grupoSection.appendChild(grupoHeader);

    const itensList = document.createElement('div');
    itensList.className = 'agenda-group-list';

    for (const item of grupo.itens) {
      const card = document.createElement('div');
      card.className = 'agenda-item-card';
      if (item.note.color) card.style.borderLeftColor = item.note.color;

      const dateBadge = document.createElement('span');
      dateBadge.className = 'agenda-item-date';
      dateBadge.textContent = item.date.split('-').reverse().slice(0, 2).join('/'); // DD/MM

      const titleEl = document.createElement('span');
      titleEl.className = 'agenda-item-title';
      titleEl.textContent = item.note.title || 'Sem título';

      card.appendChild(dateBadge);
      card.appendChild(titleEl);

      const props = item.note.properties || {};
      const cat = props.categoria ?? props.category ?? props.tag;
      if (cat) {
        const catBadge = document.createElement('span');
        catBadge.className = 'calendar-chip-cat';
        catBadge.textContent = String(cat);
        card.appendChild(catBadge);
      }

      card.addEventListener('click', () => {
        callbacks.onOpenNote?.(item.note);
      });

      itensList.appendChild(card);
    }

    grupoSection.appendChild(itensList);
    containerEl.appendChild(grupoSection);
  }

  if (!temItens) {
    const vazioEl = document.createElement('div');
    vazioEl.className = 'calendar-agenda-empty';
    vazioEl.innerHTML = '<span class="qd-icon material-symbols-rounded">event_busy</span><p>Nenhuma nota agendada encontrada.</p>';
    containerEl.appendChild(vazioEl);
  }
}
