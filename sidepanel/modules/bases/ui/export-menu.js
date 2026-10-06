// ── export-menu.js ──────────────────────────────────────────────────────────
// Botão "Exportar" do cabeçalho da Base: baixa as notas visíveis (depois dos filtros) da view
// ativa em CSV, Markdown ou JSON. As colunas são as propriedades visíveis da view.

import { toCsv, toMarkdownTable, toJson, exportFileName } from '../engine/export.js';
import { getViewProps } from '../config/view-model.js';

const TIPOS = {
  csv: { rotulo: 'CSV (Excel)', mime: 'text/csv;charset=utf-8', gerar: toCsv },
  md: { rotulo: 'Markdown (tabela)', mime: 'text/markdown;charset=utf-8', gerar: toMarkdownTable },
  json: { rotulo: 'JSON', mime: 'application/json;charset=utf-8', gerar: toJson },
};

/** Colunas exportadas: as da view (título primeiro); sem lista definida, título + as 5 primeiras. */
export function exportColumns(view, schema) {
  const props = getViewProps(view).filter(k => k in schema);
  const base = props.length ? props : Object.keys(schema).filter(k => !['tasks'].includes(k)).slice(0, 6);
  return ['title', ...base.filter(k => k !== 'title')];
}

export function downloadText(nome, conteudo, mime) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Itens de menu (rótulo + ação) para o menu "Exportar". `get()` devolve { notes, schema, view, baseName }. */
export function exportMenuItems(get) {
  return Object.entries(TIPOS).map(([ext, t]) => ({
    rotulo: `Exportar ${t.rotulo}`,
    acao: () => {
      const { notes, schema, view, baseName } = get();
      const texto = t.gerar(notes, exportColumns(view, schema), schema);
      downloadText(exportFileName(baseName, ext), texto, t.mime);
    },
  }));
}
