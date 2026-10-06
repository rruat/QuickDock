// ── section-card.js ─────────────────────────────────────────────────────────
// Ajustes do cartão/linha: Galeria (proporção, ajuste da capa) e Lista (densidade, caixa de
// marcação). Grava em `card` / `density` / `checkboxProp`.

import { section, row, selectControl } from './controls.js';

const NENHUMA = '__none__';

export function cardSection({ view, schema, memoria, patch }) {
  if (view.type === 'gallery') {
    const s = section('Cartão', { chave: 'card', memoria });
    s.body.appendChild(row('Proporção da capa', id => selectControl({
      id, value: view.card?.aspect || NENHUMA,
      options: [{ value: NENHUMA, label: 'Padrão (por tamanho)' }, { value: '1/1', label: 'Quadrada (1:1)' }, { value: '4/3', label: 'Clássica (4:3)' }, { value: '16/9', label: 'Panorâmica (16:9)' }, { value: '3/4', label: 'Retrato (3:4)' }],
      onChange: v => patch({ card: { aspect: v === NENHUMA ? undefined : v } }),
    })));
    s.body.appendChild(row('Ajustar imagem', id => selectControl({
      id, value: view.card?.fit || 'cover',
      options: [{ value: 'cover', label: 'Preencher' }, { value: 'contain', label: 'Mostrar inteira' }],
      onChange: v => patch({ card: { fit: v } }),
    })));
    return s.root;
  }
  if (view.type === 'list') {
    const s = section('Linhas', { chave: 'listrows', memoria });
    s.body.appendChild(row('Densidade', id => selectControl({
      id, value: view.density === 'compact' ? 'compact' : 'normal',
      options: [{ value: 'normal', label: 'Normal' }, { value: 'compact', label: 'Compacta' }],
      onChange: v => patch({ density: v === 'compact' ? 'compact' : undefined }),
    })));
    const caixas = Object.entries(schema).filter(([, d]) => d?.type === 'checkbox').map(([k, d]) => ({ value: d.key || k, label: d.label || k }));
    s.body.appendChild(row('Caixa de marcação', id => selectControl({
      id, value: view.checkboxProp || NENHUMA,
      options: [{ value: NENHUMA, label: 'Nenhuma' }, ...caixas],
      onChange: v => patch({ checkboxProp: v === NENHUMA ? undefined : v }),
    }), { dica: caixas.length ? '' : 'Crie uma propriedade do tipo caixa de seleção para usar aqui.' }));
    return s.root;
  }
  if (view.type === 'feed') {
    const s = section('Cartão', { chave: 'feedcard', memoria });
    s.body.appendChild(row('Altura máxima do texto', id => selectControl({
      id, value: view.card?.maxLines || 14,
      options: [6, 10, 14, 20, 30].map(n => ({ value: n, label: `${n} linhas` })),
      onChange: v => patch({ card: { maxLines: Number(v) } }),
    }), { dica: 'Acima disso aparece "Ver mais".' }));
    return s.root;
  }
  return null;
}
