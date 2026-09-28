// Nota-tutorial: conteúdo e criação da nota de boas-vindas.
import { createNoteRecord } from './storage.js';
import { flushSave } from './note.js';
import { parseMarkdownToBlocks, blocksToMarkdown } from './blocks.js';
import { getNotesMeta, activateNote, renderTabs, scrollTabIntoView } from './notes-tabs.js';

// ── Nota-tutorial ──────────────────────────────────────────────────────────
// Texto em markdown puro — vira blocos de verdade (títulos, listas, citação,
// checklist, divisores, negrito/itálico/riscado) pelo mesmo parser usado na
// importação de arquivo .md. Sem crase nenhuma aqui de propósito: qualquer
// crase no meio do texto seria interpretada como código em linha pelo
// próprio parser, então os exemplos de sintaxe são descritos por extenso.
const TUTORIAL_MARKDOWN = `# Bem-vindo ao QuickDock 👋

Esta nota foi criada automaticamente pra te mostrar como usar cada parte do QuickDock. Pode editar ou apagar à vontade — sempre que quiser vê-la de novo, abra o menu ⋯ no fim da barra de abas e escolha "Ver tutorial".

## Formatação de texto

- Colocar **duplo asterisco** dos dois lados vira **negrito**
- Colocar *um asterisco* de cada lado vira *itálico*
- Colocar ~~til duplo~~ dos dois lados vira ~~riscado~~
- Colocar o texto entre um par de crases vira código em linha

Tudo junto, numa linha de verdade:

**Protocolo 88123** — reembolso *em análise*, prazo ~~15/09~~ 22/09.

## Links

Ctrl+K abre o menu de link, com dois campos: **Texto** (o que aparece na nota) e **Endereço**. Com texto selecionado, ele já vem preenchido e o cursor cai direto no endereço. Sem nada selecionado, dá pra escrever os dois e o link nasce ali.

Com o cursor dentro de um link que já existe, Ctrl+K reabre o menu com os dois campos preenchidos — dá pra trocar só a palavra, só o endereço, ou remover o link.

Colar uma URL também funciona: sem nada selecionado ela entra como link, e com texto selecionado o endereço envolve a seleção.

Pra abrir um link, segure Ctrl e clique — o mesmo gesto da detecção inteligente. Clique normal só posiciona o cursor, senão não daria pra editar o texto. Experimente neste: [catálogo de ícones do Google](https://fonts.google.com/icons)

Na prática, serve pra deixar o caminho de volta salvo junto do caso: o portal da operadora, o formulário que você sempre preenche, a consulta do protocolo.

Digitar também funciona: escreva o texto entre colchetes seguido do endereço entre parênteses e, ao fechar o parêntese, vira link sozinho.

### Pular para um título da própria nota

No lugar do endereço, use cerquilha e o nome do título em minúsculas com hífen no lugar dos espaços. Ctrl+clique rola até lá e o título pisca por um instante, pra você ver onde parou.

Numa nota longa de atendimento, isso vira um índice no topo: um link por seção, e você desce direto pra que interessa.

Acento e pontuação do título não atrapalham — "Validações do Protocolo" é alcançado por "validacoes-do-protocolo". Se houver dois títulos com o mesmo nome, o segundo ganha um "-1" no fim.

## Indentação

Tab indenta o bloco e Shift+Tab desindenta — até cinco níveis, que é o que cabe num painel estreito. Vale pra qualquer bloco, não só lista: parágrafo, título e até tabela.

- Fruta
  - Maçã
    - Fuji
  - Pera
- Legume

Repare em três coisas: o marcador muda a cada nível, a lista numerada recomeça a contagem dentro de cada nível, e indentar um item leva os itens de dentro dele junto.

1. Abrir o protocolo
  1. Anexar o relatório
  2. Conferir o prazo
2. Registrar o retorno

Pra sair de um nível sem usar Shift+Tab: Enter numa linha vazia ou Backspace no começo da linha.

## Tipos de bloco

Digite uma barra "/" no começo de uma linha vazia pra abrir o menu e escolher o tipo de bloco. Ou use os atalhos abaixo, digitando o símbolo seguido de espaço no início da linha:

- Cerquilha (#), repetida até seis vezes, + espaço → Título 1 a Título 6
- Hífen ou asterisco + espaço → lista com marcadores
- "1." + espaço → lista numerada
- Colchetes "[]" (sem hífen na frente) + espaço → checklist
- Maior-que (>) + espaço → citação
- Colchete, exclamação, o tipo e colchete + espaço → destaque colorido
- Três hífens sozinhos na linha → divisor
- Três crases sozinhas na linha → bloco de código

O menu do "/" mostra os tipos numa grade de ícones, separados por grupo — Texto, Listas, Destaques, Blocos e os seus modelos. É onde estão as coisas que não têm atalho de teclado, como Tabela, Imagem e Cálculo. Setas pra andar (esquerda e direita de um em um, cima e baixo de linha em linha), Enter pra confirmar. Digitar depois da barra filtra.

### Título sublinhado

Título 1 e Título 2 podem ganhar um traço embaixo. Abra o menu da alça com o cursor no título e escolha "Sublinhar título".

Isso não é um tipo de bloco novo, é uma marca — e no arquivo vira a forma original do markdown de escrever título, com o traço na linha de baixo. Ou seja: dá a volta inteira e abre certo em qualquer editor.

### Exemplos ao vivo

Citação — boa pra guardar a fala de alguém sem misturar com a sua anotação:

> A beneficiária afirma que enviou a documentação em 02/09. Conferir no protocolo antes de responder.

A citação não é um tipo de bloco e sim uma marca: qualquer bloco pode ser citado e continua sendo o que era. Por isso título, lista e checklist funcionam dentro dela:

> #### Retorno da operadora
>
> - Protocolo aceito
> - Prazo de 5 dias úteis
>
> - [ ] Conferir no dia 22

Pra tirar a citação: Backspace no começo da linha, ou o botão de aspas na barra que aparece ao selecionar texto.

### Destaques

Aquela caixa colorida de aviso que todo manual tem. São cinco tipos, cada um com sua cor:

> [!NOTE]
> Um recado que a pessoa precisa ler, sem urgência nenhuma.

> [!TIP]
> Um atalho que economiza tempo.

> [!IMPORTANT]
> Algo que muda o resultado se for ignorado.

> [!WARNING]
> Um cuidado a tomar antes de seguir.

> [!CAUTION]
> Um risco de verdade — dá pra perder trabalho aqui.

Pra criar: digite "/" e procure por Destaque, ou escreva o marcador direto no início da linha — colchete, exclamação, o nome do tipo em inglês, colchete e espaço. O rótulo colorido aparece sozinho; ele não é texto da nota, então não dá pra apagar sem querer.

O destaque é uma citação com um marcador — por isso tudo que funciona dentro de uma citação funciona dentro dele, e a caixa cresce conforme você aperta Enter:

> [!WARNING]
> **Antes de enviar o protocolo**
>
> - [ ] CPF confere com o do titular
> - [ ] Documentação dentro da validade

Isso é markdown de verdade, o mesmo que o GitHub usa. Baixe a nota como .md, abra lá, e a caixa aparece colorida do mesmo jeito.

Checklist — clique nas caixas, elas ficam marcadas:

- [x] Solicitar segunda via do boleto
- [ ] Conferir elegibilidade no portal
- [ ] Retornar a ligação

Checklist aninhada conversa entre si: marcar um item marca tudo que está dentro dele, e completar os itens de dentro completa o de fora. Enquanto só uma parte está feita, o item de fora mostra um tracinho em vez do visto. Experimente marcar os dois itens de dentro:

- [ ] Documentação do beneficiário
  - [ ] Documento com foto
  - [ ] Comprovante de residência
- [ ] Enviar para análise

Lista numerada — pro passo a passo de um procedimento:

1. Abrir o protocolo no portal da operadora
2. Anexar o relatório do mês
3. Registrar o número de retorno nesta nota

---

## Tabelas

Digite "/" e escolha Tabela pra inserir uma. A primeira linha é sempre o cabeçalho.

| Beneficiário | CPF | Status |
| --- | --- | --- |
| Ana Souza | 111.444.777-35 | Ativo |
| João Lima | 11.222.333/0001-81 | Pendente |

- Tab pula pra próxima célula e Shift+Tab volta. Tab na última célula cria uma linha nova.
- Com o cursor dentro da tabela aparece uma barra com "+ linha", "+ coluna", "− linha" e "− coluna" — as ações valem pra linha e a coluna onde o cursor está.
- Enter dentro de uma célula quebra linha ali dentro, sem sair da tabela.
- Em painel estreito a tabela rola na horizontal em vez de espremer as colunas.
- A detecção inteligente (CPF, data, cálculo) ainda não roda dentro das células — por isso os números da tabela acima não ficam sublinhados.

### Colar do Excel ou do Google Sheets

Selecione as células lá, copie, e cole aqui: vira uma tabela de verdade, com as colunas separadas. Vale pro Excel, pro Google Sheets e pra qualquer coisa que copie em colunas separadas por tabulação.

Na prática: recorte do relatório só as linhas que interessam ao caso e cole aqui, em vez de deixar a planilha inteira aberta numa aba ao lado.

---

## Cálculo

Digite "/" e escolha Cálculo pra abrir uma folha de conta. Cada linha calcula sozinha e mostra o resultado ao lado, enquanto você digita.

\`\`\`calc
boleto = R$ 1.000,00
imposto = 15%
calculo = boleto - imposto
\`\`\`

Passe o mouse no resultado à direita e clique: ele vai pra área de transferência. Serve pra jogar o valor direto num formulário ou numa conversa sem ter que selecionar o número na mão. Linha de texto e linha com erro não ficam clicáveis, porque não têm o que copiar.

Repare no que acontece ali: **porcentagem é sempre relativa ao valor da esquerda**. "boleto menos imposto" tira 15% de mil e dá R$ 850,00 — não subtrai quinze centavos.

O "R$" é pra valer: ele acompanha a conta e volta formatado no fim. Some com número puro, multiplique, divida — o resultado continua em reais. Só dividir dinheiro por dinheiro vira número, porque aí é uma razão.

- Escrever "let" na frente é opcional: "boleto = 1000" funciona igual
- Uma linha que não é conta fica lá como texto, sem resultado e sem reclamação. Serve pra anotar no meio da folha
- Começar com duas barras também é comentário
- Enter numa linha vazia sai da folha, como numa lista

### Somar uma coluna

A palavra "acima" vale por tudo que está logo em cima, até a primeira linha sem valor:

\`\`\`calc
R$ 480,00
R$ 120,50
R$ 89,90
total = acima
\`\`\`

Também existem soma, média e arredondar. Os argumentos vão separados por ponto e vírgula, porque a vírgula aqui é decimal: soma(10; 20; 30).

### O resultado não fica guardado

O que a nota grava é só a conta — o valor é recalculado toda vez que a folha aparece. Guardar o número criaria a chance de ele discordar da conta, e não haveria como saber qual dos dois está certo.

Na hora de baixar a nota ou copiar como texto, aí sim o resultado vai junto, ao lado de cada linha. Quem recebe vê os valores sem precisar do QuickDock.

---

## Imagens

Três jeitos de colocar uma imagem dentro da nota:

- Cole com Ctrl+V depois de clicar na nota — um print recém-tirado entra direto. O que decide o destino é onde você clicou por último: clicou na nota, a imagem entra no texto; clicou na seção Documentos, ela vai pra lá.
- Arraste o arquivo de imagem pra dentro do editor
- Digite "/" e escolha Imagem

Passe o mouse na imagem pra ver a barra de botões:

- **Mover p/ Documentos** — tira a imagem do meio do texto e guarda na seção de baixo, vinculada a esta nota. Serve pra quando o arquivo importa mas não precisa ocupar espaço na leitura.
- **Trocar** — troca por outro arquivo, mantendo o lugar dela na nota.
- **Texto** — a descrição da imagem. Serve pra quem usa leitor de tela e é o que aparece caso o arquivo se perca.
- **Remover** — tira a imagem da nota.

Clique na imagem pra abrir o visualizador, com zoom, girar e setas pra passar pelas outras imagens da nota.

A imagem é guardada como arquivo de verdade, não embutida no texto da nota. Isso é o que mantém a nota leve por mais prints que ela tenha. Quando você baixa a nota como .md, aí sim ela vai embutida — o arquivo abre em qualquer editor, com as imagens dentro.

Imagem colada na nota não aparece na seção Documentos: ela já está visível aqui. E imagem com endereço da internet não é exibida de propósito — abrir a nota avisaria o site de onde ela veio que você abriu, e quando. Nesses casos o endereço vira um link, e você decide se quer abrir.

---

## Controles de cada bloco

Passe o mouse na margem esquerda de qualquer bloco (inclusive este) pra ver dois ícones aparecerem:

- O símbolo "+" adiciona um bloco novo logo abaixo. Segure Ctrl e clique nele pra adicionar acima.
- A alça de arrastar (os pontinhos): clique nela pra abrir o menu do bloco, ou arraste pra reordenar sem perder a formatação.
- No topo do menu fica uma fileira de ícones com o que mais se usa: copiar como texto, copiar imagem, duplicar e excluir. Ela não sai do lugar enquanto você rola o resto do menu.
- Pra mexer em vários blocos de uma vez: selecione por cima deles arrastando o texto normalmente, sem tecla nenhuma. Os blocos inteiros ficam marcados, e a partir daí a alça de qualquer um deles move o grupo todo — e o menu da alça passa a valer pros três ("Transformar em (3 blocos)").
- Ctrl e arrastar também seleciona, a partir de qualquer ponto do bloco. Serve pros casos em que não há texto pra arrastar por cima, como um bloco de imagem sozinho.

### Mandar um pedaço da nota como imagem

No menu da alça tem "Copiar imagem" e "Baixar imagem (.png)". Vale pro bloco sozinho ou pro grupo selecionado, e serve pra mandar um trecho num aplicativo de conversa sem ter que explicar o que é markdown.

A imagem sai exatamente como está na tela — com as cores da nota, os destaques e as checklists —, mas sem nada que seja controle: sem o realce de seleção, sem os ícones da margem e sem a barra de botões da tabela. E com a mesma margem do editor em volta, pra que o texto não fique colado na borda.
- Ctrl+Z desfaz e Ctrl+Shift+Z refaz — inclusive troca de tipo de bloco.

Experimente agora nesta linha: passe o mouse na margem, clique na alça, escolha "Transformar em" e depois "Citação". Ctrl+Z traz de volta.

## Detecção inteligente (a parte de "cálculo")

Segure Ctrl e clique em cima de qualquer valor sublinhado abaixo pra ver um menu com opções de cópia (ou o cálculo, no último caso):

- CPF: 111.444.777-35
- CNPJ: 11.222.333/0001-81
- CEP: 01310-100
- Telefone: (11) 98765-4321
- E-mail: contato@quickdock.com
- Data: 25/12/2026
- Cálculo: 150 + 25 * 2 - 10%

No cálculo, o menu mostra o passo a passo e o resultado, com um botão pra copiar. CPF e CNPJ também mostram se o número é válido.

Na prática, é o que evita redigitar: cole o CPF do beneficiário na nota, Ctrl+clique e copie já sem pontuação direto pro campo do sistema. O cálculo confere um repasse sem abrir a calculadora, e a data já traz a idade calculada junto, pronta pra copiar.

---

## Várias notas

- As abas da nota ficam no topo desta seção. Clique no ☰ pra ver a lista completa (útil quando há muitas abas abertas).
- O botão ＋ abre um menu: nota em branco, importar um .md ou .txt, criar a partir de um modelo, e gerenciar os modelos.
- Dê um duplo clique numa aba pra abrir o menu dela: Renomear, Ícone e cor, Copiar como Markdown, Copiar como texto, Baixar .md, Baixar .txt, Limpar conteúdo e Excluir. Pela lista do ☰ o mesmo menu abre no botão de editar de cada linha.
- "Limpar conteúdo" esvazia só o texto daquela nota — o nome, a cor e os documentos dela continuam onde estão. "Excluir" some com a nota inteira.
- Em "Ícone e cor" dá pra escolher um ícone comum ou digitar o nome de qualquer ícone do catálogo do Google Fonts e clicar no botão ao lado do campo pra aplicar. Também dá pra alternar entre contorno e preenchido e escolher a cor — a última bolinha, com arco-íris, abre o seletor de cor livre.

Uma forma de organizar: uma nota por cliente, por caso ou por dia. Dê nome, cor e ícone a cada aba e ela fica reconhecível de relance mesmo com dez abertas. Se o espaço apertar, marque "Ocultar nome na aba" nas que já têm ícone — a aba encolhe pro ícone colorido e cabe muito mais coisa na barra.

### Backup de tudo

No menu ⋯ tem "Baixar todas as notas": gera um arquivo só, com todas as notas dentro e as imagens embutidas. Fora daqui ele é um markdown comum, que abre em qualquer editor.

Pra restaurar, use Importar e escolha esse arquivo — o QuickDock reconhece que é um backup e recria as notas separadas, uma a uma, com os nomes originais. Restaurar sempre adiciona notas novas: nada do que já existe é alterado, então importar um backup antigo por engano não apaga o trabalho de hoje.

## Modelos

Quando a mesma sequência de conferências se repete todo dia, vale virar modelo. Existem dois tipos, e a diferença é só o tamanho do que eles trazem.

### Modelo de nota — cria a nota inteira

No menu do ＋ aparece a seção "A partir de um modelo": clicar num deles já cria a nota com a estrutura montada, checkbox por checkbox.

Já vem um de exemplo chamado **Atendimento**, com campos de identificação, uma lista de validações e outra de ações. Abra o ＋ e crie uma nota com ele pra ver como fica.

### Modelo de bloco — entra no meio da nota

Esse não cria nota nenhuma: insere um pedaço onde o cursor está. Duas formas de chamar:

- Digite "/" numa linha vazia e comece a escrever o nome do modelo — ele aparece na lista junto com os tipos de bloco, marcado como "modelo".
- Ou abra o menu da alça do bloco: os modelos ficam na seção "Inserir modelo", logo abaixo de "Transformar em".

Numa linha vazia o modelo ocupa o lugar dela; com texto na linha, ele entra logo abaixo.

Vem um de exemplo chamado **Conferência** — um subtítulo, três checkboxes e o campo de quem conferiu.

Pra criar o seu: selecione os blocos que quer guardar (basta arrastar por cima deles), abra o menu da alça e escolha "Salvar como modelo de bloco". Aparece um campo com um nome sugerido a partir da primeira linha — confirme e pronto. Você continua na nota, no mesmo lugar: salvar um modelo não mexe no que está escrito.

### Criar e editar um modelo

Você não escreve modelo em lugar nenhum diferente: **o modelo abre no editor normal**, este mesmo. Checkbox clicável, menu "/", tabela, negrito — tudo igual a editar uma nota, porque é o mesmo editor.

O que muda é uma barra azul que aparece no topo, com a etiqueta **MODELO**. Nela ficam o nome, o tipo e os botões Salvar e Cancelar.

Três formas de chegar lá, todas no menu do ＋ → "Gerenciar modelos…":

- No ✎ de um modelo que já existe (passe o mouse na linha pra ver os botões).
- Em "Criar modelo do zero", pra começar em branco.
- Em "Salvar a nota atual como modelo", que leva o conteúdo da nota aberta pro modelo novo.

O **tipo** na barra converte um modelo de nota em modelo de bloco e vice-versa — serve quando a importação entrou no tipo errado.

Duas coisas pra não tomar susto: enquanto um modelo está aberto **não existe salvamento automático**, ele só grava no botão Salvar. E **trocar de aba sai sem salvar**, como se você tivesse clicado em Cancelar.

### Compartilhar

O modelo é markdown puro, o mesmo formato da exportação. Então compartilhar é só isso:

- **↓** baixa o modelo como .md — mande o arquivo pro colega.
- Quem recebe usa **"Importar como modelo de nota"** ou **"...de bloco"**. São dois botões porque o .md sozinho não diz qual dos dois ele é.
- **✕** exclui.

Na prática: se todo pedido de reembolso passa pelas mesmas seis conferências, faça uma nota com elas e salve como modelo de nota "Reembolso". Já um trecho que você cola no meio de qualquer atendimento — o bloco de conferência, o de encerramento — vale guardar como modelo de bloco, pra chamar com "/" sem sair da nota.

## Documentos

Na parte de baixo do painel dá pra guardar arquivos e imagens:

- Clique no ＋ da seção Documentos, arraste arquivos pra dentro da área, ou cole uma imagem direto com Ctrl+V.
- Clique em uma imagem pra abrir o visualizador — zoom, girar, navegar entre várias com as setas.
- Selecione vários arquivos pra injetar direto na página que você está usando ou apagar em lote.

### Documento de uma nota ou de todas

Todo arquivo novo entra vinculado à nota aberta. O alfinete no canto do arquivo alterna entre duas situações:

- **Vinculado** (alfinete azul, sempre visível): aparece só nesta nota.
- **Geral** (alfinete some quando o mouse sai): aparece em todas as notas. Bom pra modelo, logo, formulário em branco — coisas que você usa o tempo todo.

No cabeçalho da seção, "Nesta nota" mostra os desta nota mais os gerais, e "Todos" mostra o acervo inteiro, com os de outras notas em tom apagado. Sempre que o filtro esconder alguma coisa, aparece um rodapé dizendo quantos arquivos ficaram de fora, com um clique pra ver todos — nenhum arquivo some sem aviso.

Pra mover vários de uma vez, selecione e use "📌 Vincular" ou "📌 Tornar geral" na barra azul.

Excluir uma nota **não apaga** os arquivos dela: eles viram gerais.

Na prática: abra a nota do caso e arraste pra dentro o PDF da carteirinha e o print do protocolo — eles ficam vinculados àquela nota e somem da vista quando você troca de aba. Já o modelo de e-mail que você usa em todo atendimento vale deixar geral, pra ter à mão em qualquer nota.

## Sincronização

Suas notas não precisam ficar presas neste computador. O botão 🔄 na barra de abas (ou no menu ⋯) permite salvar suas notas como arquivos normais de texto numa pasta à sua escolha.

- **A pasta é sua:** você escolhe onde ela fica no computador. Pode ser uma pasta do OneDrive, Dropbox, Google Drive ou Syncthing — você continua sendo o dono dos seus dados, sem servidor nem banco nosso no caminho.
- **Formato aberto:** cada nota vira um arquivo de texto (.md) na pasta \`notas/\`, seus modelos vão para \`modelos/\` e as imagens para \`imagens/\`. Dá pra abrir suas notas no Obsidian, VS Code ou no bloco de notas do celular.
- **Edição em dois aparelhos:** se você editar a mesma nota em dois computadores diferentes ao mesmo tempo, nada é apagado nem sobrescrito. O QuickDock mantém as duas edições e cria uma cópia com a data e o nome do aparelho — é a chamada "cópia de conflito". Um aviso discreto no botão te avisa para você comparar as duas versões com calma e apagar a cópia quando quiser.

---

Pronto — isso cobre praticamente tudo. Bom uso 🚀`;

function buildTutorialNoteFields() {
  const blocks  = parseMarkdownToBlocks(TUTORIAL_MARKDOWN);
  const content = blocksToMarkdown(blocks);
  return { title: 'Tutorial', content, blocks, icon: 'school', color: '#3b82f6' };
}

export async function createTutorialNote() {
  await flushSave();
  const fields = buildTutorialNoteFields();
  const id = await createNoteRecord(fields);
  getNotesMeta().push({ id, title: fields.title, color: fields.color, icon: fields.icon, updatedAt: Date.now() });
  await activateNote(id);
  renderTabs();
  scrollTabIntoView(id);
}
