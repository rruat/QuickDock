// ── note-pagebreak.js ───────────────────────────────────────────────────────
// Bloco de quebra de página (e "página em branco"). No editor é só uma linha tracejada com um rótulo,
// sem texto editável (como o divisor); na impressão e na visualização de páginas ele força a página nova
// (ver 25-print.css). No arquivo é <div style="page-break-after: always;"></div> — ver blocks.js.

export function buildPageBreak() {
  const el = document.createElement('div');
  el.className = 'block block-pagebreak';
  el.contentEditable = 'false';
  el.innerHTML = '<span class="pagebreak-line" aria-hidden="true"></span>'
    + '<span class="pagebreak-label"></span>'
    + '<span class="pagebreak-line" aria-hidden="true"></span>';
  setPageBreakBlank(el, false);
  return el;
}

/** "Página em branco" deixa uma página inteira vazia entre duas quebras. */
export function setPageBreakBlank(el, blank) {
  if (blank) el.dataset.blank = 'true';
  else delete el.dataset.blank;
  const rotulo = el.querySelector('.pagebreak-label');
  if (rotulo) rotulo.textContent = blank ? 'Página em branco' : 'Quebra de página';
}
