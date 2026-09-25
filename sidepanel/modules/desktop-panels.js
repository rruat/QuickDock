// ── desktop-panels.js ──────────────────────────────────────────────────────
// Sistema de painéis simultâneos, redimensionáveis e empilháveis do modo
// desktop-web.
//
// O modelo antigo (views.js) é uma máquina de estado EXCLUSIVA: só existe uma
// "view atual", trocar de view esconde qualquer outra. Isso continua servindo
// mobile/extensão (que nunca chamam nada deste arquivo) e os modos
// tela-cheia/templates/editor em qualquer plataforma.
//
// No desktop, Quadro/Grafo/Calendário/Documentos agora podem ficar abertos ao
// mesmo tempo, cada um como uma coluna de largura própria ao lado da Nota —
// e dois (ou mais) podem ficar empilhados dentro da MESMA coluna, arrastando
// o cabeçalho de um painel e soltando na metade de baixo de outro. Este
// módulo é deliberadamente "de baixo nível" — só mexe em `platform.js`,
// `storage.js` e no DOM diretamente, nunca importa de `documents.js`/
// `views.js`/`graph-view.js`/`board-engine.js`/`calendar-view.js`, pra não
// criar ciclo de import. A comunicação com esses módulos é só por evento
// (`quickdock:refresh-<nome>-view`, que eles já escutam) — ver o plano em
// C:\Users\Apis\.claude\plans\majestic-enchanting-dewdrop.md.

import { isDesktopMode } from './platform.js';
import { loadDesktopPanelLayout, saveDesktopPanelLayout } from './storage.js';

// Ordem fixa da esquerda pra direita quando várias COLUNAS estão abertas
// (a Nota fica implicitamente em 10 via CSS já existente). Os handles de
// redimensionar largura ficam em PANEL_ORDER-1, entre a coluna anterior e a
// coluna deste painel — só aparecem quando o painel É uma raiz (dono de uma
// coluna própria); um painel empilhado não tem largura independente.
const PANEL_ORDER = { board: 20, grafo: 30, calendar: 40, docs: 50, bases: 60 };
const PANEL_NAMES = Object.keys(PANEL_ORDER);
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 260;
const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 120;

// Nome do painel → id do botão de tela cheia no cabeçalho dele (grafo é a
// exceção, o id existente chama-se "graph", não "grafo" — mesmo mapeamento
// de REFRESH_EVENT_NAME mais abaixo). Docs não tem esse botão (nunca teve,
// nem no modelo antigo de visão exclusiva).
const MAXIMIZE_BTN_ID = { board: 'btn-board-toggle-fullscreen', grafo: 'btn-graph-toggle-fullscreen', calendar: 'btn-calendar-toggle-fullscreen', bases: 'btn-bases-toggle-fullscreen' };

// Painel maximizado "por cima" dos outros — os demais continuam abertos por
// baixo (nada em openPanels/stackParent muda) e voltam exatamente como
// estavam ao sair do modo. Deliberadamente não persiste entre recarregamentos
// (é um modo de foco temporário, não uma escolha de layout).
let maximizedPanel = null;

const openPanels = new Set();
const panelWidths = {};   // largura em px, indexada pelo nome da RAIZ (dona da coluna)
const panelHeights = {};  // altura em px, indexada por qualquer painel que tenha algo empilhado embaixo
const stackParent = {};   // filho -> pai; ausência = raiz (dona de uma coluna própria)
const handles = {};       // alças de largura, uma por nome fixo
const rowHandles = {};    // alças de altura (entre um painel e o que está empilhado embaixo dele)
const columnWrappers = {}; // wrapper .desktop-panel-column atual, indexado pelo nome da raiz

let dragSrcPanel = null;

function panelElement(name) {
  switch (name) {
    case 'board': return document.querySelector('.board-view');
    case 'grafo': return document.querySelector('.graph-view');
    case 'calendar': return document.querySelector('.calendar-view');
    case 'docs': return document.querySelector('.docs-section');
    case 'bases': return document.querySelector('.bases-view');
    default: return null;
  }
}

function panelHeaderElement(name) {
  switch (name) {
    case 'board': return document.querySelector('.board-header');
    case 'grafo': return document.querySelector('.graph-header');
    case 'calendar': return document.querySelector('.calendar-header');
    case 'docs': return document.querySelector('.docs-header');
    case 'bases': return document.querySelector('.bases-header');
    default: return null;
  }
}

function setPanelVisible(name, visible) {
  const el = panelElement(name);
  if (!el) return;
  // .docs-section usa .is-collapsed (controlado por documents.js) pra
  // esconder, não [hidden] — é essa a classe que o CSS do desktop realmente
  // lê pra essa seção. Os outros três usam [hidden], igual ao modelo antigo.
  if (name === 'docs') {
    el.classList.toggle('is-collapsed', !visible);
  } else {
    el.hidden = !visible;
  }
}

function applyPanelHeight(name) {
  const el = panelElement(name);
  if (!el) return;
  el.style.setProperty('--panel-height', `${panelHeights[name] || DEFAULT_HEIGHT}px`);
}

function persist() {
  saveDesktopPanelLayout({
    open: [...openPanels],
    widths: { ...panelWidths },
    stackParent: { ...stackParent },
    heights: { ...panelHeights },
  });
}

function notifyChanged() {
  document.dispatchEvent(new CustomEvent('quickdock:desktop-panels-changed', {
    detail: { open: [...openPanels] },
  }));
}

// Só existem 4 painéis possíveis, então um mapa "filho -> pai" já basta pra
// representar o empilhamento (não precisa de árvore genérica). Uma coluna só
// aceita um filho por nível — soltar num alvo que já tem filho é ignorado.
function childOf(name) {
  return PANEL_NAMES.find(n => stackParent[n] === name) || null;
}

function rootOf(name) {
  let cur = name;
  const visto = new Set();
  while (stackParent[cur] != null && openPanels.has(stackParent[cur]) && !visto.has(cur)) {
    visto.add(cur);
    cur = stackParent[cur];
  }
  return cur;
}

// `name` está entre os descendentes de `possivelAncestral`? (percorre a
// cadeia de filhos) — usado só pra recusar um drop que criaria um ciclo.
function isDescendant(name, possivelAncestral) {
  let cur = possivelAncestral;
  const visto = new Set();
  while (cur != null && !visto.has(cur)) {
    if (cur === name) return true;
    visto.add(cur);
    cur = childOf(cur);
  }
  return false;
}

// Desanexa `name` de onde estiver, promovendo quem estava empilhado embaixo
// dele pro lugar que `name` ocupava — sem isto, fechar (ou redocar) um painel
// do meio de uma cadeia de 3 deixaria o resto órfão, sem coluna nenhuma pra
// aparecer.
function detach(name) {
  const filho = childOf(name);
  if (filho) {
    if (name in stackParent) stackParent[filho] = stackParent[name];
    else delete stackParent[filho];
  }
  delete stackParent[name];
}

function closePanel(name) {
  detach(name);
  openPanels.delete(name);
  if (maximizedPanel === name) maximizedPanel = null;
}

// Reaproveita o mesmo botão de "tela cheia" que já existe em cada cabeçalho
// (escondido no desktop até agora — ver o comentário na regra CSS que o
// escondia) com um comportamento adaptado: em vez de trocar a visão exclusiva
// inteira (que não existe mais aqui), só faz ESTE painel cobrir a tela toda
// por cima dos outros, que continuam abertos por baixo sem perder largura,
// empilhamento nem posição de rolagem — sair do modo devolve tudo do jeito
// que estava, sem precisar de applyLayout() nenhum.
export function toggleMaximizePanel(name) {
  if (!PANEL_ORDER[name] || !openPanels.has(name)) return;
  maximizedPanel = (maximizedPanel === name) ? null : name;
  applyMaximizeState();
}

export function isPanelMaximized(name) {
  return maximizedPanel === name;
}

function applyMaximizeState() {
  document.documentElement.classList.toggle('has-maximized-panel', !!maximizedPanel);
  for (const nome of Object.keys(MAXIMIZE_BTN_ID)) {
    const el = panelElement(nome);
    const isto = nome === maximizedPanel;
    if (el) el.classList.toggle('desktop-panel-maximized', isto);
    const btn = document.getElementById(MAXIMIZE_BTN_ID[nome]);
    if (!btn) continue;
    const titulo = isto ? 'Sair da tela cheia' : 'Expandir para tela cheia (100%)';
    btn.title = titulo;
    btn.setAttribute('aria-label', titulo);
    const icone = btn.querySelector('.qd-icon');
    if (icone) icone.textContent = isto ? 'fullscreen_exit' : 'fullscreen';
  }
  document.dispatchEvent(new CustomEvent('quickdock:maximize-changed', { detail: { maximizedPanel } }));
}

function dockBelow(dragged, target) {
  if (dragged == null || dragged === target) return;
  if (childOf(target) != null) return; // alvo já tem alguém embaixo — só um filho por nível
  if (isDescendant(target, dragged)) return; // soltar em cima do próprio descendente criaria um ciclo
  detach(dragged);
  stackParent[dragged] = target;
  applyLayout();
  persist();
}

function getOrCreateColumnWrapper(root) {
  if (columnWrappers[root]) return columnWrappers[root];
  const wrapper = document.createElement('div');
  wrapper.className = 'desktop-panel-column';
  wrapper.dataset.root = root;
  document.getElementById('app')?.appendChild(wrapper);
  columnWrappers[root] = wrapper;
  return wrapper;
}

// Reconciliação completa a cada chamada (não um patch incremental): recalcula
// todas as raízes do zero, desmonta colunas que sobraram e remonta cada uma —
// mais simples e muito menos sujeito a estado inconsistente do que tentar
// aplicar só a diferença.
function applyLayout() {
  for (const name of PANEL_NAMES) {
    setPanelVisible(name, openPanels.has(name));
  }

  const raizes = PANEL_NAMES.filter(n => openPanels.has(n) && rootOf(n) === n);
  const appEl = document.getElementById('app');

  // Nunca remover uma coluna com um painel ainda dentro dela — panelElement()
  // usa querySelector, que só acha nós presos no documento; um painel preso
  // dentro de um wrapper removido ficaria inalcançável pra sempre.
  for (const raiz of Object.keys(columnWrappers)) {
    if (!raizes.includes(raiz)) {
      const wrapper = columnWrappers[raiz];
      while (wrapper.firstChild) {
        appEl?.appendChild(wrapper.firstChild);
      }
      wrapper.remove();
      delete columnWrappers[raiz];
    }
  }

  const temAlcaEmbaixo = new Set();

  for (const raiz of raizes) {
    const wrapper = getOrCreateColumnWrapper(raiz);
    wrapper.style.order = String(PANEL_ORDER[raiz]);
    wrapper.style.setProperty('--panel-width', `${panelWidths[raiz] || DEFAULT_WIDTH}px`);

    // A alça de largura é filha do próprio wrapper (posicionada em cima da
    // borda esquerda dele via CSS) — só existe uma vez que o wrapper existe,
    // por isso é anexada aqui e não em createHandle().
    if (handles[raiz]) {
      wrapper.appendChild(handles[raiz]);
      handles[raiz].hidden = false;
    }

    // Monta a cadeia (raiz, filho, neto...) com guarda de ciclo por segurança
    // contra um storage salvo à mão/corrompido.
    const cadeia = [];
    const visto = new Set();
    let cur = raiz;
    while (cur != null && openPanels.has(cur) && !visto.has(cur)) {
      visto.add(cur);
      cadeia.push(cur);
      cur = childOf(cur);
    }

    cadeia.forEach((nome, i) => {
      const el = panelElement(nome);
      if (!el) return;
      wrapper.appendChild(el);
      // order par (0,2,4...) deixa os valores ímpares (1,3,5...) livres pras
      // alças de altura entre um painel e o próximo da pilha.
      el.style.order = String(i * 2);
      const ehUltimo = i === cadeia.length - 1;
      el.classList.toggle('desktop-panel-stack-last', ehUltimo);
      if (ehUltimo) {
        el.style.removeProperty('--panel-height');
      } else {
        applyPanelHeight(nome);
        temAlcaEmbaixo.add(nome);
        const alca = rowHandles[nome];
        if (alca) {
          // Filha do próprio painel `nome` (posicionada em cima da borda de
          // baixo dele via CSS), não do wrapper — a divisa é entre este
          // painel e o próximo da pilha, então é aqui que ela precisa estar.
          el.appendChild(alca);
          alca.hidden = false;
        }
      }
    });
  }

  for (const nome of PANEL_NAMES) {
    if (handles[nome] && !raizes.includes(nome)) handles[nome].hidden = true;
    if (rowHandles[nome] && !temAlcaEmbaixo.has(nome)) rowHandles[nome].hidden = true;
  }
}

// Nome do painel → nome usado no evento de refresh de cada módulo (grafo é a
// exceção: o evento existente chama-se "graph", não "grafo").
const REFRESH_EVENT_NAME = { board: 'board', grafo: 'graph', calendar: 'calendar', bases: 'bases' };

function refreshPanelContent(name) {
  // 'docs' não precisa: o grid de documentos já se mantém em sincronia com a
  // nota ativa por conta própria, não existe um "refresh-docs-view".
  const eventName = REFRESH_EVENT_NAME[name];
  if (!eventName) return;
  document.dispatchEvent(new CustomEvent(`quickdock:refresh-${eventName}-view`));
}

export function isDesktopPanelOpen(name) {
  return openPanels.has(name);
}

export function toggleDesktopPanel(name) {
  if (!PANEL_ORDER[name]) return;
  const abrindo = !openPanels.has(name);
  if (abrindo) {
    openPanels.add(name);
  } else {
    closePanel(name);
  }
  applyLayout();
  persist();
  notifyChanged();
  if (abrindo) {
    refreshPanelContent(name);
  } else {
    document.dispatchEvent(new CustomEvent('quickdock:panel-closed', { detail: { panel: name } }));
  }
}

// A alça não é mais um item de flex à parte (que reservava um vão fixo entre
// as colunas) — vira filho do próprio wrapper que ela redimensiona,
// posicionado em cima da borda esquerda dele (position:absolute, sem tirar
// espaço do layout). É a própria linha da borda que fica arrastável.
function createHandle(name) {
  const handle = document.createElement('div');
  handle.className = 'desktop-panel-handle';
  handle.dataset.panel = name;
  handle.title = 'Arraste para redimensionar';
  handle.hidden = true;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startWidth = panelWidths[name] || DEFAULT_WIDTH;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // A alça fica na borda ESQUERDA da coluna: arrastar pra direita encolhe,
    // pra esquerda cresce.
    const delta = e.clientX - startX;
    const maxWidth = Math.max(MIN_WIDTH, window.innerWidth * 0.7);
    const novaLargura = Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth - delta)));
    panelWidths[name] = novaLargura;
    const wrapper = columnWrappers[name];
    if (wrapper) wrapper.style.setProperty('--panel-width', `${novaLargura}px`);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    persist();
  });

  return handle;
}

// Mesma ideia do createHandle acima, mas na vertical: filho do próprio
// painel `name`, em cima da borda de baixo dele.
function createRowHandle(name) {
  const handle = document.createElement('div');
  handle.className = 'desktop-panel-row-handle';
  handle.dataset.panel = name;
  handle.title = 'Arraste para redimensionar';
  handle.hidden = true;

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startY = e.clientY;
    startHeight = panelHeights[name] || DEFAULT_HEIGHT;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // A alça fica na borda DE BAIXO do painel `name`: arrastar pra baixo
    // cresce ele (empurra a divisa pra baixo), pra cima encolhe.
    const delta = e.clientY - startY;
    const wrapper = panelElement(name)?.closest('.desktop-panel-column');
    const maxHeight = wrapper ? Math.max(MIN_HEIGHT, wrapper.clientHeight * 0.8) : 2000;
    const novaAltura = Math.round(Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + delta)));
    panelHeights[name] = novaAltura;
    applyPanelHeight(name);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    persist();
  });

  return handle;
}

// Injeta um "grip" pequeno e dedicado em cada cabeçalho (nunca o cabeçalho
// inteiro — o Quadro tem um <input> editável de título ali dentro, e
// draggable=true num ancestral atrapalharia a seleção/edição de texto nele).
// Espelha o padrão já usado pras abas de notas em notes-tabs.js: guarda a
// origem numa variável de módulo em vez de dataTransfer, já que origem e
// destino vivem na mesma página.
function initPanelDragAndDrop() {
  for (const name of PANEL_NAMES) {
    const header = panelHeaderElement(name);
    const panel = panelElement(name);
    if (!header || !panel) continue;

    const grip = document.createElement('span');
    grip.className = 'desktop-panel-drag-grip';
    grip.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">drag_indicator</span>';
    grip.title = 'Arraste para encaixar embaixo de outro painel';
    grip.draggable = true;
    header.prepend(grip);

    grip.addEventListener('dragstart', e => {
      dragSrcPanel = name;
      e.dataTransfer.effectAllowed = 'move';
    });
    grip.addEventListener('dragend', () => {
      dragSrcPanel = null;
      document.querySelectorAll('.desktop-panel-drop-target-bottom')
        .forEach(el => el.classList.remove('desktop-panel-drop-target-bottom'));
    });

    panel.addEventListener('dragover', e => {
      if (dragSrcPanel == null || dragSrcPanel === name || childOf(name) != null) {
        panel.classList.remove('desktop-panel-drop-target-bottom');
        return;
      }
      const rect = panel.getBoundingClientRect();
      const naFaixaDeBaixo = (e.clientY - rect.top) / rect.height > 0.65;
      if (!naFaixaDeBaixo) {
        panel.classList.remove('desktop-panel-drop-target-bottom');
        return;
      }
      e.preventDefault();
      panel.classList.add('desktop-panel-drop-target-bottom');
    });
    panel.addEventListener('dragleave', () => {
      panel.classList.remove('desktop-panel-drop-target-bottom');
    });
    panel.addEventListener('drop', e => {
      const origem = dragSrcPanel;
      panel.classList.remove('desktop-panel-drop-target-bottom');
      dragSrcPanel = null;
      if (origem == null || origem === name || childOf(name) != null) return;
      e.preventDefault();
      dockBelow(origem, name);
    });
  }
}

export function initDesktopPanels() {
  if (!isDesktopMode()) return;

  for (const name of PANEL_NAMES) {
    panelWidths[name] = DEFAULT_WIDTH;
    handles[name] = createHandle(name);
    rowHandles[name] = createRowHandle(name);
  }
  initPanelDragAndDrop();

  for (const [nome, btnId] of Object.entries(MAXIMIZE_BTN_ID)) {
    document.getElementById(btnId)?.addEventListener('click', () => toggleMaximizePanel(nome));
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && maximizedPanel) toggleMaximizePanel(maximizedPanel);
  });
  // Estado inicial (tudo fechado) já aplicado de cara — initDocuments() pode
  // ter deixado .docs-section sem .is-collapsed por causa de uma chave antiga
  // compartilhada com o mobile; isto evita um flash antes do layout salvo
  // (assíncrono) carregar.
  applyLayout();

  loadDesktopPanelLayout().then(({ open, widths, stackParent: savedStackParent, heights }) => {
    for (const name of open) {
      if (PANEL_ORDER[name]) openPanels.add(name);
    }
    Object.assign(panelWidths, widths);
    Object.assign(panelHeights, heights);
    for (const [filho, pai] of Object.entries(savedStackParent || {})) {
      if (PANEL_ORDER[filho] && PANEL_ORDER[pai] && openPanels.has(filho) && openPanels.has(pai)) {
        stackParent[filho] = pai;
      }
    }
    applyLayout();
    notifyChanged();
    for (const name of openPanels) {
      refreshPanelContent(name);
    }
  });

  // "Modelos" passa pelo switchView antigo, que esconde incondicionalmente
  // graph/board/calendar (e nada os restaura ao voltar) — sem isto, qualquer
  // painel que o usuário tinha aberto sumiria pra sempre ao visitar a galeria
  // de modelos e voltar.
  document.addEventListener('quickdock:view-changed', e => {
    if (e.detail?.previousView === 'templates') {
      applyLayout();
      for (const name of openPanels) {
        refreshPanelContent(name);
      }
    }
  });
}
