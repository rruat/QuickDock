// ── board-insert-popover.js ─────────────────────────────────────────────────
// Popover do botão "Inserir" da quickbar: um único ponto de entrada para
// tudo que vira cartão de conteúdo — link/vídeo/áudio/imagem por URL,
// arquivo local, nota existente e nota nova. As ações de verdade são
// injetadas por quem chama (board-engine.js).

import { positionPopover } from '../popover.js';

let aberto = null;

export function closeInsertPopover() {
  aberto?.remove();
  aberto = null;
}

export function isInsertPopoverOpen() {
  return !!aberto;
}

function acao(icone, rotulo, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'board-insert-action';
  const i = document.createElement('span');
  i.className = 'qd-icon material-symbols-rounded';
  i.textContent = icone;
  const t = document.createElement('span');
  t.textContent = rotulo;
  b.append(i, t);
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

/**
 * @param {HTMLElement} anchor
 * @param {{ onAddUrl:(url:string)=>boolean, onPickFile:()=>void,
 *           onLinkNote:(anchor:HTMLElement)=>void, onCreateNote:()=>void }} handlers
 */
export function toggleInsertPopover(anchor, handlers) {
  if (aberto) { closeInsertPopover(); return; }

  const pop = document.createElement('div');
  pop.className = 'board-insert-popover board-theme-scope';

  const titulo = document.createElement('div');
  titulo.className = 'board-popover-title';
  titulo.textContent = 'Adicionar ao espaço';
  pop.appendChild(titulo);

  const linha = document.createElement('div');
  linha.className = 'board-insert-url-row';
  const input = document.createElement('input');
  input.type = 'url';
  input.className = 'board-popover-input board-insert-url';
  input.placeholder = 'Cole um link, vídeo, áudio ou imagem…';
  input.setAttribute('aria-label', 'URL do conteúdo');
  input.autocomplete = 'off';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'board-btn board-insert-url-ok';
  ok.textContent = 'Adicionar';
  linha.append(input, ok);
  pop.appendChild(linha);

  const erro = document.createElement('div');
  erro.className = 'board-insert-error';
  erro.hidden = true;
  erro.textContent = 'Endereço inválido — use um link http(s).';
  pop.appendChild(erro);

  const enviar = () => {
    if (!input.value.trim()) return;
    if (handlers.onAddUrl(input.value)) closeInsertPopover();
    else erro.hidden = false;
  };
  ok.addEventListener('click', enviar);
  input.addEventListener('input', () => { erro.hidden = true; });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); enviar(); }
    if (e.key === 'Escape') closeInsertPopover();
  });

  const lista = document.createElement('div');
  lista.className = 'board-insert-actions';
  lista.append(
    acao('upload_file', 'Enviar arquivo (imagem, vídeo, áudio…)', () => { closeInsertPopover(); handlers.onPickFile(); }),
    acao('link', 'Vincular nota existente', () => { closeInsertPopover(); handlers.onLinkNote(anchor); }),
    acao('note_add', 'Criar nota nova', () => { closeInsertPopover(); handlers.onCreateNote(); }),
  );
  pop.appendChild(lista);

  const dica = document.createElement('div');
  dica.className = 'board-insert-hint';
  dica.textContent = 'Também dá para arrastar arquivos ou colar um link direto no espaço.';
  pop.appendChild(dica);

  pop.addEventListener('pointerdown', e => e.stopPropagation());
  pop.addEventListener('click', e => e.stopPropagation());

  document.body.appendChild(pop);
  positionPopover(pop, anchor);
  aberto = pop;
  setTimeout(() => input.focus(), 30);
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (aberto && !aberto.contains(e.target) && !e.target.closest('#tool-insert')) closeInsertPopover();
  }, true);
}
