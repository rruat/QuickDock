// ── shell-footer-label.js ───────────────────────────────────────────────────
// Rodapé do shell (padrão do mockup): com a Base em foco mostra "<nome da view> (<escala>)",
// ex.: "Calendário (Mês)". Fora dela, o spatial-shell mantém o título da tela.

import { loadWorkspaceDef, getActiveViewId } from '../workspace-base.js';

const SCALE_LABEL = { month: 'Mês', week: 'Semana', day: 'Dia', agenda: 'Agenda' };

/** Texto do rodapé para uma view da Base (sem DOM, testável). */
export function footerLabelFor(view) {
  if (!view) return '';
  const nome = view.name || '';
  return view.type === 'calendar' && SCALE_LABEL[view.mode] ? `${nome} (${SCALE_LABEL[view.mode]})` : nome;
}

export function initFooterLabel() {
  const el = document.getElementById('footer-active-view-name');
  if (!el) return;
  const update = () => {
    if (document.documentElement.dataset.shellFocus !== 'bases') return;
    const def = loadWorkspaceDef();
    const text = footerLabelFor(def.views.find(v => v.id === getActiveViewId(def)));
    if (text) el.textContent = text;
  };
  // roda depois do spatial-shell, que escreve o título da tela no mesmo evento de foco
  const later = () => setTimeout(update, 0);
  ['quickdock:shell-focus', 'quickdock:workspace-active-view-changed', 'quickdock:workspace-draft-changed', 'quickdock:workspace-base-saved']
    .forEach(ev => document.addEventListener(ev, later));
  later();
}
