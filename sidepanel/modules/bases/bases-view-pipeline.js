// ── bases-view-pipeline.js ──────────────────────────────────────────────────
// O que acontece entre "as notas da Base" e "a view desenhada": filtrar (origem, filtros da view,
// filtros rápidos, busca), ordenar e despachar para o renderizador do tipo da view.
// Separado do container para o Dashboard poder desenhar VÁRIAS views (widgets) pelo mesmo caminho.

import { queryBaseNotes, sortBaseNotes } from './bases-engine.js';
import { renderBaseTableView } from './bases-table-view.js';
import { renderBaseBoardView } from './bases-board-view.js';
import { renderBaseGalleryView } from './bases-gallery-view.js';
import { renderBaseListView } from './bases-list-view.js';
import { renderBaseCalendarView } from './bases-calendar-view.js';
import { renderBaseChartView } from './bases-chart-view.js';
import { renderBaseTimelineView } from './bases-timeline-view.js';
import { renderBaseFeedView } from './bases-feed-view.js';
import { renderBaseMapView } from './bases-map-view.js';
import { renderBaseDashboardView } from './bases-dashboard-view.js';

/** Notas visíveis de uma view: origem + filtros da view + filtros rápidos + busca, depois ordenação. */
export function runViewPipeline(notasBase, view, schema, { source, quickFilters = [], search = '' } = {}) {
  const filtradas = queryBaseNotes(notasBase, {
    quickFilters,
    source,
    filters: view.filters,
    filterMode: view.filterMode,
    filterOperator: view.filterOperator,
    quickSearch: search,
  });
  return sortBaseNotes(filtradas, view.sort, schema);
}

const RENDERIZADORES = {
  board: renderBaseBoardView,
  gallery: renderBaseGalleryView,
  list: renderBaseListView,
  feed: renderBaseFeedView,
  timeline: renderBaseTimelineView,
  chart: renderBaseChartView,
  calendar: renderBaseCalendarView,
  dashboard: renderBaseDashboardView,
  table: renderBaseTableView,
};

/** Desenha a view em `host`. O mapa é assíncrono (carrega o Leaflet) e nunca derruba a Base. */
export function renderViewByType(host, view, notes, schema, callbacks) {
  if (view.type === 'map') {
    renderBaseMapView(host, notes, schema, view, callbacks).catch(err => console.warn('Mapa:', err));
    return;
  }
  (RENDERIZADORES[view.type] || renderBaseTableView)(host, notes, schema, view, callbacks);
}
