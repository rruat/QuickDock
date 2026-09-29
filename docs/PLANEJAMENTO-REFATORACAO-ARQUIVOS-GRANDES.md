# 📋 Planejamento de Refatoração Modular — Arquivos Grandes do QuickDock

> **Objetivo:** Particionar arquivos monolíticos e de grande porte em submódulos coesos, legíveis e com responsabilidade única, facilitando a manutenção e compreensão tanto para desenvolvedores humanos quanto para modelos de Inteligência Artificial.
> 
> **Regra de Ouro:** **Zero Regressão.** Nenhuma quebra de API pública e 100% dos testes automatizados (`node test/run.mjs` — 1.158 testes) devem continuar verdes após cada etapa.

---

## 🧭 Visão Geral do Progresso

| Fase | Foco | Arquivo Original | Linhas Iniciais | Estado Atual | Submódulos Planejados |
|---|---|---|---|---|---|
| **Fase 1** | Estilos CSS | `sidepanel/style.css` | 12.699 | ✅ **100% Concluído** | 24 módulos em `sidepanel/css/` |
| **Fase 2** | Motor de Notas | `sidepanel/modules/note.js` | 4.926 | 🟡 **Em Andamento (75%)** | 8 submódulos em `modules/note/` |
| **Fase 3** | Quadro Infinito | `sidepanel/modules/board-engine.js` | 2.876 | ✅ **100% Concluído** | 7 submódulos em `modules/board/` |
| **Fase 4** | Abas e Pastas | `sidepanel/modules/notes-tabs.js` | 2.597 | ✅ **100% Concluído** | 4 submódulos em `modules/tabs/` |
| **Fase 5** | Spatial Shell | `sidepanel/modules/spatial-shell.js` | 1.512 | ✅ **100% Concluído** | 4 submódulos em `modules/shell/` |
| **Fase 6** | Módulos Médios | `sync`, `json`, `graph`, `mobile`, `storage` | ~5.500 | ⚪ **Pendente** | Divisão pontual por funcionalidade |
| **Fase 7** | Estruturas HTML | `sidepanel/index.html`, `logo.html` | ~13.000 | ⚪ **Pendente** | Modularização de templates e SVGs |

---

## 📦 FASE 1: Modularização do CSS (Status: ✅ CONCLUÍDO)
- [x] Extrair 12.699 linhas do `sidepanel/style.css` em 24 módulos temáticos dentro de `sidepanel/css/`
- [x] Converter `sidepanel/style.css` em índice mestre de `@import` com ordem estrita de precedência em cascata
- [x] Ajustar test runner (`test/run.mjs`) para resolver `@import` recursivamente
- [x] Validar aprovação dos 1.158 testes unitários e de integração
- [x] Commit e sincronização remota no Git (`origin/main`)

---

## 📝 FASE 2: Motor Central de Notas (`sidepanel/modules/note.js`)
*Tamanho Original: 4.926 linhas | Meta: Reduzir para ~400 linhas de coordenação*

- [x] **Submódulo 2.1 — Histórico Undo/Redo:**
  - Arquivo: `sidepanel/modules/note/note-history.js` (115 linhas)
  - Conteúdo: `undoStack`, `redoStack`, `captureUndoPoint`, `performUndo`, `performRedo`, snapshots com debounce.
  - [x] Criado e validado
  - [x] Integrado e delegado em `note.js`

- [x] **Submódulo 2.2 — Tabelas e Planilhas:**
  - Arquivo: `sidepanel/modules/note/note-table.js` (190 linhas)
  - Conteúdo: Criação de células editáveis, botões de adicionar/excluir linhas e colunas, navegação por `Tab` e parser de planilhas coladas do Excel/TSV.
  - [x] Arquivo criado e sintaxe validada
  - [x] Ligar chamadas de delegação no `note.js`
  - [x] Validar testes automatizados (1158 verificações passaram)

- [x] **Submódulo 2.3 — Mídia, Imagens, Áudio e Vídeo:**
  - Arquivo: `sidepanel/modules/note/note-media.js` (240 linhas)
  - Conteúdo: Blobs sob demanda, URLs de objeto com revogação automática, redimensionamento interativo e ferramentas de mídia.
  - [x] Arquivo criado e sintaxe validada
  - [x] Ligar chamadas de delegação no `note.js`
  - [x] Validar testes automatizados (1158 verificações passaram)

- [x] **Submódulo 2.4 — Slash Menu (Menu "/"):**
  - Arquivo: `sidepanel/modules/note/note-slash-menu.js` (275 linhas)
  - Conteúdo: Grade em 3 colunas categorizada por grupos, filtros de digitação rápida e navegação 2D por teclado.
  - [x] Arquivo criado e sintaxe validada
  - [x] Ligar chamadas de delegação no `note.js`
  - [x] Validar testes automatizados (1158 verificações passaram)

- [x] **Submódulo 2.5 — Controles de Bloco e Drag & Drop:**
  - Arquivo: `sidepanel/modules/note/note-drag-drop.js` (734 linhas)
  - Conteúdo: Botões flutuantes `+` e `⠿`, clique na alça, arrastar para reordenar blocos, indicador visual de drop e seleção de múltiplos blocos com Ctrl+arrastar.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas de delegação no `note.js`
  - [x] Validar testes automatizados (1158 verificações passaram)

- [x] **Submódulo 2.6 — Obsidian Live Preview e Sintaxe Markdown:**
  - Arquivo: `sidepanel/modules/note/note-live-preview.js` (80 linhas)
  - Conteúdo: Mapeamento de sintaxe inline, delimitações, extração de prefixo residual e identificação de formatações ativas.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas de delegação no `note.js`
  - [x] Validar testes automatizados (1158 verificações passaram)

- [ ] **Submódulo 2.7 — Teclado e Eventos Principais:**
  - Arquivo: `sidepanel/modules/note/note-events.js` (~450 linhas)
  - Conteúdo: Comportamento de `Enter` e `Backspace` entre diferentes tipos de bloco, divisão de blocos e navegação de cursor.
  - [ ] Criar arquivo e extrair lógica
  - [ ] Ligar chamadas de delegação no `note.js`
  - [ ] Validar testes automatizados

- [ ] **Submódulo 2.8 — Ciclo de Vida e Salvamento:**
  - Arquivo: `sidepanel/modules/note/note-lifecycle.js` (~350 linhas)
  - Conteúdo: `switchToNote`, `loadNote`, `saveNote`, `scheduleSave`, `flushSave` e emissão de eventos globais.
  - [ ] Criar arquivo e extrair lógica
  - [ ] `note.js` atuando exclusivamente como fachada / index reexportador
  - [ ] Validar testes automatizados

---

## 🎨 FASE 3: Motor do Quadro Infinito (Status: ✅ CONCLUÍDO)
*Tamanho Original: 2.876 linhas | Tamanho Atual: 2.389 linhas (7 submódulos em board/)*

- [x] **Submódulo 3.1 — Alinhamento Inteligente (Snapping):**
  - Arquivo: `sidepanel/modules/board/board-snapping.js` (143 linhas)
  - Conteúdo: Guias magnéticas de alinhamento estilo Canva/Figma e feedback tátil.
  - [x] Criado e validado

- [x] **Submódulo 3.2 — Câmera e Coordenadas:**
  - Arquivo: `sidepanel/modules/board/board-camera.js` (53 linhas)
  - Conteúdo: Conversões Tela ↔ Mundo Canvas (`screenToWorld`, `worldToScreen`), zoom focal e `fitAll`.
  - [x] Criado e validado

- [x] **Submódulo 3.3 — Conexões e Setas SVG:**
  - Arquivo: `sidepanel/modules/board/board-arrows.js` (94 linhas)
  - Conteúdo: Cálculo geométrico de rotas (retas, curvas de Bézier cúbicas e Manhattan ortogonal).
  - [x] Criado e validado

- [x] **Submódulo 3.4 — Formas de Fluxograma:**
  - Arquivo: `sidepanel/modules/board/board-shapes.js` (48 linhas)
  - Conteúdo: Catálogo de formas (Decisão, Terminal, Dados, Documento, etc.) e gerador de SVG.
  - [x] Criado e validado

- [x] **Submódulo 3.5 — Cores dos Cartões:**
  - Arquivo: `sidepanel/modules/board/board-colors.js` (34 linhas)
  - Conteúdo: Paleta temática das 7 cores do arco-íris e suporte a cores personalizadas.
  - [x] Criado e validado

- [x] **Submódulo 3.6 — Gestão de Cartões (Cards Lifecycle):**
  - Arquivo: `sidepanel/modules/board/board-cards.js` (170 linhas)
  - Conteúdo: Operações em lote (alinhamento, bounds de grupo, aplicação de cores), toolbar de seleção e rótulos de handle.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `board-engine.js`
  - [x] Validar testes automatizados

- [x] **Submódulo 3.7 — Interações de Ponteiro e Teclado:**
  - Arquivo: `sidepanel/modules/board/board-interactions.js` (85 linhas)
  - Conteúdo: Pan com botão do meio/espaço, seleção por retângulo (marquee box) com intersecção AABB e listeners globais.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `board-engine.js`
  - [x] Validar testes automatizados

---

## 🗂️ FASE 4: Abas e Pastas Hierárquicas (`sidepanel/modules/notes-tabs.js`)
*Tamanho Original: 2.597 linhas | Meta: Reduzir para ~350 linhas*

- [x] **Submódulo 4.1 — Árvore de Pastas:**
  - Arquivo: `sidepanel/modules/tabs/notes-folders.js` (80 linhas)
  - Conteúdo: Estrutura em árvore de pastas/subpastas com contagem agregada.
  - [x] Criado e validado

- [x] **Submódulo 4.2 — Diálogos e Modais de Pasta:**
  - Arquivo: `sidepanel/modules/tabs/notes-folder-modals.js` (~350 linhas)
  - Conteúdo: Modais de criar pasta, renomear, mover nota para pasta e drag & drop na árvore.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `notes-tabs.js`
  - [x] Validar testes automatizados

- [x] **Submódulo 4.3 — Aside Drawer (Explorador Lateral):**
  - Arquivo: `sidepanel/modules/tabs/notes-drawer.js` (~650 linhas)
  - Conteúdo: Painel lateral de navegação de notas, busca inline e drawer permanente de desktop.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `notes-tabs.js`
  - [x] Validar testes automatizados

- [x] **Submódulo 4.4 — Menu de Contexto da Aba:**
  - Arquivo: `sidepanel/modules/tabs/notes-tab-menu.js` (~350 linhas)
  - Conteúdo: Menu "⋯" da aba (renomear, ícone, cor da aba, exportar, excluir).
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `notes-tabs.js`
  - [x] Validar testes automatizados

---

## 🖥️ FASE 5: Spatial Shell Workspace (Status: ✅ CONCLUÍDO)
*Tamanho Original: 1.512 linhas | Tamanho Atual: 833 linhas (redução de 45%)*

- [x] **Submódulo 5.1 — Catálogo de Views e Utilitários de Texto:**
  - Arquivo: `sidepanel/modules/shell/shell-views.js` (57 linhas)
  - Conteúdo: Catálogo das 9 views principais, normalização de texto e destaque de tokens.
  - [x] Criado e validado

- [x] **Submódulo 5.2 — Omnibar de Busca Universal (Ctrl + K):**
  - Arquivo: `sidepanel/modules/shell/shell-omnibar.js` (~350 linhas)
  - Conteúdo: Busca com ranking por relevância, autocomplete por `Tab`, histórico e ações imediatas.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `spatial-shell.js`
  - [x] Validar testes automatizados

- [x] **Submódulo 5.3 — Carrossel e Responsividade Mobile:**
  - Arquivo: `sidepanel/modules/shell/shell-mobile.js` (356 linhas)
  - Conteúdo: Transição horizontal de cards, gestos de toque unidirecional, haptic feedback e carrossel mobile.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `spatial-shell.js`
  - [x] Validar testes automatizados

- [x] **Submódulo 5.4 — Layout em Mosaico e Divisórias:**
  - Arquivo: `sidepanel/modules/shell/shell-mosaic.js` (114 linhas)
  - Conteúdo: Modos lado a lado e empilhado, redimensionamento com divisórias de 3 pontos, reordenação física de tiles e botões de navegação.
  - [x] Criar arquivo e extrair lógica
  - [x] Ligar chamadas no `spatial-shell.js`
  - [x] Validar testes automatizados

---

## ⚙️ FASE 6: Arquivos Médios (~1.000 linhas)
*Refatorações cirúrgicas após a conclusão dos grandes monólitos.*

- [ ] **`sidepanel/modules/sync-engine.js` (1.192 linhas):**
  - Separar em: `sync-diff.js` (algoritmo de merge e conflitos), `sync-drive.js` (Google Drive) e `sync-local.js` (File System).
- [ ] **`sidepanel/modules/json-view.js` (1.188 linhas):**
  - Separar em: `json-tree.js` (renderizador da árvore interativa) e `json-code-editor.js` (editor manual com numeração de linha).
- [ ] **`sidepanel/modules/graph-view.js` (1.117 linhas):**
  - Separar em: `graph-physics.js` (forças de atração/repulsão e critério de parada) e `graph-canvas.js` (renderizador visual e tooltips).
- [ ] **`sidepanel/modules/note-mobile-toolbar.js` (1.061 linhas):**
  - Separar as bottom sheets de seleção de bloco, cores e modelos em arquivos menores.
- [ ] **`sidepanel/modules/storage.js` (1.033 linhas):**
  - Separar os esquemas de migração do Dexie e queries específicas por entidade (`storage-notes.js`, `storage-files.js`, `storage-links.js`).

---

## 🌐 FASE 7: Modularização das Estruturas HTML
- [ ] **`sidepanel/index.html` (1.127 linhas):**
  - Isolar modais e popovers flutuantes em componentes `<template id="...">` importados sob demanda via JavaScript.
- [ ] **`index.html` e `404.html` (1.161 linhas cada):**
  - Manter paridade com as alterações de templates do `sidepanel/index.html`.
- [ ] **`brand/quickdock-logo.html` (11.009 linhas):**
  - Mover coordenadas pesadas de SVGs e matrizes de logo para arquivos `.svg` ou `.json` estáticos dedicados na pasta `brand/`.

---

## 🎯 Critérios de Conclusão ("Definition of Done")
Para cada módulo refatorado:
1. **Sem erros de sintaxe:** Verificado via `node --check <caminho>`.
2. **Suite de testes verde:** `node test/run.mjs` com **1.158 testes passando**.
3. **Sem regressão visual ou funcional:** App carrega limpo no Chrome sem erros no console.
4. **Git commit atômico:** Mensagem de commit padronizada indicando a extração exata realizada.
