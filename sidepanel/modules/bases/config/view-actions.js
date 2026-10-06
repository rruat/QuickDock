// ── view-actions.js ─────────────────────────────────────────────────────────
// Operações sobre a lista de views de uma Base — PURAS (não mutam a entrada).
// Cada função devolve { views, defaultViewId, activeId? } ou o próprio baseDef atualizado.

import { duplicateView, newViewId } from './view-model.js';

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
