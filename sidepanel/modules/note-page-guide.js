// ── note-page-guide.js ──────────────────────────────────────────────────────
// "Guia de páginas": opção (desligada por padrão) que, no próprio editor, mostra o conteúdo da nota como uma
// folha A4 — largura e margens do painel de impressão — com linhas tracejadas onde cada página termina e a
// numeração delas. Serve para ter noção do tamanho enquanto escreve; a edição continua igual.
//
// É APROXIMADO: o texto corre contínuo e as linhas são calculadas somando a altura dos blocos (um parágrafo
// que atravessa a linha é partido ali; tabela, código e imagem vão inteiros para a página seguinte; quebra de
// página força a próxima). A conta exata é a de "Ver como páginas", que usa o Paged.js.
//
// As linhas são desenhadas por um SVG de fundo (pseudo-elemento do editor), e não por elementos novos:
// o editor trata cada filho de #note-editor-blocks como um bloco da nota.

import { loadMargins, effectiveCm } from './note-print-margins.js';

const KEY = 'quickdock:note-page-guide';
const KEY_ORIENTACAO = 'quickdock:note-print-orientation';   // a mesma do modo de impressão
const MM = 96 / 25.4;                                         // pixels CSS por milímetro
const NAO_PARTE = new Set(['table', 'code', 'image', 'audio', 'video', 'base', 'calc', 'toc']);

let ativo = false;
try { ativo = localStorage.getItem(KEY) === '1'; } catch { /* sem storage */ }
let observador = null, raf = null, botao = null;

export const isPageGuideOn = () => ativo;

function orientacao() {
  try { return localStorage.getItem(KEY_ORIENTACAO) === 'landscape' ? 'landscape' : 'portrait'; } catch { return 'portrait'; }
}

/** Posições das linhas de fim de página, somando a altura dos blocos. Pura: recebe medidas, devolve marcas. */
export function calcularMarcas(blocos, { margemTopo, alturaUtil }) {
  const marcas = [];
  let pagina = 1;
  let inicio = margemTopo;                       // onde começa o conteúdo da página atual
  for (const b of blocos) {
    const topo = b.top, fim = b.top + b.altura;
    if (b.tipo === 'pagebreak') {
      pagina++; marcas.push({ y: topo + b.altura / 2, n: pagina, forcada: true });
      inicio = fim;
      if (b.vazia) { pagina++; marcas.push({ y: fim, n: pagina, forcada: true }); }
      continue;
    }
    let guarda = 0;
    while (fim > inicio + alturaUtil && guarda++ < 500) {
      if (NAO_PARTE.has(b.tipo) && topo > inicio + 1) {   // bloco que não se parte: começa a página seguinte
        pagina++; marcas.push({ y: topo, n: pagina }); inicio = topo;
      } else {                                            // texto: a linha cai onde a página acaba
        inicio += alturaUtil; pagina++; marcas.push({ y: inicio, n: pagina });
      }
    }
  }
  return { marcas, paginas: pagina };
}

function svgDasLinhas(marcas, largura, altura, labelX) {
  const linhas = marcas.map(m => `<line x1="0" x2="${largura}" y1="${m.y}" y2="${m.y}" stroke="oklch(62% 0.02 260)" stroke-width="1" stroke-dasharray="6 4"/>`
    + `<text x="${labelX}" y="${m.y - 4}" text-anchor="end" font-family="sans-serif" font-size="10" fill="oklch(50% 0.02 260)">Página ${m.n}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">${linhas}</svg>`;
}

function desenhar() {
  raf = null;
  const raiz = document.getElementById('note-editor-blocks');
  if (!raiz) return;
  if (!ativo) {
    document.body.classList.remove('has-page-guide');
    ['--guide-w', '--guide-h', '--guide-pt', '--guide-pr', '--guide-pb', '--guide-pl', '--guide-svg'].forEach(p => raiz.style.removeProperty(p));
    raiz.style.zoom = '';
    return;
  }
  const m = effectiveCm(loadMargins());
  const paisagem = orientacao() === 'landscape';
  const W = (paisagem ? 297 : 210) * MM, H = (paisagem ? 210 : 297) * MM;
  const px = cm => cm * 10 * MM;
  const topo = px(m.top), base = px(m.bottom), dir = px(m.right), esq = px(m.left);

  document.body.classList.add('has-page-guide');
  const set = (k, v) => raiz.style.setProperty(k, v);
  set('--guide-w', `${W}px`); set('--guide-h', `${H}px`);
  set('--guide-pt', `${topo}px`); set('--guide-pr', `${dir}px`); set('--guide-pb', `${base}px`); set('--guide-pl', `${esq}px`);

  // A folha encolhe (zoom) quando a coluna da nota é mais estreita que o papel: a conta de linhas continua a mesma
  const editor = document.querySelector('.note-editor');
  const disponivel = (editor?.clientWidth ?? W) - 32;
  const z = Math.min(1, Math.max(0.3, disponivel / W));
  raiz.style.zoom = z < 1 ? String(z) : '';

  const blocos = [...raiz.children].map(b => ({
    tipo: b.dataset?.type ?? '', top: b.offsetTop, altura: b.offsetHeight, vazia: b.dataset?.blank === 'true',
  }));
  const { marcas, paginas } = calcularMarcas(blocos, { margemTopo: topo, alturaUtil: Math.max(40, H - topo - base) });
  const altura = Math.max(raiz.scrollHeight, H);
  set('--guide-svg', `url("data:image/svg+xml,${encodeURIComponent(svgDasLinhas(marcas, W, altura, W - 10))}")`);
  if (botao) botao.title = `Guia de páginas (A4) — ${paginas} ${paginas === 1 ? 'página' : 'páginas'} aproximadas`;
}

/** Redesenha (conteúdo, margens, orientação ou largura mudaram); junta várias chamadas num só quadro. */
export function refreshPageGuide() {
  if (raf) return;
  raf = requestAnimationFrame(desenhar);
}

export function setPageGuide(on) {
  ativo = !!on;
  try { localStorage.setItem(KEY, ativo ? '1' : '0'); } catch { /* sem storage */ }
  botao?.classList.toggle('active', ativo);
  botao?.setAttribute('aria-pressed', String(ativo));
  refreshPageGuide();
}

function montar() {
  const acoes = document.querySelector('#section-note .section-header-actions');
  const raiz = document.getElementById('note-editor-blocks');
  if (!acoes || !raiz) return;
  botao = document.createElement('button');
  botao.id = 'btn-note-page-guide';
  botao.type = 'button';
  botao.className = 'section-btn btn-page-guide-note';
  botao.title = 'Guia de páginas (A4)';
  botao.setAttribute('aria-label', 'Guia de páginas');
  botao.setAttribute('aria-pressed', String(ativo));
  botao.classList.toggle('active', ativo);
  botao.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">article</span>';
  botao.addEventListener('click', (e) => { e.stopPropagation(); setPageGuide(!ativo); });
  acoes.insertBefore(botao, acoes.firstChild);

  // o conteúdo muda de altura a cada tecla; a coluna muda de largura com as asides
  observador = new ResizeObserver(refreshPageGuide);
  observador.observe(raiz);
  const editor = document.querySelector('.note-editor');
  if (editor) observador.observe(editor);
  new MutationObserver(refreshPageGuide).observe(raiz, { childList: true });
  document.addEventListener('quickdock:active-note-changed', refreshPageGuide);
  window.addEventListener('resize', refreshPageGuide);
  refreshPageGuide();
}

// fora de um navegador de verdade (testes) não há cabeçalho nem editor: não monta nada
try { if (typeof document !== 'undefined') montar(); } catch { /* ambiente sem DOM completo */ }
