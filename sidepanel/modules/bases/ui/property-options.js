// ── property-options.js ─────────────────────────────────────────────────────
// Listas de propriedades para os seletores do painel de configuração — PURO.

const SISTEMA_DE_DATA = [
  { key: 'createdAt', label: 'Criado em', type: 'datetime', isSystem: true },
  { key: 'updatedAt', label: 'Modificado em', type: 'datetime', isSystem: true },
];

const ehTipoData = t => t === 'date' || t === 'datetime' || t === 'daterange';

/**
 * Propriedades que servem como data (início/fim) numa view de calendário.
 * Ordem: datas do usuário → criado/modificado (sistema) → demais propriedades
 * (texto com "2026-10-06" também funciona, mas vem por último).
 * @returns {Array<{ key, label, type, isSystem?:boolean, group: 'data'|'sistema'|'outras' }>}
 */
export function dateProperties(schema = {}) {
  const todas = Object.entries(schema).map(([key, def]) => ({
    key: def?.key || key,
    label: def?.label || def?.name || key,
    type: def?.type || 'text',
    isSystem: !!def?.isSystem,
  }));

  const dataDoUsuario = todas.filter(p => ehTipoData(p.type) && !p.isSystem).map(p => ({ ...p, group: 'data' }));
  const sistema = SISTEMA_DE_DATA.map(p => ({ ...p, group: 'sistema' }));
  const usadas = new Set([...dataDoUsuario, ...sistema].map(p => p.key));
  const outras = todas
    .filter(p => !usadas.has(p.key) && !p.isSystem && p.type !== 'title')
    .map(p => ({ ...p, group: 'outras' }));
  return [...dataDoUsuario, ...sistema, ...outras];
}

/** Propriedades usáveis em "Colorir por": as que têm poucos valores distintos (seleção, lista, status, texto). */
export function colorableProperties(schema = {}) {
  return Object.entries(schema)
    .map(([key, def]) => ({ key: def?.key || key, label: def?.label || def?.name || key, type: def?.type || 'text', isSystem: !!def?.isSystem }))
    .filter(p => p.key === 'folder' || p.key === 'tags'
      || (p.key !== 'title' && !['date', 'datetime', 'daterange', 'number', 'tasks', 'checkbox'].includes(p.type)));
}

/** Todas as propriedades (menos o título), pra escolher quais aparecem no cartão. */
export function allProperties(schema = {}) {
  return Object.entries(schema)
    .map(([key, def]) => ({ key: def?.key || key, label: def?.label || def?.name || key, type: def?.type || 'text', isSystem: !!def?.isSystem }))
    .filter(p => p.key !== 'title');
}
