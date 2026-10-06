# 🗂️ Planejamento — Views do Bases no nível do Notion

> **Objetivo:** levar as *views* do Bases do QuickDock à riqueza de tipos e de configurações das *views de database* do Notion — por exemplo, o calendário com visão de **semana** (grade horária), **mês**, **dia** e **agenda**, cada uma com suas dezenas de opções.
>
> **Como usar este documento:** é um planejamento para implementar **em fatias verticais** (cada fase entrega algo utilizável). A parte 1 diz onde estamos hoje (com dívidas reais encontradas no código); as partes 2–5 dizem para onde ir; as partes 6–10 dizem como e em que ordem; a parte 11 lista as decisões que dependem de você.
>
> **Regras do projeto que valem para tudo aqui** (ver `CLAUDE.md`): módulos pequenos e coesos (nada de monólito novo) · toda cor nova em **OKLCH**, com tema claro e escuro · módulo novo entra no `sw.js` (`ASSET_PATHS`) e o `CACHE_NAME` sobe · `node test/run.mjs` verde a cada fase · validar no navegador (os dois temas).

---

## Sumário

1. [Diagnóstico: o que existe hoje](#1-diagnóstico-o-que-existe-hoje)
2. [Mapa Notion → QuickDock](#2-mapa-notion--quickdock)
3. [Arquitetura-alvo](#3-arquitetura-alvo)
4. [Recursos transversais (valem para todas as views)](#4-recursos-transversais-valem-para-todas-as-views)
5. [Catálogo de views e configurações](#5-catálogo-de-views-e-configurações)
6. [Roadmap por fases](#6-roadmap-por-fases)
7. [Especificação do painel de configuração (UX)](#7-especificação-do-painel-de-configuração-ux)
8. [Modelo de dados formal e migração](#8-modelo-de-dados-formal-e-migração)
9. [Testes, desempenho, acessibilidade](#9-testes-desempenho-acessibilidade)
10. [Riscos](#10-riscos)
11. [Decisões em aberto (perguntas para você)](#11-decisões-em-aberto-perguntas-para-você)
12. [Checklist de implementação](#12-checklist-de-implementação)
- [Apêndices A–E](#apêndice-a--operadores-de-filtro-por-tipo)

---

## 1. Diagnóstico: o que existe hoje

### 1.1 Inventário (linhas em 2026-10-06)

| Arquivo | Linhas | Papel | Estado |
|---|---:|---|---|
| `bases/bases-view-container.js` | 347 | Cabeçalho, abas de view, "+ visão", busca, despacho para o renderizador | Funciona; **sem UI de configuração** |
| `bases/bases-engine.js` | 390 | Filtro (`queryBaseNotes`), ordenação, agrupamento, resumos | Puro e testável; **tem bugs** (1.3) |
| `bases/bases-schema.js` | 309 | Tipos, formatação, inferência do schema, `normalizeBaseDefinition` | Schema é **mapa** `chave → definição` |
| `bases/bases-yaml.js` | 210 | Parser/serializador YAML mínimo | Suficiente p/ o formato atual; **limitado** p/ aninhamento rico |
| `bases/bases-table-view.js` | 475 | Tabela: ordenar por cabeçalho, redimensionar, editar célula, rodapé de resumos | Base sólida |
| `bases/bases-board-view.js` | 328 | Kanban: arrastar entre colunas grava a propriedade | Base sólida |
| `bases/bases-list-view.js` | 92 | Lista simples | Básica |
| `bases/bases-gallery-view.js` | 211 | Galeria com capa da nota, 3 tamanhos | Melhorada em 2026-10-06 |
| `bases/bases-calendar-view.js` | 241 | **Só mês**, uma propriedade de data (+ reserva: criação) | Básica |
| `bases/bases-cell-editors.js` | 342 | Editores inline por tipo | Base sólida |
| `calendar/*` (+ `calendar-view.js`) | ~1.200 | **Outro** calendário (a view "Calendário" do app): mês, **semana**, agenda, intervalos multi-dia, arrastar e soltar, caixa de "sem data" | **Reaproveitável** (5.4) |
| `property-types.js` | 143 | Tipos de propriedade da nota (inclui `daterange`, `location`, `reminder`) | Reaproveitável |

### 1.2 Como uma view é definida hoje (YAML dentro do bloco `base`)

```yaml
name: Nova Base
source:
  folder: /           # ou tag: #x, ou property: p
views:
  - type: table       # table | board | gallery | list | calendar
    name: Tabela Geral
    columns: [title, folder, tags, updatedAt]
    sort: [{ property: title, direction: asc }]
  - type: board
    name: Quadro
    groupBy: status
```

Chaves de configuração hoje (e onde cada uma é lida):

| Chave | Lida por | Observação |
|---|---|---|
| `columns` | tabela | lista de colunas |
| `columnWidths`, `summaries` | tabela | mutados no objeto da view |
| `cardProperties` | quadro | **nome diferente** das outras views |
| `visibleProperties` / `properties` | galeria, lista | **dois nomes** para a mesma coisa |
| `groupBy` | quadro | só quadro |
| `filters`, `filterMode`/`filterOperator` | container, quadro | ver 1.3 |
| `sort` | container, tabela | lista de `{property, direction}` |
| `dateProperty`, `fallbackDateProperty` | calendário | novo (reserva: data de criação) |
| `cardSize`, `coverProperty` | galeria | novo |
| `defaultView` (na Base) | container | **índice** numérico |

### 1.3 Dívidas e bugs reais (verificados no código) — **Fase 0 corrige**

1. **Filtro OR nunca vale pelo container.** `bases-view-container.js` passa `filterOperator`, mas `queryBaseNotes` lê `filterMode`. O modo "OU" só funciona se alguém escrever `filterMode` à mão (o quadro lê certo).
2. **Ordenação sem schema.** O container chama `sortBaseNotes(filteredNotes, currentView.sort)` **sem o `schema`**; sem ele todo tipo vira texto — número (`10 < 9`) e data ordenam como string.
3. **Datas em UTC.** `is_today` usa `toISOString().slice(0,10)`: no fuso de Brasília, depois das 21h ou antes das 3h "hoje" é o dia errado (mesmo erro que já corrigimos no calendário). `is_before`/`is_after` comparam strings.
4. **Sem identidade de view.** A view ativa e `defaultView` são **índices**. Reordenar, duplicar ou excluir uma aba quebra o "view padrão"; o YAML não tem `id`.
5. **Nomes de chave divergentes** (tabela `columns` · quadro `cardProperties` · galeria/lista `visibleProperties`/`properties`) — a mesma ideia ("quais propriedades mostrar") em quatro grafias.
6. **Só dá para configurar editando YAML.** Não há painel de filtro, ordenação, agrupamento ou propriedades. O "+ visão" cria a view com um conjunto fixo (`title, tags, updatedAt`).
7. **Opções de seleção/status vivem por nota** (`propertySelectOptions` na nota, não na Base) → duas notas podem ter opções/cores diferentes para a mesma propriedade. **A verificar** como o schema mescla; a Base precisa de definições próprias (`properties:`) que mandem.
8. **Dois calendários.** `bases-calendar-view.js` reimplementa normalização de datas e grade do mês que `calendar/calendar-engine.js` já resolve (e este já tem semana, multi-dia, arrastar e agenda).
9. **YAML mínimo.** O parser aceita só o que as views atuais usam; filtros aninhados (grupos E/OU) e fórmulas exigem um formato mais rico (ver 8.4: migrar para um bloco JSON estruturado, YAML só como "visão de código").

---

## 2. Mapa Notion → QuickDock

Legenda de estado: ✅ existe · 🟡 parcial · ⬜ não existe · ➖ fora de escopo (depende de multiusuário/nuvem). Fase = ver parte 6.

### 2.1 Tipos de view

| Notion | QuickDock hoje | Fase | Notas |
|---|---|:-:|---|
| Table | ✅ | 3 | profundar (grupos, cálculos, cor condicional, subitens) |
| Board (Kanban) | ✅ | 3 | sub-grupo, prévia, tamanho, colunas ocultas, agregações |
| Timeline (Gantt) | ⬜ | 5 | início/fim, zoom, dependências, "mostrar tabela" |
| Calendar (mês) | 🟡 | 2 | só mês, 1 propriedade |
| Calendar (**semana**, dia) | ⬜ | **2** | grade horária; reaproveita `calendar/*` |
| List | 🟡 | 3 | só título + props inline |
| Gallery | 🟡 | 3 | capa da nota, 3 tamanhos; falta prévia de conteúdo, proporção etc. |
| Chart (barra/linha/pizza/número) | ⬜ | 6 | SVG próprio |
| Map | ⬜ | 7 | propriedade `location` já existe; Leaflet já está no `vendor/` |
| Feed | ⬜ | 7 | prévia do conteúdo (reaproveita `board-note-render.js`) |
| Dashboard (vários widgets) | ⬜ | 8 | opcional |

### 2.2 Configurações transversais

| Notion | Hoje | Fase |
|---|---|:-:|
| Renomear/ícone/duplicar/excluir/reordenar/bloquear view | ⬜ (só criar) | 1 |
| Filtros com grupos E/OU aninhados | 🟡 (lista plana, bug no OU) | 1 |
| Filtros rápidos na barra (fixos vs. avançados) | ⬜ | 1 |
| Filtros de data relativos (hoje, esta semana, últimos N dias…) | ⬜ | 1 |
| Ordenação multi-nível com UI | 🟡 (clique no cabeçalho) | 1 |
| Agrupar por (propriedade, granularidade, ordem, ocultar vazios) | 🟡 (só quadro) | 1/3 |
| Sub-grupo | ⬜ | 3 |
| Mostrar/ocultar/reordenar propriedades por view | ⬜ (YAML) | 1 |
| Formato de exibição por propriedade (data, número, barra de progresso) | ⬜ | 4 |
| Cálculos por coluna/grupo (todas as agregações) | 🟡 (resumos básicos) | 3 |
| Cor por propriedade / formatação condicional | ⬜ | 3 |
| Nova nota herdando filtro/grupo | 🟡 (pasta/tag) | 1 |
| Templates por view | ⬜ | 8 |
| "Abrir em": página cheia / peek lateral / peek central | 🟡 (só abre no editor) | 8 |
| Views vinculadas (database vinculado) | ⬜ | 8 |
| Seleção e edição em lote | ⬜ | 8 |
| Exportar (CSV/Markdown) | ⬜ | 8 |
| Pessoa, "criado por", comentários, permissões | ➖ | — |

### 2.3 Tipos de propriedade

| Notion | Hoje | Fase |
|---|---|:-:|
| Texto, número, data, caixa de seleção, URL | ✅ | — |
| Seleção | ✅ (opções por nota, ver 1.3-7) | 4 |
| **Status** (grupos A fazer / Em andamento / Concluído) | ⬜ (`status` vira seleção) | 4 |
| Multisseleção | 🟡 (`list`) | 4 |
| E-mail, telefone | ⬜ | 4 |
| Arquivos e mídia | ⬜ (capa existe; anexos por propriedade não) | 4 |
| Criado em / Editado em | ✅ (sistema) | 4 (formato) |
| ID único (`TAREFA-12`) | ⬜ | 4 |
| **Fórmula** | ⬜ (tipo declarado, sem motor) | 4 |
| **Relação** + **Rollup** | 🟡 (`link` interno) | 4 |
| Botão (ação) | ⬜ | 8 |
| Período (`daterange`), localização, lembrete | ✅ (propriedades da nota) | 2/7 |

---

## 3. Arquitetura-alvo

### 3.1 Princípios

1. **Engine puro e testável** (sem DOM/Dexie), como `bases-engine.js` já é. Toda lógica nova (filtros aninhados, agrupamento por data, fórmulas, agregações, layout de semana/timeline) nasce em módulo puro com testes no Node.
2. **Config declarativa por view** com **id estável**. O que o painel edita é o mesmo objeto que as views leem — nada de estado escondido no DOM.
3. **Um painel de configuração só**, que muda de seções conforme o tipo da view (como o Notion) — não um painel por view.
4. **Cada view é um módulo pequeno** com a mesma assinatura (`render(container, ctx)`), registrado numa tabela. Adicionar um tipo = 1 arquivo + 1 linha de registro.
5. **Compatibilidade para trás sempre:** Base antiga abre igual, sem migração em massa (padrão já usado no projeto: normalizar na leitura, gravar o formato novo só quando a pessoa editar).
6. **Reuso antes de reescrita:** calendário de semana reaproveita `calendar/*`; feed reaproveita `board-note-render.js`; mapa reaproveita Leaflet; gráficos usam o dataviz do projeto.

### 3.2 Camadas e módulos novos

```
sidepanel/modules/bases/
├─ engine/                      ← PURO (testado em test/run.mjs)
│  ├─ filter-engine.js          grupos E/OU aninhados, operadores por tipo, datas relativas
│  ├─ sort-engine.js            multi-nível, por tipo, ordem manual
│  ├─ group-engine.js           agrupar por tipo/granularidade, sub-grupo, ordem dos grupos
│  ├─ aggregate-engine.js       todas as agregações (Apêndice C)
│  ├─ date-range.js             intervalos relativos, semanas, fuso LOCAL
│  ├─ formula/                  tokenizer · parser · avaliador · funções · tipos
│  └─ view-layout/              layouts puros: semana (colunas de sobreposição),
│                               timeline (barras/escala), gráficos (escalas/séries)
├─ config/                      ← estado e persistência da definição
│  ├─ view-model.js             defaults por tipo, normalização, migração v1→v2, ids
│  ├─ view-actions.js           criar/duplicar/renomear/reordenar/excluir/bloquear
│  └─ base-store.js             lê/grava a Base (bloco JSON ↔ YAML) e avisa o container
├─ ui/                          ← painel de configuração e peças reutilizáveis
│  ├─ view-settings-panel.js    shell do painel (seções por tipo de view)
│  ├─ section-layout.js · section-properties.js · section-filter.js
│  ├─ section-sort.js · section-group.js · section-calendar.js · …
│  ├─ property-picker.js        popover "escolher propriedade" (com ícone de tipo)
│  ├─ filter-builder.js         construtor de filtros aninhados
│  ├─ view-tabs.js              barra de abas (ícone, arrastar, menu ⋯, overflow)
│  └─ quick-filters.js          chips de filtro rápido na barra
└─ views/
   ├─ registry.js               tipo → { render, defaults, settingsSections, label, icon }
   ├─ table/ · board/ · list/ · gallery/ · calendar/ · timeline/ · chart/ · map/ · feed/
```

> Os arquivos atuais (`bases-*-view.js`) migram **gradualmente** para `views/<tipo>/` — um tipo por vez, sempre com o app funcionando (regra do `CLAUDE.md`: dividir incrementalmente e validar no navegador).

### 3.3 Contrato de uma view

```js
// views/registry.js
registerView('calendar', {
  label: 'Calendário', icon: 'calendar_month',
  defaults: () => ({ mode: 'month', dateProperty: null, fallbackDateProperty: 'createdAt', … }),
  settingsSections: ['layout', 'calendar', 'properties', 'filter', 'sort', 'group'],
  render(container, { notes, schema, view, base, actions }) { … },   // retorna { destroy() }
});
// actions: { open(noteId), create(props), update(noteId, patch), updateView(patch),
//            openSettings(section?), select(ids), … }
```

### 3.4 Fluxo de dados

`notas` → **source** (pasta/tag/propriedade/outra Base) → **filtros da view** → **filtros rápidos** → **busca** → **ordenação** → **agrupamento** → **renderizador**. Cada etapa é uma função pura; o container só compõe e memoiza por (notas, view).

### 3.5 Persistência

- Fonte da verdade: **bloco JSON estruturado** no bloco `base` (campo `config`), com **YAML como visão de código** (o editor "`<>`" que já existe continua, gera/parseia YAML ↔ JSON).
- Por quê: filtros aninhados, regras de cor, fórmulas e relações ficam frágeis num YAML escrito à mão pelo parser mínimo atual.
- Sincronização: o `config` faz parte do conteúdo da nota → vai no `.md` (como hoje). Conflitos seguem a regra de sempre da nota. **Ordem manual** (arrastar cartões/linhas) fica na propriedade de cada nota (`__ordem_<viewId>`) ou numa lista de ids na view — decidir em 11.

---

## 4. Recursos transversais (valem para todas as views)

> Cada item: **o que o Notion faz → como será no QuickDock → critérios de aceite.**

### 4.1 Barra de views

- **Notion:** abas com ícone; clique duplo renomeia; menu ⋯ (renomear, editar view, duplicar, excluir, copiar link); arrastar para reordenar; botão "+" abre lista de tipos; abas demais viram "▾ N views".
- **QuickDock:** `ui/view-tabs.js`. Ícone por tipo (já mapeado), ícone customizável (Material Symbols), duplo clique renomeia inline, arrastar reordena (`id` estável), menu ⋯, overflow com menu, **view padrão** por `id`, **bloquear view** (impede mudar filtros/ordenação sem desbloquear), atalho `Alt+←/→` entre views.
- **Aceite:** reordenar/duplicar/excluir mantém a view padrão correta; excluir a última view é impedido; renomear não perde configuração.

### 4.2 Filtros

- **Notion:** filtro por propriedade com operadores por tipo; **grupos aninhados** (E/OU até 3 níveis); **filtros rápidos** (aparecem na barra, valem só para quem está olhando); filtros de data relativos; filtro "esta página" (valor da nota atual).
- **QuickDock:** estrutura `filter: { op: 'and'|'or', conds: [ {prop, operator, value} | {op, conds} ] }` (até 3 níveis). Operadores por tipo (Apêndice A). **Datas relativas:** `hoje`, `ontem`, `amanhã`, `esta semana`, `semana passada/próxima`, `este mês`, `mês passado/próximo`, `últimos N dias/semanas/meses`, `próximos N…`, `antes/depois de`, `entre`, `data exata`; **todas no fuso local**. **Filtro rápido:** qualquer condição pode ser "fixada" na barra como chip (`Status: Em andamento ▾`), editável sem abrir o painel e **não salvo na Base** (fica em `localStorage` por view). **Valor dinâmico:** `value: { ref: 'currentNote', prop: 'projeto' }` (nota onde o bloco está) — útil em Bases embutidas.
- **Aceite:** `(A e B) ou (C e (D ou E))` funciona; "últimos 7 dias" às 23h50 ainda inclui o dia certo; limpar filtros em 1 clique; contagem de notas atualiza na barra.

### 4.3 Ordenação

- **Notion:** vários níveis, asc/desc por propriedade; "ordenação manual" ao arrastar.
- **QuickDock:** lista de `{prop, direction}`; **ordenação por tipo** (número como número, data como instante, seleção pela ordem das opções, status pela ordem dos grupos, texto em `pt-BR` com `numeric`); vazios sempre no fim (opção "vazios primeiro"). **Ordem manual:** arrastar reordena (tabela/lista/galeria/quadro) → grava ordem e a view passa a "Manual" (aviso: "ordenação por propriedade desligada").
- **Aceite:** `["10","9","2"]` ordena `2,9,10`; arrastar persiste após recarregar.

### 4.4 Agrupamento

- **Notion:** agrupar por propriedade; para datas, granularidade (dia/semana/mês/ano/relativo); ordem dos grupos; ocultar grupos vazios; **grupos recolhíveis** com contagem; cor do grupo; **sub-grupo** (quadro/tabela/timeline).
- **QuickDock:** `group: { prop, granularity?, order: 'manual'|'asc'|'desc'|'count', hideEmpty, hidden: [valores], collapsed: [valores], showCounts, colorBy }`. Por tipo: seleção/status (cores das opções; status agrupa por grupo "A fazer/Em andamento/Concluído" ou por opção), multisseleção (uma nota aparece em vários grupos), data (granularidade), número (**faixas**: início/fim/passo), checkbox (marcado/desmarcado), pasta, tags.
- **Aceite:** multisseleção duplica a nota nos grupos certos; recolher grupo persiste; "Sem valor" é um grupo normal (reordenável/ocultável).

### 4.5 Propriedades visíveis e formato

- **Notion:** mostrar/ocultar/reordenar; largura; quebra de linha; formato por tipo (número: moeda/percentual/barra/anel; data: relativa/formato; checkbox: caixa ou alternância).
- **QuickDock:** `props: [{ key, visible, width, wrap, format: {…} }]` — **um único campo** substitui `columns`/`cardProperties`/`visibleProperties`/`properties` (migração em 8.5). Formatos em `engine/format.js` (puro): `number: {kind: plain|currency|percent|progress-bar|progress-ring, currency, decimals, divideBy}`, `date: {kind: absolute|relative|short|long, pattern, showTime}`, `select: {style: pill|dot|text}`, `checkbox: {style: box|toggle}`.
- **Aceite:** o mesmo conjunto de propriedades visíveis vale ao trocar de tabela para galeria (o que a view não usa é ignorado, não perdido).

### 4.6 Cálculos / agregações

- **Notion:** rodapé por coluna (tabela) e por grupo (quadro, tabela, timeline) com ~20 cálculos por tipo.
- **QuickDock:** `engine/aggregate-engine.js` (Apêndice C). Por tipo: texto (contagem, preenchidos, vazios, únicos, % preenchidos), número (soma, média, mediana, mín, máx, intervalo), data (mais antiga, mais recente, intervalo em dias), checkbox (marcados, %), seleção/status (contagem por opção, **% por grupo de status**). Uso: rodapé da tabela, cabeçalho de coluna do quadro, eixo Y dos gráficos.
- **Aceite:** soma de coluna de moeda formata como moeda; "Mediana" correta com número par de itens.

### 4.7 Cor

- **Notion:** cor por opção de seleção/status; **formatação condicional** (regra → cor de linha/cartão/célula); "Color by" em calendário/timeline.
- **QuickDock:** paleta de **tons em OKLCH** (mesma lógica dos cartões do Espaço: matiz fixo, L/C por tema, texto definido junto — ver `docs/PADRAO-DE-CORES-OKLCH.md`). `colorBy: prop` e `colorRules: [{ when: <filtro>, color, apply: row|card|cell }]`.
- **Aceite:** contraste de texto ≥ 55 pontos de L nos dois temas em todas as cores.

### 4.8 Criar nota a partir da view

- **Notion:** "Novo" cria já com os valores implícitos nos filtros (`Status = Em andamento`) e no grupo/coluna onde foi clicado; **templates** por view (menu ▾ ao lado de "Novo").
- **QuickDock:** `actions.create(props)` recebe: valores dos filtros de igualdade, valor do grupo/sub-grupo clicado, **data da célula** (calendário/timeline), pasta/tag da `source`. Templates por view (usa os modelos de nota existentes): `newTemplate: <id do modelo>`.
- **Aceite:** "+" na coluna "Em andamento" cria nota com `status: Em andamento`; "+" no dia 12 cria com `data: 12`.

### 4.9 Seleção e edição em lote (Fase 8)

Seleção por checkbox/`Shift`/`Ctrl`; barra de ações: definir propriedade, mover para pasta, adicionar/remover tag, duplicar, excluir (com confirmação como já fizemos nos Espaços), abrir em abas. Desfazer (um nível) para ações em lote.

### 4.9b "Abrir em" (Fase 8)

`openMode: page | peek-side | peek-center`. **peek** reaproveita o **editor emprestado** (já usado no cartão de nota do Espaço — `lendEditorTo` em `note.js`): abre a nota num painel lateral/central **sem trocar a nota ativa**.

### 4.10 Views vinculadas e Bases embutidas (Fase 8)

`source: { base: <uid da nota da Base> }` — mostra outra Base com filtros/ordenação próprios, **somente leitura da definição** (a definição continua na Base de origem; editar dados vale). Ícone de "vinculada" na aba.

### 4.11 Exportar / imprimir (Fase 8)

CSV (UTF-8 com BOM p/ Excel), Markdown (tabela), JSON. Impressão: `@media print` já existe no projeto (`25-print.css`) — adicionar regras por view.

### 4.12 Teclado e acessibilidade

`↑↓←→` navegam células/cartões, `Enter` abre, `Espaço` marca, `Esc` fecha painel, `/` foca a busca, `Alt+1…9` troca de view. ARIA: `role=grid` (tabela), `role=listbox` (quadro/lista), `aria-live` na contagem; foco visível; alvos ≥ 32 px no toque.

### 4.13 Mobile/toque

Painel de configuração vira **folha inferior**; arrastar vira "segurar e arrastar"; semana do calendário mostra 3 dias com rolagem horizontal; timeline em modo compacto.

---

## 5. Catálogo de views e configurações

> Para cada view: **(a)** o que o Notion oferece, **(b)** configuração proposta (YAML/JSON), **(c)** implementação e reuso, **(d)** aceite, **(e)** riscos.

### 5.1 Tabela (profundar)

**(a) Notion:** colunas (mostrar/ocultar/reordenar/largura/quebra de texto), **congelar colunas** até X, **numeração de linhas**, **linhas verticais/bordas**, **altura da linha** (curta/média/alta), **largura total da página**, **agrupar** (com recolher, contagem e cálculo por grupo), **subitens** (hierarquia pai/filho com expandir), **cálculo no rodapé** por coluna, **cor de linha/coluna/célula**, edição inline por tipo, **arrastar linhas**, **colar de planilha**, **preencher arrastando** a alça da célula, **ocultar a coluna de título**, **menu de coluna** (ordenar, filtrar por esta coluna, congelar, ocultar, tipo, formato, cálculo), **inserir coluna antes/depois**, **selecionar várias linhas**.

**(b) Config:**
```yaml
- id: v_tabela
  type: table
  name: Projetos
  props:                       # ordem = ordem das colunas
    - { key: title,  width: 280, frozen: true }
    - { key: status, width: 140 }
    - { key: prazo,  width: 120, format: { kind: relative } }
    - { key: custo,  width: 110, format: { kind: currency, currency: BRL } }
  layout: { rowHeight: medium, wrapCells: false, rowNumbers: true, borders: both, fullWidth: false, showTitle: true }
  group:  { prop: status, order: manual, collapsed: [Concluído], showCounts: true }
  subItems: { parentProp: pai, expandAll: false }       # relação "pai"
  calc:   { custo: sum, prazo: latest, title: count }
  colorRules: [ { when: { prop: prazo, operator: is_before, value: today }, color: red, apply: row } ]
```

**(c) Implementação:** `views/table/` dividido em `table-render.js` (DOM), `table-columns.js` (largura/arrastar/congelar), `table-cells.js` (edição — reaproveita `bases-cell-editors.js`), `table-selection.js`, `table-footer.js`. **Virtualização de linhas** acima de 300 linhas (janela de renderização + espaçadores). Subitens: árvore a partir da propriedade relação `pai` (ciclos ignorados com aviso).

**(d) Aceite:** congelar 2 colunas e rolar na horizontal mantém as duas; colar 3×4 de planilha preenche 12 células com validação por tipo (erros destacados, nada gravado pela metade); 2.000 notas rolam a 60 fps.

**(e) Riscos:** colunas congeladas + redimensionamento + virtualização juntos são o ponto mais delicado do CSS (`position: sticky` com tabela). Fazer em duas entregas: (1) sticky sem virtualização; (2) virtualização.

### 5.2 Quadro / Kanban (profundar)

**(a) Notion:** **agrupar por** (seleção/status/pessoa/data…), **sub-grupo** (raias horizontais), **prévia do cartão** (capa da propriedade / conteúdo da página / nenhuma), **tamanho do cartão** (P/M/G), **ajustar imagem** (cobrir/conter), **colorir colunas**, **colunas ocultas** (e "grupo oculto" recolhível), **agregação por coluna** (soma/contagem…), **arrastar** cartões entre colunas e **dentro** da coluna (ordem manual), **mover colunas**, **+ novo** em cada coluna, **"abrir em"**, **limite de itens por coluna (WIP)** (extra nosso).

**(b) Config:**
```yaml
- id: v_quadro
  type: board
  group:    { prop: status, order: manual, hidden: [Arquivado], colorColumns: true }
  subGroup: { prop: prioridade, collapsed: [Baixa] }
  card:     { preview: cover, coverProp: capa, size: medium, fit: cover, props: [prazo, tags] }
  calc:     { custo: sum }
  wip:      { 'Em andamento': 5 }
```

**(c) Implementação:** `views/board/`: `board-columns.js` (colunas a partir do `group-engine`), `board-lanes.js` (sub-grupo), `board-card.js` (prévia: capa via `coverUrl/coverFileId` como na galeria; **conteúdo** via `renderNoteBlocks`), `board-dnd.js` (arrastar entre colunas e **reordenar** com indicador de inserção; grava propriedade + ordem manual). Coluna de **status** usa grupos (4.4).

**(d) Aceite:** arrastar para coluna grava `status`; arrastar dentro reordena e persiste; sub-grupo mostra raias com cabeçalho recolhível; WIP estourado destaca a coluna.

### 5.3 Lista

**(a) Notion:** uma linha por item, título + propriedades escolhidas **inline à direita**, agrupável, sem bordas. **(b)** `{ type: list, props: [...], group, density: compact|normal, showIcons, checkboxProp }`; `checkboxProp` mostra uma caixa à esquerda que marca a tarefa. **(c)** `views/list/` simples, virtualizada. **(d) Aceite:** marcar a caixa grava a propriedade; densidade muda a altura; agrupado recolhe.

### 5.4 **Calendário (mês · semana · dia · agenda)** — o exemplo que você deu

**(a) Notion:** *Mostrar calendário por* (propriedade de data — incluindo **período** início→fim e criado/editado em), **Mês** e **Semana** (na versão com grade horária, também **dia**), **Mostrar fins de semana**, **Primeiro dia da semana**, **Mostrar número da semana**, **Cor por** propriedade, **Propriedades nos cartões**, **Cartões abrem em**, **Mostrar nota sem data** (caixa lateral), arrastar para **mudar a data**, arrastar a borda para **mudar a duração** (início/fim), **criar clicando/arrastando** no dia (e no horário, na semana), **linha de "agora"**, **horário visível** (ex.: 07–21h), **escala de tempo** (15/30/60 min), **fuso horário**, **navegação** (hoje, anterior, próximo, "ir para a data"), **mini-calendário**, eventos **o dia todo** vs. **com horário**, **eventos sobrepostos** lado a lado, "**+N mais**" na célula cheia, **feriados** (extra nosso).

**(b) Config proposta:**
```yaml
- id: v_calendario
  type: calendar
  mode: week                     # month | week | day | agenda | days (N dias)
  daysCount: 7                   # mode: days → 2…14
  date:   { start: data_inicio, end: data_fim, fallback: createdAt, allDayWhenNoTime: true }
  week:   { firstDay: mon, showWeekends: true, showWeekNumber: true }
  time:   { dayStart: "07:00", dayEnd: "21:00", slot: 30, showNowLine: true, snap: 15 }
  card:   { props: [status], colorBy: prioridade, showTime: true, titleLines: 2 }
  month:  { maxPerDay: 3, showOtherMonthDays: true }
  agenda: { range: 14d, groupByDay: true }
  sidebar:{ miniCalendar: true, noDate: true }       # "sem data" = caixa lateral (já existe no app)
  holidays: { country: BR }       # opcional
  openIn: peek-side
```

**(c) Implementação (reuso máximo):**
1. **Normalizar** (Fase 0): trocar o `normalizeDateToYMD` próprio por `calendar/calendar-engine.js` (`normalizarDataString`, `extrairDataDaNota`, `extrairIntervaloDaNota`, `gerarMatrizCalendario`, `gerarMatrizSemana`) — **uma** fonte de datas.
2. `views/calendar/calendar-model.js` (**puro**): transforma notas em **eventos** `{ id, start, end, allDay, noteId, color }`, resolve `date.start/end/fallback`, `daterange`, e fuso local.
3. `views/calendar/layout-week.js` (**puro**): algoritmo de **colunas de sobreposição** (clusters de eventos que se tocam → largura `1/n`), posição por minuto → `top/height` em %, "+N" para dias cheios, eventos de dia inteiro numa faixa superior (reaproveita `calendar-spans.js` para multi-dia).
4. `views/calendar/{month,week,day,agenda}.js` (DOM): `month` reaproveita `renderMonthGrid` + `calendar-spans`; `week/day` novos (grade horária, linha "agora" com `setInterval` leve); `agenda` reaproveita `calendar-agenda-view.js`.
5. **Interação:** `calendar-dnd.js` (já existe) → mover evento (muda `date.start`; mantém duração); **resize** pela borda inferior/direita (muda `end`); **criar** arrastando um intervalo na grade (cria nota com `start/end`); duplo clique no dia cria; `Esc` cancela.
6. **Painel lateral:** mini-calendário (navega) + **"Sem data"** (reaproveita `calendar-inbox.js`): arrastar dali para a grade define a data.
7. Configurações em `ui/section-calendar.js` (campos acima).

**(d) Aceite:**
- Semana: 3 eventos sobrepostos às 10h ficam lado a lado (1/3 cada); evento 22h–02h aparece em dois dias; "agora" avança sozinho.
- Arrastar de terça 10h para quinta 14h grava `start` novo e mantém a duração; arrastar a borda muda só o `end`.
- Nota sem a propriedade escolhida usa a data de criação (já implementado) e aparece tracejada.
- `firstDay: mon` + `showWeekNumber` desenham corretamente em março/dezembro (semana ISO).
- Tema claro/escuro legíveis (cores dos eventos em OKLCH).

**(e) Riscos:** **fuso/horário de verão** (usar sempre data local e minutos desde a meia-noite; nada de `toISOString`); desempenho da grade com muitos eventos (limitar a janela visível); conflito com a view "Calendário" do app (não é duplicação: aquela é **do app inteiro**; a do Bases é **da Base** — mas compartilham engine, por isso a Fase 0 unifica).

### 5.5 Galeria (profundar)

**(a) Notion:** **prévia do cartão** (capa de propriedade de arquivo / **conteúdo da página** / nenhuma), **tamanho** (P/M/G), **ajustar imagem** (cobrir/conter), **proporção da capa** (1:1, 4:3, 16:9…), propriedades visíveis, agrupar, "abrir em". **(b)**
```yaml
- { id: v_galeria, type: gallery, card: { preview: cover|content|none, size: medium, fit: cover, aspect: "4/3", props: [tags, updatedAt] }, group: {…} }
```
**(c)** Já temos capa da nota, ícone/cor e 3 tamanhos. Falta: prévia de **conteúdo** (`renderNoteBlocks` cortado a ~6 linhas com *fade*), proporção, agrupamento, ordem manual, propriedade de **arquivos** como capa (4.5/Tipos). **(d)** Prévia de conteúdo mostra título + primeiras linhas formatadas; trocar proporção não "pula" o layout (reservar altura).

### 5.6 Linha do tempo (Timeline / Gantt) — **nova**

**(a) Notion:** barras por item entre **início** e **fim**; **zoom** (horas, dias, semanas, meses, trimestres, anos); **mostrar tabela** (colunas à esquerda, redimensionável); **agrupar** em raias; **cor**; **hoje** destacado; arrastar a barra (move) e as pontas (redimensiona); **dependências** (setas entre barras, via relação "bloqueia/bloqueado por") com opção de **"reagendar" automático**; itens sem data numa caixa; **pré-visualização**; rolagem sincronizada tabela↔linha do tempo.

**(b) Config:**
```yaml
- id: v_timeline
  type: timeline
  date:  { start: inicio, end: fim }
  scale: week                    # hour | day | week | month | quarter | year
  table: { visible: true, width: 320, props: [status] }
  group: { prop: equipe }
  color: { by: prioridade }
  dependencies: { prop: bloqueia, autoShift: false, showArrows: true }
  today: true
```

**(c) Implementação:** `engine/view-layout/timeline-layout.js` (**puro**: escala → pixel, barras, empilhamento de linhas, setas ortogonais — pode reaproveitar `board/board-arrows.js` para o roteamento). `views/timeline/`: `timeline-grid.js` (cabeçalho de escala por zoom), `timeline-bars.js` (arrastar/redimensionar com *snap* à unidade), `timeline-table.js` (painel esquerdo, sincroniza rolagem vertical), `timeline-deps.js`. **Virtualização** horizontal e vertical. **(d) Aceite:** zoom de "mês" para "semana" mantém o centro; arrastar a barra de 3 dias move 3 dias; dependência cria seta e (opcional) empurra a sucessora. **(e) Riscos:** é a view mais cara; entregar em duas etapas: (1) barras + zoom + tabela; (2) dependências + autoShift.

### 5.6b Linha do tempo — formatos de data

Usa `daterange` (já existe) **ou** duas propriedades `inicio`/`fim`. Sem fim → marco (losango) de 1 dia. Fim < início → aviso no item (não quebra).

### 5.7 Gráficos — **novos**

**(a) Notion:** tipos **barra** (vertical/horizontal, empilhada/agrupada/100%), **linha**, **pizza/donut**, **número** (valor único). Configura-se: **eixo X** (propriedade; agrupamento por data com granularidade), **eixo Y** (agregação: contagem, soma, média, mín, máx, mediana…), **agrupar/empilhar por** (segunda propriedade), **ordenação** das categorias, **cumulativo**, **rótulos de dados**, **grade**, **título dos eixos**, **legenda**, **linha de meta**, **omitir zeros**, **esquema de cores**, **altura**; **clicar** numa barra filtra a tabela/lista abaixo.

**(b) Config:**
```yaml
- id: v_grafico
  type: chart
  chart: { kind: bar, orientation: vertical, stack: stacked }   # bar | line | donut | number
  x: { prop: status, sort: manual, omitEmpty: false }
  y: { agg: count }                       # ou { agg: sum, prop: custo }
  series: { prop: prioridade }            # empilhar/agrupar
  style: { labels: true, grid: true, legend: right, axisTitles: true, cumulative: false, goal: 20, colors: categorical, height: 280 }
  onClick: filter                         # filtra a lista de notas
```

**(c) Implementação:** `engine/view-layout/chart-layout.js` (**puro**: escalas lineares/temporais/bandas, empilhamento, *ticks* "bonitos", rótulos que não colidem). Render em **SVG próprio** (sem biblioteca — padrão do projeto, 100% nativo), seguindo a skill/diretrizes de dataviz do projeto: **paleta categórica em OKLCH** com L/C uniformes (matizes igualmente espaçados, legível nos dois temas, contraste de texto ≥ 55 de L), eixos discretos, tooltip acessível (teclado), foco visível. `views/chart/`: `chart-bar.js`, `chart-line.js`, `chart-donut.js`, `chart-number.js`, `chart-axes.js`, `chart-legend.js`. **(d) Aceite:** barra empilhada de "status × prioridade" soma igual à contagem total; datas agrupadas por mês ordenam cronologicamente; 5 000 notas calculam em < 100 ms (agregação única, sem re-render por barra). **(e) Riscos:** colisão de rótulos/*ticks* (resolver no layout puro, com testes); paleta categórica para > 8 séries (agrupar o excedente em "Outros").

### 5.8 Mapa — **novo**

**(a) Notion:** pinos por propriedade de **localização**, **cor/ícone por propriedade**, **cartão ao clicar**, **ajustar ao conteúdo**, **tipo de mapa** (padrão/satélite), **mostrar/ocultar cartões**. **(b)** `{ type: map, location: local, pin: { colorBy: status, icon: place }, fit: true, cluster: true }`. **(c)** `vendor/leaflet` já está no projeto (usado em `reminders/map-picker.js`); a propriedade `location` já guarda `lat/lng`. `views/map/`: `map-markers.js` (OKLCH nos pinos), `map-cluster.js` (agrupamento simples por grade — sem plugin), `map-popup.js` (prévia da nota). **Limite:** os *tiles* do mapa precisam de rede (o app é offline-first) → mostrar aviso discreto e um fundo neutro quando offline; a lista de notas continua funcionando. **(d) Aceite:** 200 pinos não travam (cluster); clicar no pino abre o cartão; "ajustar" enquadra todos.

### 5.9 Feed — **novo**

**(a) Notion:** coluna vertical de cartões **com o conteúdo** da página visível (como um mural de posts), props no topo, agrupável. **(b)** `{ type: feed, card: { preview: content, maxLines: 14, props: [data, tags] }, group: {…} }`. **(c)** Reaproveita **`board/board-note-render.js`** (renderização somente leitura em blocos que já fizemos para os cartões do Espaço), com corte por altura + "ver mais"; carregamento preguiçoso (IntersectionObserver). **(d) Aceite:** 100 notas rolam suave (renderiza só as visíveis); clicar abre a nota.

### 5.10 Dashboard — **opcional (Fase 8)**

Uma "página" de **widgets** (gráficos, número, lista filtrada) sobre a mesma Base: grade arrastável. Só vale depois de gráficos (5.7). Fora do MVP.

### 5.11 Resumo: configurações por tipo de view

| Seção do painel | Tabela | Quadro | Lista | Galeria | Calendário | Timeline | Gráfico | Mapa | Feed |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Layout (densidade, tamanho, proporção…) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Propriedades visíveis/ordem/formato | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| Filtro | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ordenar | ✔ | ✔(dentro da coluna) | ✔ | ✔ | — | ✔ | ✔(categorias) | — | ✔ |
| Agrupar / sub-grupo | ✔/✔ | ✔/✔ | ✔ | ✔ | — | ✔ | ✔(série) | — | ✔ |
| Cálculos | ✔ | ✔ | — | — | — | ✔(grupo) | (é o Y) | — | — |
| Cor (por / regras) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Datas (início/fim, escala, fuso…) | — | — | — | — | ✔ | ✔ | ✔(X) | — | — |
| "Abrir em" | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| Templates / "Novo" | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ |

---

## 6. Roadmap por fases

> Tamanhos: **P** (≤ 1 dia) · **M** (2–3 dias) · **G** (4–6 dias) · **GG** (1–2 semanas). São estimativas relativas para ordenar — não promessas. Cada fase termina com `node test/run.mjs` verde, validação no navegador (claro/escuro), `sw.js`/`CACHE_NAME` e atualização deste documento.

### Fase 0 — Fundação e dívidas (G) — **pré-requisito de tudo**
- [ ] Corrigir 1.3-1 (`filterOperator`→modo único), 1.3-2 (passar `schema` na ordenação), 1.3-3 (datas locais: `is_today`, `is_before/after`, novos relativos).
- [ ] **`id` estável** por view + `defaultViewId` (migra `defaultView` índice na leitura).
- [ ] Unificar nomes: `props` (substitui `columns`/`cardProperties`/`visibleProperties`/`properties`; leitura aceita todos).
- [ ] `engine/` puro: mover filtro/ordenação/agrupamento/resumos para os módulos novos (os arquivos antigos reexportam — sem quebrar quem importa).
- [ ] `config/view-model.js` (defaults por tipo + normalização + migração v1→v2) e `config/base-store.js` (JSON ↔ YAML).
- [ ] Calendário do Bases passa a usar `calendar/calendar-engine.js` (uma fonte de datas).
- [ ] Testes: filtros (cada operador × tipo), datas relativas com fuso fixo simulado, ordenação por tipo, migração de Bases antigas (golden files).
- **Aceite:** nenhuma Base existente muda de aparência; todos os testes antigos verdes; Bases antigas abrem sem erro.

### Fase 1 — Painel de configuração + barra de views + filtro/ordem/agrupar (GG)
- [ ] `ui/view-settings-panel.js` (shell + seções) e `ui/property-picker.js`.
- [ ] `ui/view-tabs.js`: ícone, renomear, duplicar, excluir, reordenar (arrastar), bloquear, overflow, view padrão.
- [ ] `ui/filter-builder.js` (grupos E/OU aninhados, operadores por tipo, datas relativas) + **filtros rápidos** (chips).
- [ ] `ui/section-sort.js`, `ui/section-group.js` (granularidade/ordem/ocultar/recolher), `ui/section-properties.js` (mostrar/ocultar/reordenar/largura/formato).
- [ ] "Novo" herdando filtro/grupo (4.8).
- **Aceite:** é possível configurar **tudo da Fase 0 pela interface**, sem abrir o YAML; o editor de YAML continua funcionando (e reflete a UI).

### Fase 2 — Calendário rico (G → GG) — **primeira entrega visível sugerida**
- [ ] Modelo de eventos puro + layout de semana puro (colunas de sobreposição) + testes.
- [ ] Modos **Mês / Semana / Dia / Agenda**; barra de navegação (hoje, ‹ ›, ir para data, título do período).
- [ ] Config: `date.start/end/fallback`, `firstDay`, `showWeekends`, `showWeekNumber`, `time.dayStart/dayEnd/slot`, `card.props/colorBy`, `month.maxPerDay`.
- [ ] Interação: arrastar (mover), redimensionar, criar por arrasto, "+N mais", linha de agora.
- [ ] Painel lateral: mini-calendário + "Sem data".
- [ ] `ui/section-calendar.js`.
- **Aceite:** ver 5.4(d).

### Fase 3 — Tabela e Quadro profundos (GG)
- [ ] Tabela: agrupar/recolher/contagem, cálculos por grupo, cor condicional, altura de linha, bordas, numeração, congelar colunas, menu de coluna, colar de planilha, arrastar linhas, seleção múltipla; **virtualização**; subitens.
- [ ] Quadro: sub-grupo, prévia (capa/conteúdo), tamanho, colunas ocultas/coloridas, agregação por coluna, ordem manual dentro da coluna, WIP.
- [ ] Lista e Galeria: agrupamento, ordem manual, densidade; galeria com prévia de conteúdo e proporção.

### Fase 4 — Tipos de propriedade, fórmulas, relações (GG)
- [ ] **Status** (grupos), **multisseleção**, e-mail, telefone, arquivos, ID único, formatos de número/data; **definições de propriedade na Base** (`properties:`) com opções/cores centralizadas (resolve 1.3-7).
- [ ] **Fórmulas** (`engine/formula/`): tokenizer → parser (Pratt) → avaliador **sem `eval`**; tipos `texto|número|data|booleano|lista`; funções do Apêndice D; mensagens de erro claras; detecção de ciclo; cache por nota.
- [ ] **Relações** (via `link` interno, bidirecional por backlinks) e **Rollups** (agregação sobre a relação).
- **Aceite:** `prop("custo") * prop("qtd")` na coluna; rollup "soma de horas das tarefas ligadas".

### Fase 5 — Linha do tempo (GG)
- [ ] 5.6 etapa 1 (barras, zoom, tabela, agrupar, cor, hoje) → etapa 2 (dependências + autoShift).

### Fase 6 — Gráficos (G → GG)
- [ ] Layout puro + barra/linha/donut/número + estilo + clique que filtra.

### Fase 7 — Mapa e Feed (G)
- [ ] Mapa (Leaflet + cluster por grade + pinos OKLCH) · Feed (render em blocos + carregamento preguiçoso).

### Fase 8 — Integrações e acabamento (GG)
- [ ] Views vinculadas · templates por view · seleção/edição em lote · "abrir em" (peek via editor emprestado) · exportar CSV/MD · impressão por view · botão (ação) · dashboard (opcional).

### Ordem recomendada e dependências

```
Fase 0 ─► Fase 1 ─┬─► Fase 2 (Calendário)   ← 1ª entrega que você vê
                  ├─► Fase 3 (Tabela/Quadro)
                  └─► Fase 4 (Tipos/Fórmulas) ─► Fase 6 (Gráficos)
Fase 2 ─► Fase 5 (Timeline: reaproveita escala/arrasto do calendário)
Fase 4 ─► Fase 7 (Mapa/Feed) ─► Fase 8
```

> **Fatia vertical mais curta para começar:** Fase 0 (só a parte de datas/ids) + **Calendário de semana** com um mini-painel de configuração (somente a seção "Calendário"). Dá o exemplo que você citou funcionando de ponta a ponta antes de construir o painel completo.

---

## 7. Especificação do painel de configuração (UX)

### 7.1 Estrutura

Abre pelo botão **⚙ "Configurar view"** na barra (e pelo menu ⋯ da aba). Em desktop: **painel lateral direito** (320–360 px) dentro da própria view; em mobile: folha inferior. `Esc` fecha; alterações **aplicam na hora** (sem "Salvar"), com *debounce* de gravação (300 ms) e indicador "salvo".

```
┌─ Configurar view ───────────────────── ✕ ┐
│  📅 Calendário · Semana     [⋯ ▾]          │   ← nome editável + menu (duplicar, excluir, bloquear)
│  ───────────────────────────────────────  │
│  ▸ Layout                                  │
│      Tipo de view      [Calendário ▾]      │
│      Mostrar por       (•) Semana ( ) Mês  │
│      Dias              [7 ▾]               │
│      Fins de semana    [■ ligado]          │
│      1º dia da semana  [Segunda ▾]         │
│      Nº da semana      [□]                 │
│  ▸ Datas                                   │
│      Início            [data_inicio ▾]     │
│      Fim (opcional)    [data_fim ▾]        │
│      Sem data usa      [Data de criação ▾] │
│      Horário           [07:00] – [21:00]   │
│      Intervalo         [30 min ▾]          │
│  ▸ Cartões                                 │
│      Propriedades      [3 visíveis ›]      │
│      Colorir por       [prioridade ▾]      │
│  ▸ Filtro              [2 regras ›]        │
│  ▸ Ordenar             [1 regra ›]         │
│  ▸ Agrupar             [Nenhum ›]          │
│  ▸ Avançado                                │
│      Abrir em          [Painel lateral ▾]  │
│      Template "Novo"   [Reunião ▾]         │
│  ───────────────────────────────────────  │
│  [Duplicar view]   [Excluir view]          │
└────────────────────────────────────────────┘
```

### 7.2 Componentes reutilizáveis (todos pequenos, com testes de DOM leves)

| Componente | Faz |
|---|---|
| `Row` / `Section` | linha rótulo+controle; seção recolhível (estado lembrado por view) |
| `PropertyPicker` | popover com busca, ícone do tipo, filtro por tipos aceitos (ex.: só datas) |
| `Select` / `SegmentedControl` / `Toggle` / `NumberStepper` / `TimeInput` | controles com teclado e ARIA |
| `FilterBuilder` | árvore de grupos/condições; arrastar para mover; "converter em grupo" |
| `SortList` / `GroupEditor` / `PropsEditor` | listas arrastáveis com **handle** |
| `ColorPicker` | paleta OKLCH com pré-visualização nos dois temas |

### 7.3 Regras de interação

- Trocar o **tipo da view** preserva o que é comum (filtro, ordenação, propriedades) e **mantém numa gaveta** as chaves do tipo anterior (voltar restaura).
- View **bloqueada**: painel mostra o cadeado e desabilita filtro/ordenação/layout; "Desbloquear" no topo.
- Mudança destrutiva (excluir view, tirar propriedade usada em filtro) pede confirmação (padrão do projeto: `confirm` com nome do item).
- **Prévia imediata**: o conteúdo atrás do painel reage enquanto você mexe.

### 7.4 Atalhos

`Ctrl+Alt+,` abre/fecha o painel · `Alt+←/→` troca de view · `F` foca filtros rápidos · `S` abre ordenação.

---

## 8. Modelo de dados formal e migração

### 8.1 Esquema da Base (v2)

```jsonc
{
  "version": 2,
  "name": "Projetos",
  "source": { "folder": "Projetos", "includeSubfolders": true, "tag": null, "property": null, "base": null },
  "properties": {                         // definições da BASE (mandam sobre o inferido das notas)
    "status": { "type": "status", "options": [
       { "id": "todo",  "label": "A fazer",       "group": "todo",     "tone": "gray"  },
       { "id": "doing", "label": "Em andamento",  "group": "progress", "tone": "blue"  },
       { "id": "done",  "label": "Concluído",     "group": "complete", "tone": "green" } ] },
    "custo":  { "type": "number", "format": { "kind": "currency", "currency": "BRL" } },
    "total":  { "type": "formula", "expr": "prop(\"custo\") * prop(\"qtd\")", "result": "number" }
  },
  "defaultViewId": "v_tabela",
  "views": [ /* ver 8.2 */ ]
}
```

### 8.2 Esquema de uma view (campos comuns)

```jsonc
{
  "id": "v_x3k9",            // estável, gerado (nunca reaproveitado)
  "type": "table|board|list|gallery|calendar|timeline|chart|map|feed",
  "name": "Minha view", "icon": "table_chart",
  "locked": false,
  "props": [ { "key": "title", "visible": true, "width": 280, "wrap": false, "frozen": false, "format": null } ],
  "filter": { "op": "and", "conds": [ { "prop": "status", "operator": "is_any_of", "value": ["doing"] },
                                       { "op": "or", "conds": [ … ] } ] },
  "sort":   [ { "prop": "prazo", "direction": "asc", "emptyFirst": false } ],
  "group":  { "prop": "status", "granularity": null, "order": "manual", "hideEmpty": false, "hidden": [], "collapsed": [], "showCounts": true },
  "subGroup": null,
  "calc":   { "custo": "sum" },
  "color":  { "by": "prioridade", "rules": [] },
  "openIn": "page",
  "newTemplate": null,
  "layout": { /* específico do tipo */ }
}
```

### 8.3 Compatibilidade e migração (na leitura, gravando só quando a pessoa editar)

| v1 (hoje) | v2 |
|---|---|
| `columns` / `cardProperties` / `visibleProperties` / `properties` | `props` (na ordem; `visible: true`) |
| `filters` (lista) + `filterOperator` / `filterMode` | `filter: { op, conds }` |
| `sort: [{property, direction}]` | `sort: [{prop, direction}]` |
| `groupBy` (quadro) | `group.prop` |
| `columnWidths` | `props[].width` |
| `summaries` | `calc` |
| `defaultView` (índice) | `defaultViewId` |
| view sem `id` | `id` gerado e gravado na primeira edição |
| `dateProperty` / `fallbackDateProperty` | `layout.date.start` / `layout.date.fallback` |
| `cardSize` / `coverProperty` | `layout.card.size` / `layout.card.coverProp` |

Regras: (1) **nunca descartar chave desconhecida** (vai para `extra` e volta no YAML — Bases escritas por outros editores/Obsidian sobrevivem); (2) o YAML de exibição segue o dialeto do Obsidian Bases onde houver equivalente (`filters`, `views`, `order`, `sort`) para manter interoperabilidade; (3) golden files no `test/` com Bases reais antigas.

### 8.4 YAML como visão de código

O editor "`<>`" continua: lê JSON v2 → mostra YAML; o parser mínimo atual (`bases-yaml.js`) é **estendido** (aninhamento de listas/objetos e escalares citados) ou substituído por um parser pequeno próprio — **decisão 11.3**. Erros de YAML mostram linha/coluna e **não** descartam a edição em andamento.

### 8.5 Ordem manual

Opção A (**recomendada**): lista de ids na view (`manualOrder: { "<groupKey>": [ids…] }`) — não suja as notas. Opção B: propriedade oculta `__ordem_<viewId>` em cada nota (cada arraste regrava N notas — ruim p/ sincronização). Ver 11.4.

---

## 9. Testes, desempenho, acessibilidade

### 9.1 Testes automatizados (`test/run.mjs`)

| Área | O que testar |
|---|---|
| Filtro | cada operador × cada tipo; grupos aninhados; datas relativas com **relógio e fuso injetados**; valores vazios |
| Ordenação | por tipo; empates estáveis; vazios; seleção/status pela ordem das opções |
| Agrupamento | multisseleção, datas por granularidade, faixas numéricas, "sem valor" |
| Agregação | todas do Apêndice C, incluindo vazios e mistura de tipos |
| Fórmulas | gramática, precedência, funções, erros, ciclos, tipos |
| Layout (puro) | semana (sobreposição, virada de dia, DST), timeline (escala→pixel), gráficos (ticks/empilhamento) |
| Migração | cada linha da tabela 8.3 + golden files |
| Config | ids únicos, duplicar, excluir, bloquear, trocar tipo (gaveta) |
| DOM leve | painel: abrir seção, mudar valor → objeto da view atualizado (jsdom não existe no projeto: testar a camada de dados e usar a checagem de **texto literal** já usada na suíte para presença dos módulos/`sw.js`) |

### 9.2 Validação manual (checklist por fase)

Claro e escuro · mobile e desktop · Base vazia / 1 nota / 2 000 notas · Base com propriedades faltando · reload mantém tudo · sincronização (Drive/pasta) sem conflito espúrio ao só **abrir** uma Base.

### 9.3 Orçamentos de desempenho

| Cenário | Meta |
|---|---|
| Abrir Base com 2 000 notas (tabela) | primeiro desenho < 300 ms; rolagem 60 fps (virtualizada) |
| Alterar filtro | < 100 ms até redesenhar |
| Semana com 200 eventos | arrastar a 60 fps (layout memoizado; só o evento arrastado re-renderiza) |
| Gráfico com 5 000 notas | agregação < 100 ms |
| Timeline com 500 barras | zoom < 150 ms |

### 9.4 Acessibilidade

Navegação por teclado completa (4.12) · contraste ≥ 55 de L (OKLCH) · não depender só de cor (ícone/textura nos status) · `prefers-reduced-motion` respeitado · leitores de tela: contagem e mudança de grupo anunciadas (`aria-live`).

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| **Escopo gigante** (o Notion tem anos de evolução) | prazo | fases com entrega visível; cortar por valor (ordem em 6); tudo atrás de config com *defaults* bons |
| **Fuso/horário de verão** no calendário e filtros | datas erradas | sempre data local; testes com relógio/fuso injetados; nunca `toISOString` p/ "dia" |
| **YAML mínimo** quebra com config rica | perda de config | JSON como fonte da verdade; YAML só de exibição; golden files |
| **Sincronização**: config grava a cada clique → muitas versões do `.md` | conflitos | gravar com *debounce* (300 ms) e só quando o objeto **muda de verdade** (comparação profunda) |
| **Desempenho** (tabelas grandes, semana, timeline, gráficos) | lentidão | engine puro memoizado; virtualização; limites por view; orçamentos (9.3) |
| **Colunas congeladas + virtualização** em tabela | bugs de CSS | duas entregas (5.1-e) |
| **Mapa offline** | mapa vazio | aviso + fundo neutro; lista continua |
| **Regressão em Bases existentes** | quebra de dados de quem usa | Fase 0 com golden files; nunca descartar chaves; migrar na leitura |
| **Editor emprestado** (peek) toca no núcleo do editor | perda de nota | reutilizar exatamente o mecanismo já testado (`lendEditorTo`/`returnLentEditor`); não ampliar |
| **Arquivos grandes** (regra do projeto) | monólito novo | estrutura da 3.2 (um tipo de view = um diretório de módulos pequenos) |

---

## 11. Decisões em aberto (perguntas para você)

1. **Prioridade:** começo pela **Fase 0 + Calendário de semana** (ver parte 6), ou prefere o **painel de configuração completo (Fase 1)** antes de qualquer view nova?
2. **Fórmulas:** vale o motor próprio estilo Notion (Fase 4, GG) ou um subconjunto menor (só `if`, aritmética, `concat`, datas)? Isso muda bastante o custo.
3. **Formato da config:** posso adotar **JSON como fonte da verdade** e manter YAML só como "visão de código", ou você precisa que o YAML continue sendo o formato primário (por usar a Base no Obsidian/editor de texto)?
4. **Ordem manual:** lista de ids **na view** (recomendado) ou propriedade por nota?
5. **Views vinculadas:** é importante já na primeira rodada (permite uma Base "dashboard" de outra) ou fica para a Fase 8?
6. **Linha do tempo com dependências:** precisa de **reagendamento automático** (empurrar sucessoras) ou setas já bastam?
7. **Mapa:** aceita depender de rede para os *tiles* (aviso quando offline) ou prefere deixar o Mapa fora?
8. **Feriados** no calendário (extra além do Notion): quer? Se sim, só Brasil ou configurável?
9. **Compartilhar views entre Bases** (copiar/colar uma view): útil ou desnecessário?
10. **Terminologia:** manter "Quadro (Kanban)", "Galeria", "Linha do tempo" ou usar os nomes do Notion em inglês?

---

## 12. Checklist de implementação

> Marque `[x]` conforme as fases forem entregues (mesmo padrão de `docs/PLANEJAMENTO-REFATORACAO-ARQUIVOS-GRANDES.md`).

| Fase | Entrega | Estado |
|---|---|:-:|
| 0 | Dívidas + ids + `props` + engine puro + migração v1→v2 + calendário usa `calendar-engine` | ⚪ |
| 1 | Painel de configuração + barra de views + filtro/ordenação/agrupamento/propriedades por UI | ⚪ |
| 2 | Calendário: mês/semana/dia/agenda + config + arrastar/redimensionar/criar + "sem data" | ⚪ |
| 3 | Tabela e Quadro profundos (+ Lista e Galeria) | ⚪ |
| 4 | Tipos de propriedade + fórmulas + relações/rollups | ⚪ |
| 5 | Linha do tempo | ⚪ |
| 6 | Gráficos | ⚪ |
| 7 | Mapa e Feed | ⚪ |
| 8 | Vinculadas, templates, lote, peek, exportar, dashboard | ⚪ |

---

## Apêndice A — Operadores de filtro por tipo

| Tipo | Operadores |
|---|---|
| **Texto / URL / e-mail / telefone** | é, não é, contém, não contém, começa com, termina com, está vazio, não está vazio |
| **Número** | `=`, `≠`, `>`, `≥`, `<`, `≤`, está vazio, não está vazio |
| **Caixa de seleção** | está marcado, não está marcado |
| **Seleção / Status** | é, não é, é qualquer um de, não é nenhum de, está vazio, não está vazio *(status: também "grupo é …")* |
| **Multisseleção / Lista / Tags** | contém, não contém, contém algum de, contém todos de, está vazio, não está vazio |
| **Data / Data e hora / Período** | é, antes, depois, em ou antes, em ou depois, **entre**, **relativo** (hoje, ontem, amanhã, esta/passada/próxima semana, este/passado/próximo mês, últimos/próximos N dias/semanas/meses), está vazio, não está vazio |
| **Pasta** | é, está dentro de (inclui subpastas), não está dentro de |
| **Tarefas (checklist)** | tem tarefas, % concluído `>`/`<`/`=`, todas concluídas |
| **Relação** | contém, não contém, está vazio, não está vazio |
| **Fórmula** | operadores do tipo do **resultado** |
| **Criado em / Editado em** | os de data |

## Apêndice B — Propriedades de sistema (sempre disponíveis)

`title` · `folder` (pasta) · `tags` · `createdAt` (criado em) · `updatedAt` (editado em) · `tasks` (progresso do checklist) · **novas:** `id` (ID único), `wordCount` (palavras), `hasCover`, `links` (qtde de links), `backlinks` (qtde de menções).

## Apêndice C — Agregações

| Tipo | Cálculos |
|---|---|
| **Qualquer** | contagem · preenchidos · vazios · únicos · % preenchidos · % vazios |
| **Número** | soma · média · **mediana** · mínimo · máximo · intervalo (máx−mín) |
| **Data** | mais antiga · mais recente · intervalo em dias |
| **Caixa de seleção** | marcados · não marcados · % marcados |
| **Seleção / Multisseleção / Status** | contagem por opção · **% por grupo de status** |
| **Tarefas** | total · concluídas · % |

## Apêndice D — Funções de fórmula (subconjunto-alvo)

| Categoria | Funções |
|---|---|
| **Lógica** | `if`, `ifs`, `and`, `or`, `not`, `empty`, `equal`, `unequal` |
| **Números** | `+ − * / % ^`, `abs`, `round`, `floor`, `ceil`, `min`, `max`, `sum`, `mean`, `median`, `pow`, `sqrt`, `log`, `exp`, `toNumber` |
| **Texto** | `concat`, `format`, `length`, `lower`, `upper`, `replace`, `replaceAll`, `contains`, `test` (regex segura), `slice`, `split`, `join`, `trim`, `repeat` |
| **Datas** | `now`, `today`, `dateAdd`, `dateSubtract`, `dateBetween`, `dateRange`, `formatDate`, `year`, `month`, `day`, `weekday`, `hour`, `minute`, `timestamp`, `fromTimestamp` |
| **Listas** | `length`, `at`, `first`, `last`, `slice`, `sort`, `reverse`, `includes`, `unique`, `map`, `filter`, `some`, `every`, `find` |
| **Propriedades** | `prop("nome")`, `id()`, `link`/relação: `prop("rel").map(current.prop("x"))` |

Regras: **sem `eval`**, sem acesso a DOM/rede; limite de passos e profundidade; erros viram valor `⚠ erro` com mensagem, nunca exceção; avaliação por nota com cache invalidado por mudança de dependências.

## Apêndice E — Glossário PT-BR dos termos do Notion

| Notion | QuickDock |
|---|---|
| Database / Data source | Base |
| View | Visão (view) |
| Board | Quadro (Kanban) |
| Timeline | Linha do tempo |
| Gallery | Galeria |
| Group by / Sub-group | Agrupar por / Sub-grupo |
| Sort / Filter | Ordenar / Filtrar |
| Property | Propriedade |
| Relation / Rollup | Relação / Rollup |
| Formula | Fórmula |
| Peek | Prévia lateral/central |
| Linked view | View vinculada |
| Template | Modelo |
