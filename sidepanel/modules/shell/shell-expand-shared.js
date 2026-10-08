// ── shell-expand-shared.js ──────────────────────────────────────────────────
// Peças comuns às animações de "a célula/coluna vira a tela" (mês e semana): lista de trilhas
// em px e o cabeçalho da tela (título + seletor de tipo), que também é engolido pela expansão.

export const px = list => list.map(n => `${n}px`).join(' ');

export function headerParts() {
  return {
    section: document.getElementById('bases-view'),
    header: document.getElementById('basesSectionHeader'),
    switcher: document.getElementById('viewSwitcher'),
  };
}

export const setSection = (cls, on) => headerParts().section?.classList.toggle(cls, on);
