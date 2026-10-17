// ── note-page-guide.js ──────────────────────────────────────────────────────
// "Guia de páginas": opção (desligada por padrão) que, no próprio editor, mostra a nota como no Word: folhas
// A4 brancas separadas por um intervalo cinza, com as margens do painel de impressão, o número de cada página
// e o texto realmente empurrado para a folha seguinte quando a página acaba. Serve para ter noção do tamanho e
// de onde cada página começa e termina enquanto escreve; a edição continua igual.
//
// É APROXIMADO: um bloco que não cabe no resto da página vai INTEIRO para a seguinte (o Word parte o parágrafo
// linha a linha; o editor não consegue), então um parágrafo longo pode deixar um espaço em branco maior no fim
// da folha. A conta exata é a de "Ver como páginas" (Paged.js). Quebras de página forçam a folha seguinte.
//
// O empurrão é um `margin-top` no primeiro bloco de cada página; as folhas são um SVG de fundo do editor
// (e não elementos novos: o editor trata cada filho de #note-editor-blocks como um bloco da nota).

import { loadMargins, effectiveCm } from './note-print-margins.js';

const KEY = 'quickdock:note-page-guide';
const KEY_ORIENTACAO = 'quickdock:note-print-orientation';   // a mesma do modo de impressão
const MM = 96 / 25.4;                                         // pixels CSS por milímetro
const INTERVALO = 28;                                         // espaço cinza entre uma folha e a seguinte (px)

let ativo = false;
try { ativo = localStorage.getItem(KEY) === '1'; } catch { /* sem storage */ }
let raf = null, botao = null, observador = null;
const empurrados = new Set();                                 // blocos com margin-top posto por este módulo

export const isPageGuideOn = () => ativo;

function orientacao() {
  try { return localStorage.getItem(KEY_ORIENTACAO) === 'landscape' ? 'landscape' : 'portrait'; } catch { return 'portrait'; }
}

/**
 * Decide, sem mexer no DOM, quais blocos vão para o topo da página seguinte.
 * `blocos`: [{ tipo, top, altura, vazia }] medidos SEM nenhum empurrão (fluxo contínuo).
 * `geo`: { altura (da folha), margemTopo, margemBase, intervalo }.
 * Devolve { empurroes: [{ i, alvo }] (alvo = topo absoluto desejado), paginas }.
 */
export function planejar(blocos, geo) {
  const { altura: H, margemTopo: mt, margemBase: mb, intervalo: G } = geo;
  const inicioDe = p => p * (H + G) + mt;
  const fimDe = p => p * (H + G) + H - mb;
  const util = H - mt - mb;
  const empurroes = [];
  let pagina = 0, forcar = 0, acumulado = 0;
  blocos.forEach((b, i) => {
    let top = b.top + acumulado;
    if (b.tipo === 'pagebreak') {            // a própria linha da quebra fica na página que termina
      forcar = b.vazia ? 2 : 1;
      return;
    }
    let nova = forcar;
    if (!nova && b.altura <= util && top + b.altura > fimDe(pagina) + 0.5) nova = 1;   // não cabe no resto: vai inteiro
    if (nova) {
      pagina += nova; forcar = 0;
      const alvo = inicioDe(pagina);
      empurroes.push({ i, alvo });
      acumulado += alvo - top;
      top = alvo;
    }
    // bloco mais alto que a página: atravessa as seguintes; a conta continua da folha onde ele termina
    const ultima = Math.floor((top + b.altura - mt - 1) / (H + G));
    if (ultima > pagina) pagina = ultima;
  });
  if (forcar) pagina += forcar;              // terminou com quebra: a folha seguinte existe (vazia)
  return { empurroes, paginas: pagina + 1 };
}

function svgDasFolhas(paginas, W, H, G, mb) {
  const folhas = Array.from({ length: paginas }, (_, p) => {
    const y = p * (H + G);
    return `<rect x="0.5" y="${y + 0.5}" width="${W - 1}" height="${H - 1}" fill="oklch(100% 0 0)" stroke="oklch(80% 0 0)"/>`
      + `<text x="${W / 2}" y="${y + H - Math.max(8, mb / 2) + 3}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="oklch(55% 0 0)">Página ${p + 1}</text>`;
  }).join('');
  const total = paginas * H + (paginas - 1) * G;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}">${folhas}</svg>`;
}

function limpar(raiz) {
  for (const b of empurrados) b.style.marginTop = '';
  empurrados.clear();
  if (!raiz) return;
  ['--guide-w', '--guide-h', '--guide-pt', '--guide-pr', '--guide-pb', '--guide-pl', '--guide-svg'].forEach(p => raiz.style.removeProperty(p));
  raiz.style.zoom = '';
}

function desenhar() {
  raf = null;
  const raiz = document.getElementById('note-editor-blocks');
  if (!raiz) return;
  if (!ativo) { document.body.classList.remove('has-page-guide'); limpar(raiz); return; }

  const m = effectiveCm(loadMargins());
  const paisagem = orientacao() === 'landscape';
  const W = (paisagem ? 297 : 210) * MM, H = (paisagem ? 210 : 297) * MM;
  const px = cm => cm * 10 * MM;
  const topo = px(m.top), base = px(m.bottom);

  // folha primeiro (largura e margens), para os blocos serem medidos já com a largura do papel
  limpar(raiz);
  document.body.classList.add('has-page-guide');
  const set = (k, v) => raiz.style.setProperty(k, v);
  set('--guide-w', `${W}px`); set('--guide-pt', `${topo}px`); set('--guide-pr', `${px(m.right)}px`);
  set('--guide-pb', `${base}px`); set('--guide-pl', `${px(m.left)}px`);
  const editor = document.querySelector('.note-editor');
  const z = Math.min(1, Math.max(0.3, ((editor?.clientWidth ?? W) - 32) / W));   // coluna mais estreita que o papel: encolhe
  raiz.style.zoom = z < 1 ? String(z) : '';

  const filhos = [...raiz.children];
  const medidos = filhos.map(b => ({ tipo: b.dataset?.type ?? '', top: b.offsetTop, altura: b.offsetHeight, vazia: b.dataset?.blank === 'true' }));
  const plano = planejar(medidos, { altura: H, margemTopo: topo, margemBase: base, intervalo: INTERVALO });
  const paginas = plano.paginas;

  for (const { i, alvo } of plano.empurroes) {
    const b = filhos[i];
    const margem0 = parseFloat(getComputedStyle(b).marginTop) || 0;
    const antes = b.offsetTop;
    b.style.marginTop = `${margem0 + (alvo - antes)}px`;
    const real = b.offsetTop;                                        // margens vizinhas podem se fundir: corrige a diferença
    if (Math.abs(real - alvo) > 0.5) b.style.marginTop = `${margem0 + (alvo - antes) + (alvo - real)}px`;
    empurrados.add(b);
  }

  const total = paginas * H + (paginas - 1) * INTERVALO;
  set('--guide-h', `${total}px`);
  set('--guide-svg', `url("data:image/svg+xml,${encodeURIComponent(svgDasFolhas(paginas, W, H, INTERVALO, base))}")`);
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
