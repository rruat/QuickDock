// ── bases-bulk-controller.js ────────────────────────────────────────────────
// Seleção e edição em lote de uma Base: guarda a seleção, desenha a barra de ações e executa
// (com confirmação) as ações sobre as notas. O container só liga: `sync()` a cada redesenho.
// A regra de cada ação está em engine/bulk-actions.js (pura); a barra, em ui/bulk-bar.js.

import { renderBulkBar } from './ui/bulk-bar.js';
import { buildBulkPatch, describeBulkAction } from './engine/bulk-actions.js';
import { updateNoteMetaById, deleteNoteRecordById } from '../storage.js';

/**
 * @param {HTMLElement} host  onde a barra aparece
 * @param {{ getNotes:()=>Array, onChanged:()=>void }} deps  onChanged = pedir redesenho da view
 */
export function createBulkController(host, { getNotes, onChanged }) {
  host.className = 'base-bulkbar';
  host.hidden = true;
  const selecao = new Set();
  let schema = {};

  async function executa(acao) {
    const alvos = getNotes().filter(n => selecao.has(n.id));
    if (!alvos.length) return;
    const resumo = describeBulkAction(acao, alvos.length);
    const aviso = acao.kind === 'delete'
      ? `${resumo}?\n\nEsta ação não pode ser desfeita.\n\n${alvos.slice(0, 8).map(n => `• ${n.title || 'Sem título'}`).join('\n')}${alvos.length > 8 ? `\n… e mais ${alvos.length - 8}` : ''}`
      : `${resumo}?`;
    if (!window.confirm(aviso)) return;
    try {
      for (const n of alvos) {
        if (acao.kind === 'delete') { await deleteNoteRecordById(n.id); continue; }
        const patch = buildBulkPatch(n, acao);
        if (patch) await updateNoteMetaById(n.id, patch);
      }
      if (acao.kind === 'delete') selecao.clear();
      document.dispatchEvent(new CustomEvent('quickdock:note-updated', { detail: { bulk: true } }));
    } catch (err) {
      console.error('Erro na edição em lote:', err);
      window.alert('Não foi possível concluir a ação em todas as notas. Verifique e tente de novo.');
    }
  }

  const desenha = () => renderBulkBar(host, { count: selecao.size, schema }, {
    onClear: () => { selecao.clear(); onChanged(); },
    onAction: executa,
  });

  return {
    selection: selecao,
    onSelectionChange: desenha,
    /** Chamado a cada redesenho: poda a seleção (notas que sumiram, view sem seleção) e atualiza a barra. */
    sync(view, novoSchema) {
      schema = novoSchema;
      const existentes = new Set(getNotes().map(n => n.id));
      for (const id of [...selecao]) if (!existentes.has(id)) selecao.delete(id);
      if (view?.type !== 'table' || !view.layout?.selectable) selecao.clear();
      desenha();
    },
  };
}
