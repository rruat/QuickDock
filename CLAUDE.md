# QuickDock — regras de arquitetura

## Arquivos pequenos (regra permanente)

Este projeto está migrando de arquivos monolíticos para módulos pequenos e coesos. Isso vale tanto para código existente quanto para qualquer código novo, escrito por mim ou por qualquer agente de IA (Claude, Gemini, etc.).

**Por quê:** arquivos de milhares de linhas são difíceis de editar com segurança, difíceis de carregar por completo no contexto de uma IA, e aumentam muito a chance de conflito quando mais de um agente edita o mesmo diretório ao mesmo tempo (ver `feedback_concurrent_agents` na memória).

**Regra:** não há um teto numérico fixo de linhas. O gatilho é qualitativo — quando um arquivo começa a misturar mais de uma responsabilidade (ex.: renderização de UI + lógica de negócio + manipulação de eventos de tipos muito diferentes), é hora de particionar por responsabilidade antes de continuar adicionando código a ele.

**Como particionar, na prática:**
- Prefira dividir por *feature/responsabilidade* (ex.: `note-outline.js`, `note-block-menu.js`), não por *tipo técnico* (não crie `helpers.js`/`utils.js` genéricos que viram novo monólito).
- Se várias partes de um arquivo grande compartilham estado (variáveis de módulo, referências de DOM), extraia esse estado para um módulo próprio (`*-state.js`) com getters/setters explícitos, e faça os módulos derivados importarem dele — não duplique estado.
- Ao dividir um arquivo existente, faça isso incrementalmente (um bloco de responsabilidade por vez) e valide no navegador (a nota/quadro/view em questão) antes de seguir para o próximo bloco. Não é seguro fatiar um arquivo gigante inteiro num único passo sem testar.
- Arquivos gerados/estáticos (ex.: `brand/*.html`, cópias manuais como `index.html`/`404.html`/`sidepanel/index.html` — ver `project_board_open_note_bridge` na memória) não entram nessa regra; o problema ali é outro (duplicação manual, não tamanho).
- Quando duas partes já separadas em arquivos diferentes precisam uma da outra (ex.: um getter que só existe no arquivo que ainda não foi extraído), um import circular entre os dois módulos ES é aceitável *desde que* o valor importado só seja usado dentro do corpo de uma função (nunca no top-level do módulo) — nesse caso o ciclo é seguro porque function declarations são hoisted. Não reestruture tudo só pra evitar o ciclo; prefira isso a inventar um estado global cedo demais.
- **Checklist ao criar um módulo novo em `sidepanel/modules/`:** ele precisa entrar em `sw.js` (`ASSET_PATHS`) e o `CACHE_NAME` do `sw.js` precisa ser incrementado (ex.: `-3` → `-4`) — sem isso o Service Worker do PWA não pré-cacheia o arquivo novo e o app quebra offline em silêncio. Existe um teste em `test/run.mjs` (seção "pré-cache do PWA") que pega arquivo faltando na lista, mas não pega esquecer de bumpar o `CACHE_NAME`. Rode `node test/run.mjs` depois de qualquer divisão de arquivo — o projeto tem testes que checam texto literal dentro dos arquivos (`sourceX.includes('...')`), então mover código de um arquivo pra outro quebra esses testes até serem atualizados pra apontar pro arquivo novo.

## Status da divisão (mantido atualizado)

Arquivos de código acima de ~1000 linhas e seu status:

| Arquivo | Linhas (2026-09-28) | Status |
|---|---|---|
| `sidepanel/modules/note.js` | ~6700 (era ~7966) | 🟡 Fase 1 do split concluída (ver abaixo); ainda grande, Fase 2 planejada |
| `sidepanel/modules/notes-tabs.js` | ~2804 (era ~3568) | 🟡 Fase 1 do split concluída (ver abaixo); ainda grande, mais clusters planejados |
| `sidepanel/modules/board-engine.js` | ~2876 | 🟡 grande mas coeso (motor único do quadro); avaliar submódulos |
| `sidepanel/modules/json-view.js` | ~1576 | 🟡 avaliar |
| `sidepanel/modules/spatial-shell.js` | ~1512 | 🟡 em migração (ver memória `project_spatial_shell_broken`) |
| `sidepanel/modules/sync-engine.js` | ~1192 | 🟡 avaliar |

**note.js — Fase 1 (2026-09-28):** extraídos os clusters de baixo acoplamento pra `note-state.js`, `note-dom-utils.js`, `note-viewport.js`, `note-text-transforms.js`, `note-export-helpers.js`, `note-header.js`, `note-backlinks.js`, `note-outline.js` e `note-properties.js`. Ficam em `note.js`: modelo central de blocos, undo/redo, seleção de blocos, o listener gigante de `input`/`keydown`, menu slash, menu de bloco, autocomplete de link, paste, e a toolbar mobile — esses são mais acoplados entre si (muito estado de módulo compartilhado) e foram deixados pra uma Fase 2, pra não arriscar tudo de uma vez. Ver plano salvo em `C:\Users\Apis\.claude\plans\snoopy-crunching-tide.md` pro raciocínio completo de acoplamento por cluster.

**notes-tabs.js — Fase 1 (2026-09-28):** extraídos `notes-tutorial.js` (conteúdo + criação da nota-tutorial), `notes-appearance.js` (popover de ícone/cor, embutido no menu "⋯" da aba e usado por `note-header.js`) e `notes-template-mode.js` (edição de modelo emprestando o editor de blocos da nota). `notesMeta`/`activeId` continuam vivendo em `notes-tabs.js` como `let` module-level — expostos por `getNotesMeta()`/`setNotesMeta()`/`getActiveId()` (mesmo padrão de getter circular do note.js) em vez de virarem um `notes-state.js` de verdade, porque são lidos/escritos em dezenas de pontos espalhados pelo arquivo e mover a posse do estado exigiria tocar tudo isso de uma vez — risco alto demais pra uma fatia só. Ficam em `notes-tabs.js`: tira de abas + drag-and-drop, menu de contexto "⋯" da aba, árvore de pastas + CRUD, drawer da lista "☰", dashboard vazio, criar nota/menu "+"/importar, e o bootstrap/ativação de nota (o hub, chamado de quase todo canto) — candidatos a uma Fase 2 futura.

Atualize esta tabela sempre que um arquivo for particionado ou crescer para além do razoável.
