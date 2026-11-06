import { t as tr } from '../i18n.js';
import { createBlockEl } from './block-model.js';
import { focusBlockStart, renumberLists } from './block-ops.js';
import { blockNearestToY } from './handle.js';
import { S, noteEditorEl, root } from './state.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export const blockControls = document.createElement('div');

blockControls.className = 'block-controls';

blockControls.hidden = true;

export const blockAddBtn = document.createElement('button');

blockAddBtn.className = 'block-add-btn';

blockAddBtn.textContent = '+';

blockAddBtn.title = tr('Adicionar bloco abaixo (Ctrl+clique: acima)');

export const blockHandleBtn = document.createElement('button');

blockHandleBtn.className = 'block-handle-btn';

blockHandleBtn.textContent = '⠿';

blockHandleBtn.title = tr('Clique: opções do bloco · Arrastar: mover · Ctrl+arrastar (em qualquer lugar do bloco): selecionar vários');

blockControls.append(blockAddBtn, blockHandleBtn);

noteEditorEl.appendChild(blockControls);

export function positionBlockControls(block) {
  S.hoveredBlock = block;

  const blockRect     = block.getBoundingClientRect();
  const containerRect = noteEditorEl.getBoundingClientRect();
  const viewRect      = root.getBoundingClientRect();   // área visível do editor (ele rola)

  // Bloco rolou pra fora da vista: esconde, em vez de deixar os ícones
  // encostados na borda apontando pra nada.
  if (blockRect.bottom < viewRect.top || blockRect.top > viewRect.bottom) {
    blockControls.hidden = true;
    return;
  }

  blockControls.hidden = false;   // precisa estar visível pra poder ser medido

  // Horizontal: os ícones acompanham a indentação do bloco. Com um `left`
  // fixo, um item aninhado ganhava ícones lá na margem esquerda, longe do
  // bloco a que se referem — e dois blocos de níveis diferentes ficavam
  // indistinguíveis, já que a escolha do bloco é só pela altura do cursor.
  const largura = blockControls.offsetWidth || 31;
  const left = Math.max(0, blockRect.left - containerRect.left - largura + 1);

  // Vertical: alinhado com a primeira linha do bloco, mas preso dentro da
  // área visível. Um bloco alto (imagem) costuma ter o topo fora da tela, e
  // sem o limite os ícones subiam por cima da barra de abas.
  const topoVisivel = viewRect.top - containerRect.top;
  const baseVisivel = viewRect.bottom - containerRect.top - blockControls.offsetHeight;
  const top = Math.min(
    Math.max(blockRect.top - containerRect.top, topoVisivel),
    Math.max(topoVisivel, baseVisivel),
  );

  blockControls.style.left = `${left}px`;
  blockControls.style.top  = `${top}px`;
}

export function hideBlockControls() {
  blockControls.hidden = true;
  S.hoveredBlock = null;
}

root.addEventListener('mousemove', e => {
  if (S.pointerDown || S.ctrlPointerDown) return; // decidindo ou já em arrasto — não reposiciona o overlay de hover
  // Bloco mais próximo verticalmente do cursor, não o que está exatamente
  // por baixo — a margem esquerda (onde os ícones aparecem) não pertence a
  // nenhum .block específico, então hover lá nunca batia em nada antes.
  const target = blockNearestToY(e.clientY);
  if (!target) return;
  // O "&& !hidden" importa: os controles podem ter sido escondidos por outro
  // caminho (rolagem levou o bloco pra fora da vista) sem que o bloco sob o
  // cursor tenha mudado. Sem isso, eles não voltavam mais.
  if (target === S.hoveredBlock && !blockControls.hidden) return;
  positionBlockControls(target);
});

noteEditorEl.addEventListener('mouseleave', () => {
  if (!S.blockMenuEl) hideBlockControls();
});

root.addEventListener('scroll', () => {
  if (S.hoveredBlock && root.contains(S.hoveredBlock)) positionBlockControls(S.hoveredBlock);
  else blockControls.hidden = true;
}, { passive: true });

blockAddBtn.addEventListener('mousedown', e => e.preventDefault());

blockAddBtn.addEventListener('click', e => {
  if (!S.hoveredBlock) return;
  captureUndoPoint();
  const newBlock = createBlockEl('paragraph');
  if (e.ctrlKey || e.metaKey) S.hoveredBlock.before(newBlock);
  else S.hoveredBlock.after(newBlock);
  renumberLists();
  focusBlockStart(newBlock);
  scheduleSave();
});
