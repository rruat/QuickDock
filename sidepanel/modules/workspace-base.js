// ── workspace-base.js ───────────────────────────────────────────────────────
// Guarda a Base única do workspace e a view ativa (localStorage) e avisa a tela por eventos:
//  • quickdock:workspace-base-saved   — qualquer gravação (a lista de views da aside se redesenha)
//  • quickdock:workspace-base-changed — gravação feita de FORA do painel (aside): o painel remonta
//  • quickdock:workspace-active-view-changed — a view ativa mudou ({ detail: { id } })
// Rascunho: o painel grava as mudanças (filtros, tipo, ordenação…) num RASCUNHO em memória; só
// `commitWorkspaceDraft()` leva ao localStorage. Recarregar a página descarta o rascunho.
//  • quickdock:workspace-draft-changed — o rascunho mudou (barra "modificada" e ponto da lista)
// A lógica da Base em si fica em workspace-base-model.js (pura e testada).

import {
  parseWorkspaceDef, workspaceDefToYaml, defaultWorkspaceDef, resolveActiveViewId,
  isWorkspaceModified, modifiedViewIds, saveDraftAsNewView,
} from './workspace-base-model.js';

const KEY_DEF = 'quickdock:workspace-base';
const KEY_ACTIVE = 'quickdock:workspace-active-view';

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* sem storage: vale só nesta sessão */ } };
const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail }));

/** YAML da Base do workspace COM o rascunho (é o que a tela mostra); a inicial se não houver. */
export function loadWorkspaceYaml() {
  return draftYaml ?? loadSavedWorkspaceYaml();
}

export const loadWorkspaceDef = () => parseWorkspaceDef(loadWorkspaceYaml());
export const loadSavedWorkspaceDef = () => parseWorkspaceDef(loadSavedWorkspaceYaml());

let draftYaml = null; // null = sem rascunho (vale a Base salva)

/** YAML salvo, ignorando o rascunho. */
export function loadSavedWorkspaceYaml() {
  return read(KEY_DEF) || workspaceDefToYaml(defaultWorkspaceDef());
}

/** `silent`: gravação feita pelo próprio painel (não precisa remontar). */
export function saveWorkspaceYaml(yaml, { silent = false } = {}) {
  write(KEY_DEF, yaml);
  draftYaml = null; // gravar direto (ações estruturais da aside) substitui qualquer rascunho
  emit('quickdock:workspace-base-saved');
  emit('quickdock:workspace-draft-changed');
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

// ── Rascunho ──

/** O painel mudou algo: vai para o rascunho (a Base salva fica como estava). */
export function saveWorkspaceDraft(yaml) {
  draftYaml = yaml;
  emit('quickdock:workspace-draft-changed');
}

export const isWorkspaceDraftModified = () =>
  draftYaml !== null && isWorkspaceModified(loadSavedWorkspaceDef(), parseWorkspaceDef(draftYaml));

/** Ids das views com alterações não salvas (ponto na lista). */
export const getModifiedViewIds = () =>
  draftYaml === null ? [] : modifiedViewIds(loadSavedWorkspaceDef(), parseWorkspaceDef(draftYaml));

/** Salvar: o rascunho vira a Base salva (sem remontar: a tela já está assim). */
export function commitWorkspaceDraft() {
  if (draftYaml === null) return;
  write(KEY_DEF, draftYaml);
  draftYaml = null;
  emit('quickdock:workspace-base-saved');
  emit('quickdock:workspace-draft-changed');
}

/** Descartar: volta ao salvo e a tela remonta. */
export function discardWorkspaceDraft() {
  if (draftYaml === null) return;
  draftYaml = null;
  emit('quickdock:workspace-draft-changed');
  emit('quickdock:workspace-base-changed');
}

/** Salvar como nova view: a view ativa do rascunho vira uma view nova; o resto volta ao salvo. */
export function saveDraftAsNewWorkspaceView(activeId = getActiveViewId()) {
  if (draftYaml === null) return null;
  const r = saveDraftAsNewView(loadSavedWorkspaceDef(), parseWorkspaceDef(draftYaml), activeId);
  setActiveViewId(r.id);
  saveWorkspaceDef(r.def); // grava, zera o rascunho e remonta
  return r.id;
}

// ── Sincronização (ver workspace-base-sync.js) ──

const KEY_BACKUP = 'quickdock:workspace-base-conflict';

/** Callbacks que o sincronizador usa para ler/gravar a Base SALVA deste aparelho. */
export const workspaceSyncLocal = {
  ler: () => read(KEY_DEF), // null enquanto a pessoa nunca mexeu: a Base inicial não sobe
  gravar: yaml => saveWorkspaceYaml(yaml), // remonta a tela com a Base vinda do outro aparelho
  guardarCopia: yaml => write(KEY_BACKUP, yaml),
};
