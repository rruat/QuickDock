import { escHtml } from '../blocks.js';
import { buildCopyOptions } from './copy-options.js';
import { showFeedback } from './feedback-ctrl.js';
import { TYPE_LABELS, validateCNPJ, validateCPF } from './format.js';
import { S } from './state.js';

export function positionMenu(menu, anchorRect) {
  const gap = 6;
  const margin = 8;
  const below = window.innerHeight - anchorRect.bottom - gap - margin;
  const above = anchorRect.top - gap - margin;
  const openDown = below >= above;
  const avail = Math.max(80, openDown ? below : above);

  menu.style.maxHeight = `${avail}px`;
  menu.style.overflowY = 'auto';

  const height = Math.min(menu.scrollHeight, avail);
  // Prende dentro da janela nas duas pontas: num painel bem baixo o espaço do
  // lado escolhido pode ser menor que o piso, e sem isto o menu vazaria.
  let top = openDown ? anchorRect.bottom + gap : anchorRect.top - gap - height;
  top = Math.max(margin, Math.min(top, window.innerHeight - margin - height));

  menu.style.top  = `${top}px`;
  menu.style.left = `${Math.max(margin, Math.min(anchorRect.left, window.innerWidth - menu.offsetWidth - margin))}px`;
}

export function closeCopyMenu() {
  S.activeMenu?.remove();
  S.activeMenu = null;
}

export function showCopyMenu(type, raw, anchorRect) {
  closeCopyMenu();

  const options = buildCopyOptions(type, raw);
  const menu    = document.createElement('div');
  menu.className = 'copy-menu';

  const header = document.createElement('div');
  header.className   = 'copy-menu-header';
  header.textContent = TYPE_LABELS[type] || 'Valor detectado';
  menu.appendChild(header);

  if (type === 'cpf' || type === 'cnpj') {
    const valid  = type === 'cpf' ? validateCPF(raw) : validateCNPJ(raw);
    const badge  = document.createElement('div');
    badge.className   = `copy-menu-badge ${valid ? 'valid' : 'invalid'}`;
    badge.textContent = valid ? '✓ Válido' : '✗ Inválido';
    menu.appendChild(badge);
  }

  for (const { label, hint, value } of options) {
    const btn = document.createElement('button');
    btn.className = 'copy-opt';
    btn.innerHTML = `
      <span class="copy-opt-value">${escHtml(label)}</span>
      ${hint ? `<span class="copy-opt-hint">${escHtml(hint)}</span>` : ''}
    `;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(value).then(() => {
        showFeedback('copiado!');
        closeCopyMenu();
      });
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  S.activeMenu = menu;
  positionMenu(menu, anchorRect);
}

document.addEventListener('mousedown', e => {
  if (S.activeMenu && !S.activeMenu.contains(e.target)) closeCopyMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCopyMenu();
});
