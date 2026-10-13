// ── note-print-text.js ──────────────────────────────────────────────────────
// Texto da página impressa: tamanho (pt) do parágrafo e dos títulos (#, ##, ###, ####), entrelinha,
// justificado e recuo da primeira linha. Campo vazio = o tamanho que a nota já tem. A predefinição ABNT
// (NBR 14724) usa 12 pt em tudo, entrelinha 1,5, justificado e recuo de 1,25 cm. A escolha fica neste aparelho.

const STORAGE_KEY = 'quickdock:note-print-text';

export const SIZE_FIELDS = [
  { key: 'p',  label: 'Parágrafo',        mark: '¶',    sel: '[data-type="paragraph"]' },
  { key: 'h1', label: 'Título 1',         mark: '#',    sel: 'h1.block' },
  { key: 'h2', label: 'Título 2',         mark: '##',   sel: 'h2.block' },
  { key: 'h3', label: 'Título 3',         mark: '###',  sel: 'h3.block' },
  { key: 'h4', label: 'Título 4',         mark: '####', sel: 'h4.block' },
];

export const DEFAULT_TEXT = { p: null, h1: null, h2: null, h3: null, h4: null, line: null, justify: false, indent: false };
export const ABNT_TEXT = { p: 12, h1: 12, h2: 12, h3: 12, h4: 12, line: 1.5, justify: true, indent: true };

const lim = (v, min, max, casas = 1) => {
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** casas;
  return Math.round(Math.min(max, Math.max(min, n)) * f) / f;
};
export const clampPt = v => lim(v, 6, 72);
export const clampLine = v => lim(v, 1, 3, 2);

export function normalizeText(raw) {
  const r = raw ?? {};
  const out = { ...DEFAULT_TEXT };
  for (const { key } of SIZE_FIELDS) out[key] = clampPt(r[key]);
  out.line = clampLine(r.line);
  out.justify = r.justify === true;
  out.indent = r.indent === true;
  return out;
}

export const isAbnt = s => JSON.stringify(normalizeText(s)) === JSON.stringify(ABNT_TEXT);
export const isDefaultText = s => JSON.stringify(normalizeText(s)) === JSON.stringify(DEFAULT_TEXT);

/** CSS que vale só durante o modo de impressão (a tela já mostra como vai sair). */
export function textCss(state) {
  const s = normalizeText(state);
  const raiz = 'body.is-print-mode #note-editor-blocks';
  const regras = [];
  for (const { key, sel } of SIZE_FIELDS) {
    if (s[key] != null) regras.push(`${raiz} ${sel.startsWith('[') ? `.block${sel}` : sel} { font-size: ${s[key]}pt !important; }`);
  }
  if (s.line != null) regras.push(`${raiz} .block { line-height: ${s.line} !important; }`);
  if (s.justify) regras.push(`${raiz} .block[data-type="paragraph"] { text-align: justify; }`);
  if (s.indent) regras.push(`${raiz} .block[data-type="paragraph"] { text-indent: 1.25cm; }`);
  return regras.join('\n');
}

export function loadText() {
  try { return normalizeText(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return normalizeText(null); }
}
export function saveText(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeText(state))); } catch {}
}

/** Campos de texto para o painel de impressão. `onChange(state)` roda a cada alteração. */
export function buildTextControls(state, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'print-text-controls';

  const abntBtn = document.createElement('button');
  abntBtn.type = 'button';
  abntBtn.className = 'aside-panel-btn print-abnt-btn';
  abntBtn.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">school</span><span>Formatação ABNT</span>';
  abntBtn.title = '12 pt em tudo, entrelinha 1,5, texto justificado e recuo de 1,25 cm. Para a fonte, use Arimo ou Tinos (parecidas com Arial e Times New Roman) na Aparência da nota.';

  const grade = document.createElement('div');
  grade.className = 'print-size-grid';
  const inputs = {};
  const campo = (key, rotulo, marca, min, max, passo, unidade) => {
    const l = document.createElement('label');
    l.className = 'print-size-field';
    const nome = document.createElement('span');
    nome.className = 'print-size-name';
    if (marca) { const m = document.createElement('b'); m.textContent = marca; nome.appendChild(m); }
    nome.appendChild(document.createTextNode(rotulo));
    const i = document.createElement('input');
    i.type = 'number'; i.min = String(min); i.max = String(max); i.step = String(passo);
    i.placeholder = 'padrão';
    i.setAttribute('aria-label', `${rotulo} (${unidade})`);
    const u = document.createElement('span');
    u.className = 'print-size-unit'; u.textContent = unidade;
    l.append(nome, i, u);
    inputs[key] = i;
    grade.appendChild(l);
  };
  for (const f of SIZE_FIELDS) campo(f.key, f.label, f.mark, 6, 72, 0.5, 'pt');
  campo('line', 'Entrelinha', '', 1, 3, 0.05, '×');

  const opcoes = document.createElement('div');
  opcoes.className = 'print-text-options';
  const chk = (key, texto) => {
    const l = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    l.append(c, document.createTextNode(' ' + texto));
    opcoes.appendChild(l);
    inputs[key] = c;
  };
  chk('justify', 'Justificar parágrafos');
  chk('indent', 'Recuo na 1ª linha (1,25 cm)');

  const limpar = document.createElement('button');
  limpar.type = 'button';
  limpar.className = 'print-text-reset';
  limpar.textContent = 'Voltar ao tamanho da nota';

  function pintar() {
    const s = normalizeText(state);
    abntBtn.classList.toggle('is-active', isAbnt(s));
    limpar.hidden = isDefaultText(s);
    for (const k of [...SIZE_FIELDS.map(f => f.key), 'line']) {
      if (document.activeElement !== inputs[k]) inputs[k].value = s[k] == null ? '' : String(s[k]);
    }
    inputs.justify.checked = s.justify;
    inputs.indent.checked = s.indent;
  }
  const aplicar = (novo, repintar = true) => {
    state = normalizeText(novo); saveText(state);
    if (repintar) pintar();
    else { abntBtn.classList.toggle('is-active', isAbnt(state)); limpar.hidden = isDefaultText(state); }   // sem mexer no campo que está sendo digitado
    onChange(state);
  };

  abntBtn.addEventListener('click', () => aplicar(isAbnt(state) ? DEFAULT_TEXT : ABNT_TEXT));
  limpar.addEventListener('click', () => aplicar(DEFAULT_TEXT));
  for (const f of SIZE_FIELDS) {
    inputs[f.key].addEventListener('input', () => aplicar({ ...state, [f.key]: inputs[f.key].value }, false));
    inputs[f.key].addEventListener('change', pintar);
  }
  inputs.line.addEventListener('input', () => aplicar({ ...state, line: inputs.line.value }, false));
  inputs.line.addEventListener('change', pintar);
  inputs.justify.addEventListener('change', () => aplicar({ ...state, justify: inputs.justify.checked }));
  inputs.indent.addEventListener('change', () => aplicar({ ...state, indent: inputs.indent.checked }));

  wrap.append(abntBtn, grade, opcoes, limpar);
  pintar();
  return wrap;
}
