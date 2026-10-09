# Planejamento — QuickDock com o design do mockup (Base única do workspace)

> Atualizado em 2026-10-08 (P1–P8 implementados; ver §12). Branch de trabalho: `feat/shell-workspace-mockup` (cópia de segurança: `feat/shell-workspace-mockup-copia`).
> Referências: mockup vivo `MKP/CAL.HTML` + `MKP/cal/{css,js}`; cópia congelada `MKP/ref-2026-10-08/`.

## 1. Princípio

**O mockup rege o design e a forma de apresentar; o app entrega as ferramentas poderosas.**

- Design, estrutura de tela, asides, fluxos e animações: copiar do mockup, de forma idêntica.
- Dados e ferramentas: usar o que o QuickDock já tem — notas em Markdown (`note.js`), quadro infinito (`board-engine.js`), motor de Bases (tabela, galeria, calendário, quadro/kanban, lista, linha do tempo…, filtros, propriedades), sincronização, PWA.
- Nunca portar o JS do mockup para o app: ele usa dados fictícios. Portar **estrutura, CSS e comportamento**, ligados aos módulos reais.
- O mockup continua sendo o laboratório: decisões de design novas entram **nele primeiro**, depois migram.

### Modelo mental (igual ao mockup)

```
Workspace
 └─ UMA Base (todos os itens: notas + quadros, cada um com data)
     └─ Views salvas sobre essa Base (calendário, tabela, galeria, quadro, lista, linha do tempo…)
         Nav: Home · Modelos · Configurações
         Aside esquerda : lista de views (busca, criar por tipo, duplicar, renomear, excluir)
         Tela principal : a view ativa (uma por vez)
         Aside direita  : configurações da view | painel da nota | painel do quadro | constelações
```

Não existem mais "telas" separadas para Calendário, Bases, Constelações, Documentos ou JSON: calendário/tabela/galeria são **views**; constelações é **modo da aside direita**.

## 2. O que já está feito (desktop)

| Área | Estado | Onde |
|---|---|---|
| Nav enxuta (Home, Modelos, Configurações), aside esquerda recolhível, uma view por vez | ✅ | `spatial-shell.js`, `css/35-shell-v2.css`, HTMLs |
| Base única do workspace + views (criar por tipo, duplicar, renomear, excluir, buscar) | ✅ | `workspace-base-model.js` (puro, testado), `workspace-base.js`, `shell/shell-views-list.js`, `bases-view.js` |
| Aside direita com 3 modos (view, nota, quadro), redimensionável, estado salvo | ✅ | `shell/shell-right-aside.js`, `shell-note-panel.js`, `shell-board-panel.js` |
| Header expansível com seletor do tipo da view | ✅ | `shell/shell-view-switcher.js`, `view-request.js` (`EVT_SET_TYPE`) |
| Navegação do calendário, busca, exportar, Nova Nota e filtro rápido na aside direita | ✅ | `bases-view-container.js` (`toolsHost`), `bases-calendar-view.js` (`toolbarHost`) |
| Quadros como itens da Base (propriedade de sistema **Tipo**), abrindo o quadro a partir da view | ✅ | `workspace-items*.js`, `bases-engine.js` (`kind`), `open-note.js`, `storage.js` |
| Animação de abrir: célula do **mês** expande (listras da grade até as bordas, engole o header da tela) | ✅ | `shell/shell-month-expand.js` |
| Animação de abrir nas demais views (recorte a partir do item), asides deslizando, fades de troca de tela; chave própria "Animações de abertura" | ✅ | `shell-expand-transition.js`, `shell-motion.js` |
| Explorador de arquivos antigo oculto no desktop (regra reversível) | ✅ | `35-shell-v2.css` |

Testes: `node test/run.mjs` — 1905 verificações; os testes novos estão em `test/shell-views-list-tests.mjs`.

## 3. Mapa de módulos (para quem for continuar)

```
sidepanel/
  css/35-shell-v2.css                  estilos do novo shell (grade, asides, switcher, painéis, animações do mês)
  modules/
    spatial-shell.js                   controlador do shell (nav, asides, abrir/focar views, voltar às views)
    bases-view.js                      monta a Base do workspace no painel (mountedYaml, onViewChange)
    workspace-base-model.js            PURO: Base inicial, parse, add/duplicate/delete/rename, busca
    workspace-base.js                  localStorage + eventos (…-saved, …-changed, …-active-view-changed)
    workspace-items-model.js           PURO: quadro → item (id "board-<id>")
    workspace-items.js                 notas + quadros do banco
    bases/bases-view-container.js      motor da Base (options.panel/settingsHost/toolsHost/onViewChange)
    bases/engine/view-request.js       pedidos de FORA para o painel (selecionar/criar/trocar tipo/abrir config)
    shell/shell-views-list.js          lista de views na aside esquerda
    shell/shell-right-aside.js         aside direita (modos, largura, abrir/fechar)
    shell/shell-view-switcher.js       header expansível (tipo da view)
    shell/shell-note-panel.js          move propriedades + sumário/backlinks da nota para a aside
    shell/shell-board-panel.js         painel do quadro (nome, pasta, fundo, zoom, exportar, excluir)
    shell/shell-expand-transition.js   origem do clique + crescimento por recorte (views sem animação própria)
    shell/shell-month-expand.js        expansão da célula do mês (trilhas do grid)
    shell/shell-motion.js              chave de animações, slideIn, fadeIn
MKP/                                   mockup (CAL.HTML + cal/css + cal/js) e ref-2026-10-08/
```

## 4. Pendências no desktop

Legenda de esforço: **P** pequeno (≤ 1 dia) · **M** médio (1–3 dias) · **G** grande (> 3 dias).

### P1. Constelações como modo da aside direita — **M**

- **Mockup:** botão `hub` no cabeçalho da view; a aside direita alterna entre configurações e o grafo de conexões (`MKP/cal/js/04-aside-panels.js`, `09-graph.js`, `css/07-graph.css`). Clicar no `hub` abre a aside no grafo; clicar no `tune` volta às configurações.
- **App hoje:** `graph-view.js` existe como tela própria (`#graph-view`, `data-id="graph"`), sem acesso pela nav. Só a Omnibar abre.
- **Fazer:**
  1. Adicionar `ASIDE_MODES.graph = 'CONSTELAÇÕES'` em `shell-right-aside.js` e um host `#rightAsideGraphHost` nos 3 HTMLs.
  2. Botão `hub` em `.section-header-actions` da Base, da nota e do quadro (mesmo padrão do `data-aside-toggle`).
  3. Montar o grafo existente no host da aside: duas alternativas — (a) **reparent** do elemento do grafo (como `shell-note-panel.js`), (b) reinicializar `graph-view.js` com um contêiner configurável. Preferir (a) se o grafo localizar seus elementos por id; senão (b).
  4. Nós do grafo = **itens da Base** (notas e quadros), clicar abre o item com a animação.
  5. Ao voltar de nota/quadro, o modo da aside lembra o último (config ou grafo).
- **Aceite:** `hub` abre/fecha o grafo na aside; redimensionar a aside reencaixa o canvas; clicar num nó abre a nota; tema claro/escuro correto (OKLCH).
- **Riscos:** o grafo mede o contêiner no init (canvas) — disparar `resize` ao abrir (já feito em `apply()`); mobile fica fora.
- **Testes:** contrato (host nos HTMLs, modo no `ASIDE_MODES`, botão `hub`), pré-cache no `sw.js`.

### P2. Fluxo "modificada" (rascunho + Salvar/Descartar) — **G**

- **Mockup:** alterar tipo, filtros ou ordenação **não** altera a view salva. O header mostra um ponto + **Salvar** / **Descartar**, a lista mostra um ponto na view, e o painel da view tem "Salvar alterações", "Salvar como nova view", "Descartar", "Excluir" (`MKP/cal/js/11-views-model.js`: `draft`, `isDraftModified`, `saveDraftToView`, `saveDraftAsNewView`, `discardDraft`; `17-views-list.js`: `updateDirtyBar`).
- **App hoje:** o motor grava a cada mudança (`persistBase` → `onConfigChange` → `saveWorkspaceYaml({silent:true})`). Não há rascunho.
- **Fazer (proposta):**
  1. Guardar no `workspace-base.js` duas cópias: **salva** (`quickdock:workspace-base`) e **rascunho** (em memória/sessão).
  2. O painel (`bases-view.js`) passa a gravar `onConfigChange` **no rascunho** (nova função `saveWorkspaceDraft`), não na salva; `isDraftModified()` compara os dois (ignorar `name`, que salva na hora).
  3. Barra "modificada" no cabeçalho da Base (Salvar / Descartar) e ponto na lista (`shell-views-list.js`).
  4. Ações: **Salvar** (rascunho → salva), **Descartar** (rascunho := salva e remonta), **Salvar como nova view** (cria view com o rascunho).
  5. Trocar de view com rascunho sujo: perguntar (salvar / descartar / cancelar) ou descartar com aviso — **decidir** (ver §6).
- **Aceite:** mudar um filtro marca "modificada"; recarregar a página descarta (ou restaura — decidir); Salvar persiste; Descartar volta ao estado salvo; renomear não suja.
- **Riscos:** o contêiner grava YAML completo a cada mudança — o diff precisa ser feito sobre a definição da view ativa (não da Base inteira); mudanças em outras views (ex.: duplicar) são imediatas por design.
- **Testes:** unidade pura do diff `isModified(saved, draft)` em `workspace-base-model.js`.

### P3. Expansão da coluna na visão semanal — **M**

- **Mockup:** a coluna do dia clicado expande como a célula do mês (`MKP/cal/js/06-week-col.js`, `css/05-calendar-week-day.css` — `.is-col-expanded`, `setWeekTracks`).
- **App hoje:** a semana usa o crescimento por recorte (`playExpandOpen`).
- **Fazer:** criar `shell/shell-week-expand.js` com a mesma API de `shell-month-expand.js` (`expandWeekColumn`, `collapseWeekColumn`, `resetWeekExpansion`), animando `grid-template-columns` do cabeçalho de dias (`.bcal-time-head`) e do corpo (`.bcal-time-inner`, `--bcal-cols`), recolhendo o cabeçalho da tela como no mês. Detectar a coluna de origem no `trackExpandOrigin` (guardar `weekCol` ao lado de `cell`).
- **Reutilizar** `headerParts()`/`setSection()` do módulo do mês (extrair para `shell-expand-shared.js` se o arquivo passar de ~200 linhas).
- **Aceite:** abrir um evento na semana expande a coluna até o topo; voltar encolhe; sem estado preso ao trocar de view.
- **Testes:** mesmos contratos do mês (trilhas, reset, não usar `requestAnimationFrame`).

### P4. Painéis **Modelos** e **Configurações** na aside esquerda — **M**

- **Mockup:** Home, Modelos e Configurações abrem **painéis na aside esquerda** (`MKP/cal/js/16-nav-left-aside.js`). Modelos lista *notas modelo* (Reunião, Diário, Planejamento semanal, Registro de decisão) e *quadros modelo* (Mapa mental, Fluxo, Storyboard), "Usar" cria o item. Configurações: tema, idioma, data padrão dos itens, sincronização, sobre.
- **App hoje:** os botões abrem as telas antigas em tela cheia (`templates-gallery-view`, `settings-view`). Só a Home tem painel na aside.
- **Fazer:**
  1. `setAsidePanel('home'|'models'|'settings')` em `spatial-shell.js` (a aside esquerda passa a ter 3 painéis; Home = lista de views).
  2. **Modelos:** ligar à biblioteca real (`loadAllTemplates` / `createNoteFromTemplate` em `notes-tabs.js`) para as notas modelo; **criar modelos de quadro** (mapa, fluxo, storyboard) como registros de quadro pré-montados (usar `createBlankBoard` + cartões iniciais). A galeria completa continua acessível por "Gerenciar modelos".
  3. **Configurações:** mover o que existe hoje na `settings-view` (painel lateral, animações) + tema (já no header) + sincronização (já existe `btn-sync`) para o painel; remover a tela cheia.
- **Aceite:** Modelos/Configurações abrem na aside sem trocar a tela principal; "Usar" cria nota/quadro e abre com a animação; toggles continuam salvos.
- **Riscos:** testes atuais exigem `data-nav-view="templates|settings"` e `#settings-view` nos 3 HTMLs — atualizar junto.

### P5. Aparência dos itens nas views (quadro × nota, cor por grupo) — **M**

- **Mockup:** no calendário o quadro é card tracejado com ícone `space_dashboard`; notas têm cor por grupo (`MKP/cal/css/06-data-views.css` `.cal-note-chip[data-kind="quadro"]`).
- **App hoje:** `bases-engine` expõe `kind`, mas nenhuma view usa para estilo; cor vem de `colorBy` da view.
- **Fazer:**
  1. `calendar-event-el.js` (`createEventEl`) e os cartões da galeria/lista/quadro: adicionar `data-kind="quadro"` quando `note.isBoard` e CSS dedicado (borda tracejada + ícone) em `35-shell-v2.css`.
  2. Default de cor: se a view não define `colorBy`, colorir por **pasta** (usar `engine/color-rules.js`) — definir paleta em OKLCH com par claro/escuro (ver `docs/PADRAO-DE-CORES-OKLCH.md`).
  3. Tabela: incluir a coluna **Tipo** nas views novas (`createView` → `props`).
- **Aceite:** quadros distinguíveis em calendário, tabela, galeria e lista; contraste ≥ 55 de L entre fundo e texto em ambos os temas.

### P6. Miniatura do quadro na galeria — **M**

- **Mockup:** `boardThumb()` desenha um SVG com os cartões e conexões do quadro (`MKP/cal/js/10-data.js`).
- **App hoje:** cartão da galeria mostra ícone.
- **Fazer:** `shell/board-thumb.js` (puro: recebe `cards`/`arrows`, devolve SVG string) + usar em `bases-gallery-view.js` quando `note.isBoard`. `boardToItem` precisa carregar uma versão leve de `cards`/`arrows` (só x, y, w, h, cor) para não pesar a lista.
- **Aceite:** miniatura fiel ao quadro; atualiza quando o quadro muda (`quickdock:board-changed`).
- **Testes:** função pura com quadro de exemplo → viewBox e quantidade de `<rect>`.

### P7. Escala do calendário e legenda de grupos na aside esquerda — **P**

- **Mockup:** painel Home tem seletor Mês/Semana/Dia e "Grupos" com contagem (`left-panel`, `renderLeftGroups`).
- **App hoje:** a escala está na zona de ferramentas da aside direita; a legenda não existe.
- **Fazer:** decidir se a escala **também** aparece na esquerda (duplicar) ou se a direita basta; legenda de grupos = contagem por **pasta** (ou Tipo) da view ativa, clicável para filtrar rápido (usa `quick-filters`).

### P8. Detalhes de fidelidade — **P**

- **Rodapé:** `#footer-active-view-name` mostra o nome da tela; mockup mostra `"<nome da view> (<escala>)"`. Atualizar via `onViewChange` + `quickdock:workspace-active-view-changed`.
- **Esc:** fecha nota/quadro e volta às views (hoje não faz). Ouvir `keydown Escape` no shell quando `shellFocus` ∈ {notes, board} e nada estiver em edição (checar `isEditorFocused`).
- **Título do cabeçalho na expansão:** no mockup o título passa a "Nota" **durante** a expansão; no app troca no fim. Antecipar a troca do `section-title` para o título do item no início de `expandMonthCell`.
- **Cabeçalho da nota/quadro:** hoje herdam o layout antigo (`section-header` com título livre); alinhar ao padrão do cabeçalho da Base (ícone, título, `tune`).
- **Estados vazios:** calendário/tabela sem itens → mensagem "Nenhum item nesta view" (mockup `view-empty`).

## 5. Pendências estruturais (decisões + trabalho)

### E1. Onde guardar a configuração da Base do workspace — **decidir (impacta sincronização)**

Hoje fica em `localStorage` (`quickdock:workspace-base`, `quickdock:workspace-active-view`), **sem sincronizar** entre dispositivos. Opções:

1. **Nota especial** (um arquivo `.md`/YAML na raiz, ex.: `_workspace.base.md`) — sincroniza de graça pelo motor existente; aparece como nota (esconder do explorador/Bases com uma propriedade de sistema).
2. **Tabela de configuração no Dexie** (`settings`) + incluir no manifesto de sincronização.
3. **Manter local** (mais simples; aceitável só para uso em um dispositivo).

Recomendação: **opção 1** (reaproveita sync, histórico e conflito). Migração: ao iniciar, se existir config no `localStorage` e não existir a nota, criar a nota a partir dela.

### E2. Telas removidas da navegação — **decidir destino**

Calendário (legado), Documentos (anexos), JSON Studio, Quadro como tela própria e Constelações saíram da nav. Estado:

| Tela | Destino proposto |
|---|---|
| Calendário legado (`calendar-view.js`) | Substituído pela view de calendário das Bases. Remover o código quando nada mais depender (testes, omnibar). |
| Constelações | Modo da aside direita (P1). |
| Quadro | Item da Base + tela ao abrir (feito). Lista de quadros = view filtrada por Tipo. |
| Documentos | **Pendente**: virar propriedade/aba do painel da nota ou view "Arquivos"? |
| JSON Studio | **Pendente**: virar item (tipo "JSON") da Base ou ferramenta em Modelos/Configurações? |

Enquanto não decidido, ficam acessíveis só pela Omnibar (`shell-omnibar.js`) — **não apagar o código**.

### E3. Explorador de arquivos antigo (oculto)

A regra `#mAside.mode-notes .notes-aside-drawer { display:none }` em `35-shell-v2.css` é reversível. Perdas hoje: árvore de pastas, busca na árvore, arrastar nota entre pastas, atalhos Exportar/Tutorial. Decidir se a **pasta** vira filtro/agrupamento (já é propriedade `folder`) e se o arrastar-para-pasta volta como ação na tabela.

### E4. Ações em lote e itens-quadro

`bases-bulk-controller`/`bulk-actions` assumem notas. Hoje só título e pasta de um quadro são editáveis (via `storage.updateNoteMetaById` com id `board-<id>`). Revisar: excluir em lote deve **excluir quadros também** (`removeBoard`), propriedades personalizadas não se aplicam a quadros (esconder a edição), exportar inclui quadros?

### E5. Plataformas

- `sidepanel/index.html` (extensão) e `404.html` recebem o mesmo HTML; o CSS do shell novo só vale em `html[data-platform="desktop"]`. Conferir a **extensão** (painel estreito): hoje a nav/asides ficam ocultas por `22-spatial-shell.css`; garantir que a Base do workspace abre direito lá.
- Sincronizar as 3 cópias de HTML a cada mudança (há testes que verificam os ids).

### E6. Desempenho

`loadWorkspaceItems()` lê **todas** as notas (com `content`) a cada evento `note-updated`. Com milhares de notas, medir. Plano: cache por `updatedAt`, ou carregar `content` só para as propriedades que a view usa (hoje `loadAllNotesMeta` já devolve `content` — avaliar).

### E7. Qualidade

- Teste de ponta a ponta dos fluxos: criar view → trocar tipo → abrir nota → voltar; quadro idem; aside direita nos 3 modos.
- Acessibilidade: `aria-pressed` nos toggles (feito), foco visível no seletor de tipo, navegação por teclado na lista de views (setas), `prefers-reduced-motion` — a chave "Animações de abertura" é independente do sistema (decisão consciente; documentar na tela de Configurações, já feito).

## 6. Decisões em aberto (preciso do dono do produto)

1. **Rascunho (P2):** o rascunho sobrevive a recarregar a página? Trocar de view com alterações pede confirmação?
2. **Config da Base (E1):** nota especial sincronizada (recomendado) ou local?
3. **Documentos e JSON (E2):** viram o quê?
4. **Pasta (E3):** filtro/agrupamento basta ou o explorador de árvore deve voltar de alguma forma?
5. **Escala do calendário (P7):** fica só na aside direita?
6. **Animação em tabela/galeria:** manter o crescimento por recorte (hoje) ou abrir direto, como no mockup?

## 7. Mobile (fase própria — fora do escopo desta lista)

Referências no mockup: `MKP/cal/css/13-mobile.css`, `js/19-mobile.js`, `js/20-gestures.js`. Resumo do que fazer:

- Nav vira **barra inferior** (Home, Modelos, Config); asides viram **drawers que empurram** o conteúdo; arrastar da borda esquerda abre a lista de views, da direita abre as configurações; tocar no conteúdo fecha.
- O app já tem gestos de drawer (`shell/shell-mobile-gestures.js`, `shell-mobile-gesture-math.js`, testes em `test/mobile-gesture-tests.mjs`) — **reaproveitar** a matemática e só trocar os alvos (lista de views / aside direita).
- Hoje o mobile ainda mostra o drawer do explorador e a Base com as abas internas; `#mRightAside` e a lista de views estão ocultas abaixo de 768px.
- Views no mobile: chips do calendário viram barras, tabela esconde colunas secundárias, galeria com cartões menores (ver CSS do mockup).

## 8. Ordem sugerida

1. **P2** (modificada) — muda o modelo mental de quem usa; melhor decidir cedo (§6.1).
2. **P1** (Constelações) — devolve uma ferramenta que saiu da nav.
3. **E1** (config sincronizada) — antes de mais telas dependerem do `localStorage`.
4. **P4** (Modelos e Configurações na aside) — fecha a nav do mockup.
5. **P3** (semana) e **P8** (fidelidade) — acabamento das animações e dos detalhes.
6. **P5/P6/P7** — aparência dos itens.
7. **E2–E6** em paralelo, conforme as decisões.
8. **Mobile** (§7).

## 9. Regras do projeto a seguir (CLAUDE.md)

- **Cores sempre em `oklch()`**, com valor para tema claro **e** escuro (diferença de L ≥ 55 entre fundo e texto) — ver `docs/PADRAO-DE-CORES-OKLCH.md`.
- **Arquivos pequenos e coesos**: dividir por responsabilidade, não criar `utils.js`/`helpers.js`. Módulo novo em `sidepanel/modules/` entra em `sw.js` (`ASSET_PATHS`) **e** o `CACHE_NAME` sobe de versão (hoje `quickdock-v3.0.0-110`).
- Rodar `node test/run.mjs` depois de qualquer divisão de arquivo (há testes que checam texto literal).
- Notas continuam em **Markdown**; o quadro continua JSON com configurações próprias.
- Atualizar a tabela de status de `CLAUDE.md` quando um arquivo grande for particionado.

## 10. Armadilhas já encontradas (economizam tempo)

- **Cache de teste:** o navegador e o Service Worker guardam CSS/JS antigos. Para ver uma mudança: `fetch(url, {cache:'reload'})` em cada arquivo alterado, desregistrar o SW (`navigator.serviceWorker.getRegistrations()`), `caches.delete(...)`, recarregar.
- **`prefers-reduced-motion`:** o sistema (Windows com "Mostrar animações" desligado) fazia a animação do app sumir; por isso existe a chave própria em `shell-motion.js`.
- **`requestAnimationFrame` não dispara** em painel de pré-visualização oculto: nada crítico deve depender dele (a recolhida do mês chama `collapseMonthCell()` direto).
- **Grid animável:** `grid-template-rows/columns` só anima entre listas de comprimentos (px); medir o natural, fixar em px, forçar `offsetHeight` e só então setar o alvo. Uma grade que **não foi redesenhada** precisa ser resetada antes de medir o natural.
- **Reparent de painéis** (`shell-note-panel.js`): os módulos da nota acham elementos por `id`, então mover o nó preserva ouvintes; devolver sempre ao lugar ao sair.
- **PowerShell (edição automática de arquivos):** `$variável` em string com aspas duplas é expandida e some silenciosamente; `@(a, b + "x")` não concatena como parece; `--%`/aspas dentro de `git commit -m` quebram — usar arquivo de mensagem (`git commit -F`).
- **HTMLs gêmeos:** `index.html`, `404.html`, `sidepanel/index.html` precisam receber a mesma alteração (testes conferem).
- **`board-engine.js`** mantém o quadro em `currentBoard` (memória) e grava com `scheduleSave`; para alterar de fora use as funções exportadas (`updateBoardMeta`, `setBoardBgMode`, `setBoardZoomTo`…), nunca o banco direto.

## 11. Como validar cada entrega

1. `node test/run.mjs` (todos verdes).
2. Servidor local: `.claude/launch.json` → `quickdock-static` (porta 9990); abrir `http://localhost:9990/`.
3. Roteiro manual (desktop): criar view por tipo → trocar tipo no header → abrir nota pelo calendário (mês) e voltar → abrir quadro → painel da nota/quadro na aside direita → recolher/abrir asides → redimensionar a aside direita → recarregar (estado lembrado).
4. Conferir tema escuro, `Animações de abertura` ligado e desligado, e a extensão (`sidepanel/index.html`).
5. Comparar lado a lado com `MKP/ref-2026-10-08/CAL.HTML` (mesma viewport).

## 12. Estado da implementação (2026-10-08)

| Item | Estado | Onde |
|---|---|---|
| **P1** Constelações na aside direita | ✅ botão `hub` nos 3 cabeçalhos; o contêiner do canvas é *movido* para a aside (como o painel da nota); lembra o último modo; o "X" das configurações não fecha o grafo. Nós = **notas** (quadros ainda não entram no grafo) | `shell/shell-graph-panel.js`, `shell-right-aside.js` |
| **P2** Fluxo "modificada" | ✅ rascunho **em memória** (recarregar descarta); barra Salvar / Salvar como nova / Descartar no cabeçalho; ponto na lista; criar/duplicar/renomear/excluir view pede para salvar o rascunho antes. Renomear não suja. Fora do escopo: ações "Salvar/Descartar/Excluir" dentro do painel de configurações da view | `workspace-base.js`, `workspace-base-model.js` (`isWorkspaceModified`, `modifiedViewIds`, `saveDraftAsNewView`), `shell/shell-draft-bar.js` |
| **P3** Coluna da semana/dia | ✅ mesma API do mês; cabeçalho de dias, faixa "dia inteiro" e cabeçalho da tela recolhem | `shell/shell-week-expand.js`, `shell/shell-expand-shared.js` |
| **P4** Modelos e Configurações na aside esquerda | ✅ 3 painéis (Home \| Modelos \| Configurações); clicar no aberto recolhe; Modelos = notas modelo reais + 3 quadros modelo; "Gerenciar modelos" abre a galeria completa. `#settings-view` ficou só como aviso (Omnibar ainda abre) | `shell/shell-aside-panels.js`, `shell-models-panel.js`, `models-board-templates.js` |
| **P5** Aparência dos itens | ✅ `data-kind="quadro"` (tracejado + ícone no calendário); calendário sem "colorir por" usa a **pasta**; views novas do workspace trazem a coluna **Tipo** | `calendar-event-el.js`, `workspace-base-model.js`, `35-shell-v2.css` |
| **P6** Miniatura do quadro | ✅ SVG puro com cartões e conexões, atualiza com `board-changed` | `shell/board-thumb.js` |
| **P7** Escala + grupos | ✅ **Decisão:** a escala fica só na aside direita. Legenda "Grupos" (contagem por pasta) na Home, clicável (filtro rápido por pasta) | `shell/view-groups-model.js`, `shell-view-groups.js` |
| **P8** Fidelidade | ✅ rodapé "Calendário (Mês)", Esc volta às views, título vira Nota/Quadro no início da expansão, "Nenhum item nesta view". Pendente (cosmético): alinhar o cabeçalho da nota/quadro ao da Base | `shell-footer-label.js`, `shell-escape-back.js` |
| **E4** Lote com quadros | ✅ excluir em lote exclui quadros pelo motor; propriedades/tags ignoram quadros | `bulk-actions.js`, `bases-bulk-controller.js` |
| **E6** Desempenho | ✅ leituras simultâneas dos itens se fundem (no máx. uma em curso + uma seguinte). Cache por `updatedAt` continua em aberto | `workspace-items.js` |
| **E7** Teclado | ✅ setas na lista de views. Testes ponta a ponta continuam manuais (roteiro §11) | `shell-views-list.js` |

### Ainda depende de decisão do dono do produto (não implementado de propósito)

- **E1 — onde guardar a Base do workspace.** Hoje é `localStorage`, sem sincronizar. A opção recomendada (nota especial `.md`) toca todos os consumidores de `loadAllNotesMeta` (explorador, grafo, omnibar, Bases) e a lógica de sincronização; precisa de aprovação antes de mexer.
- **E2 — Documentos e JSON Studio** (viram o quê?) e remoção do calendário legado.
- **E3 — explorador de árvore de pastas**: o filtro/legenda por pasta (P7) cobre parte; falta decidir o arrastar-para-pasta.
- **§6.1** vale o que foi assumido em P2 (rascunho some ao recarregar; troca de view mantém o rascunho). **§6.6** segue com o recorte (hoje) em tabela/galeria.
- **E5** (extensão/painel estreito) e **Mobile (§7)** não foram tocados.
- Nós do grafo ainda são só notas (quadros fora).

### Atualização (decisões do dono do produto)

- **E1 — sync ✅:** a Base do workspace sincroniza como `configuracao/workspace.json` pelo mesmo adaptador (pasta local/Drive), regra de 3 vias; em conflito o remoto vence e o local fica em `quickdock:workspace-base-conflict`. `workspace-base-sync.js`, gancho em `sync-controller.js`.
- **E3 — explorador ✅ como view:** novo tipo **Explorador** (árvore de pastas dos itens, arrastar para mover, estado de abertura por view). `bases/explorer/`. Está na Base inicial e em "+ nova view"; bases já salvas ganham pelo "+".
- **Constelações:** quick bar inferior no desenho da do quadro (zoom, centralizar, reorganizar; Filtros e Física expandem para cima) e câmera que se centraliza ao iniciar, ao assentar a simulação e ao redimensionar (enquanto não foi mexida manualmente). `shell/shell-graph-quickbar.js`.
- **Extensão e mobile:** adiados por decisão do dono.
- **Em aberto (a decidir):** E2 (Documentos / JSON Studio / calendário legado), §6.6.

### Mobile (§7) — implementado (largura ≤ 768px)

- **Nav inferior** (Home, Modelos, Configurações) que fica parada e à frente dos drawers: dá para trocar de painel com um aberto; clicar no painel aberto fecha o drawer.
- **Drawer esquerdo** = `#mAside` com os painéis novos (views + grupos | modelos | configurações); o explorador e o menu de "visões" antigos ficam ocultos. Escolher uma view, abrir um item ou usar um modelo fecha o drawer.
- **Drawer direito** = `#mRightAside` (configurações da view, painel da nota/quadro, constelações); estado próprio no mobile (não grava a preferência do desktop). Botões no cabeçalho do app: `hub` (Constelações) e o painel. O `#mobileRightDrawer` antigo ficou oculto.
- **Gestos** (`shell-mobile-gestures.js`, matemática de `shell-mobile-gesture-math.js` reaproveitada): borda esquerda → views, borda direita → configurações; com um drawer aberto, arrastar em sentido contrário fecha (vale começar sobre um botão); tocar no conteúdo empurrado fecha. `overscroll-behavior-x: none` evita que o navegador use o gesto de borda para voltar no histórico.
- **Voltar** do cabeçalho agora tem a Base como raiz (nota e quadro voltam às views); a pílula do cabeçalho mostra o nome da view ativa (ou do quadro).
- **Views**: calendário em barrinhas (quadro com contorno), tabela sem as colunas ≥ 4, galeria com cartões menores, Explorador sem as colunas de data/tipo e abre pasta/item com **um toque**.
- Arquivos: `css/38-mobile-shell-v2.css`, `shell/shell-mobile-title.js`; ajustes em `shell-right-aside.js`, `shell-mobile.js`, `shell-mobile-gestures.js`, `shell-mobile-back.js`, `spatial-shell.js`.
- Correção de passagem: "Usar" uma nota modelo agora abre a tela de notas (antes criava a nota e ficava na Base).
- Fora de escopo/limites: tablets > 768px usam o layout desktop; as animações de abrir (célula expande) são só do desktop; a extensão (painel estreito) segue adiada.

**Mobile — ajustes (feedback):** o cabeçalho do app não aparece (mais tela; voltar = gesto/botão do Android, views = drawer, Constelações = botão `hub` no cabeçalho da aside direita); com o teclado aberto (foco em campo editável ou janela encolhida) some a nav e fica só a quickbar da nota (`shell-mobile-keyboard.js` → `html.is-keyboard-open`); drawers largos (`--m-drawer-w` = largura − 56px, máx. 460px), sobrando só uma fatia do conteúdo; arrastar horizontalmente de **qualquer ponto** abre o drawer (direita → views, esquerda → configurações; direção decidida no 1º movimento), sem depender da borda — não vale sobre áreas que rolam na horizontal, tabela/quadro/grafo, texto selecionado, nem com o teclado aberto.

**Mobile — drawer estilo Obsidian (feedback):** sem barra de navegação no mobile. O drawer esquerdo ganhou, em traço outline: **barra de pesquisa** no topo; no rodapé o **seletor de escopo** (Views, Notas e quadros, Pastas — abre para cima) e a **engrenagem**, que abre uma **tela cheia de Configurações** (o painel `#asideSettings` é movido para ela); a **lupa** flutuante (entendida como "lupa", para focar a busca sem esticar o polegar) fica acima do rodapé. **Modelos** (notas, quadros e *blocos* modelo) viraram um modo da aside direita, com botão no cabeçalho dela (`tune` configurações · `hub` constelações · modelos); bloco só entra com uma nota aberta. Arquivos: `shell/shell-mobile-drawer.js`, `mobile-drawer-search.js` (puro, testado), `shell-models-aside.js`.
