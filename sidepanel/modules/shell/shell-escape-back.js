// ── shell-escape-back.js ────────────────────────────────────────────────────
// Esc fecha a nota ou o quadro e volta às views (mesmo caminho do botão "voltar", com a
// animação de encolher). Não age enquanto algo está em edição ou há um diálogo aberto.

const BACK_SEL = { notes: '#section-note', board: '#board-view' };

const isEditing = el => !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

export function initEscapeBack() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const sel = BACK_SEL[document.documentElement.dataset.shellFocus];
    if (!sel || isEditing(document.activeElement) || isEditing(e.target)) return;
    if (document.querySelector('dialog[open], [role="dialog"]:not([hidden]), .modal-overlay:not([hidden])')) return;
    const back = document.querySelector(`${sel} > .section-header .btn-back-views`);
    if (!back) return;
    e.preventDefault();
    back.click();
  });
}
