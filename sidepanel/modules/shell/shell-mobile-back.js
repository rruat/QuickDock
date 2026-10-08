// ── shell-mobile-back.js ────────────────────────────────────────────────────
// Botão "voltar" do header mobile + integração com o botão voltar do sistema
// (history/popstate). No mobile o .section-header some e várias views ficam sem
// saída; este módulo dá a todas uma só saída consistente.
// Ver docs/MOBILE-REFATORACAO-ADAPTABILIDADE.md (fase M0).

import { closeAllMobileDrawers } from './shell-mobile.js';

const HISTORY_KEY = 'qdMobileView';
const ROOT_VIEW = 'bases'; // a Base (views) é a raiz; nota e quadro são itens abertos a partir dela

function isMobilePlatform() {
  return document.documentElement.dataset.platform === 'mobile';
}

function ensureBackButton() {
  let btn = document.getElementById('btn-mobile-back');
  if (btn) return btn;
  const left = document.querySelector('#mHeader .header-left');
  if (!left) return null;
  btn = document.createElement('button');
  btn.id = 'btn-mobile-back';
  btn.type = 'button';
  btn.className = 'aside-btn mobile-header-btn mobile-back-btn';
  btn.title = 'Voltar';
  btn.setAttribute('aria-label', 'Voltar');
  btn.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>';
  left.insertBefore(btn, left.firstChild);
  return btn;
}

export function setupMobileBack() {
  if (!isMobilePlatform()) return;
  const btn = ensureBackButton();
  if (!btn) return;

  let pushed = false;

  let focused = document.documentElement.dataset.shellFocus || ROOT_VIEW;
  const goRoot = () => {
    if (typeof window.quickdockOpenView === 'function') window.quickdockOpenView(ROOT_VIEW);
  };

  const sync = () => {
    const inView = focused !== ROOT_VIEW;
    btn.classList.toggle('is-visible', inView);
    document.body.classList.toggle('has-view-back', inView);
    if (inView && !pushed) {
      try { history.pushState({ [HISTORY_KEY]: true }, ''); pushed = true; } catch (_) {}
    }
    if (!inView) pushed = false;
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Consome a entrada de histórico empurrada (popstate troca a view)
    if (pushed) history.back();
    else goRoot();
  });

  document.addEventListener('quickdock:shell-focus', (e) => {
    const next = e.detail?.viewId || ROOT_VIEW;
    if (next !== focused) closeAllMobileDrawers();
    focused = next;
    sync();
  });

  window.addEventListener('popstate', () => {
    // O botão voltar do sistema consome o estado empurrado e sai da view
    pushed = false;
    if (focused !== ROOT_VIEW) goRoot();
  });

  sync();
}
