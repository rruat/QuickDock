// ── board-beautify-panel.js ─────────────────────────────────────────────────
// Conteúdo do painel "Organizar" da quickbar: escolhe o estilo do fluxo. O
// cálculo mora em board-beautify.js; aplicar o resultado no quadro é com
// board-engine.js.

export const BEAUTIFY_OPTIONS = [
  ['vertical', 'south', 'Vertical', 'De cima para baixo'],
  ['horizontal', 'east', 'Horizontal', 'Da esquerda para a direita'],
  ['radial', 'hub', 'Radial', 'Multidirecional, ao redor da origem'],
];

/**
 * @param {HTMLElement} body
 * @param {{ close:()=>void }} api
 * @param {{ scopeLabel:string, onApply:(direction:string)=>void }} ctx
 */
export function renderBeautifyPanel(body, api, ctx) {
  const escopo = document.createElement('div');
  escopo.className = 'board-insert-hint';
  escopo.textContent = `Aplica em: ${ctx.scopeLabel}.`;

  const grade = document.createElement('div');
  grade.className = 'board-beautify-options';
  for (const [dir, icone, nome, dica] of BEAUTIFY_OPTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'board-insert-action board-beautify-option';
    b.dataset.direction = dir;
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
      api.close();
      ctx.onApply(dir);
    });
    grade.appendChild(b);
  }
  body.append(grade, escopo);
}
