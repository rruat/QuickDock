// ── note-page-numbering.js ──────────────────────────────────────────────────
// Numeração das páginas na visualização em páginas e na impressão a partir dela. A ABNT (NBR 14724) conta
// as páginas desde a capa, mas só mostra o número a partir da primeira página de texto, no canto superior
// direito: por isso há o "a partir da página N". A escolha fica neste aparelho.

const STORAGE_KEY = 'quickdock:note-print-pagenum';

export const NUMBER_MODES = {
  off:           { label: 'Sem numeração' },
  'top-right':   { label: 'Canto superior direito (ABNT)', box: '@top-right' },
  'bottom-center': { label: 'Rodapé centralizado', box: '@bottom-center' },
};

export const DEFAULT_NUMBERING = { mode: 'off', from: 1 };

export function normalizeNumbering(raw) {
  const mode = raw && NUMBER_MODES[raw.mode] ? raw.mode : DEFAULT_NUMBERING.mode;
  const n = Math.round(Number(raw?.from));
  return { mode, from: Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1 };
}

export function loadNumbering() {
  try { return normalizeNumbering(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return normalizeNumbering(null); }
}
export function saveNumbering(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeNumbering(s))); } catch {}
}

/** Regras de caixa de margem do @page (CSS Paged Media) que o Paged.js entende. */
export function numberingCss(state, fontCss = '') {
  const s = normalizeNumbering(state);
  const box = NUMBER_MODES[s.mode]?.box;
  if (!box) return '';
  const base = `${box} { content: counter(page); font-size: 10pt; font-family: inherit; ${fontCss} }`;
  // páginas contadas mas sem número (capa, folha de rosto, resumo…): `:nth(-n+K)` = as K primeiras
  const escondidas = s.from > 1 ? `\n@page:nth(-n+${s.from - 1}) { ${box} { content: none; } }` : '';
  return `@page { ${base} }${escondidas}`;
}

/** Campos do painel de impressão. `onChange(state)` roda a cada alteração. */
export function buildNumberingControls(state, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'print-numbering-controls';

  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Numeração das páginas');
  for (const [id, m] of Object.entries(NUMBER_MODES)) {
    const o = document.createElement('option'); o.value = id; o.textContent = m.label; sel.appendChild(o);
  }
  const campo = document.createElement('label');
  campo.className = 'print-size-field print-numbering-from';
  const nome = document.createElement('span'); nome.className = 'print-size-name'; nome.textContent = 'Mostrar a partir da página';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '1'; inp.max = '999'; inp.step = '1';
  inp.setAttribute('aria-label', 'Mostrar o número a partir da página');
  campo.append(nome, inp);
  const dica = document.createElement('div');
  dica.className = 'print-margins-hint';
  dica.textContent = 'A ABNT conta desde a capa e mostra o número a partir da introdução.';

  const pintar = () => {
    const s = normalizeNumbering(state);
    sel.value = s.mode;
    if (document.activeElement !== inp) inp.value = String(s.from);
    campo.hidden = dica.hidden = s.mode === 'off';
  };
  const aplicar = (novo) => { state = normalizeNumbering(novo); saveNumbering(state); pintar(); onChange(state); };
  sel.addEventListener('change', () => aplicar({ ...state, mode: sel.value }));
  inp.addEventListener('input', () => { state = normalizeNumbering({ ...state, from: inp.value }); saveNumbering(state); onChange(state); });
  inp.addEventListener('change', () => aplicar({ ...state, from: inp.value }));

  wrap.append(sel, campo, dica);
  pintar();
  return wrap;
}
