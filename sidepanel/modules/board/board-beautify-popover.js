// ── board-beautify-popover.js ───────────────────────────────────────────────
// Popover do botão "Organizar": escolhe a direção do fluxo. O cálculo mora em
// board-beautify.js; aplicar o resultado no quadro é com board-engine.js.

import { positionPopover } from '../popover.js';

let aberto = null;

export function closeBeautifyPopover() {
  aberto?.remove();
  aberto = null;
}

/**
 * @param {HTMLElement} anchor
 * @param {{ scopeLabel:()=>string, onApply:(direction:'vertical'|'horizontal')=>void }} ctx
 */
export function toggleBeautifyPopover(anchor, ctx) {
  if (aberto) { closeBeautifyPopover(); return; }

  const pop = document.createElement('div');
  pop.className = 'board-beautify-popover board-theme-scope';

  const title = document.createElement('div');
  title.className = 'board-popover-title';
  title.textContent = `Organizar · ${ctx.scopeLabel()}`;
  pop.appendChild(title);

  const opcoes = [
    ['vertical', 'south', 'Vertical', 'Fluxo de cima para baixo'],
    ['horizontal', 'east', 'Horizontal', 'Fluxo da esquerda para a direita'],
  ];
  for (const [dir, icone, nome, dica] of opcoes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'board-insert-action board-beautify-option';
    const i = document.createElement('span');
    i.className = 'qd-icon material-symbols-rounded';
    i.textContent = icone;
    const texto = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = nome;
    const small = document.createElement('small');
    small.textContent = dica;
    texto.append(strong, small);
    b.append(i, texto);
    b.addEventListener('click', e => {
      e.stopPropagation();
      closeBeautifyPopover();
      ctx.onApply(dir);
    });
    pop.appendChild(b);
  }

  pop.addEventListener('pointerdown', e => e.stopPropagation());
  pop.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(pop);
  positionPopover(pop, anchor);
  aberto = pop;
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (aberto && !aberto.contains(e.target) && !e.target.closest('#tool-beautify')) closeBeautifyPopover();
  }, true);
}
