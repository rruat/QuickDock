import { getBlockFromNode } from './block-ops.js';
import { blockDepth } from './block-structure.js';
import { root } from './state.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export function checkboxDe(block) {
  return block.querySelector(':scope > .block-marker input[type="checkbox"]');
}

export function checklistFilhos(block) {
  const base = blockDepth(block);
  const filhos = [];
  for (let n = block.nextElementSibling; n && blockDepth(n) > base; n = n.nextElementSibling) {
    if (blockDepth(n) === base + 1 && n.dataset.type === 'checklist') filhos.push(n);
  }
  return filhos;
}

export function checklistPai(block) {
  const base = blockDepth(block);
  if (base === 0) return null;
  for (let n = block.previousElementSibling; n; n = n.previousElementSibling) {
    if (blockDepth(n) < base) return n.dataset.type === 'checklist' ? n : null;
  }
  return null;
}

export function marcarChecklist(block, checked) {
  block.dataset.checked = checked ? 'true' : 'false';
  const cb = checkboxDe(block);
  if (cb) { cb.checked = checked; cb.indeterminate = false; }
}

export function propagarParaBaixo(block, checked) {
  for (const filho of checklistFilhos(block)) {
    marcarChecklist(filho, checked);
    propagarParaBaixo(filho, checked);
  }
}

export function propagarParaCima(block) {
  for (let pai = checklistPai(block); pai; pai = checklistPai(pai)) {
    const filhos = checklistFilhos(pai);
    if (filhos.length === 0) return;

    const marcados = filhos.filter(f => f.dataset.checked === 'true').length;
    const parciais = filhos.some(f => checkboxDe(f)?.indeterminate);
    const todos    = marcados === filhos.length && !parciais;

    marcarChecklist(pai, todos);
    const cb = checkboxDe(pai);
    if (cb && !todos && (marcados > 0 || parciais)) cb.indeterminate = true;
  }
}

export function refreshChecklistStates() {
  for (const block of root.children) {
    if (block.dataset.type !== 'checklist') continue;
    const cb = checkboxDe(block);
    if (!cb || block.dataset.checked === 'true') continue;
    const filhos = checklistFilhos(block);
    cb.indeterminate = filhos.length > 0 && filhos.some(f => f.dataset.checked === 'true');
  }
}

root.addEventListener('change', e => {
  if (!e.target.matches('input[type="checkbox"]')) return;
  const block = getBlockFromNode(e.target);
  if (!block) return;

  // Um clique pode mexer em vários blocos, então vira um passo só de desfazer.
  captureUndoPoint();
  marcarChecklist(block, e.target.checked);
  propagarParaBaixo(block, e.target.checked);
  propagarParaCima(block);
  scheduleSave();
});
