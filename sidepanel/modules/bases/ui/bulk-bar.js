// ── bulk-bar.js ─────────────────────────────────────────────────────────────
// Barra de ações em lote da tabela (aparece com notas selecionadas): definir propriedade,
// adicionar/remover tag, mover de pasta, excluir. A confirmação é do container.
//   api: { onAction(action), onClear() }

import { parsePropertyInput } from '../bases-schema.js';
import { el, selectControl } from './controls.js';

const EDITAVEIS = new Set(['text', 'number', 'date', 'checkbox', 'select', 'url', 'list']);

export function renderBulkBar(host, { count, schema }, api) {
  host.replaceChildren();
  host.hidden = count === 0;
  if (!count) return;

  host.appendChild(el('span', 'bbulk-count', `${count} ${count === 1 ? 'selecionada' : 'selecionadas'}`));

  const props = Object.entries(schema).filter(([k, d]) => !d?.isSystem && !d?.isDerived && EDITAVEIS.has(d?.type) && k !== 'tags')
    .map(([k, d]) => ({ value: d.key || k, label: d.label || k }));

  // definir propriedade
  if (props.length) {
    const sel = selectControl({ options: props, value: props[0].value, ariaLabel: 'Propriedade a definir', onChange: () => {} });
    const valor = el('input', 'bset-input'); valor.placeholder = 'valor'; valor.setAttribute('aria-label', 'Valor');
    const ok = el('button', 'bset-btn', 'Definir'); ok.type = 'button';
    ok.addEventListener('click', () => {
      const key = sel.value; const tipo = schema[key]?.type || 'text';
      const v = parsePropertyInput(valor.value, tipo === 'select' ? 'text' : tipo);
      if (v === null || v === '' || (Array.isArray(v) && !v.length)) { valor.focus(); return; }
      api.onAction({ kind: 'setProperty', key, value: v, type: tipo });
      valor.value = '';
    });
    host.append(sel, valor, ok);
  }

  // tag
  const tag = el('input', 'bset-input'); tag.placeholder = '#tag'; tag.setAttribute('aria-label', 'Tag');
  const add = el('button', 'bset-btn', '+ Tag'); add.type = 'button';
  add.addEventListener('click', () => { if (tag.value.trim()) { api.onAction({ kind: 'addTag', tag: tag.value }); tag.value = ''; } else tag.focus(); });
  const rem = el('button', 'bset-btn', '− Tag'); rem.type = 'button';
  rem.addEventListener('click', () => { if (tag.value.trim()) { api.onAction({ kind: 'removeTag', tag: tag.value }); tag.value = ''; } else tag.focus(); });
  host.append(tag, add, rem);

  // pasta
  const pasta = el('input', 'bset-input'); pasta.placeholder = 'pasta/destino'; pasta.setAttribute('aria-label', 'Pasta de destino');
  const mover = el('button', 'bset-btn', 'Mover'); mover.type = 'button';
  mover.addEventListener('click', () => { api.onAction({ kind: 'moveFolder', pasta: pasta.value }); pasta.value = ''; });
  host.append(pasta, mover);

  const del = el('button', 'bset-btn bset-btn-danger', 'Excluir'); del.type = 'button';
  del.addEventListener('click', () => api.onAction({ kind: 'delete' }));
  const limpar = el('button', 'bset-btn', 'Limpar seleção'); limpar.type = 'button';
  limpar.addEventListener('click', () => api.onClear());
  host.append(del, limpar);
}
