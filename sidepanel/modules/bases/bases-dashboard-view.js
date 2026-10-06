// ── bases-dashboard-view.js ─────────────────────────────────────────────────
// View "Dashboard": uma página de WIDGETS, cada um é outra view da mesma Base (gráfico, número,
// lista, tabela…), desenhada pelo mesmo caminho da view normal (filtros, ordenação, cor…).
// Config: widgets: [{ view: <id da view>, span: 1|2|3 }]  ·  layout.columns: 2|3|4.

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export function resolveDashboardConfig(view = {}) {
  const colunas = [2, 3, 4].includes(Number(view.layout?.columns)) ? Number(view.layout.columns) : 2;
  const widgets = (Array.isArray(view.widgets) ? view.widgets : [])
    .filter(w => w && typeof w.view === 'string' && w.view)
    .map(w => ({ view: w.view, span: Math.min(colunas, Math.max(1, Math.round(Number(w.span)) || 1)), height: [240, 320, 420, 520].includes(Number(w.height)) ? Number(w.height) : 320 }));
  return { columns: colunas, widgets };
}

export function renderBaseDashboardView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.className = 'base-view-container base-dashboard-container';
  container.replaceChildren();
  const cfg = resolveDashboardConfig(viewConfig);

  if (!cfg.widgets.length) {
    const v = el('div', 'bch-empty');
    v.appendChild(el('p', '', 'Este dashboard ainda não tem widgets. Cada widget mostra outra view desta Base.'));
    const b = el('button', 'bset-btn', 'Configurar view'); b.type = 'button';
    b.addEventListener('click', () => callbacks.onOpenSettings?.());
    v.appendChild(b);
    container.appendChild(v);
    return;
  }

  const grade = el('div', 'bdash-grid');
  grade.style.setProperty('--bdash-cols', String(cfg.columns));
  for (const w of cfg.widgets) {
    const card = el('section', 'bdash-widget');
    card.style.gridColumn = `span ${w.span}`;
    card.style.setProperty('--bdash-h', `${w.height}px`);
    const corpo = el('div', 'bdash-widget-body');
    card.appendChild(corpo);
    grade.appendChild(card);
    // cada widget é uma view completa; falha de um não derruba o resto
    try { callbacks.renderWidget?.(corpo, w.view); } catch (err) { console.warn('Dashboard: widget com erro', err); corpo.textContent = 'Não foi possível desenhar este widget.'; }
  }
  container.appendChild(grade);
}
