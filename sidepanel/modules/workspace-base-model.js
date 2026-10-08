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

/** Colunas das views novas do workspace: inclui o Tipo (nota ou quadro). */
const WORKSPACE_PROPS = ['title', 'kind', 'tags', 'updatedAt'];

/** Views que o usuário pode criar pela aside (ordem do seletor "Nova view"). */
export const NEW_VIEW_TYPES = ['calendar', 'table', 'gallery', 'explorer', 'board', 'list', 'timeline'];

/** Base inicial: origem = tudo; abre no calendário, como no mockup. */
export function defaultWorkspaceDef() {
  const views = [
    createView('calendar', { id: 'v_calendario', name: 'Calendário' }),
    createView('table', { id: 'v_tabela', name: 'Tabela', extra: { props: WORKSPACE_PROPS } }),
    createView('gallery', { id: 'v_galeria', name: 'Galeria', extra: { props: WORKSPACE_PROPS } }),
    createView('explorer', { id: 'v_explorador', name: 'Explorador' }),
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
  const comColunas = ['table', 'gallery', 'list', 'board'].includes(t);
  const view = createView(t, { id, name: nomeLivre(def, VIEW_TYPES[t].label), extra: comColunas ? { props: WORKSPACE_PROPS } : {} });
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

// ── Rascunho (fluxo "modificada" do mockup) ──
// Alterar tipo, filtros ou ordenação mexe no RASCUNHO; só "Salvar" grava na Base salva.

/** JSON canônico (chaves em ordem) sem os nomes: renomear salva na hora e nunca "suja". */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]);
    return o;
  }
  return v;
}
// Passa pelo YAML para que a Base montada em código e a relida do texto sejam comparáveis
const viaYaml = def => parseWorkspaceDef(workspaceDefToYaml(def));
function semNomes(def) {
  const d = viaYaml(def);
  return { ...d, name: undefined, views: d.views.map(v => ({ ...v, name: undefined })) };
}

/** O rascunho difere da Base salva? (ignora os nomes). */
export function isWorkspaceModified(savedDef, draftDef) {
  if (!savedDef || !draftDef) return false;
  return JSON.stringify(canon(semNomes(savedDef))) !== JSON.stringify(canon(semNomes(draftDef)));
}

/** Views cujo conteúdo (sem o nome) difere entre a salva e o rascunho — para o ponto da lista. */
export function modifiedViewIds(savedDef, draftDef) {
  if (!savedDef || !draftDef) return [];
  const key = v => JSON.stringify(canon({ ...v, name: undefined }));
  const draftViews = viaYaml(draftDef).views;
  const saved = new Map(viaYaml(savedDef).views.map(v => [v.id, key(v)]));
  const ids = new Set();
  for (const v of draftViews) if (saved.get(v.id) !== key(v)) ids.add(v.id);
  for (const id of saved.keys()) if (!draftViews.some(v => v.id === id)) ids.add(id);
  return [...ids];
}

/**
 * "Salvar como nova view": a view ativa do rascunho vira uma view nova na Base SALVA
 * (a original continua como estava). Devolve { def, id }.
 */
export function saveDraftAsNewView(savedDef, draftDef, activeId) {
  const src = draftDef.views.find(v => v.id === activeId) || draftDef.views[0];
  const id = newViewId(savedDef.views.map(v => v.id));
  const copia = { ...JSON.parse(JSON.stringify(src)), id, name: nomeLivre(savedDef, `${src.name || 'View'} (cópia)`) };
  return { def: { ...savedDef, views: [...savedDef.views, copia] }, id };
}
