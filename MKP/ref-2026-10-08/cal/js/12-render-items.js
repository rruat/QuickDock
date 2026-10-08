// Renderização dos itens: chips (mês, semana, dia), tabela e galeria
const mkChip = (n, withTime) => {
  const c = document.createElement('div');
  c.className = 'cal-note-chip';
  c.dataset.group = n.group;
  c.dataset.id = n.id;
  c.dataset.kind = n.kind;
  c.title = `${n.title} — ${n.time}`;
  c.textContent = withTime ? `${n.time} ${n.title}` : n.title;
  return c;
};

function renderMonthNotes() {
  dayCells.forEach(cell => {
    cell.querySelectorAll('.cal-note-chip, .cal-note-more').forEach(e => e.remove());
    if (cell.classList.contains('calendar-day-other-month')) return;
    // Quadros primeiro: são os itens que ocupam mais espaço mental no dia
    const notes = notesOfDay(cell.dataset.day).sort((a, b) => (b.kind === 'quadro') - (a.kind === 'quadro'));
    notes.slice(0, 2).forEach(n => cell.appendChild(mkChip(n, false)));
    if (notes.length > 2) {
      const more = document.createElement('div');
      more.className = 'cal-note-more';
      more.textContent = `+${notes.length - 2} itens`;
      cell.appendChild(more);
    }
  });
}

function renderWeekNotes() {
  document.querySelectorAll('.calendar-week-col').forEach(col => {
    col.querySelectorAll('.cal-note-chip').forEach(e => e.remove());
    const slots = col.querySelectorAll('.week-col-time-slot');
    notesOfDay(col.dataset.day).forEach(n => {
      const h = parseInt(n.time, 10);
      const idx = Math.min(slots.length - 1, Math.max(0, Math.floor((h - 8) / 2)));
      slots[idx].appendChild(mkChip(n, false));
    });
  });
}

function renderDayNotes() {
  document.querySelectorAll('.day-timeline-hour').forEach(row => {
    const box = row.querySelector('.day-hour-content');
    box.querySelectorAll('.cal-note-chip').forEach(e => e.remove());
    const notes = notesOfDay(activeDayNumber).filter(n => n.time.slice(0, 2) === row.dataset.hour.slice(0, 2));
    notes.forEach(n => {
      const chip = mkChip(n, false);
      const small = document.createElement('small');
      small.textContent = n.text;
      chip.appendChild(small);
      box.prepend(chip);
    });
    const hint = box.querySelector(':scope > span');
    if (hint) hint.style.display = notes.length ? 'none' : '';
  });
}

// Mensagem quando os filtros da view não deixam nenhum item
const emptyViewHtml = () => '<div class="view-empty"><span class="material-symbols-rounded">filter_alt_off</span><strong>Nenhum item nesta view</strong><span>Ajuste os filtros nas configurações da view.</span></div>';

function renderTableView() {
  const rows = sortedVisible().map(n => `
    <tr data-id="${n.id}">
      <td class="title">${n.title}</td>
      <td><span class="type-tag"><span class="material-symbols-rounded">${n.kind === 'quadro' ? 'space_dashboard' : 'description'}</span>${n.kind === 'quadro' ? 'Quadro' : 'Nota'}</span></td>
      <td class="muted">${n.folder}</td>
      <td class="muted">${String(n.day).padStart(2, '0')}/10/2026 ${n.time}</td>
      <td><span class="group-pill" data-group="${n.group}">${GROUP_LABEL[n.group]}</span></td>
      <td class="muted">${n.text}</td>
    </tr>`).join('');
  if (!rows) { dataTableView.innerHTML = emptyViewHtml(); return; }
  dataTableView.innerHTML = `
    <table class="notes-table">
      <thead><tr><th>Nome</th><th>Tipo</th><th>Pasta</th><th>Criada em</th><th>Grupo</th><th>Prévia</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderGalleryView() {
  const cards = sortedVisible().map(n => `
    <article class="gallery-card" data-group="${n.group}" data-id="${n.id}">
      <div class="gallery-cover${n.kind === 'quadro' ? ' has-thumb' : ''}">${n.kind === 'quadro' ? boardThumb(n) : `<span class="material-symbols-rounded">${GROUP_ICON[n.group]}</span>`}</div>
      <div class="gallery-body">
        <strong>${n.title}</strong>
        <p>${n.text}</p>
        <div class="gallery-meta"><span class="group-pill" data-group="${n.group}">${GROUP_LABEL[n.group]}</span><span>${n.day}/10 • ${n.time}</span></div>
      </div>
    </article>`).join('');
  if (!cards) { dataGalleryView.innerHTML = emptyViewHtml(); return; }
  dataGalleryView.innerHTML = `<div class="notes-gallery">${cards}</div>`;
}


