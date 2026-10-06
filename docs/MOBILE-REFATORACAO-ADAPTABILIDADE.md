# Mobile — Refatoração de adaptabilidade (navegação, telas e Bases)

> Status: **planejamento** (nenhum código alterado). Complementa [`MOBILE-CORRECAO-LAG-GESTOS.md`](MOBILE-CORRECAO-LAG-GESTOS.md) (performance dos gestos).
> Regras do projeto que valem aqui: cores sempre `oklch()` com claro+escuro e ΔL ≥ 55 ([`PADRAO-DE-CORES-OKLCH.md`](PADRAO-DE-CORES-OKLCH.md)); módulos pequenos e coesos; novo módulo em `sidepanel/modules/` entra em `sw.js` (`ASSET_PATHS`) + bump de `CACHE_NAME`; rodar `node test/run.mjs` após cada divisão.

---

## 1. Problemas relatados

1. **Telas sem como voltar** — o usuário entra em uma view e não há botão/gesto óbvio para sair.
2. **Muita coisa não está adaptada ao mobile** — alvos pequenos, conteúdo cortado, layouts de desktop espremidos.
3. **Bases mal adaptado** — cabeçalho quebra, abas cortadas, tabela larga sem pista de rolagem, calendário com alvos minúsculos, painel de configurações pensado para desktop.
4. **Lag nos gestos** — tratado no documento separado.

## 2. Diagnóstico medido (viewport 390×844, `?platform=mobile`, emulação de toque)

### 2.1 Auditoria por tela

| Tela | Alvos de toque | Alvos < 44 px | Header | Como voltar | Overflow horizontal |
|---|---|---|---|---|---|
| Espaço (board) | 19 | 18 | `section-header` 44 px | "Voltar para os documentos", "Fechar Espaço" (pequenos) | 3 elementos |
| Grafo | 2 | — | `graph-header` 52 px | **nenhum** | — |
| Calendário | 40 | 38 | `calendar-header` 52 px | **nenhum** | — |
| Documentos | 5 | — | **sem header** | **nenhum** | — |
| Modelos (templates) | 17 | 8 | `gallery-header` 55 px | parcial | — |
| JSON Studio | 26 | 23 | `json-header` 52 px | seta (só em alguns estados) | **20 elementos** estourando (toolbar, painel lado a lado) |
| Bases | 11 controles de toolbar | **11/11 < 36 px** | **nenhum** (ver 2.2) | **nenhum** | tabela larga sem pista de rolagem |

Observações visuais (capturas): no calendário, a grade mensal de 7 colunas é legível mas as chips de evento viram `T…` (ilegíveis) e a linha do dia atual **invade** a semana seguinte; no JSON Studio o editor de texto e a árvore ficam **lado a lado** num viewport de 390 px (cada metade ≈ 195 px) e a toolbar "Texto / Layout…" é cortada à direita.

### 2.2 Causa do "sem como voltar" (P0)

- Em `html[data-platform="extension"]` e no mobile o `.section-header` é escondido (`22-spatial-shell.css`) e o botão "voltar" do Bases (`.bases-back-btn`) só existia dentro do `.bases-header`, **removido a pedido** por ser inútil no desktop. Resultado no mobile: **o Bases não tem mais nenhuma saída visível**.
- O mesmo padrão se repete em Grafo, Calendário e Documentos: o shell mobile não fornece um "voltar" próprio, depende de cada view ter o seu.
- O drawer esquerdo **não fecha** depois de escolher uma view (continua por cima/empurrando) → parece que a navegação "não fez nada".
- Sem nota aberta aparecem **dashboard + editor empilhados**.
- `viewport` com `maximum-scale=1.0, user-scalable=no` impede zoom (acessibilidade) e não resolve o problema real de inputs com fonte < 16 px.

### 2.3 Dívida de CSS

- `23-mobile-spatial.css`: 1414 linhas, **545 `!important`**; poucas `@media`; `100vh` onde deveria ser `dvh`; `safe-area-inset-*` tratado em um único arquivo.
- Regras de plataforma misturadas: `data-platform`, `@media (max-width)` e classes de estado competem entre si.

## 3. Princípios e tokens

| Tema | Regra |
|---|---|
| Alvo de toque | mínimo **44×44 px** (visual pode ser menor, área clicável ≥ 44 via `padding`/`::before`) |
| Fonte de inputs | ≥ 16 px (evita zoom automático do iOS) → **remover** `user-scalable=no` / `maximum-scale=1` |
| Altura | `100dvh` / `100svh`; nunca `100vh` em layout fixo |
| Safe-area | `padding: env(safe-area-inset-*)` num único token (`--safe-top/-bottom/-left/-right`) usado por header, sheets e FAB |
| Header de tela | **sempre** presente no mobile: `[← voltar] título [ações ⋯]`, altura 52 px |
| Gesto = atalho | todo gesto tem um botão equivalente visível |
| Movimento | respeitar `prefers-reduced-motion` |
| Cores | tokens `oklch()` claro/escuro; texto vs. fundo com ΔL ≥ 55; estado de foco visível (anel `oklch`) |
| Largura útil | conteúdo nunca causa scroll horizontal da página; scroll horizontal só em contêineres declarados (`overflow-x:auto` + sombra de pista) |

Tokens novos (arquivo `sidepanel/css/24-mobile-tokens.css`, só variáveis):
`--m-target: 44px; --m-header-h: 52px; --m-gutter: 16px; --m-sheet-radius: 20px; --m-safe-*`.

## 4. Modelo de navegação mobile (resolve o P0)

### 4.1 Pilha de navegação do shell
Criar `sidepanel/modules/shell/shell-mobile-nav.js` (pequeno, só estado + API):

```
navStack: ['notes']                // raiz
pushView(view, opts)               // abre bases/calendar/graph/docs/json/templates/board
popView()                          // volta uma
canGoBack()                        // stack.length > 1
```

- **Header global mobile** (`#mAppBar`, fixo no topo, abaixo da safe-area): botão esquerdo = `☰` (drawer) na raiz, `←` quando `canGoBack()`; centro = título da view; direita = ações da view (slot).
- Botão físico/gesto "voltar" do Android: `history.pushState` a cada `pushView` e `popstate` → `popView()`. Evita sair do app ao voltar de uma view.
- `Esc` (teclado externo) também faz `popView()`.
- Cada view registra `title` e `actions` (lista de `{icon,label,onClick}`) em vez de ter header próprio no mobile. Os headers de desktop continuam; no mobile são escondidos por **uma** regra (`html[data-platform="mobile"] .view-header-desktop{display:none}`) e não por dezenas de `!important`.

### 4.2 Drawer esquerdo
- Fecha automaticamente ao escolher uma view/nota (`closeMobileLeftDrawer()` no handler de navegação).
- Item ativo destacado; rodapé com as views (Notas, Documentos, Espaço, Grafo, Calendário, Modelos, JSON, Bases) em **grade de ícones 44 px**.
- Scrim fecha ao tocar fora.

### 4.3 Estado inicial
- Sem nota aberta: mostrar **só** o dashboard (esconder o editor vazio); ao abrir nota, só o editor.

## 5. Plano por tela

### 5.1 Notas / editor
- Toolbar mobile (já existente, `note-mobile-toolbar.js`): verificar `padding-bottom: var(--safe-bottom)` e que sobe junto com o teclado (`visualViewport`).
- Título da nota no `#mAppBar` (truncado com `…`), botão `⋯` com menu (backlinks, propriedades, exportar).
- Tabelas de bloco: contêiner com `overflow-x:auto` + gradiente de pista.
- Evitar `position: fixed` de popovers fora do `visualViewport` (teclado aberto).

### 5.2 Documentos
- Ganha header (hoje inexistente) com ← e ações; lista em linhas de 56 px; ações por swipe **e** por `⋯`.

### 5.3 Espaço (board)
- "Voltar" e "Fechar" duplicados → um único `←` no app bar.
- Barra de ferramentas vira **bottom bar** com 5 ações principais + `⋯` (18 de 19 alvos hoje são pequenos).
- Pan/zoom: pinça e arraste em 2 dedos; 1 dedo = selecionar/mover. Botões `+`/`−`/ajustar 44 px.

### 5.4 Grafo
- App bar com ←; filtros em bottom sheet; toque no nó abre peek da nota; botão "centralizar".

### 5.5 Calendário
- Chips de evento ilegíveis (`T…`) → no mobile, **mês = grade compacta com pontos** (até 3 pontos por dia) e **lista do dia abaixo** (padrão Google/Apple). Toque no dia seleciona; lista rola.
- Corrigir a linha do dia atual que invade a semana seguinte (altura de célula fixa + `overflow:hidden`).
- Navegação `‹ ›` e seletor Mês/Semana/Agenda no app bar (segmented de 44 px); header atual (2 linhas + contagem de notas) quebra: mover "9 notas" para subtítulo.
- Visão Agenda é o padrão no mobile.

### 5.6 Modelos
- Galeria em 1 coluna (cartões 100% largura) ou 2 colunas ≥ 360 px; ação principal "Usar modelo" 44 px.

### 5.7 JSON Studio
- Hoje: editor + árvore lado a lado + toolbar cortada + 20 elementos em overflow.
- Mobile: **abas** `Texto | Árvore` (uma por vez, 100% largura); toolbar em `overflow-x:auto` com snap ou colapsada em `⋯`; busca "Filtrar chaves" em linha própria; botões Expandir/Recolher em ícones 44 px; banner de erro com "Ir para erro" sticky.
- Nós da árvore: valor longo quebra em 2 linhas com `…` e toque abre o valor em sheet (hoje o valor fica espremido na coluna à direita).

### 5.8 Sync / Configurações / Modais
- Modais viram **bottom sheets** (arrastar para fechar + botão ✕ 44 px + scrim). Altura máx. `calc(100dvh - var(--safe-top) - 24px)`, conteúdo com scroll interno.
- Formulários: um campo por linha, labels acima, botões em largura total na base do sheet.

## 6. Bases no mobile (detalhado)

### 6.1 Navegação e cabeçalho
- App bar: `←` (sai do Bases), nome da Base (toque abre seletor de Base em sheet), ação `⋯` (renomear, duplicar, exportar, configurações). **Nada de header interno do Bases** (continua removido no desktop; no mobile o app bar do shell cumpre o papel).
- Abas de views: faixa horizontal `overflow-x:auto` com `scroll-snap`, aba ativa centralizada ao abrir, sombra lateral como pista, altura 44 px. Botão `+` fixo à direita (não rola junto).
- Toolbar (filtro, ordenar, agrupar, propriedades, busca): hoje 11/11 controles < 36 px e quebram em várias linhas. Mobile: **uma linha** com 3 botões em ícone (Filtro, Ordenar, Propriedades) + `⋯`; busca abre num campo que ocupa a linha inteira ao tocar na lupa. Badge numérico indica filtros ativos.

### 6.2 Painel de configurações da view
- Desktop: painel empurra o conteúdo (já implementado). Mobile (≤ 640 px): **bottom sheet** com alça de arrastar, 3 detents (40%, 70%, 100%), cabeçalho sticky com título e ✕; seções em acordeão; controles 44 px; botão "Concluído".
- Estado do sheet não desloca a lista (overlay), e o conteúdo atrás ganha `padding-bottom` para não ficar escondido.
- Já existe um bottom sheet em ≤ 640 px (`30-bases-calendar.css`); consolidá-lo num componente único `ui/bottom-sheet.js` reutilizável por filtros, ordenação, propriedades e peek.

### 6.3 Tabela
- Largura de colunas fixa (colgroup) é boa no desktop; no mobile oferecer dois modos, alternados por ícone no app bar e salvos na view:
  1. **Lista de cartões** (padrão no mobile): título da nota + até 3 propriedades visíveis em chips; toque abre a nota; toque longo seleciona (bulk).
  2. **Tabela com scroll**: primeira coluna (título) `position: sticky; left: 0`, cabeçalho sticky, sombra de pista à direita, indicador "→ mais colunas".
- Redimensionar coluna: alça de 44 px de área de toque (visual 4 px), só no modo tabela.
- Edição inline: toque duplo → sheet de edição do campo (teclado correto: número, data, select).
- Cabeçalho de grupo colapsável com 44 px.

### 6.4 Board (kanban)
- Colunas de 80% da largura com `scroll-snap-type: x mandatory`; arrastar card com toque longo (300 ms) + feedback háptico quando disponível; auto-scroll nas bordas; alternativa sem arrastar: menu `⋯` do card → "Mover para…".

### 6.5 Calendário (Bases)
- Mesmo tratamento do calendário nativo (5.5): grade de pontos + lista do dia; 53 alvos pequenos hoje → 0 abaixo de 44 px.

### 6.6 Timeline e Mapa
- Timeline: eixo vertical (lista cronológica agrupada por mês) no mobile; zoom horizontal só em paisagem.
- Mapa: container `100dvh - app bar`; controles de zoom 44 px; toque no marcador abre peek (sheet baixa) com "Abrir nota".

### 6.7 Galeria e Lista
- Galeria: 2 colunas (≥ 360 px) / 1 coluna (< 360 px); capa com `aspect-ratio`.
- Lista: linha 56 px, propriedade secundária abaixo do título.

### 6.8 Gráfico
- Altura fixa `min(60dvh, 420px)`; legenda abaixo; tooltip por toque (não hover); eixos com rótulos rotacionados/abreviados.

### 6.9 Peek e abrir nota
- `openNoteFromBase` já troca para o editor no mobile; garantir que `←` retorne **ao Bases na mesma view e posição de scroll** (guardar `scrollTop` + view ativa na pilha de navegação).
- Peek (prévia lateral no desktop) → bottom sheet 70% no mobile com botão "Abrir".

### 6.10 Filtros rápidos, ações em lote
- Chips de filtro rápido em linha rolável abaixo das abas.
- Seleção múltipla: app bar muda para contexto "N selecionadas" com ações (mover, excluir, propriedade) em bottom bar.

## 7. Arquitetura de CSS

1. Novo arquivo de tokens (`24-mobile-tokens.css`) e novo **arquivo por área** em vez de crescer o `23-mobile-spatial.css`: `25-mobile-shell.css` (app bar, drawer, sheets), `26-mobile-views.css` (calendário, json, docs…), `35-bases-mobile.css` (Bases).
2. Estratégia **mobile-first** para componentes novos: estilos base = mobile; `@media (min-width: 641px)` acrescenta desktop. Breakpoints oficiais: `≤ 480` (celular), `481–768` (tablet retrato), `≥ 769` (desktop).
3. Seleção por plataforma única: preferir `html[data-platform="mobile"]` para layout do shell e `@media` apenas para responsividade de componente. Não misturar as duas na mesma regra.
4. **Meta de `!important`**: 545 → < 150 em 3 etapas (remover os de `transform/transition` na Fase L1; depois os de `display/position` nas regras do shell; por fim os de cor). Medir com `grep -c '!important'`.
5. Substituir `100vh` por `100dvh` (com fallback `100vh` antes), centralizar safe-area em tokens.
6. Toda cor nova em `oklch()` com par claro/escuro; ao tocar regra legada em hex, converter no mesmo commit.

## 8. Plano em fases (cada uma = 1 PR, validada no navegador)

| Fase | Entrega | Risco | Aceite principal |
|---|---|---|---|
| **M0 (P0)** | App bar mobile + pilha de navegação + botão voltar/popstate; drawer fecha ao navegar; dashboard sem editor vazio; Bases/Grafo/Calendário/Docs ganham saída | baixo | Toda tela tem `←` visível; botão voltar do Android navega em vez de sair |
| **M1** | Correção de lag (doc `MOBILE-CORRECAO-LAG-GESTOS.md`) | médio | critérios de aceite daquele doc |
| **M2** | Tokens, viewport sem zoom-lock, `dvh`, safe-area, alvos 44 px nos controles globais | baixo | zero alvo < 44 px na auditoria automática do app bar/drawer/toolbars |
| **M3** | Bottom sheet reutilizável + modais como sheets | médio | modais usáveis com teclado aberto |
| **M4** | Bases: app bar, abas, toolbar compacta, settings sheet | médio | 0 controles < 44 px; sem quebra de linha no header |
| **M5** | Bases: tabela em cartões/scroll sticky, board snap, calendário/timeline/mapa mobile | alto | scroll vertical e horizontal fluidos; sem overflow da página |
| **M6** | Calendário nativo, JSON Studio (abas), Espaço (bottom bar), Grafo, Modelos | médio | sem overflow horizontal; 0 alvos < 44 px |
| **M7** | Redução de `!important`, consolidar CSS, remover código morto | médio | `!important` < 150; `node test/run.mjs` verde |

Ordem sugerida: **M0 → M1 → M2 → M4 → M3 → M5 → M6 → M7** (M0 primeiro porque destrava o uso; M1 antes de mexer em mais telas porque a correção de `!important` muda a base do shell).

## 9. Estratégia de testes

- **Auditoria automática** `test/mobile-audit.mjs` (Playwright; iPhone 14 390×844 e Pixel 7 412×915; `?platform=mobile`): para cada tela, abre via drawer e verifica (a) existe `←` visível e funcional; (b) nenhum alvo interativo visível < 44×44 (exceções listadas); (c) `document.documentElement.scrollWidth <= innerWidth`; (d) nenhum elemento com `scrollWidth > clientWidth` sem `overflow-x:auto` declarado; (e) captura de tela.
- Matriz: tema claro/escuro × retrato/paisagem × com/sem teclado (via `visualViewport`).
- Locator: usar texto exato (`getByText('Notas',{exact:true})`) para evitar ambiguidade com "Exportar Notas".
- Fluxo "sem como voltar": para cada view, `pushView` → `popView` → estado anterior restaurado (inclui scroll).
- Testes puros (sem DOM) para a pilha de navegação em `test/mobile-nav-tests.mjs`.
- Dispositivos reais obrigatórios antes de fechar M1/M5: Android Chrome (gestos do sistema ligados) e iOS Safari/PWA.
- Lembrete: novos módulos → `sw.js` `ASSET_PATHS` + `CACHE_NAME` bump; `node test/run.mjs` verde.

## 10. Checklist de aceite global

- [ ] Toda tela tem saída visível (`←`) e o botão voltar do sistema funciona.
- [ ] Nenhum alvo de toque < 44 px nas telas auditadas.
- [ ] Nenhum scroll horizontal da página em 360–430 px de largura.
- [ ] Zoom do usuário permitido; inputs ≥ 16 px.
- [ ] Safe-area respeitada (notch, barra de gestos) em header, sheets e toolbars.
- [ ] Teclado aberto não cobre campo em foco nem toolbar.
- [ ] Bases utilizável de ponta a ponta no mobile (abrir, trocar view, filtrar, editar, abrir nota e voltar).
- [ ] Tema claro/escuro em `oklch()` com ΔL ≥ 55 nos pares texto/fundo novos.
- [ ] `!important` < 150 em `23-mobile-spatial.css` + novos arquivos.
- [ ] `node test/run.mjs` e `node test/bases-settings-tests.mjs` verdes.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| App bar global conflita com headers existentes (duplicação) | Esconder headers de desktop no mobile por uma única regra; migrar view por view atrás de flag `?mobileNav=1` até M0 estabilizar. |
| `history.pushState` interfere no PWA/extension side panel | Ativar só em `data-platform="mobile"`; na extensão usar apenas o botão `←`. |
| Modo cartões do Bases diverge do modo tabela (dois renderizadores) | Reusar o mesmo pipeline (`bases-view-pipeline.js`) e só trocar o renderizador final; módulo próprio `table/bases-card-list.js`. |
| Regressão de desktop ao remover `!important` | Capturas Playwright desktop + mobile antes/depois em cada PR. |
| Arquivo de CSS/JS voltar a virar monólito | Respeitar regra de arquivos pequenos: um módulo por responsabilidade (nav, app bar, sheet, gestos). |
