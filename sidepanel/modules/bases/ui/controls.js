// ── controls.js ─────────────────────────────────────────────────────────────
// Controles pequenos e acessíveis do painel de configuração das views (seção, linha
// rótulo+controle, seleção, segmentado, interruptor, lista de marcação). Nada aqui
// conhece Bases: recebem valores e devolvem mudanças por callback.

export const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

let seq = 0;
const novoId = () => `bset-${++seq}`;

/** Seção recolhível. O estado aberto/fechado é lembrado por `chave` no `memoria` (Set). */
export function section(titulo, { chave, memoria, abertaPorPadrao = true, dica = '' } = {}) {
  const det = el('details', 'bset-section');
  const aberta = memoria && chave && memoria.has(`fechada:${chave}`) ? false
    : (memoria && chave && memoria.has(`aberta:${chave}`) ? true : abertaPorPadrao);
  det.open = aberta;
  const sum = el('summary', 'bset-section-title', titulo);
  det.appendChild(sum);
  if (dica) det.appendChild(el('p', 'bset-hint', dica));
  const corpo = el('div', 'bset-section-body');
  det.appendChild(corpo);
  det.addEventListener('toggle', () => {
    if (!memoria || !chave) return;
    memoria.delete(`aberta:${chave}`); memoria.delete(`fechada:${chave}`);
    memoria.add(det.open ? `aberta:${chave}` : `fechada:${chave}`);
  });
  return { root: det, body: corpo };
}

/** Linha "rótulo ........ controle". `controle` já deve receber o `id` devolvido em `idControle`. */
export function row(rotulo, criaControle, { dica = '' } = {}) {
  const linha = el('div', 'bset-row');
  const id = novoId();
  const lab = el('label', 'bset-label', rotulo);
  lab.htmlFor = id;
  linha.appendChild(lab);
  const controle = criaControle(id);
  linha.appendChild(controle);
  if (dica) {
    const d = el('p', 'bset-hint bset-row-hint', dica);
    linha.appendChild(d);
  }
  return linha;
}

/**
 * @param {{ options: Array<{value:string,label:string,group?:string}>, value:any, onChange:(v:string)=>void,
 *           id?:string, ariaLabel?:string }} o
 */
export function selectControl({ options, value, onChange, id, ariaLabel }) {
  const sel = el('select', 'bset-select');
  if (id) sel.id = id;
  if (ariaLabel) sel.setAttribute('aria-label', ariaLabel);
  const grupos = new Map();
  for (const op of options) {
    const o = document.createElement('option');
    o.value = op.value;
    o.textContent = op.label;
    if (String(op.value) === String(value)) o.selected = true;
    if (op.group) {
      if (!grupos.has(op.group)) { const g = document.createElement('optgroup'); g.label = op.group; grupos.set(op.group, g); sel.appendChild(g); }
      grupos.get(op.group).appendChild(o);
    } else {
      sel.appendChild(o);
    }
  }
  // valor atual que não está na lista (ex.: propriedade apagada): mantém visível, não some em silêncio
  if (value !== null && value !== undefined && !options.some(op => String(op.value) === String(value))) {
    const o = document.createElement('option');
    o.value = String(value);
    o.textContent = `${value} (não encontrada)`;
    o.selected = true;
    sel.insertBefore(o, sel.firstChild);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

/** Botões lado a lado, um ativo (modo do calendário etc.). */
export function segmented({ options, value, onChange, ariaLabel }) {
  const grupo = el('div', 'bset-segmented');
  grupo.setAttribute('role', 'group');
  if (ariaLabel) grupo.setAttribute('aria-label', ariaLabel);
  for (const op of options) {
    const b = el('button', 'bset-seg' + (op.value === value ? ' is-active' : ''), op.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(op.value === value));
    b.addEventListener('click', () => { if (op.value !== value) onChange(op.value); });
    grupo.appendChild(b);
  }
  return grupo;
}

/** Interruptor (role=switch). */
export function toggle({ value, onChange, id, ariaLabel }) {
  const b = el('button', 'bset-toggle' + (value ? ' is-on' : ''));
  b.type = 'button';
  if (id) b.id = id;
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(!!value));
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.appendChild(el('span', 'bset-toggle-knob'));
  b.addEventListener('click', () => onChange(!value));
  return b;
}

/** Lista de marcação (várias propriedades) com a ordem de seleção preservada. */
export function checkList({ options, values, onChange, vazio = 'Nenhuma propriedade disponível.' }) {
  const lista = el('div', 'bset-checklist');
  if (!options.length) { lista.appendChild(el('p', 'bset-hint', vazio)); return lista; }
  const marcados = new Set(values);
  for (const op of options) {
    const id = novoId();
    const linha = el('label', 'bset-check');
    linha.htmlFor = id;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.checked = marcados.has(op.value);
    cb.addEventListener('change', () => {
      const atual = new Set(values);
      if (cb.checked) atual.add(op.value); else atual.delete(op.value);
      // mantém a ordem em que o usuário foi marcando
      const ordem = [...values.filter(v => atual.has(v)), ...[...atual].filter(v => !values.includes(v))];
      onChange(ordem);
    });
    linha.appendChild(cb);
    linha.appendChild(el('span', '', op.label));
    lista.appendChild(linha);
  }
  return lista;
}
