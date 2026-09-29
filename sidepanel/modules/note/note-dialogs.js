// ── note-dialogs.js ────────────────────────────────────────────────────────
// Menus contextuais e diálogos inline do editor de notas (Link Menu e Alt Menu).
// Substitui prompts e dialogs nativos do navegador por interfaces fluidas.

import { safeHref } from '../blocks.js';

let linkMenuEl = null;
let altMenuEl = null;

export function closeLinkMenu() {
  linkMenuEl?.remove();
  linkMenuEl = null;
}

export function isClickInsideLinkMenu(target) {
  return !!(linkMenuEl && linkMenuEl.contains(target));
}

export function closeAltMenu() {
  altMenuEl?.remove();
  altMenuEl = null;
}

/**
 * Abre o menu flutuante para criação ou edição de links (web ou internos).
 * @param {DOMRect} anchorRect Posição do cursor ou elemento âncora
 * @param {Object} options Configurações e callbacks
 * @param {Function} positionMenu Função de posicionamento na tela
 */
export function openLinkMenu(anchorRect, { href = '', texto = '', canRemove = false, onApply, onRemove }, positionMenu) {
  closeLinkMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu link-menu';

  const header = document.createElement('div');
  header.className = 'copy-menu-header';
  header.textContent = canRemove ? 'Editar link' : 'Novo link';

  const campo = (rotulo, valor, placeholder) => {
    const wrap = document.createElement('label');
    wrap.className = 'link-field';
    const nome = document.createElement('span');
    nome.className = 'link-field-label';
    nome.textContent = rotulo;
    const input = document.createElement('input');
    input.className = 'link-input';
    input.type = 'text';
    input.value = valor;
    input.placeholder = placeholder;
    wrap.append(nome, input);
    return { wrap, input };
  };

  const campoTexto = campo('Texto', texto, 'o que aparece na nota');
  const campoHref = campo('Endereço', href, 'exemplo.com.br');
  const input = campoHref.input;

  const error = document.createElement('div');
  error.className = 'link-error';
  error.textContent = 'Endereço inválido';
  error.hidden = true;

  const apply = () => {
    const url = safeHref(input.value);
    if (!url) {
      error.hidden = false;
      input.focus();
      return;
    }
    closeLinkMenu();
    onApply(url, campoTexto.input.value.trim() || url);
  };

  for (const { input: campoEl } of [campoTexto, campoHref]) {
    campoEl.addEventListener('mousedown', e => e.stopPropagation());
    campoEl.addEventListener('input', () => { error.hidden = true; });
    campoEl.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
      if (e.key === 'Escape') { e.preventDefault(); closeLinkMenu(); }
    });
  }

  const actions = document.createElement('div');
  actions.className = 'link-actions';

  const okBtn = document.createElement('button');
  okBtn.className = 'link-btn link-apply';
  okBtn.textContent = 'Aplicar';
  okBtn.addEventListener('mousedown', e => e.preventDefault());
  okBtn.addEventListener('click', apply);
  actions.appendChild(okBtn);

  if (canRemove) {
    const rmBtn = document.createElement('button');
    rmBtn.className = 'link-btn link-remove';
    rmBtn.textContent = 'Remover';
    rmBtn.addEventListener('mousedown', e => e.preventDefault());
    rmBtn.addEventListener('click', () => { closeLinkMenu(); onRemove(); });
    actions.appendChild(rmBtn);
  }

  menu.append(header, campoTexto.wrap, campoHref.wrap, error, actions);
  menu.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(menu);
  linkMenuEl = menu;
  if (typeof positionMenu === 'function') {
    positionMenu(menu, anchorRect);
  }

  const primeiro = texto ? campoHref.input : campoTexto.input;
  primeiro.focus();
}

/**
 * Abre o menu flutuante para edição de texto alternativo (Alt text) de imagem.
 * @param {HTMLElement} bloco Elemento do bloco de imagem
 * @param {DOMRect} anchorRect Posição do botão de ação
 * @param {Object} helpers Funções auxiliares do editor
 */
export function openAltMenu(bloco, anchorRect, { captureUndoPoint, setImageData, scheduleSave, positionMenu }) {
  closeAltMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu alt-menu';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = 'Texto alternativo';

  const dica = document.createElement('div');
  dica.className = 'alt-menu-hint';
  dica.textContent = 'Descreve a imagem pra quem usa leitor de tela — e é o que aparece se o arquivo se perder.';

  const campo = document.createElement('input');
  campo.className = 'link-input';
  campo.type = 'text';
  campo.value = bloco.dataset.alt ?? '';
  campo.placeholder = 'Ex.: print do protocolo aberto';

  const aplicar = () => {
    captureUndoPoint();
    setImageData(bloco, { alt: campo.value.trim() });
    closeAltMenu();
    scheduleSave();
  };

  campo.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); aplicar(); }
    if (e.key === 'Escape') { e.preventDefault(); closeAltMenu(); }
  });

  const ok = document.createElement('button');
  ok.className = 'copy-opt';
  ok.innerHTML = '<span class="copy-opt-value">Salvar</span>';
  ok.addEventListener('mousedown', e => e.stopPropagation());
  ok.addEventListener('click', aplicar);

  menu.append(head, dica, campo, ok);
  menu.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(menu);
  altMenuEl = menu;
  if (typeof positionMenu === 'function') {
    positionMenu(menu, anchorRect);
  }
  campo.focus();
  campo.select();
}
