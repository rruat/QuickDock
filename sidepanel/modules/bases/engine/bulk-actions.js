// ── bulk-actions.js ─────────────────────────────────────────────────────────
// Edição em lote: transforma uma ação + uma nota no "patch" de metadados a gravar — PURO.
// Ações: { kind:'setProperty', key, value, type } · { kind:'clearProperty', key } ·
//        { kind:'addTag', tag } · { kind:'removeTag', tag } · { kind:'moveFolder', pasta }

const limpaTag = t => String(t ?? '').trim().replace(/^#/, '');

/** Tags guardadas em properties.tags (lista ou "a, b"). As tags inline no texto não são tocadas. */
function tagsDaPropriedade(props) {
  const bruto = props?.tags ?? props?.tag;
  if (Array.isArray(bruto)) return bruto.map(limpaTag).filter(Boolean);
  if (typeof bruto === 'string') return bruto.split(',').map(limpaTag).filter(Boolean);
  return [];
}

/** @returns {Object|null} patch p/ updateNoteMetaById, ou null se a ação não muda nada */
export function buildBulkPatch(note, action) {
  // Quadros (itens da Base do workspace) só têm título e pasta: propriedades e tags não se aplicam
  if (note?.isBoard && action.kind !== 'moveFolder') return null;
  const props = { ...(note.properties || {}) };
  const tipos = { ...(note.propertyTypes || {}) };
  switch (action.kind) {
    case 'setProperty': {
      if (!action.key || action.value === null || action.value === undefined) return null;
      if (props[action.key] === action.value) return null;
      props[action.key] = action.value;
      if (action.type) tipos[action.key] = action.type;
      return { properties: props, propertyTypes: tipos };
    }
    case 'clearProperty': {
      if (!(action.key in props)) return null;
      delete props[action.key];
      return { properties: props, propertyTypes: tipos };
    }
    case 'addTag': {
      const tag = limpaTag(action.tag);
      if (!tag) return null;
      const atuais = tagsDaPropriedade(props);
      if (atuais.includes(tag)) return null;
      props.tags = [...atuais, tag];
      delete props.tag;
      return { properties: props, propertyTypes: { ...tipos, tags: 'list' } };
    }
    case 'removeTag': {
      const tag = limpaTag(action.tag);
      const atuais = tagsDaPropriedade(props);
      if (!tag || !atuais.includes(tag)) return null;
      props.tags = atuais.filter(t => t !== tag);
      if (!props.tags.length) delete props.tags;
      return { properties: props, propertyTypes: tipos };
    }
    case 'moveFolder': {
      const pasta = String(action.pasta ?? '').trim().replace(/^\/+|\/+$/g, '');
      if (pasta === String(note.pasta ?? '')) return null;
      return { pasta };
    }
    default: return null;
  }
}

/** Resumo legível da ação (para a confirmação e o aviso de conclusão). */
export function describeBulkAction(action, count) {
  const n = `${count} ${count === 1 ? 'nota' : 'notas'}`;
  switch (action.kind) {
    case 'setProperty': return `Definir "${action.key}" em ${n}`;
    case 'clearProperty': return `Limpar "${action.key}" em ${n}`;
    case 'addTag': return `Adicionar a tag #${limpaTag(action.tag)} a ${n}`;
    case 'removeTag': return `Remover a tag #${limpaTag(action.tag)} de ${n}`;
    case 'moveFolder': return `Mover ${n} para "${action.pasta || 'raiz'}"`;
    case 'delete': return `Excluir ${n} permanentemente`;
    default: return n;
  }
}
