// ── section-new.js ──────────────────────────────────────────────────────────
// "Nova nota": modelo usado quando alguém cria uma nota por esta view (botão "Nova Nota",
// "+" da coluna do quadro, clique no calendário...). Grava `newTemplate` (uid do modelo).

import { section, row, selectControl } from './controls.js';

const NENHUM = '__none__';

export function newNoteSection({ view, templates, memoria, patch }) {
  const s = section('Nova nota', { chave: 'newnote', memoria, abertaPorPadrao: false,
    dica: 'A nota nova usa o conteúdo do modelo e já nasce com os valores dos filtros e do grupo.' });
  const lista = (templates || []).filter(t => t.kind === 'note' && t.uid);
  s.body.appendChild(row('Modelo', id => selectControl({
    id, value: view.newTemplate || NENHUM,
    options: [{ value: NENHUM, label: 'Nota em branco' }, ...lista.map(t => ({ value: t.uid, label: t.name || 'Sem nome' }))],
    onChange: v => patch({ newTemplate: v === NENHUM ? undefined : v }),
  }), { dica: lista.length ? '' : 'Nenhum modelo de nota criado ainda (menu "+" → Modelos).' }));
  return s.root;
}
