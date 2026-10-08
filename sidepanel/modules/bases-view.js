// ── bases-view.js ────────────────────────────────────────────────────────
// A tela principal do QuickDock: a Base ÚNICA do workspace (padrão do mockup MKP/CAL.HTML).
// Todos os itens (notas e quadros) vivem nessa base de dados; o que muda é a VIEW
// (calendário, tabela, galeria…), escolhida na aside esquerda. O componente de Base em si
// (bases-view-container.js: motor, filtros, views, painel de configuração) é o mesmo de
// sempre — este módulo só decide QUAL Base mostrar e onde guardar a configuração dela
// (workspace-base.js).

import { renderBaseComponent } from './bases/bases-view-container.js';
import { requestBaseView } from './bases/engine/view-request.js';
import { WORKSPACE_BASE_ID } from './workspace-base-model.js';
import { loadWorkspaceYaml, saveWorkspaceDraft, getActiveViewId, setActiveViewId, loadWorkspaceDef } from './workspace-base.js';
import { goBack } from './views.js';
import { isDesktopMode } from './platform.js';
import { toggleDesktopPanel } from './desktop-panels.js';
import { fadeIn } from './shell/shell-motion.js';

let bodyEl = null;
// O que está montado agora: evita remontar (e piscar) a cada evento de atualização da tela.
let mountedYaml = null;
let lastViewId = null;

function limparMontagemAnterior() {
  if (typeof bodyEl?._cleanup === 'function') bodyEl._cleanup();
}

async function montarWorkspace() {
  if (!bodyEl) return;
  limparMontagemAnterior();
  const yaml = loadWorkspaceYaml();
  mountedYaml = yaml;
  requestBaseView(WORKSPACE_BASE_ID, getActiveViewId());   // abre direto na view ativa
  await renderBaseComponent(bodyEl, yaml, {
    embedded: true,
    panel: true, // painel dedicado: atende pedidos da aside esquerda (abrir/criar view)
    // as configurações da view moram na aside DIREITA do shell (shell-right-aside.js)
    settingsHost: document.getElementById('rightAsideViewHost'),
    toolsHost: document.getElementById('rightAsideViewTools'),
    settingsOpen: !!document.getElementById('app') && !document.getElementById('app').classList.contains('is-right-aside-collapsed'),
    baseId: WORKSPACE_BASE_ID,
    // mudanças feitas dentro do painel (abas, filtros, configurações) vão para o RASCUNHO:
    // a Base salva só muda em "Salvar" (barra "modificada" do cabeçalho)
    onConfigChange: (novoYaml) => { mountedYaml = novoYaml; saveWorkspaceDraft(novoYaml); },
    onViewChange: (id) => {
      setActiveViewId(id);
      atualizarTituloDaTela(id);
      // trocou de view (não é só um redesenho das abas): a área da view aparece suavemente
      if (lastViewId && lastViewId !== id) fadeIn(bodyEl.querySelector('.base-viewport'));
      lastViewId = id;
    },
  });
}

// O título da tela é o nome da view ativa (como no mockup)
function atualizarTituloDaTela(viewId = getActiveViewId()) {
  const titulo = document.querySelector('#bases-view > .section-header .section-title');
  const view = loadWorkspaceDef().views.find(v => v.id === viewId);
  if (titulo && view?.name) titulo.textContent = view.name;
}

export function initBasesView() {
  bodyEl = document.getElementById('bases-body');
  if (!bodyEl) return;

  // No desktop a Base é um painel que se liga/desliga (ver desktop-panels.js),
  // não uma tela cheia com histórico pra "voltar" — o botão fecha o painel.
  document.getElementById('btn-bases-back')?.addEventListener('click', () => {
    if (isDesktopMode()) toggleDesktopPanel('bases');
    else goBack();
  });

  // Mostrar a tela: só monta se ainda não está montada ou se a configuração mudou por fora
  const garantirMontada = () => {
    if (mountedYaml === null || mountedYaml !== loadWorkspaceYaml()) montarWorkspace();
  };
  document.addEventListener('quickdock:view-changed', e => { if (e.detail?.view === 'bases') garantirMontada(); });
  document.addEventListener('quickdock:refresh-bases-view', garantirMontada);
  document.addEventListener('quickdock:workspace-title-refresh', () => atualizarTituloDaTela());

  // A aside esquerda criou, duplicou, renomeou ou excluiu uma view: remonta com a Base nova
  document.addEventListener('quickdock:workspace-base-changed', () => montarWorkspace());

  garantirMontada();
}
