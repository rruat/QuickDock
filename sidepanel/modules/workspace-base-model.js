// ── workspace-base-model.js ─────────────────────────────────────────────────
// A Base ÚNICA do workspace (padrão do mockup MKP/CAL.HTML): uma base de dados com todos os
// itens (notas e quadros); o que o usuário cria são as VIEWS dela (calendário, tabela,
// galeria…). Esta parte é PURA — sem DOM, sem localStorage — e reaproveita o modelo e as
// ações de view do motor de Bases.

import { parseYamlOrJson, stringifyBaseToYaml } from './bases/bases-yaml.js';
import { normalizeBaseDefinition } from './bases/bases-schema.js';
import { normalizeViews, createView, newViewId, VIEW_TYPES } from './bases/config/view-model.js';
import { duplicateViewAt, deleteViewById, renameViewById } from './bases/config/view-actions.js';

export const WORKSPACE_BASE_ID = 'workspace';

/** Views que o usuário pode criar pela aside (ordem do seletor "Nova view"). */
export const NEW_VIEW_TYPES = ['calendar', 'table', 'gallery', 'board', 'list', 'timeline'];

/** Base inicial: origem = tudo; abre no calendário, como no mockup. */
export function defaultWorkspaceDef() {
  const views = [
    createView('calendar', { id: 'v_calendario', name: 'Calendário' }),
    createView('table', { id: 'v_tabela', name: 'Tabela' }),
    createView('gallery', { id: 'v_galeria', name: 'Galeria' }),
  ];
  return normalizeViews({ name: 'Workspace', source: { all: true }, views, defaultViewId: 'v_calendario' });
}

/** Lê o YAML guardado; vazio ou inválido volta para a Base inicial (nunca quebra a tela). */
export function parseWorkspaceDef(yaml) {
  if (typeof yaml !== 'string' || !yaml.trim()) return defaultWorkspaceDef();
  try {
    const raw = parseYamlOrJson(yaml);
    if (!raw || !Array.isArray(raw.views) || raw.views.length === 0) return defaultWorkspaceDef();
    return normalizeViews(normalizeBaseDefinition(raw));
  } catch {
    return defaultWorkspaceDef();
  }
}

export const workspaceDefToYaml = def => stringifyBaseToYaml(def);

/** A view ativa guardada, se ainda existir; senão a padrão da Base. */
export function resolveActiveViewId(def, savedId) {
  return def.views.some(v => v.id === savedId) ? savedId : def.defaultViewId;
}

/** Nova view do tipo pedido, no fim. Devolve { def, id }. */
export function addWorkspaceView(def, type = 'table') {
  const t = type in VIEW_TYPES ? type : 'table';
  const id = newViewId(def.views.map(v => v.id));
  const view = createView(t, { id, name: nomeLivre(def, VIEW_TYPES[t].label) });
  return { def: { ...def, views: [...def.views, view] }, id };
}

/** "Calendário", "Calendário 2", "Calendário 3"… */
function nomeLivre(def, base) {
  const usados = new Set(def.views.map(v => v.name));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export const duplicateWorkspaceView = (def, id) => duplicateViewAt(def, id);

/** Exclui (a última view nunca é excluída). Devolve { def, activeId }. */
export function deleteWorkspaceView(def, id, activeId) {
  const r = deleteViewById(def, id, activeId);
  return { def: r.baseDef, activeId: r.activeId };
}

export const renameWorkspaceView = (def, id, name) => renameViewById(def, id, name);

// ── Busca na lista de views da aside ──
const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Filtra pelo nome ou pelo tipo da view (sem acento, sem diferenciar maiúsculas). */
export function filterWorkspaceViews(views, query) {
  const q = norm(query);
  if (!q) return views;
  return views.filter(v => norm(`${v.name || ''} ${VIEW_TYPES[v.type]?.label || ''}`).includes(q));
}
