import { blockHandleBtn } from './block-controls.js';
import { openBlockMenu } from './block-menu.js';
import { findBlockById, orderedBlocks, selectBlockRange, setBlockSelection } from './block-selection.js';
import { S } from './state.js';

export function blockNearestToY(y, exclude = []) {
  let closest = null, closestDist = Infinity;
  for (const b of orderedBlocks()) {
    if (exclude.includes(b)) continue;
    const rect = b.getBoundingClientRect();

    // O bloco que contém o cursor ganha na hora. A conta antiga era pela
    // distância até o MEIO do bloco, e o meio de uma imagem de 200px fica a
    // 100px do topo dela — resultado: passar o mouse na metade de cima de uma
    // imagem trazia os controles do parágrafo de cima, que está mais perto do
    // próprio meio. Com blocos de uma linha só isso nunca aparecia.
    if (y >= rect.top && y <= rect.bottom) return b;

    // Fora de qualquer bloco (a margem esquerda, ou acima/abaixo de tudo):
    // vale a distância até a BORDA mais próxima, não até o meio — de novo,
    // pelo mesmo motivo.
    const dist = y < rect.top ? rect.top - y : y - rect.bottom;
    if (dist < closestDist) { closestDist = dist; closest = b; }
  }
  return closest;
}

export function handleHandleClick(block, ctrl) {
  if (ctrl) {
    if (S.lastHandleClickedId) {
      const anchor = findBlockById(S.lastHandleClickedId);
      if (anchor) selectBlockRange(anchor, block);
      else setBlockSelection([block.dataset.id]);
    } else {
      setBlockSelection([block.dataset.id]);
    }
    S.lastHandleClickedId = block.dataset.id;
    return;
  }

  if (!(S.selectedBlockIds.size > 1 && S.selectedBlockIds.has(block.dataset.id))) {
    setBlockSelection([block.dataset.id]);
  }
  S.lastHandleClickedId = block.dataset.id;
  openBlockMenu(block, blockHandleBtn);
}
