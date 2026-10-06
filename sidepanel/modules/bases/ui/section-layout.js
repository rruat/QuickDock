// ── section-layout.js ───────────────────────────────────────────────────────
// "Layout" da tabela: altura da linha, quebra de texto, numeração e bordas. Grava `layout`.

import { resolveTableLayout } from '../config/view-model.js';
import { section, row, selectControl, toggle } from './controls.js';

export function layoutSection({ view, memoria, patch }) {
  if (view.type !== 'table') return null;
  const cfg = resolveTableLayout(view);
  const s = section('Layout', { chave: 'layout', memoria });
  s.body.appendChild(row('Altura da linha', id => selectControl({
    id, value: cfg.rowHeight,
    options: [{ value: 'short', label: 'Curta' }, { value: 'medium', label: 'Média' }, { value: 'tall', label: 'Alta' }],
    onChange: v => patch({ layout: { rowHeight: v } }),
  })));
  s.body.appendChild(row('Quebrar texto nas células', id => toggle({ id, value: cfg.wrapCells, onChange: v => patch({ layout: { wrapCells: v } }) })));
  s.body.appendChild(row('Numerar linhas', id => toggle({ id, value: cfg.rowNumbers, onChange: v => patch({ layout: { rowNumbers: v } }) })));
  s.body.appendChild(row('Bordas', id => selectControl({
    id, value: cfg.borders,
    options: [{ value: 'both', label: 'Linhas e colunas' }, { value: 'rows', label: 'Só linhas' }, { value: 'none', label: 'Sem bordas' }],
    onChange: v => patch({ layout: { borders: v } }),
  })));
  return s.root;
}
