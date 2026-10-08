// ── workspace-base-sync.js ──────────────────────────────────────────────────
// Sincroniza a configuração da Base do workspace (as views e seus filtros) entre aparelhos.
// Ela não é uma nota: vai como um arquivo à parte, `configuracao/workspace.json`, escrito pelo
// mesmo adaptador (pasta local ou Drive) que leva notas, quadros e modelos. O motor de notas
// ignora esse caminho; quem o trata é este módulo, uma vez por rodada, depois do motor.
//
// Regra de 3 vias, com o hash do último texto em que os dois lados concordaram (`baseHash`):
//   só o local mudou → sobe · só o remoto mudou → baixa · os dois mudaram → o REMOTO vence e o
//   local vira cópia de segurança (a Base é configuração, não conteúdo: perder uma view
//   alterada é menos grave que bifurcar a configuração entre aparelhos).
// A lógica não toca DOM nem localStorage: recebe callbacks (testável com MemorySyncAdapter).

import { hashConteudo } from './sync-engine.js';

export const CAMINHO_CONFIG_WORKSPACE = 'configuracao/workspace.json';
export const META_HASH_WORKSPACE = 'workspaceBaseSyncedHash';

export function serializarConfigWorkspace(yaml) {
  return JSON.stringify({ quickdock: 1, tipo: 'workspace-base', atualizadoEm: new Date().toISOString(), yaml }, null, 2);
}

/** Texto do arquivo → YAML da Base, ou null se não for um arquivo válido deste formato. */
export function lerConfigWorkspace(texto) {
  try {
    const o = JSON.parse(texto);
    return o && o.tipo === 'workspace-base' && typeof o.yaml === 'string' && o.yaml.trim() ? o.yaml : null;
  } catch { return null; }
}

/**
 * O que fazer, dados os hashes (null = não existe): 'nada' | 'subir' | 'baixar' | 'conflito'
 * ('conflito' baixa o remoto, depois de guardar o local como cópia de segurança).
 */
export function decidirSyncWorkspace({ localHash, baseHash, remoteHash }) {
  if (remoteHash === null) return localHash === null ? 'nada' : 'subir';
  if (localHash === null) return 'baixar';
  if (localHash === remoteHash) return 'nada';
  if (remoteHash === baseHash) return 'subir';      // só o local mudou
  if (localHash === baseHash) return 'baixar';      // só o remoto mudou
  return 'conflito';
}

/**
 * Uma rodada. `local`: { ler(): yaml|null, gravar(yaml), guardarCopia(yaml) }
 * `meta`: { obter(chave), salvar(chave, valor) }.
 * @returns {Promise<'nada'|'subiu'|'baixou'|'conflito'|'adiado'>}
 */
export async function sincronizarConfigWorkspace(adapter, local, meta) {
  const yamlLocal = local.ler();
  const arq = await adapter.ler(CAMINHO_CONFIG_WORKSPACE);
  const yamlRemoto = arq ? lerConfigWorkspace(arq.texto) : null;
  // arquivo remoto existe mas é ilegível (outra versão/corrompido): não sobrescreve nem baixa
  if (arq && yamlRemoto === null) return 'nada';

  const hash = y => (y === null || y === undefined ? null : hashConteudo(y));
  const acao = decidirSyncWorkspace({
    localHash: hash(yamlLocal),
    baseHash: (await meta.obter(META_HASH_WORKSPACE)) ?? null,
    remoteHash: hash(yamlRemoto),
  });

  if (acao === 'nada') {
    if (yamlLocal !== null && yamlRemoto !== null) await meta.salvar(META_HASH_WORKSPACE, hash(yamlLocal));
    return 'nada';
  }
  if (acao === 'subir') {
    const r = await adapter.escrever(CAMINHO_CONFIG_WORKSPACE, serializarConfigWorkspace(yamlLocal), arq?.rev ?? null);
    if (r?.conflito) return 'adiado'; // alguém escreveu no meio: a próxima rodada decide
    await meta.salvar(META_HASH_WORKSPACE, hash(yamlLocal));
    return 'subiu';
  }
  if (acao === 'conflito') local.guardarCopia(yamlLocal);
  local.gravar(yamlRemoto);
  await meta.salvar(META_HASH_WORKSPACE, hash(yamlRemoto));
  return acao === 'conflito' ? 'conflito' : 'baixou';
}
