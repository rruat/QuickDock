// ── section-sort.js ─────────────────────────────────────────────────────────
// "Ordenar": lista de { property, direction }, aplicada na ordem (multi-nível).

import { section, el, selectControl } from './controls.js';

export function sortSection({ view, schema, memoria, patch }) {
  const s = section('Ordenar', { chave: 'sort', memoria });
  const regras = (Array.isArray(view.sort) ? view.sort : []).filter(r => r && typeof r === 'object');
  const props = Object.entries(schema).map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }));
  const grava = lista => patch({ sort: lista.length ? lista : undefined });

  regras.forEach((r, i) => {
    const linha = el('div', 'bset-rule');
    linha.appendChild(selectControl({
      value: r.property, options: props, ariaLabel: `Propriedade da ordenação ${i + 1}`,
      onChange: v => grava(regras.map((x, j) => (j === i ? { ...x, property: v } : x))),
    }));
    linha.appendChild(selectControl({
      value: r.direction === 'desc' ? 'desc' : 'asc', ariaLabel: 'Direção',
      options: [{ value: 'asc', label: 'Crescente' }, { value: 'desc', label: 'Decrescente' }],
      onChange: v => grava(regras.map((x, j) => (j === i ? { ...x, direction: v } : x))),
    }));
    const rm = el('button', 'bset-icon-btn', '✕');
    rm.type = 'button'; rm.title = 'Remover'; rm.setAttribute('aria-label', 'Remover ordenação');
    rm.addEventListener('click', () => grava(regras.filter((_, j) => j !== i)));
    linha.appendChild(rm);
    s.body.appendChild(linha);
  });
  if (!regras.length) s.body.appendChild(el('p', 'bset-hint', 'Sem ordenação definida.'));

  const add = el('button', 'bset-btn', '+ Adicionar ordenação');
  add.type = 'button';
  add.addEventListener('click', () => {
    const usadas = new Set(regras.map(r => r.property));
    const livre = props.find(p => !usadas.has(p.value)) ?? props[0];
    if (livre) grava([...regras, { property: livre.value, direction: 'asc' }]);
  });
  s.body.appendChild(add);
  return s.root;
}
