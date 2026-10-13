// ── note-font.js ────────────────────────────────────────────────────────────
// Fonte da nota (Google Fonts). Cada nota guarda `meta.font` (nome da família); sem ela vale a fonte
// padrão do app. A família é carregada sob demanda (um <link> por fonte) — só as usadas pagam a rede.

export const NOTE_FONTS = [
  { name: 'Inter',            kind: 'Sem serifa' },
  { name: 'Roboto',           kind: 'Sem serifa' },
  { name: 'Open Sans',        kind: 'Sem serifa' },
  { name: 'Lato',             kind: 'Sem serifa' },
  { name: 'Arimo',            kind: 'Sem serifa (parecida com Arial)' },
  { name: 'Merriweather',     kind: 'Com serifa' },
  { name: 'Lora',             kind: 'Com serifa' },
  { name: 'Playfair Display', kind: 'Com serifa' },
  { name: 'Tinos',            kind: 'Com serifa (parecida com Times New Roman)' },
  { name: 'Source Serif 4',   kind: 'Com serifa' },
  { name: 'JetBrains Mono',   kind: 'Monoespaçada' },
  { name: 'Caveat',           kind: 'Manuscrita' },
];

const NOME_VALIDO = /^[A-Za-z0-9][A-Za-z0-9 ]{0,49}$/;
const carregadas = new Set();

/** Aceita só letras, números e espaços (o nome vai para uma URL e para o CSS). */
export const fonteValida = nome => typeof nome === 'string' && NOME_VALIDO.test(nome.trim());

export function urlDaFonte(nome) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(nome.trim()).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
}

/** Garante o <link> da família no <head>. Devolve false se o nome for inválido. */
export function carregarFonte(nome) {
  if (!fonteValida(nome)) return false;
  const n = nome.trim();
  if (carregadas.has(n) || typeof document === 'undefined') return true;
  carregadas.add(n);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = urlDaFonte(n);
  link.dataset.noteFont = n;
  document.head.appendChild(link);
  return true;
}

/** Aplica (ou limpa, com null) a fonte no editor da nota e na impressão. */
export function aplicarFonteDaNota(nome) {
  const raiz = document.documentElement;
  if (nome && carregarFonte(nome)) {
    raiz.style.setProperty('--note-font', `"${nome.trim()}", var(--font)`);
  } else {
    raiz.style.removeProperty('--note-font');
  }
}
