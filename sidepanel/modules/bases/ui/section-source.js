// ── section-source.js ───────────────────────────────────────────────────────
// "Origem das notas" (view vinculada): usar as notas — e as definições de propriedade — de OUTRA
// Base, com views, filtros e ordenação próprios. A Base de origem só é lida; para editar a
// definição dela, abra a nota dela. Grava `source.base` (uid da nota da Base de origem).

import { section, row, el, selectControl } from './controls.js';

const PROPRIA = '__own__';

export function sourceSection({ info, memoria, patchSource }) {
  const s = section('Origem das notas', { chave: 'source', memoria, abertaPorPadrao: false,
    dica: 'Mostra as notas de outra Base (mesma pasta/tag e mesmas propriedades) com views e filtros só desta.' });
  const opcoes = [{ value: PROPRIA, label: 'Definida nesta Base' }, ...info.candidates.map(c => ({ value: c.uid, label: `🔗 ${c.title}` }))];
  s.body.appendChild(row('Notas vêm de', id => selectControl({
    id, value: info.uid || PROPRIA, options: opcoes,
    onChange: v => patchSource({ base: v === PROPRIA ? undefined : v }),
  })));
  if (info.uid && !info.loaded) s.body.appendChild(el('p', 'bset-hint bset-formula-msg is-error', 'Não encontrei a Base de origem (a nota foi excluída ou ainda não tem uma Base). Mostrando todas as notas.'));
  if (info.uid && info.loaded) s.body.appendChild(el('p', 'bset-hint', `Lendo a definição de "${info.name || 'Base de origem'}" (somente leitura).`));
  if (!info.candidates.length && !info.uid) s.body.appendChild(el('p', 'bset-hint', 'Nenhuma outra nota com Base encontrada.'));
  return s.root;
}
