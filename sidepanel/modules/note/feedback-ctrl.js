import { t as tr } from '../i18n.js';
import { safeHref } from '../blocks.js';
import { showMathMenu } from './math-menu.js';
import { closeCopyMenu, showCopyMenu } from './menus.js';
import { S, indicator, mathCache, noteSection, root } from './state.js';

export function showFeedback(msg) {
  indicator.textContent = msg;
  indicator.classList.add('visible');
  clearTimeout(S.indicatorTimer);
  S.indicatorTimer = setTimeout(() => {
    indicator.classList.remove('visible');
    if (S.isCtrlHeld) {
      indicator.textContent = tr('Ctrl+clique para abrir link');
      indicator.classList.add('visible');
    }
  }, 1400);
}

export function setCtrl(active) {
  if (S.isCtrlHeld === active) return;
  S.isCtrlHeld = active;
  noteSection.classList.toggle('ctrl-active', active);

  if (active) {
    showFeedback(tr('Ctrl+clique para abrir link'));
  } else {
    if (!S.activeMenu) indicator.classList.remove('visible');
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Control' || e.key === 'Meta') setCtrl(true);
});

document.addEventListener('keyup', e => {
  if (e.key === 'Control' || e.key === 'Meta') setCtrl(false);
});

window.addEventListener('blur', () => setCtrl(false));

root.addEventListener('click', e => {
  // Resultado do bloco de cálculo (à direita): um clique copia o valor.
  const resultado = e.target.closest('.calc-result');
  if (resultado && root.contains(resultado)) {
    const texto = resultado.textContent.trim();
    if (texto) navigator.clipboard.writeText(texto).then(() => showFeedback('copiado!'));
    return;
  }

  // Com Ctrl, clique em link navega. Sem Ctrl o clique em link só posiciona o cursor.
  const link = e.target.closest('a');
  if (S.isCtrlHeld && link && root.contains(link)) {
    const href = safeHref(link.getAttribute('href'));
    if (href) window.open(href, '_blank', 'noopener');
    return;
  }

  // Valor detectado (CPF, data, cálculo, e-mail…): um clique abre o menu de cópia.
  const mark = e.target.closest('mark[data-type]');
  if (!mark) { closeCopyMenu(); return; }

  const type = mark.dataset.type;
  const raw  = mark.dataset.value;
  const rect = mark.getBoundingClientRect();

  // Cálculo continua com Ctrl+clique (como era); os outros valores abrem com um clique.
  if (type === 'math' && !S.isCtrlHeld) return;

  if (type === 'math') {
    const parsed = mathCache.get(raw);
    if (parsed) showMathMenu(parsed, rect);
    return;
  }
  showCopyMenu(type, raw, rect);
});
