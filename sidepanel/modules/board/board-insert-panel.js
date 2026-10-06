// ── board-insert-panel.js ───────────────────────────────────────────────────
// Conteúdo do painel "Inserir" da quickbar: um único ponto de entrada para
// tudo que vira cartão de conteúdo — link/vídeo/áudio/imagem por URL,
// arquivo local, nota existente e nota nova. As ações de verdade são
// injetadas por quem chama (board-engine.js).

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
 * @param {HTMLElement} body
 * @param {{ close:()=>void }} api
 * @param {{ onAddUrl:(url:string)=>boolean, onPickFile:()=>void,
 *           onLinkNote:()=>void, onCreateNote:()=>void }} handlers
 */
export function renderInsertPanel(body, api, handlers) {
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

  const erro = document.createElement('div');
  erro.className = 'board-insert-error';
  erro.hidden = true;
  erro.textContent = 'Endereço inválido — use um link http(s).';

  const enviar = () => {
    if (!input.value.trim()) return;
    if (handlers.onAddUrl(input.value)) api.close();
    else erro.hidden = false;
  };
  ok.addEventListener('click', enviar);
  input.addEventListener('input', () => { erro.hidden = true; });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); enviar(); }
    if (e.key === 'Escape') api.close();
  });

  const lista = document.createElement('div');
  lista.className = 'board-insert-actions';
  lista.append(
    acao('upload_file', 'Enviar arquivo', () => { api.close(); handlers.onPickFile(); }),
    acao('link', 'Vincular nota', handlers.onLinkNote),
    acao('note_add', 'Criar nota nova', handlers.onCreateNote),
  );

  const dica = document.createElement('div');
  dica.className = 'board-insert-hint';
  dica.textContent = 'Imagem, vídeo, áudio, PDF… Também dá para arrastar arquivos ou colar um link direto no espaço.';

  body.append(linha, erro, lista, dica);
  setTimeout(() => input.focus(), 60);
}
