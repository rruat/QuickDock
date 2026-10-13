// ── note-print-margins.js ───────────────────────────────────────────────────
// Margens da página impressa (modo de impressão). Predefinições, entre elas a ABNT (NBR 14724):
// superior 3 cm, inferior 2 cm, esquerda 3 cm, direita 2 cm — mais, opcional, o texto ABNT
// (12 pt, entrelinha 1,5, justificado). Valores em cm; a escolha fica neste aparelho.

const STORAGE_KEY = 'quickdock:note-print-margins';
const MIN_CM = 0;
const MAX_CM = 10;

export const MARGIN_PRESETS = {
  padrao:  { label: 'Padrão',  hint: '1,4 cm em volta', cm: { top: 1.4, right: 1.4, bottom: 1.4, left: 1.4 } },
  abnt:    { label: 'ABNT',    hint: 'Sup. 3 · Esq. 3 · Inf. 2 · Dir. 2 cm', cm: { top: 3, right: 2, bottom: 2, left: 3 } },
  estreita:{ label: 'Estreita', hint: '1 cm em volta',  cm: { top: 1, right: 1, bottom: 1, left: 1 } },
  custom:  { label: 'Personalizada', hint: 'Você define cada lado', cm: null },
};

export const DEFAULT_MARGINS = { preset: 'padrao', custom: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, abntText: false };

/** Número em cm entre 0 e 10, com uma casa; inválido vira o valor de reserva. */
export function clampCm(valor, reserva = 2.5) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  const n = texto === '' ? NaN : Number(texto);
  if (!Number.isFinite(n)) return reserva;
  return Math.round(Math.min(MAX_CM, Math.max(MIN_CM, n)) * 10) / 10;
}

export function normalizeMargins(raw) {
  const base = DEFAULT_MARGINS;
  const preset = raw && MARGIN_PRESETS[raw.preset] ? raw.preset : base.preset;
  const c = raw?.custom ?? {};
  return {
    preset,
    custom: {
      top: clampCm(c.top, base.custom.top), right: clampCm(c.right, base.custom.right),
      bottom: clampCm(c.bottom, base.custom.bottom), left: clampCm(c.left, base.custom.left),
    },
    abntText: raw?.abntText === true,
  };
}

/** As quatro margens (cm) que valem agora. */
export function effectiveCm(state) {
  const s = normalizeMargins(state);
  return MARGIN_PRESETS[s.preset].cm ?? s.custom;
}

/** Valor da propriedade `margin` do @page: superior direita inferior esquerda. */
export function pageMarginValue(state) {
  const m = effectiveCm(state);
  return `${m.top}cm ${m.right}cm ${m.bottom}cm ${m.left}cm`;
}

export function loadMargins() {
  try { return normalizeMargins(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return normalizeMargins(null); }
}

export function saveMargins(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeMargins(state))); } catch {}
}

const LADOS = [['top', 'Superior'], ['right', 'Direita'], ['bottom', 'Inferior'], ['left', 'Esquerda']];

/** Controles para a barra do modo de impressão. `onChange(state)` roda a cada alteração. */
export function buildMarginControls(state, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'note-print-margins';

  const rotulo = document.createElement('label');
  rotulo.className = 'note-print-margins-label';
  rotulo.textContent = 'Margens';
  const select = document.createElement('select');
  select.className = 'note-print-margins-select';
  select.setAttribute('aria-label', 'Margens da página');
  for (const [id, p] of Object.entries(MARGIN_PRESETS)) {
    const o = document.createElement('option');
    o.value = id; o.textContent = p.label; o.title = p.hint;
    select.appendChild(o);
  }
  select.value = state.preset;
  rotulo.appendChild(select);

  const resumo = document.createElement('span');
  resumo.className = 'note-print-margins-hint';

  const custom = document.createElement('div');
  custom.className = 'note-print-margins-custom';
  const inputs = {};
  for (const [lado, nome] of LADOS) {
    const l = document.createElement('label');
    l.textContent = nome;
    const i = document.createElement('input');
    i.type = 'number'; i.min = String(MIN_CM); i.max = String(MAX_CM); i.step = '0.1';
    i.setAttribute('aria-label', `Margem ${nome.toLowerCase()} em cm`);
    inputs[lado] = i;
    l.appendChild(i);
    custom.appendChild(l);
  }
  const cm = document.createElement('span'); cm.textContent = 'cm'; custom.appendChild(cm);

  const abnt = document.createElement('label');
  abnt.className = 'note-print-margins-abnt';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  abnt.append(chk, document.createTextNode(' Texto ABNT (12 pt, espaço 1,5)'));
  abnt.title = 'Fonte 12 pt, entrelinha 1,5 e texto justificado — troque a fonte da nota para Arimo ou Tinos (parecidas com Arial e Times New Roman)';

  function pintar() {
    const s = normalizeMargins(state);
    select.value = s.preset;
    custom.hidden = s.preset !== 'custom';
    resumo.textContent = s.preset === 'custom' ? '' : MARGIN_PRESETS[s.preset].hint;
    chk.checked = s.abntText;
    for (const [lado] of LADOS) if (document.activeElement !== inputs[lado]) inputs[lado].value = String(s.custom[lado]);
  }
  function mudou() { state = normalizeMargins(state); saveMargins(state); pintar(); onChange(state); }

  select.addEventListener('change', () => {
    // ao ir para "Personalizada", parte das margens que valiam até então
    if (select.value === 'custom' && state.preset !== 'custom') state = { ...state, custom: { ...effectiveCm(state) } };
    state = { ...state, preset: select.value };
    mudou();
  });
  for (const [lado] of LADOS) {
    inputs[lado].addEventListener('input', () => {
      state = { ...state, custom: { ...state.custom, [lado]: clampCm(inputs[lado].value, state.custom[lado]) } };
      saveMargins(state); onChange(normalizeMargins(state));
    });
    inputs[lado].addEventListener('change', () => { inputs[lado].value = String(clampCm(inputs[lado].value, state.custom[lado])); mudou(); });
  }
  chk.addEventListener('change', () => { state = { ...state, abntText: chk.checked }; mudou(); });

  wrap.append(rotulo, resumo, custom, abnt);
  pintar();
  return wrap;
}
