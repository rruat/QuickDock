// ── section-properties.js ───────────────────────────────────────────────────
// "Propriedades": quais propriedades a view mostra e em que ordem. Grava `props`
// (nome único que substitui columns · cardProperties · visibleProperties · properties).

import { getViewProps } from '../config/view-model.js';
import { section, el, checkList } from './controls.js';

const PADRAO = {
  table: ['title', 'tags', 'updatedAt'],
  board: ['tags'],
  list: [],
  gallery: ['tags', 'updatedAt'],
  timeline: [],
  feed: ['tags', 'updatedAt'],
};

export function propertiesSection({ view, schema, memoria, patch }) {
  const s = section('Propriedades', { chave: 'props', memoria, dica: 'O que aparece em cada linha ou cartão. A ordem é a ordem em que você marca.' });
  const comTitulo = view.type === 'table';
  const opcoes = Object.entries(schema)
    .map(([key, def]) => ({ value: def?.key || key, label: def?.label || key }))
    .filter(p => comTitulo || p.value !== 'title');
  const atuais = getViewProps(view, PADRAO[view.type] ?? []).filter(k => opcoes.some(o => o.value === k));
  s.body.appendChild(checkList({ options: opcoes, values: atuais, onChange: v => patch({ props: v }) }));
  if (view.props === undefined && PADRAO[view.type]?.length) {
    s.body.appendChild(el('p', 'bset-hint', 'Mostrando o padrão; marque ou desmarque para personalizar.'));
  }
  return s.root;
}
