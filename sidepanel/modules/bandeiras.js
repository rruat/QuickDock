// Bandeiras dos idiomas da interface, em SVG (emoji de bandeira não aparece no
// Windows: mostra só as letras "BR", "PT"). Todas usam a mesma área 60×40.

const ABRE = '<svg class="lang-flag" viewBox="0 0 60 40" aria-hidden="true">';
const FECHA = '</svg>';

const BANDEIRA_BR = ABRE +
  '<rect width="60" height="40" fill="#009c3b"/>' +
  '<polygon points="30,5 55,20 30,35 5,20" fill="#ffdf00"/>' +
  '<circle cx="30" cy="20" r="8.5" fill="#002776"/>' +
  FECHA;

const BANDEIRA_PT = ABRE +
  '<rect width="24" height="40" fill="#006600"/>' +
  '<rect x="24" width="36" height="40" fill="#ff0000"/>' +
  '<circle cx="24" cy="20" r="7" fill="#ffcc00" stroke="#d00000" stroke-width="1.5"/>' +
  FECHA;

const BANDEIRA_ES = ABRE +
  '<rect width="60" height="40" fill="#c60b1e"/>' +
  '<rect y="10" width="60" height="20" fill="#ffc400"/>' +
  FECHA;

const BANDEIRA_UK = ABRE +
  '<rect width="60" height="40" fill="#012169"/>' +
  '<path d="M0 0L60 40M60 0L0 40" stroke="#ffffff" stroke-width="8"/>' +
  '<path d="M0 0L60 40M60 0L0 40" stroke="#c8102e" stroke-width="4"/>' +
  '<path d="M30 0V40M0 20H60" stroke="#ffffff" stroke-width="12"/>' +
  '<path d="M30 0V40M0 20H60" stroke="#c8102e" stroke-width="7"/>' +
  FECHA;

const BANDEIRAS = {
  'pt-BR': BANDEIRA_BR,
  'pt-PT': BANDEIRA_PT,
  en: BANDEIRA_UK,
  es: BANDEIRA_ES,
};

// Bandeira (SVG) do idioma, ou null se não houver.
export function bandeiraDoIdioma(codigo) {
  return BANDEIRAS[codigo] ?? null;
}
