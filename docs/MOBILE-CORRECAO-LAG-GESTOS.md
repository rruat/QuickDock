# Mobile — Correção de lag nos gestos e drawers

> Status: **planejamento** (nenhum código alterado). Escopo: arrastar para a esquerda/direita numa nota para abrir os menus (drawer esquerdo = navegação, drawer direito = painel/outline), transições entre views e qualquer gesto horizontal no shell mobile.
> Arquivos centrais: `sidepanel/modules/shell/shell-mobile.js`, `sidepanel/css/23-mobile-spatial.css`, `sidepanel/css/22-spatial-shell.css`.

---

## 1. Sintoma

Em uma nota aberta no celular, ao puxar da borda para a esquerda/direita:

- o menu "gruda" ou atrasa em relação ao dedo (a camada só começa a andar depois de alguns frames);
- ao soltar, o conteúdo **dá um salto** (volta ao ponto zero e só depois anima até o destino);
- durante o arrasto o editor inteiro (`#mMain`) é repintado, o que derruba o FPS em notas longas;
- às vezes o gesto dispara a abertura do menu e também rola o texto ou seleciona palavra.

## 2. Causas-raiz (medidas, não suposições)

Medição feita com Playwright (Chromium, `isMobile`, `hasTouch`, `?platform=mobile`), comparando `element.style.transform` (inline, escrito pelo JS durante o arrasto) com `getComputedStyle(el).transform` (o que realmente é pintado):

| # | Causa | Evidência | Impacto |
|---|---|---|---|
| C1 | **`!important` em `transform` e `transition`** nas regras de `#mAside`, `#mHeader`, `#mMain` em `23-mobile-spatial.css` (ex.: `#mAside { transform: translate3d(-100%,0,0) !important }`, `body.has-left-drawer-open #mMain { transform: translate3d(min(85vw,320px),0,0) !important }`). Um estilo inline **sem** `!important` perde para uma regra de folha **com** `!important`. | Durante o arrasto o `style.transform` inline muda a cada `touchmove`, mas o `computed transform` permanece no valor da classe. A camada só se move ao soltar (quando o JS remove o inline e troca a classe). | **Principal.** O arrasto não acompanha o dedo; só a animação final é visível, e ela parte da posição errada (salto). |
| C2 | `transition: transform 260ms cubic-bezier(...) !important` permanece ativo **durante** o arrasto. | Mesmo quando o inline passa a valer (casos sem `!important`), cada `touchmove` reinicia uma transição de 260 ms → o elemento "persegue" o dedo com atraso. | Sensação de borracha/lag. |
| C3 | Sem throttling por `requestAnimationFrame`: o handler de `touchmove` escreve estilo direto (até 120 Hz em telas modernas) e faz leituras de layout (`getBoundingClientRect`/`offsetWidth`) intercaladas com escritas. | Layout thrashing em notas longas. | Frames perdidos. |
| C4 | O gesto move **três camadas inteiras** (`#mAside`, `#mHeader`, `#mMain`) com `will-change: transform` permanente em `#mHeader,#mMain`. `#mMain` contém o editor de blocos inteiro. | Camada gigante promovida + repintada. `will-change` permanente consome memória de GPU o tempo todo. | Jank em dispositivos de entrada. |
| C5 | `transitionToMobileCard()` e `updateMobileCarouselPositions()` fazem `window.dispatchEvent(new CustomEvent('resize'))`. Vários módulos escutam `resize` e recalculam layout (board, grafo, calendário, editor). | Cada troca de card/drawer dispara recálculo global síncrono. | Travada no início/fim da transição. |
| C6 | **Código morto**: `onMobileTouchStart/Move/End` do carrossel nunca são registrados; coexistem com `setupMobileTouchGestures()`. | Leitura do código + busca de `addEventListener`. | Confusão, manutenção, risco de reativar por engano. |
| C7 | `.main-section { touch-action: pan-y }` combinado com listeners `touchmove` não-`passive` no `document`. O navegador precisa esperar o JS para decidir se rola. | Latência de scroll + conflito com seleção de texto no `contenteditable`. | Gesto horizontal compete com scroll/seleção. |
| C8 | Zona de ativação: borda ≤ 75 px **ou** zonas de header. Na nota, 75 px colide com a área de toque do texto e com o gesto "voltar" do iOS/Android (edge swipe do sistema). | — | Falsos positivos / gesto do sistema roubado. |

## 3. Princípios da correção

1. **Durante o arrasto, só uma propriedade muda e só via variável CSS**: `--drawer-x` (px, 0..largura). Sem `transition`.
2. **Nenhum `!important` em `transform`/`transition` de drawer.** A especificidade passa a ser resolvida por classes de estado (`.is-dragging`, `.is-open`).
3. **Escrever no máximo 1× por frame** (rAF). Ler layout **uma vez** no `touchstart` (largura do drawer, safe-area) e reaproveitar.
4. **Ao soltar, animar a partir da posição atual** (a transição lê o valor corrente porque o inline foi mantido até o fim), nunca resetar para 0 antes.
5. **Mover o mínimo possível**: o drawer desliza e um *scrim* (overlay) escurece; o conteúdo **não** é deslocado (ou é deslocado apenas via transform numa camada leve). Eliminar `#mHeader`/`#mMain` do arrasto.
6. **Sem `resize` sintético.** Quem precisa saber do novo tamanho usa `ResizeObserver` no próprio container.
7. **Um único módulo de gesto** (arquivo novo `shell-mobile-gestures.js`), um único caminho de código.

## 4. Plano de correção (passo a passo)

### Fase L0 — Instrumentação (antes de mexer)
- Criar `test/mobile-gesture-perf.mjs` (Playwright, fora de `run.mjs` por ser lento) que: abre a nota demo longa, simula `touchstart → 30× touchmove (16 ms) → touchend` da borda esquerda e registra por frame: `style.transform`, `computed transform`, `performance.now()`.
- Métricas de aceite (baseline vai ser registrada neste doc após a execução): `|computed − inline| ≤ 1 px` em 100% dos frames; frames > 16,7 ms ≤ 5%; zero `resize` disparados.
- Usar `PerformanceObserver({type:'long-animation-frame'})` quando disponível.

### Fase L1 — Destravar o transform (correção de maior retorno, baixo risco)
1. Em `23-mobile-spatial.css`, para `#mAside`, `#mHeader`, `#mMain`: remover `!important` de `transform` e `transition`.
2. Introduzir o contrato de classes:
   ```css
   #mAside {
     position: fixed; inset: 0 auto 0 0;
     width: min(85vw, 320px);
     transform: translate3d(calc(-100% + var(--drawer-x, 0px)), 0, 0);
     transition: transform 240ms cubic-bezier(.2,.8,.2,1);
     visibility: hidden;
   }
   #mAside.is-open-mobile { transform: translate3d(var(--drawer-x, 0px), 0, 0); visibility: visible; }
   #mAside.is-dragging    { transition: none; visibility: visible; }
   ```
   (A variável `--drawer-x` vale 0 em repouso; no arrasto é o deslocamento do dedo, limitado a `[0, largura]`.)
3. Ao soltar: remover `.is-dragging`, definir a classe de destino (`is-open-mobile` ou não), **limpar `--drawer-x` no `transitionend`** (ou em 1 rAF depois), para que a transição parta da posição atual.
4. `will-change: transform` só em `.is-dragging` (liga no `touchstart`, desliga no `transitionend`).

### Fase L2 — Throttle por rAF e leitura única
```js
let raf = 0, pendingX = 0;
function onMove(e) {
  pendingX = clamp(e.touches[0].clientX - startX + base, 0, drawerW);
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty('--drawer-x', pendingX + 'px'); });
}
```
- `drawerW`, `startX`, direção e safe-area lidos **uma vez** no `touchstart`.
- Velocidade (flick) calculada com as 3 últimas amostras (não só `Δt` total), threshold: `|v| > 0.5 px/ms` **ou** deslocado > 40% da largura.

### Fase L3 — Reduzir a área movida
- Substituir o deslocamento de `#mMain`/`#mHeader` por **scrim** (`#mDrawerScrim`, `opacity` = progresso, `pointer-events` só quando aberto). Visualmente o drawer sobrepõe o conteúdo (padrão Material/Notion mobile).
- Se o design "empurrar conteúdo" for desejado, mover **apenas** `#mMain` com `translate3d` e manter `#mHeader` fixo; nunca os dois.
- Remover `will-change` permanente.
- Cor do scrim: `oklch(0.2 0 0 / 0.45)` claro e `oklch(0 0 0 / 0.6)` escuro (regra OKLCH do projeto; texto/ícones sobre o drawer continuam com ΔL ≥ 55).

### Fase L4 — Conflito com scroll e seleção
- `touch-action: pan-y` permanece em `.main-section`; a zona de borda (largura ≈ 24 px) recebe `touch-action: none` (elemento sentinela `#mEdgeZoneL/R`, `position: fixed`, `z-index` abaixo de modais) → o navegador entrega o gesto ao JS imediatamente, sem esperar.
- Listeners: `touchstart` na sentinela (passive), `touchmove` não-passive **apenas** enquanto um gesto de drawer estiver ativo (registrado no `touchstart`, removido no `touchend`/`touchcancel`).
- Travar o eixo após 8 px de movimento: se `|dy| > |dx|` cancela o gesto (vira scroll); se horizontal, `preventDefault()`.
- Ignorar o gesto se há seleção de texto ativa (`getSelection().type === 'Range'`) ou se o alvo está dentro de `.table-wrapper`, `.base-table-wrap`, `.json-tree`, `.board-canvas` (áreas com scroll/arraste próprios).
- Zona de borda: 24 px para o drawer (em vez de 75 px) + botão visível no header como alternativa (acessibilidade e gesto do sistema no iOS ocupam a borda esquerda ~20 px: se `navigator.userAgent` iOS, usar o drawer esquerdo pelo botão e o gesto só a partir de 24 px).

### Fase L5 — Eliminar `resize` sintético e código morto
- Remover os `dispatchEvent(new CustomEvent('resize'))` de `transitionToMobileCard` e `updateMobileCarouselPositions`. Módulos que dependiam disso (board, grafo, calendário) passam a usar `ResizeObserver` no container ou escutam um evento específico `quickdock:shell-layout` emitido **uma vez**, no `transitionend`, nunca por frame.
- Apagar `onMobileTouchStart/Move/End` (carrossel) e referências; se o carrossel for retomado, será com o mesmo módulo de gesto.

### Fase L6 — Validação e regressão
- Rodar `node test/run.mjs` (testes por texto literal serão atualizados para apontar pro novo arquivo).
- Adicionar teste unitário do cálculo puro (clamp, velocidade, decisão abrir/fechar) em `test/mobile-gesture-tests.mjs`, sem DOM.
- Registrar o novo módulo em `sw.js` (`ASSET_PATHS`) e **incrementar `CACHE_NAME`** (checklist do CLAUDE.md).
- Testar manualmente em aparelho real: Android Chrome (borda esquerda com navegação por gestos ligada) e iOS Safari (PWA instalado e aba normal).

## 5. Critérios de aceite

- [ ] Em 100% dos frames do arrasto, `computed transform` = `inline/variável` (±1 px).
- [ ] Arrasto a 60 fps em nota com 500 blocos em aparelho de entrada (ex.: Moto G).
- [ ] Soltar no meio do caminho anima **a partir do ponto do dedo**, sem salto.
- [ ] Zero eventos `resize` durante abrir/fechar drawers.
- [ ] Rolar verticalmente perto da borda não abre o drawer; seleção de texto não é interrompida.
- [ ] Nenhum `!important` restante em `transform`/`transition` de drawers (`grep` no CSS).
- [ ] Gesto funciona igual em tema claro/escuro e com `prefers-reduced-motion` (sem animação, estado aplicado direto).

## 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Remover `!important` expõe regras antigas conflitantes (ordem/especificidade) | Fazer em um commit isolado, comparar capturas (Playwright) antes/depois nas 8 telas. |
| Módulos que dependiam do `resize` sintético quebram | Lista a partir de `grep "addEventListener('resize'"`; migrar um a um para `ResizeObserver`. |
| Conflito com gesto de voltar do sistema | Zona de borda configurável + botão alternativo sempre visível. |
| Scrim bloqueia toques depois de fechado | `pointer-events: none` quando fechado; teste automatizado de clique logo após fechar. |
