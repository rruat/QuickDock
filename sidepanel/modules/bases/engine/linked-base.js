// ── linked-base.js ──────────────────────────────────────────────────────────
// View vinculada: uma Base cuja ORIGEM (`source.base`) é outra Base. Ela mostra as notas da Base
// de origem (mesma pasta/tag/propriedade e mesmas definições de propriedade) com views, filtros
// e ordenação próprios. A definição da Base de origem só é LIDA — nunca editada daqui. PURO.

import { parseYamlOrJson } from '../bases-yaml.js';
import { normalizeBaseDefinition } from '../bases-schema.js';

/** Notas que contêm uma Base (candidatas a origem). `content` = markdown da nota. */
export function findBaseNotes(notes, excludeUid = null) {
  return notes.filter(n => n.uid && n.uid !== excludeUid && /(^|\n)\s*```\s*(base|database)\b/i.test(n.content || ''));
}

/**
 * Lê a definição da Base de origem a partir dos blocos da nota. Origem encadeada
 * (a origem também ser vinculada) é ignorada: evita ciclos e ambiguidade.
 * @returns {{ source:Object, properties:Object, name:string } | null}
 */
export function readLinkedDefinition(blocks) {
  const b = (blocks || []).find(x => x?.type === 'base');
  if (!b) return null;
  const def = normalizeBaseDefinition(parseYamlOrJson(b.config || ''));
  const { base: _encadeada, ...source } = def.source && typeof def.source === 'object' ? def.source : {};
  return { source, properties: def.properties || {}, name: def.name || '' };
}

/** Origem efetiva: a da Base de origem (se vinculada e carregada) ou a própria. */
export function effectiveSource(baseDef, linked) {
  if (baseDef?.source?.base) return linked ? linked.source : { all: true };
  return baseDef?.source || {};
}

/** Definições de propriedade efetivas: as da origem, sobrepostas pelas desta Base. */
export function effectiveProperties(baseDef, linked) {
  return { ...(linked?.properties || {}), ...(baseDef?.properties || {}) };
}
