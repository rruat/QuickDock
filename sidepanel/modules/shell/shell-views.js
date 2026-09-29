// ── shell-views.js ───────────────────────────────────────────────────────────
// Definições de catálogo de visualizações (views) do Spatial Shell e utilitários
// de texto e busca para a Omnibar universal.

export const STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'com', 'por', 'para', 'pra', 'x', 'vs'
]);

export const SHELL_VIEWS = [
  { id: 'notes',     title: 'Notas',         icon: 'description',     desc: 'Editor de texto e sumário' },
  { id: 'bases',     title: 'Bases',         icon: 'table_rows',      desc: 'Tabela, Kanban, Galeria e Lista' },
  { id: 'board',     title: 'Espaço',        icon: 'space_dashboard', desc: 'Quadro espacial infinito' },
  { id: 'graph',     title: 'Constelações',  icon: 'hub',              desc: 'Grafo de conexões entre notas' },
  { id: 'calendar',  title: 'Calendário',    icon: 'calendar_today',   desc: 'Visão temporal de eventos e notas' },
  { id: 'docs',      title: 'Documentos',    icon: 'attach_file',      desc: 'Anexos e arquivos da nota' },
  { id: 'templates', title: 'Modelos',       icon: 'auto_stories',     desc: 'Galeria de modelos prontos' },
  { id: 'json',      title: 'JSON',          icon: 'data_object',      desc: 'Visualizador, editor e criador de JSON' },
  { id: 'settings',  title: 'Configurações', icon: 'settings',         desc: 'Preferências do Spatial Shell' }
];

export function normalizeStr(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function escapeHtml(str) {
  return (str || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeRegex(str) {
  return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightTokens(text, tokens) {
  if (!text) return '';
  let safe = escapeHtml(text);
  if (!tokens || tokens.length === 0) return safe;

  for (const token of tokens) {
    if (!token) continue;
    const cleanToken = normalizeStr(token);
    if (!cleanToken) continue;
    const re = new RegExp(`(${escapeRegex(token)})`, 'gi');
    safe = safe.replace(re, '<mark>$1</mark>');
  }
  return safe;
}
