// Impressão / "Salvar como PDF" da nota aberta, pelo diálogo de impressão do
// próprio navegador. O visual do que sai no papel mora em css/25-print.css —
// aqui só o botão no cabeçalho da nota, a escolha Retrato | Paisagem (A4) e o
// @page que aplica a orientação.

const STORAGE_KEY = 'quickdock:note-print-orientation';

const headerBar = document.getElementById('note-header-bar');
const colorBtn = document.getElementById('btn-note-header-color');

let orientation = 'portrait';
try {
  if (localStorage.getItem(STORAGE_KEY) === 'landscape') orientation = 'landscape';
} catch {}

// O tamanho da página só pode ser definido por @page — então um <style> próprio,
// reescrito sempre que a orientação muda.
const pageStyleEl = document.createElement('style');
pageStyleEl.id = 'note-print-page-style';
document.head.appendChild(pageStyleEl);

function applyPageStyle() {
  pageStyleEl.textContent = `@page { size: A4 ${orientation}; margin: 14mm; }`;
}

let popoverEl = null;
let printBtn = null;

function setOrientation(value) {
  orientation = value === 'landscape' ? 'landscape' : 'portrait';
  try { localStorage.setItem(STORAGE_KEY, orientation); } catch {}
  applyPageStyle();
  if (!popoverEl) return;
  popoverEl.querySelectorAll('[data-orientation]').forEach((btn) => {
    const active = btn.dataset.orientation === orientation;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function closePopover() {
  if (popoverEl) popoverEl.hidden = true;
  printBtn?.setAttribute('aria-expanded', 'false');
}

function positionPopover() {
  const rect = printBtn.getBoundingClientRect();
  const width = popoverEl.offsetWidth || 240;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  popoverEl.style.top = `${rect.bottom + 6}px`;
  popoverEl.style.left = `${left}px`;
}

function togglePopover() {
  if (!popoverEl.hidden) { closePopover(); return; }
  popoverEl.hidden = false;
  positionPopover();
  printBtn.setAttribute('aria-expanded', 'true');
}

function printNote() {
  closePopover();
  applyPageStyle();
  // Deixa o popover sumir do DOM renderizado antes do navegador tirar a "foto".
  setTimeout(() => window.print(), 50);
}

function buildPopover() {
  const el = document.createElement('div');
  el.className = 'note-print-popover';
  el.hidden = true;
  el.innerHTML = `
    <div class="note-print-title">Imprimir ou salvar em PDF</div>
    <div class="note-sidebar-tabs note-print-orientation" role="tablist" aria-label="Orientação da página">
      <button type="button" class="note-sidebar-tab" role="tab" data-orientation="portrait">
        <span class="note-sidebar-tab-title">Retrato</span>
      </button>
      <button type="button" class="note-sidebar-tab" role="tab" data-orientation="landscape">
        <span class="note-sidebar-tab-title">Paisagem</span>
      </button>
    </div>
    <button type="button" class="note-print-go">
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">print</span>
      <span>Imprimir / Salvar PDF</span>
    </button>
    <div class="note-print-hint">Papel A4. Para PDF, escolha “Salvar como PDF” no destino da impressão.</div>
  `;
  el.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-orientation]');
    if (opt) { setOrientation(opt.dataset.orientation); return; }
    if (e.target.closest('.note-print-go')) printNote();
  });
  document.body.appendChild(el);
  return el;
}

function mount() {
  if (!headerBar) return;
  printBtn = document.createElement('button');
  printBtn.id = 'btn-note-print';
  printBtn.type = 'button';
  printBtn.className = 'icon-btn note-header-print-btn';
  printBtn.title = 'Imprimir ou salvar em PDF';
  printBtn.setAttribute('aria-label', 'Imprimir ou salvar em PDF');
  printBtn.setAttribute('aria-haspopup', 'true');
  printBtn.setAttribute('aria-expanded', 'false');
  printBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">print</span>';
  headerBar.insertBefore(printBtn, colorBtn || null);

  popoverEl = buildPopover();
  setOrientation(orientation);

  printBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePopover(); });
  document.addEventListener('mousedown', (e) => {
    if (popoverEl.hidden) return;
    if (popoverEl.contains(e.target) || printBtn.contains(e.target)) return;
    closePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popoverEl.hidden) closePopover();
  });
  window.addEventListener('resize', () => { if (!popoverEl.hidden) positionPopover(); });
}

mount();
// Ctrl+P direto também sai com a orientação escolhida.
window.addEventListener('beforeprint', applyPageStyle);
