// ── view-actions.js ─────────────────────────────────────────────────────────
// Operações sobre a lista de views de uma Base — PURAS (não mutam a entrada).
// Cada função devolve { views, defaultViewId, activeId? } ou o próprio baseDef atualizado.

import { duplicateView, newViewId, VIEW_TYPES } from './view-model.js';

const ids = views => views.map(v => v.id);

/** Move a view de `de` para `para` (índices). */
export function moveView(baseDef, de, para) {
  const views = [...baseDef.views];
  if (de === para || de < 0 || para < 0 || de >= views.length || para >= views.length) return baseDef;
  const [v] = views.splice(de, 1);
  views.splice(para, 0, v);
  return { ...baseDef, views };
}

/** Duplica a view logo após a original. Devolve { baseDef, newId }. */
export function duplicateViewAt(baseDef, viewId) {
  const i = baseDef.views.findIndex(v => v.id === viewId);
  if (i < 0) return { baseDef, newId: null };
  const copia = duplicateView(baseDef.views[i], ids(baseDef.views));
  copia.locked = false;
  const views = [...baseDef.views];
  views.splice(i + 1, 0, copia);
  return { baseDef: { ...baseDef, views }, newId: copia.id };
}

/** Exclui a view. Impede excluir a última. Devolve { baseDef, activeId }. */
export function deleteViewById(baseDef, viewId, activeId) {
  const i = baseDef.views.findIndex(v => v.id === viewId);
  if (i < 0 || baseDef.views.length <= 1) return { baseDef, activeId };
  const views = baseDef.views.filter(v => v.id !== viewId);
  const vizinha = views[Math.min(i, views.length - 1)].id;
  const defaultViewId = views.some(v => v.id === baseDef.defaultViewId) ? baseDef.defaultViewId : views[0].id;
  return {
    baseDef: { ...baseDef, views, defaultViewId },
    activeId: activeId === viewId ? vizinha : activeId,
  };
}

export const renameViewById = (baseDef, viewId, name) => ({
  ...baseDef,
  views: baseDef.views.map(v => (v.id === viewId ? { ...v, name: String(name).trim() || v.name } : v)),
});

export const setViewLocked = (baseDef, viewId, locked) => ({
  ...baseDef,
  views: baseDef.views.map(v => (v.id === viewId ? { ...v, locked: !!locked } : v)),
});

export const setViewIcon = (baseDef, viewId, icon) => ({
  ...baseDef,
  views: baseDef.views.map(v => {
    if (v.id !== viewId) return v;
    const { icon: _antigo, ...resto } = v;
    return icon ? { ...resto, icon } : resto;
  }),
});

export const setDefaultView = (baseDef, viewId) =>
  baseDef.views.some(v => v.id === viewId) ? { ...baseDef, defaultViewId: viewId } : baseDef;

/** Vizinha da view ativa para Alt+←/→ (circular). */
export function neighborViewId(baseDef, activeId, delta) {
  const n = baseDef.views.length;
  if (!n) return null;
  const i = Math.max(0, baseDef.views.findIndex(v => v.id === activeId));
  return baseDef.views[(i + delta + n) % n].id;
}

export { newViewId };

// ── Copiar/colar uma view entre Bases (via área de transferência, como JSON) ──

const MARCA = 'quickdock-base-view';
const LIMITE_BYTES = 200 * 1024;

/** Texto para a área de transferência: a view sem `id` (a cópia ganha um novo ao colar). */
export function serializeView(view) {
  const { id: _id, locked: _bloqueada, ...resto } = view || {};
  return JSON.stringify({ kind: MARCA, version: 1, view: resto });
}

/**
 * Lê o que veio da área de transferência. NUNCA confia no conteúdo: só aceita o formato próprio,
 * um tipo de view conhecido e tamanho razoável; chaves perigosas de protótipo são descartadas.
 * @returns {{ ok:true, view:Object } | { ok:false, motivo:string }}
 */
export function parseViewClipboard(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return { ok: false, motivo: 'A área de transferência está vazia.' };
  if (texto.length > LIMITE_BYTES) return { ok: false, motivo: 'Conteúdo grande demais para ser uma view.' };
  let dados;
  try { dados = JSON.parse(texto); } catch { return { ok: false, motivo: 'O que foi copiado não é uma view do QuickDock.' }; }
  if (!dados || dados.kind !== MARCA || !dados.view || typeof dados.view !== 'object') return { ok: false, motivo: 'O que foi copiado não é uma view do QuickDock.' };
  if (!(dados.view.type in VIEW_TYPES)) return { ok: false, motivo: `Tipo de view desconhecido: ${String(dados.view.type).slice(0, 30)}.` };
  const limpa = JSON.parse(JSON.stringify(dados.view, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v)));
  return { ok: true, view: limpa };
}

/** Adiciona a view colada ao fim, com id novo e nome "… (colada)" se o nome já existir. */
export function pasteViewInto(baseDef, view) {
  const id = newViewId(baseDef.views.map(v => v.id));
  const nomes = new Set(baseDef.views.map(v => v.name));
  const nome = nomes.has(view.name) ? `${view.name} (colada)` : (view.name || VIEW_TYPES[view.type].label);
  return { baseDef: { ...baseDef, views: [...baseDef.views, { ...view, id, name: nome }] }, newId: id };
}
