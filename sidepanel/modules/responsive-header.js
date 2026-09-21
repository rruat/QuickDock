// ── responsive-header.js ───────────────────────────────────────────────────
// Mecanismo genérico pra manter os 4 cabeçalhos de painel (Quadro, Grafo,
// Calendário, Documentos) usáveis em qualquer largura — extensão, mobile, ou
// uma coluna do desktop redimensionada bem estreita (ver desktop-panels.js).
//
// Em vez de media queries (baseadas na largura da JANELA, que não tem nada a
// ver com a largura real de uma coluna redimensionável), um ResizeObserver no
// próprio cabeçalho mede o espaço disponível de verdade e vai escondendo os
// botões menos essenciais (numa ordem definida por cabeçalho) até caber,
// mostrando um botão "⋮" que abre um menu com o que sumiu.
//
// Nenhum botão é movido/reparented — continuam exatamente onde já estavam no
// DOM (só escondidos com display:none), porque views.js encontra vários deles
// por getElementById pra trocar ícone/título (updateHeightButtons /
// updateFullscreenButtons) e não pode perdê-los de vista. O menu só espelha
// clique: cada linha chama botaoOriginal.click().

import { positionPopover } from './popover.js';

let menuAberto = null;
let menuAncora = null;

function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
  menuAncora = null;
}

function rotuloDoBotao(el) {
  return el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim() || '';
}

function iconeDoBotao(el) {
  return el.querySelector('.qd-icon')?.textContent?.trim() || '';
}

function abrirMenu(anchorEl, candidatosEscondidos) {
  fecharMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu header-overflow-menu';
  menu.addEventListener('mousedown', e => e.stopPropagation());

  for (const btn of candidatosEscondidos) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'copy-opt';
    const icone = iconeDoBotao(btn);
    opt.innerHTML = `
      ${icone ? `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${icone}</span>` : ''}
      <span class="copy-opt-value">${rotuloDoBotao(btn)}</span>
    `;
    opt.addEventListener('click', e => {
      e.stopPropagation();
      fecharMenu();
      btn.click();
    });
    menu.appendChild(opt);
  }

  document.body.appendChild(menu);
  menuAberto = menu;
  menuAncora = anchorEl;
  positionPopover(menu, anchorEl);

  const aoClicarFora = e => {
    if (!menuAberto) return;
    if (menuAberto.contains(e.target) || anchorEl.contains(e.target)) return;
    fecharMenu();
    document.removeEventListener('mousedown', aoClicarFora);
    document.removeEventListener('pointerdown', aoClicarFora);
  };
  setTimeout(() => {
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('pointerdown', aoClicarFora);
  }, 10);
}

function criarBotaoMais() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn header-more-btn';
  btn.title = 'Mais opções';
  btn.setAttribute('aria-label', 'Mais opções');
  btn.hidden = true;
  btn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">more_vert</span>';
  return btn;
}

// Reconcilia um cabeçalho: mostra tudo, mede, esconde candidatos (do menos
// pro mais essencial) até caber, considerando que o próprio botão "⋮"
// também ocupa espaço quando aparece.
function reconciliar(header, candidatos, botaoMais) {
  if (menuAncora === botaoMais) fecharMenu();

  for (const btn of candidatos) btn.classList.remove('header-overflow-hidden');
  botaoMais.hidden = true;

  // Recalculado a cada reconciliação (não uma vez só na inicialização) —
  // alguns candidatos já são display:none por outro motivo mesmo antes de
  // qualquer coisa aqui rodar (ex: os botões de altura/tela-cheia somem de
  // propósito no desktop, ver style.css, porque não compõem com painéis
  // simultâneos), e não faz sentido "resgatar" esses pro menu "⋮". Checar de
  // novo a cada chamada (em vez de guardar uma vez só) evita depender de o
  // CSS já estar totalmente aplicado bem cedo, no boot.
  const elegiveis = candidatos.filter(btn => getComputedStyle(btn).display !== 'none');

  const cabe = () => header.scrollWidth <= header.clientWidth + 1;

  if (cabe()) return;

  const escondidos = [];
  for (const btn of elegiveis) {
    if (cabe()) break;
    btn.classList.add('header-overflow-hidden');
    escondidos.push(btn);
  }
  botaoMais.hidden = false;
  // O botão "⋮" que acabou de aparecer também ocupa espaço — se isso
  // empurrou de volta pra fora, esconde mais um candidato.
  for (const btn of elegiveis) {
    if (escondidos.includes(btn)) continue;
    if (cabe()) break;
    btn.classList.add('header-overflow-hidden');
    escondidos.push(btn);
  }
}

// Funções de reconciliação de todos os cabeçalhos já inicializados — usado
// pelo gatilho por evento abaixo, que existe porque o ResizeObserver sozinho
// não pega de forma confiável a transição "painel escondido -> painel
// visível" (quem sai de [hidden] é o ancestral .board-view/.graph-view/etc.,
// não o cabeçalho em si). Redimensionar uma coluna já aberta (arrastar a
// alça de largura) continua funcionando só com o ResizeObserver, que dispara
// bem quando o próprio cabeçalho já está renderizado.
const executores = [];

function reconciliarTudo() {
  for (const executar of executores) executar();
}

// `seletoresCandidatos` já vem em ordem: do menos essencial (primeiro a
// sumir) pro mais essencial (só some se não sobrar mais nada pra esconder).
function initHeader(headerSeletor, seletoresCandidatos) {
  const header = document.querySelector(headerSeletor);
  if (!header) return;
  const candidatos = seletoresCandidatos
    .map(sel => header.querySelector(sel))
    .filter(Boolean);
  if (candidatos.length === 0) return;

  const botaoMais = criarBotaoMais();
  header.appendChild(botaoMais);
  botaoMais.addEventListener('click', e => {
    e.stopPropagation();
    if (menuAncora === botaoMais) {
      fecharMenu();
      return;
    }
    const escondidos = candidatos.filter(btn => btn.classList.contains('header-overflow-hidden'));
    abrirMenu(botaoMais, escondidos);
  });

  const executar = () => reconciliar(header, candidatos, botaoMais);
  new ResizeObserver(() => requestAnimationFrame(executar)).observe(header);
  executores.push(executar);
  executar();
}

export function initResponsiveHeaders() {
  // Cobre a transição "painel abriu/fechou/mudou de coluna" (desktop) e
  // "trocou de visão" (modelo antigo, mobile/extensão) — em ambos os casos um
  // cabeçalho pode passar de invisível pra visível sem o ResizeObserver
  // necessariamente notar a tempo.
  // Dois rAF em sequência (não um só): o primeiro roda antes do layout da
  // mudança de [hidden] ter sido de fato aplicado nessa transição específica
  // (confirmado na prática — com um só, a medição ainda pegava o cabeçalho
  // com largura zero), o segundo já vê o resultado final.
  const reconciliarNoProximoFrame = () => requestAnimationFrame(() => requestAnimationFrame(reconciliarTudo));
  document.addEventListener('quickdock:desktop-panels-changed', reconciliarNoProximoFrame);
  document.addEventListener('quickdock:view-changed', reconciliarNoProximoFrame);

  initHeader('.board-header', [
    '#btn-board-open-tab',
    '#btn-zoom-reset',
    '#btn-export-json',
    '#btn-board-toggle-height',
    '#btn-board-toggle-fullscreen',
    '#btn-zoom-in',
    '#btn-zoom-out',
    '#tool-note-create',
    '#tool-note-link',
    '#tool-group',
    '#tool-image',
    '#tool-arrow',
  ]);

  initHeader('.graph-header', [
    '#btn-graph-toggle-height',
    '#btn-graph-toggle-fullscreen',
    '#btn-graph-zoom-reset',
    '#btn-graph-zoom-out',
    '#btn-graph-zoom-in',
  ]);

  initHeader('.calendar-header', [
    '#btn-calendar-toggle-height',
    '.calendar-filter-group',
    '#btn-calendar-today',
  ]);

  initHeader('.docs-header', [
    '#btn-docs-toggle-height',
    '#btn-view-all',
    '#btn-view-note',
  ]);
}
