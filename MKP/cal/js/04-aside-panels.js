// Aside direita: modos (config, nota, quadro, grafo), abrir e fechar
// A aside direita exibe OU o grafo de conexões OU as configurações (calendário/nota)
const asideGraphMode = document.getElementById('asideGraphMode');
const btnToggleGraph = document.getElementById('btnToggleGraph');
const btnSwapAsideGraph = document.getElementById('btnSwapAsideGraph');
const btnSwapAsideGraphIcon = document.getElementById('btnSwapAsideGraphIcon');
let graphView = false;

function setAsideMode(mode) {
  currentAsideMode = mode;
  const isNote = mode === 'note';
  const isBoard = mode === 'board';
  const asideBoardMode = document.getElementById('asideBoardMode');
  if (asideGraphMode) asideGraphMode.style.display = graphView ? 'flex' : 'none';
  if (asideCalendarMode) asideCalendarMode.style.display = (!graphView && !isNote && !isBoard) ? 'block' : 'none';
  if (asideNoteMode) asideNoteMode.style.display = (!graphView && isNote) ? 'block' : 'none';
  if (asideBoardMode) asideBoardMode.style.display = (!graphView && isBoard) ? 'block' : 'none';
  if (rightAsideTitle) {
    rightAsideTitle.textContent = graphView ? 'CONSTELAÇÕES' : (isBoard ? 'PAINEL DO QUADRO' : isNote ? 'PAINEL DA NOTA' : 'CONFIGURAÇÕES DA VIEW');
  }
  // O botão da aside mostra a alternativa: no grafo → configs (tune); nas configs → grafo (hub)
  if (btnSwapAsideGraphIcon) btnSwapAsideGraphIcon.textContent = graphView ? 'tune' : 'hub';
  if (btnSwapAsideGraph) btnSwapAsideGraph.title = graphView ? 'Ver configurações' : 'Ver constelações';
  btnToggleGraph?.classList.toggle('is-active', graphView && isRightAsideOpen());
}

function setGraphView(on) {
  graphView = on;
  setAsideMode(currentAsideMode);
}

function toggleGraphFromButton() {
  if (!isRightAsideOpen()) {
    openRightAside();
    setGraphView(true);
  } else if (graphView) {
    closeRightAside();
    setGraphView(false);
  } else {
    setGraphView(true);
  }
}

function isRightAsideOpen() {
  return !appContainer.classList.contains('has-right-aside-collapsed');
}

function openRightAside() {
  appContainer.classList.remove('has-right-aside-collapsed');
}

function closeRightAside() {
  appContainer.classList.add('has-right-aside-collapsed');
}

function toggleRightAsideForCurrentView() {
  const isNoteOpen = activeCell !== null || activeWeekCol !== null || inCellNotepad.style.display !== 'none';
  const targetMode = isNoteOpen ? (openItem?.kind === 'quadro' ? 'board' : 'note') : 'calendar';
  if (isRightAsideOpen() && graphView) {
    // Aside mostrando o grafo: o botão de configurações troca para as configs
    setGraphView(false);
    return;
  }
  if (!isRightAsideOpen()) {
    // Se a aside estiver recolhida: abre diretamente na visão atual (nota ou calendário)
    setAsideMode(targetMode);
    openRightAside();
  } else if (currentAsideMode !== targetMode) {
    // Se já estiver aberta mas mostrando a visão anterior: troca para o painel atual
    setAsideMode(targetMode);
  } else {
    // Se já estiver aberta na mesma visão: recolhe
    closeRightAside();
  }
}

function updateNoteStats() {
  const text = notepadTextarea.value;
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const chars = text.length;
  const statStr = `${words} palavra${words === 1 ? '' : 's'} • ${chars} caractere${chars === 1 ? '' : 's'}`;
  if (asideNoteStats) asideNoteStats.textContent = statStr;
  if (notepadStatus) {
    notepadStatus.textContent = trimmed ? `${statStr} (Salvo automaticamente)` : 'Salvo automaticamente localmente';
  }
}


