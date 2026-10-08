// ── workspace-base.js ───────────────────────────────────────────────────────
// Guarda a Base única do workspace e a view ativa (localStorage) e avisa a tela por eventos:
//  • quickdock:workspace-base-saved   — qualquer gravação (a lista de views da aside se redesenha)
//  • quickdock:workspace-base-changed — gravação feita de FORA do painel (aside): o painel remonta
//  • quickdock:workspace-active-view-changed — a view ativa mudou ({ detail: { id } })
// A lógica da Base em si fica em workspace-base-model.js (pura e testada).

import { parseWorkspaceDef, workspaceDefToYaml, defaultWorkspaceDef, resolveActiveViewId } from './workspace-base-model.js';

const KEY_DEF = 'quickdock:workspace-base';
const KEY_ACTIVE = 'quickdock:workspace-active-view';

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* sem storage: vale só nesta sessão */ } };
const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail }));

/** YAML da Base do workspace (a inicial, se ainda não houver). */
export function loadWorkspaceYaml() {
  return read(KEY_DEF) || workspaceDefToYaml(defaultWorkspaceDef());
}

export const loadWorkspaceDef = () => parseWorkspaceDef(loadWorkspaceYaml());

/** `silent`: gravação feita pelo próprio painel (não precisa remontar). */
export function saveWorkspaceYaml(yaml, { silent = false } = {}) {
  write(KEY_DEF, yaml);
  emit('quickdock:workspace-base-saved');
  if (!silent) emit('quickdock:workspace-base-changed');
}

export function saveWorkspaceDef(def, opts) {
  saveWorkspaceYaml(workspaceDefToYaml(def), opts);
}

export function getActiveViewId(def = loadWorkspaceDef()) {
  return resolveActiveViewId(def, read(KEY_ACTIVE));
}

export function setActiveViewId(id) {
  if (!id || read(KEY_ACTIVE) === id) return;
  write(KEY_ACTIVE, id);
  emit('quickdock:workspace-active-view-changed', { id });
}
