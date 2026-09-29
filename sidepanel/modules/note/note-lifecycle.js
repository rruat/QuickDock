// ── note-lifecycle.js ────────────────────────────────────────────────────────
// Gestão de ciclo de vida, persistência e exportação do editor de notas.
// Centraliza rotinas de salvamento, indexação de referências e eventos de sincronização.

let indicatorTimer = null;

/**
 * Exibe o feedback visual de nota salva com ícone de confirmação.
 * @param {HTMLElement} indicator Elemento de status no DOM
 * @param {Function} iconSvg Gerador de SVG de ícone
 */
export function showSavedIndicator(indicator, iconSvg) {
  if (!indicator) return;
  indicator.innerHTML = `salvo ${iconSvg('check')}`;
  indicator.classList.add('visible');
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => indicator.classList.remove('visible'), 2200);
}

/**
 * Verifica se o editor de notas possui foco ativo no momento.
 * @param {HTMLElement} noteEditorEl Container do editor
 * @returns {boolean}
 */
export function isEditorFocusedHelper(noteEditorEl) {
  return !!noteEditorEl?.contains(document.activeElement);
}

/**
 * Determina se a nota ativa pode ser recarregada sem risco de perda de dados.
 * @param {boolean} isEditingTemplate 
 * @param {boolean} isFocused 
 * @param {boolean} hasPending 
 * @returns {boolean}
 */
export function canSafelyReloadHelper(isEditingTemplate, isFocused, hasPending) {
  return !isEditingTemplate && !isFocused && !hasPending;
}

/**
 * Exporta blocos para formato Markdown com imagens embutidas em DataURL (Base64).
 * @param {Array} blocks Lista de blocos
 * @param {Function} loadFileBlob Função assíncrona para buscar o Blob
 * @param {Function} blocksToMarkdownForExport Serializador
 * @returns {Promise<string>}
 */
export async function blocksToExportMarkdownHelper(blocks, loadFileBlob, blocksToMarkdownForExport) {
  return blocksToMarkdownForExport(blocks, async fileId => {
    const blob = await loadFileBlob(fileId);
    if (!blob) return null;
    return new Promise(resolve => {
      const leitor = new FileReader();
      leitor.onload  = () => resolve(leitor.result);
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  });
}

/**
 * Reindexa no banco local todos os links e referências bidirecionais contidos na nota.
 * @param {number|string} noteId ID da nota
 * @param {Array} blocks Lista de blocos serializados
 * @param {Object} deps Dependências de storage e resolução de links
 */
export async function indexNoteLinksHelper(noteId, blocks, {
  getNoteById,
  loadAllNotesMeta,
  extrairLinksDeBlocos,
  resolverLinks,
  salvarLinksDaNota,
  refreshBacklinks,
}) {
  try {
    const note = await getNoteById(noteId);
    if (note && note.uid) {
      const todasNotas = await loadAllNotesMeta();
      const refs = extrairLinksDeBlocos(blocks);
      const linksResolvidos = resolverLinks(refs, note.uid, todasNotas);
      await salvarLinksDaNota(note.uid, linksResolvidos);
      if (typeof refreshBacklinks === 'function') {
        await refreshBacklinks(noteId);
      }
    }
  } catch (err) {
    console.warn('Erro ao indexar links da nota:', err);
  }
}

/**
 * Emite evento global avisando que as notas foram modificadas (para Grafo/Constelações).
 */
export function dispatchNotesChangedEvent() {
  document.dispatchEvent(new CustomEvent('quickdock:notes-changed'));
}

/**
 * Emite evento global comunicando a troca de nota ativa.
 * @param {number|string|null} id ID da nova nota ativa ou null
 */
export function dispatchActiveNoteChangedEvent(id) {
  document.dispatchEvent(new CustomEvent('quickdock:active-note-changed', { detail: { id } }));
}
