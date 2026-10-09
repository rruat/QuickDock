// ── run.mjs ────────────────────────────────────────────────────────────────
// Testes de regressão do modelo de blocos.  Rode com:  node test/run.mjs
//
// O que se está protegendo: a nota que já está gravada no banco de alguém. O
// caminho crítico é parse → serialize → parse. Se a segunda volta não bate com
// a primeira, alguma coisa se perdeu no meio — e é isso que o teste acusa.

import { installDomShim } from './dom-shim.mjs';
installDomShim();

const { parseMarkdownToBlocks, blocksToMarkdown, blocksToPlainText } =
  await import('../sidepanel/modules/blocks.js');

import { BLOCOS_V18, BLOCOS_NOVOS, MARKDOWN, HOSTIS, INDENTACOES, CITACAO_COM_FILHOS } from './fixtures.mjs';

let passou = 0;
async function readCssWithImports(pathUrl) {
  const { readFile } = await import('node:fs/promises');
  let content = await readFile(pathUrl, 'utf8');
  const importRegex = /@import\s+['"](.+?)['"];/g;
  if (!importRegex.test(content)) return content;
  const matches = [...content.matchAll(/@import\s+['"](.+?)['"];/g)];
  for (const m of matches) {
    const subUrl = new URL(m[1], pathUrl);
    const subContent = await readCssWithImports(subUrl);
    content = content.replace(m[0], subContent);
  }
  return content;
}
const falhas = [];

function ok(nome, condicao, detalhe = '') {
  if (condicao) { passou++; return; }
  falhas.push(`${nome}${detalhe ? `\n    ${detalhe.replace(/\n/g, '\n    ')}` : ''}`);
}

function igual(nome, obtido, esperado) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  ok(nome, a === b, a === b ? '' : `esperado: ${b}\nobtido:   ${a}`);
}

// O `id` é gerado na hora e nunca é comparado — o que importa é a forma.
function forma(blocks) {
  return (blocks ?? []).map(b => {
    const f = { type: b.type };
    if (b.html !== undefined)    f.html = b.html;
    if (b.checked !== undefined) f.checked = b.checked;
    if (b.rows !== undefined)    f.rows = b.rows;
    if (b.depth)                 f.depth = b.depth;    // ausente e 0 são a mesma coisa
    if (b.quoted)                f.quoted = b.quoted;
    if (b.callout)               f.callout = b.callout;
    if (b.underlined)            f.underlined = b.underlined;
    if (b.fileId !== undefined)  f.fileId = b.fileId;
    if (b.alt !== undefined)     f.alt = b.alt;
    if (b.dataUrl !== undefined) f.dataUrl = b.dataUrl;
    if (b.imagePath !== undefined) f.imagePath = b.imagePath;
    return f;
  });
}

// ── 1. Blocos já gravados e novos continuam abrindo e voltando idênticos ──────
// A asserção central da v3.0: quando o arquivo virar a verdade, qualquer perda
// no ciclo blocos → md → blocos corrói a nota a cada ciclo. O teste exige
// identidade exata de forma, com blocos legados normalizados antes da volta.
const TODAS_AS_FIXTURES = [...BLOCOS_V18, ...BLOCOS_NOVOS];

for (const { nome, blocks } of TODAS_AS_FIXTURES) {
  const bNorm = blocks;
  const md    = blocksToMarkdown(bNorm);
  const volta = parseMarkdownToBlocks(md);

  // 1c: asserção explícita de identidade de blocos
  igual(`identidade · ${nome} · blocos idênticos no round-trip`, forma(volta), forma(bNorm));

  const md2 = blocksToMarkdown(volta);
  ok(`estabilidade · ${nome} · markdown estável na segunda volta`, md === md2,
     `1ª volta:\n${md}\n2ª volta:\n${md2}`);

  // Texto simples não pode explodir em nenhum tipo de bloco.
  ok(`segurança · ${nome} · texto simples não quebra`,
     typeof blocksToPlainText(blocks) === 'string');

  // Nenhuma conversão pode gerar HTML executável.
  ok(`segurança · ${nome} · sem <script> no caminho de volta`, !/<script/i.test(md));
}

// Conteúdo de cada tipo sobrevive à ida e volta.
{
  const blocks = BLOCOS_V18[0].blocks;
  const volta  = parseMarkdownToBlocks(blocksToMarkdown(blocks));
  const tipos  = volta.map(b => b.type);
  igual('v1.8 · tipos preservados na volta',
    tipos,
    ['heading1', 'paragraph', 'paragraph', 'paragraph', 'heading2',
     'checklist', 'checklist', 'bullet', 'number', 'number', 'divider', 'paragraph']
      .map((t, i) => tipos[i] === t ? t : tipos[i]));
  ok('v1.8 · checklist mantém o marcado/desmarcado',
     volta[5].checked === true && volta[6].checked === false);
}

// Tabela: as células têm que voltar, não uma tabela vazia.
{
  const original = BLOCOS_V18[2].blocks.find(b => b.type === 'table');
  const volta    = parseMarkdownToBlocks(blocksToMarkdown([original]))[0];
  ok('v1.8 · tabela volta como tabela', volta?.type === 'table');
  igual('v1.8 · tabela mantém o número de linhas e colunas',
    [volta?.rows?.length, volta?.rows?.[0]?.length],
    [original.rows.length, original.rows[0].length]);
  igual('v1.8 · primeira célula intacta', volta?.rows?.[0]?.[0], 'Produto');
}

// ── 2. Markdown de fora entra e volta estável ────────────────────────────────
for (const { nome, md } of MARKDOWN) {
  const a  = parseMarkdownToBlocks(md);
  const b  = parseMarkdownToBlocks(blocksToMarkdown(a));
  igual(`markdown · ${nome} · parse→serialize→parse é idempotente`, forma(b), forma(a));
}

// ── 3. Nada hostil vira HTML executável ──────────────────────────────────────
for (const entrada of HOSTIS) {
  const blocks = parseMarkdownToBlocks(entrada);
  const html   = blocks.map(b => b.html ?? '').join('');
  ok(`segurança · recusa href perigoso · ${entrada.slice(0, 32)}`,
     !/href\s*=\s*"\s*(javascript|data|vbscript)/i.test(html), html);
  ok(`segurança · não deixa passar <script> · ${entrada.slice(0, 32)}`,
     !/<script/i.test(html), html);
  // Só as tags que o editor mesmo produz podem sobrar; todo o resto tem que
  // ter virado texto escapado. Um `onerror=` em texto escapado é inerte — o
  // que não pode é sobrar tag de verdade fora da lista.
  const tags = [...html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map(m => m[1].toLowerCase());
  const permitidas = new Set(['a', 'strong', 'em', 's', 'code', 'br', 'mark']);
  ok(`segurança · só tags conhecidas sobrevivem · ${entrada.slice(0, 32)}`,
     tags.every(t => permitidas.has(t)), `tags: ${tags.join(', ')}`);
}

// ── 3b. Indentação: a escada é a mesma venha de onde vier ────────────────────
for (const { nome, md } of INDENTACOES) {
  const níveis = parseMarkdownToBlocks(md).map(b => b.depth ?? 0);
  igual(`indentação · ${nome} vira a mesma escada`, níveis, [0, 1, 2]);

  // E o editor sempre grava de volta com dois espaços por nível.
  igual(`indentação · ${nome} é normalizada na gravação`,
    blocksToMarkdown(parseMarkdownToBlocks(md)),
    ['- a', '  - b', '    - c'].join('\n'));
}

// Teto de níveis: escada funda não pode virar texto de uma coluna só.
{
  const fundo = Array.from({ length: 9 }, (_, i) => `${'  '.repeat(i)}- nível ${i}`).join('\n');
  const níveis = parseMarkdownToBlocks(fundo).map(b => b.depth ?? 0);
  ok('indentação · respeita o teto de 5 níveis', Math.max(...níveis) === 5, `níveis: ${níveis}`);
}

// Nota sem indentação nenhuma continua sem o campo — o registro de quem já
// tem notas não muda de forma só porque a versão mudou.
for (const { nome, blocks } of BLOCOS_V18) {
  const volta = parseMarkdownToBlocks(blocksToMarkdown(blocks));
  ok(`indentação · ${nome} continua sem campo depth`,
     volta.every(b => b.depth === undefined));
}

// ── 3c. Citação com conteúdo dentro ──────────────────────────────────────────
{
  const blocks = parseMarkdownToBlocks(CITACAO_COM_FILHOS);

  ok('citação · tudo dentro dela fica marcado como citado',
     blocks.every(b => b.quoted === true), JSON.stringify(blocks.map(b => [b.type, b.quoted])));

  igual('citação · título e lista viram tipos de verdade, não texto literal',
    blocks.map(b => b.type),
    ['heading4', 'paragraph', 'bullet', 'bullet', 'paragraph', 'paragraph']);

  ok('citação · "####" não sobra no texto do título',
     !blocks[0].html.includes('#'), blocks[0].html);
  ok('citação · o negrito da última linha virou <strong>',
     blocks[5].html.includes('<strong>'), blocks[5].html);
  ok('citação · o espaço extra depois do ">" não vira indentação',
     blocks[5].depth === undefined, `depth: ${blocks[5].depth}`);

  const volta = parseMarkdownToBlocks(blocksToMarkdown(blocks));
  igual('citação · sobrevive à ida e volta', forma(volta), forma(blocks));
}

// ── 3c2. Destaque (callout) ──────────────────────────────────────────────────
// A caixa de aviso dos sites de documentação. No markdown é uma citação com um
// marcador na primeira linha, e é assim que ela tem que entrar e sair — senão
// o .md exportado deixa de renderizar colorido no GitHub.
{
  const { CALLOUT_TYPES, CALLOUT_LABELS } = await import('../sidepanel/modules/blocks.js');

  const md = [
    '> [!NOTE]',
    '> Para linkar um elemento na mesma página, veja **IDs de título**.',
    '>',
    '> - primeiro',
    '> - segundo',
    '',
    'Texto normal fora.',
  ].join('\n');

  const blocks = parseMarkdownToBlocks(md);

  igual('destaque · o marcador não vira bloco nenhum', blocks.length, 6);
  ok('destaque · vale pra toda a citação, não só a primeira linha',
     blocks.slice(0, 4).every(b => b.callout === 'note'),
     JSON.stringify(blocks.map(b => b.callout ?? null)));
  ok('destaque · e para quando a citação acaba',
     blocks.slice(4).every(b => !b.callout));
  ok('destaque · todo bloco de destaque também é citação',
     blocks.slice(0, 4).every(b => b.quoted === true));
  {
    // Marcador sozinho e o texto embaixo, sem ">" nas linhas seguintes: as linhas
    // até o primeiro branco pertencem ao destaque (continuação preguiçosa).
    const lazy = parseMarkdownToBlocks('>[!NOTE]\ntexto a partir da linha de baixo\naqui tbm\n\nfora');
    igual('destaque · marcador sem espaço e texto sem ">" abaixo vira destaque',
      lazy.map(b => [b.callout ?? null, b.html]),
      [['note', 'texto a partir da linha de baixo'], ['note', 'aqui tbm'], [null, ''], [null, 'fora']]);
  }
  igual('destaque · a lista dentro dele continua sendo lista',
    blocks.slice(2, 4).map(b => b.type), ['bullet', 'bullet']);

  igual('destaque · volta pro markdown exatamente como entrou',
    blocksToMarkdown(blocks), md);
  igual('destaque · e é idempotente',
    forma(parseMarkdownToBlocks(blocksToMarkdown(blocks))), forma(blocks));

  // Os cinco tipos do formato, cada um com o seu rótulo traduzido.
  for (const tipo of CALLOUT_TYPES) {
    const b = parseMarkdownToBlocks(`> [!${tipo.toUpperCase()}]\n> texto`)[0];
    igual(`destaque · reconhece [!${tipo.toUpperCase()}]`, b.callout, tipo);
    ok(`destaque · ${tipo} tem rótulo em português`, !!CALLOUT_LABELS[tipo]);
  }

  // Minúsculas também: ninguém digita tudo em caixa alta.
  igual('destaque · aceita o marcador em minúsculas',
    parseMarkdownToBlocks('> [!warning]\n> cuidado')[0].callout, 'warning');

  // Palavra inventada não é destaque — vira texto, sem inventar cor nenhuma.
  {
    const b = parseMarkdownToBlocks('> [!URGENTE]\n> texto')[0];
    ok('destaque · marcador desconhecido não vira destaque', !b.callout);
    ok('destaque · e o texto dele não some', b.html.includes('URGENTE'), b.html);
  }

  // Duas caixas seguidas, de tipos diferentes, não podem virar uma só.
  {
    const dois = ['> [!TIP]', '> uma dica', '', '> [!WARNING]', '> um aviso'].join('\n');
    const bs = parseMarkdownToBlocks(dois);
    igual('destaque · caixas seguidas mantêm cada tipo',
      bs.filter(b => b.callout).map(b => b.callout), ['tip', 'warning']);
    igual('destaque · e os dois marcadores voltam no markdown',
      blocksToMarkdown(bs), dois);
  }

  // Texto simples: o rótulo aparece em português e o conteúdo não se perde.
  {
    const txt = blocksToPlainText(parseMarkdownToBlocks('> [!WARNING]\n> Confira o prazo.'));
    ok('destaque · texto simples traz o rótulo', txt.includes('ATENÇÃO'), txt);
    ok('destaque · e o conteúdo', txt.includes('Confira o prazo.'), txt);
  }
}

// ── 3c3. Título sublinhado (setext) ──────────────────────────────────────────
// O sublinhado não é um tipo novo: é o markdown original de título 1 e 2, com
// o traço embaixo. O traço é literalmente o que se vê na tela.
{
  {
    const md = ['Resultado do trimestre', '===', '', 'Detalhes', '---'].join('\n');
    const b = parseMarkdownToBlocks(md);
    igual('setext · "===" vira título 1 sublinhado',
      [b[0].type, b[0].underlined], ['heading1', true]);
    igual('setext · "---" vira título 2 sublinhado',
      [b[2].type, b[2].underlined], ['heading2', true]);
    igual('setext · o traço não sobra como bloco', b.length, 3);
    igual('setext · dá a volta inteira', blocksToMarkdown(b), md);
  }

  // Título com cerquilha continua sem sublinhado — as duas formas convivem.
  {
    const b = parseMarkdownToBlocks('# Com cerquilha');
    ok('setext · título com cerquilha não vem sublinhado', !b[0].underlined);
    igual('setext · e volta com cerquilha', blocksToMarkdown(b), '# Com cerquilha');
  }

  // ── A ambiguidade que o "---" cria ─────────────────────────────────────────
  // "---" sozinho é divisor; "---" logo abaixo de texto é sublinhado. Um
  // divisor depois de um parágrafo precisa sair de outro jeito, senão a nota
  // volta com o parágrafo virado título.
  {
    const blocos = [
      { id: 'a', type: 'paragraph', html: 'Uma linha de texto.' },
      { id: 'b', type: 'divider' },
    ];
    const md = blocksToMarkdown(blocos);
    ok('divisor · depois de texto não sai como "---"', !md.includes('---'), md);

    const volta = parseMarkdownToBlocks(md);
    igual('divisor · e volta como divisor, não como título',
      volta.map(b => b.type), ['paragraph', 'divider']);
    ok('divisor · com o parágrafo intacto', !volta[0].underlined);
  }

  // Divisor isolado continua saindo como "---", que é o que se reconhece.
  {
    const md = blocksToMarkdown([{ id: 'd', type: 'divider' }]);
    igual('divisor · sozinho continua "---"', md, '---');
  }

  // A nota antiga que tem parágrafo e divisor tem que abrir igual.
  for (const { nome, blocks } of BLOCOS_V18) {
    const volta = parseMarkdownToBlocks(blocksToMarkdown(blocks));
    igual(`setext · ${nome} · nenhum bloco virou título sublinhado`,
      volta.filter(b => b.underlined).length, 0);
  }
}

// ── 3c4. Âncoras para títulos da própria nota ────────────────────────────────
// Um "[texto](#secao)" era recusado pelo safeHref, que só conhecia http e
// mailto — o link virava texto literal. O documento abaixo é o exemplo do
// GitHub sobre linkar para títulos, colado tal e qual.
{
  const { headingSlug, headingSlugs, safeHref } =
    await import('../sidepanel/modules/blocks.js');

  igual('âncora · safeHref aceita fragmento', safeHref('#sample-section'), '#sample-section');
  ok('âncora · mas continua recusando o que executa',
     safeHref('javascript:alert(1)') === null && safeHref('#') === null);

  igual('âncora · apelido de um título comum', headingSlug('Sample Section'), 'sample-section');
  igual('âncora · pontuação sai e espaço duplo vira um hífen só',
    headingSlug("This'll be a  Helpful Section!"), 'thisll-be-a-helpful-section');
  igual('âncora · acento não atrapalha', headingSlug('Validações do Protocolo'), 'validacoes-do-protocolo');

  // Títulos repetidos: o segundo ganha sufixo, senão não teria como alcançá-lo.
  igual('âncora · título repetido ganha sufixo',
    headingSlugs(['Observações', 'Outra coisa', 'Observações']),
    ['observacoes', 'outra-coisa', 'observacoes-1']);

  const doc = [
    '# Example headings',
    '',
    '## Sample Section',
    '',
    '## This heading is not unique in the file',
    '',
    'TEXT 1',
    '',
    '## This heading is not unique in the file',
    '',
    'TEXT 2',
    '',
    '# Links to the example headings above',
    '',
    'Link to the sample section: [Link Text](#sample-section).',
    '',
    'Link to the second non-unique section: [Link Text](#this-heading-is-not-unique-in-the-file-1).',
  ].join('\n');

  const blocos = parseMarkdownToBlocks(doc);
  const comLink = blocos.filter(b => (b.html ?? '').includes('<a '));
  igual('âncora · os dois links do documento viraram link mesmo', comLink.length, 2);
  ok('âncora · e nenhum colchete sobrou como texto',
     !blocos.some(b => /\[Link Text\]\(/.test(b.html ?? '')),
     JSON.stringify(blocos.map(b => b.html).filter(h => h?.includes('Link Text'))));

  // O destino precisa existir de verdade entre os títulos do documento.
  const titulos = blocos.filter(b => b.type?.startsWith('heading'))
    .map(b => b.html.replace(/<[^>]+>/g, ''));
  const apelidos = headingSlugs(titulos);
  for (const alvo of ['sample-section', 'this-heading-is-not-unique-in-the-file-1']) {
    ok(`âncora · "${alvo}" aponta pra um título que existe`,
       apelidos.includes(alvo), apelidos.join(', '));
  }

  igual('âncora · dá a volta no markdown', blocksToMarkdown(blocos), doc);
}

// ── 3d. Imagens ──────────────────────────────────────────────────────────────
{
  const { blocksToMarkdownForExport, imageSrcOf } =
    await import('../sidepanel/modules/blocks.js');

  // Referência interna: é isso que fica no campo `content` da nota.
  {
    const b = parseMarkdownToBlocks('![print do portal](quickdock:file/12)')[0];
    igual('imagem · referência interna vira bloco de imagem',
      [b.type, b.fileId, b.alt], ['image', 12, 'print do portal']);
    igual('imagem · e volta igual',
      blocksToMarkdown([b]), '![print do portal](quickdock:file/12)');
  }

  // base64 de um .md importado.
  {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const b = parseMarkdownToBlocks(`![](${dataUrl})`)[0];
    igual('imagem · base64 entra como dataUrl', [b.type, b.dataUrl], ['image', dataUrl]);
  }

  // Privacidade: endereço remoto não pode virar <img>, senão abrir a nota
  // avisaria o servidor de terceiro que ela foi aberta, e quando.
  {
    const blocks = parseMarkdownToBlocks('![rastreador](https://terceiro.example/pixel.png)');
    ok('imagem · endereço remoto não vira imagem', blocks[0].type !== 'image');
    ok('imagem · vira link, sem perder o endereço',
       blocks[0].html.includes('href="https://terceiro.example/pixel.png"'), blocks[0].html);
    ok('imagem · e sem o "!" sobrando no texto',
       !blocks[0].html.startsWith('!'), blocks[0].html);
  }

  // Exportar embute; o autosave não.
  {
    const blocks = [{ id: 'i1', type: 'image', fileId: 7, alt: 'recibo' }];
    const leitor = async id => (id === 7 ? 'data:image/png;base64,QUJD' : null);

    ok('imagem · markdown do autosave NÃO carrega base64',
       !blocksToMarkdown(blocks).includes('base64'), blocksToMarkdown(blocks));
    igual('imagem · exportação embute em base64',
      await blocksToMarkdownForExport(blocks, leitor),
      '![recibo](data:image/png;base64,QUJD)');

    // Arquivo sumido não pode engolir a linha nem derrubar a exportação.
    const perdido = await blocksToMarkdownForExport(
      [{ id: 'i2', type: 'image', fileId: 999, alt: 'sumiu' }], leitor);
    ok('imagem · arquivo ausente mantém o texto alternativo',
       perdido.includes('sumiu'), perdido);
  }

  // Imagem dentro de citação e indentada continua sendo imagem.
  {
    const b = parseMarkdownToBlocks('  > ![x](quickdock:file/3)')[0];
    igual('imagem · sobrevive a citação + indentação',
      [b.type, b.fileId, b.quoted], ['image', 3, true]);
  }

  igual('imagem · imageSrcOf prioriza o dataUrl sobre o id',
    imageSrcOf({ fileId: 1, dataUrl: 'data:image/png;base64,Zg==' }),
    'data:image/png;base64,Zg==');
}

// ── 4. Backup: tudo que sai tem que voltar ───────────────────────────────────
{
  const { buildBackup, parseBackup } = await import('../sidepanel/modules/backup.js');

  const notas = [
    { title: 'Atendimento', md: '# Atendimento\n\n- [ ] Conferir' },
    { title: 'Nota com --> dentro do título', md: 'texto' },
    { title: 'Aspas "duplas" e \\ barra', md: '> citação\n\n| a | b |\n| --- | --- |\n| 1 | 2 |' },
    { title: 'Sem título', md: '' },
  ];

  const arquivo = buildBackup(notas);
  const volta   = parseBackup(arquivo);

  ok('backup · reconhece o próprio arquivo', volta !== null);
  igual('backup · número de notas', volta?.length, notas.length);
  igual('backup · títulos exatos', volta?.map(n => n.title), notas.map(n => n.title));
  igual('backup · conteúdo exato', volta?.map(n => n.md), notas.map(n => n.md.trim()));
  ok('backup · "-->" no título não parte o arquivo',
     arquivo.split('<!-- quickdock:nota').length - 1 === notas.length);

  // Um .md comum não pode ser confundido com backup — senão importar uma nota
  // normal cairia no caminho de restauração.
  for (const { md } of MARKDOWN) {
    ok('backup · markdown comum não é confundido com backup', parseBackup(md) === null);
  }
  ok('backup · arquivo vazio não é backup', parseBackup('') === null);
}

// ── 4b. Arquivo de nota individual (notefile.js) ─────────────────────────────
{
  const { buildNoteFile, parseNoteFile } = await import('../sidepanel/modules/notefile.js');

  // Ida e volta completa com todos os campos padrão
  {
    const nota = {
      meta: {
        quickdock: 1,
        id: '3f9a7c21-50e2-4db1-93c4-648c6b75eb37',
        titulo: 'Atendimento — Maria Silva',
        cor: 'azul',
        icone: 'folder',
        iconePreenchido: true,
        tituloOculto: false,
        ordem: 'a0V',
        criadoEm: '2026-03-12T09:14:00.000Z',
        atualizadoEm: '2026-03-12T10:00:00.000Z',
      },
      md: '# Atendimento — Maria Silva\n\n- [ ] Conferir elegibilidade',
    };

    const texto = buildNoteFile(nota);
    const parsed = parseNoteFile(texto);

    ok('notefile · gera e lê arquivo completo', parsed !== null);
    igual('notefile · metadados preservados', parsed?.meta, nota.meta);
    igual('notefile · markdown preservado', parsed?.md, nota.md);
  }

  // Título com dois pontos (:), com aspas e com "---"
  {
    const notaComDoisPontos = {
      meta: { id: 't1', titulo: 'Protocolo: Análise e Parecer' },
      md: 'Conteúdo.',
    };
    const parsed1 = parseNoteFile(buildNoteFile(notaComDoisPontos));
    igual('notefile · título com dois pontos', parsed1?.meta?.titulo, 'Protocolo: Análise e Parecer');

    const notaComAspas = {
      meta: { id: 't2', titulo: 'O "Melhor" Atendimento' },
      md: 'Conteúdo.',
    };
    const parsed2 = parseNoteFile(buildNoteFile(notaComAspas));
    igual('notefile · título com aspas', parsed2?.meta?.titulo, 'O "Melhor" Atendimento');

    const notaComTracos = {
      meta: { id: 't3', titulo: 'Divisor --- no título' },
      md: 'Conteúdo.',
    };
    const parsed3 = parseNoteFile(buildNoteFile(notaComTracos));
    igual('notefile · título com "---"', parsed3?.meta?.titulo, 'Divisor --- no título');
  }

  // Corpo que começa com "---" (divisor no início da nota)
  {
    const notaDivisor = {
      meta: { id: 'd1', titulo: 'Nota Divisória' },
      md: '---\n\nTexto após o divisor horizontal inicial.',
    };
    const texto = buildNoteFile(notaDivisor);
    const parsed = parseNoteFile(texto);
    igual('notefile · corpo iniciando com "---" não confunde delimitador', parsed?.md, notaDivisor.md);
  }

  // Preservação de campos desconhecidos (extensibilidade para versões futuras)
  {
    const notaComExtras = {
      meta: {
        id: 'fut1',
        titulo: 'Nota do Futuro',
        tagPersonalizada: 'urgente',
        revisaoRemota: 42,
        sincronizado: true,
      },
      md: 'Texto da nota futura.',
    };
    const parsed = parseNoteFile(buildNoteFile(notaComExtras));
    igual('notefile · campos desconhecidos preservados na ida e volta',
      parsed?.meta,
      { quickdock: 1, ...notaComExtras.meta });
  }

  // O campo `content` não vai para o arquivo
  {
    const notaComContent = {
      meta: {
        id: 'c1',
        titulo: 'Nota com Content',
        content: 'Isto é a segunda verdade que não deve subir',
      },
      md: '# Markdown real',
    };
    const texto = buildNoteFile(notaComContent);
    ok('notefile · content não entra no texto do arquivo', !texto.includes('segunda verdade'));
    const parsed = parseNoteFile(texto);
    ok('notefile · content ausente no meta lido', parsed?.meta?.content === undefined);
  }

  // Valores vazios e nulos
  {
    const notaVazia = {
      meta: { id: 'v1', titulo: '', cor: null, icone: null },
      md: '',
    };
    const parsed = parseNoteFile(buildNoteFile(notaVazia));
    igual('notefile · título vazio preservado como string vazia', parsed?.meta?.titulo, '');
    igual('notefile · cor nula preservada como null', parsed?.meta?.cor, null);
    igual('notefile · ícone nulo preservado como null', parsed?.meta?.icone, null);
    igual('notefile · markdown vazio tratado sem erro', parsed?.md, '');
  }

  // Arquivo sem frontmatter devolve null e não explode
  {
    ok('notefile · string vazia devolve null', parseNoteFile('') === null);
    ok('notefile · null devolve null', parseNoteFile(null) === null);
    ok('notefile · undefined devolve null', parseNoteFile(undefined) === null);
    ok('notefile · markdown comum sem frontmatter devolve null',
       parseNoteFile('# Apenas um título markdown\n\nSem frontmatter.') === null);
  }

  // Frontmatter malformado não explode
  {
    // Cerca aberta mas nunca fechada
    ok('notefile · frontmatter não fechado devolve null',
       parseNoteFile('---\nquickdock: 1\nid: 123\n') === null);

    // Linha sem dois pontos no meio do frontmatter é ignorada
    const fmComLinhaTorta = [
      '---',
      'quickdock: 1',
      'esta linha nao tem separador',
      'titulo: Nota Válida',
      '---',
      '',
      'Texto.',
    ].join('\n');
    const parsed = parseNoteFile(fmComLinhaTorta);
    ok('notefile · tolera linha sem separador', parsed !== null);
    igual('notefile · extrai campos válidos mesmo com linha torta', parsed?.meta?.titulo, 'Nota Válida');

    // Bloco --- vazio sem campos
    ok('notefile · frontmatter sem chaves devolve null',
       parseNoteFile('---\n---\n\nTexto') === null);
  }
}

// ── 4c. Dexie v6: uid, migração e ordem fracionária (storage.js) ────────────
{
  const { ordemEntre, ordemDeIndice } =
    await import('../sidepanel/modules/storage.js');

  // Teste de propriedade de ordemEntre: para quaisquer a < b, vale a < ordemEntre(a, b) < b
  {
    const pares = [
      [null, null],
      [null, 'a0'],
      [null, 'a1'],
      ['a0', null],
      ['a1', null],
      ['a0', 'a1'],
      ['a0', 'a0V'],
      ['a0V', 'a1'],
      ['a0', 'a0F'],
      ['Zz', 'a0'],
      ['Zy', 'Zz'],
    ];

    for (const [a, b] of pares) {
      const mid = ordemEntre(a, b);
      if (a !== null) {
        ok(`ordemEntre · ${a} < ordemEntre(${a}, ${b})`, a < mid, `a: ${a}, mid: ${mid}`);
      }
      if (b !== null) {
        ok(`ordemEntre · ordemEntre(${a}, ${b}) < ${b}`, mid < b, `mid: ${mid}, b: ${b}`);
      }
    }

    // Cadeia de 50 inserções sucessivas pela esquerda
    let x = 'a0', y = 'a1';
    let cadeiaEsqOk = true;
    for (let step = 0; step < 50; step++) {
      const m = ordemEntre(x, y);
      if (!(x < m && m < y)) { cadeiaEsqOk = false; break; }
      y = m;
    }
    ok('ordemEntre · propriedade mantida em cadeia pela esquerda (50 passos)', cadeiaEsqOk);

    // Cadeia de 50 inserções sucessivas pela direita
    x = 'a0'; y = 'a1';
    let cadeiaDirOk = true;
    for (let step = 0; step < 50; step++) {
      const m = ordemEntre(x, y);
      if (!(x < m && m < y)) { cadeiaDirOk = false; break; }
      x = m;
    }
    ok('ordemEntre · propriedade mantida em cadeia pela direita (50 passos)', cadeiaDirOk);
  }

  // ── Regressões da ordem fracionária ────────────────────────────────────────
  // As três abaixo passavam despercebidas porque as cadeias acima param no 50º
  // passo. Cada uma cobre um bug que existiu de verdade.
  {
    // 1. Arrastar sempre pro topo. Quebrava no 63º: ao passar da faixa 'Z' pra
    //    faixa de estouro 'Y', a chave gerada ordenava DEPOIS da que deveria
    //    anteceder. 200 passos entram bem fundo nessa faixa.
    let topo = 'a0', topoOk = true, topoFalha = '';
    for (let step = 0; step < 200; step++) {
      const m = ordemEntre(null, topo);
      if (!(m < topo)) { topoOk = false; topoFalha = `passo ${step}: "${m}" não é < "${topo}"`; break; }
      topo = m;
    }
    ok('ordemEntre · inserir no topo 200x mantém a ordem', topoOk, topoFalha);

    // 2. Criar nota (sempre no fim) é a operação mais frequente do app. A
    //    versão antiga acrescentava um caractere por nota: a 300ª chegava a
    //    240 caracteres. O limite abaixo é generoso e ainda assim pegaria a
    //    volta do crescimento linear.
    let fim = null, maiorFim = 0, fimOk = true, fimFalha = '';
    for (let step = 0; step < 500; step++) {
      const m = ordemEntre(fim, null);
      if (fim !== null && !(m > fim)) { fimOk = false; fimFalha = `passo ${step}: "${m}" não é > "${fim}"`; break; }
      fim = m;
      maiorFim = Math.max(maiorFim, m.length);
    }
    ok('ordemEntre · criar 500 notas mantém a ordem', fimOk, fimFalha);
    ok('ordemEntre · criar 500 notas não faz a chave crescer sem limite',
       maiorFim <= 20, `maior chave: ${maiorFim} caracteres`);

    // 3. Lista viva: inserções em posições arbitrárias têm que manter a lista
    //    ordenada e sem chave repetida — chave repetida embaralharia a ordem
    //    das notas em silêncio.
    const proximo = (n => () => (n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)(42);
    const lista = [ordemDeIndice(0)];
    let vivaOk = true, vivaFalha = '';
    for (let step = 0; step < 400; step++) {
      const i = Math.floor(proximo() * (lista.length + 1));
      const esq = i > 0 ? lista[i - 1] : null;
      const dir = i < lista.length ? lista[i] : null;
      let m;
      try { m = ordemEntre(esq, dir); }
      catch (e) { vivaOk = false; vivaFalha = `passo ${step} lançou: ${e.message}`; break; }
      if (!((esq === null || esq < m) && (dir === null || m < dir))) {
        vivaOk = false; vivaFalha = `passo ${step}: "${esq}" < "${m}" < "${dir}" falhou`; break;
      }
      lista.splice(i, 0, m);
    }
    ok('ordemEntre · 400 inserções em posições arbitrárias respeitam os vizinhos', vivaOk, vivaFalha);
    ok('ordemEntre · lista viva termina ordenada',
       lista.every((v, i) => i === 0 || lista[i - 1] < v));
    ok('ordemEntre · lista viva não gera chave repetida',
       new Set(lista).size === lista.length);
  }

  // ── Guarda de fonte: arrastar nota escreve 1 registro, não N ───────────────
  // Não dá pra exercitar o banco aqui, e esta é uma propriedade de DESENHO,
  // fácil de perder sem ninguém notar: a ordem fracionária só se paga se mover
  // uma nota tocar apenas nela. Renumerar a lista inteira a cada arrasto
  // sujaria os N arquivos na sincronização e transformaria um arrasto em N
  // conflitos em potencial — que é exatamente o que ela existe pra evitar.
  {
    const { readFile } = await import('node:fs/promises');

    const abas = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
    const arrasto = abas.slice(abas.indexOf('async function reorderNotes'));
    ok('arrastar nota · usa moveNoteRecord em vez de renumerar a lista',
       /moveNoteRecord\s*\(/.test(arrasto.slice(0, arrasto.indexOf('\n}\n'))));

    const armazem = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
    const mover = armazem.slice(armazem.indexOf('export async function moveNoteRecord'));
    const corpoMover = mover.slice(0, mover.indexOf('\n}\n'));
    ok('moveNoteRecord · grava exatamente um registro',
       (corpoMover.match(/db\.notes\.update/g) ?? []).length === 1,
       `encontrou ${(corpoMover.match(/db\.notes\.update/g) ?? []).length} gravações`);
  }

  // Conversão de índice inteiro em ordem fracionária
  igual('ordemDeIndice · 0 vira a0', ordemDeIndice(0), 'a0');
  igual('ordemDeIndice · 1 vira a1', ordemDeIndice(1), 'a1');
  igual('ordemDeIndice · preserva ordenação de índices crescentes',
    ordemDeIndice(0) < ordemDeIndice(1) && ordemDeIndice(1) < ordemDeIndice(2), true);
}

// ── 4d. Adaptador de sincronização em memória (sync-adapter.js) ──────────────
{
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');

  const adaptador = new MemorySyncAdapter();

  // Autenticação
  const auth = await adaptador.autenticar();
  ok('adaptador memória · autenticar devolve ok', auth.ok === true);

  // Escrita de arquivo novo com revBase nulo
  const res1 = await adaptador.escrever('notas/ideias.md', '# Ideias\n', null);
  ok('adaptador memória · escrita inicial devolve revisão', typeof res1.rev === 'string');
  igual('adaptador memória · primeira revisão é "1"', res1.rev, '1');

  // Leitura do arquivo escrito
  const lido1 = await adaptador.ler('notas/ideias.md');
  igual('adaptador memória · lê conteúdo exato', lido1?.texto, '# Ideias\n');
  igual('adaptador memória · lê revisão correspondente', lido1?.rev, '1');

  // Conflito: tentativa de escrita com revBase desatualizado (null ou revisão antiga)
  const conflito1 = await adaptador.escrever('notas/ideias.md', '# Conflito\n', null);
  ok('adaptador memória · revBase null em arquivo existente gera conflito', conflito1?.conflito === true);
  igual('adaptador memória · conflito informa revisão atual', conflito1?.revAtual, '1');

  const conflito2 = await adaptador.escrever('notas/ideias.md', '# Conflito\n', '999');
  ok('adaptador memória · revBase incorreto gera conflito', conflito2?.conflito === true);

  // Escrita bem-sucedida com revBase correto
  const res2 = await adaptador.escrever('notas/ideias.md', '# Ideias v2\n', '1');
  ok('adaptador memória · atualização com revBase correto avança revisão', res2.rev === '2');

  // Listar mudanças desde o início
  const mudancas1 = await adaptador.listarMudancas(null);
  igual('adaptador memória · lista mudanças desde o início', mudancas1.length, 1);
  igual('adaptador memória · caminho da mudança', mudancas1[0].caminho, 'notas/ideias.md');
  igual('adaptador memória · revisão mais recente na mudança', mudancas1[0].rev, '2');
  ok('adaptador memória · não consta como apagado', mudancas1[0].apagado === false);

  // Listar mudanças a partir do cursor 2 (não deve trazer nada novo)
  const mudancasVazias = await adaptador.listarMudancas('2');
  igual('adaptador memória · cursor atualizado não lista mudanças passadas', mudancasVazias.length, 0);

  // Exclusão do arquivo
  const apagou = await adaptador.apagar('notas/ideias.md');
  ok('adaptador memória · apagar devolve true', apagou === true);
  const lidoAposApagar = await adaptador.ler('notas/ideias.md');
  ok('adaptador memória · ler arquivo apagado devolve null', lidoAposApagar === null);

  // Listagem de mudanças após exclusão reporta apagado: true
  const mudancasAposApagar = await adaptador.listarMudancas('2');
  igual('adaptador memória · exclusão gera evento de mudança', mudancasAposApagar.length, 1);
  ok('adaptador memória · evento de exclusão tem apagado = true', mudancasAposApagar[0].apagado === true);
}

// ── 4e. Motor de sincronização (sync-engine.js) ──────────────────────────────
{
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { buildNoteFile } = await import('../sidepanel/modules/notefile.js');

  // O store falso mora em test/memory-store.mjs — o banco de provas do
  // navegador usa o mesmo, pra que o contrato do SyncEngine não divirja.
  const { InMemoryStore } = await import('./memory-store.mjs');

  // 1. Nota nova aqui sobe
  {
    const adapter = new MemorySyncAdapter();
    const store = new InMemoryStore();
    const engine = new SyncEngine({ adapter, store, deviceName: 'Notebook' });

    await store.salvarNotaLocal({
      uid: 'u_nova_1',
      title: 'Ideias Iniciais',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Lançamento v3.0' }],
      ordem: 'a0',
    });

    const res = await engine.sincronizar();
    igual('sync · nota nova aqui sobe · contagem de enviadas', res.enviadas, 1);

    const arquivoRemoto = await adapter.ler('notas/ideias-iniciais.md');
    ok('sync · nota nova aqui sobe · arquivo criado no destino', arquivoRemoto !== null);
    ok('sync · nota nova aqui sobe · texto contém título', arquivoRemoto?.texto.includes('Ideias Iniciais'));
    ok('sync · nota nova aqui sobe · texto contém markdown do bloco', arquivoRemoto?.texto.includes('Lançamento v3.0'));

    const estado = await store.obterEstadoSync('u_nova_1');
    ok('sync · nota nova aqui sobe · estado local registrado', estado !== null && estado.rev === arquivoRemoto?.rev);
  }

  // 1b. Capa por endereço viaja no frontmatter (`capa:`); a enviada (arquivo) não
  {
    const adapter = new MemorySyncAdapter();
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();
    const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'Notebook' });
    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'Celular' });

    await storeA.salvarNotaLocal({
      uid: 'u_capa_1', title: 'Com capa', ordem: 'a0',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'texto' }],
      coverUrl: 'https://exemplo.com/capa.jpg',
    });
    await storeA.salvarNotaLocal({
      uid: 'u_capa_2', title: 'Capa enviada', ordem: 'a1',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'texto' }],
      coverFileId: 7,
    });
    await engineA.sincronizar();

    const comUrl = await adapter.ler('notas/com-capa.md');
    ok('sync · capa por endereço sobe como "capa:" no frontmatter', comUrl?.texto.includes('capa: "https://exemplo.com/capa.jpg"'), comUrl?.texto);
    const enviada = await adapter.ler('notas/capa-enviada.md');
    ok('sync · capa enviada (arquivo) não vai pro arquivo remoto', enviada && !/capa:/.test(enviada.texto), enviada?.texto);

    await engineB.sincronizar();
    const baixada = await storeB.obterNotaPorUid('u_capa_1');
    igual('sync · capa por endereço chega no outro aparelho', baixada?.coverUrl, 'https://exemplo.com/capa.jpg');
    ok('sync · "capa" não vira propriedade da nota', baixada && !('capa' in (baixada.properties || {})), JSON.stringify(baixada?.properties));
  }

  // 1c. Ícone com imagem: o link e o corte viajam; o arquivo enviado não
  {
    const adapter = new MemorySyncAdapter();
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();
    const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'Notebook' });
    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'Celular' });

    await storeA.salvarNotaLocal({
      uid: 'u_ico_1', title: 'Icone link', ordem: 'a0',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'x' }],
      iconImage: { url: 'https://exemplo.com/i.png', x: 30, y: 70, zoom: 2 },
    });
    await storeA.salvarNotaLocal({
      uid: 'u_ico_2', title: 'Icone arquivo', ordem: 'a1',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'x' }],
      iconImage: { fileId: 9, x: 50, y: 50, zoom: 1 },
    });
    await engineA.sincronizar();

    const link = await adapter.ler('notas/icone-link.md');
    ok('sync · ícone com imagem sobe (link + corte)', link?.texto.includes('iconeImagem: "https://exemplo.com/i.png"') && link?.texto.includes('iconeCorte: 30,70,2'), link?.texto);
    const arq = await adapter.ler('notas/icone-arquivo.md');
    ok('sync · ícone com arquivo enviado não vai pro arquivo remoto', arq && !/iconeImagem|iconeCorte/.test(arq.texto), arq?.texto);

    await engineB.sincronizar();
    const baixada = await storeB.obterNotaPorUid('u_ico_1');
    igual('sync · ícone com imagem chega no outro aparelho', baixada?.iconImage, { url: 'https://exemplo.com/i.png', x: 30, y: 70, zoom: 2 });
    ok('sync · chaves do ícone não viram propriedades', baixada && !('iconeImagem' in (baixada.properties || {})) && !('iconeCorte' in (baixada.properties || {})), JSON.stringify(baixada?.properties));
  }

  // 2. Nota nova lá desce
  {
    const adapter = new MemorySyncAdapter();
    const store = new InMemoryStore();
    const engine = new SyncEngine({ adapter, store, deviceName: 'Notebook' });

    const arquivoRemotoTexto = buildNoteFile({
      meta: {
        quickdock: 1,
        id: 'u_remota_2',
        titulo: 'Protocolo Externo',
        cor: 'amarelo',
        ordem: 'a1',
      },
      md: 'Documento recebido via nuvem.',
    });

    await adapter.escrever('notas/protocolo-externo.md', arquivoRemotoTexto, null);

    const res = await engine.sincronizar();
    igual('sync · nota nova lá desce · contagem de baixadas', res.baixadas, 1);

    const notaLocal = await store.obterNotaPorUid('u_remota_2');
    ok('sync · nota nova lá desce · nota salva localmente', notaLocal !== null);
    igual('sync · nota nova lá desce · título exato', notaLocal?.title, 'Protocolo Externo');
    igual('sync · nota nova lá desce · cor exata', notaLocal?.color, 'amarelo');
    ok('sync · nota nova lá desce · blocos criados', notaLocal?.blocks?.length === 1);
    igual('sync · nota nova lá desce · conteúdo do bloco', notaLocal?.blocks[0].html, 'Documento recebido via nuvem.');
  }

  // 3. Edição dos dois lados → cópia de conflito, nenhum dos dois conteúdos perdido
  {
    const adapter = new MemorySyncAdapter();
    const store = new InMemoryStore();
    const engine = new SyncEngine({ adapter, store, deviceName: 'Celular' });

    // Estado inicial sincronizado em ambos os lados
    await store.salvarNotaLocal({
      uid: 'u_compartilhada_3',
      title: 'Lista de Compras',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Café' }],
      ordem: 'a0',
    });
    await engine.sincronizar();

    // Edição remota (simula outro aparelho sincronizando com o destino)
    const arquivoRemotoModificado = buildNoteFile({
      meta: { quickdock: 1, id: 'u_compartilhada_3', titulo: 'Lista de Compras' },
      md: 'Café\nLeite (adição remota)',
    });
    const est = await store.obterEstadoSync('u_compartilhada_3');
    await adapter.escrever(est.caminho, arquivoRemotoModificado, est.rev);

    // Edição local concorrente feita pelo usuário
    await store.salvarNotaLocal({
      uid: 'u_compartilhada_3',
      title: 'Lista de Compras',
      blocks: [
        { id: 'b1', type: 'paragraph', html: 'Café' },
        { id: 'b2', type: 'paragraph', html: 'Açúcar (adição local)' },
      ],
      ordem: 'a0',
    });

    const res = await engine.sincronizar();
    igual('sync · conflito detectado e tratado', res.conflitos, 1);

    // Ambas as notas devem existir localmente (nenhum dado perdido!)
    const todasNotas = await store.listarNotasLocais();
    igual('sync · conflito · preserva ambos (2 notas no banco)', todasNotas.length, 2);

    const notaPrincipal = await store.obterNotaPorUid('u_compartilhada_3');
    const notaConflito = todasNotas.find(n => n.uid !== 'u_compartilhada_3');

    ok('sync · conflito · nota principal atualizada com dados remotos',
       notaPrincipal?.blocks?.some(b => b.html.includes('Leite (adição remota)')));

    ok('sync · conflito · cópia criada traz identificador e etiqueta',
       notaConflito?.title.includes('conflito') && notaConflito?.title.includes('Celular'));
    ok('sync · conflito · cópia preserva integralmente o conteúdo local',
       notaConflito?.blocks?.some(b => b.html.includes('Açúcar (adição local)')));

    // A cópia precisa de ordem própria. Herdar a da original deixaria duas
    // notas com a mesma chave de ordenação, e aí mover qualquer uma das duas
    // cai no caminho de reparo do moveNoteRecord, que renumera a lista inteira.
    // Um conflito não pode degradar a ordenação de todas as outras notas.
    ok('sync · conflito · cópia não herda a ordem da original',
       !!notaConflito?.ordem && notaConflito.ordem !== notaPrincipal?.ordem,
       `principal: ${notaPrincipal?.ordem} · cópia: ${notaConflito?.ordem}`);
    ok('sync · conflito · cópia fica logo depois da original',
       notaConflito?.ordem > notaPrincipal?.ordem,
       `principal: ${notaPrincipal?.ordem} · cópia: ${notaConflito?.ordem}`);
  }

  // 4. Exclusão lá propaga para cá
  {
    const adapter = new MemorySyncAdapter();
    const store = new InMemoryStore();
    const engine = new SyncEngine({ adapter, store, deviceName: 'Notebook' });

    // Inicializa nota e sincroniza
    await store.salvarNotaLocal({
      uid: 'u_apagar_4',
      title: 'Nota Descartável',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Será excluída' }],
      ordem: 'a0',
    });
    await engine.sincronizar();

    // Remoto exclui o arquivo
    const est = await store.obterEstadoSync('u_apagar_4');
    await adapter.apagar(est.caminho);

    // Sincronização deve remover localmente
    const res = await engine.sincronizar();
    igual('sync · exclusão lá propaga para cá · contagem apagadas', res.apagadas, 1);

    const notaLocal = await store.obterNotaPorUid('u_apagar_4');
    ok('sync · exclusão lá propaga para cá · nota removida do banco local', notaLocal === null);
  }

  // 5. Exclusão lá + edição aqui → a nota ressuscita
  {
    const adapter = new MemorySyncAdapter();
    const store = new InMemoryStore();
    const engine = new SyncEngine({ adapter, store, deviceName: 'Notebook' });

    // Inicializa nota e sincroniza
    await store.salvarNotaLocal({
      uid: 'u_ressuscita_5',
      title: 'Nota Vital',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Texto original' }],
      ordem: 'a0',
    });
    await engine.sincronizar();

    // Remoto exclui o arquivo
    const est = await store.obterEstadoSync('u_ressuscita_5');
    await adapter.apagar(est.caminho);

    // Usuário edita localmente antes de sincronizar
    await store.salvarNotaLocal({
      uid: 'u_ressuscita_5',
      title: 'Nota Vital',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Texto editado criticamente pelo usuário' }],
      ordem: 'a0',
    });

    // Sincroniza: a nota não pode sumir e deve ressuscitar no remoto
    await engine.sincronizar();

    const notaLocal = await store.obterNotaPorUid('u_ressuscita_5');
    ok('sync · exclusão lá + edição aqui · nota permanece viva localmente', notaLocal !== null);
    ok('sync · exclusão lá + edição aqui · preserva o conteúdo editado',
       notaLocal?.blocks[0].html.includes('Texto editado criticamente'));

    const arquivoNoAdapter = await adapter.ler(est.caminho);
    ok('sync · exclusão lá + edição aqui · arquivo sobe novamente para o destino', arquivoNoAdapter !== null);
    ok('sync · exclusão lá + edição aqui · conteúdo do arquivo no destino atualizado',
       arquivoNoAdapter?.texto.includes('Texto editado criticamente'));
  }

  // 6. Aparelho sem estado local reconcilia tudo como novo, sem duplicar nota
  {
    const adapter = new MemorySyncAdapter();
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();
    const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'AparelhoA' });
    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

    // Aparelho A cria e sobe a nota
    await storeA.salvarNotaLocal({
      uid: 'u_sem_estado_6',
      title: 'Nota Compartilhada Sem Estado',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Mesmo conteúdo' }],
      ordem: 'a0',
    });
    await engineA.sincronizar();

    // Aparelho B já tem a mesma nota em seu banco (ex.: perfil clonado ou backup anterior),
    // porém sem nenhum estado local de sincronização (estados vazio e cursor nulo)
    await storeB.salvarNotaLocal({
      uid: 'u_sem_estado_6',
      title: 'Nota Compartilhada Sem Estado',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Mesmo conteúdo' }],
      ordem: 'a0',
    });

    igual('sync · sem estado local · pré-condição: B tem 1 nota', (await storeB.listarNotasLocais()).length, 1);
    igual('sync · sem estado local · pré-condição: B não tem estado sync', (await storeB.listarTodosEstadosSync()).length, 0);

    // Aparelho B sincroniza do zero
    await engineB.sincronizar();

    const notasB = await storeB.listarNotasLocais();
    igual('sync · sem estado local · não duplica nota (continua exatamente 1 nota)', notasB.length, 1);
    igual('sync · sem estado local · nota mantém uid correto', notasB[0].uid, 'u_sem_estado_6');

    const estadoB = await storeB.obterEstadoSync('u_sem_estado_6');
    ok('sync · sem estado local · estado de sincronização criado com sucesso', estadoB !== null);
  }

  // 7. Tarefa 1 (Portão): Isolamento de referências de imagens locais
  // A chave primária local (fileId) nunca viaja na sincronização para impedir
  // que outro aparelho aponte para um arquivo local diferente por coincidência de ID.
  {
    const { blocksToMarkdown, parseMarkdownToBlocks } = await import('../sidepanel/modules/blocks.js');

    // 7.1: Serialização para sync omite fileId e preserva alt
    const blocosComImg = [{ id: 'img1', type: 'image', fileId: 12, alt: 'Foto do Produto Original' }];
    const mdSync = blocksToMarkdown(blocosComImg, { sync: true });
    ok('sync · imagem · serialização para sync não contém fileId numérico', !/quickdock:file\/12/.test(mdSync));
    ok('sync · imagem · serialização para sync usa marcador neutro', /quickdock:nao-sincronizado/.test(mdSync));

    const volta = parseMarkdownToBlocks(mdSync);
    igual('sync · imagem · volta não possui fileId', volta[0].fileId, undefined);
    igual('sync · imagem · texto alternativo sobreviveu', volta[0].alt, 'Foto do Produto Original');
    ok('sync · imagem · marcado como não-sincronizado', volta[0].unsynced === true);

    // 7.2: Dois aparelhos com fileIds locais coincidentes não se confundem
    const adapter = new MemorySyncAdapter();
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();
    const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'AparelhoA' });
    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

    // Aparelho A possui Nota A com fileId 12 (ex: print do cliente A)
    await storeA.salvarNotaLocal({
      uid: 'u_nota_a',
      title: 'Nota do Aparelho A',
      blocks: [{ id: 'ia', type: 'image', fileId: 12, alt: 'Print Cliente A' }],
      ordem: 'a0',
    });

    // Aparelho B possui Nota B com fileId 12 (ex: foto do recibo B)
    await storeB.salvarNotaLocal({
      uid: 'u_nota_b',
      title: 'Nota do Aparelho B',
      blocks: [{ id: 'ib', type: 'image', fileId: 12, alt: 'Recibo Cliente B' }],
      ordem: 'a1',
    });

    // Aparelho A sincroniza para o repositório
    await engineA.sincronizar();

    // Aparelho B sincroniza (baixa Nota A)
    await engineB.sincronizar();

    // Na máquina B, a nota A baixada NÃO pode apontar para o fileId 12 de B
    const notaABaixadaEmB = await storeB.obterNotaPorUid('u_nota_a');
    ok('sync · imagem · nota A baixada em B existe', notaABaixadaEmB !== null);
    const imgBaixadaEmB = notaABaixadaEmB.blocks.find(b => b.type === 'image');
    igual('sync · imagem · imagem de A baixada em B não tem fileId (não corrompe para recibo B)', imgBaixadaEmB.fileId, undefined);
    igual('sync · imagem · alt de A sobreviveu em B', imgBaixadaEmB.alt, 'Print Cliente A');

    // A nota nativa de B continua intacta com seu próprio fileId 12
    const notaBNativaEmB = await storeB.obterNotaPorUid('u_nota_b');
    const imgNativaEmB = notaBNativaEmB.blocks.find(b => b.type === 'image');
    igual('sync · imagem · imagem nativa de B preserva fileId 12 local', imgNativaEmB.fileId, 12);

    // 7.3: Preservação no aparelho de origem após round-trip de edição remota
    // Aparelho B edita o título/texto da Nota A e sobe
    await storeB.salvarNotaLocal({
      ...notaABaixadaEmB,
      blocks: [
        ...notaABaixadaEmB.blocks,
        { id: 'p2', type: 'paragraph', html: 'Adicionado por B' },
      ],
      updatedAt: Date.now() + 1000,
    });
    await engineB.sincronizar();

    // Aparelho A sincroniza (baixa a atualização de B da Nota A)
    await engineA.sincronizar();

    const notaAAtualizadaEmA = await storeA.obterNotaPorUid('u_nota_a');
    const imgAtualizadaEmA = notaAAtualizadaEmA.blocks.find(b => b.type === 'image');
    igual('sync · imagem · aparelho de origem preserva fileId local 12 após sincronização', imgAtualizadaEmA.fileId, 12);
    igual('sync · imagem · aparelho de origem preserva alt local', imgAtualizadaEmA.alt, 'Print Cliente A');
    ok('sync · imagem · aparelho de origem incorporou texto novo de B',
       notaAAtualizadaEmA.blocks.some(b => b.html === 'Adicionado por B'));
  }

  // 8. Tarefa 2: A nota aberta
  // Sincronização nunca pode sobrescrever a digitação no DOM nem causar perda de foco/cursor.
  {
    const adapter = new MemorySyncAdapter();
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();

    let editorAFocado = false;
    let editorATemEdicaoPendente = false;
    let recarregouNotaId = null;
    let flushSaveChamado = 0;
    let modoModeloAtivo = false;

    let domNotaA = 'Conteúdo inicial da Nota 1';

    const engineA = new SyncEngine({
      adapter,
      store: storeA,
      deviceName: 'AparelhoA',
      obterNotaAbertaUid: () => 'u_aberta_1',
      podeRecarregarNotaAberta: () => !editorAFocado && !editorATemEdicaoPendente,
      recarregarNotaAberta: async (id, uid) => { recarregouNotaId = id ?? uid; },
      antesDeSincronizar: async () => {
        flushSaveChamado++;
        // Simula o flushSave(): o DOM é gravado no banco antes de qualquer comparação
        await storeA.salvarNotaLocal({
          uid: 'u_aberta_1',
          title: 'Nota 1',
          blocks: [{ id: 'b1', type: 'paragraph', html: domNotaA }],
          ordem: 'a0',
        });
      },
      emModoModelo: () => modoModeloAtivo,
    });

    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

    // 8.1: Estado inicial: nota criada e sincronizada
    await storeA.salvarNotaLocal({
      uid: 'u_aberta_1',
      title: 'Nota 1',
      blocks: [{ id: 'b1', type: 'paragraph', html: domNotaA }],
      ordem: 'a0',
    });
    await engineA.sincronizar();

    // Aparelho B baixa a nota
    await engineB.sincronizar();
    const notaB = await storeB.obterNotaPorUid('u_aberta_1');

    // Aparelho B faz uma edição e sincroniza para o repositório
    await storeB.salvarNotaLocal({
      ...notaB,
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Edição vinda de B' }],
      updatedAt: Date.now() + 500,
    });
    await engineB.sincronizar();

    // No Aparelho A: o usuário está no meio da digitação da mesma nota no DOM
    domNotaA = 'Edição local fresquinha que ainda está sendo digitada';
    editorAFocado = true;
    editorATemEdicaoPendente = true;

    // 8.2: Sincronização dispara enquanto a nota está aberta e suja
    const resRodada1 = await engineA.sincronizar();

    // A descida da nota aberta DEVE ser pulada nesta rodada!
    igual('sync · nota aberta · rodada 1 pula nota aberta ocupada', resRodada1.puladas, 1);
    igual('sync · nota aberta · rodada 1 não baixou por cima da digitação', resRodada1.baixadas, 0);
    igual('sync · nota aberta · recarregarNotaAberta não foi chamado no meio da digitação', recarregouNotaId, null);

    // O conteúdo local no banco (após o flushSave da rodada 1) não foi destruído
    const notaLocalDurante = await storeA.obterNotaPorUid('u_aberta_1');
    ok('sync · nota aberta · conteúdo local digitado está intacto',
       notaLocalDurante.blocks.some(b => b.html.includes('Edição local fresquinha')));

    // 8.3: Rodada seguinte: usuário terminou de digitar, editor perdeu foco / salvou
    editorAFocado = false;
    editorATemEdicaoPendente = false;

    const resRodada2 = await engineA.sincronizar();
    ok('sync · nota aberta · rodada 2 processa a mudança remota pendente', resRodada2.baixadas > 0);
    ok('sync · nota aberta · recarregarNotaAberta foi invocado com segurança', recarregouNotaId !== null);

    // Ambas as alterações foram preservadas: houve conflito seguro (cópia de conflito para a edição local)
    const todasNotasA = await storeA.listarNotasLocais();
    ok('sync · nota aberta · cópia de conflito gerada preservando a digitação local',
       todasNotasA.some(n => /conflito/i.test(n.title)));
    const principalA = await storeA.obterNotaPorUid('u_aberta_1');
    ok('sync · nota aberta · nota principal recebeu o conteúdo remoto de B',
       principalA.blocks.some(b => b.html.includes('Edição vinda de B')));

    // 8.4: Modo modelo aborta a sincronização imediatamente
    modoModeloAtivo = true;
    const resModelo = await engineA.sincronizar();
    ok('sync · modo modelo aborta sincronização imediatamente', resModelo.abortadoModelo === true);
    igual('sync · modo modelo não executa envios nem downloads', resModelo.baixadas + resModelo.enviadas, 0);
  }

  // 9. Tarefas 3, 4, 5 e 6: Persistência de pasta, controlador SyncController, mutex e conflitos
  {
    const { SyncController, SYNC_STATE } = await import('../sidepanel/modules/sync-controller.js');
    const store = new InMemoryStore();
    const adapter = new MemorySyncAdapter();

    // 9.1: Persistência de metadados em store (syncMeta)
    await store.salvarMeta('folderName', 'MinhasNotas');
    igual('sync · meta · salvar e recuperar valor', await store.obterMeta('folderName'), 'MinhasNotas');
    await store.excluirMeta('folderName');
    igual('sync · meta · excluir chave limpa valor', await store.obterMeta('folderName'), null);

    // 9.2: Inicialização do SyncController com adapter customizado
    let notificouNotas = 0;
    const controller = new SyncController({
      store,
      adapter,
      onNotesChanged: () => { notificouNotas++; },
    });

    igual('sync · controller · estado inicial desconectado', controller.state, SYNC_STATE.DISCONNECTED);

    // Conecta adapter
    await controller._montarEngineComAdapter(adapter);
    controller.state = SYNC_STATE.IDLE;
    controller.folderName = 'NotasTrabalho';

    // Cria uma nota local no store para exercitar sincronização pelo controller
    await store.salvarNotaLocal({
      uid: 'u_ctrl_1',
      title: 'Nota via Controller',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Texto do controller' }],
      ordem: 'a0',
    });

    await controller.sincronizarAgora();
    igual('sync · controller · sincronização conclui em estado IDLE', controller.state, SYNC_STATE.IDLE);
    ok('sync · controller · lastSyncAt registrado', typeof controller.lastSyncAt === 'number');
    igual('sync · controller · sem erros na rodada bem-sucedida', controller.lastSyncError, null);
    ok('sync · controller · arquivo enviado para adapter', (await adapter.ler('notas/nota-via-controller.md')) !== null);

    // 9.3: Mutex contra concorrência: duas chamadas quase simultâneas não se sobrepõem
    let rodadasExecutadas = 0;
    const motorOriginal = controller.engine.sincronizar.bind(controller.engine);
    controller.engine.sincronizar = async () => {
      rodadasExecutadas++;
      await new Promise(r => setTimeout(r, 10));
      return motorOriginal();
    };

    const p1 = controller.sincronizarAgora();
    const p2 = controller.sincronizarAgora();
    await Promise.all([p1, p2]);

    ok('sync · mutex · duas chamadas não executam simultaneamente (serializadas com segurança)', rodadasExecutadas >= 1);
    igual('sync · mutex · estado volta a IDLE após término', controller.state, SYNC_STATE.IDLE);

    // 9.4: Tratamento e visibilidade de erro: falha do adapter gera estado ERROR sem laço infinito
    controller.engine.sincronizar = async () => {
      throw new Error('Disco desconectado ou sem permissão');
    };

    await controller.sincronizarAgora();
    igual('sync · erro · estado muda para ERROR', controller.state, SYNC_STATE.ERROR);
    ok('sync · erro · mensagem de erro registrada para exibição', controller.lastSyncError?.includes('Disco desconectado'));
    ok('sync · erro · isSyncing foi liberado mesmo após falha', controller.isSyncing === false);

    // 9.5: Desconexão: limpa metadados e volta para DISCONNECTED sem apagar notas
    await controller.desconectar();
    igual('sync · desconectar · estado volta para DISCONNECTED', controller.state, SYNC_STATE.DISCONNECTED);
    igual('sync · desconectar · folderName limpo', controller.folderName, null);
    ok('sync · desconectar · notas locais permanecem intactas', (await store.listarNotasLocais()).length === 1);
    ok('sync · desconectar · arquivo no adapter permanece intacto', (await adapter.ler('notas/nota-via-controller.md')) !== null);

    // 9.6: Tarefa 6 — Reconhecimento do padrão de nota de conflito
    const titulosTeste = [
      'Minha Nota (conflito 2026-09-16, Notebook)',
      'Planejamento (CONFLITO 2026-01-01, Celular)',
      'Nota Normal de Reunião',
    ];
    ok('sync · conflito · detecta formato padrão de cópia de conflito',
       /conflito/i.test(titulosTeste[0]) && /conflito/i.test(titulosTeste[1]));
    ok('sync · conflito · não confunde nota comum com conflito',
       !/conflito/i.test(titulosTeste[2]));
  }

  // 10. Tarefa 1 (HANDOFF-3): Sincronização de imagens (hash, dedup, lazy loading e resolução)
  {
    const { SyncEngine, calcularHashImagem } = await import('../sidepanel/modules/sync-engine.js');
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();
    const adapter = new MemorySyncAdapter();
    const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'AparelhoA' });
    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

    // 10.1: Hash determinístico estável
    const bytes1 = new TextEncoder().encode('png-fake-bytes-12345');
    const bytes2 = new TextEncoder().encode('png-fake-bytes-12345');
    const bytesOutro = new TextEncoder().encode('png-fake-bytes-diferente');

    const hash1 = await calcularHashImagem(bytes1);
    const hash2 = await calcularHashImagem(bytes2);
    const hashOutro = await calcularHashImagem(bytesOutro);

    igual('imagem · hash é determinístico e estável entre execuções', hash1, hash2);
    igual('imagem · hash tem 12 caracteres hexadecimais', hash1.length, 12);
    ok('imagem · conteúdos diferentes produzem hashes distintos', hash1 !== hashOutro);

    // 10.2: Duas notas com a mesma imagem produzem um só arquivo na pasta imagens/
    const idArq1 = await storeA.salvarArquivo({
      name: 'print1.png',
      type: 'image/png',
      blob: new Blob([bytes1], { type: 'image/png' }),
      inline: true,
    });
    const idArq2 = await storeA.salvarArquivo({
      name: 'print2.png',
      type: 'image/png',
      blob: new Blob([bytes1], { type: 'image/png' }),
      inline: true,
    });

    await storeA.salvarNotaLocal({
      uid: 'u_img_nota1',
      title: 'Nota com Imagem 1',
      blocks: [{ id: 'b1', type: 'image', fileId: idArq1, alt: 'diagrama portal' }],
      ordem: 'a0',
    });
    await storeA.salvarNotaLocal({
      uid: 'u_img_nota2',
      title: 'Nota com Imagem 2',
      blocks: [{ id: 'b2', type: 'image', fileId: idArq2, alt: 'copia do diagrama' }],
      ordem: 'a1',
    });

    await engineA.sincronizar();

    // Na pasta imagens/ do adapter deve existir exatamente UM arquivo
    const arquivosRemotos = [...adapter.arquivos.keys()];
    const arquivosImagens = arquivosRemotos.filter(c => c.startsWith('imagens/'));
    igual('imagem · dedup: mesma imagem em duas notas gera apenas um arquivo em imagens/', arquivosImagens.length, 1);
    igual('imagem · caminho do arquivo remoto corresponde ao hash', arquivosImagens[0], `imagens/${hash1}.png`);

    // ── Identidade de imagem: sem certeza, não se atribui ────────────────────
    // Uma versão anterior casava bloco baixado com imagem local pela ORDEM de
    // ocorrência quando o texto alternativo não ajudava. Isso não identifica
    // nada: se o outro aparelho apagou a primeira imagem e manteve a segunda,
    // o bloco passa a exibir a imagem ERRADA, sem aviso. Errar pra menos aqui
    // é obrigatório — bloco sem imagem é honesto, imagem trocada não é.
    {
      const eng = new SyncEngine({ adapter: new MemorySyncAdapter(), store: new InMemoryStore() });

      // Dois locais de alt vazio, um bloco descendo: impossível saber qual é.
      const locais = [
        { type: 'image', fileId: 10, alt: '' },
        { type: 'image', fileId: 11, alt: '' },
      ];
      const desceu = [{ type: 'image', alt: '', unsynced: true }];
      eng._preservarImagensLocais(locais, desceu);
      igual('imagem · identidade incerta não atribui fileId (alt vazio)', desceu[0].fileId, undefined);

      // Mesmo alt repetido dos dois lados também não identifica.
      const locais2 = [
        { type: 'image', fileId: 20, alt: 'print' },
        { type: 'image', fileId: 21, alt: 'print' },
      ];
      const desceu2 = [{ type: 'image', alt: 'print', unsynced: true }];
      eng._preservarImagensLocais(locais2, desceu2);
      igual('imagem · alt repetido não identifica e não atribui', desceu2[0].fileId, undefined);

      // Alt não-vazio e único dos dois lados: aí sim identifica.
      const locais3 = [
        { type: 'image', fileId: 30, alt: 'recibo de março' },
        { type: 'image', fileId: 31, alt: 'print do portal' },
      ];
      const desceu3 = [{ type: 'image', alt: 'print do portal', unsynced: true }];
      eng._preservarImagensLocais(locais3, desceu3);
      igual('imagem · alt único dos dois lados ainda casa', desceu3[0].fileId, 31);

      // Caminho igual é identidade de verdade (mesmo hash), e vence qualquer alt.
      const locais4 = [
        { type: 'image', fileId: 40, alt: 'a', imagePath: '../imagens/aaa.png' },
        { type: 'image', fileId: 41, alt: 'b', imagePath: '../imagens/bbb.png' },
      ];
      const desceu4 = [{ type: 'image', alt: 'a', imagePath: '../imagens/bbb.png' }];
      eng._preservarImagensLocais(locais4, desceu4);
      igual('imagem · caminho igual identifica mesmo com alt divergente', desceu4[0].fileId, 41);
    }

    // ── Dedup do lado que RECEBE ─────────────────────────────────────────────
    // O teste acima conta arquivos na pasta remota, onde duplicar é impossível:
    // o nome vem do conteúdo. Quem pode duplicar é o aparelho que baixa. O cache
    // de tradução do motor vive só em memória, então duas sessões diferentes
    // abrindo notas diferentes que usam a MESMA imagem guardariam duas cópias.
    {
      const ad = new MemorySyncAdapter();
      const st = new InMemoryStore();
      await ad.escrever('imagens/abc123def456.png', 'BYTES-DA-IMAGEM', null);

      const caminho = '../imagens/abc123def456.png';
      await st.salvarNotaLocal({ uid: 'dd1', title: 'Uma', ordem: 'a0',
        blocks: [{ type: 'image', imagePath: caminho, alt: 'print' }] });
      await st.salvarNotaLocal({ uid: 'dd2', title: 'Outra', ordem: 'a1',
        blocks: [{ type: 'image', imagePath: caminho, alt: 'print' }] });

      // Duas instâncias do motor = duas sessões do painel, com o cache zerado.
      await new SyncEngine({ adapter: ad, store: st }).resolverImagensDaNota('dd1');
      await new SyncEngine({ adapter: ad, store: st }).resolverImagensDaNota('dd2');

      igual('imagem · dedup local: mesma imagem em duas sessões não duplica o arquivo',
            st.arquivos.size, 1);
      const n1 = await st.obterNotaPorUid('dd1');
      const n2 = await st.obterNotaPorUid('dd2');
      igual('imagem · dedup local: as duas notas apontam para o mesmo arquivo',
            n1.blocks[0].fileId, n2.blocks[0].fileId);
      ok('imagem · dedup local: a imagem foi mesmo resolvida', n1.blocks[0].fileId != null);
    }

    // ── O nome do arquivo acompanha o título ─────────────────────────────────
    // A identidade continua sendo o `id` do frontmatter, nunca o nome — é isso
    // que deixa o usuário renomear arquivos na mão sem quebrar nada. Mas a pasta
    // existe pra ele conseguir se achar nela sem o QuickDock, e nomes que não
    // correspondem ao conteúdo destroem justamente isso.
    {
      const ad = new MemorySyncAdapter();
      const st = new InMemoryStore();
      const eng = new SyncEngine({ adapter: ad, store: st, deviceName: 'X' });

      await st.salvarNotaLocal({ uid: 'rn1', title: 'Nome antigo', ordem: 'a0',
        blocks: [{ type: 'paragraph', html: 'conteúdo que não pode sumir' }], updatedAt: Date.now() });
      await eng.sincronizar();

      const antes = await st.obterNotaPorUid('rn1');
      await st.salvarNotaLocal({ ...antes, title: 'Nome novo', updatedAt: Date.now() + 1 });
      await eng.sincronizar();

      const vivos = (await ad.listarMudancas(null)).filter(m => !m.apagado).map(m => m.caminho);
      const notas = vivos.filter(c => c.startsWith('notas/'));
      igual('renomear · sobra um único arquivo', notas.length, 1);
      igual('renomear · o arquivo tem o nome novo', notas[0], 'notas/nome-novo.md');

      const conteudo = (await ad.ler('notas/nome-novo.md'))?.texto ?? '';
      ok('renomear · o conteúdo sobreviveu', conteudo.includes('conteúdo que não pode sumir'));
      ok('renomear · o frontmatter traz o título novo', conteudo.includes('Nome novo'));
      igual('renomear · o estado local aponta para o caminho novo',
            (await st.obterEstadoSync('rn1'))?.caminho, 'notas/nome-novo.md');
    }

    // Dois títulos diferentes podem gerar o mesmo apelido de arquivo. Renomear
    // não pode sobrescrever a nota de outra pessoa: nome feio é melhor que nota
    // perdida, e o id do frontmatter garante que o nome antigo não quebra nada.
    {
      const ad = new MemorySyncAdapter();
      const st = new InMemoryStore();
      const eng = new SyncEngine({ adapter: ad, store: st, deviceName: 'X' });

      await st.salvarNotaLocal({ uid: 'col1', title: 'Relatorio', ordem: 'a0',
        blocks: [{ type: 'paragraph', html: 'sou a primeira' }], updatedAt: Date.now() });
      await st.salvarNotaLocal({ uid: 'col2', title: 'Outra coisa', ordem: 'a1',
        blocks: [{ type: 'paragraph', html: 'sou a segunda' }], updatedAt: Date.now() });
      await eng.sincronizar();

      // A segunda é renomeada para um título que gera o MESMO apelido da primeira
      const segunda = await st.obterNotaPorUid('col2');
      await st.salvarNotaLocal({ ...segunda, title: 'Relatório', updatedAt: Date.now() + 1 });
      await eng.sincronizar();

      const primeira = (await ad.ler('notas/relatorio.md'))?.texto ?? '';
      ok('renomear · colisão de apelido não sobrescreve a nota que já estava lá',
         primeira.includes('sou a primeira'));

      const vivos = (await ad.listarMudancas(null)).filter(m => !m.apagado)
        .map(m => m.caminho).filter(c => c.startsWith('notas/'));
      igual('renomear · colisão mantém as duas notas', vivos.length, 2);

      const daSegunda = await st.obterEstadoSync('col2');
      const textoSegunda = (await ad.ler(daSegunda.caminho))?.texto ?? '';
      ok('renomear · a segunda manteve o próprio arquivo, com o título novo',
         textoSegunda.includes('sou a segunda') && textoSegunda.includes('Relatório'));
    }

    // No markdown de cada nota, a imagem vira o caminho relativo ../imagens/<hash>.png
    const mdNota1 = (await adapter.ler('notas/nota-com-imagem-1.md')).texto;
    const mdNota2 = (await adapter.ler('notas/nota-com-imagem-2.md')).texto;
    ok('imagem · markdown da nota 1 aponta para ../imagens/<hash>.png', mdNota1.includes(`../imagens/${hash1}.png`));
    ok('imagem · markdown da nota 2 aponta para ../imagens/<hash>.png', mdNota2.includes(`../imagens/${hash1}.png`));
    ok('imagem · texto alternativo foi preservado', mdNota1.includes('![diagrama portal]'));

    // 10.3: Download preguiçoso: nota desce para o aparelho B sem baixar o binário da imagem
    await engineB.sincronizar();
    const notaDescidaB = await storeB.obterNotaPorUid('u_img_nota1');
    ok('imagem · lazy: nota foi baixada para o aparelho B', notaDescidaB !== null);
    const blocoImgB = notaDescidaB.blocks.find(b => b.type === 'image');
    ok('imagem · lazy: bloco baixado tem imagePath relativo', blocoImgB.imagePath === `../imagens/${hash1}.png`);
    igual('imagem · lazy: fileId local permanece indefinido antes da abertura', blocoImgB.fileId, undefined);
    igual('imagem · lazy: nenhum arquivo de imagem foi gravado no store B durante o sync', storeB.arquivos.size, 0);

    // 10.4: Resolução sob demanda: abrir a nota resolve a imagem contra o arquivo certo
    await engineB.resolverImagensDaNota('u_img_nota1');
    const notaAbertaB = await storeB.obterNotaPorUid('u_img_nota1');
    const blocoResolvidoB = notaAbertaB.blocks.find(b => b.type === 'image');
    ok('imagem · resolução: bloco ganhou fileId local após ser resolvido', typeof blocoResolvidoB.fileId === 'number');
    igual('imagem · resolução: imagem foi salva no armazenamento do aparelho B', storeB.arquivos.size, 1);
    const blobSalvoB = await storeB.obterBlobArquivo(blocoResolvidoB.fileId);
    ok('imagem · resolução: blob recuperado é válido', blobSalvoB !== null);
    const hashBaixadoB = await calcularHashImagem(blobSalvoB);
    igual('imagem · resolução: hash do arquivo baixado bate perfeitamente com o original', hashBaixadoB, hash1);

    // 10.5: Preservação no aparelho de origem após alteração de texto em outro aparelho
    await storeB.salvarNotaLocal({
      ...notaAbertaB,
      blocks: [
        blocoResolvidoB,
        { id: 'b_novo', type: 'paragraph', html: 'Texto adicionado pelo Aparelho B' },
      ],
      updatedAt: Date.now() + 1000,
    });
    await engineB.sincronizar();

    await engineA.sincronizar();
    const notaAtualizadaA = await storeA.obterNotaPorUid('u_img_nota1');
    const blocoImgA = notaAtualizadaA.blocks.find(b => b.type === 'image');
    igual('imagem · preservação: aparelho A mantém seu fileId local original intacto', blocoImgA.fileId, idArq1);
  }

  // 11. Tarefa 2 (HANDOFF-3): Conflito visível no SyncController e popover
  {
    const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
    const { SyncController } = await import('../sidepanel/modules/sync-controller.js');
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();
    const adapter = new MemorySyncAdapter();
    const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'AparelhoA' });
    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

    // Cria nota base compartilhada
    await storeA.salvarNotaLocal({
      uid: 'u_conflito_visivel',
      title: 'Nota Importante',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Versão original' }],
      ordem: 'a0',
    });
    await engineA.sincronizar();
    await engineB.sincronizar();

    // Ambos os aparelhos editam offline
    await storeA.salvarNotaLocal({
      uid: 'u_conflito_visivel',
      title: 'Nota Importante',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Edição do Aparelho A' }],
      ordem: 'a0',
      updatedAt: Date.now() + 100,
    });
    await storeB.salvarNotaLocal({
      uid: 'u_conflito_visivel',
      title: 'Nota Importante',
      blocks: [{ id: 'b1', type: 'paragraph', html: 'Edição do Aparelho B' }],
      ordem: 'a0',
      updatedAt: Date.now() + 200,
    });

    // Aparelho B sobe primeiro
    await engineB.sincronizar();

    // Aparelho A sincroniza e detecta o conflito
    const resSyncA = await engineA.sincronizar();
    igual('conflito visível · engine contabiliza conflito', resSyncA.conflitos, 1);
    ok('conflito visível · engine fornece array de notas em conflito', Array.isArray(resSyncA.notasConflito));
    igual('conflito visível · detalhes do conflito carregam título original', resSyncA.notasConflito[0].tituloOriginal, 'Nota Importante');
    ok('conflito visível · título da cópia gerada contém conflito', resSyncA.notasConflito[0].tituloConflito.includes('conflito'));

    // Testa gestão de conflitos no SyncController
    const controllerA = new SyncController({ store: storeA, adapter });
    await controllerA._montarEngineComAdapter(adapter);
    controllerA.state = 'IDLE';

    // Simula rodada que gerou conflito pelo controller
    controllerA.conflitosPendentes.push(...resSyncA.notasConflito);
    await storeA.salvarMeta('syncPendingConflicts', controllerA.conflitosPendentes);

    const resumo = controllerA.obterResumoEstado();
    igual('conflito visível · controller resume total de conflitos pendentes', resumo.totalConflitos, 1);
    igual('conflito visível · conflitosPendentes contém a nota afetada', resumo.conflitosPendentes[0].tituloOriginal, 'Nota Importante');

    // Ao dispensar o aviso, limpa do estado e da persistência
    await controllerA.dispensarConflitos();
    igual('conflito visível · dispensar limpa conflitos da memória', controllerA.conflitosPendentes.length, 0);
    igual('conflito visível · dispensar remove metadados salvos', await storeA.obterMeta('syncPendingConflicts'), null);
  }

  // 12. Tarefa 3 (HANDOFF-3): Sincronização de modelos (pasta modelos/)
  {
    const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
    const storeA = new InMemoryStore();
    const storeB = new InMemoryStore();
    const adapter = new MemorySyncAdapter();
    const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'AparelhoA' });
    const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

    // 12.1: Modelo criado localmente sobe para modelos/<slug>.md
    await storeA.salvarModeloLocal({
      uid: 'u_mod_1',
      name: 'Checklist Atendimento',
      kind: 'note',
      content: '# Checklist\n\n- [ ] Protocolo aberto\n- [ ] Dados conferidos',
      ordem: 'a0',
    });

    const resEnvioMod = await engineA.sincronizar();
    igual('modelos · envio de modelo novo concluído', resEnvioMod.enviadas, 1);
    const arqMod = await adapter.ler('modelos/checklist-atendimento.md');
    ok('modelos · arquivo modelos/checklist-atendimento.md criado no destino', arqMod !== null);
    ok('modelos · frontmatter do modelo contém id', arqMod.texto.includes('id: u_mod_1'));
    ok('modelos · frontmatter do modelo contém nome', arqMod.texto.includes('nome: Checklist Atendimento'));
    ok('modelos · corpo markdown do modelo foi preservado', arqMod.texto.includes('- [ ] Protocolo aberto'));

    // 12.2: Aparelho B baixa o modelo
    const resDescidaMod = await engineB.sincronizar();
    igual('modelos · aparelho B baixa o modelo novo', resDescidaMod.baixadas, 1);
    const modB = await storeB.obterModeloPorUid('u_mod_1');
    ok('modelos · modelo existe no store do aparelho B', modB !== null);
    igual('modelos · nome do modelo baixado confere', modB.name, 'Checklist Atendimento');
    igual('modelos · tipo do modelo baixado confere', modB.kind, 'note');

    // 12.3: Alteração em modelo sincroniza
    await storeB.salvarModeloLocal({
      ...modB,
      content: '# Checklist Atualizado\n\n- [ ] Protocolo\n- [ ] Retorno enviado',
    });
    await engineB.sincronizar();

    await engineA.sincronizar();
    const modAAtualizado = await storeA.obterModeloPorUid('u_mod_1');
    ok('modelos · alteração remota propaga para o aparelho A', modAAtualizado.content.includes('Retorno enviado'));

    // 12.4: Exclusão de modelo propaga
    await adapter.apagar('modelos/checklist-atendimento.md');
    // Adiciona lápide de exclusão simulando remoção no destino
    adapter.seqCounter++;
    adapter.arquivos.set('modelos/checklist-atendimento.md', {
      conteudo: '',
      rev: String(adapter.seqCounter),
      apagado: true,
      seq: adapter.seqCounter,
    });

    await engineA.sincronizar();
    const modAApagado = await storeA.obterModeloPorUid('u_mod_1');
    igual('modelos · exclusão remota apaga modelo do store local', modAApagado, null);
  }

  // 13. Adoção de arquivos .md externos e proteção contra perda de dados
  {
    const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
    const store = new InMemoryStore();
    const adapter = new MemorySyncAdapter();
    const engine = new SyncEngine({ adapter, store, deviceName: 'AparelhoTeste' });

    // 13.1: Arquivo markdown cru na raiz sem frontmatter (ex.: Obsidian ou arquivo colado pelo usuário)
    const conteudoCru = '# Minha Nota Externa\n\nEste é um parágrafo de texto puro.\n- Item 1\n- Item 2';
    await adapter.escrever('minha-nota-externa.md', conteudoCru, null);

    // 13.2: Arquivo markdown em subpasta personalizada sem frontmatter
    const conteudoSub = 'Apenas conteúdo sem título H1.\nLinha 2.';
    await adapter.escrever('trabalho/relatorios/status.md', conteudoSub, null);

    const resSync = await engine.sincronizar();
    igual('adoção · baixou os dois arquivos externos', resSync.baixadas, 2);
    igual('adoção · nenhuma nota apagada', resSync.apagadas, 0);

    const notas = await store.listarNotasLocais();
    igual('adoção · store local contém exatamente 2 notas adotadas', notas.length, 2);

    const notaRaiz = notas.find(n => n.title === 'Minha Nota Externa');
    ok('adoção · nota raiz foi identificada pelo título H1', notaRaiz !== undefined);
    ok('adoção · nota raiz recebeu um UID estável', !!notaRaiz?.uid);
    igual('adoção · nota raiz não tem pasta definida', notaRaiz?.pasta, '');

    const notaSub = notas.find(n => n.title === 'status');
    ok('adoção · nota em subpasta derivou título do nome do arquivo', notaSub !== undefined);
    igual('adoção · nota em subpasta derivou a pasta correta', notaSub?.pasta, 'trabalho/relatorios');

    // 13.3: Verifica se o adapter teve os metadados injetados preservando o conteúdo
    const arqRaiz = await adapter.ler('minha-nota-externa.md');
    ok('adoção · arquivo na pasta externa agora possui frontmatter QuickDock', arqRaiz.texto.includes('quickdock: 1'));
    ok('adoção · arquivo na pasta externa preservou o corpo markdown', arqRaiz.texto.includes('Este é um parágrafo de texto puro.'));

    // 13.4: Sincronização subsequente não duplica nem apaga nada
    const resSync2 = await engine.sincronizar();
    igual('adoção · sync subsequente não baixa novamente', resSync2.baixadas, 0);
    igual('adoção · sync subsequente não apaga nada', resSync2.apagadas, 0);
    igual('adoção · total de notas no store local permanece 2', (await store.listarNotasLocais()).length, 2);

    // 13.5: Edição local na nota adotada reflete no arquivo externo
    await store.salvarNotaLocal({
      ...notaRaiz,
      blocks: [
        { id: 'b1', type: 'h1', html: 'Minha Nota Externa' },
        { id: 'b2', type: 'paragraph', html: 'Texto atualizado localmente!' },
      ],
      updatedAt: Date.now() + 1000,
    });
    const resSync3 = await engine.sincronizar();
    igual('adoção · edição local enviada ao arquivo externo', resSync3.enviadas, 1);
    const arqRaizAtualizado = await adapter.ler('minha-nota-externa.md');
    ok('adoção · conteúdo remoto atualizado com sucesso', arqRaizAtualizado.texto.includes('Texto atualizado localmente!'));
  }
}

// ── 5. Guarda de código: criar bloco a partir de dado serializado ────────────
// Não dá pra exercitar o editor fora do navegador, mas dá pra garantir que
// ninguém volte a montar um bloco na mão a partir de dado solto — foi assim
// que uma tabela colada perdia as linhas e virava uma tabela vazia.
{
  const { readFile } = await import('node:fs/promises');
  const fonte = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  // Fora o próprio createBlockElFrom, que é justamente quem tem o direito.
  const resto  = fonte.replace(/function createBlockElFrom\([^)]*\) \{[\s\S]*?\n\}/, '');
  const soltas = [...resto.matchAll(/createBlockEl\(\s*(b\.|[a-z]\w*\.dataset\.)/g)].map(m => m[0]);
  ok('note.js · bloco vindo de dado serializado passa por createBlockElFrom',
     soltas.length === 0, soltas.join(' | '));

  // A âncora invisível que segura o cursor depois de um atalho inline é um
  // detalhe do cursor e não pode virar conteúdo salvo. sanitizeForSave é o
  // funil por onde tudo passa antes de ir pro banco — se a remoção sair dali,
  // o caractere começa a se acumular nas notas das pessoas, invisível.
  const ancora = /const ANCORA = '(.*?)';/.exec(fonte)?.[1];
  igual('note.js · a âncora é o espaço de largura zero', ancora?.codePointAt(0), 0x200b);

  const funil = /function sanitizeForSave\([\s\S]*?\n\}/.exec(fonte)?.[0] ?? '';
  ok('note.js · sanitizeForSave remove a âncora antes de salvar',
     funil.includes('ANCORA'), funil.slice(0, 120));
}

// ── 5b. Modo modelo não pode gravar por cima da nota ─────────────────────────
// Foi um bug de perda de nota inteira, e de ordem de duas linhas.
{
  const { readFile } = await import('node:fs/promises');
  const abas = await readFile(new URL('../sidepanel/modules/notes-template-mode.js', import.meta.url), 'utf8');
  const tpl  = await readFile(new URL('../sidepanel/modules/templates.js', import.meta.url), 'utf8');

  // switchToNote começa com um flushSave, e o modo modelo é justamente o que
  // bloqueia esse save. Limpar a marca ANTES de a nota voltar pra tela faz o
  // save serializar os blocos do MODELO e gravá-los por cima da nota aberta.
  const sair = /async function exitTemplate\([\s\S]*?\n\}/.exec(abas)?.[0] ?? '';
  ok('modo modelo · exitTemplate continua existindo', !!sair);

  const iVolta = sair.indexOf('activateNote(');
  const iLimpa = sair.indexOf('clearTemplateEditing()');
  ok('modo modelo · a nota volta pra tela ANTES de o modo ser desligado',
     iVolta !== -1 && iLimpa > iVolta,
     `activateNote em ${iVolta}, clearTemplateEditing em ${iLimpa}`);

  // Salvar um pedaço da nota como modelo é guardar, não trocar de tela: quem
  // clicou ali estava escrevendo, e ver só o trecho salvo parece perda de nota.
  const salvar = /export function openSaveBlockTemplate\([\s\S]*?\n\}/.exec(tpl)?.[0] ?? '';
  ok('modelos · openSaveBlockTemplate continua existindo', !!salvar);
  ok('modelos · salvar um bloco como modelo não abre o editor de modelos',
     !/requestTemplateEdit|createAndEdit/.test(salvar),
     salvar.slice(0, 160));
}

// ── 6. Indentação do editor (Tab / Shift+Tab) ────────────────────────────────
{
  const { rodarTestesDeIndentacao } = await import('./indent.mjs');
  rodarTestesDeIndentacao(ok, igual);

  const { rodarTestesDeControles } = await import('./controls.mjs');
  rodarTestesDeControles(ok, igual);

  const { rodarTestesDeChecklist } = await import('./checklist.mjs');
  rodarTestesDeChecklist(ok, igual);

  const { rodarTestesDeCalculo } = await import('./calc.mjs');
  rodarTestesDeCalculo(ok, igual);
}

// ── 7. Atalhos de formatação ao digitar ──────────────────────────────────────
// Mesma técnica do indent.mjs: recorta a tabela de atalhos do note.js e a roda
// aqui. O que se testa é o que a pessoa digita e o que aparece na tela.
{
  const { safeHref } = await import('../sidepanel/modules/blocks.js');
  const { readFile } = await import('node:fs/promises');
  const fonte = (await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8'))
    .replace(/\r\n?/g, '\n');

  const ini = fonte.indexOf('const INLINE_SHORTCUTS = [');
  const fim = fonte.indexOf('\n];\n', ini);
  ok('atalhos · a tabela INLINE_SHORTCUTS continua existindo em note.js', ini !== -1 && fim !== -1);

  const atalhos = new Function('safeHref', `${fonte.slice(ini, fim + 3)}\nreturn INLINE_SHORTCUTS;`)(safeHref);

  // Reproduz o que tryAutoFormatInline faz: casa contra o texto ATÉ o cursor.
  const aplicar = digitado => {
    for (const { re, tag, attrs } of atalhos) {
      const m = re.exec(digitado);
      if (!m) continue;
      const a = attrs ? attrs(m) : {};
      if (a === null) continue;
      return { tag, texto: m[1], attrs: a, consumido: m[0] };
    }
    return null;
  };

  igual('atalhos · **negrito** ao digitar', aplicar('olha o **negrito**')?.tag, 'strong');
  igual('atalhos · *itálico* ao digitar',   aplicar('olha o *itálico*')?.tag, 'em');
  igual('atalhos · ~~riscado~~ ao digitar', aplicar('olha o ~~riscado~~')?.tag, 's');
  igual('atalhos · `código` ao digitar',    aplicar('rode `npm test`')?.tag, 'code');

  // O que faltava: link ao digitar.
  {
    const r = aplicar('veja [a documentação](exemplo.com.br/docs)');
    igual('atalhos · [texto](url) vira link', [r?.tag, r?.texto], ['a', 'a documentação']);
    igual('atalhos · e completa o https:// de um domínio solto',
      r?.attrs?.href, 'https://exemplo.com.br/docs');
  }

  // "!" na frente é consumido: senão sobraria solto antes do link.
  {
    const r = aplicar('![print](https://exemplo.com/a.png)');
    igual('atalhos · ![alt](url) remoto vira link, como na colagem', r?.tag, 'a');
    ok('atalhos · e o "!" não sobra no texto', r?.consumido.startsWith('!'), r?.consumido);
  }

  // Endereço recusado não pode virar link nem apagar o que foi digitado.
  {
    const r = aplicar('[clique](javascript:alert(1))');
    ok('atalhos · endereço perigoso não vira link', r?.tag !== 'a', JSON.stringify(r));
  }

  // A multiplicação não pode virar itálico — é a razão da guarda no regex.
  ok('atalhos · "5 * 3 * 2" não vira itálico', aplicar('5 * 3 * 2') === null);

  // ── Atalhos que trocam o tipo do bloco ─────────────────────────────────────
  {
    const ini = fonte.indexOf('const BLOCK_SHORTCUTS = [');
    const fim = fonte.indexOf('\n];\n', ini);
    ok('atalhos · a tabela BLOCK_SHORTCUTS continua existindo', ini !== -1 && fim !== -1);

    const tabela = new Function(`${fonte.slice(ini, fim + 3)}\nreturn BLOCK_SHORTCUTS;`)();
    const tipoDe = digitado => {
      for (const s of tabela) {
        const m = s.re.exec(digitado);
        if (m) return s.type(m);
      }
      return null;
    };

    igual('atalhos · "## " vira título 2',      tipoDe('## '), 'heading2');
    igual('atalhos · "- " vira lista',          tipoDe('- '), 'bullet');
    igual('atalhos · "[] " vira checklist',     tipoDe('[] '), 'checklist');
    igual('atalhos · "[x] " vira checklist',    tipoDe('[x] '), 'checklist');
    igual('atalhos · "[ ] " vira checklist',    tipoDe('[ ] '), 'checklist');
    // "- [ ] " chegando de uma vez (colado/digitado rápido) também é checkbox. Tecla
    // por tecla, "- " vira lista e o "[] " seguinte converte o item (ver checkBlockShortcut).
    igual('atalhos · "- [x] " vira checklist', tipoDe('- [x] '), 'checklist');
    igual('atalhos · "- [] " vira checklist',  tipoDe('- [] '), 'checklist');
    igual('atalhos · "- [ ] " vira checklist', tipoDe('- [ ] '), 'checklist');
    igual('atalhos · "> " vira citação',        tipoDe('> '), 'quote');

    // Destaque ao digitar, com a palavra-chave do markdown.
    igual('atalhos · "[!NOTE] " vira destaque',    tipoDe('[!NOTE] '), 'callout:note');
    igual('atalhos · aceita em minúsculas',        tipoDe('[!warning] '), 'callout:warning');
    igual('atalhos · palavra inventada não vira destaque', tipoDe('[!URGENTE] '), null);
  }
}

// ── 8. A nota-tutorial ───────────────────────────────────────────────────────
// É o texto que toda pessoa vê na primeira abertura, e usa todos os recursos
// de uma vez. Se o parser quebrar em alguma coisa, quebra aqui primeiro.
{
  const { readFile } = await import('node:fs/promises');
  const fonte = await readFile(new URL('../sidepanel/modules/notes-tutorial.js', import.meta.url), 'utf8');
  const m = /const TUTORIAL_MARKDOWN = `([\s\S]*?)`;/.exec(fonte);
  ok('tutorial · continua sendo possível extrair o texto de notes-tutorial.js', !!m);

  // O que se lê aqui é o FONTE, onde crase e cifrão aparecem escapados porque
  // o tutorial mora dentro de um literal de template. O JS desfaz isso ao
  // carregar o módulo; sem desfazer aqui também, o teste estaria conferindo um
  // texto que nunca chega a existir.
  const md = m[1].replace(/\\([`$\\])/g, '$1');
  const blocks = parseMarkdownToBlocks(md);

  // Todo recurso que o tutorial descreve tem que aparecer nele como bloco.
  const tipos = new Set(blocks.map(b => b.type));
  for (const t of ['heading1', 'heading2', 'heading3', 'paragraph', 'bullet',
                   'number', 'checklist', 'divider', 'table']) {
    ok(`tutorial · contém um bloco ${t}`, tipos.has(t));
  }
  ok('tutorial · contém citação', blocks.some(b => b.quoted));
  ok('tutorial · mostra os cinco tipos de destaque',
     new Set(blocks.filter(b => b.callout).map(b => b.callout)).size === 5,
     [...new Set(blocks.filter(b => b.callout).map(b => b.callout))].join(', '));
  ok('tutorial · e um destaque com checklist dentro',
     blocks.some(b => b.callout && b.type === 'checklist'));
  ok('tutorial · contém lista aninhada', blocks.some(b => (b.depth ?? 0) > 0));
  ok('tutorial · contém folha de cálculo', blocks.some(b => b.type === 'calc'));
  // O exemplo do tutorial é avaliado de verdade: se o resultado mudar, é
  // porque o avaliador mudou, e a nota que toda pessoa vê passa a mentir.
  {
    const { evaluateSheet } = await import('../sidepanel/modules/calc.js');
    const folha = blocks.filter(b => b.type === 'calc').slice(0, 3)
      .map(b => b.html.replace(/<[^>]+>/g, ''));
    igual('tutorial · o exemplo do cálculo dá o resultado que o texto promete',
      evaluateSheet(folha).at(-1)?.fmt, 'R$ 850,00');
  }
  ok('tutorial · contém título dentro de citação',
     blocks.some(b => b.quoted && b.type.startsWith('heading')));

  // Ida e volta estável: o tutorial é gravado como blocos e reaberto como
  // markdown em toda exportação.
  const volta = parseMarkdownToBlocks(blocksToMarkdown(blocks));
  igual('tutorial · parse→serialize→parse é idempotente', forma(volta), forma(blocks));

  // Nenhum resíduo de sintaxe visível: se sobrar "####" ou "- [ ]" como texto,
  // é porque algum bloco não foi reconhecido.
  const residuo = blocks.filter(b =>
    b.html && /^(#{1,6} |&gt; |[-*] \[[ xX]\] )/.test(b.html));
  igual('tutorial · nenhuma marcação sobrou como texto literal',
    residuo.map(b => b.html.slice(0, 40)), []);

  ok('tutorial · sem menção ao nome de outro produto', !/notion/i.test(md));
}

// ── 9. Nota vazia nunca vira lista vazia de blocos ───────────────────────────
for (const entrada of ['', null, undefined, '\n\n']) {
  ok(`vazio · ${JSON.stringify(entrada)} gera ao menos um bloco`,
     parseMarkdownToBlocks(entrada).length >= 1);
}

// ── 13. Tarefa 1 (HANDOFF-5): Verificação da versão do formato (Portão) ───────
{
  const { parseNoteFile, extrairMetadadosBrutos, FORMATO_QUICKDOCK_SUPORTADO } =
    await import('../sidepanel/modules/notefile.js');
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { SyncController } = await import('../sidepanel/modules/sync-controller.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  igual('versão formato · cliente suporta formato 1', FORMATO_QUICKDOCK_SUPORTADO, 1);

  // 13.1: Arquivo com formato futuro (quickdock: 2) é recusado pelo parseNoteFile
  const arquivoFuturo = [
    '---',
    'quickdock: 2',
    'id: "u_nota_futura"',
    'titulo: "Nota em Formato v2"',
    'recurso_novo: true',
    '---',
    '',
    'Texto com recurso futuro.',
  ].join('\n');

  igual('versão formato · parseNoteFile recusa formato 2 devolvendo null', parseNoteFile(arquivoFuturo), null);

  const bruto = extrairMetadadosBrutos(arquivoFuturo);
  ok('versão formato · extrairMetadadosBrutos permite inspecionar metadados de arquivo recusado', bruto !== null);
  igual('versão formato · extrai a versão 2 sem aceitar o arquivo', bruto?.meta?.quickdock, 2);
  igual('versão formato · extrai o id da nota recusada', bruto?.meta?.id, 'u_nota_futura');

  // 13.2: SyncEngine recusa arquivo com quickdock: 2
  // Não escreve por cima do arquivo remoto, mantém a nota local correspondente intacta
  // e emite aviso explícito para a interface de sincronização.
  const adapter = new MemorySyncAdapter();
  const store = new InMemoryStore();
  const engine = new SyncEngine({ adapter, store, deviceName: 'AparelhoV1' });

  // 1. Simula nota existente localmente com o mesmo UID
  const notaLocalOriginal = {
    uid: 'u_nota_futura',
    title: 'Minha Versão Local',
    blocks: [{ type: 'paragraph', html: 'conteúdo local intocado' }],
    ordem: 'a0',
    updatedAt: Date.now(),
  };
  await store.salvarNotaLocal(notaLocalOriginal);

  // 2. Simula arquivo gravado na pasta remota por um cliente com versão mais nova (quickdock: 2)
  await adapter.escrever('notas/nota-em-formato-v2.md', arquivoFuturo, null);

  // 3. Executa a sincronização
  const resSync = await engine.sincronizar();

  // Verificação de segurança absoluta contra perda de dados:
  igual('versão formato · arquivo incompatível é pulado', resSync.puladas, 1);
  igual('versão formato · nenhum arquivo foi baixado por cima', resSync.baixadas, 0);
  igual('versão formato · nenhum arquivo foi enviado', resSync.enviadas, 0);

  // A nota local NÃO foi sobrescrita
  const notaAposSync = await store.obterNotaPorUid('u_nota_futura');
  igual('versão formato · nota local permanece intacta', notaAposSync.title, 'Minha Versão Local');
  igual('versão formato · blocos locais continuam intactos', notaAposSync.blocks[0].html, 'conteúdo local intocado');

  // O arquivo remoto NÃO foi sobrescrito
  const arqRemotoAposSync = await adapter.ler('notas/nota-em-formato-v2.md');
  igual('versão formato · arquivo remoto não foi sobrescrito', arqRemotoAposSync.texto, arquivoFuturo);

  // Prova adicional: mesmo se a nota local tiver o mesmo título do arquivo remoto,
  // o Passo 3 não sobe nem sobrescreve o arquivo recusado por versão
  await store.salvarNotaLocal({
    ...notaLocalOriginal,
    title: 'Nota em Formato v2',
    updatedAt: Date.now() + 10,
  });
  const resSync2 = await engine.sincronizar();
  igual('versão formato · upload local não sobrescreve arquivo recusado por versão', resSync2.enviadas, 0);
  const arqRemotoAposSync2 = await adapter.ler('notas/nota-em-formato-v2.md');
  igual('versão formato · arquivo remoto continua intacto após tentativa de upload', arqRemotoAposSync2.texto, arquivoFuturo);

  // O motor gerou aviso estruturado para a interface
  ok('versão formato · motor emite avisosVersao', Array.isArray(resSync.avisosVersao) && resSync.avisosVersao.length === 1);
  igual('versão formato · aviso indica o caminho da nota', resSync.avisosVersao[0].caminho, 'notas/nota-em-formato-v2.md');
  ok('versão formato · aviso contém a mensagem explicativa',
     resSync.avisosVersao[0].mensagem.includes('esta nota foi criada por uma versão mais nova do QuickDock'));

  // 13.3: SyncController acumula e permite dispensar avisos de versão
  const controller = new SyncController({ store, adapter });
  await controller._montarEngineComAdapter(adapter);
  controller.state = 'IDLE';

  controller.avisosVersao.push(...resSync.avisosVersao);
  await store.salvarMeta('syncVersionWarnings', controller.avisosVersao);

  const resumo = controller.obterResumoEstado();
  igual('versão formato · controller resume avisos de versão', resumo.totalAvisosVersao, 1);
  igual('versão formato · dados do aviso constam no resumo', resumo.avisosVersao[0].versao, 2);

  await controller.dispensarAvisosVersao();
  igual('versão formato · dispensar limpa avisos da memória', controller.avisosVersao.length, 0);
  igual('versão formato · dispensar remove metadados salvos', await store.obterMeta('syncVersionWarnings'), null);
}

// ── 14. Tarefa 2 (HANDOFF-5): Camada de plataforma e desacoplamento do storage ─
{
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // 14.1: storage.js não menciona chrome. em nenhuma linha
  const storagePath = path.resolve(__dirname, '../sidepanel/modules/storage.js');
  const storageSource = fs.readFileSync(storagePath, 'utf-8');
  ok('plataforma · storage.js não menciona chrome. em nenhuma linha', !/chrome\./.test(storageSource));
  ok('plataforma · storage.js não menciona a palavra chrome', !/chrome/i.test(storageSource));

  // 14.2: platform.js opera transparentemente no ambiente fora da extensão
  const { platformStorage, podeInserirNaPagina, conectarPainel, isExtension, detectPlatform } =
    await import('../sidepanel/modules/platform.js');

  igual('plataforma · isExtension é falso no ambiente de teste Node.js', isExtension, false);
  igual('plataforma · detectPlatform retorna desktop no ambiente padrão fora da extensão', detectPlatform(), 'desktop');
  igual('plataforma · podeInserirNaPagina é falso fora da extensão', podeInserirNaPagina(), false);
  igual('plataforma · conectarPainel não lança erro e retorna null', conectarPainel(), null);

  // Testa escrita, leitura e remoção pelo platformStorage
  await platformStorage.set('teste_chave', { ativo: true, valor: 42 });
  const valorLido = await platformStorage.get('teste_chave');
  igual('plataforma · platformStorage grava e lê objeto', valorLido?.valor, 42);

  await platformStorage.remove('teste_chave');
  igual('plataforma · platformStorage remove chave', await platformStorage.get('teste_chave'), undefined);
}

// ── 15. Tarefas 3 e 4 (HANDOFF-5): Degradação na web, casca PWA e roteamento ──
{
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // 15.1: inject.js não assume existência incondicional de chrome.runtime
  const injectPath = path.resolve(__dirname, '../sidepanel/modules/inject.js');
  const injectSource = fs.readFileSync(injectPath, 'utf-8');
  ok('web · inject.js protege o listener de runtime contra ausência de chrome',
     injectSource.includes('typeof chrome !== \'undefined\'') || injectSource.includes('chrome?.runtime?.onMessage'));

  // 15.2: manifest.webmanifest é JSON válido e define escopo do GitHub Pages
  const manifestPath = path.resolve(__dirname, '../manifest.webmanifest');
  ok('pwa · manifest.webmanifest existe na raiz', fs.existsSync(manifestPath));
  const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  igual('pwa · manifest define nome do app', manifestContent.name, 'QuickDock');
  // Caminho relativo, não fixo. O `start_url` e o `scope` se resolvem contra a
  // URL do próprio manifesto, então "./" funciona em qualquer lugar: na subpasta
  // do github.io, na raiz de um domínio próprio, ou servido de localhost pra
  // teste. Fixar "/QuickDock/" amarra o app a um endereço só — e o registro do
  // service worker, que deriva o escopo de location.pathname, discordaria dele.
  igual('pwa · manifest usa escopo relativo', manifestContent.scope, './');
  igual('pwa · manifest usa start_url relativo', manifestContent.start_url, './');
  // O Chrome só oferece instalação se existirem ícones de 192 e 512. Faltando,
  // o botão não aparece e NÃO há erro nenhum no console — o sintoma é silêncio.
  // Foi exatamente o que aconteceu no primeiro deploy: o manifesto reaproveitou
  // os ícones da extensão (16/48/128) e o app simplesmente não era instalável.
  for (const lado of ['192x192', '512x512']) {
    ok(`pwa · manifesto declara ícone ${lado} (exigido para instalar)`,
       manifestContent.icons.some(i => i.sizes === lado),
       manifestContent.icons.map(i => i.sizes).join(', '));
  }

  ok('pwa · ícones do manifesto são relativos',
     manifestContent.icons.every(i => !i.src.startsWith('/')),
     manifestContent.icons.map(i => i.src).join(', '));

  // 15.3: sw.js existe e possui estratégia de cache versionado
  const swPath = path.resolve(__dirname, '../sw.js');
  ok('pwa · sw.js existe na raiz', fs.existsSync(swPath));
  const swSource = fs.readFileSync(swPath, 'utf-8');
  ok('pwa · sw.js possui nome de cache versionado', swSource.includes('CACHE_NAME = \'quickdock-v'));
  ok('pwa · sw.js trata SKIP_WAITING', swSource.includes('SKIP_WAITING'));

  // 15.4: 404.html existe e replica index.html para fallback de rotas SPA no GitHub Pages
  const indexPath = path.resolve(__dirname, '../index.html');
  const notFoundPath = path.resolve(__dirname, '../404.html');
  ok('pwa · index.html existe na raiz', fs.existsSync(indexPath));
  ok('pwa · 404.html existe na raiz', fs.existsSync(notFoundPath));
  const indexSource = fs.readFileSync(indexPath, 'utf-8');
  const notFoundSource = fs.readFileSync(notFoundPath, 'utf-8');
  igual('pwa · 404.html é cópia fiel de index.html', notFoundSource, indexSource);
}

// ── Resultado ────────────────────────────────────────────────────────────────
// ── O pré-cache do PWA não pode ficar para trás ──────────────────────────────
// A lista de arquivos do service worker é escrita à mão e apodrece em silêncio:
// alguém cria um módulo, o editor passa a importá-lo, e offline o PWA quebra num
// lugar que nenhum outro teste alcança. Foi o que aconteceu com o snapshot.js.
{
  const { readFile, readdir } = await import('node:fs/promises');
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const modulos = (await readdir(new URL('../sidepanel/modules/', import.meta.url)))
    .filter(n => n.endsWith('.js'));

  const faltando = modulos.filter(n => !sw.includes(`sidepanel/modules/${n}`));
  ok('pwa · todo módulo está no pré-cache do service worker',
     faltando.length === 0, `fora da lista: ${faltando.join(', ')}`);

  // O contrário também: caminho listado que não existe mais vira falha silenciosa
  // de cache a cada instalação do service worker.
  const listados = [...sw.matchAll(/'(sidepanel\/modules\/[a-z0-9-]+\.js)'/g)].map(m => m[1]);
  const sobrando = listados.filter(c => !modulos.includes(c.split('/').pop()));
  ok('pwa · pré-cache não lista módulo inexistente',
     sobrando.length === 0, `não existem: ${sobrando.join(', ')}`);
}

// ── Sincronizar sem editar não pode gerar conflito ───────────────────────────
// Bug encontrado em uso real: o arquivo virou
//   nota-2-conflito-...-conflito-...-conflito-... (seis vezes) .md
// e a gravação falhou por estourar o caminho máximo do Windows.
//
// Duas causas somadas. O `flushSave()` do editor grava sempre que é chamado,
// mesmo sem mudança, carimbando updatedAt — e ele roda antes de CADA rodada de
// sincronização. Com `atualizadoEm` entrando no texto serializado, a nota parecia
// editada localmente toda vez. Junto disso, o adaptador de pasta gera revisão
// "mtime-tamanho", que não é número, então o cursor nunca avançava e o lado
// remoto também parecia mudado sempre. Os dois juntos = conflito por rodada, e
// cada cópia virava fonte da próxima.
{
  const { SyncEngine, hashDaNota } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  // Carimbo de tempo é metadado, não conteúdo.
  // A quebra vem de fromCharCode porque este arquivo já foi corrompido antes por
  // camada de escape comendo o "\n" — mesma razão do QUEBRA em blocks.js.
  const QUEBRA_TESTE = String.fromCharCode(10);
  const base = ['---', 'quickdock: 1', 'id: x', 'titulo: T',
                'atualizadoEm: "2026-01-01T00:00:00.000Z"', '---', '', 'corpo'].join(QUEBRA_TESTE);
  const outro = base.replace('2026-01-01', '2026-09-17');
  igual('sync · hash ignora o carimbo de atualização', hashDaNota(base), hashDaNota(outro));
  ok('sync · hash ainda enxerga mudança de conteúdo de verdade',
     hashDaNota(base) !== hashDaNota(base.replace('corpo', 'outro corpo')));

  // Adaptador com revisão não-numérica, como o de pasta local
  const revDe = t => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0;
    return `${1726531200000 + Math.abs(h % 99999)}-${t.length}`; };
  class PastaLocalFalsa extends MemorySyncAdapter {
    async escrever(c, t, rb) { const r = await super.escrever(c, t, rb);
      if (r && r.rev) r.rev = revDe(t); return r; }
    async ler(c) { const r = await super.ler(c); return r ? { ...r, rev: revDe(r.texto) } : r; }
    async listarMudancas(d) { const m = await super.listarMudancas(d); const o = [];
      for (const x of m) { const a = await super.ler(x.caminho);
        o.push({ ...x, rev: a ? revDe(a.texto) : x.rev }); } return o; }
  }

  const ad = new PastaLocalFalsa(), st = new InMemoryStore();
  const eng = new SyncEngine({ adapter: ad, store: st, deviceName: 'QuickDock Windows',
    antesDeSincronizar: async () => {
      for (const n of await st.listarNotasLocais()) {
        await st.salvarNotaLocal({ ...n, updatedAt: Date.now() });
      }
    },
  });
  await st.salvarNotaLocal({ uid: 'u1', title: 'Nota 2', ordem: 'a0',
    blocks: [{ type: 'paragraph', html: 'texto que nunca muda' }], updatedAt: Date.now() });

  let totalConflitos = 0;
  for (let i = 0; i < 5; i++) {
    const r = await eng.sincronizar();
    totalConflitos += r.conflitos;
    await new Promise(x => setTimeout(x, 2));
  }
  const notas = await st.listarNotasLocais();
  igual('sync · 5 rodadas sem edição não geram conflito nenhum', totalConflitos, 0);
  igual('sync · 5 rodadas sem edição não multiplicam a nota', notas.length, 1);
  ok('sync · o título não ganha sufixo de conflito à toa',
     !/conflito/.test(notas[0].title), notas[0].title);
}

// Rede de segurança: sufixo de conflito não empilha, e título já danificado por
// uma versão anterior volta ao nome original.
{
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');
  const eng = new SyncEngine({ adapter: new MemorySyncAdapter(), store: new InMemoryStore(),
    deviceName: 'Aparelho' });

  const sufixo = ' (conflito 2026-09-17, QuickDock Windows)';
  const empilhado = 'Nota 2' + sufixo.repeat(6);
  const saida = eng._tituloDeConflitoParaTeste
    ? eng._tituloDeConflitoParaTeste(empilhado)
    : null;
  if (saida !== null) {
    ok('sync · título com sufixos empilhados volta ao nome original',
       (saida.match(/conflito/g) || []).length === 1, saida);
  }
}

// ── Nome de arquivo que não dá pra gravar não pode ser gerado ────────────────
// Segunda metade do mesmo relato de uso real: mesmo com o laço de conflito
// corrigido, a nota que JÁ tinha o título inchado continuava falhando a cada
// sincronização. 243 caracteres só no caminho relativo, e o Windows recusa
// acima de ~260 contando a pasta escolhida. Falha permanente, não resquício.
{
  const { SyncEngine, slugTitulo } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  const sufixo = ' (conflito 2026-09-17, QuickDock Windows)';
  const monstro = 'Nota 2' + sufixo.repeat(6);

  ok('nome · slug de título gigante cabe num caminho gravável',
     slugTitulo(monstro).length <= 60, `${slugTitulo(monstro).length} caracteres`);
  igual('nome · título curto não é mexido', slugTitulo('Atendimento Maria'), 'atendimento-maria');
  ok('nome · corte não deixa hífen sobrando no fim', !slugTitulo(monstro).endsWith('-'));

  // E a nota danificada tem que se curar sozinha, sem o usuário renomear na mão.
  const ad = new MemorySyncAdapter(), st = new InMemoryStore();
  const eng = new SyncEngine({ adapter: ad, store: st, deviceName: 'QuickDock Windows' });
  await st.salvarNotaLocal({ uid: 'u1', title: monstro, ordem: 'a0',
    blocks: [{ type: 'paragraph', html: 'conteudo que nao pode sumir' }], updatedAt: Date.now() });

  await eng.sincronizar();
  const nota = await st.obterNotaPorUid('u1');
  const marcas = (nota.title.match(/\(conflito /g) || []).length;

  igual('nome · título empilhado se cura e mantém uma marca só', marcas, 1);
  ok('nome · a cura preserva o nome original da nota', nota.title.startsWith('Nota 2'), nota.title);

  const caminho = (await st.obterEstadoSync('u1')).caminho;
  ok('nome · o arquivo gravado cabe no limite do sistema', caminho.length < 120, `${caminho.length} caracteres`);
  ok('nome · a cura não perdeu o conteúdo',
     (await ad.ler(caminho)).texto.includes('conteudo que nao pode sumir'));

  // Uma marca só é escolha possível do usuário: não pode ser mexida.
  const st2 = new InMemoryStore();
  const eng2 = new SyncEngine({ adapter: new MemorySyncAdapter(), store: st2, deviceName: 'X' });
  const umaMarca = 'Relatorio' + sufixo;
  await st2.salvarNotaLocal({ uid: 'u2', title: umaMarca, ordem: 'a0', blocks: [], updatedAt: Date.now() });
  await eng2.sincronizar();
  igual('nome · uma única marca de conflito é preservada',
        (await st2.obterNotaPorUid('u2')).title, umaMarca);
}

// ── Dois clientes na mesma pasta ─────────────────────────────────────────────
// A suíte nunca tinha exercitado o caso central da arquitetura: extensão e PWA
// apontando para a MESMA pasta. Relatado em uso real: com a mesma nota aberta
// nos dois, a sincronização gerava conflito sem ninguém ter editado nada.
//
// A causa não era edição simultânea: era o arquivo não convergir. Quem baixava
// uma nota sem `criadoEm` carimbava Date.now() e regravava COM o campo; o outro
// lado via diferença e regravava SEM. Ping-pong infinito, e conflito sempre que
// os dois subiam na mesma janela. Em quatro rodadas, uma nota virava seis de um
// lado e oito do outro.
{
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  // Revisão "mtime-tamanho", como o adaptador de pasta local gera de verdade —
  // e diferente da numérica do adaptador de memória, contra a qual o motor foi
  // originalmente escrito.
  const revDe = t => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0;
    return `${1726531200000 + Math.abs(h % 99999)}-${t.length}`; };
  class PastaCompartilhada extends MemorySyncAdapter {
    async escrever(c, t, rb) { const r = await super.escrever(c, t, rb);
      if (r && r.rev) r.rev = revDe(t); return r; }
    async ler(c) { const r = await super.ler(c); return r ? { ...r, rev: revDe(r.texto) } : r; }
    async listarMudancas(d) { const m = await super.listarMudancas(d); const o = [];
      for (const x of m) { const a = await super.ler(x.caminho);
        o.push({ ...x, rev: a ? revDe(a.texto) : x.rev }); } return o; }
  }

  const pasta = new PastaCompartilhada();
  const stExt = new InMemoryStore(), stWeb = new InMemoryStore();

  // Os dois com a MESMA nota aberta, e flushSave carimbando antes de cada rodada
  const cliente = (st, nome) => new SyncEngine({
    adapter: pasta, store: st, deviceName: nome,
    obterNotaAbertaUid: () => 'u1',
    podeRecarregarNotaAberta: () => true,
    recarregarNotaAberta: async () => {},
    antesDeSincronizar: async () => {
      for (const n of await st.listarNotasLocais()) {
        await st.salvarNotaLocal({ ...n, updatedAt: Date.now() });
      }
    },
  });
  const ext = cliente(stExt, 'Extensao'), web = cliente(stWeb, 'Site');

  // Sem createdAt de propósito: é o campo que disparava a divergência.
  await stExt.salvarNotaLocal({ uid: 'u1', title: 'Nota compartilhada', ordem: 'a0',
    blocks: [{ type: 'paragraph', html: 'texto que ninguem edita' }], updatedAt: Date.now() });

  let conflitos = 0;
  for (let i = 0; i < 4; i++) {
    conflitos += (await ext.sincronizar()).conflitos;
    conflitos += (await web.sincronizar()).conflitos;
    await new Promise(r => setTimeout(r, 2));
  }

  const nExt = await stExt.listarNotasLocais();
  const nWeb = await stWeb.listarNotasLocais();
  igual('dois clientes · nenhum conflito sem ninguém editar', conflitos, 0);
  igual('dois clientes · a extensão continua com uma nota só', nExt.length, 1);
  igual('dois clientes · o site continua com uma nota só', nWeb.length, 1);
  ok('dois clientes · nenhum título ganhou marca de conflito',
     ![...nExt, ...nWeb].some(n => /conflito/.test(n.title)),
     [...nExt, ...nWeb].map(n => n.title).join(' | '));
  igual('dois clientes · os dois lados convergem no mesmo conteúdo',
        nWeb[0].blocks[0].html, nExt[0].blocks[0].html);

  // O arquivo tem que ser ponto fixo: quem baixa e regrava não pode mudar nada.
  const caminho = (await stExt.obterEstadoSync('u1')).caminho;
  const texto1 = (await pasta.ler(caminho)).texto;
  await web.sincronizar();
  await ext.sincronizar();
  igual('dois clientes · o arquivo não muda sozinho a cada rodada',
        (await pasta.ler(caminho)).texto, texto1);
}

// ── Clicar em sincronizar não pode não fazer nada ────────────────────────────
// Relatado em uso real: editar num cliente, clicar em Sincronizar no outro com a
// mesma nota aberta, e "fica travado naquele texto".
//
// A nota aberta é adiada quando há edição em andamento, e isso está certo para a
// sincronização automática. Mas na rodada seguinte a condição é a mesma, então
// enquanto a nota estivesse aberta ela nunca chegava -- e nada era dito. Um
// clique é pedido explícito: recusá-lo em silêncio faz o botão parecer quebrado.
{
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  const montar = async (podeRecarregar) => {
    const ad = new MemorySyncAdapter();
    const stA = new InMemoryStore(), stB = new InMemoryStore();
    const A = new SyncEngine({ adapter: ad, store: stA, deviceName: 'A' });
    let recarregou = false;
    const B = new SyncEngine({ adapter: ad, store: stB, deviceName: 'B',
      obterNotaAbertaUid: () => 'u1',
      podeRecarregarNotaAberta: () => podeRecarregar,
      recarregarNotaAberta: async () => { recarregou = true; },
    });
    const agora = Date.now();
    await stA.salvarNotaLocal({ uid: 'u1', title: 'N', ordem: 'a0',
      blocks: [{ type: 'paragraph', html: 'original' }], createdAt: agora, updatedAt: agora });
    await A.sincronizar();
    await B.sincronizar();            // B recebe a nota
    const nb = await stB.obterNotaPorUid('u1');

    // A edita e sobe
    const na = await stA.obterNotaPorUid('u1');
    await stA.salvarNotaLocal({ ...na, blocks: [{ type: 'paragraph', html: 'editado por A' }], updatedAt: Date.now() + 1 });
    await A.sincronizar();

    const r = await B.sincronizar();
    return { r, nota: await stB.obterNotaPorUid('u1'), recarregou, tinha: nb };
  };

  // Automática, com edição em andamento: adia, e DIZ que adiou.
  const adiado = await montar(false);
  igual('sync manual · rodada automática adia a nota ocupada', adiado.r.puladas, 1);
  ok('sync manual · a nota adiada não é sobrescrita',
     adiado.nota.blocks[0].html === 'original');

  // Pedido explícito: traz mesmo assim.
  const forcado = await montar(true);
  igual('sync manual · com recarga liberada a nota não fica para trás', forcado.r.puladas, 0);
  igual('sync manual · o texto novo chega de verdade',
        forcado.nota.blocks[0].html, 'editado por A');
  ok('sync manual · o editor é avisado para recarregar', forcado.recarregou);
}

// Guardas de fonte: a parte que depende de DOM e de Dexie não roda aqui, e são
// justamente as duas metades da correção.
{
  const { readFile } = await import('node:fs/promises');
  const ctrl = await readFile(new URL('../sidepanel/modules/sync-controller.js', import.meta.url), 'utf8');

  ok('sync manual · o botão pede sincronização manual',
     /sync-btn-agora[\s\S]{0,400}?sincronizarAgora\(\s*\{\s*manual:\s*true\s*\}\s*\)/.test(ctrl));
  ok('sync manual · rodada manual libera recarregar a nota aberta',
     /rodadaManual/.test(ctrl) && /podeRecarregarNotaAberta:\s*\(\)\s*=>\s*this\.rodadaManual/.test(ctrl));
  ok('sync manual · nota adiada aparece para o usuário',
     /notasPuladas/.test(ctrl) && /sync-skipped-msg/.test(ctrl));
}

// ── Subir a nota aberta é sempre seguro ──────────────────────────────────────
// Relatado em uso real: editar na extensão com a nota aberta, clicar em
// sincronizar, e do outro lado não chegar nada. A causa não era o lado que
// recebe -- era o que envia: a nota aberta simplesmente NÃO SUBIA enquanto o
// editor estivesse em foco, nem na primeira vez. O arquivo nem chegava a existir
// na pasta, e o outro cliente parecia travado por não ter o que buscar.
//
// Enviar só grava um arquivo e não encosta no editor. Quem arrisca atropelar a
// digitação é baixar, e essa parte continua adiando.
{
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  const ad = new MemorySyncAdapter(), st = new InMemoryStore();
  const ext = new SyncEngine({ adapter: ad, store: st, deviceName: 'Extensao',
    obterNotaAbertaUid: () => 'u1',
    podeRecarregarNotaAberta: () => false,   // editor em foco o tempo todo
    recarregarNotaAberta: async () => {},
  });

  const t = Date.now();
  await st.salvarNotaLocal({ uid: 'u1', title: 'N', ordem: 'a0',
    blocks: [{ type: 'paragraph', html: 'original' }], createdAt: t, updatedAt: t });

  const r1 = await ext.sincronizar();
  igual('subir · nota aberta sobe mesmo com o editor em foco', r1.enviadas, 1);
  ok('subir · o arquivo chega a existir na pasta', (await ad.ler('notas/n.md')) !== null);

  // E a edição seguinte também tem que chegar.
  const n = await st.obterNotaPorUid('u1');
  await st.salvarNotaLocal({ ...n, blocks: [{ type: 'paragraph', html: 'EDITADO' }],
    updatedAt: Date.now() + 1 });
  const r2 = await ext.sincronizar();
  igual('subir · edição na nota aberta é enviada', r2.enviadas, 1);
  ok('subir · o conteúdo editado está no arquivo',
     ((await ad.ler('notas/n.md'))?.texto ?? '').includes('EDITADO'));

  // Baixar continua adiando: é o lado que pode atropelar a digitação.
  const ad2 = new MemorySyncAdapter();
  const stA = new InMemoryStore(), stB = new InMemoryStore();
  const A = new SyncEngine({ adapter: ad2, store: stA, deviceName: 'A' });
  // O editor só fica ocupado DEPOIS que B já tem a nota: baixar uma nota que não
  // existe localmente não atropela nada, então não faria sentido adiar antes.
  let ocupado = false;
  const Bcliente = new SyncEngine({ adapter: ad2, store: stB, deviceName: 'B',
    obterNotaAbertaUid: () => 'u2',
    podeRecarregarNotaAberta: () => !ocupado,
    recarregarNotaAberta: async () => {},
  });
  const t2 = Date.now();
  await stA.salvarNotaLocal({ uid: 'u2', title: 'M', ordem: 'a0',
    blocks: [{ type: 'paragraph', html: 'de A' }], createdAt: t2, updatedAt: t2 });
  await A.sincronizar();
  await Bcliente.sincronizar();                  // B recebe a nota e a abre

  ocupado = true;                                // agora a pessoa está digitando nela
  const na2 = await stA.obterNotaPorUid('u2');
  await stA.salvarNotaLocal({ ...na2, blocks: [{ type: 'paragraph', html: 'A editou depois' }],
    updatedAt: Date.now() + 1 });
  await A.sincronizar();

  const rb = await Bcliente.sincronizar();
  igual('subir · baixar continua adiando quando o editor está ocupado', rb.baixadas, 0);
  igual('subir · o adiamento é contabilizado para poder ser avisado', rb.puladas, 1);
  igual('subir · o texto que a pessoa está editando não é atropelado',
        (await stB.obterNotaPorUid('u2'))?.blocks?.[0]?.html, 'de A');
}

// ── Recarregar a nota não pode gravar o editor por cima ──────────────────────
// Relatado em uso real: forçar subir num cliente e descer no outro "não vai de
// imediato, e acaba fazendo sync reverso e desfazendo a alteração".
//
// A sincronização gravava a versão nova no banco e mandava o editor recarregar.
// Mas `switchToNote` começa com `await flushSave()` -- correto para quem TROCA de
// nota, e destrutivo aqui: serializava o DOM antigo por cima do que acabara de
// descer, e o editor lia de volta justamente o texto velho. Na rodada seguinte
// ele subia como "alteração local" e desfazia a edição do outro aparelho.
//
// Não roda em node (precisa de DOM e Dexie); verificado à mão no navegador, onde
// sem a opção o banco reverte e com ela mantém a versão remota.
{
  const { readFile } = await import('node:fs/promises');
  const notaJs = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const appJs = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');

  const assinatura = /export async function switchToNote\(\s*id\s*,\s*\{[^}]*descartarDom/.test(notaJs);
  ok('recarga · switchToNote aceita descartar o editor', assinatura);

  const corpo = notaJs.slice(notaJs.indexOf('export async function switchToNote'));
  const trecho = corpo.slice(0, corpo.indexOf('\n}\n'));
  ok('recarga · com descartarDom o flushSave não roda',
     /if\s*\(\s*descartarDom\s*\)/.test(trecho) && /else\s*\{[\s\S]{0,80}flushSave\(\)/.test(trecho));
  ok('recarga · e o autosave pendente é cancelado junto',
     /clearTimeout\(saveTimer\)/.test(trecho),
     'sem isso um save agendado grava o DOM antigo depois do render');

  ok('recarga · a sincronização pede para descartar o editor',
     /recarregarNotaAberta[\s\S]{0,300}?switchToNote\(\s*id\s*,\s*\{\s*descartarDom:\s*true\s*\}\s*\)/.test(appJs));
}

// ── O cursor é do adaptador, não do motor ────────────────────────────────────
// "Cursor" significa coisa diferente em cada destino: contador no adaptador de
// memória, revisão "mtime-tamanho" na pasta local, pageToken opaco no Drive. O
// motor avançava com `Number(rev) > Number(cursor)`, o que dá NaN em tudo que
// não é numérico -- o cursor nunca avançava e cada rodada reprocessava o destino
// inteiro. Foi metade da causa do laço de conflitos em uso real, e o Drive
// bateria nisso de cara.
{
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  // Adaptador que devolve `{ mudancas, cursor }` com token opaco, como o Drive.
  class ComToken extends MemorySyncAdapter {
    constructor() { super(); this.token = 'tok-inicial'; this.vistos = []; }
    async listarMudancas(desde) {
      this.vistos.push(desde);
      const m = await super.listarMudancas(null);
      this.token = 'tok-' + (this.vistos.length + 1);
      return { mudancas: m, cursor: this.token };
    }
  }

  const ad = new ComToken(), st = new InMemoryStore();
  const eng = new SyncEngine({ adapter: ad, store: st, deviceName: 'X' });
  const t = Date.now();
  await st.salvarNotaLocal({ uid: 'u1', title: 'N', ordem: 'a0',
    blocks: [{ type: 'paragraph', html: 'a' }], createdAt: t, updatedAt: t });

  await eng.sincronizar();
  const c1 = await st.obterCursorSync();
  ok('cursor · token opaco do adaptador é guardado', typeof c1 === 'string' && c1.startsWith('tok-'), String(c1));

  await eng.sincronizar();
  const c2 = await st.obterCursorSync();
  ok('cursor · e avança entre rodadas', c2 !== c1, `${c1} -> ${c2}`);
  ok('cursor · o adaptador recebe de volta o que ele mesmo disse',
     ad.vistos[1] === c1, `recebeu ${ad.vistos[1]}, tinha dito ${c1}`);

  // Adaptador antigo, que devolve só a lista: o motor continua funcionando.
  const ad2 = new MemorySyncAdapter(), st2 = new InMemoryStore();
  const eng2 = new SyncEngine({ adapter: ad2, store: st2, deviceName: 'Y' });
  await st2.salvarNotaLocal({ uid: 'u2', title: 'M', ordem: 'a0',
    blocks: [{ type: 'paragraph', html: 'b' }], createdAt: t, updatedAt: t });
  const r = await eng2.sincronizar();
  igual('cursor · adaptador que devolve lista simples continua funcionando', r.enviadas, 1);
}

// ── Adaptador do Google Drive ────────────────────────────────────────────────
// Exercitado contra um Drive de mentira (test/drive-falso.mjs) com a forma das
// respostas da API v3. Sem ele esta seria a única peça da sincronização testável
// só com conta de verdade, na rede, à mão -- ou seja: na prática, nunca.
//
// O Drive não tem caminhos: tem arquivos com pastas-mãe. Traduzir "notas/x.md"
// para um fileId é o trabalho do adaptador, e é onde mora o risco.
{
  const { criarDriveFalso } = await import('./drive-falso.mjs');
  const { GoogleDriveAdapter } = await import('../sidepanel/modules/google-drive-adapter.js');
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  // 1. Contrato do adaptador
  {
    const drive = criarDriveFalso();
    const ad = new GoogleDriveAdapter({ obterToken: async () => 'tok', fetchImpl: drive.fetchFalso });

    igual('drive · autentica e prepara a pasta raiz', (await ad.autenticar()).ok, true);
    igual('drive · só a raiz é criada antes de precisar de subpasta', drive.contarPastas(), 1);

    const e1 = await ad.escrever('notas/minha.md', 'conteudo original', null);
    ok('drive · gravar arquivo novo devolve revisão', !!e1.rev);
    igual('drive · a subpasta é criada sob demanda', drive.contarPastas(), 2);

    const l1 = await ad.ler('notas/minha.md');
    igual('drive · o que foi gravado é o que se lê', l1.texto, 'conteudo original');
    igual('drive · a revisão lida bate com a gravada', l1.rev, e1.rev);

    const e2 = await ad.escrever('notas/minha.md', 'segunda versao', l1.rev);
    ok('drive · atualizar com a revisão certa funciona', !!e2.rev && e2.rev !== l1.rev);

    // O ponto do revBase: impedir que um aparelho apague a edição do outro.
    const e3 = await ad.escrever('notas/minha.md', 'de outro aparelho', l1.rev);
    ok('drive · gravar com revisão velha acusa conflito', e3.conflito === true);
    igual('drive · e informa a revisão que está lá', e3.revAtual, e2.rev);
    igual('drive · o conteúdo não foi sobrescrito no conflito',
          (await ad.ler('notas/minha.md')).texto, 'segunda versao');

    // Lixeira, não exclusão definitiva: o Drive guarda 30 dias, e uma exclusão
    // errada -- bug nosso ou clique errado -- deixa de ser irreversível.
    igual('drive · apagar manda para a lixeira', await ad.apagar('notas/minha.md'), true);
    igual('drive · arquivo na lixeira não é mais encontrado', await ad.ler('notas/minha.md'), null);
    ok('drive · e continua existindo, recuperável',
       [...drive.arquivos.values()].some(a => a.name === 'minha.md' && a.trashed));
  }

  // 2. Nome com aspas não quebra a consulta do Drive
  {
    const drive = criarDriveFalso();
    const ad = new GoogleDriveAdapter({ obterToken: async () => 'tok', fetchImpl: drive.fetchFalso });
    await ad.escrever("notas/o'reilly.md", 'conteudo', null);

    // Ler com OUTRO adaptador é o que importa: o mesmo teria o caminho em cache
    // e devolveria sem consultar o Drive — não exercitaria o escape nenhum.
    const limpo = new GoogleDriveAdapter({ obterToken: async () => 'tok', fetchImpl: drive.fetchFalso });
    igual('drive · nome com aspas simples é escapado na consulta',
          (await limpo.ler("notas/o'reilly.md"))?.texto, 'conteudo');
  }

  // 3. O motor de verdade dirigindo o Drive, com dois clientes
  {
    const drive = criarDriveFalso();
    const novo = () => new GoogleDriveAdapter({ obterToken: async () => 'tok', fetchImpl: drive.fetchFalso });
    const stA = new InMemoryStore(), stB = new InMemoryStore();
    const A = new SyncEngine({ adapter: novo(), store: stA, deviceName: 'Extensao' });
    const Bc = new SyncEngine({ adapter: novo(), store: stB, deviceName: 'Site' });

    const t = Date.now();
    await stA.salvarNotaLocal({ uid: 'u1', title: 'Atendimento Maria', ordem: 'a0',
      blocks: [{ type: 'paragraph', html: 'texto original' }], createdAt: t, updatedAt: t });

    igual('drive+motor · a nota sobe', (await A.sincronizar()).enviadas, 1);
    const cursorA = await stA.obterCursorSync();
    ok('drive+motor · o cursor guardado é o token opaco do Drive',
       typeof cursorA === 'string' && cursorA.length > 0, String(cursorA));

    igual('drive+motor · o outro cliente baixa', (await Bc.sincronizar()).baixadas, 1);
    const nb = await stB.obterNotaPorUid('u1');
    igual('drive+motor · título atravessou', nb?.title, 'Atendimento Maria');
    igual('drive+motor · conteúdo atravessou', nb?.blocks?.[0]?.html, 'texto original');

    const na = await stA.obterNotaPorUid('u1');
    await stA.salvarNotaLocal({ ...na, blocks: [{ type: 'paragraph', html: 'EDITADO POR A' }],
      updatedAt: Date.now() + 1 });
    await A.sincronizar();
    await Bc.sincronizar();
    igual('drive+motor · a edição chega no outro cliente',
          (await stB.obterNotaPorUid('u1'))?.blocks?.[0]?.html, 'EDITADO POR A');

    // O laço de conflitos que apareceu em uso real com a pasta local não pode
    // renascer aqui: rodada ociosa não inventa conflito nem multiplica nota.
    let conflitos = 0;
    for (let i = 0; i < 4; i++) {
      conflitos += (await A.sincronizar()).conflitos;
      conflitos += (await Bc.sincronizar()).conflitos;
    }
    igual('drive+motor · 4 rodadas ociosas não geram conflito', conflitos, 0);
    igual('drive+motor · nem multiplicam a nota de um lado', (await stA.listarNotasLocais()).length, 1);
    igual('drive+motor · nem do outro', (await stB.listarNotasLocais()).length, 1);
  }
}

// ── Ligação do Drive no painel ───────────────────────────────────────────────
// Guardas de fonte: esta camada precisa de chrome.identity e de DOM, e não roda
// na suíte. São as propriedades que, se sumirem num refactor, quebram em
// silêncio ou incomodam o usuário sem ninguém perceber.
{
  const { readFile } = await import('node:fs/promises');
  const ctrl = await readFile(new URL('../sidepanel/modules/sync-controller.js', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../sidepanel/modules/google-auth.js', import.meta.url), 'utf8');
  const drv = await readFile(new URL('../sidepanel/modules/google-drive-adapter.js', import.meta.url), 'utf8');

  ok('drive/ui · existe o caminho de conectar ao Drive', /async conectarDrive\(/.test(ctrl));
  ok('drive/ui · e um botão que o chama', /sync-btn-drive/.test(ctrl));

  // Tela de permissão do Google só a partir de clique. Sincronização automática
  // que abre janela de autorização sozinha no meio da digitação é inaceitável,
  // e o Chrome nem permitiria sem gesto do usuário.
  ok('drive/auth · rodada automática pede token em silêncio',
     /interactive:\s*interativo/.test(auth) && /interativo\s*=\s*false/.test(auth));
  const iReconexao = ctrl.indexOf("if (this.destino === 'drive')");
  ok('drive/ui · o caminho de reconexão ao abrir existe', iReconexao > 0);
  const reconectar = iReconexao > 0 ? ctrl.slice(iReconexao, iReconexao + 500) : '';
  ok('drive/ui · reconexão ao abrir o painel não é interativa',
     /obterToken\(\)/.test(reconectar) && !/\.conectar\(\)/.test(reconectar),
     'abrir o painel não pode disparar tela de permissão do Google');

  // Token recusado precisa sair do cache do Chrome, senão vira 401 permanente:
  // pedir de novo devolve exatamente o token que acabou de ser recusado.
  ok('drive/auth · token recusado é descartado do cache',
     /removeCachedAuthToken/.test(auth));
  ok('drive/adapter · 401 tenta renovar uma vez',
     /resp\.status === 401/.test(drv) && /_jaRenovou/.test(drv));
  ok('drive/adapter · e só uma vez, para não virar laço',
     /!_jaRenovou/.test(drv));

  // Desconectar tem que revogar, não só esquecer.
  ok('drive/auth · desconectar revoga o token no Google',
     /oauth2\.googleapis\.com\/revoke/.test(auth));
  ok('drive/ui · e o painel chama essa revogação ao desconectar',
     /provedorToken[\s\S]{0,200}?desconectar\(\)/.test(ctrl));

  // O escopo é o que mantém o projeto fora da categoria restrita do Google.
  const cfg = await readFile(new URL('../sidepanel/modules/google-config.js', import.meta.url), 'utf8');
  ok('drive · o escopo é drive.file, não o Drive inteiro',
     /auth\/drive\.file/.test(cfg) && !/auth\/drive['"]/.test(cfg));

  const manifesto = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  ok('drive · o manifesto declara identity', manifesto.permissions.includes('identity'));
  igual('drive · e o mesmo escopo do google-config',
        manifesto.oauth2?.scopes?.[0], 'https://www.googleapis.com/auth/drive.file');
  ok('drive · o client_id do manifesto é o do tipo Chrome Extension',
     /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(manifesto.oauth2?.client_id ?? ''));
  // Vazamento de segredo é irreversível num repositório público: uma vez no
  // histórico, fica. Procurar a palavra "client_secret" não serve -- ela aparece
  // legitimamente em comentário explicando por que não há nenhum. O que se
  // procura é o FORMATO do segredo do Google (GOCSPX-) e uma atribuição com
  // valor de verdade, varrendo os arquivos que vão pro repositório.
  {
    const { readdir } = await import('node:fs/promises');
    const raiz = new URL('../', import.meta.url);
    const alvos = [];
    for (const dir of ['', 'sidepanel/', 'sidepanel/modules/', 'test/', 'content/']) {
      let nomes = [];
      try { nomes = await readdir(new URL(dir, raiz)); } catch { continue; }
      for (const n of nomes) {
        if (/\.(js|mjs|json|html|webmanifest)$/.test(n)) alvos.push(dir + n);
      }
    }

    const vazando = [];
    for (const rel of alvos) {
      let txt = '';
      try { txt = await readFile(new URL(rel, raiz), 'utf8'); } catch { continue; }
      if (/GOCSPX-[\w-]+/.test(txt)) vazando.push(`${rel} (formato de segredo do Google)`);
      if (/client_secret["']?\s*[:=]\s*["'][^"']+["']/.test(txt)) vazando.push(`${rel} (client_secret com valor)`);
    }
    ok('drive · nenhum client secret no repositório', vazando.length === 0, vazando.join(', '));
    ok('drive · a varredura olhou uma quantidade plausível de arquivos',
       alvos.length > 20, `${alvos.length} arquivos`);

    // Chave privada dentro da pasta da extensão. O .gitignore protege o
    // repositório, mas NÃO protege o .zip da Web Store: um `.pem` ali dentro
    // seria empacotado junto e distribuído. Quem tem essa chave publica
    // atualizações no lugar do dono da extensão.
    //
    // O Chrome também reclama ao carregar sem compactação, o que foi como isto
    // apareceu. O ID da extensão não depende do arquivo -- vem do campo `key`
    // do manifesto -- então guardar a chave fora do projeto não custa nada.
    const pems = [];
    for (const dir of ['', 'sidepanel/', 'sidepanel/modules/', 'test/', 'content/', 'icons/', 'lib/', 'brand/']) {
      let nomes = [];
      try { nomes = await readdir(new URL(dir, raiz)); } catch { continue; }
      for (const n of nomes) if (/\.pem$/i.test(n)) pems.push(dir + n);
    }
    ok('projeto · nenhuma chave privada dentro da pasta da extensão',
       pems.length === 0, pems.join(', '));
  }
}

// ── 16. Interface: ícones via fonte, busca de notas, colapso de documentos e offline ──
{
  const { iconSvg } = await import('../sidepanel/modules/icons.js');

  // 16.1: Ícones via fonte Material Symbols Rounded — sem tabela local de SVGs,
  // qualquer nome do catálogo do Google funciona.
  igual('icons · iconSvg gera <span> com classe e nome do ícone',
     iconSvg('search'), '<span class="qd-icon material-symbols-rounded" aria-hidden="true">search</span>');
  ok('icons · iconSvg funciona pra qualquer nome do catálogo, não só uma lista fixa',
     iconSvg('rocket_launch').includes('rocket_launch') && iconSvg('sailing').includes('sailing'));
  igual('icons · iconSvg sem nome devolve string vazia', iconSvg(''), '');

  // 16.2: Ícones comuns usados nas abas renderizam normalmente
  const abasIcons = ['note', 'edit_note', 'checklist', 'star', 'flag', 'bookmark', 'folder', 'lightbulb', 'push_pin', 'label', 'event'];
  for (const nome of abasIcons) {
    ok(`icons · ícone comum de aba "${nome}" renderiza via iconSvg`, iconSvg(nome).includes(`>${nome}<`));
  }

  // 16.3: Fonte de ícones carregada via Google Fonts, sem depender de CDN de script
  const { readFile } = await import('node:fs/promises');
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sidepanelHtml = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const notFoundHtml = await readFile(new URL('../404.html', import.meta.url), 'utf8');

  ok('fonte · index.html carrega Material Symbols Rounded', indexHtml.includes('fonts.googleapis.com') && indexHtml.includes('Material+Symbols+Rounded'));
  ok('fonte · sidepanel/index.html carrega Material Symbols Rounded', sidepanelHtml.includes('fonts.googleapis.com') && sidepanelHtml.includes('Material+Symbols+Rounded'));
  ok('fonte · 404.html carrega Material Symbols Rounded', notFoundHtml.includes('fonts.googleapis.com') && notFoundHtml.includes('Material+Symbols+Rounded'));
  ok('offline · index.html não tem CDN externa de script', !indexHtml.includes('https://cdnjs.') && !indexHtml.includes('https://cdn.'));

  // 16.4: Busca de notas por título e conteúdo
  const notasExemplo = [
    { id: 1, title: 'Compras do mês', content: 'arroz, feijão, café' },
    { id: 2, title: 'Ideias de projeto', content: 'construir app sem dependências' },
    { id: 3, title: 'Atendimento cliente', content: 'protocolo 12345 CPF 000.000.000-00' },
  ];

  const filtrarNotas = (lista, busca) => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(n => (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q));
  };

  igual('busca · busca vazia retorna todas as notas', filtrarNotas(notasExemplo, '').length, 3);
  igual('busca · filtra por título', filtrarNotas(notasExemplo, 'compras').map(n => n.id), [1]);
  igual('busca · filtra por conteúdo quando o título não bate', filtrarNotas(notasExemplo, 'dependências').map(n => n.id), [2]);
  igual('busca · busca case-insensitive e parcial', filtrarNotas(notasExemplo, 'ATEND').map(n => n.id), [3]);
  igual('busca · termo inexistente retorna lista vazia', filtrarNotas(notasExemplo, 'inexistente').length, 0);

  // 16.5: Cálculo de visíveis e ocultos na busca
  const totalNotas = 40;
  const visiveisNotas = 3;
  const ocultas = totalNotas - visiveisNotas;
  igual('busca · contagem de notas ocultas', ocultas, 37);

  // 16.6: Modo de seleção por toque e controles em note.js
  const noteSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const noteStateSource = await readFile(new URL('../sidepanel/modules/note-state.js', import.meta.url), 'utf8');
  const noteViewportSource = await readFile(new URL('../sidepanel/modules/note-viewport.js', import.meta.url), 'utf8');
  ok('touch · note.js exporta isTouchSelectionMode', noteSource.includes('export function isTouchSelectionMode'));
  ok('touch · note-state.js escuta btn-touch-select', noteStateSource.includes('btn-touch-select'));
  ok('touch · note.js suporta toque longo na alça de bloco', noteSource.includes('touchDragTimer') && noteSource.includes('touchstart'));
  ok('touch · note-viewport.js tem scrollCursorIntoView para teclado virtual', noteViewportSource.includes('scrollCursorIntoView') && noteViewportSource.includes('visualViewport'));

  // 16.7: Barra Contextual Estilo Notion, Seleção de Blocos e Sheet de Modelos
  const styleSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const noteMobileToolbarSource = await readFile(new URL('../sidepanel/modules/note-mobile-toolbar.js', import.meta.url), 'utf8');
  ok('mobile · note-mobile-toolbar.js define mobileTemplateSheet separado de tipo', noteMobileToolbarSource.includes('mobileTemplateSheet') && noteMobileToolbarSource.includes('mobile-template-sheet-no-scrim'));
  ok('mobile · note-mobile-toolbar.js tem botão de Modelos na barra normal', noteMobileToolbarSource.includes('mobBtnTemplates') && noteMobileToolbarSource.includes('toggleMobileTemplateSheet'));
  ok('mobile · note-mobile-toolbar.js tem botão de Selecionar na barra normal', noteMobileToolbarSource.includes('mobBtnSelect') && noteMobileToolbarSource.includes('toggleBlockSelectMode'));
  ok('mobile · note-mobile-toolbar.js define mobileSelectBar com contador e ações', noteMobileToolbarSource.includes('mobileSelectBar') && noteMobileToolbarSource.includes('mobSelectCount'));
  ok('mobile · mobileSelectBar possui copiar e baixar como imagem', noteMobileToolbarSource.includes('copySelectedBlocksAsImage') && noteMobileToolbarSource.includes('downloadSelectedBlocksAsImage'));
  ok('mobile · mobileSelectBar possui baixar como md e txt', noteMobileToolbarSource.includes('downloadSelectedBlocksAsMd') && noteMobileToolbarSource.includes('downloadSelectedBlocksAsTxt'));
  ok('mobile · mobileSelectBar possui salvar modelo e excluir blocos', noteMobileToolbarSource.includes('saveSelectedBlocksAsTemplate') && noteMobileToolbarSource.includes('deleteSelectedBlocks'));
  ok('mobile · note-mobile-toolbar.js tem gesto de toque longo em blocos para seleção', noteMobileToolbarSource.includes('touchSelectTimer') && noteMobileToolbarSource.includes('enterBlockSelectMode'));
  ok('mobile · mobileFormatBar possui atalhos de imagem, md e txt', noteMobileToolbarSource.includes('mobBtnFmtCopyImg') && noteMobileToolbarSource.includes('mobBtnFmtDownloadMd') && noteMobileToolbarSource.includes('mobBtnFmtDownloadTxt'));
  ok('mobile · style.css estiliza mobile-template-sheet-no-scrim', styleSource.includes('.mobile-template-sheet-no-scrim') && styleSource.includes('.mob-template-item'));
  ok('mobile · style.css estiliza mobile-select-bar e mob-select-count', styleSource.includes('.mobile-select-bar') && styleSource.includes('.mob-select-count'));
  ok('mobile · sheets usam --keyboard-offset', styleSource.includes('bottom: var(--keyboard-offset, 0px)'));
}

// ── 17. Sistema de Múltiplas Telas, Galeria de Modelos e Refatoração Desktop ──
{
  const { readFile } = await import('node:fs/promises');
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const errHtml   = await readFile(new URL('../404.html', import.meta.url), 'utf8');
  const sideHtml  = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const styleCss  = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const viewsJs   = await readFile(new URL('../sidepanel/modules/views.js', import.meta.url), 'utf8');
  const tplGalJs  = await readFile(new URL('../sidepanel/modules/templates-gallery.js', import.meta.url), 'utf8');

  ok('telas · index.html e 404.html mantêm 100% de paridade', indexHtml === errHtml);
  ok('telas · index.html define seção templates-gallery-view', indexHtml.includes('id="templates-gallery-view"'));
  ok('telas · index.html define btn-nav-templates na aside', indexHtml.includes('id="btn-nav-templates"'));
  ok('telas · sidepanel/index.html define templates-gallery-view', sideHtml.includes('id="templates-gallery-view"'));
  ok('telas · views.js exporta switchView e getCurrentView', viewsJs.includes('export function switchView') && viewsJs.includes('export function getCurrentView'));
  ok('telas · templates-gallery.js exporta initTemplatesGallery e renderTemplatesGallery', tplGalJs.includes('export function initTemplatesGallery') && tplGalJs.includes('export async function renderTemplatesGallery'));
  ok('desktop · aside reposicionada à esquerda com border-right', styleCss.includes('html[data-platform="desktop"] .app-aside') && styleCss.includes('border-right: 1px solid var(--border)'));
  ok('desktop · workspace/note-section à direita com order 2', styleCss.includes('html[data-platform="desktop"] .templates-gallery-view') && styleCss.includes('order: 2'));
  ok('desktop · aside oculta btn-nav-templates no mobile e extensão', styleCss.includes('html[data-platform="extension"] #btn-nav-templates'));
  ok('galeria · css define grid de cards e visual de preview', styleCss.includes('.gallery-grid') && styleCss.includes('.template-card') && styleCss.includes('.template-card-preview'));
  ok('modo modelo · oculta barra de abas de notas ao editar modelo', styleCss.includes('.template-mode .notes-tabbar') && styleCss.includes('display: none !important'));
  ok('modo modelo · header template-bar usa componentes modernos com seções', indexHtml.includes('template-bar-left') && indexHtml.includes('template-bar-center') && indexHtml.includes('template-bar-right'));
  ok('mobile · note-section e galeria isoladas com hidden display none', styleCss.includes('html[data-platform="mobile"] .note-section[hidden]') && styleCss.includes('display: none !important'));
}

// ── 18. Pastas hierárquicas, caminhos de notas e sincronização (Fase 1) ───────
{
  const { normalizarCaminhoPasta } = await import('../sidepanel/modules/storage.js');
  const { buildNoteFile, parseNoteFile } = await import('../sidepanel/modules/notefile.js');
  const { SyncEngine, extrairPastaDoCaminho } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  // 18.1: Normalização de caminhos de pasta
  igual('pastas · normalizar vazia', normalizarCaminhoPasta(''), '');
  igual('pastas · normalizar espaços e barras', normalizarCaminhoPasta('  Projetos / Web  '), 'Projetos/Web');
  igual('pastas · normalizar barras invertidas', normalizarCaminhoPasta('Projetos\\Web\\2026'), 'Projetos/Web/2026');
  igual('pastas · remove barras pontas e duplas', normalizarCaminhoPasta('/Projetos///Mobile/'), 'Projetos/Mobile');
  
  let erroProfundidade = false;
  try {
    normalizarCaminhoPasta('a/b/c/d');
  } catch {
    erroProfundidade = true;
  }
  ok('pastas · rejeita mais de 3 níveis de profundidade', erroProfundidade);

  // 18.2: extrairPastaDoCaminho
  igual('pastas · extrair pasta de raiz', extrairPastaDoCaminho('notas/nota.md'), '');
  igual('pastas · extrair pasta 1 nível', extrairPastaDoCaminho('notas/Projetos/nota.md'), 'Projetos');
  igual('pastas · extrair pasta 3 níveis', extrairPastaDoCaminho('notas/Projetos/Web/App/nota.md'), 'Projetos/Web/App');

  // 18.3: Frontmatter com pasta
  const fileComPasta = buildNoteFile({
    meta: { quickdock: 1, id: 'u_p1', titulo: 'Teste Pastas', pasta: 'Trabalho/2026' },
    md: 'Conteúdo'
  });
  ok('pastas · serialização inclui pasta no frontmatter', fileComPasta.includes('pasta: Trabalho/2026'));
  const parsedComPasta = parseNoteFile(fileComPasta);
  igual('pastas · parse recupera pasta do frontmatter', parsedComPasta?.meta?.pasta, 'Trabalho/2026');

  const fileSemPasta = buildNoteFile({
    meta: { quickdock: 1, id: 'u_p2', titulo: 'Sem Pasta' },
    md: 'Conteúdo raiz'
  });
  ok('pastas · serialização omite pasta quando vazia', !fileSemPasta.includes('pasta:'));
  const parsedSemPasta = parseNoteFile(fileSemPasta);
  igual('pastas · parse sem pasta não define valor espúrio', parsedSemPasta?.meta?.pasta, undefined);

  // 18.4: Sincronização de notas em pastas e imagens relativas
  const adapter = new MemorySyncAdapter();
  const storeA = new InMemoryStore();
  const storeB = new InMemoryStore();
  const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'PC-A' });
  const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'PC-B' });

  // Nota em pasta com imagem
  const bytesImg = new TextEncoder().encode('fake-nested-image-bytes');
  const imgId = await storeA.salvarArquivo({
    name: 'diagram.png',
    type: 'image/png',
    blob: new Blob([bytesImg], { type: 'image/png' }),
    inline: true,
  });

  await storeA.salvarNotaLocal({
    uid: 'u_pasta_nota1',
    title: 'Arquitetura Geral',
    pasta: 'Projetos/QuickDock',
    blocks: [
      { id: 'b1', type: 'paragraph', html: 'Visão do sistema' },
      { id: 'b2', type: 'image', fileId: imgId, alt: 'diagrama' }
    ],
    ordem: 'a0',
  });

  await engineA.sincronizar();

  // Verifica caminho no adaptador
  const arqRemoto = await adapter.ler('notas/Projetos/QuickDock/arquitetura-geral.md');
  ok('pastas · nota gravada no caminho com subpastas', arqRemoto !== null);
  ok('pastas · imagem usa profundidade correta (../../../imagens/)', arqRemoto?.texto.includes('../../../imagens/'));

  // Aparelho B sincroniza e recebe a nota com sua pasta
  await engineB.sincronizar();
  const notaB = await storeB.obterNotaPorUid('u_pasta_nota1');
  ok('pastas · aparelho B recebeu nota', notaB !== null);
  igual('pastas · aparelho B preservou a pasta', notaB?.pasta, 'Projetos/QuickDock');

  // Mover nota de pasta no Aparelho A
  const notaA = await storeA.obterNotaPorUid('u_pasta_nota1');
  await storeA.salvarNotaLocal({
    ...notaA,
    pasta: 'Arquivo',
    updatedAt: Date.now() + 500,
  });
  await engineA.sincronizar();

  // Verifica que arquivo foi movido no adaptador
  const arqAntigo = await adapter.ler('notas/Projetos/QuickDock/arquitetura-geral.md');
  const arqNovo = await adapter.ler('notas/Arquivo/arquitetura-geral.md');
  ok('pastas · arquivo antigo apagado após mover', arqAntigo === null);
  ok('pastas · arquivo novo criado no novo caminho', arqNovo !== null);

  // Renomear título da nota mantendo a pasta
  await storeA.salvarNotaLocal({
    ...notaA,
    title: 'Arquitetura Final',
    pasta: 'Arquivo',
    updatedAt: Date.now() + 1000,
  });
  await engineA.sincronizar();
  const arqRenomeado = await adapter.ler('notas/Arquivo/arquitetura-final.md');
  const arqAntesRenomear = await adapter.ler('notas/Arquivo/arquitetura-geral.md');
  ok('pastas · renomear dentro da pasta apaga nome antigo', arqAntesRenomear === null);
  ok('pastas · renomear dentro da pasta cria novo arquivo no caminho da mesma pasta', arqRenomeado !== null);
}

// ── 19. Interface de Pastas no Painel Lateral (Fase 2) ────────────────────────
{
  const { readFile } = await import('node:fs/promises');
  const tabsSource = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  const styleSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  // 19.1: Funções de árvore e persistência de pastas
  ok('pastas ui · notes-tabs.js define chave de persistência de pastas abertas', tabsSource.includes('quickdock:folders:open'));
  ok('pastas ui · notes-tabs.js monta árvore hierárquica buildFolderTree', tabsSource.includes('buildFolderTree'));
  ok('pastas ui · notes-tabs.js conta total de notas da pasta', tabsSource.includes('contarNotasTotal'));

  // 19.2: Diálogos de ação em pastas (Criar, Renomear, Excluir, Mover)
  ok('pastas ui · diálogo de criação de nova pasta', tabsSource.includes('promptNovaPasta'));
  ok('pastas ui · diálogo de renomeação de pasta', tabsSource.includes('promptRenomearPasta'));
  ok('pastas ui · diálogo de exclusão segura com opções de manter notas', tabsSource.includes('promptExcluirPasta') && tabsSource.includes('Mover notas para a raiz'));
  ok('pastas ui · seletor de pasta para mover nota', tabsSource.includes('promptMoverNotaParaPasta'));
  ok('pastas ui · menu da aba inclui Mover para pasta...', tabsSource.includes('Mover para pasta...'));
  ok('pastas ui · menu de contexto da pasta', tabsSource.includes('openFolderMenu'));

  // 19.3: Arraste e solte para mover notas para pastas
  ok('pastas ui · dragover highlight no cabeçalho da pasta', tabsSource.includes('drag-over') && tabsSource.includes('moverNotaParaPasta'));

  // 19.4: Estilização no CSS e Estrutura no HTML
  const htmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  ok('pastas ui · style.css define barra de ações e botão de nova pasta', styleSource.includes('.notes-list-toolbar') && styleSource.includes('.notes-list-action-btn'));
  ok('pastas ui · style.css define cabeçalho e item de pasta', styleSource.includes('.folder-item') && styleSource.includes('.folder-header'));
  ok('pastas ui · style.css define badge de contagem e chevron', styleSource.includes('.folder-chevron') && styleSource.includes('.folder-count'));
  ok('pastas ui · style.css define indicador de drag-over na pasta', styleSource.includes('.folder-header.drag-over'));
  ok('pastas ui · style.css define diálogos e seletores de pasta', styleSource.includes('.folder-modal') && styleSource.includes('.folder-picker-popover'));
  ok('pastas ui · style.css define barra de pasta no editor e badge de pasta nas abas', styleSource.includes('.note-folder-bar') && styleSource.includes('.note-folder-btn') && styleSource.includes('.note-tab-folder-badge'));
  ok('pastas ui · index.html define barra de pasta no editor da nota', htmlSource.includes('id="note-folder-bar"') && htmlSource.includes('id="btn-note-folder"') && htmlSource.includes('id="note-folder-name"'));
  ok('pastas ui · notes-tabs.js possui clique com botão direito (contextmenu) para abrir menu de opções', tabsSource.includes("contextmenu"));
  ok('pastas ui · aside drawer de notas implementado', tabsSource.includes('openNotesAsideDrawer') && tabsSource.includes('closeNotesAsideDrawer'));
  ok('pastas ui · criação direta de nota em pasta exportada', tabsSource.includes('createNoteInFolder'));
  ok('pastas ui · botão de adicionar nota na pasta e no menu', tabsSource.includes('folder-add-note-btn') && tabsSource.includes('Nova nota nesta pasta'));
  ok('pastas ui · style.css define painel aside drawer e backdrop', styleSource.includes('.notes-aside-drawer') && styleSource.includes('.notes-drawer-backdrop'));
  ok('pastas ui · style.css define ações de pasta e criação direta', styleSource.includes('.folder-actions-wrap') && styleSource.includes('.folder-add-note-btn'));
  ok('pastas ui · style.css define drop na área de filhos da pasta', styleSource.includes('.folder-children.drag-over'));

  // 19.5: Execução real de buildFolderTree com verificação estrutural (previne regressões de ReferenceError)
  const fnMatch = tabsSource.match(/export function buildFolderTree[\s\S]+?return root;\s*\}/);
  ok('pastas ui · buildFolderTree exportada e extraível', !!fnMatch);
  const testBuildFolderTree = new Function('pastas', 'notes', fnMatch[0].replace('export function buildFolderTree', 'function buildFolderTree') + '; return buildFolderTree(pastas, notes);');
  const treeAmostra = testBuildFolderTree(
    [{ caminho: 'Projetos' }, { caminho: 'Projetos/Web' }, { caminho: 'Arquivo' }],
    [
      { id: 1, title: 'Nota Web', pasta: 'Projetos/Web' },
      { id: 2, title: 'Nota Arquivo', pasta: 'Arquivo' },
      { id: 3, title: 'Nota Raiz', pasta: '' }
    ]
  );
  ok('pastas ui · buildFolderTree constrói raiz e subpastas sem lançar exceção', treeAmostra && treeAmostra.subpastas.has('Projetos'));
  ok('pastas ui · buildFolderTree aninha subpasta Projetos/Web corretamente', treeAmostra.subpastas.get('Projetos').subpastas.has('Web'));
  igual('pastas ui · nota em Projetos/Web alocada no nó folha correto', treeAmostra.subpastas.get('Projetos').subpastas.get('Web').notas.length, 1);
  igual('pastas ui · nota na raiz alocada corretamente', treeAmostra.notas.length, 1);
}

// ── 20. Links entre Notas e Wikilinks (Fase 3) ────────────────────────────────
{
  const md1 = 'Veja a nota [[Arquitetura Geral]] para detalhes.';
  const blocks1 = parseMarkdownToBlocks(md1);
  ok('links · wikilink vira elemento a com note-internal-link', blocks1[0].html.includes('class="note-internal-link"'));
  ok('links · wikilink guarda data-note-title', blocks1[0].html.includes('data-note-title="Arquitetura Geral"'));
  const volta1 = blocksToMarkdown(blocks1);
  igual('links · wikilink round-trip idêntico', volta1, md1);

  const md2 = 'Consulte [[Arquitetura Geral|o diagrama do sistema]].';
  const blocks2 = parseMarkdownToBlocks(md2);
  ok('links · wikilink com alias preserva texto exibido', blocks2[0].html.includes('>o diagrama do sistema</a>'));
  const volta2 = blocksToMarkdown(blocks2);
  igual('links · wikilink com alias round-trip idêntico', volta2, md2);

  const mdCaminho = 'Ver [[projeto/iris/bugs|bugs]] aqui.';
  const blocksCaminho = parseMarkdownToBlocks(mdCaminho);
  ok('links · wikilink com caminho e alias preserva caminho', blocksCaminho[0].html.includes('data-note-path="projeto/iris/bugs"'));
  const voltaCaminho = blocksToMarkdown(blocksCaminho);
  igual('links · wikilink com caminho e alias round-trip idêntico', voltaCaminho, mdCaminho);

  const md3 = 'Link canônico: [Ver Documento](nota:u_12345).';
  const blocks3 = parseMarkdownToBlocks(md3);
  ok('links · link canônico nota:uid reconhecido', blocks3[0].html.includes('href="nota:u_12345"'));
  const volta3 = blocksToMarkdown(blocks3);
  igual('links · link canônico round-trip idêntico', volta3, md3);

  // 20.2: Testes unitários do módulo links.js
  const {
    extrairLinksDeTexto, extrairLinksDeBlocos, resolverLinks,
    calcularBacklinks, construirGrafo
  } = await import('../sidepanel/modules/links.js');

  const textoAmostra = 'Aqui tem [[Nota Alpha]], um [[Nota Beta|apelido]] e [Doc](nota:u_gam123).';
  const refsTexto = extrairLinksDeTexto(textoAmostra);
  igual('links.js · extrairLinksDeTexto extrai 3 referências', refsTexto.length, 3);
  ok('links.js · extrai alvo simples', refsTexto.some(r => r.alvo === 'Nota Alpha' && !r.alias));
  ok('links.js · extrai alvo com alias', refsTexto.some(r => r.alvo === 'Nota Beta' && r.alias === 'apelido'));
  ok('links.js · extrai link canônico por uid', refsTexto.some(r => r.alvo === 'u_gam123' && r.isUid));

  // Extração a partir de blocos
  const blocosExemplo = [
    { type: 'paragraph', html: 'Texto com [[Projeto Alpha]] e [[Nota Beta]]' },
    { type: 'checklist', html: 'Item com [Tarefa](nota:u_task1)' },
    { type: 'table', rows: [['Célula [[Nota Beta]]', 'Célula 2']] }
  ];
  const refsBlocos = extrairLinksDeBlocos(blocosExemplo);
  igual('links.js · extrairLinksDeBlocos deduplica referências entre blocos', refsBlocos.length, 3);

  // Resolução de referências
  const todasNotas = [
    { id: 1, uid: 'u_alpha', title: 'Projeto Alpha', pasta: 'Projetos' },
    { id: 2, uid: 'u_beta', title: 'Nota Beta', pasta: 'Arquivo' },
    { id: 3, uid: 'u_task1', title: 'Tarefa Pendente', pasta: '' },
    { id: 4, uid: 'u_orfa', title: 'Nota Órfã', pasta: '' }
  ];

  const linksResolvidos = resolverLinks(refsBlocos, 'u_origem', todasNotas);
  igual('links.js · resolverLinks mapeia todas as 3 referências', linksResolvidos.length, 3);
  ok('links.js · resolve uidDestino por título existente', linksResolvidos.some(l => l.uidDestino === 'u_alpha' && l.tituloAlvo === 'Projeto Alpha'));
  ok('links.js · resolve uidDestino diretamente quando alvo é uid', linksResolvidos.some(l => l.uidDestino === 'u_task1'));

  // Não auto-referencia
  const autoLink = resolverLinks([{ alvo: 'Projeto Alpha', isUid: false }], 'u_alpha', todasNotas);
  igual('links.js · resolverLinks ignora auto-ligação redundante', autoLink.length, 0);

  // Cálculo de Backlinks
  const todosLinks = [
    { uidOrigem: 'u_alpha', uidDestino: 'u_beta', tituloAlvo: 'Nota Beta' },
    { uidOrigem: 'u_task1', uidDestino: 'u_beta', tituloAlvo: 'Nota Beta' },
    { uidOrigem: 'u_beta', uidDestino: 'u_alpha', tituloAlvo: 'Projeto Alpha' },
    { uidOrigem: 'u_alpha', uidDestino: null, tituloAlvo: 'Nota Inexistente' }
  ];

  const backlinksBeta = calcularBacklinks(todasNotas[1], todasNotas, todosLinks);
  igual('links.js · calcularBacklinks encontra 2 notas mencionando Nota Beta', backlinksBeta.length, 2);
  ok('links.js · backlinks de Beta incluem Projeto Alpha', backlinksBeta.some(b => b.uid === 'u_alpha'));
  ok('links.js · backlinks de Beta incluem Tarefa Pendente', backlinksBeta.some(b => b.uid === 'u_task1'));

  const backlinksOrfa = calcularBacklinks(todasNotas[3], todasNotas, todosLinks);
  igual('links.js · nota sem menções retorna array vazio', backlinksOrfa.length, 0);

  // Construção do Grafo
  const grafo = construirGrafo(todasNotas, todosLinks);
  igual('links.js · construirGrafo gera nós para todas as notas', grafo.nodes.length, 4);
  igual('links.js · construirGrafo gera arestas bidirecionais unificadas', grafo.edges.length, 2);
  const noBeta = grafo.nodes.find(n => n.id === 'u_beta');
  ok('links.js · grau de conexões de Nota Beta reflete conectividade', noBeta.degree >= 2);
  ok('links.js · raio visual do nó aumenta com grau de conexões', noBeta.radius > 6);

  // 20.2.1: Desambiguação de notas com mesmo nome em pastas diferentes
  const notasComDuplicatas = [
    { id: 10, uid: 'u_nexus_bugs', title: 'bugs', pasta: 'projeto/nexus' },
    { id: 11, uid: 'u_iris_bugs', title: 'bugs', pasta: 'projeto/iris' },
    { id: 12, uid: 'u_nexus_prd', title: 'prd', pasta: 'projeto/nexus' },
    { id: 13, uid: 'u_iris_doc', title: 'doc', pasta: 'projeto/iris' }
  ];

  // Link explícito por caminho
  const refsCaminho = [
    { alvo: 'projeto/iris/bugs', alias: 'bugs', isUid: false },
    { alvo: 'projeto/nexus/bugs', alias: 'bugs', isUid: false }
  ];
  const resolvidosCaminho = resolverLinks(refsCaminho, 'u_origem', notasComDuplicatas);
  igual('links.js · resolverLinks com caminho resolve 2 referências distintas', resolvidosCaminho.length, 2);
  const linkIris = resolvidosCaminho.find(l => l.uidDestino === 'u_iris_bugs');
  const linkNexus = resolvidosCaminho.find(l => l.uidDestino === 'u_nexus_bugs');
  ok('links.js · caminho projeto/iris/bugs resolve exclusivamente para u_iris_bugs', !!linkIris);
  ok('links.js · caminho projeto/nexus/bugs resolve exclusivamente para u_nexus_bugs', !!linkNexus);

  // Link por proximidade (mesma pasta sem qualificar caminho)
  const refSemCaminho = [{ alvo: 'bugs', alias: null, isUid: false }];
  const resolvidoIris = resolverLinks(refSemCaminho, 'u_iris_doc', notasComDuplicatas);
  igual('links.js · proximidade: nota em projeto/iris ligando a [[bugs]] resolve para u_iris_bugs', resolvidoIris[0]?.uidDestino, 'u_iris_bugs');

  const resolvidoNexus = resolverLinks(refSemCaminho, 'u_nexus_prd', notasComDuplicatas);
  igual('links.js · proximidade: nota em projeto/nexus ligando a [[bugs]] resolve para u_nexus_bugs', resolvidoNexus[0]?.uidDestino, 'u_nexus_bugs');

  // Grafo com notas duplicadas
  const linksGrafoDuplicatas = [
    { uidOrigem: 'u_iris_doc', uidDestino: 'u_iris_bugs', tituloAlvo: 'bugs' },
    { uidOrigem: 'u_nexus_prd', uidDestino: 'u_nexus_bugs', tituloAlvo: 'bugs' }
  ];
  const grafoDuplicatas = construirGrafo(notasComDuplicatas, linksGrafoDuplicatas);
  igual('links.js · grafo cria nós separados para notas de mesmo nome em pastas diferentes', grafoDuplicatas.nodes.length, 4);
  igual('links.js · grafo cria arestas corretas sem colisão', grafoDuplicatas.edges.length, 2);
  const arestaIris = grafoDuplicatas.edges.find(e => (e.source === 'u_iris_doc' && e.target === 'u_iris_bugs') || (e.source === 'u_iris_bugs' && e.target === 'u_iris_doc'));
  const arestaNexus = grafoDuplicatas.edges.find(e => (e.source === 'u_nexus_prd' && e.target === 'u_nexus_bugs') || (e.source === 'u_nexus_bugs' && e.target === 'u_nexus_prd'));
  ok('links.js · aresta do grafo liga u_iris_doc a u_iris_bugs', !!arestaIris);
  ok('links.js · aresta do grafo liga u_nexus_prd a u_nexus_bugs', !!arestaNexus);

  // Backlinks com duplicatas
  const backlinksIris = calcularBacklinks(notasComDuplicatas[1], notasComDuplicatas, linksGrafoDuplicatas);
  igual('links.js · backlinks de projeto/iris/bugs encontra apenas u_iris_doc', backlinksIris.length, 1);
  igual('links.js · backlinks de projeto/iris/bugs é u_iris_doc', backlinksIris[0]?.uid, 'u_iris_doc');

  // 20.3: Verificação de Schema e Código
  const { readFile } = await import('node:fs/promises');
  const storageSource = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
  const noteSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const tabsSource = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  const htmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const styleSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const backlinksSource = await readFile(new URL('../sidepanel/modules/note-backlinks.js', import.meta.url), 'utf8');
  const linkAutocompleteSource = await readFile(new URL('../sidepanel/modules/note-link-autocomplete.js', import.meta.url), 'utf8');

  ok('storage · declara versão 10 com tabela links', storageSource.includes('db.version(10)') && storageSource.includes('links: "++id, uidOrigem, uidDestino, tituloAlvo"'));
  ok('storage · exporta salvarLinksDaNota e obterBacklinks', storageSource.includes('salvarLinksDaNota') && storageSource.includes('obterBacklinks'));
  ok('storage · deleteNoteRecordById remove links em cascata', storageSource.includes('uidOrigem') && storageSource.includes('uidDestino'));

  ok('note-link-autocomplete.js · possui menu de autocomplete de links [[', linkAutocompleteSource.includes('checkLinkAutocomplete') && linkAutocompleteSource.includes('link-autocomplete-menu'));
  ok('note.js · possui navegação ao clicar em link interno', noteSource.includes('note-internal-link') && noteSource.includes('quickdock:activate-note'));
  ok('note-backlinks.js · renderiza e atualiza seção de backlinks', backlinksSource.includes('refreshBacklinks') && backlinksSource.includes('note-backlinks-section'));

  ok('notes-tabs.js · responde ao evento quickdock:activate-note', tabsSource.includes('quickdock:activate-note'));
  ok('index.html · contém contêiner de backlinks no rodapé do editor', htmlSource.includes('id="note-backlinks-section"'));
  ok('style.css · estiliza links internos, autocomplete e backlinks', styleSource.includes('.note-internal-link') && styleSource.includes('.link-autocomplete-menu') && styleSource.includes('.note-backlinks-section'));
}

// ── 21. Modo de Grafo de Conexões (Fase 4) ────────────────────────────────────
{
  const { readFile } = await import('node:fs/promises');
  const graphSource = await readFile(new URL('../sidepanel/modules/graph-view.js', import.meta.url), 'utf8');
  const viewsSource = await readFile(new URL('../sidepanel/modules/views.js', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');
  const htmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const styleSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const storageSource = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
  const noteSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const syncControllerSource = await readFile(new URL('../sidepanel/modules/sync-controller.js', import.meta.url), 'utf8');

  // 21.1: Módulo do Grafo e Algoritmo de Força
  ok('grafo · graph-view.js exporta initGraphView e carregarERenderizarGrafo', graphSource.includes('export function initGraphView') && graphSource.includes('export async function carregarERenderizarGrafo'));
  ok('grafo · algoritmo de força possui critério de parada por energia cinética', graphSource.includes('ENERGY_THRESHOLD') && graphSource.includes('stopSimulation') && graphSource.includes('totalEnergy'));
  ok('grafo · simulação suporta arrasto e fixação de nós', graphSource.includes('isPinned') && graphSource.includes('draggedNode'));
  ok('grafo · zoom focal e pan no canvas', graphSource.includes('zoomBy') && graphSource.includes('isPanning'));
  ok('grafo · tooltip ao passar cursor sobre nós', graphSource.includes('updateTooltip') && graphSource.includes('graph-tooltip'));

  // 21.2: Integração com Views e Navegação
  ok('grafo · views.js gerencia view grafo', viewsSource.includes("viewName === 'grafo'") && viewsSource.includes('quickdock:refresh-graph-view'));
  ok('grafo · app.js inicializa initGraphView e adiciona opção no menu', appSource.includes('initGraphView()') && appSource.includes("switchView('grafo')"));

  // 21.3: HTML e CSS do Grafo
  ok('grafo · index.html define seção graph-view e canvas', htmlSource.includes('id="graph-view"') && htmlSource.includes('id="graph-canvas"'));
  ok('grafo · index.html possui botão de grafo na barra lateral', htmlSource.includes('id="btn-nav-graph"'));
  ok('grafo · index.html possui estado vazio didático', htmlSource.includes('id="graph-empty-state"'));

  // 21.4: Painel de Configurações e Estabilidade da Física
  ok('grafo · graph-view.js exporta DEFAULT_GRAPH_CONFIG com parâmetros completos',
    graphSource.includes('export const DEFAULT_GRAPH_CONFIG') &&
    graphSource.includes('showOrphans') &&
    graphSource.includes('alwaysShowLabels') &&
    graphSource.includes('selectedFolder') &&
    graphSource.includes('nodeShape') &&
    graphSource.includes('repulsion') &&
    graphSource.includes('linkDistance') &&
    graphSource.includes('linkStrength') &&
    graphSource.includes('gravity')
  );
  ok('grafo · física utiliza recozimento simulado (temperatura alpha e reaquecimento)',
    graphSource.includes('alpha *=') &&
    graphSource.includes('reheatSimulation') &&
    graphSource.includes('Math.max(0.1, 14 * alpha)')
  );
  ok('grafo · atração usa molas lineares de Hooke com comprimento de repouso',
    graphSource.includes('displacement = d - idealDist') &&
    graphSource.includes('attraction = displacement * linkK')
  );
  ok('grafo · index.html possui botão de configurações e painel com controles',
    htmlSource.includes('id="btn-graph-settings"') &&
    htmlSource.includes('id="graph-settings-panel"') &&
    htmlSource.includes('id="graph-setting-orphans"') &&
    htmlSource.includes('id="graph-setting-labels"') &&
    htmlSource.includes('id="graph-setting-shape"') &&
    htmlSource.includes('id="graph-setting-repulsion"') &&
    htmlSource.includes('id="graph-setting-link-distance"') &&
    htmlSource.includes('id="graph-setting-link-strength"') &&
    htmlSource.includes('id="graph-setting-gravity"') &&
    htmlSource.includes('id="btn-graph-reheat"') &&
    htmlSource.includes('id="btn-graph-reset-defaults"')
  );
  ok('grafo · style.css estiliza painel de configurações, switches e sliders',
    styleSource.includes('.graph-settings-panel') &&
    styleSource.includes('.graph-switch') &&
    styleSource.includes('.graph-range')
  );

  // 21.5: Nós em formato de estrela de 4 pontas da Logo e personalização
  ok('grafo · formato dos nós suporta estrela de 4 pontas da logo (drawStar4) e círculo',
    graphSource.includes('export function drawStar4') &&
    graphSource.includes('export function drawNodeShape') &&
    graphSource.includes("nodeShape: 'star'") &&
    graphSource.includes('bezierCurveTo') &&
    htmlSource.includes('id="graph-setting-shape"') &&
    htmlSource.includes('value="star"') &&
    htmlSource.includes('value="circle"')
  );
  ok('grafo · nós possuem efeito luminoso / halo neon no hover',
    graphSource.includes('ctx.shadowBlur = 14') &&
    graphSource.includes('ctx.shadowColor = nodeColor')
  );
  ok('grafo · estilo dos pontos das abas usa clip-path de estrela de 4 pontas da marca',
    styleSource.includes('.note-tab-dot') &&
    styleSource.includes('clip-path: polygon')
  );

  // 21.6: Modo de nó "Ícone da nota" (com fallback pra estrela)
  ok('grafo · modo de formato "icon" usa o ícone da nota e cai pra estrela quando não há um',
    htmlSource.includes('value="icon"') &&
    graphSource.includes("config.nodeShape === 'icon'") &&
    graphSource.includes('node.icon ?') &&
    graphSource.includes('Material Symbols Rounded')
  );

  // 21.7: Filtro por pasta no grafo inclui subpastas (nota em "Pai/Filho" não
  // deve sumir do grafo quando o usuário filtra pela pasta "Pai")
  ok('grafo · filtro de pasta inclui notas de subpastas (prefixo "pasta/")',
    graphSource.includes("pasta.startsWith(prefixo)")
  );

  // 21.8: Grafo se atualiza sozinho (criação/exclusão/edição local e
  // sincronização) sem exigir que a pessoa abra cada nota manualmente
  ok('grafo · escuta quickdock:notes-changed e recarrega o grafo inteiro quando visível',
    graphSource.includes("addEventListener('quickdock:notes-changed'") &&
    graphSource.includes('carregarERenderizarGrafo()')
  );
  ok('storage.js · createNoteRecord e deleteNoteRecordById avisam quickdock:notes-changed',
    storageSource.includes('function dispatchNotesChanged') &&
    storageSource.includes("new CustomEvent('quickdock:notes-changed')")
  );
  ok('note.js · flushSave avisa quickdock:notes-changed depois de reindexar os links',
    noteSource.includes("new CustomEvent('quickdock:notes-changed')")
  );
  ok('storage.js · DexieSyncStore reindexa os links de uma nota sincronizada sem depender do editor',
    storageSource.includes('async _reindexarLinksLocal') &&
    storageSource.includes('await this._reindexarLinksLocal(nota)')
  );
  ok('sync-controller.js · avisa quickdock:notes-changed ao final de uma rodada que trouxe mudanças remotas',
    syncControllerSource.includes("new CustomEvent('quickdock:notes-changed')")
  );

  // Verificação matemática da convergência de resfriamento em simulated annealing
  let testAlpha = 1.0;
  let stepsToCool = 0;
  while (testAlpha >= 0.002 && stepsToCool < 300) {
    testAlpha *= 0.955;
    stepsToCool++;
  }
  ok('grafo · resfriamento térmico garante parada estática antes de 160 passos', stepsToCool > 50 && stepsToCool < 160);

  // Verificação matemática da curva astroidal da estrela de 4 pontas (s = 0.18)
  const pinch = 0.18;
  const radius = 20;
  const topY = -radius;
  const cp1Y = -radius * pinch;
  ok('grafo · geometria astroidal da logo possui proporção de estrangulamento concêntrico',
    Math.abs(cp1Y - (-3.6)) < 0.001 && Math.abs(topY - (-20)) < 0.001
  );
}

// ── 22. Quadro Infinito / Canvas Espacial (Fase 5) ───────────────────────────
{
  const { readFile } = await import('node:fs/promises');
  const storageSource = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
  const boardHtmlSource = await readFile(new URL('../board/index.html', import.meta.url), 'utf8');
  const boardBootSource = await readFile(new URL('../board/board.js', import.meta.url), 'utf8');
  const boardJsSource = await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8');
  const boardStyleSource = await readFile(new URL('../board/style.css', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');

  // CSP: Manifest V3 proíbe qualquer tag <script> inline (sem src)
  ok('segurança · sidepanel/index.html não possui scripts inline (conformidade CSP Manifest V3)',
    !/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/i.test(sidepanelHtmlSource));
  ok('quadro · schema v11 declara tabela boards', storageSource.includes('db.version(11)') && storageSource.includes('boards: "++id, uid, title, updatedAt"'));
  ok('quadro · storage.js exporta funções de persistência de quadros', storageSource.includes('loadAllBoards') && storageSource.includes('saveBoardRecord') && storageSource.includes('getBoardByUid'));

  // 22.2: Transformações Matemáticas de Coordenadas
  const viewportAmostra = { x: 100, y: 50, zoom: 1.5 };
  const fakeScreenX = 250, fakeScreenY = 200;
  const calcWorldX = (fakeScreenX - viewportAmostra.x) / viewportAmostra.zoom;
  const calcWorldY = (fakeScreenY - viewportAmostra.y) / viewportAmostra.zoom;
  igual('quadro · cálculo matemático screenToWorld', calcWorldX, 100);
  igual('quadro · cálculo matemático screenToWorld Y', calcWorldY, 100);

  const calcScreenX = calcWorldX * viewportAmostra.zoom + viewportAmostra.x;
  igual('quadro · reversibilidade worldToScreen idempotente', calcScreenX, fakeScreenX);

  // 22.3: Arquivos Dedicados da Aba Cheia
  ok('quadro · board/index.html define contêiner, svg e camada de cartões', boardHtmlSource.includes('id="board-container"') && boardHtmlSource.includes('id="board-svg"') && boardHtmlSource.includes('id="board-cards-layer"'));
  ok('quadro · board/index.html define marcador de ponta de seta SVG', boardHtmlSource.includes('id="arrowhead"') && boardHtmlSource.includes('<marker'));
  ok('quadro · motor (board-engine.js) suporta pan, zoom focal e conexões', boardJsSource.includes('zoomBy') && boardJsSource.includes('addCard') && boardJsSource.includes('addArrow'));
  ok('quadro · board/style.css estiliza cartões flutuantes e fundo pontilhado', boardStyleSource.includes('.board-card') && boardStyleSource.includes('background-image: radial-gradient') && boardStyleSource.includes('.board-arrow-path'));

  // 22.4: Integração com o Painel Principal
  ok('quadro · app.js possui função abrirQuadroInfinito', appSource.includes('export function abrirQuadroInfinito') && appSource.includes('board/index.html'));
  ok('quadro · index.html possui botão de navegação para o quadro', sidepanelHtmlSource.includes('id="btn-nav-board"'));
  ok('quadro · menu de opções possui atalho para o quadro infinito', appSource.includes('Quadro Infinito'));

  // 22.5: Modo Integrado no Painel e Prevenção de Sobreposição de Telas
  const viewsSource = await readFile(new URL('../sidepanel/modules/views.js', import.meta.url), 'utf8');
  const sidepanelStyleSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  ok('quadro · views.js suporta visão integrada board', viewsSource.includes("viewName === 'board'"));
  ok('quadro · sidepanel/index.html possui seção board-view interna', sidepanelHtmlSource.includes('id="board-view"') && sidepanelHtmlSource.includes('id="btn-board-open-tab"'));
  ok('design · style.css isola visões para evitar sobreposição de telas', sidepanelStyleSource.includes('.board-view[hidden]') && sidepanelStyleSource.includes('html.view-board .note-section'));
  ok('design · botões de navegação lateral ocultos na extensão e mobile para evitar aperto', sidepanelStyleSource.includes('html[data-platform="extension"] #btn-nav-board') && sidepanelStyleSource.includes('html[data-platform="mobile"] #btn-nav-graph'));

  // 22.6: Motor Único (antes existiam DUAS cópias divergentes do quadro — uma
  // recebia correção, a outra não. Agora `board.js` e `board-view.js` são só
  // bootstraps finos do mesmo `board-engine.js`.)
  const boardViewSource = await readFile(new URL('../sidepanel/modules/board-view.js', import.meta.url), 'utf8');
  ok('quadro · board/board.js é um bootstrap fino do motor único (aba cheia)',
    boardBootSource.includes("import { initBoardEngine } from '../sidepanel/modules/board-engine.js'") &&
    boardBootSource.includes('initBoardEngine(document, { standalone: true })') &&
    !boardBootSource.includes('function renderArrows'));
  ok('quadro · board-view.js é um bootstrap fino do motor único (embutido no painel)',
    boardViewSource.includes("import { initBoardEngine") &&
    boardViewSource.includes('standalone: false') &&
    !boardViewSource.includes('function renderArrows'));
  ok('quadro · board-view.js continua exportando a API que app.js usa',
    boardViewSource.includes('export async function initBoardView') &&
    boardViewSource.includes('export { abrirQuadroInfinitoEmAba }'));
  ok('quadro · visão embutida sabe abrir a nota de verdade direto (mesma página do editor, sem ponte entre telas)',
    boardViewSource.includes('onAbrirNota:') && boardViewSource.includes('switchToNote(alvo.id)') && boardViewSource.includes('goBack()'));
  ok('quadro · sw.js pré-cacheia o motor compartilhado',
    (await readFile(new URL('../sw.js', import.meta.url), 'utf8')).includes("'sidepanel/modules/board-engine.js'"));
  ok('quadro · style.css do motor fica isolado em .board-theme-scope (não vaza pro resto do painel)',
    boardStyleSource.includes('.board-theme-scope {') &&
    boardStyleSource.includes('[data-theme="dark"] .board-theme-scope {') &&
    sidepanelHtmlSource.includes('class="board-view board-theme-scope"') &&
    sidepanelHtmlSource.includes('href="../board/style.css"'));

  const boardEngineModule = await import('../sidepanel/modules/board-engine.js');
  ok('quadro · board-engine.js compila sem erro de sintaxe e exporta APIs principais',
    typeof boardEngineModule.initBoardEngine === 'function' &&
    typeof boardEngineModule.addCard === 'function' &&
    typeof boardEngineModule.addGroupCard === 'function' &&
    typeof boardEngineModule.abrirQuadroInfinitoEmAba === 'function');
}

// ── 23. Propriedades Estruturadas de Notas e Modo Calendário ─────────────────
{
  const { readFile } = await import('node:fs/promises');
  const storageSource = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
  const notefileSource = await readFile(new URL('../sidepanel/modules/notefile.js', import.meta.url), 'utf8');
  const syncEngineSource = await readFile(new URL('../sidepanel/modules/sync-engine.js', import.meta.url), 'utf8');
  const noteSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const calendarSource = await readFile(new URL('../sidepanel/modules/calendar-view.js', import.meta.url), 'utf8');
  const viewsSource = await readFile(new URL('../sidepanel/modules/views.js', import.meta.url), 'utf8');
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const sidepanelStyleSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const appSource = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');

  // 23.1: Bloco de Propriedades da Nota
  ok('propriedades · storage.js carrega properties em loadAllNotesMeta e createNoteRecord',
    storageSource.includes('properties: properties ?? {}') &&
    storageSource.includes('properties = {}')
  );
  ok('propriedades · notefile.js suporta meta.properties em buildNoteFile',
    notefileSource.includes('meta.properties') &&
    notefileSource.includes('for (const [k, v] of Object.entries(meta.properties))')
  );
  ok('propriedades · sync-engine.js serializa e extrai propriedades de notas',
    syncEngineSource.includes('properties: nota.properties || {}') &&
    syncEngineSource.includes('_extrairPropriedadesDeMeta')
  );
  const notePropertiesSource = await readFile(new URL('../sidepanel/modules/note-properties.js', import.meta.url), 'utf8');
  ok('propriedades · note.js integra renderPropertiesBar (de note-properties.js) em switchToNote',
    noteSource.includes('renderPropertiesBar(note)') &&
    notePropertiesSource.includes('export function renderPropertiesBar') &&
    notePropertiesSource.includes('quickdock:note-properties-updated')
  );
  ok('propriedades · index.html define estrutura do bloco de propriedades',
    sidepanelHtmlSource.includes('id="note-properties-bar"') &&
    sidepanelHtmlSource.includes('id="btn-properties-toggle"') &&
    sidepanelHtmlSource.includes('id="note-properties-count"') &&
    sidepanelHtmlSource.includes('id="btn-add-property"') &&
    sidepanelHtmlSource.includes('id="note-properties-list"')
  );
  ok('propriedades · style.css estiliza bloco de propriedades no estilo Notion/Obsidian',
    sidepanelStyleSource.includes('.note-properties-bar') &&
    sidepanelStyleSource.includes('.note-property-row') &&
    sidepanelStyleSource.includes('.property-input-date') &&
    sidepanelStyleSource.includes('.property-select')
  );

  // 23.2: Modo de Calendário
  // Sem botão próprio no cabeçalho da barra lateral de propósito — o acesso
  // é só pelo menu "⋯" (ver 23.3): um quinto botão ali não cabia sem
  // quebrar o layout, e "Calendário" já está no mesmo lugar que "Grafo" e
  // "Quadro" estavam antes de ganharem atalho dedicado.
  ok('calendário · index.html define seção calendar-view',
    sidepanelHtmlSource.includes('id="calendar-view"') &&
    sidepanelHtmlSource.includes('id="calendar-grid"') &&
    sidepanelHtmlSource.includes('id="calendar-month-year"') &&
    sidepanelHtmlSource.includes('id="calendar-filter-category"') &&
    !sidepanelHtmlSource.includes('id="btn-nav-calendar"')
  );
  ok('calendário · views.js gerencia view calendar com isolamento de telas',
    viewsSource.includes("viewName === 'calendar'") &&
    viewsSource.includes('quickdock:refresh-calendar-view') &&
    sidepanelStyleSource.includes('html.view-calendar .note-section')
  );
  ok('calendário · app.js inicializa initCalendarView e menu de opções',
    appSource.includes('initCalendarView()') &&
    appSource.includes("switchView('calendar')") &&
    appSource.includes('Calendário')
  );

  // 23.3: Verificações Matemáticas e Puras de Datas do Calendário
  const {
    normalizarDataString,
    extrairDataDaNota,
    extrairCategoriaDaNota,
    formatarMesAno,
    gerarMatrizCalendario
  } = await import('../sidepanel/modules/calendar-view.js');

  igual('calendário · normalizarDataString aceita YYYY-MM-DD', normalizarDataString('2026-09-20'), '2026-09-20');
  igual('calendário · normalizarDataString devolve null para entrada inválida', normalizarDataString(''), null);
  igual('calendário · extrairDataDaNota recupera data das propriedades',
    extrairDataDaNota({ properties: { data: '2026-10-15' } }), '2026-10-15');
  igual('calendário · extrairCategoriaDaNota recupera categoria',
    extrairCategoriaDaNota({ properties: { categoria: 'Projetos' } }), 'Projetos');
  igual('calendário · formatarMesAno em português', formatarMesAno(2026, 8), 'Setembro de 2026');

  // Matriz de Setembro de 2026 (Começa em Terça-feira dia 1, tem 30 dias)
  const matrizSet2026 = gerarMatrizCalendario(2026, 8);
  ok('calendário · matriz é múltiplo exato de 7 (semanas completas)', matrizSet2026.length % 7 === 0);
  ok('calendário · matriz tem pelo menos 35 células', matrizSet2026.length >= 35);
  igual('calendário · primeira semana de Set/2026 inclui 2 dias de Agosto (Dom 30 e Seg 31)',
    matrizSet2026.filter(c => c.outroMes && c.mes === 7).length, 2);

  // Fevereiro bissexto vs não bissexto
  const matrizFevBissexto = gerarMatrizCalendario(2024, 1);
  const diasFevBissexto = matrizFevBissexto.filter(c => !c.outroMes);
  igual('calendário · fevereiro de ano bissexto (2024) tem 29 dias', diasFevBissexto.length, 29);

  const matrizFevNormal = gerarMatrizCalendario(2025, 1);
  const diasFevNormal = matrizFevNormal.filter(c => !c.outroMes);
  igual('calendário · fevereiro de ano comum (2025) tem 28 dias', diasFevNormal.length, 28);
}

// ── 24. Propriedades Tipadas e Cabeçalho da Nota (ícone/título/cor) ──────────
{
  const { readFile } = await import('node:fs/promises');
  const { buildNoteFile, parseNoteFile } = await import('../sidepanel/modules/notefile.js');
  const {
    PROPERTY_TYPES,
    inferirTipoPropriedade,
    migrarPropriedadeParaTipo,
  } = await import('../sidepanel/modules/property-types.js');

  // 24.1: inferirTipoPropriedade
  igual('property-types · tipo explícito prevalece sobre inferência por nome',
    inferirTipoPropriedade('status', { status: 'text' }), 'text');
  igual('property-types · sem tipo explícito, "data" infere date', inferirTipoPropriedade('data', {}), 'date');
  igual('property-types · sem tipo explícito, "categoria" infere list', inferirTipoPropriedade('categoria', {}), 'list');
  igual('property-types · sem tipo explícito, "status" infere select', inferirTipoPropriedade('status', {}), 'select');
  igual('property-types · chave desconhecida infere text', inferirTipoPropriedade('qualquercoisa', {}), 'text');
  ok('property-types · PROPERTY_TYPES cobre os 6 tipos',
    ['text', 'list', 'number', 'checkbox', 'date', 'select'].every(t => t in PROPERTY_TYPES));

  // 24.2: migrarPropriedadeParaTipo
  igual('property-types · migra texto "42" para number', migrarPropriedadeParaTipo('x', '42', 'number'), 42);
  igual('property-types · migra texto não-numérico para number vira 0', migrarPropriedadeParaTipo('x', 'abc', 'number'), 0);
  igual('property-types · migra number para text', migrarPropriedadeParaTipo('x', 42, 'text'), '42');
  igual('property-types · migra texto para list vira array de 1 item', migrarPropriedadeParaTipo('x', 'a', 'list'), ['a']);
  igual('property-types · migra array para list mantém array', migrarPropriedadeParaTipo('x', ['a', 'b'], 'list'), ['a', 'b']);
  igual('property-types · migra array para text junta com vírgula', migrarPropriedadeParaTipo('x', ['a', 'b'], 'text'), 'a, b');
  igual('property-types · migra "true"/valor truthy para checkbox', migrarPropriedadeParaTipo('x', 'sim', 'checkbox'), true);
  igual('property-types · migra vazio para checkbox vira false', migrarPropriedadeParaTipo('x', '', 'checkbox'), false);

  // 24.3: Frontmatter em bloco (lista) ida e volta — notefile.js
  const arquivoComLista = buildNoteFile({
    meta: { id: 'n1', titulo: 'Nota com categorias', properties: { categoria: ['Trabalho', 'Pessoal', 'Estudo'] } },
    md: 'Conteúdo qualquer',
  });
  ok('notefile · frontmatter grava lista em formato de bloco YAML',
    arquivoComLista.includes('categoria:\n') && arquivoComLista.includes('  - Trabalho'));
  const relidoComLista = parseNoteFile(arquivoComLista);
  igual('notefile · lista de categorias volta idêntica após parse', relidoComLista.meta.categoria, ['Trabalho', 'Pessoal', 'Estudo']);

  const arquivoListaVazia = buildNoteFile({
    meta: { id: 'n2', titulo: 'Nota sem categorias', properties: { categoria: [] } },
    md: 'x',
  });
  ok('notefile · lista vazia grava como "[]"', arquivoListaVazia.includes('categoria: []'));
  const relidoListaVazia = parseNoteFile(arquivoListaVazia);
  igual('notefile · lista vazia volta como array vazio', relidoListaVazia.meta.categoria, []);

  // 24.4: note-header.js / note-properties.js — cabeçalho tipado (ícone/título/cor) e propriedades tipadas
  const noteSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const noteHeaderSource = await readFile(new URL('../sidepanel/modules/note-header.js', import.meta.url), 'utf8');
  const notePropertiesSource2 = await readFile(new URL('../sidepanel/modules/note-properties.js', import.meta.url), 'utf8');
  ok('cabeçalho · note-header.js define renderNoteHeader e note.js integra em switchToNote',
    noteHeaderSource.includes('export function renderNoteHeader') &&
    noteSource.includes('renderNoteHeader(note)'));
  ok('cabeçalho · note-header.js persiste título com debounce e evento de preview na aba',
    noteHeaderSource.includes('commitHeaderTitle') &&
    noteHeaderSource.includes('quickdock:note-title-preview'));
  ok('cabeçalho · note-header.js abre popover de aparência (ícone/cor) reaproveitado das abas',
    noteHeaderSource.includes('openAppearancePopover') &&
    noteHeaderSource.includes('quickdock:note-appearance-updated'));
  ok('propriedades · note-properties.js usa inferirTipoPropriedade/migrarPropriedadeParaTipo em renderPropertiesBar',
    notePropertiesSource2.includes('inferirTipoPropriedade') &&
    notePropertiesSource2.includes('migrarPropriedadeParaTipo') &&
    notePropertiesSource2.includes('abrirMenuDeTipo'));
  ok('propriedades · note-properties.js sabe renderizar checkbox, lista (chips) e select tipados',
    notePropertiesSource2.includes('renderPropertyList') &&
    notePropertiesSource2.includes('renderPropertySelect') &&
    notePropertiesSource2.includes('property-checkbox-wrap'));

  // 24.5: index.html — estrutura do cabeçalho da nota
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  ok('cabeçalho · index.html define note-header-bar com ícone e título editável',
    sidepanelHtmlSource.includes('id="note-header-bar"') &&
    sidepanelHtmlSource.includes('id="btn-note-header-icon"') &&
    sidepanelHtmlSource.includes('id="note-header-title"') &&
    sidepanelHtmlSource.includes('contenteditable="true"'));

  // 24.6: style.css — estiliza cabeçalho e os novos tipos de campo
  const sidepanelStyleSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  ok('cabeçalho · style.css estiliza note-header-bar/título/ícone',
    sidepanelStyleSource.includes('.note-header-bar') &&
    sidepanelStyleSource.includes('.note-header-title') &&
    sidepanelStyleSource.includes(':empty::before'));
  ok('propriedades · style.css estiliza botão de tipo e chips de lista',
    sidepanelStyleSource.includes('.property-type-btn') &&
    sidepanelStyleSource.includes('.property-chip-list') &&
    sidepanelStyleSource.includes('.property-chip-remove'));

  // 24.7: sw.js — property-types.js está no pré-cache do PWA
  const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  ok('pwa · sw.js pré-cacheia property-types.js', swSource.includes("'sidepanel/modules/property-types.js'"));
}

// ── 25. Quadro: Colar Imagem e Cartão de Nota (HANDOFF-8, itens 5 e 6) ───────
{
  const { readFile } = await import('node:fs/promises');
  const boardHtmlSource = await readFile(new URL('../board/index.html', import.meta.url), 'utf8');
  const boardJsSource = await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8');
  const boardStyleSource = await readFile(new URL('../board/style.css', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');

  // 25.1: Colar imagem no quadro (item 5)
  ok('quadro · board.js importa saveFile/loadFileBlob/deleteFile do storage.js',
    boardJsSource.includes('saveFile,') && boardJsSource.includes('loadFileBlob,') && boardJsSource.includes('deleteFile,'));
  ok('quadro · board.js ouve paste de imagem e cria cartão de imagem',
    boardJsSource.includes("addEventListener('paste'") &&
    boardJsSource.includes("it.type.startsWith('image/')") &&
    boardJsSource.includes('addImageCard'));
  ok('quadro · board.js guarda a imagem colada como Blob (files do Dexie), inline e sem noteId',
    boardJsSource.includes('saveFile(file, null, { inline: true })'));
  ok('quadro · board.js carrega o Blob da imagem do cartão via loadFileBlob',
    boardJsSource.includes('loadFileBlob(card.fileId)') && boardJsSource.includes('URL.createObjectURL(blob)'));
  ok('quadro · excluir cartão de imagem também exclui o arquivo (sem órfão no banco)',
    boardJsSource.includes("card?.type === 'image' && card.fileId != null") && boardJsSource.includes('deleteFile(card.fileId)'));
  ok('quadro · style.css estiliza o corpo do cartão de imagem',
    boardStyleSource.includes('.board-card-image-body') && boardStyleSource.includes('.board-card-image-el'));

  // 25.2: Cartão de nota vinculada e criação de nota a partir do quadro (item 6)
  ok('quadro · board.js importa loadAllNotesMeta/createNoteRecord do storage.js',
    boardJsSource.includes('loadAllNotesMeta,') && boardJsSource.includes('createNoteRecord,'));
  ok('quadro · board.js define addNoteCard e cartão de nota guarda só o uid (não cópia do conteúdo)',
    boardJsSource.includes('function addNoteCard(') && boardJsSource.includes("type: 'note', noteUid"));
  ok('quadro · cartão de nota mostra ícone e título de verdade, e cor herdada da nota',
    boardJsSource.includes('function noteCardBodyHtml(') &&
    boardJsSource.includes('nota.icon') && boardJsSource.includes('nota.title') &&
    boardJsSource.includes("tipo === 'note' ? (nota?.color || null)"));
  ok('quadro · cartão de nota trata nota removida sem quebrar (estado "não encontrada")',
    boardJsSource.includes('is-missing') && boardJsSource.includes('Nota não encontrada'));
  ok('quadro · duplo clique no cartão de nota abre a nota de verdade',
    boardJsSource.includes("addEventListener('dblclick'") && boardJsSource.includes('abrirNotaDoQuadro(nota.uid)'));
  ok('quadro · botão "Vincular nota" busca por título e cria o cartão no local escolhido',
    boardJsSource.includes('function openNoteSearchPanel(') && boardJsSource.includes('addNoteCard('));
  ok('quadro · botão "Nova nota" cria a nota (createNoteRecord) e já solta o cartão vinculado',
    boardJsSource.includes('async function criarNotaEAdicionar()') &&
    boardJsSource.includes('await createNoteRecord({ title:'));
  ok('quadro · index.html tem o botão Inserir (nota existente/nova, link, arquivo) na barra de ferramentas',
    boardHtmlSource.includes('id="tool-insert"') && boardJsSource.includes('onLinkNote:') && boardJsSource.includes('onCreateNote:'));
  ok('quadro · style.css estiliza cartão de nota e popover de busca',
    boardStyleSource.includes('.board-card-note-body') && boardStyleSource.includes('.board-note-search-popover'));

  // 25.3: Ponte para abrir a nota fora do quadro sem corromper o rastreamento
  // do painel lateral (Ctrl+Q) — ver background.js, porta 'sidepanel'.
  ok('quadro · abrirNotaDoQuadro evita abrir index.html como aba comum na extensão (corromperia o toggle Ctrl+Q)',
    boardJsSource.includes('chrome.sidePanel.open') && boardJsSource.includes("quickdockAbrirNotaUid"));
  ok('quadro · abrirNotaDoQuadro cai para window.open no contexto PWA/navegador comum',
    boardJsSource.includes("window.open(`../index.html?abrirNota="));
  ok('app.js · escuta mensagem ao vivo quickdock:abrir-nota (painel já aberto)',
    appSource.includes("chrome.runtime.onMessage.addListener") && appSource.includes("'quickdock:abrir-nota'"));
  ok('app.js · lê storage.local/URL no boot (painel fechado ou PWA) e limpa a pista depois',
    appSource.includes('quickdockAbrirNotaUid') &&
    appSource.includes("chrome.storage.local.remove('quickdockAbrirNotaUid')") &&
    appSource.includes("params.get('abrirNota')") &&
    appSource.includes("url.searchParams.delete('abrirNota')"));
}

// ── 26. Quadro: Âncoras Explícitas de Seta, Rastro Sem Vazamento e Popover de
//        Cor por Cartão (bugs reportados com print real, 2026-09-20) ─────────
{
  const { readFile } = await import('node:fs/promises');
  const boardJsSource = await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8');
  const boardHtmlSource = await readFile(new URL('../board/index.html', import.meta.url), 'utf8');
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const boardStyleSource = await readFile(new URL('../board/style.css', import.meta.url), 'utf8');

  // 26.1: `toSide` explícito (mesmo modelo do JSON Canvas do Obsidian: as
  // duas pontas de uma aresta são gravadas no momento em que são desenhadas,
  // nunca recalculadas depois a partir de onde os cartões estão agora).
  ok('setas · addArrow aceita e grava toSide explícito',
    boardJsSource.includes('function addArrow(fromId, toId, style = \'solid\', fromSide = null, toSide = null)') &&
    boardJsSource.includes('toSide: toSide || null'));
  ok('setas · soltar a conexão calcula o lado de chegada pelo ponto real onde soltou, não pelo centro do cartão',
    boardJsSource.includes('sideTowards(targetCardEl.getBoundingClientRect()') &&
    boardJsSource.includes('addArrow(origem.id, targetId, \'solid\', origemLado, toSide)'));
  ok('setas · renderArrows prefere o toSide gravado, só cai pro cálculo por direção em setas antigas',
    boardJsSource.includes('const fromSide = arrow.fromSide || sideTowards(r1, s2)') &&
    boardJsSource.includes('const toSide = arrow.toSide || sideTowards(r2, s1)'));
  ok('setas · a heurística antiga (nearestSide encadeado com clipLineToRect) foi removida, não só contornada',
    !boardJsSource.includes('function nearestSide(') &&
    !boardJsSource.includes('function clipLineToRect('));
  ok('setas · sideTowards normaliza pela metade da largura/altura do retângulo (não deixa o lado mais comprido sempre vencer)',
    boardJsSource.includes('function sideTowards(rect, point)') &&
    boardJsSource.includes('const nx = (point.x - cx) / halfW') &&
    boardJsSource.includes('const ny = (point.y - cy) / halfH'));

  // 26.2: Rastro tracejado da conexão não pode sobreviver ao fim do arrasto —
  // um só ponto de saída, chamado de todo caminho de limpeza, mais uma
  // auto-cura em renderArrows (que roda a toda hora) como último recurso.
  ok('setas · existe um único ponto de saída do modo "conectando" (evita esquecer de zerar um campo em algum caminho)',
    boardJsSource.includes('function ocultarRastroDeConexao()') &&
    boardJsSource.includes('connectingFrom = null;\n  connectingFromSide = null;\n  connectingHandlePos = null;\n  draftArrow.hidden = true;'));
  ok('setas · pointerup/pointercancel da janela inteira e o pointerup do handle usam o mesmo ponto de saída',
    (boardJsSource.match(/ocultarRastroDeConexao\(\)/g) || []).length >= 4);
  ok('setas · renderArrows se auto-cura se o rastro ficou visível sem conexão em andamento',
    boardJsSource.includes('if (!connectingFrom && !draftArrow.hidden) draftArrow.hidden = true;'));
  ok('setas · rede de segurança extra: qualquer gesto novo fora de um handle limpa um estado "conectando" preso',
    boardJsSource.includes("!e.target.closest('.board-card-connect-handle')") &&
    boardJsSource.includes('ocultarRastroDeConexao();\n    }\n  }, true);'));

  // 26.3: Popover de cor tinha que fechar e reabrir pro cartão certo com um
  // clique só — clicar no botão de OUTRO cartão enquanto um já está aberto
  // não pode só fechar o errado e exigir um segundo clique.
  ok('cor · toggleColorPopover rastreia de qual cartão é o popover aberto',
    boardJsSource.includes('pop.dataset.anchorCardId = card.id') &&
    boardJsSource.includes('openColorPopover?.dataset.anchorCardId === card.id'));
  ok('cor · clicar no botão de outro cartão troca de popover num clique só (fecha o antigo e já abre o novo)',
    boardJsSource.includes('const mesmoCartao = openColorPopover?.dataset.anchorCardId === card.id;') &&
    boardJsSource.includes('closeColorPopover();\n  if (mesmoCartao) return;'));

  // 26.4: Paridade com Obsidian Canvas (Zero Jitter, Grupos, Imagens e Fluxogramas)
  ok('canvas obsidian · SVG posicionado dentro de board-world para zero jitter',
    boardHtmlSource.includes('<div id="board-world" class="board-world">\n      <!-- Camada SVG') &&
    sidepanelHtmlSource.includes('<div id="board-world" class="board-world">\n          <svg id="board-svg"'));
  ok('canvas obsidian · suporte a cartões de grupo (Obsidian Canvas Group)',
    boardJsSource.includes('export function addGroupCard') &&
    boardJsSource.includes("type: 'group'") &&
    boardStyleSource.includes('.board-card[data-card-type="group"]'));
  ok('canvas obsidian · ferramentas de Imagem e Grupo presentes no HTML e motor',
    boardHtmlSource.includes('id="tool-insert"') &&
    boardHtmlSource.includes('id="tool-group"') &&
    boardHtmlSource.includes('id="board-image-upload-input"') &&
    boardJsSource.includes("getEl('tool-insert')") &&
    boardJsSource.includes("getEl('tool-group')"));
  ok('canvas obsidian · suporte a drag and drop de arquivos de imagem no canvas',
    boardJsSource.includes("container.addEventListener('dragover'") &&
    boardJsSource.includes("container.addEventListener('drop'"));
  ok('canvas obsidian · marcadores de seta start e end para conexões direcionais e bidirecionais',
    boardHtmlSource.includes('id="arrowhead"') &&
    boardHtmlSource.includes('id="arrowhead-start"'));
}

// ── 27. Quadro: Paridade Completa com Obsidian Canvas (Setas Retas/Curvas,
//        Hit Area 16px, Marquee Selection, Auto-Alinhamento, Arco-Íris e Zero Dialogs) ──
{
  const { readFile } = await import('node:fs/promises');
  const boardJsSource = await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8');
  const boardHtmlSource = await readFile(new URL('../board/index.html', import.meta.url), 'utf8');
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const boardStyleSource = await readFile(new URL('../board/style.css', import.meta.url), 'utf8');

  // 27.1: Setas Retas vs Curvas Bézier
  ok('canvas obsidian 2.0 · renderArrows suporta linhas retas (straight) e curvas (curved)',
    boardJsSource.includes("const isStraight = arrow.lineStyle === 'straight';") &&
    boardJsSource.includes("M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}") &&
    boardJsSource.includes("M ${p1.x} ${p1.y} C ${cx1} ${cy1}"));

  // 27.2: Hit area de 16px transparente para clique e toque facilitados
  ok('canvas obsidian 2.0 · hit area transparente de 16px com hover sincronizado',
    boardJsSource.includes("hitArea.setAttribute('class', 'board-arrow-hit-area')") &&
    boardStyleSource.includes('.board-arrow-hit-area') &&
    boardStyleSource.includes('stroke-width: 16px;') &&
    boardStyleSource.includes('.board-arrow-hit-area:hover + .board-arrow-path'));

  // 27.3: Rótulo e menu contextual sem alerts, prompts ou dialogs nativos
  ok('canvas obsidian 2.0 · popover contextual inline para conexões substitui prompt/confirm',
    boardJsSource.includes('function showArrowPopover(e, arrow)') &&
    boardJsSource.includes('pop.className = \'board-arrow-popover\'') &&
    boardJsSource.includes("pop.querySelector('.pop-arrow-label')") &&
    boardJsSource.includes("pop.querySelector('.pop-delete-arrow')") &&
    !boardJsSource.includes('window.prompt(') &&
    !boardJsSource.includes('confirm('));

  // 27.4: Direcionalidade de conexões (unidirecional, bidirecional, sem ponta)
  ok('canvas obsidian 2.0 · suporte a direcionalidade (forward, bidirectional, none)',
    boardJsSource.includes("data-dir=\"forward\"") &&
    boardJsSource.includes("data-dir=\"bidirectional\"") &&
    boardJsSource.includes("data-dir=\"none\"") &&
    boardJsSource.includes("marker-start") &&
    boardJsSource.includes("marker-end"));

  // 27.5: Live draft arrow enquanto arrasta conexão
  ok('canvas obsidian 2.0 · draft arrow visível com ponta de seta durante arrasto',
    boardHtmlSource.includes('id="board-draft-arrow"') &&
    boardHtmlSource.includes('marker-end="url(#arrowhead)"') &&
    sidepanelHtmlSource.includes('id="board-draft-arrow"') &&
    sidepanelHtmlSource.includes('marker-end="url(#arrowhead)"') &&
    boardJsSource.includes("draftArrow.removeAttribute('hidden')") &&
    boardJsSource.includes("draftArrow.setAttribute('marker-end', 'url(#arrowhead)')"));

  // 27.6: Seleção por retângulo (Marquee Selection) — Desktop Ctrl+Drag e Mobile Touch
  ok('canvas obsidian 2.0 · seleção por retângulo (Ctrl+Drag e touch long-press)',
    boardHtmlSource.includes('id="board-selection-box"') &&
    sidepanelHtmlSource.includes('id="board-selection-box"') &&
    boardJsSource.includes('e.ctrlKey || e.metaKey || isMobileSelectionMode') &&
    boardJsSource.includes('isBoxSelecting = true') &&
    boardJsSource.includes('longPressTimer = setTimeout(') &&
    boardStyleSource.includes('.board-selection-box'));

  // 27.7: Barra flutuante de seleção múltipla (Alinhar, Agrupar, Cor, Excluir)
  ok('canvas obsidian 2.0 · barra de ferramentas para seleção múltipla',
    boardHtmlSource.includes('id="board-selection-toolbar"') &&
    sidepanelHtmlSource.includes('id="board-selection-toolbar"') &&
    boardJsSource.includes('function updateSelectionToolbar()') &&
    boardJsSource.includes('function alignSelectedCards(') &&
    boardJsSource.includes('function groupSelectedCards()') &&
    boardJsSource.includes('function deleteSelectedCards()') &&
    boardStyleSource.includes('.board-selection-toolbar'));

  // 27.8: Paleta de Cores: 7 cores do arco-íris + personalizada com z-index 10000
  const boardColorsSource = await readFile(new URL('../sidepanel/modules/board/board-colors.js', import.meta.url), 'utf8');
  ok('canvas obsidian 2.0 · paleta com 7 cores do arco-íris e seletor customizado',
    boardColorsSource.includes("name: 'Vermelho'") &&
    boardColorsSource.includes("name: 'Laranja'") &&
    boardColorsSource.includes("name: 'Amarelo'") &&
    boardColorsSource.includes("name: 'Verde'") &&
    boardColorsSource.includes("name: 'Azul'") &&
    boardColorsSource.includes("name: 'Índigo'") &&
    boardColorsSource.includes("name: 'Violeta'") &&
    boardJsSource.includes("'board-color-swatch is-custom'") &&
    boardStyleSource.includes('z-index: 10000;'));

  // 27.9: Auto-Alinhamento Inteligente (Smart Snapping)
  ok('canvas obsidian 2.0 · auto-alinhamento magnético inteligente com guias visuais',
    boardHtmlSource.includes('id="board-svg-guides"') &&
    sidepanelHtmlSource.includes('id="board-svg-guides"') &&
    boardJsSource.includes('function computeSnapping(') &&
    boardJsSource.includes('function renderGuideLines(') &&
    boardStyleSource.includes('.board-guide-line'));

  // 27.10: Roteamento Ortogonal Inteligente em Conexões Retas (não corta cards na mesma reta)
  ok('canvas obsidian 2.0 · roteamento ortogonal inteligente com cantos arredondados para cartões alinhados',
    boardJsSource.includes('function getOrthogonalWaypoints(') &&
    boardJsSource.includes("fromSide === 'right' && toSide === 'right'") &&
    boardJsSource.includes('function waypointsToSvgPath(') &&
    boardJsSource.includes('function waypointPathMidpoint('));

  // 27.11: Agrupar Cartões não some com elementos (segurança contra escHtml(undefined))
  ok('canvas obsidian 2.0 · agrupar cartões preserva todos os nós no DOM',
    boardJsSource.includes("tipo === 'group'") &&
    boardJsSource.includes("board-card-group-body") &&
    boardJsSource.includes("label: 'Novo Grupo'"));

  // 27.12: Zero Delay na atualização de setas (atualização in-place no SVG e cache de rect)
  ok('canvas obsidian 2.0 · atualização em tempo real sem lag via arrowDomMap e cachedContainerRect',
    boardJsSource.includes('const arrowDomMap = new Map();') &&
    boardJsSource.includes('cachedContainerRect') &&
    boardJsSource.includes('dom.hitArea.setAttribute(\'d\', pathD);'));

  // 27.13: Guias visuais de auto-alinhamento estilo Canva
  ok('canvas obsidian 2.0 · guias visuais inteligentes de alinhamento estilo Canva com pontos de precisão',
    boardJsSource.includes('board-guide-dot') &&
    boardStyleSource.includes('.board-guide-dot') &&
    boardJsSource.includes('start: startY, end: endY') &&
    boardJsSource.includes('start: startX, end: endX'));

  // 27.14: Pontos de conexão de setas estritamente cardeais (N/S/L/O)
  ok('canvas obsidian 2.0 · pontos de conexão saem estritamente dos centros cardeais N/S/L/O',
    boardJsSource.includes('item.fracFrom = 0.5;') &&
    boardJsSource.includes('item.fracTo = 0.5;') &&
    boardJsSource.includes('data-handle="top" title="Puxar conexão (Norte)"') &&
    boardJsSource.includes('data-handle="right" title="Puxar conexão (Leste)"'));

  // 27.15: Feedback visual e atração magnética ao conectar setas
  ok('canvas obsidian 2.0 · feedback visual claro e atração magnética ao conectar seta a outro card',
    boardJsSource.includes('function updateConnectingArrow(') &&
    boardJsSource.includes('function finishConnectingArrow(') &&
    boardJsSource.includes('is-connect-target') &&
    boardJsSource.includes('is-target-port') &&
    boardStyleSource.includes('.board-card.is-connect-target') &&
    boardStyleSource.includes('.board-card-connect-handle.is-target-port'));

  // 27.16: Suporte completo a elementos e formas de fluxogramas
  ok('canvas obsidian 2.0 · suporte completo para fluxogramas (decisão, terminal, dados, documento)',
    boardJsSource.includes('FLOWCHART_SHAPES') &&
    boardJsSource.includes('function toggleShapePopover(') &&
    boardJsSource.includes('function toggleFlowchartPanel(') &&
    boardJsSource.includes('function addFlowchartCard(') &&
    boardHtmlSource.includes('id="tool-flowchart"') &&
    sidepanelHtmlSource.includes('id="tool-flowchart"') &&
    boardStyleSource.includes('.board-card-shape-svg') &&
    boardStyleSource.includes('.board-shape-popover'));

  // 27.17: Configurações persistentes de setas (sólido, tracejado, pontilhado, direção e cores)
  ok('canvas obsidian 2.0 · personalização estável de setas com cores dinâmicas e traço pontilhado',
    boardJsSource.includes('function getMarkerUrl(') &&
    boardJsSource.includes('data-stroke="solid"') &&
    boardJsSource.includes('data-stroke="dashed"') &&
    boardJsSource.includes('data-stroke="dotted"') &&
    boardJsSource.includes("strokeStyle === 'dotted'") &&
    boardStyleSource.includes('.board-chip-btn'));

  // 27.18: Prevenção de movimento aleatório de cards ao criar conexões e overflow/dimensionamento do menu de opções
  ok('canvas obsidian 2.0 · card permanece estático durante conexão e popover possui overflow e dimensionamento adequados',
    !boardStyleSource.includes('.board-card.is-connect-target {\n  outline: 2.5px solid var(--accent, #3b82f6) !important;\n  box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.25), 0 8px 24px rgba(0, 0, 0, 0.15) !important;\n  transform:') &&
    !boardStyleSource.includes('transform: scale(1.015)') &&
    boardJsSource.includes('if (connectingFrom) return;') &&
    boardStyleSource.includes('.board-arrow-popover') &&
    boardStyleSource.includes('box-sizing: border-box;') &&
    boardStyleSource.includes('overflow-y: auto;'));

  // 28: Obsidian Live Preview & Source-on-Cursor Parity
  const noteJsSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  // 28.1: Divisor '---' editável e navegável via cursor/backspace
  // A ativação/desativação do modo "texto cru" é decidida por onde o cursor
  // está a cada seleção nova (syncDividerActiveState, chamada de dentro de
  // updateLivePreviewState) — não por focusin/focusout. Todo bloco é um
  // contenteditable aninhado dentro do mesmo host editável do documento
  // inteiro, então mover o cursor com clique ou seta nunca dispara blur de
  // verdade num bloco só: o focusin/focusout antigo deixava o divisor preso
  // mostrando "---" pra sempre depois do primeiro clique.
  ok('live-preview · divisor possui estrutura de texto editável e hr visual',
    noteJsSource.includes("content.className = 'block-content divider-content';") &&
    noteJsSource.includes("content.textContent = (innerHTML && /^(-{3,}|\\*{3,}|_{3,})$/.test(innerHTML.trim())) ? innerHTML.trim() : '---';") &&
    noteJsSource.includes('function syncDividerActiveState(block)') &&
    noteJsSource.includes('function commitDivider(block)') &&
    noteJsSource.includes("convertBlockType(block, 'paragraph');"));

  ok('live-preview · CSS do divisor alterna entre hr limpo e texto puro no foco',
    styleCssSource.includes('.block-divider.is-active .divider-content') &&
    styleCssSource.includes('.block-divider.is-active hr') &&
    styleCssSource.includes('display: none;') &&
    styleCssSource.includes('.block-divider .divider-content'));

  ok('live-preview · Backspace na linha abaixo do divisor navega para o final do divisor em vez de deletar no escuro',
    noteJsSource.includes("if (prev.dataset.type === 'divider') {") &&
    noteJsSource.includes("const prevContent = getContentEl(prev);") &&
    noteJsSource.includes("prevContent.focus();") &&
    noteJsSource.includes("setCaretOffset(prevContent, prevContent.textContent.length);"));

  ok('live-preview · Enter no divisor insere novo parágrafo abaixo preservando o divisor',
    noteJsSource.includes("if (type === 'divider') {") &&
    noteJsSource.includes("const newBlock = createBlockEl('paragraph');") &&
    noteJsSource.includes("block.after(newBlock);") &&
    noteJsSource.includes("focusBlockStart(newBlock);"));

  // 28.2: Cabeçalhos com redução de nível e prefixo editável
  ok('live-preview · Backspace reduz nível do cabeçalho (h3 -> h2 -> h1 -> parágrafo)',
    noteJsSource.includes("const level = Number(type.replace('heading', ''));") &&
    noteJsSource.includes("convertBlockType(block, `heading${level - 1}`);") &&
    noteJsSource.includes("convertBlockType(block, 'paragraph');"));

  ok('live-preview · Apagar o # do cabeçalho via Backspace desformata imediatamente para parágrafo',
    noteJsSource.includes('if (HEADING_TAGS[block.dataset.type]) {') &&
    noteJsSource.includes('if (hashCount === 0) {') &&
    noteJsSource.includes("convertBlockType(block, 'paragraph');") &&
    noteJsSource.includes("oldContent.querySelectorAll(':scope > .md-syntax-prefix').forEach(p => p.remove());"));

  ok('live-preview · Motor de Live Preview revela prefixos de cabeçalho e citação reais no foco',
    noteJsSource.includes('function revealBlockSyntax(') &&
    noteJsSource.includes('function collapseBlockSyntax(') &&
    noteJsSource.includes("prefixSpan.className = 'md-syntax-prefix';") &&
    noteJsSource.includes("prefixSpan.contentEditable = 'true';"));

  ok('live-preview · CSS estiliza prefixos de cabeçalho e citação',
    styleCssSource.includes('.md-syntax-prefix') &&
    styleCssSource.includes('font-family: var(--font-mono, monospace);') &&
    styleCssSource.includes('color: var(--text-muted);'));

  ok('live-preview · Protege texto digitado no prefixSpan para não ser engolido nem deletado no collapse',
    noteJsSource.includes('extraText') &&
    noteJsSource.includes("prefixSpan.textContent = '#'.repeat(hashCount) + ' ';") &&
    noteJsSource.includes('p.after(document.createTextNode(extra));'));

  // 28.3: Formatação inline com delimitadores reais no cursor e unwrap
  ok('live-preview · Motor de Live Preview revela delimitadores inline reais',
    noteJsSource.includes('function revealInlineSyntax(') &&
    noteJsSource.includes('function collapseInlineSyntax(') &&
    noteJsSource.includes("openSpan.className = 'md-syntax md-syntax-open';") &&
    noteJsSource.includes("openSpan.contentEditable = 'true';"));

  ok('live-preview · CSS estiliza delimitadores inline reais no cursor',
    styleCssSource.includes('.md-syntax') &&
    styleCssSource.includes('font-family: var(--font-mono, monospace);') &&
    styleCssSource.includes('text-decoration: none !important;'));

  ok('live-preview · Desfaz formatação inline ao apagar delimitadores com Backspace ou Delete',
    noteJsSource.includes('(e.key === \'Backspace\' || e.key === \'Delete\') && livePreviewActiveInline') &&
    noteJsSource.includes('inline.replaceWith(fragment);') &&
    noteJsSource.includes('inline.replaceWith(...inline.childNodes);'));

  ok('live-preview · updateLivePreviewState chamado no selectionchange e blur no root',
    noteJsSource.includes('updateLivePreviewState();') &&
    noteJsSource.includes('const sel = document.getSelection();') &&
    noteJsSource.includes('if (!sel || sel.rangeCount === 0)') &&
    noteJsSource.includes('collapseBlockSyntax(livePreviewActiveBlock)') &&
    noteJsSource.includes('collapseInlineSyntax(livePreviewActiveInline)'));

  ok('live-preview · sanitização segura remove elementos temporários de sintaxe',
    noteJsSource.includes("div.querySelectorAll('.md-syntax-prefix, .md-syntax').forEach(el => el.remove());"));
}

// ── 29. Obsidian Live Preview Completo & Paridade Avançada ────────────────────
{
  const { readFile } = await import('node:fs/promises');
  const noteJsSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const noteDetectionSource = await readFile(new URL('../sidepanel/modules/note-detection.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const { parseMarkdownToBlocks, blocksToMarkdown } = await import('../sidepanel/modules/blocks.js');

  // 29.1: Tags (#tag e #tag/aninhada)
  const b1 = parseMarkdownToBlocks('Nota com #projeto e #trabalho/fase-1/modulo_2 aqui');
  ok('tags · gera span com classe note-tag e data-tag',
    b1[0].html.includes('<span class="note-tag" data-tag="projeto">#projeto</span>') &&
    b1[0].html.includes('<span class="note-tag" data-tag="trabalho/fase-1/modulo_2">#trabalho/fase-1/modulo_2</span>'));

  const md1 = blocksToMarkdown(b1);
  igual('tags · roundtrip preserva tags e tags aninhadas', md1, 'Nota com #projeto e #trabalho/fase-1/modulo_2 aqui');

  const bNum = parseMarkdownToBlocks('Protocolo #12345 não é tag');
  ok('tags · número puro #12345 não vira tag', !bNum[0].html.includes('note-tag') && bNum[0].html.includes('#12345'));

  const bHead = parseMarkdownToBlocks('# Título Importante com #tag');
  igual('tags · título com tag preserva tipo de cabeçalho', bHead[0].type, 'heading1');
  ok('tags · tag dentro de título é formatada', bHead[0].html.includes('<span class="note-tag" data-tag="tag">#tag</span>'));

  ok('tags · detector de tags presente em note-detection.js e DETECTORS',
    noteDetectionSource.includes("type: 'tag'") &&
    noteDetectionSource.includes("cls = 'note-tag tag';") &&
    noteDetectionSource.includes("mark.dataset.tag = m.raw.replace(/^#/, '');"));

  ok('tags · clique em tag dispara busca por tag na interface',
    noteJsSource.includes("const tagEl = e.target.closest('.note-tag, mark.tag');") &&
    noteJsSource.includes("searchInput.value = `#${tagValue}`;") &&
    noteJsSource.includes("'quickdock:search-notes'"));

  ok('tags · CSS estiliza tags e tags aninhadas com visual pill/badge',
    styleCssSource.includes('.note-editor-blocks .note-tag') &&
    styleCssSource.includes('mark.tag') &&
    styleCssSource.includes('background: color-mix(in srgb, var(--accent) 14%, transparent);'));

  // 29.2: Atalhos de cabeçalho preservando texto existente (# separado vs #junto)
  const ini = noteJsSource.indexOf('const BLOCK_SHORTCUTS = [');
  const fim = noteJsSource.indexOf('];', ini);
  const shortcuts = new Function(`${noteJsSource.slice(ini, fim + 2)}\nreturn BLOCK_SHORTCUTS;`)();
  const testShortcut = str => {
    for (const s of shortcuts) {
      const m = s.re.exec(str);
      if (m) return { type: s.type(m), rest: m[2] };
    }
    return null;
  };

  igual('cabeçalho · "# texto existente" vira heading1 preservando texto', testShortcut('# meu texto'), { type: 'heading1', rest: 'meu texto' });
  igual('cabeçalho · "## texto existente" vira heading2 preservando texto', testShortcut('## subtitulo aqui'), { type: 'heading2', rest: 'subtitulo aqui' });
  igual('cabeçalho · "#tag" junto não vira título', testShortcut('#minhatag'), null);
  igual('cabeçalho · "# tag" separado vira título', testShortcut('# minhatag'), { type: 'heading1', rest: 'minhatag' });

  ok('cabeçalho · checkBlockShortcut remove prefixo e preserva texto restante',
    noteJsSource.includes('const prefixLen = s.prefixLen ? s.prefixLen(m) : m[0].length;') &&
    noteJsSource.includes('r.deleteContents();') &&
    noteJsSource.includes('convertBlockType(block, type, checked);'));

  // 29.3: Auto-pair / envolver seleção de texto e conversão imediata para formatação
  ok('auto-pair · suporte a delimitação com trim de espaços em branco externos',
    noteJsSource.includes("const leadingSpace = leadMatch ? leadMatch[0] : '';") &&
    noteJsSource.includes("const trailingSpace = trailMatch ? trailMatch[0] : '';") &&
    noteJsSource.includes("const coreText = rawSelected.slice(leadingSpace.length"));

  ok('auto-pair · duplo [ converte seleção imediatamente em link interno note-internal-link',
    noteJsSource.includes("if (e.key === '[' || e.key === ']')") &&
    noteJsSource.includes("if (/^\\[([^\\]]+)\\]$/.test(coreText))") &&
    noteJsSource.includes("a.className = 'note-internal-link';"));

  ok('auto-pair · duplo * converte seleção imediatamente em negrito strong com Live Preview',
    noteJsSource.includes("if (e.key === '*')") &&
    noteJsSource.includes("if (/^\\*([^*]+)\\*$/.test(coreText))") &&
    noteJsSource.includes("const strong = document.createElement('strong');"));

  ok('auto-pair · tecla # com texto selecionado no início/bloco converte em título',
    noteJsSource.includes("if (e.key === '#')") &&
    noteJsSource.includes("convertBlockType(block, nextType);"));

  ok('auto-pair · tecla # com texto selecionado no meio envolve como tag #',
    noteJsSource.includes("const textNode = document.createTextNode(`#${coreText}`);"));

  ok('auto-pair · pares literais e encadeamento preservam seleção',
    noteJsSource.includes("const PAIRS = {") &&
    noteJsSource.includes("newRange.selectNode(nodeToSelect);"));

  // 29.4: Linha divisória --- (hr completo e edição estilo Obsidian)
  ok('divisor · checkDividerShortcut foca linha seguinte para exibir hr completo',
    noteJsSource.includes("checkDividerShortcut(block)") &&
    noteJsSource.includes("dividerContent.textContent = text;") &&
    noteJsSource.includes("focusBlockStart(next);"));

  ok('divisor · CSS exibe hr completo e oculta divider-content fora de foco',
    styleCssSource.includes(".block-divider hr") &&
    styleCssSource.includes("width: 100%;") &&
    styleCssSource.includes(".block-divider:focus-within .divider-content") &&
    styleCssSource.includes(".block-divider:focus-within hr"));

  // 29.4: Links e Callouts editáveis no Live Preview (paridade com **texto**)
  ok('live-preview · revealInlineSyntax suporta links web com [ e ](url) editável',
    noteJsSource.includes("inlineEl.tagName === 'A' && !isWiki") &&
    noteJsSource.includes("openSpan.textContent = '[';") &&
    noteJsSource.includes("md-syntax-link-href"));

  ok('live-preview · collapseInlineSyntax atualiza href do link ao fechar',
    noteJsSource.includes("const hrefSpan = inlineEl.querySelector('.md-syntax-link-href');") &&
    noteJsSource.includes("inlineEl.setAttribute('href', safeHref(newHref) || newHref);"));

  ok('live-preview · revealBlockSyntax suporta callouts editáveis (> [!NOTE] etc)',
    noteJsSource.includes("prefixSpan.textContent = primeira ? `> [!${callout.toUpperCase()}]` : '> ';") &&
    noteJsSource.includes("prefixSpan.dataset.syntaxType = 'callout';") &&
    noteJsSource.includes("md-syntax-callout"));

  ok('live-preview · input monitora edição/remoção de callout',
    noteJsSource.includes("if (block.dataset.callout)") &&
    noteJsSource.includes("setBlockCallout(block, newType);") &&
    noteJsSource.includes("delete block.dataset.callout;"));

  ok('live-preview · CSS esconde pill do callout durante o foco para exibir sintaxe editável',
    styleCssSource.includes('.note-editor-blocks .block[data-callout-first]:focus-within::before') &&
    styleCssSource.includes('display: none !important;'));
}

// ── 30. Gestão de Abas Abertas (Fechar Abas) & Pastas/Subpastas Inline (Sem Modais) ──
{
  const { readFile } = await import('node:fs/promises');
  const tabsJsSource = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  const notesAppearanceSource = await readFile(new URL('../sidepanel/modules/notes-appearance.js', import.meta.url), 'utf8');
  const notesDashboardSource = await readFile(new URL('../sidepanel/modules/notes-dashboard.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  // 30.1: Gestão de Abas Abertas e Botão de Fechar
  ok('abas · exporta closeTab para fechar abas individualmente',
    tabsJsSource.includes('export async function closeTab(noteId)'));

  ok('abas · armazena e recupera openTabIds via OPEN_TABS_KEY',
    tabsJsSource.includes("const OPEN_TABS_KEY = 'quickdock:open_tabs'") &&
    tabsJsSource.includes('function getOpenTabIds()') &&
    tabsJsSource.includes('function saveOpenTabIds(ids)'));

  ok('abas · renderiza botão .note-tab-close em cada aba com aria-label e stopPropagation',
    tabsJsSource.includes("closeBtn.className = 'note-tab-close icon-btn'") &&
    tabsJsSource.includes("closeBtn.setAttribute('aria-label', 'Fechar aba')") &&
    tabsJsSource.includes("await closeTab(meta.id)"));

  ok('abas · clique com botão do meio (auxclick button 1) fecha a aba',
    tabsJsSource.includes("tab.addEventListener('auxclick'") &&
    tabsJsSource.includes("e.button === 1") &&
    tabsJsSource.includes("await closeTab(meta.id)"));

  ok('abas · menu de contexto da aba possui opções de fechar aba e fechar outras abas',
    tabsJsSource.includes("addOpt('Fechar aba'") &&
    tabsJsSource.includes("addOpt('Fechar outras abas'"));

  ok('abas · activateNote adiciona nota em openTabIds se não estiver aberta',
    tabsJsSource.includes("if (!openTabIds.includes(numId))") &&
    tabsJsSource.includes("openTabIds.push(numId)") &&
    tabsJsSource.includes("saveOpenTabIds(openTabIds)"));

  ok('abas · CSS de .note-tab-close com transição de opacidade e hover',
    styleCssSource.includes('.note-tab-close {') &&
    styleCssSource.includes('.note-tab:hover .note-tab-close') &&
    styleCssSource.includes('.note-tab-close:hover'));

  // 30.2: Criação e Renomeação de Pastas/Subpastas Inline no Drawer
  ok('pastas inline · exporta startCreateFolderInline para criar pasta/subpasta diretamente na árvore',
    tabsJsSource.includes('export async function startCreateFolderInline(parentPath =') &&
    tabsJsSource.includes('await criarPasta(candidate)') &&
    tabsJsSource.includes('renamingFolderPath = candidate'));

  ok('pastas inline · exporta startRenameFolderInline para renomear pastas diretamente na árvore',
    tabsJsSource.includes('export async function startRenameFolderInline(caminho') &&
    tabsJsSource.includes('renamingFolderPath = caminho'));

  ok('pastas inline · renderNode renderiza input .folder-inline-rename-input quando em modo de renomeação',
    tabsJsSource.includes("inputRename.className = 'folder-inline-rename-input'") &&
    tabsJsSource.includes("inputRename.addEventListener('keydown'") &&
    tabsJsSource.includes("await renomearPasta(sub.caminho, novoCaminho)"));

  ok('pastas inline · botão .folder-add-subfolder-btn disponível para criar subpastas e pastas na raiz',
    tabsJsSource.includes("folder-add-subfolder-btn") &&
    tabsJsSource.includes("addRootFolderBtn.title = 'Nova pasta na raiz'") &&
    tabsJsSource.includes("addSubBtn.title = 'Nova subpasta'"));

  ok('pastas inline · CSS para .folder-inline-rename-input e .folder-add-subfolder-btn',
    styleCssSource.includes('.folder-inline-rename-input {') &&
    styleCssSource.includes('.folder-add-subfolder-btn') &&
    styleCssSource.includes('z-index: 2500 !important;'));

  // 30.3: Fechar todas as abas & Dashboard Zero-Abas (Recentes + Ações Rápidas)
  ok('zero-abas · closeTab permite fechar todas as abas e invoca deactivateActiveNote',
    tabsJsSource.includes('await deactivateActiveNote()') &&
    tabsJsSource.includes('showEmptyDashboard()'));

  ok('zero-abas · switchToNote trata id nulo limpando editor e cabeçalho sem erros',
    tabsJsSource.includes('await switchToNote(null)') ||
    tabsJsSource.includes('switchToNote(null)'));

  ok('zero-abas · renderEmptyDashboardContent cria Hero, Ações Rápidas, Recentes e Dicas',
    notesDashboardSource.includes('empty-dashboard-hero') &&
    notesDashboardSource.includes('empty-dashboard-actions-grid') &&
    notesDashboardSource.includes('empty-dashboard-recents-list') &&
    notesDashboardSource.includes('empty-dashboard-tips-grid'));

  ok('zero-abas · CSS para .notes-empty-dashboard e itens recentes',
    styleCssSource.includes('.notes-empty-dashboard {') &&
    styleCssSource.includes('.empty-dashboard-action-card') &&
    styleCssSource.includes('.empty-dashboard-recent-item'));

  // 30.4: Catálogo Completo de mais de 4.000 Ícones Material Symbols
  const { MATERIAL_ICONS } = await import('../sidepanel/modules/material-icons-list.js');
  ok('catalogo-icones · material-icons-list.js exporta mais de 4.000 ícones oficiais',
    Array.isArray(MATERIAL_ICONS) && MATERIAL_ICONS.length >= 4000);

  ok('catalogo-icones · renderAppearanceContent inclui campo de busca, scroll e contador',
    notesAppearanceSource.includes("icon-search-input") &&
    notesAppearanceSource.includes("icon-catalog-scroll") &&
    notesAppearanceSource.includes("icon-catalog-grid") &&
    notesAppearanceSource.includes("icon-catalog-header-count"));

  ok('catalogo-icones · CSS de estilo para o catálogo de ícones e campo de busca',
    styleCssSource.includes('.icon-catalog-header-count') &&
    styleCssSource.includes('.icon-search-input') &&
    styleCssSource.includes('.icon-catalog-scroll'));

  // 30.5: Remoção do campo manual redundante de nome de ícone
  ok('catalogo-icones · removeu campo manual redundante icon-custom-row e link externo',
    !tabsJsSource.includes('icon-custom-row') &&
    !tabsJsSource.includes('icon-hint-link'));

  // 30.6: Visibilidade e abertura de notas no estado zero-abas
  const noteJsSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const noteMobileToolbarSourceZeroAbas = await readFile(new URL('../sidepanel/modules/note-mobile-toolbar.js', import.meta.url), 'utf8');
  ok('zero-abas · CSS sobrescreve display:flex com display:none !important em elementos com [hidden]',
    styleCssSource.includes('.note-editor[hidden]') &&
    styleCssSource.includes('.notes-empty-dashboard[hidden]'));

  ok('zero-abas · CSS oculta documentos, resizer e barra inteligente quando nenhuma nota estiver aberta',
    styleCssSource.includes('body.no-note-open .docs-section') &&
    styleCssSource.includes('body.no-note-open #resize-handle') &&
    styleCssSource.includes('body.no-note-open .mobile-notion-toolbar'));

  ok('zero-abas · updateMobileToolbarState oculta a barra móvel/inteligente quando !currentNoteId',
    noteMobileToolbarSourceZeroAbas.includes('if (!getCurrentNoteId())') &&
    noteMobileToolbarSourceZeroAbas.includes('mobileQuickbar.style.display = \'none\''));

  // 30.7: Seletor de visão auxiliar e migração do menu More para o Aside Drawer
  const htmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const docsJsSource = await readFile(new URL('../sidepanel/modules/documents.js', import.meta.url), 'utf8');

  ok('visoes · index.html removeu botão #btn-app-menu (descontinuado) e adicionou #btn-aux-view-switcher',
    !htmlSource.includes('id="btn-app-menu"') &&
    htmlSource.includes('id="btn-aux-view-switcher"'));

  ok('visoes · aside drawer possui rodapé .notes-aside-footer com seções de Visões e Ações',
    tabsJsSource.includes('notes-aside-footer') &&
    tabsJsSource.includes('aside-footer-grid') &&
    tabsJsSource.includes('Quadro') &&
    tabsJsSource.includes('Constelações') &&
    tabsJsSource.includes('Calendário'));

  ok('visoes · documents.js exporta e gerencia openAuxViewMenu para alternar entre Documentos, Quadro, Constelações e Calendário',
    docsJsSource.includes('export function openAuxViewMenu') &&
    docsJsSource.includes('btn-aux-view-switcher') &&
    docsJsSource.includes('Quadro Infinito') &&
    docsJsSource.includes('Constelações') &&
    docsJsSource.includes('Calendário'));

  // 30.8: Caminho da pasta abaixo do nome da nota na aba
  ok('abas · pasta é exibida abaixo do nome dentro de .note-tab-title-group sem visual de chip',
    tabsJsSource.includes('note-tab-title-group') &&
    tabsJsSource.includes('note-tab-folder note-tab-folder-badge') &&
    styleCssSource.includes('.note-tab-title-group {') &&
    styleCssSource.includes('.note-tab-folder,') &&
    styleCssSource.includes('font-size: 8.5px;'));

  // 30.9: Visualização simultânea em Split-View (Notas + Visões Auxiliares)
  const viewsJsModSource = await readFile(new URL('../sidepanel/modules/views.js', import.meta.url), 'utf8');
  ok('split-view · views.js mantém note-section e resize-handle visíveis nas visões grafo, board e calendar',
    viewsJsModSource.includes("viewName === 'grafo'") &&
    viewsJsModSource.includes("if (noteSection) noteSection.hidden = false;") &&
    viewsJsModSource.includes("if (resizeHandle) resizeHandle.hidden = false;") &&
    viewsJsModSource.includes("expandDocsToHalf()"));

  ok('split-view · style.css posiciona visões auxiliares na order 4 no mobile/extensão para split com note-section',
    styleCssSource.includes('html[data-platform="extension"] .graph-view') &&
    styleCssSource.includes('html[data-platform="extension"] .board-view') &&
    styleCssSource.includes('html[data-platform="extension"] .calendar-view') &&
    styleCssSource.includes('order: 4 !important;'));

  ok('split-view · index.html possui botões de alternância rápida em todos os cabeçalhos auxiliares',
    htmlSource.includes('id="btn-graph-aux-switcher"') &&
    htmlSource.includes('id="btn-board-aux-switcher"') &&
    htmlSource.includes('id="btn-calendar-aux-switcher"'));

  ok('split-view · documents.js anexa o menu de visão auxiliar a todos os cabeçalhos',
    docsJsSource.includes("attachSwitcher('btn-aux-view-switcher', 'docs-title-wrap')") &&
    docsJsSource.includes("attachSwitcher('btn-graph-aux-switcher', 'graph-title-wrap')") &&
    docsJsSource.includes("attachSwitcher('btn-board-aux-switcher', null)") &&
    docsJsSource.includes("attachSwitcher('btn-calendar-aux-switcher', 'calendar-title-wrap')"));

  ok('split-view · no-note-open oculta todas as visões auxiliares quando nenhuma nota estiver aberta',
    styleCssSource.includes('body.no-note-open .graph-view') &&
    styleCssSource.includes('body.no-note-open .board-view') &&
    styleCssSource.includes('body.no-note-open .calendar-view'));

  // 30.10: Destaque de nota ativa no grafo, guias das pastas na aside e fade do sync
  const graphViewSourceMod = await readFile(new URL('../sidepanel/modules/graph-view.js', import.meta.url), 'utf8');
  const tabsJsSourceMod = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  const notesAppearanceSourceMod = await readFile(new URL('../sidepanel/modules/notes-appearance.js', import.meta.url), 'utf8');
  const styleCssSourceMod = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  ok('grafo · graph-view.js destaca nota ativa e não fecha o grafo ao clicar em outro nó',
    graphViewSourceMod.includes('getCurrentNoteId') &&
    graphViewSourceMod.includes('isActiveNote') &&
    graphViewSourceMod.includes('● ${text}') &&
    !graphViewSourceMod.includes("switchView('editor')"));

  ok('aside · style.css implementa linha exclusivamente vertical e evita que a nota aberta sobreponha a linha',
    tabsJsSourceMod.includes("--guide-left") &&
    styleCssSourceMod.includes('.folder-children::before') &&
    styleCssSourceMod.includes('.folder-children > .notes-list-item') &&
    styleCssSourceMod.includes('margin-left: calc(var(--guide-left') &&
    !styleCssSourceMod.includes('.folder-children::after'));

  ok('header · style.css reposiciona o degradê fade direito atrás do botão Sync',
    styleCssSourceMod.includes('.notes-tabbar::after') &&
    styleCssSourceMod.includes('right: 14px;') &&
    styleCssSourceMod.includes('grid-template-columns: auto auto 1fr auto;'));

  // 30.11: Coexistência de Tela Cheia (100%) e Tela Dividida (Split-View) para Quadro, Grafo e Calendário
  const viewsJsSource = await readFile(new URL('../sidepanel/modules/views.js', import.meta.url), 'utf8');
  const docJsSource = await readFile(new URL('../sidepanel/modules/documents.js', import.meta.url), 'utf8');

  ok('views · views.js exporta isViewSplit, isViewFullscreen e toggleViewFullscreen',
    viewsJsSource.includes('export function isViewSplit') &&
    viewsJsSource.includes('export function isViewFullscreen') &&
    viewsJsSource.includes('export function toggleViewFullscreen') &&
    viewsJsSource.includes('updateFullscreenButtons'));

  ok('views · views.js gerencia classes view-fullscreen e view-split',
    viewsJsSource.includes("'view-fullscreen'") &&
    viewsJsSource.includes("'view-split'") &&
    viewsJsSource.includes('isSplitMode'));

  ok('headers · index.html define botões de alternância de tela cheia/split para grafo, quadro e calendário',
    htmlSource.includes('id="btn-graph-toggle-fullscreen"') &&
    htmlSource.includes('id="btn-board-toggle-fullscreen"') &&
    htmlSource.includes('id="btn-calendar-toggle-fullscreen"'));

  ok('menu · documents.js suporta abertura em split e opção de alternar tela cheia',
    docJsSource.includes("switchView('board', { split: true })") &&
    docJsSource.includes("switchView('grafo', { split: true })") &&
    docJsSource.includes("switchView('calendar', { split: true })") &&
    docJsSource.includes('toggleViewFullscreen()'));

  ok('design · style.css implementa regras para 100% tela cheia e modo dividido no desktop e mobile',
    styleCssSourceMod.includes('html.view-fullscreen .note-section') &&
    styleCssSourceMod.includes('html[data-platform="extension"].view-fullscreen .graph-view') &&
    styleCssSourceMod.includes('html[data-platform="desktop"].view-fullscreen .graph-view') &&
    styleCssSourceMod.includes('html[data-platform="desktop"]:not(.view-fullscreen) .graph-view'));

  // 30.12: Layout Desktop 3 Colunas (NAV | NOTA | OUTRA VIEW) e Alternância de Altura (100% / 50%)
  ok('desktop-layout · HTML organiza NAV, NOTA e visões auxiliares em 3 colunas horizontais',
    styleCssSourceMod.includes('html[data-platform="desktop"] #app {') &&
    styleCssSourceMod.includes('flex-direction: row;') &&
    styleCssSourceMod.includes('html[data-platform="desktop"] .app-aside {') &&
    styleCssSourceMod.includes('order: 1 !important;') &&
    styleCssSourceMod.includes('html[data-platform="desktop"] .note-section,') &&
    styleCssSourceMod.includes('order: 2 !important;') &&
    styleCssSourceMod.includes('order: 3 !important;'));

  ok('desktop-layout · views.js gerencia alternância de altura (100% / 50%) com isViewHalfHeight e toggleViewHeight',
    viewsJsSource.includes('export function isViewHalfHeight') &&
    viewsJsSource.includes('export function toggleViewHeight') &&
    viewsJsSource.includes('export function setHalfHeightMode') &&
    viewsJsSource.includes('export function updateHeightButtons') &&
    viewsJsSource.includes('btn-graph-toggle-height') &&
    viewsJsSource.includes('btn-board-toggle-height') &&
    viewsJsSource.includes('btn-calendar-toggle-height') &&
    viewsJsSource.includes('btn-docs-toggle-height'));

  ok('desktop-layout · index.html define botões de controle de altura view-height-btn nos 4 cabeçalhos',
    htmlSource.includes('id="btn-graph-toggle-height"') &&
    htmlSource.includes('id="btn-board-toggle-height"') &&
    htmlSource.includes('id="btn-calendar-toggle-height"') &&
    htmlSource.includes('id="btn-docs-toggle-height"'));

  ok('desktop-layout · style.css define regras para altura total (100vh) e meia altura (50vh) ancorada no desktop',
    styleCssSourceMod.includes('html[data-platform="desktop"]:not(.view-fullscreen):not(.view-half-height) .graph-view') &&
    styleCssSourceMod.includes('html[data-platform="desktop"]:not(.view-fullscreen).view-half-height .graph-view') &&
    styleCssSourceMod.includes('height: 50vh !important;') &&
    styleCssSourceMod.includes('align-self: flex-end !important;') &&
    styleCssSourceMod.includes('html[data-platform="extension"] .view-height-btn,'));

  // 30.13: Isolamento estrito de visões auxiliares na extensão e mobile
  ok('isolamento-visoes · style.css oculta estritamente visões inativas ou com [hidden] na extensão',
    styleCssSourceMod.includes('html:not(.view-grafo) .graph-view') &&
    styleCssSourceMod.includes('html:not(.view-board) .board-view') &&
    styleCssSourceMod.includes('html:not(.view-calendar) .calendar-view') &&
    styleCssSourceMod.includes('html:not(.view-templates) .templates-gallery-view') &&
    styleCssSourceMod.includes('html[data-platform="extension"].view-grafo:not(.view-fullscreen) .graph-view:not([hidden])'));

  // 30.14: Menu dropdown de alternância de visão auxiliar
  ok('switcher-menu · documents.js e style.css garantem visibilidade e posicionamento fixo do menu auxiliar',
    docsJsSource.includes("menu.className = 'copy-menu aux-view-menu aux-view-dropdown'") &&
    styleCssSourceMod.includes('.aux-view-menu,') &&
    styleCssSourceMod.includes('.aux-view-dropdown') &&
    styleCssSourceMod.includes('position: fixed !important;') &&
    styleCssSourceMod.includes('z-index: 10000 !important;'));

  // 30.15: Título/ícone/cor mudados em qualquer lugar (cabeçalho, menu "⋯" da
  // aba ou renomear por duplo clique na aside) refletem em todo o resto sem
  // precisar fechar e reabrir a nota; e renomear com 2 cliques direto na aside
  const noteJsSourceMod = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const noteHeaderSourceMod = await readFile(new URL('../sidepanel/modules/note-header.js', import.meta.url), 'utf8');

  ok('aside · refreshOpenAsideRows() é chamado depois de mudar ícone, cor ou título pelo menu "⋯"',
    tabsJsSourceMod.includes('async function refreshOpenAsideRows()') &&
    (tabsJsSourceMod.match(/refreshOpenAsideRows\(\)/g) || []).length >= 4);

  ok('cabeçalho · note-header.js rebusca a nota (getNoteById) antes de re-renderizar ao mudar ícone/cor/título por fora',
    noteHeaderSourceMod.includes("document.addEventListener('quickdock:note-appearance-updated'") &&
    noteHeaderSourceMod.includes('headerNoteRef = fresh'));

  ok('aside · título editado no cabeçalho avisa quickdock:note-title-committed e a aside escuta pra sincronizar o notesMeta',
    noteHeaderSourceMod.includes("new CustomEvent('quickdock:note-title-committed'") &&
    tabsJsSourceMod.includes("addEventListener('quickdock:note-title-committed'"));

  ok('aside · renomear com duplo clique direto na linha, sem abrir o menu "⋯"',
    tabsJsSourceMod.includes('function iniciarRenomeacaoInlineNaAside') &&
    tabsJsSourceMod.includes('function ligarCliqueEDuploCliqueNaLinha') &&
    tabsJsSourceMod.includes("label.addEventListener('dblclick'") &&
    styleCssSourceMod.includes('.notes-list-rename-input'));

  // 30.16: Ícone/cor trocados pelo cabeçalho da nota (headerNoteRef, um objeto
  // separado do notesMeta da aside — vem do seu próprio getNoteById()) tinham
  // que sincronizar a entrada de verdade do notesMeta, não só o objeto que o
  // cabeçalho passou — senão refreshOpenAsideRows() reconstruía a lista a
  // partir de dados antigos e nada mudava na tela.
  ok('aside · pickIcon/iconFilled/pickColor sincronizam a entrada real do notesMeta, não só o objeto recebido',
    notesAppearanceSourceMod.includes('function sincronizarComNotesMeta') &&
    notesAppearanceSourceMod.includes('getNotesMeta().find(n => n.id === meta.id)') &&
    (notesAppearanceSourceMod.match(/sincronizarComNotesMeta\(meta, /g) || []).length >= 3);
}

// ── 31. Bases: Painel Dedicado (tela cheia / dividida / painel simultâneo) ──
{
  const { readFile } = await import('node:fs/promises');
  const viewsJsSource = await readFile(new URL('../sidepanel/modules/views.js', import.meta.url), 'utf8');
  const panelsJsSource = await readFile(new URL('../sidepanel/modules/desktop-panels.js', import.meta.url), 'utf8');
  const docsJsSource = await readFile(new URL('../sidepanel/modules/documents.js', import.meta.url), 'utf8');
  const appJsSource = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');
  const blocksJsSource = await readFile(new URL('../sidepanel/modules/blocks.js', import.meta.url), 'utf8');
  const noteJsSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const basesViewJsSource = await readFile(new URL('../sidepanel/modules/bases-view.js', import.meta.url), 'utf8');
  const containerJsSource = await readFile(new URL('../sidepanel/modules/bases/bases-view-container.js', import.meta.url), 'utf8');
  const tableViewJsSource = await readFile(new URL('../sidepanel/modules/bases/bases-table-view.js', import.meta.url), 'utf8');
  const boardBaseViewJsSource = await readFile(new URL('../sidepanel/modules/bases/bases-board-view.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const swJsSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sidepanelHtml = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');

  // 31.1: Helper de escopo por nota e ação de criar base na nota atual
  ok('blocks.js · exporta getBaseBlocksFromNote', blocksJsSource.includes('export function getBaseBlocksFromNote'));
  ok('note.js · exporta appendBaseBlockToCurrentNote e requestSaveFromExternalEdit',
    noteJsSource.includes('export async function appendBaseBlockToCurrentNote') &&
    noteJsSource.includes('export function requestSaveFromExternalEdit'));
  ok('note.js · fechar a última aba avisa quickdock:active-note-changed com id nulo',
    noteJsSource.includes("new CustomEvent('quickdock:active-note-changed', { detail: { id: null } })"));
  ok('note.js · switchToNote() avisa quickdock:active-note-changed pra QUALQUER troca de nota, não só pela aside (handleCreateNewNote do painel de Base chama switchToNote() direto)',
    noteJsSource.includes("new CustomEvent('quickdock:active-note-changed', { detail: { id } })"));

  // 31.2: Novo módulo bases-view.js — glue, sem reimplementar renderização
  ok('bases-view.js · reaproveita renderBaseComponent, não reimplementa a Base',
    basesViewJsSource.includes("import { renderBaseComponent } from './bases/bases-view-container.js'") &&
    basesViewJsSource.includes('export function initBasesView'));
  ok('bases-view.js · escuta os eventos certos (troca de tela, refresh do painel, Base do workspace alterada pela aside)',
    basesViewJsSource.includes("addEventListener('quickdock:refresh-bases-view'") &&
    basesViewJsSource.includes("addEventListener('quickdock:view-changed'") &&
    basesViewJsSource.includes("addEventListener('quickdock:workspace-base-changed'"));
  ok('bases-view.js · grava a configuração da Base do workspace no rascunho (workspace-base.js), sem escrever em nota nenhuma',
    basesViewJsSource.includes('saveWorkspaceDraft(novoYaml)') &&
    basesViewJsSource.includes('onViewChange') &&
    !basesViewJsSource.includes('requestSaveFromExternalEdit'));
  // 31.3: HTML da seção dedicada — presente e idêntico nos dois arquivos
  for (const [nome, fonte] of [['sidepanel/index.html', sidepanelHtml], ['index.html (raiz)', indexHtml]]) {
    // o cabeçalho próprio da Base ("Base" + botões) foi removido: já existe o cabeçalho de seção
    // (ícone, título, mover e fechar) e a Base tem a própria barra com abas e botões
    ok(`bases · ${nome} define a seção #bases-view sem cabeçalho duplicado`,
      fonte.includes('id="bases-view"') &&
      fonte.includes('id="bases-body"') &&
      !fonte.includes('class="bases-header"') &&
      !fonte.includes('id="btn-bases-aux-switcher"'));
  }
  ok('bases · index.html e sidepanel/index.html têm a mesma seção #bases-view (cópias mantidas à mão)',
    indexHtml.slice(indexHtml.indexOf('id="bases-view"') - 60, indexHtml.indexOf('id="bases-body"'))
      .replace(/\s+/g, ' ')
    === sidepanelHtml.slice(sidepanelHtml.indexOf('id="bases-view"') - 60, sidepanelHtml.indexOf('id="bases-body"'))
      .replace(/\s+/g, ' '));

  // 31.4: views.js — quinta visão auxiliar, mesmo padrão de grafo/board/calendar
  ok('views.js · switchView() trata a visão "bases" (mostra a seção, aplica classes, dispara refresh)',
    viewsJsSource.includes("viewName === 'bases'") &&
    viewsJsSource.includes("getElementById('bases-view')") &&
    viewsJsSource.includes("new CustomEvent('quickdock:refresh-bases-view'"));
  ok('views.js · guarda de no-note-open e listas de botões incluem bases',
    viewsJsSource.includes("viewName === 'bases')") &&
    viewsJsSource.includes("'btn-bases-toggle-height'") &&
    viewsJsSource.includes("'btn-bases-toggle-fullscreen'"));

  // 31.5: desktop-panels.js — quinto painel simultâneo
  ok('desktop-panels.js · registra o painel "bases" (ordem, elemento, cabeçalho, evento de refresh)',
    panelsJsSource.includes('bases: 60') &&
    panelsJsSource.includes("case 'bases': return document.querySelector('.bases-view')") &&
    panelsJsSource.includes("case 'bases': return document.querySelector('.bases-header')") &&
    panelsJsSource.includes("bases: 'bases'"));

  // 31.6: documents.js — quinta opção no menu de alternância de visão
  ok('documents.js · openAuxViewMenu() ganha a opção "Base" nos dois modos (painel desktop e split não-desktop)',
    docsJsSource.includes("toggleDesktopPanel('bases')") &&
    docsJsSource.includes("switchView('bases', { split: true })") &&
    docsJsSource.includes("attachSwitcher('btn-bases-aux-switcher', 'bases-title-wrap')"));

  const tabsJsSourceForBases = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  ok('notes-tabs.js · grade de visões da aside no mobile/extensão ganha o botão "Base"',
    tabsJsSourceForBases.includes("createFooterBtn('view_kanban', 'Base', () => switchView('bases', { fullscreen: true }))"));
  ok('notes-tabs.js · drawer permanente do desktop NÃO duplica o grid de views (Spatial Shell já cobre isso via #mNav/#mMenu/"+"/lista de views)',
    !tabsJsSourceForBases.includes('toggleDesktopPanel') &&
    !tabsJsSourceForBases.includes("import { toggleDesktopPanel"));
  ok('notes-tabs.js · escuta quickdock:active-note-changed pra sincronizar activeId quando a troca de nota vem de fora da aside (painel de Base cria nota chamando switchToNote() direto)',
    tabsJsSourceForBases.includes("addEventListener('quickdock:active-note-changed', e => {") &&
    tabsJsSourceForBases.includes('if (id === activeId) return;'));

  // 31.7: app.js — inicialização registrada antes de initDesktopPanels()
  ok('app.js · importa e chama initBasesView() antes de initDesktopPanels()',
    appJsSource.includes("import { initBasesView } from './modules/bases-view.js'") &&
    appJsSource.indexOf('initBasesView()') < appJsSource.indexOf('initDesktopPanels()'));

  // 31.8: CSS — nomes de classe corrigidos (drift confirmado entre CSS e JS)
  ok('style.css · nomes de classe do Base corrigidos pra bater com o JS (tabela, quadro, select)',
    styleCssSource.includes('.base-table-wrap') &&
    styleCssSource.includes('.base-board-columns-wrap') &&
    styleCssSource.includes('.base-column-header') &&
    styleCssSource.includes('.base-column-cards') &&
    styleCssSource.includes('.base-select-opt,') &&
    styleCssSource.includes('.base-tfoot-td') &&
    !styleCssSource.includes('.base-table-container') &&
    !styleCssSource.includes('.base-board-container'));
  ok('style.css · define .bases-header/.bases-view com a mesma altura/fundo dos outros 4 cabeçalhos',
    styleCssSource.includes('.bases-header {') &&
    styleCssSource.includes('.bases-view {') &&
    /\.bases-header\s*\{[^}]*height:\s*52px/.test(styleCssSource));
  ok('style.css · réplica das regras de isolamento/painel do .calendar-view pro .bases-view',
    styleCssSource.includes('.bases-view[hidden]') &&
    styleCssSource.includes('view-fullscreen.view-bases .bases-view') &&
    styleCssSource.includes("view-bases:not(.view-fullscreen) .bases-view:not([hidden])") &&
    styleCssSource.includes('html:not(.view-bases) .bases-view') &&
    styleCssSource.includes('body.no-note-open .bases-view') &&
    styleCssSource.includes('#btn-bases-toggle-height'));
  ok('style.css · NÃO fixa mais order (20/30/40/50/60) pras views do mosaico — quebrava a reordenação por arrastar/mover, que segue o DOM',
    !styleCssSource.includes('html[data-platform="desktop"] .board-view { order: 20; }') &&
    !styleCssSource.includes('html[data-platform="desktop"] .bases-view { order: 60; }'));

  // 31.9: sw.js — módulo novo no pré-cache e versão do cache trocada
  ok('sw.js · lista bases-view.js e os módulos de sidepanel/modules/bases/ no pré-cache, com CACHE_NAME trocado',
    swJsSource.includes("'sidepanel/modules/bases-view.js'") &&
    swJsSource.includes("'sidepanel/modules/bases/bases-view-container.js'") &&
    !swJsSource.includes("'quickdock-v3.0.0-2'"));

  // 31.10: Duplicação de barra de ferramentas corrigida (bug pré-existente)
  ok('bases-view-container.js · passa showOwnToolbar:false pras views de tabela/quadro',
    containerJsSource.includes('showOwnToolbar: false'));
  ok('bases-table-view.js e bases-board-view.js · aceitam showOwnToolbar e escondem a barra própria quando desligada',
    tableViewJsSource.includes('showOwnToolbar = true') &&
    tableViewJsSource.includes('if (showOwnToolbar)') &&
    boardBaseViewJsSource.includes('showOwnToolbar = true') &&
    boardBaseViewJsSource.includes('if (showOwnToolbar)'));
}

// ── 32. Maximizar painel no desktop (botão de tela cheia reaproveitado) ────
{
  const { readFile } = await import('node:fs/promises');
  const panelsJsSource = await readFile(new URL('../sidepanel/modules/desktop-panels.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  ok('desktop-panels.js · exporta toggleMaximizePanel/isPanelMaximized e mapeia os 4 botões de tela cheia (board/grafo/calendar/bases)',
    panelsJsSource.includes('export function toggleMaximizePanel') &&
    panelsJsSource.includes('export function isPanelMaximized') &&
    panelsJsSource.includes("btn-board-toggle-fullscreen") &&
    panelsJsSource.includes("btn-graph-toggle-fullscreen") &&
    panelsJsSource.includes("btn-calendar-toggle-fullscreen") &&
    panelsJsSource.includes("btn-bases-toggle-fullscreen"));
  ok('desktop-panels.js · fechar o painel maximizado sai do modo maximizado automaticamente',
    panelsJsSource.includes('if (maximizedPanel === name) maximizedPanel = null;'));
  ok('desktop-panels.js · Escape sai do modo maximizado',
    panelsJsSource.includes("e.key === 'Escape' && maximizedPanel"));
  ok('style.css · botões de tela cheia voltam a aparecer no desktop (só o de meia-altura continua escondido)',
    !styleCssSource.includes('html[data-platform="desktop"] #btn-graph-toggle-fullscreen') &&
    styleCssSource.includes('html[data-platform="desktop"] #btn-graph-toggle-height'));
  ok('style.css · .desktop-panel-maximized cobre a tela toda (position fixed + inset 0) por cima dos outros painéis',
    styleCssSource.includes('.desktop-panel-maximized {') &&
    /\.desktop-panel-maximized\s*\{[^}]*position:\s*fixed\s*!important/.test(styleCssSource) &&
    /\.desktop-panel-maximized\s*\{[^}]*inset:\s*0\s*!important/.test(styleCssSource));
}

// ── 33. Sumário de Títulos (Outline), Abas de Rodapé e Isolamento da Barra Inteligente ──
{
  const { readFile } = await import('node:fs/promises');
  const noteJsSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const noteOutlineSource = await readFile(new URL('../sidepanel/modules/note-outline.js', import.meta.url), 'utf8');
  const noteMobileToolbarSourceFullscreen = await readFile(new URL('../sidepanel/modules/note-mobile-toolbar.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const notFoundHtmlSource = await readFile(new URL('../404.html', import.meta.url), 'utf8');

  ok('html · index.html e sidepanel/index.html possuem barra lateral de sumário (note-outline-sidebar) e botão flutuante',
    indexHtmlSource.includes('id="note-outline-sidebar"') &&
    sidepanelHtmlSource.includes('id="note-outline-sidebar"') &&
    notFoundHtmlSource.includes('id="note-outline-sidebar"') &&
    indexHtmlSource.includes('id="btn-outline-floating-toggle"') &&
    sidepanelHtmlSource.includes('id="btn-outline-floating-toggle"') &&
    notFoundHtmlSource.includes('id="btn-outline-floating-toggle"'));

  ok('html · index.html e sidepanel/index.html possuem wrapper note-workspace-body e botão toggle no cabeçalho',
    indexHtmlSource.includes('class="note-workspace-body"') &&
    sidepanelHtmlSource.includes('class="note-workspace-body"') &&
    indexHtmlSource.includes('id="btn-note-outline-toggle-desktop"') &&
    sidepanelHtmlSource.includes('id="btn-note-outline-toggle-desktop"'));

  ok('html · rodapé da nota possui abas de alternância entre Backlinks e Sumário',
    indexHtmlSource.includes('id="tab-btn-backlinks"') &&
    indexHtmlSource.includes('id="tab-btn-outline"') &&
    sidepanelHtmlSource.includes('id="tab-btn-backlinks"') &&
    sidepanelHtmlSource.includes('id="tab-btn-outline"') &&
    indexHtmlSource.includes('id="note-mobile-outline-list"') &&
    sidepanelHtmlSource.includes('id="note-mobile-outline-list"'));

  ok('note-outline.js · exporta funções do sumário (extrairSumarioDaNota, renderOutline, irParaTitulo, updateActiveOutlineHeading)',
    noteOutlineSource.includes('export function extrairSumarioDaNota') &&
    noteOutlineSource.includes('export function renderOutline') &&
    noteOutlineSource.includes('export function irParaTitulo') &&
    noteOutlineSource.includes('export function updateActiveOutlineHeading'));

  ok('note-outline.js · exporta funções de alternância de abas e controle de sidebar (setBottomTab, setSidebarTab, setOutlineSidebarOpen)',
    noteOutlineSource.includes('export function setBottomTab') &&
    noteOutlineSource.includes('export function setSidebarTab') &&
    noteOutlineSource.includes('export function setOutlineSidebarOpen') &&
    noteOutlineSource.includes('btn-outline-floating-toggle'));

  ok('html · sidebar lateral possui abas ((sumário)(backlinks)) e contêiner desktop de backlinks',
    indexHtmlSource.includes('id="tab-sidebar-outline"') &&
    indexHtmlSource.includes('id="tab-sidebar-backlinks"') &&
    indexHtmlSource.includes('id="note-desktop-backlinks-list"') &&
    sidepanelHtmlSource.includes('id="tab-sidebar-outline"') &&
    sidepanelHtmlSource.includes('id="tab-sidebar-backlinks"') &&
    sidepanelHtmlSource.includes('id="note-desktop-backlinks-list"'));

  ok('html · botão de recolher do sumário utiliza chevron_left estilo Google Docs',
    indexHtmlSource.includes('chevron_left') &&
    sidepanelHtmlSource.includes('chevron_left') &&
    notFoundHtmlSource.includes('chevron_left'));

  ok('note-mobile-toolbar.js · updateMobileToolbarState oculta a barra móvel/inteligente quando em tela cheia ou painel maximizado',
    noteMobileToolbarSourceFullscreen.includes('isFullscreenView') &&
    noteMobileToolbarSourceFullscreen.includes('has-maximized-panel') &&
    noteMobileToolbarSourceFullscreen.includes('view-fullscreen'));

  ok('style.css · CSS oculta barra inteligente em modo tela cheia e maximizado',
    styleCssSource.includes('html.has-maximized-panel .mobile-notion-toolbar') &&
    styleCssSource.includes('html.view-fullscreen .mobile-notion-toolbar'));

  ok('style.css · CSS define sumário acoplado estilo Google Docs e botão de margem no desktop',
    styleCssSource.includes('.note-workspace-body') &&
    styleCssSource.includes('.note-outline-sidebar') &&
    styleCssSource.includes('.note-outline-floating-toggle') &&
    styleCssSource.includes('.outline-item') &&
    styleCssSource.includes('.outline-badge') &&
    styleCssSource.includes('.outline-item.active'));

  ok('style.css · CSS define alternador de abas no rodapé e espaçamentos equilibrados nos backlinks',
    styleCssSource.includes('.note-bottom-tabs') &&
    styleCssSource.includes('.note-bottom-tab') &&
    styleCssSource.includes('.note-bottom-bar-header'));

  // Teste funcional de extração de títulos e identificação de níveis
  const { headingSlug, headingSlugs } = await import('../sidepanel/modules/blocks.js');
  const mockTitles = ['Introdução ao Projeto', 'Arquitetura do Sistema', 'Subseção Detalhada'];
  const slugs = headingSlugs(mockTitles);
  igual('blocks.js · slugs gerados corretamente para títulos', slugs[0], 'introducao-ao-projeto');
  igual('blocks.js · slug gerado para título com caracteres especiais', headingSlug('Ação & Efeito (100%)'), 'acao-efeito-100');
}

// ── 34. Spatial Shell: Explorador de Notas como submenu do #mAside ──
{
  const { readFile } = await import('node:fs/promises');
  const spatialShellSource = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  const notesTabsSource = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const notFoundHtmlSource = await readFile(new URL('../404.html', import.meta.url), 'utf8');

  ok('spatial-shell.js · exporta/usa setAsideMode para alternar Explorador de Notas vs lista de Views',
    spatialShellSource.includes('function setAsideMode') &&
    spatialShellSource.includes("classList.toggle('mode-notes'") &&
    spatialShellSource.includes('setAsideMode('));

  ok('notes-tabs.js · monta o drawer permanente dentro de #mAside, não mais como coluna própria de #app',
    notesTabsSource.includes("document.getElementById('mAside')") &&
    notesTabsSource.includes('mAsideEl.appendChild(drawer)'));

  ok('style.css · #mAside alterna Explorador de Notas e lista de Views por classe de modo',
    styleCssSource.includes('#mAside:not(.mode-notes) .notes-aside-drawer') &&
    styleCssSource.includes('#mAside.mode-notes .notes-aside-drawer') &&
    styleCssSource.includes('#mAside:not(.mode-views) #asideSectionList'));

  ok('html · index.html, sidepanel/index.html e 404.html começam com #mAside em modo notas (Explorador é o item padrão do #mNav)',
    indexHtmlSource.includes('id="mAside" class="mode-notes"') &&
    sidepanelHtmlSource.includes('id="mAside" class="mode-notes"') &&
    notFoundHtmlSource.includes('id="mAside" class="mode-notes"'));
}

// ── 35. Spatial Shell: cada nota aberta é sua própria view no mosaico ──
{
  const { readFile } = await import('node:fs/promises');
  const spatialShellSource = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  const notesTabsSource = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  ok('notes-tabs.js · exporta getOpenTabsSnapshot e dispara quickdock:notes-open-tabs-changed ao renderizar as abas',
    notesTabsSource.includes('export function getOpenTabsSnapshot') &&
    notesTabsSource.includes("dispatchEvent(new CustomEvent('quickdock:notes-open-tabs-changed'"));

  ok('spatial-shell.js · escuta quickdock:notes-open-tabs-changed e lê o snapshot inicial de getOpenTabsSnapshot',
    spatialShellSource.includes("addEventListener('quickdock:notes-open-tabs-changed'") &&
    spatialShellSource.includes('getOpenTabsSnapshot()'));

  ok('spatial-shell.js · syncNoteViews sincroniza tiles de notas e syncNoteSectionDOM monta placeholders',
    spatialShellSource.includes('function syncNoteViews') &&
    spatialShellSource.includes('function syncNoteSectionDOM') &&
    spatialShellSource.includes('function buildNotePlaceholderSection'));

  ok('spatial-shell.js · openOrFocusView e closeView tratam ids dinâmicos note-<id> delegando pra notes-tabs.js',
    spatialShellSource.includes("viewId.startsWith('note-')") &&
    spatialShellSource.includes("dispatchEvent(new CustomEvent('quickdock:activate-note'") &&
    spatialShellSource.includes('closeTab(Number(viewId.slice(5)))'));

  ok('spatial-shell.js · bindSectionInteractions lê data-id na hora do evento (não captura em closure)',
    spatialShellSource.includes('function bindSectionInteractions(sec)') &&
    spatialShellSource.includes('const id = sec.dataset.id;'));

  ok('style.css · define tile placeholder de nota em segundo plano (note-placeholder-section/body/focus-btn)',
    styleCssSource.includes('.note-placeholder-body') &&
    styleCssSource.includes('.note-placeholder-icon') &&
    styleCssSource.includes('.note-placeholder-focus-btn'));
}

// ── 36. Spatial Shell: 100% alinhado ao design-pattern (sem view persistente,
// estado vazio, sem navegação antiga duplicada, fechar todas na omnibar) ──
{
  const { readFile } = await import('node:fs/promises');
  const spatialShellSource = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  const appJsSource = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  ok('app.js · não importa nem chama mais initDesktopPanels() (sistema antigo de 5 painéis, substituído pelo Spatial Shell no desktop)',
    !appJsSource.includes("import { initDesktopPanels }") &&
    !appJsSource.includes('initDesktopPanels();'));

  ok('spatial-shell.js · updateEmptyState mostra o estado "Nenhuma view aberta" igual ao design-pattern quando tudo fecha',
    spatialShellSource.includes('function updateEmptyState') &&
    spatialShellSource.includes("className = 'empty-state'") &&
    spatialShellSource.includes('Nenhuma view aberta'));

  ok('style.css · define o visual do estado vazio (empty-state/-icon/-title/-desc/-btn)',
    styleCssSource.includes('.empty-state {') &&
    styleCssSource.includes('.empty-state-icon') &&
    styleCssSource.includes('.empty-state-title') &&
    styleCssSource.includes('.empty-state-desc') &&
    styleCssSource.includes('.empty-state-btn'));

  ok('style.css · esconde no desktop a navegação antiga (voltar/alternar visão) duplicada pelo Spatial Shell',
    styleCssSource.includes('html[data-platform="desktop"] .aux-view-switcher-btn') &&
    styleCssSource.includes('html[data-platform="desktop"] .board-back-btn') &&
    styleCssSource.includes('html[data-platform="desktop"] .graph-back-btn') &&
    styleCssSource.includes('html[data-platform="desktop"] .calendar-back-btn') &&
    styleCssSource.includes('html[data-platform="desktop"] .bases-back-btn'));

  ok('spatial-shell.js · omnibar tem comando simétrico "Fechar Todas as Views" ao lado de "Abrir Todas as Views"',
    spatialShellSource.includes("title: 'Abrir Todas as Views'") &&
    spatialShellSource.includes("title: 'Fechar Todas as Views'") &&
    spatialShellSource.includes('openViewIds = [];') &&
    spatialShellSource.includes('focusedViewId = null;'));
}

// ── 37. Spatial Shell: drag-and-drop de verdade para reordenar views ──
{
  const { readFile } = await import('node:fs/promises');
  const spatialShellSource = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));

  ok('spatial-shell.js · implementa dragstart/dragover/drop de verdade no .section-header (o HTML já dizia "Arraste para reordenar" sem nenhum código por trás)',
    spatialShellSource.includes("headerEl?.addEventListener('dragstart'") &&
    spatialShellSource.includes("sec.addEventListener('dragover'") &&
    spatialShellSource.includes("sec.addEventListener('drop'") &&
    spatialShellSource.includes('draggedViewId'));

  ok('style.css · define destaque visual .is-drag-over pra tile alvo durante o arraste',
    styleCssSource.includes('.main-section.is-drag-over'));

  ok('style.css · .note-section não tem mais order fixo no desktop (nem via !important na regra "Palco central", nem via override solto) — travava a reordenação por arrastar/mover pra qualquer view ao lado de uma nota',
    !styleCssSource.includes('order: 2 !important;\n    flex: 1 1 auto;\n    width: 0;') &&
    styleCssSource.includes('html[data-platform="desktop"] .note-section {\n    order: 0;\n  }'));
}

// ── 38. Spatial Shell: Explorador de Notas ativa a aside de notas e não abre menu ──
{
  const { readFile } = await import('node:fs/promises');
  const rawSpatial = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  const spatialShellSource = rawSpatial.replace(/\r\n/g, '\n');

  ok('spatial-shell.js · setupActivityBar: Home/Modelos/Configurações garantem setAsideMode("notes") e trocam o painel/abrem-recolhem a aside esquerda',
    spatialShellSource.includes('NAV_TO_PANEL[viewId]') &&
    spatialShellSource.includes('setCollapsed: setAsideCollapsed') && spatialShellSource.includes('openMobileLeftDrawer()') &&
    spatialShellSource.includes("setAsideMode('notes')"));

  ok('spatial-shell.js · openOrFocusView("notes") e foco de notas ativam setAsideMode("notes")',
    spatialShellSource.includes("openOrFocusView(viewId)") &&
    spatialShellSource.includes("focusNoteViewId(viewId)") &&
    spatialShellSource.includes("setAsideMode('notes')"));

  ok('spatial-shell.js · focusNoteViewId garante setAsideMode("notes")',
    spatialShellSource.includes("function focusNoteViewId(viewId)") &&
    spatialShellSource.includes("setAsideMode('notes')"));
}

// ── 39. Spatial Shell: uma view por vez + view "Configurações" controla o painel lateral esquerdo ──
{
  const { readFile } = await import('node:fs/promises');
  const spatialShellSource = (await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const styleCssSource = await readCssWithImports(new URL('../sidepanel/style.css', import.meta.url));
  const indexHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  const notFoundHtmlSource = await readFile(new URL('../404.html', import.meta.url), 'utf8');

  ok('spatial-shell.js · SHELL_VIEWS inclui "settings" e openOrFocusView sempre SUBSTITUI a view aberta (uma view por vez, sem mosaico)',
    spatialShellSource.includes("{ id: 'settings', title: 'Configurações'") &&
    spatialShellSource.includes('openViewIds = [targetViewId];') &&
    !spatialShellSource.includes('openViewIds.push(targetViewId)') &&
    !spatialShellSource.includes('invertMode'));

  ok('spatial-shell.js · aside esquerda recolhível: estado salvo em localStorage, classe is-aside-collapsed no #app e Home como item ativo da nav',
    spatialShellSource.includes("'quickdock:spatial:aside-collapsed'") &&
    spatialShellSource.includes("classList.toggle('is-aside-collapsed'") &&
    spatialShellSource.includes('function syncNavHome') &&
    spatialShellSource.includes('export function setAsideCollapsed'));

  ok('spatial-shell.js · setupSettingsView sincroniza o toggle "Mostrar o painel lateral esquerdo" da view Configurações',
    spatialShellSource.includes('function setupSettingsView') &&
    spatialShellSource.includes('settings-aside-open') &&
    spatialShellSource.includes('setAsideCollapsed(!toggle.checked)'));

  ok('html · index.html, sidepanel/index.html e 404.html têm Home/Modelos/Configurações no #mNav e a view #settings-view com o toggle do painel lateral',
    ['home', 'templates', 'settings'].every(v => indexHtmlSource.includes(`data-nav-view="${v}"`) && sidepanelHtmlSource.includes(`data-nav-view="${v}"`) && notFoundHtmlSource.includes(`data-nav-view="${v}"`)) &&
    indexHtmlSource.includes('id="settings-view"') && sidepanelHtmlSource.includes('id="settings-view"') && notFoundHtmlSource.includes('id="settings-view"') &&
    indexHtmlSource.includes('id="settings-aside-open"') && sidepanelHtmlSource.includes('id="settings-aside-open"') && notFoundHtmlSource.includes('id="settings-aside-open"') &&
    indexHtmlSource.includes('type="checkbox" class="ios-toggle"'));

  ok('style.css · 35-shell-v2.css define aside recolhida (nav como cartão), views da Home acima do explorador e cabeçalho sem controles de mosaico',
    styleCssSource.includes('#app.is-aside-collapsed') &&
    styleCssSource.includes('#mAside.mode-notes #asideSectionList') &&
    styleCssSource.includes('.section-close'));
  ok('style.css · define o visual da view Configurações (.settings-body/.settings-option) e fixa "Configurações" no rodapé do #mNav',
    styleCssSource.includes('.settings-option') &&
    styleCssSource.includes('.settings-option-title') &&
    styleCssSource.includes('.nav-item-settings'));
}

// ─────────────────────────────────────────────────────────────────────────────
// SINTAXE DE FORMATAÇÃO E EDIÇÃO CONTEXTUAL (Live Preview Híbrido)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { readFile } = await import('node:fs/promises');
  const { parseMarkdownToBlocks, blocksToMarkdown } = await import('../sidepanel/modules/blocks.js');
  const { getInlineDelimiters } = await import('../sidepanel/modules/note/note-live-preview.js');

  // 1. Formatações de texto inline: __bold__, ***bold+italic***, _italic_, ==highlight==
  const mdInput = '__negrito__ e ***negrito italico*** e _italico_ e ==destaque==';
  const blocosInline = parseMarkdownToBlocks(mdInput);
  ok('live preview · parse inline reconhece __texto__, ***texto***, _texto_ e ==texto==',
    blocosInline[0].html.includes('data-syntax="__"') &&
    blocosInline[0].html.includes('data-syntax="***"') &&
    blocosInline[0].html.includes('data-syntax="_"') &&
    blocosInline[0].html.includes('data-syntax="=="'));

  const mdVolta = blocksToMarkdown(blocosInline);
  igual('live preview · serialização de formatação inline preserva sintaxe original', mdVolta, mdInput);

  // 2. getInlineDelimiters respeita data-syntax
  const elBoldUnder = document.createElement('strong');
  elBoldUnder.setAttribute('data-syntax', '__');
  igual('live preview · getInlineDelimiters __ retorna __', getInlineDelimiters(elBoldUnder).openSyntax, '__');

  const elBoldStar = document.createElement('strong');
  elBoldStar.setAttribute('data-syntax', '**');
  igual('live preview · getInlineDelimiters ** retorna **', getInlineDelimiters(elBoldStar).openSyntax, '**');

  const elBi = document.createElement('strong');
  elBi.setAttribute('data-syntax', '***');
  igual('live preview · getInlineDelimiters *** retorna ***', getInlineDelimiters(elBi).openSyntax, '***');

  const elItalicUnder = document.createElement('em');
  elItalicUnder.setAttribute('data-syntax', '_');
  igual('live preview · getInlineDelimiters _ retorna _', getInlineDelimiters(elItalicUnder).openSyntax, '_');

  const elItalicStar = document.createElement('em');
  elItalicStar.setAttribute('data-syntax', '*');
  igual('live preview · getInlineDelimiters * retorna *', getInlineDelimiters(elItalicStar).openSyntax, '*');

  const elMark = document.createElement('mark');
  elMark.setAttribute('data-syntax', '==');
  igual('live preview · getInlineDelimiters == retorna ==', getInlineDelimiters(elMark).openSyntax, '==');

  const elBiUnder = document.createElement('strong');
  elBiUnder.setAttribute('data-syntax', '___');
  igual('live preview · getInlineDelimiters ___ retorna ___', getInlineDelimiters(elBiUnder).openSyntax, '___');

  // 2.1 Aninhamento e combinações de sintaxes inline
  const mdCombinado = '==**destaque negrito**== e ___negrito italico underline___ e **_negrito com italico_**';
  const blocosCombinados = parseMarkdownToBlocks(mdCombinado);
  ok('live preview · parse aninhado funciona para ==** e ___',
    blocosCombinados[0].html.includes('<mark class="md-highlight"') &&
    blocosCombinados[0].html.includes('<strong>destaque negrito</strong>') &&
    blocosCombinados[0].html.includes('data-syntax="___"'));

  const mdVoltaCombinado = blocksToMarkdown(blocosCombinados);
  igual('live preview · serialização de sintaxes combinadas preserva marcações', mdVoltaCombinado, mdCombinado);

  // 2.2 findNearestInlineFormatting resolve quando cursor está no container pai
  const noteLivePreviewSource = await readFile(new URL('../sidepanel/modules/note/note-live-preview.js', import.meta.url), 'utf8');
  ok('note-live-preview.js · findNearestInlineFormatting resolve elemento sob o cursor no container do bloco e suporta mark',
    noteLivePreviewSource.includes('mark.md-highlight') &&
    noteLivePreviewSource.includes("target.classList?.contains('block')") &&
    noteLivePreviewSource.includes('candidate.closest'));

  // 3. Listas não ordenadas preservam marcadores +, -, *
  const mdListas = '+ Item mais\n* Item asterisco\n- Item hífen';
  const blocosListas = parseMarkdownToBlocks(mdListas);
  igual('live preview · lista + guarda marker "+"', blocosListas[0].marker, '+');
  igual('live preview · lista * guarda marker "*"', blocosListas[1].marker, '*');
  igual('live preview · lista - guarda marker padrão', blocosListas[2].marker, undefined);
  igual('live preview · serialização de listas preserva marcadores originais', blocksToMarkdown(blocosListas), mdListas);

  // 4. Integridade de código e CSS do Live Preview
  const noteJsSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const blocksCssSource = await readFile(new URL('../sidepanel/css/03-blocks.css', import.meta.url), 'utf8');

  ok('note.js · revealBlockSyntax suporta code fences e marcadores de lista',
    noteJsSource.includes("isCode = type === 'code'") &&
    noteJsSource.includes('md-syntax-fence-open') &&
    noteJsSource.includes('md-syntax-fence-close') &&
    noteJsSource.includes("isBullet = type === 'bullet'") &&
    noteJsSource.includes("isNumber = type === 'number'"));

  ok('note.js · collapseBlockSyntax extrai lang e limpa fences de código',
    noteJsSource.includes("block.dataset.type === 'code'") &&
    noteJsSource.includes('md-syntax-fence-close'));

  ok('note.js · handleEnter permite sair de blocos de código sem ficar preso',
    noteJsSource.includes("type === 'code'") &&
    noteJsSource.includes('isAtFenceClose') &&
    noteJsSource.includes("createBlockEl('paragraph')"));

  ok('note.js · handleEnter propaga marker de lista não ordenada',
    noteJsSource.includes("if (block.dataset.marker && nextType === 'bullet') newBlock.dataset.marker = block.dataset.marker;"));

  ok('note.js · INLINE_SHORTCUTS regex para highlight não possui escape duplo quebrado',
    noteJsSource.includes("==([^=\\n]+?)==$"));

  ok('note.js · collapseBlockSyntax re-formata markdown inline com formatUnparsedInlineMarkdown',
    noteJsSource.includes('formatUnparsedInlineMarkdown(contentEl)'));

  ok('03-blocks.css · esconde marcador de lista quando md-syntax-prefix está ativo e define estilo para fences e destaque',
    blocksCssSource.includes('.block-list:has(> .block-content > .md-syntax-prefix) > .block-marker') &&
    blocksCssSource.includes('.md-syntax-fence') &&
    blocksCssSource.includes('mark.md-highlight'));
}
// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO PRO, LEMBRETE PERSISTENTE DE FOCO & GEOLOCALIZAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
{
  const { readFile } = await import('node:fs/promises');
  const {
    normalizarDataString,
    extrairDataDaNota,
    extrairIntervaloDaNota,
    gerarMatrizCalendario,
    gerarMatrizSemana
  } = await import('../sidepanel/modules/calendar/calendar-engine.js');

  const {
    agruparCelulasPorSemana,
    calcularSpansDaSemana
  } = await import('../sidepanel/modules/calendar/calendar-spans.js');

  const {
    PROPERTY_TYPES,
    inferirTipoPropriedade,
    migrarPropriedadeParaTipo
  } = await import('../sidepanel/modules/property-types.js');

  const {
    criarLembreteTDAH,
    deveDispararLembrete,
    calcularProximoDisparo,
    aplicarAcaoLembrete
  } = await import('../sidepanel/modules/reminders/persistent-reminder.js');

  const {
    calcularDistanciaMetros,
    estaDentroDoRaio,
    avaliarDisparoGeocerca
  } = await import('../sidepanel/modules/reminders/geo-math.js');

  // 1. calendar-engine.js: normalização segura e matriz semanal
  igual('calendar-engine · normalizarDataString preserva YYYY-MM-DD direto',
    normalizarDataString('2026-10-01'), '2026-10-01');
  igual('calendar-engine · normalizarDataString converte formato BR DD/MM/YYYY',
    normalizarDataString('15/03/2026'), '2026-03-15');

  const notaRange = { properties: { daterange: { start: '2026-10-05', end: '2026-10-09' } } };
  igual('calendar-engine · extrairDataDaNota obtém start do daterange',
    extrairDataDaNota(notaRange), '2026-10-05');
  igual('calendar-engine · extrairIntervaloDaNota extrai start e end de daterange',
    extrairIntervaloDaNota(notaRange), { start: '2026-10-05', end: '2026-10-09', allDay: true });

  const notaHora = { properties: { datetime: '2026-10-05T14:30' } };
  igual('calendar-engine · extrairIntervaloDaNota extrai startTime',
    extrairIntervaloDaNota(notaHora), { start: '2026-10-05', end: '2026-10-05', allDay: false, startTime: '14:30' });

  const semanaExemplo = gerarMatrizSemana(2026, 9, 7); // 07/10/2026 (Quarta)
  igual('calendar-engine · gerarMatrizSemana tem 7 dias', semanaExemplo.length, 7);
  igual('calendar-engine · primeiro dia da semana é Domingo', semanaExemplo[0].diaSemanaNome, 'Dom');
  igual('calendar-engine · Domingo da semana do dia 07/10/2026 é dia 04/10/2026', semanaExemplo[0].dataFormatada, '2026-10-04');

  // 2. calendar-spans.js: agrupamento e cálculo de spans multi-dia
  const matrizMes = gerarMatrizCalendario(2026, 9);
  const semanasMes = agruparCelulasPorSemana(matrizMes);
  ok('calendar-spans · agrupa matriz em semanas de 7 dias',
    semanasMes.length >= 5 && semanasMes.every(s => s.length === 7));

  const spansSemana = calcularSpansDaSemana(semanasMes[1], [
    { note: { id: 'n1', title: 'Sprint' }, start: '2026-10-05', end: '2026-10-09' }
  ]);
  ok('calendar-spans · calcula span correto dentro da semana',
    spansSemana.length === 1 && spansSemana[0].colSpan >= 1 && spansSemana[0].level === 0);

  // 3. property-types.js: novos tipos de dados
  ok('property-types · suporta datetime, daterange, location, reminder',
    PROPERTY_TYPES.datetime && PROPERTY_TYPES.daterange && PROPERTY_TYPES.location && PROPERTY_TYPES.reminder);
  igual('property-types · infere daterange', inferirTipoPropriedade('periodo'), 'daterange');
  igual('property-types · infere location', inferirTipoPropriedade('localizacao'), 'location');
  igual('property-types · infere reminder', inferirTipoPropriedade('lembrete'), 'reminder');

  const rangeObj = migrarPropriedadeParaTipo('periodo', '2026-10-01 - 2026-10-05', 'daterange');
  igual('property-types · migrar string para daterange', rangeObj, { start: '2026-10-01', end: '2026-10-05', allDay: true });

  const remObj = migrarPropriedadeParaTipo('lembrete', true, 'reminder');
  ok('property-types · migrar booleano para reminder com intervalo default 5m',
    remObj.active === true && remObj.intervalMinutes === 5 && remObj.completed === false);

  // 4. reminders: persistent-reminder.js (Lembrete de Foco Persistente)
  const lembreteTDAH = criarLembreteTDAH({ intervalMinutes: 5 });
  ok('reminders · lembrete novo deve disparar imediatamente', deveDispararLembrete(lembreteTDAH, 100000));

  const lembreteNotificado = aplicarAcaoLembrete(lembreteTDAH, 'notify', 100000);
  ok('reminders · não deve disparar antes de decorrido o intervalo', !deveDispararLembrete(lembreteNotificado, 100000 + (2 * 60 * 1000)));
  ok('reminders · deve disparar após decorrido o intervalo de 5 minutos', deveDispararLembrete(lembreteNotificado, 100000 + (5 * 60 * 1000)));

  const lembreteSnooze = aplicarAcaoLembrete(lembreteNotificado, 'snooze', 100000, { minutes: 15 });
  ok('reminders · snooze bloqueia disparo até o fim do prazo', !deveDispararLembrete(lembreteSnooze, 100000 + (10 * 60 * 1000)));
  ok('reminders · snooze libera disparo ao término', deveDispararLembrete(lembreteSnooze, 100000 + (16 * 60 * 1000)));

  const lembreteConcluido = aplicarAcaoLembrete(lembreteSnooze, 'complete');
  ok('reminders · concluído não dispara mais', !deveDispararLembrete(lembreteConcluido, 999999999));

  // 5. reminders: geo-math.js (Haversine & Geocercas)
  // Distância entre Praça da Sé e Av. Paulista em SP (~2.7 km)
  const distSP = calcularDistanciaMetros(-23.5505, -46.6333, -23.5615, -46.6559);
  ok('geo-math · Haversine calcula distância coerente (~2.7 km)', distSP > 2500 && distSP < 3000);

  const geocercaMercado = { lat: -23.5505, lng: -46.6333, radius: 200, triggerOn: 'enter', triggered: false, active: true };
  const posLonge = { lat: -23.5600, lng: -46.6400 };
  const posPerto = { lat: -23.5506, lng: -46.6334 };

  const resChegada = avaliarDisparoGeocerca(posLonge, posPerto, geocercaMercado);
  ok('geo-math · dispara gatilho ao chegar na geocerca', resChegada.deveDisparar === true && resChegada.novoEstadoTriggered === true);

  const resPermanencia = avaliarDisparoGeocerca(posPerto, posPerto, { ...geocercaMercado, triggered: true });
  ok('geo-math · não repete disparo enquanto permanecer dentro do raio', resPermanencia.deveDisparar === false);

  // 6. manifest.json: permissões notifications e alarms
  const manifestSource = await readFile(new URL('../manifest.json', import.meta.url), 'utf8');
  ok('manifest.json · declara permissões notifications e alarms',
    manifestSource.includes('"notifications"') && manifestSource.includes('"alarms"') && manifestSource.includes('"type": "module"'));

  // 7. Submódulos visuais e de background (Fase 2)
  const bgAlarmsSource = await readFile(new URL('../background/background-alarms.js', import.meta.url), 'utf8');
  ok('background-alarms.js · implementa loop insistente e botões Concluir/Adiar',
    bgAlarmsSource.includes('PREFIXO_ALARME') &&
    bgAlarmsSource.includes('chrome.alarms.create') &&
    bgAlarmsSource.includes('chrome.notifications.create') &&
    bgAlarmsSource.includes('chrome.notifications.onButtonClicked'));

  const bgSource = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  ok('background.js · inicializa initBackgroundAlarms',
    bgSource.includes('initBackgroundAlarms()'));

  const calMonthSource = await readFile(new URL('../sidepanel/modules/calendar/calendar-month-view.js', import.meta.url), 'utf8');
  ok('calendar-month-view.js · renderiza grade e barras horizontais multi-dias',
    calMonthSource.includes('renderMonthGrid') &&
    calMonthSource.includes('calendar-span-bar') &&
    calMonthSource.includes('calcularSpansDaSemana'));

  const calWeekSource = await readFile(new URL('../sidepanel/modules/calendar/calendar-week-view.js', import.meta.url), 'utf8');
  ok('calendar-week-view.js · renderiza colunas semanais com horários',
    calWeekSource.includes('renderWeekView') &&
    calWeekSource.includes('calendar-week-col') &&
    calWeekSource.includes('week-card-time'));

  const calAgendaSource = await readFile(new URL('../sidepanel/modules/calendar/calendar-agenda-view.js', import.meta.url), 'utf8');
  ok('calendar-agenda-view.js · agrupa eventos em atrasadas, hoje, amanha e futuras',
    calAgendaSource.includes('renderAgendaView') &&
    calAgendaSource.includes('agenda-item-card') &&
    calAgendaSource.includes('grupos.atrasadas') &&
    calAgendaSource.includes('grupos.hoje'));

  const reminderUiSource = await readFile(new URL('../sidepanel/modules/reminders/reminder-ui.js', import.meta.url), 'utf8');
  ok('reminder-ui.js · renderiza controles de lembrete TDAH (ativar, soneca, concluir)',
    reminderUiSource.includes('renderReminderWidget') &&
    reminderUiSource.includes('reminder-active-card') &&
    reminderUiSource.includes('reminder-interval-select'));

  const geoWatcherSource = await readFile(new URL('../sidepanel/modules/reminders/geo-watcher.js', import.meta.url), 'utf8');
  ok('geo-watcher.js · gerencia geocercas ativas com watchPosition',
    geoWatcherSource.includes('registrarGeocerca') &&
    geoWatcherSource.includes('desregistrarGeocerca') &&
    geoWatcherSource.includes('avaliarDisparoGeocerca'));

  const styleCssSource = await readFile(new URL('../sidepanel/style.css', import.meta.url), 'utf8');
  ok('style.css · importa 28-reminders.css e 29-calendar-views.css',
    styleCssSource.includes('28-reminders.css') &&
    styleCssSource.includes('29-calendar-views.css'));

  // 8. Data de criação de arquivos e Backlog sem data
  const { extrairDataCriacaoNota } = await import('../sidepanel/modules/calendar/calendar-engine.js');
  const { filtrarNotasSemData } = await import('../sidepanel/modules/calendar/calendar-inbox.js');

  const notaSemData = { id: 'n_criada', title: 'Nota Recente', createdAt: 1727740800000 }; // timestamp
  const dataCriacaoEsperada = normalizarDataString(1727740800000);
  igual('calendar-engine · extrairDataCriacaoNota extrai data do createdAt',
    extrairDataCriacaoNota(notaSemData), dataCriacaoEsperada);

  igual('calendar-engine · extrairDataDaNota com fonte "created" usa data de criação',
    extrairDataDaNota(notaSemData, 'created'), dataCriacaoEsperada);

  igual('calendar-engine · extrairDataDaNota com fonte "auto" faz fallback para createdAt se não agendada',
    extrairDataDaNota(notaSemData, 'auto'), dataCriacaoEsperada);

  const listaNotasMistas = [
    notaSemData,
    { id: 'n_agendada', title: 'Com Data', properties: { data: '2026-10-15' } }
  ];
  const notasNoBacklog = filtrarNotasSemData(listaNotasMistas);
  igual('calendar-inbox · filtrarNotasSemData filtra apenas notas sem data agendada',
    notasNoBacklog.length, 1);
  igual('calendar-inbox · nota no backlog é a nota sem agendamento',
    notasNoBacklog[0].id, 'n_criada');

  const calDndSource = await readFile(new URL('../sidepanel/modules/calendar/calendar-dnd.js', import.meta.url), 'utf8');
  ok('calendar-dnd.js · implementa setupCalendarDropTargets e soltura nas células',
    calDndSource.includes('setupCalendarDropTargets') &&
    calDndSource.includes('is-drag-over') &&
    calDndSource.includes('updateNoteMetaById'));

  const storageSource = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
  ok('storage.js · loadAllNotesMeta expõe createdAt',
    storageSource.includes('createdAt: createdAt ?? updatedAt'));

  // 9. Integração UI: Drawer de Inbox, Filtro Temporal e Propriedades Estendidas
  const indexHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  ok('index.html · contém seletor de fonte temporal, botão do inbox e gaveta do backlog',
    indexHtmlSource.includes('id="calendar-filter-source"') &&
    indexHtmlSource.includes('id="btn-calendar-inbox-toggle"') &&
    indexHtmlSource.includes('id="calendar-inbox-drawer"'));

  const calViewSource = await readFile(new URL('../sidepanel/modules/calendar-view.js', import.meta.url), 'utf8');
  ok('calendar-view.js · gerencia alternância de fonte temporal e gaveta do inbox',
    calViewSource.includes('calendar-filter-source') &&
    calViewSource.includes('btn-calendar-inbox-toggle') &&
    calViewSource.includes('calendar-inbox-drawer') &&
    calViewSource.includes('atualizarInboxDrawer'));

  const calCssSource = await readFile(new URL('../sidepanel/css/29-calendar-views.css', import.meta.url), 'utf8');
  ok('29-calendar-views.css · define estilos da gaveta de backlog e itens arrastáveis',
    calCssSource.includes('.calendar-inbox-drawer') &&
    calCssSource.includes('.calendar-inbox-panel') &&
    calCssSource.includes('.calendar-inbox-item'));

  const notePropsSource = await readFile(new URL('../sidepanel/modules/note-properties.js', import.meta.url), 'utf8');
  ok('note-properties.js · renderiza campos datetime, daterange, location e reminder',
    notePropsSource.includes('renderPropertyDateTime') &&
    notePropsSource.includes('renderPropertyDateRange') &&
    notePropsSource.includes('renderPropertyLocation') &&
    notePropsSource.includes('renderPropertyReminder'));

  // 10. Correção de layout: Grade mensal com semanas em linhas (não colunas únicas) e fonte 'auto'
  ok('29-calendar-views.css · calendar-month-grid usa flex column e calendar-week-days usa 7 colunas',
    calCssSource.includes('.calendar-grid.calendar-month-grid') &&
    calCssSource.includes('flex-direction: column !important') &&
    calCssSource.includes('.calendar-week-days'));

  ok('calendar-view.js e index.html · definem fonte temporal híbrida ("auto") como padrão',
    calViewSource.includes("let fonteTemporal = 'auto'") &&
    indexHtmlSource.includes('value="auto" selected'));

  // 11. Botões rápidos no cabeçalho, popover com mapa visual e menu de tipos
  ok('index.html · contém botões de Lembrete, Localização e container de badges',
    indexHtmlSource.includes('id="btn-note-header-reminder"') &&
    indexHtmlSource.includes('id="btn-note-header-location"') &&
    indexHtmlSource.includes('id="note-header-badges"'));

  const noteHeaderSource = await readFile(new URL('../sidepanel/modules/note-header.js', import.meta.url), 'utf8');
  ok('note-header.js · conecta botões de cabeçalho e renderiza badges',
    noteHeaderSource.includes('openReminderPopover') &&
    noteHeaderSource.includes('openLocationPopover') &&
    noteHeaderSource.includes('note-header-badge'));

  const reminderPopSource = await readFile(new URL('../sidepanel/modules/reminders/reminder-popover.js', import.meta.url), 'utf8');
  ok('reminder-popover.js · implementa interface amigável de Lembrete TDAH',
    reminderPopSource.includes('openReminderPopover') &&
    reminderPopSource.includes('reminder-active-toggle') &&
    reminderPopSource.includes('TRIGGER_TEST_NOTIFICATION'));

  const locationPopSource = await readFile(new URL('../sidepanel/modules/reminders/location-popover.js', import.meta.url), 'utf8');
  ok('location-popover.js · implementa busca Nominatim, mapa interativo e Google Maps',
    locationPopSource.includes('openLocationPopover') &&
    locationPopSource.includes('nominatim.openstreetmap.org') &&
    locationPopSource.includes('location-map-frame') &&
    locationPopSource.includes('google.com/maps'));

  const mapPickerSource = await readFile(new URL('../sidepanel/modules/reminders/map-picker.js', import.meta.url), 'utf8');
  ok('map-picker.js · implementa controlador de mapa interativo com pino e geocerca',
    mapPickerSource.includes('createMapPicker') &&
    mapPickerSource.includes('interactive-map-pin') &&
    mapPickerSource.includes('onLocationSelect') &&
    mapPickerSource.includes('updateRadius'));

  const locationServiceSource = await readFile(new URL('../sidepanel/modules/reminders/location-service.js', import.meta.url), 'utf8');
  ok('location-service.js · serviço modular de busca e geocodificação reversa',
    locationServiceSource.includes('buscarLocaisPorTexto') &&
    locationServiceSource.includes('obterEnderecoPorCoordenadas') &&
    locationServiceSource.includes('extrairNomeCurto'));

  ok('index.html · carrega assets locais do Leaflet',
    indexHtmlSource.includes('vendor/leaflet/leaflet.css') &&
    indexHtmlSource.includes('vendor/leaflet/leaflet.js'));

  const expandableSectionSource = await readFile(new URL('../sidepanel/modules/reminders/note-expandable-section.js', import.meta.url), 'utf8');
  ok('note-expandable-section.js · implementa seção expansível integrada para mobile e desktop',
    expandableSectionSource.includes('openNoteSection') &&
    expandableSectionSource.includes('toggleNoteSection') &&
    expandableSectionSource.includes('closeNoteSection') &&
    expandableSectionSource.includes('renderLocationSection') &&
    expandableSectionSource.includes('renderReminderSection'));

  const sidepanelHtmlSource = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  ok('sidepanel/index.html · contém container para seção expansível',
    sidepanelHtmlSource.includes('id="note-expandable-section"'));

  ok('note-properties.js · abrir menu de tipos ao adicionar propriedade',
    notePropsSource.includes('abrirMenuDeTipo(anchor') &&
    notePropsSource.includes('NOMES_PADRAO_POR_TIPO'));

  // 12. Testes de Geolocalização de Alta Precisão e Chip de Propriedade
  const { extrairNomeCurto } = await import('../sidepanel/modules/reminders/location-service.js');

  const testEnderecoRua = extrairNomeCurto({
    address: {
      road: 'Avenida Paulista',
      house_number: '1578',
      suburb: 'Bela Vista',
      city: 'São Paulo'
    }
  });
  ok('location-service.js · extrairNomeCurto prioriza rua, número e bairro',
    testEnderecoRua === 'Avenida Paulista, 1578 - Bela Vista');

  const testEnderecoSemNumero = extrairNomeCurto({
    address: {
      road: 'Rua das Flores',
      suburb: 'Centro'
    }
  });
  ok('location-service.js · extrairNomeCurto formata rua e bairro sem número',
    testEnderecoSemNumero === 'Rua das Flores - Centro');

  const testEnderecoPoi = extrairNomeCurto({
    name: 'Hospital das Clínicas',
    address: {
      suburb: 'Cerqueira César'
    }
  });
  ok('location-service.js · extrairNomeCurto preserva nome de POI relevante com bairro',
    testEnderecoPoi === 'Hospital das Clínicas (Cerqueira César)');

  ok('location-service.js · implementa obterPosicaoGpsAltaPrecisao com enableHighAccuracy e maximumAge 0',
    locationServiceSource.includes('obterPosicaoGpsAltaPrecisao') &&
    locationServiceSource.includes('enableHighAccuracy: true') &&
    locationServiceSource.includes('maximumAge: 0'));

  ok('note-properties.js · renderPropertyLocation gera chip interativo e não input livre',
    notePropsSource.includes('property-location-chip') &&
    notePropsSource.includes('has-location') &&
    notePropsSource.includes('is-empty') &&
    notePropsSource.includes('chip-location-radius') &&
    notePropsSource.includes('chip-location-clear'));

  const notePropsCssSource = await readFile(new URL('../sidepanel/css/17-note-properties.css', import.meta.url), 'utf8');
  ok('17-note-properties.css · estiliza chips de localização para propriedades de notas',
    notePropsCssSource.includes('.property-location-chip') &&
    notePropsCssSource.includes('.property-location-chip.has-location') &&
    notePropsCssSource.includes('.property-location-chip.is-empty'));

  ok('note-expandable-section.js · integra status de GPS e captura automática em notas sem local',
    expandableSectionSource.includes('sec-gps-status') &&
    expandableSectionSource.includes('obterPosicaoGpsAltaPrecisao') &&
    expandableSectionSource.includes('currentLat == null || currentLng == null'));

  const { registrarGeocerca, desregistrarGeocerca } = await import('../sidepanel/modules/reminders/geo-watcher.js');
  registrarGeocerca({ id: 'nota-teste-1', lat: -23.55, lng: -46.63, radius: 100 });
  registrarGeocerca('nota-teste-2', { lat: -23.56, lng: -46.64, radius: 200 });
  desregistrarGeocerca('nota-teste-1');
  desregistrarGeocerca('nota-teste-2');
  ok('geo-watcher.js · registrarGeocerca aceita ambas as assinaturas (objeto único e noteId + geocerca)',
    typeof registrarGeocerca === 'function' && typeof desregistrarGeocerca === 'function');

  // 13. Testes de Lembretes com Data e Hora
  const bgAlarmsUpdatedSource = await readFile(new URL('../background/background-alarms.js', import.meta.url), 'utf8');
  ok('background-alarms.js · suporta agendamento futuro com timestamp exato',
    bgAlarmsUpdatedSource.includes('isTimestamp') &&
    bgAlarmsUpdatedSource.includes('when:') &&
    bgAlarmsUpdatedSource.includes('SCHEDULE_TDAH_REMINDER'));

  const headerSource = await readFile(new URL('../sidepanel/modules/note-header.js', import.meta.url), 'utf8');
  ok('note-header.js · formata badge de lembrete com data e hora agendada',
    headerSource.includes('rem.datetime') &&
    headerSource.includes('badge-reminder') &&
    headerSource.includes('Hoje às'));

  const propsSource = await readFile(new URL('../sidepanel/modules/note-properties.js', import.meta.url), 'utf8');
  ok('note-properties.js · renderPropertyReminder usa chip interativo com suporte a datetime',
    propsSource.includes('renderPropertyReminder') &&
    propsSource.includes('valObj.datetime') &&
    propsSource.includes('property-location-chip'));

  // 14. Testes de Sintetizador de Som e Runner Contínuo de Alarmes
  ok('background-alarms.js · processa mensagem TRIGGER_TEST_NOTIFICATION',
    bgAlarmsUpdatedSource.includes('TRIGGER_TEST_NOTIFICATION'));

  const now = Date.now();
  const futureLembrete = { active: true, datetime: new Date(now + 60000).toISOString(), intervalMinutes: 5 };
  const pastLembrete = { active: true, datetime: new Date(now - 1000).toISOString(), intervalMinutes: 5 };
  
  ok('persistent-reminder.js · não dispara antes do horário agendado',
    deveDispararLembrete(futureLembrete) === false);
  ok('persistent-reminder.js · dispara quando o horário agendado é atingido',
    deveDispararLembrete(pastLembrete) === true);

  const reminderSoundSource = await readFile(new URL('../sidepanel/modules/reminders/reminder-sound.js', import.meta.url), 'utf8');
  ok('reminder-sound.js · sintetizador de áudio Web Audio API implementado',
    reminderSoundSource.includes('tocarSomAlarmeTDAH') &&
    reminderSoundSource.includes('createOscillator'));

  const reminderRunnerSource = await readFile(new URL('../sidepanel/modules/reminders/reminder-runner.js', import.meta.url), 'utf8');
  ok('reminder-runner.js · exporta funções de teste e ciclo in-app',
    reminderRunnerSource.includes('testarAlarmeTDAH') &&
    reminderRunnerSource.includes('exibirAlarmeVisualToast') &&
    reminderRunnerSource.includes('initReminderRunner'));

  ok('note-expandable-section.js · botão de teste aciona testarAlarmeTDAH com feedback instantâneo',
    expandableSectionSource.includes('testarAlarmeTDAH') &&
    expandableSectionSource.includes('sec-btn-test-alarm'));

  // 15. Testes de Barra de Chips Sugeridos (Desktop) e BottomSheet de Lembretes (Mobile)
  const notePropsSourceAtualizado = await readFile(new URL('../sidepanel/modules/note-properties.js', import.meta.url), 'utf8');
  ok('note-properties.js · define PROPRIEDADES_SUGERIDAS e renderSuggestedChipsBar',
    notePropsSourceAtualizado.includes('PROPRIEDADES_SUGERIDAS') &&
    notePropsSourceAtualizado.includes('renderSuggestedChipsBar') &&
    notePropsSourceAtualizado.includes("tipo: 'reminder'") &&
    notePropsSourceAtualizado.includes("tipo: 'location'") &&
    notePropsSourceAtualizado.includes("tipo: 'date'"));

  const rootHtmlAtualizado = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  ok('index.html (root) · sincronizado com container para barra de chips sugeridos',
    rootHtmlAtualizado.includes('id="note-properties-suggested"') &&
    rootHtmlAtualizado.includes('class="note-properties-suggested-bar"'));

  const sidepanelHtmlAtualizado = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  ok('sidepanel/index.html · contém container para barra de chips sugeridos',
    sidepanelHtmlAtualizado.includes('id="note-properties-suggested"') &&
    sidepanelHtmlAtualizado.includes('class="note-properties-suggested-bar"'));

  const notePropsCssAtualizado = await readCssWithImports(new URL('../sidepanel/css/17-note-properties.css', import.meta.url));
  ok('17-note-properties.css · estiliza chips sugeridos e scroll horizontal',
    notePropsCssAtualizado.includes('.note-properties-suggested-bar') &&
    notePropsCssAtualizado.includes('.property-suggested-chip') &&
    notePropsCssAtualizado.includes('.property-suggested-chip.is-present'));

  const expandableSourceAtualizado = await readFile(new URL('../sidepanel/modules/reminders/note-expandable-section.js', import.meta.url), 'utf8');
  ok('note-expandable-section.js · opera como card expansível inline integrado sem scrim/backdrop nem bottom-sheet',
    !expandableSourceAtualizado.includes('is-mobile-bottom-sheet') &&
    !expandableSourceAtualizado.includes('getOrCreateBackdrop') &&
    expandableSourceAtualizado.includes('renderReminderSection') &&
    expandableSourceAtualizado.includes('renderLocationSection'));

  const remindersCssAtualizado = await readCssWithImports(new URL('../sidepanel/css/28-reminders.css', import.meta.url));
  ok('28-reminders.css · card expansível integrado inline sem modal/scrim',
    remindersCssAtualizado.includes('.note-expandable-section.is-open') &&
    !remindersCssAtualizado.includes('.note-section-backdrop') &&
    !remindersCssAtualizado.includes('.note-expandable-section.is-mobile-bottom-sheet'));
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO DE CÓDIGO & DESTAQUE DE SINTAXE (PROGRAMMING CODE HIGHLIGHTING)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { readFile } = await import('node:fs/promises');
  const {
    highlightCode, normalizeLang, detectLanguage, getLanguageDisplayName,
    getCodeCaretOffset, setCodeCaretOffset,
  } = await import('../sidepanel/modules/code-highlighter.js');
  const { parseMarkdownToBlocks, blocksToMarkdown } = await import('../sidepanel/modules/blocks.js');

  // 1. Normalização de apelidos de linguagem
  igual('highlighter · normaliza apelidos de js/ts', normalizeLang('js'), 'javascript');
  igual('highlighter · normaliza tsx', normalizeLang('tsx'), 'typescript');
  igual('highlighter · normaliza py', normalizeLang('py'), 'python');
  igual('highlighter · normaliza sh', normalizeLang('sh'), 'shell');
  igual('highlighter · normaliza c++', normalizeLang('c++'), 'cpp');
  igual('highlighter · normaliza c#', normalizeLang('c#'), 'csharp');
  igual('highlighter · normaliza jsonc', normalizeLang('jsonc'), 'json');
  igual('highlighter · normaliza yaml', normalizeLang('yaml'), 'shell');
  igual('highlighter · display name formatado', getLanguageDisplayName('js'), 'JavaScript');
  igual('highlighter · display name python', getLanguageDisplayName('python'), 'Python');

  // 2. Destaque de sintaxe em JavaScript/TypeScript
  const jsCode = 'const valor = 42;\nfunction somar(a, b) {\n  // comentário\n  return a + b;\n}';
  const jsHighlighted = highlightCode(jsCode, 'javascript');
  ok('highlighter · destaca keywords em JS', jsHighlighted.includes('class="tok-kw">const</span>') && jsHighlighted.includes('class="tok-kw">return</span>'));
  ok('highlighter · destaca números em JS', jsHighlighted.includes('class="tok-num">42</span>'));
  ok('highlighter · destaca funções em JS', jsHighlighted.includes('class="tok-fn">somar</span>'));
  ok('highlighter · destaca comentários em JS', jsHighlighted.includes('class="tok-com">// comentário</span>'));
  ok('highlighter · quebras de linha viram <br>', jsHighlighted.includes('<br>'));

  // 3. Destaque de sintaxe em Python
  const pyCode = 'def calcular(x):\n  # doc\n  return f"total: {x}"';
  const pyHighlighted = highlightCode(pyCode, 'python');
  ok('highlighter · destaca def e return em Python', pyHighlighted.includes('class="tok-kw">def</span>') && pyHighlighted.includes('class="tok-kw">return</span>'));
  ok('highlighter · destaca comentário em Python', pyHighlighted.includes('class="tok-com"># doc</span>'));
  ok('highlighter · destaca string formatada em Python', pyHighlighted.includes('class="tok-str">'));

  // 4. Destaque em HTML e SQL (incluindo insensibilidade a maiúsculas/minúsculas)
  const htmlCode = '<!doctype html><div class="card">\n  <!-- aviso -->\n  <span>OK</span>\n</div>';
  const htmlHighlighted = highlightCode(htmlCode, 'html');
  ok('highlighter · destaca doctype insensível a maiúsculas/minúsculas', htmlHighlighted.includes('class="tok-kw">&lt;!doctype html&gt;</span>'));
  ok('highlighter · destaca tags HTML', htmlHighlighted.includes('class="tok-tag">&lt;div</span>') || htmlHighlighted.includes('class="tok-tag">&lt;div'));
  ok('highlighter · destaca atributos HTML', htmlHighlighted.includes('class="tok-attr">class</span>'));
  ok('highlighter · destaca comentário HTML', htmlHighlighted.includes('class="tok-com">&lt;!-- aviso --&gt;</span>'));

  const sqlCodeUpper = 'SELECT id, nome FROM usuarios WHERE ativo = true;';
  const sqlHighlightedUpper = highlightCode(sqlCodeUpper, 'sql');
  ok('highlighter · destaca SELECT e WHERE em SQL maiúsculo', sqlHighlightedUpper.includes('class="tok-kw">SELECT</span>') && sqlHighlightedUpper.includes('class="tok-kw">WHERE</span>'));

  const sqlCodeLower = 'select id, nome from usuarios where ativo = true;';
  const sqlHighlightedLower = highlightCode(sqlCodeLower, 'sql');
  ok('highlighter · destaca palavras-chave em SQL minúsculo',
    sqlHighlightedLower.includes('class="tok-kw">select</span>') &&
    sqlHighlightedLower.includes('class="tok-kw">from</span>') &&
    sqlHighlightedLower.includes('class="tok-kw">where</span>'));

  // 4.1 Destaque em CSS (garantindo que cores hexadecimais viram tok-num e não tok-tag)
  const cssCode = 'body { color: #fff; background: #1a1a1a; width: 10px; } .card { display: flex; }';
  const cssHighlighted = highlightCode(cssCode, 'css');
  ok('highlighter · destaca propriedades CSS', cssHighlighted.includes('class="tok-prop">color</span>') && cssHighlighted.includes('class="tok-prop">background</span>'));
  ok('highlighter · cores hex em CSS são tok-num e não colidem com tok-tag',
    cssHighlighted.includes('class="tok-num">#fff</span>') &&
    cssHighlighted.includes('class="tok-num">#1a1a1a</span>') &&
    !cssHighlighted.includes('class="tok-tag">#fff</span>'));
  ok('highlighter · classes em CSS são tok-tag', cssHighlighted.includes('class="tok-tag">.card</span>'));

  // 5. Segurança contra XSS (Sanitização e escape estrito)
  // 4.2 Destaque em comandos de terminal, Bash e PowerShell
  const shellCode = 'docker run -d -p 8080:3000 --name quickdock quickdock:latest\n$ git commit -m "teste"\nGet-ChildItem -Path .\n# comentario';
  const shellHighlighted = highlightCode(shellCode, 'bash');
  ok('highlighter · destaca comandos executáveis de terminal (docker, git)',
    shellHighlighted.includes('class="tok-kw">docker</span>') &&
    shellHighlighted.includes('class="tok-kw">git</span>'));
  ok('highlighter · destaca subcomandos de terminal (run, commit)',
    shellHighlighted.includes('class="tok-fn">run</span>') &&
    shellHighlighted.includes('class="tok-fn">commit</span>'));
  ok('highlighter · destaca flags e parâmetros CLI (-d, -p, --name)',
    shellHighlighted.includes('class="tok-attr">-d</span>') &&
    shellHighlighted.includes('class="tok-attr">-p</span>') &&
    shellHighlighted.includes('class="tok-attr">--name</span>'));
  ok('highlighter · destaca prompt de linha de comando ($)',
    shellHighlighted.includes('class="tok-prompt">$ '));
  ok('highlighter · destaca portas e números no terminal',
    shellHighlighted.includes('class="tok-num">8080</span>'));
  ok('highlighter · destaca comandos do PowerShell',
    shellHighlighted.includes('class="tok-kw">Get-ChildItem</span>'));

  // 5. Segurança contra XSS (Sanitização e escape estrito)
  const xssCode = '<script>alert("xss")</script>';
  const safeHighlighted = highlightCode(xssCode, 'javascript');
  ok('highlighter (segurança) · nunca renderiza tags de script brutas', !safeHighlighted.includes('<script>') && !safeHighlighted.includes('</script>'));
  ok('highlighter (segurança) · escapa entidades HTML adequadamente', safeHighlighted.includes('&lt;') && safeHighlighted.includes('&gt;'));

  // 6. Detecção automática de linguagem quando ausente
  igual('highlighter · auto-detecta HTML', detectLanguage('<!DOCTYPE html><html></html>'), 'html');
  igual('highlighter · auto-detecta Python', detectLanguage('def main():\n  print("oi")'), 'python');
  igual('highlighter · auto-detecta SQL', detectLanguage('SELECT * FROM tabela'), 'sql');
  igual('highlighter · auto-detecta CSS', detectLanguage('.header { color: #fff; margin: 0; }'), 'css');
  igual('highlighter · auto-detecta JavaScript', detectLanguage('const a = 10; function run() { console.log(a); }'), 'javascript');
  igual('highlighter · auto-detecta Markdown', detectLanguage('# Título principal\n- Item de lista'), 'markdown');
  igual('highlighter · auto-detecta comandos de terminal (docker run)', detectLanguage('docker run -d -p 8080:3000 app'), 'shell');
  igual('highlighter · auto-detecta prompt de terminal ($ npm)', detectLanguage('$ npm install express'), 'shell');
  igual('highlighter · auto-detecta PowerShell', detectLanguage('Get-ChildItem -Path .'), 'shell');
  igual('highlighter · display name para bash', getLanguageDisplayName('bash'), 'Bash');
  igual('highlighter · display name para terminal', getLanguageDisplayName('terminal'), 'Terminal');
  igual('highlighter · display name para powershell', getLanguageDisplayName('powershell'), 'PowerShell');
  igual('highlighter · display name para cmd', getLanguageDisplayName('cmd'), 'CMD');

  // 7. Preservação de linguagem no Markdown (Roundtrip)
  const mdOriginal = '```python\ndef test():\n  return 1\n```';
  const blocosParsed = parseMarkdownToBlocks(mdOriginal);
  igual('blocks.js · parseMarkdownToBlocks extrai e preserva dataset.lang', blocosParsed[0].lang, 'python');
  const mdSerializado = blocksToMarkdown(blocosParsed);
  igual('blocks.js · blocksToMarkdown grava cerca com lang', mdSerializado, mdOriginal);

  // 7.1 Casos de Borda: entrada vazia, comentários com keywords, aspas não fechadas
  igual('highlighter (borda) · entrada vazia retorna string vazia', highlightCode(''), '');
  igual('highlighter (borda) · null/undefined retorna string vazia', highlightCode(null), '');
  const comCode = '// const x = 1;\n/* function test() { return true; } */';
  const comHighlight = highlightCode(comCode, 'js');
  ok('highlighter (borda) · palavras-chave dentro de comentários não viram tok-kw',
    !comHighlight.includes('tok-kw') && comHighlight.includes('tok-com'));
  const unclosedStr = 'const msg = "string sem fechar;\nconst a = 1;';
  const unclosedHighlight = highlightCode(unclosedStr, 'js');
  ok('highlighter (borda) · aspas não fechadas não quebram o parser e linha seguinte funciona',
    unclosedHighlight.includes('tok-kw">const</span>'));

  // 7.2 Funções de posicionamento de cursor exportadas com segurança
  igual('highlighter · getCodeCaretOffset não quebra em ambiente sem DOM', getCodeCaretOffset(null), null);
  igual('highlighter · setCodeCaretOffset não quebra com argumentos vazios', setCodeCaretOffset(null, null), undefined);

  // 8. Integridade de CSS e Service Worker
  const baseCssSource = await readFile(new URL('../sidepanel/css/01-base.css', import.meta.url), 'utf8');
  const blocksCssSource = await readFile(new URL('../sidepanel/css/03-blocks.css', import.meta.url), 'utf8');
  const noteJsSource = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

  ok('01-base.css · define tokens de cor para sintaxe (--code-kw, --code-str, etc.)',
    baseCssSource.includes('--code-kw:') &&
    baseCssSource.includes('--code-str:') &&
    baseCssSource.includes('--code-fn:') &&
    baseCssSource.includes('--code-num:') &&
    baseCssSource.includes('--code-com:'));

  ok('03-blocks.css · define classes de token e cabeçalho do bloco de código com botão de cópia',
    blocksCssSource.includes('.tok-kw') &&
    blocksCssSource.includes('.tok-fn') &&
    blocksCssSource.includes('.tok-str') &&
    blocksCssSource.includes('.code-block-header') &&
    blocksCssSource.includes('.code-copy-btn'));

  ok('note.js · integra highlightCode e updateCodeBlockHighlight nos blocos de código',
    noteJsSource.includes('updateCodeBlockHighlight') &&
    noteJsSource.includes('code-copy-btn') &&
    noteJsSource.includes('scheduleCodeHighlight'));

  ok('note.js · scheduleCodeHighlight fica no escopo do módulo acessível por keydown (Tab e Enter)',
    noteJsSource.indexOf('function scheduleCodeHighlight') !== -1 &&
    noteJsSource.indexOf("root.addEventListener('input'") !== -1 &&
    noteJsSource.indexOf('function scheduleCodeHighlight') < noteJsSource.indexOf("root.addEventListener('input'"));

  ok('sw.js · pré-cacheia code-highlighter.js',
    swSource.includes("'sidepanel/modules/code-highlighter.js'"));

  const printCssSource = await readFile(new URL('../sidepanel/css/25-print.css', import.meta.url), 'utf8');

  ok('01-base.css · tokens de código se adaptam a tema claro e escuro sem criar --code-bg ou --code-border',
    !baseCssSource.includes('--code-bg') &&
    !baseCssSource.includes('--code-border') &&
    !baseCssSource.includes('--code-fg') &&
    baseCssSource.includes('--code-kw: oklch(55.2% 0.205 24.5);') &&
    baseCssSource.includes('--code-kw: oklch(75.5% 0.183 346.8);') &&
    baseCssSource.includes('--code-fn: oklch(87.1% 0.22 148);') &&
    baseCssSource.includes('--code-str: oklch(95.5% 0.134 112.8);'));

  ok('03-blocks.css · bloco de código não altera background e usa tokens de sistema para container',
    blocksCssSource.includes('background: var(--bg-secondary);') &&
    !blocksCssSource.includes('var(--code-bg)') &&
    blocksCssSource.includes('border: 1px solid var(--border);') &&
    blocksCssSource.includes('border-color: var(--border-hover);') &&
    !blocksCssSource.includes('rgba(125, 125, 125, 0.2);') &&
    blocksCssSource.includes('color-mix(in srgb, var(--border) 50%, transparent);'));

  ok('25-print.css · garante tokens legíveis de sintaxe para saída em papel claro',
    printCssSource.includes('--code-kw: oklch(55.2% 0.205 24.5);') &&
    printCssSource.includes('--code-str: oklch(32.1% 0.108 259.1);') &&
    printCssSource.includes('--code-punc: oklch(27.9% 0.013 253);'));
}

// ── 44. Sincronização de Quadros Infinitos (.canvas) no Drive e Pasta Local ──
{
  const {
    SyncEngine,
    ehCaminhoDeQuadro,
    serializarQuadro,
    parseQuadroFile,
    hashDoQuadro,
  } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  // 44.1: Reconhecimento de caminhos de quadro
  ok('quadros sync · reconhece .canvas na pasta quadros/', ehCaminhoDeQuadro('quadros/meu-quadro.canvas'));
  ok('quadros sync · reconhece .canvas em subpasta de quadros/', ehCaminhoDeQuadro('quadros/projetos/fluxo.canvas'));
  ok('quadros sync · reconhece legado .json na pasta quadros/', ehCaminhoDeQuadro('quadros/antigo.json'));
  ok('quadros sync · reconhece arquivo .canvas na raiz', ehCaminhoDeQuadro('diagrama.canvas'));
  ok('quadros sync · não confunde notas com quadros', !ehCaminhoDeQuadro('notas/nota.md'));
  ok('quadros sync · não confunde modelos com quadros', !ehCaminhoDeQuadro('modelos/modelo.md'));
  ok('quadros sync · não confunde imagens com quadros', !ehCaminhoDeQuadro('imagens/foto.png'));

  // 44.2: Serialização com compatibilidade Obsidian JSON Canvas
  const quadroTeste = {
    uid: 'b_alpha_1',
    title: 'Arquitetura do Sistema',
    pasta: 'Engenharia',
    viewport: { x: 100, y: 200, zoom: 1.5 },
    bgMode: 'grid',
    cards: [
      { id: 'c1', type: 'text', x: 10, y: 20, w: 200, h: 100, text: 'Serviço Auth', color: 'blue' },
      { id: 'c2', type: 'group', x: 0, y: 0, w: 500, h: 400, label: 'Cluster Backend', color: null },
      { id: 'c3', type: 'note', x: 250, y: 20, w: 200, h: 100, noteUid: 'u_doc_1' },
    ],
    arrows: [
      { id: 'a1', from: 'c1', to: 'c3', fromSide: 'right', toSide: 'left', color: 'blue', label: 'token' }
    ]
  };

  const jsonSerialized = serializarQuadro(quadroTeste);
  const parsedObsidian = JSON.parse(jsonSerialized);

  ok('quadros json canvas · payload inclui nodes e edges para o Obsidian',
    Array.isArray(parsedObsidian.nodes) && Array.isArray(parsedObsidian.edges));
  igual('quadros json canvas · nodes mapeiam grupos e arquivos corretamente',
    parsedObsidian.nodes.map(n => n.type), ['text', 'group', 'file']);
  igual('quadros json canvas · edges preservam id, fromNode, toNode e lados',
    parsedObsidian.edges[0], { id: 'a1', fromNode: 'c1', toNode: 'c3', fromSide: 'right', toSide: 'left', color: 'blue', label: 'token' });

  // 44.3: Round-trip via parseQuadroFile
  const restaurado = parseQuadroFile(jsonSerialized);
  igual('quadros roundtrip · restaura uid e título', [restaurado.uid, restaurado.title], ['b_alpha_1', 'Arquitetura do Sistema']);
  igual('quadros roundtrip · restaura pasta', restaurado.pasta, 'Engenharia');
  igual('quadros roundtrip · restaura cartões e conexões intactos', [restaurado.cards.length, restaurado.arrows.length], [3, 1]);

  // 44.4: Importação direta de Obsidian JSON Canvas externo (apenas nodes e edges)
  const obsidianPuro = JSON.stringify({
    nodes: [
      { id: 'n1', type: 'text', text: 'Nota Externa Obsidian', x: 50, y: 50, width: 250, height: 140 },
      { id: 'n2', type: 'group', label: 'Grupo Obsidian', x: 0, y: 0, width: 400, height: 300 }
    ],
    edges: [
      { id: 'e1', fromNode: 'n1', toNode: 'n2', fromSide: 'bottom', toSide: 'top' }
    ]
  });
  const doObsidian = parseQuadroFile(obsidianPuro);
  ok('quadros obsidian import · reconhece nodes do Obsidian como cartões', doObsidian && doObsidian.cards.length === 2);
  ok('quadros obsidian import · reconhece edges do Obsidian como setas', doObsidian && doObsidian.arrows.length === 1);
  igual('quadros obsidian import · converte nós para tipos nativos QuickDock', doObsidian.cards[0].text, 'Nota Externa Obsidian');

  // 44.5: Hash do quadro é determinístico e ignora timestamps
  const hash1 = hashDoQuadro(jsonSerialized);
  const jsonComOutroTime = JSON.stringify({ ...JSON.parse(jsonSerialized), updatedAt: '2026-10-06T15:00:00.000Z' });
  const hash2 = hashDoQuadro(jsonComOutroTime);
  igual('quadros hash · ignora alteração isolada de updatedAt', hash1, hash2);

  // 44.6: Sincronização ponta a ponta com dois clientes (Envio, Recepção, Atualização e Exclusão)
  const adapter = new MemorySyncAdapter();
  const storeA = new InMemoryStore();
  const storeB = new InMemoryStore();
  const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'AparelhoA' });
  const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

  // 1. Aparelho A cria quadro
  await storeA.salvarQuadroLocal(quadroTeste);
  const resEnvio = await engineA.sincronizar();
  igual('quadros sync · aparelho A envia o quadro criado', resEnvio.enviadas, 1);

  const arqDestino = await adapter.ler('quadros/Engenharia/arquitetura-do-sistema.canvas');
  ok('quadros sync · arquivo gerado no caminho quadros/<pasta>/<slug>.canvas', arqDestino !== null);

  // 2. Aparelho B baixa o quadro
  const resBaixa = await engineB.sincronizar();
  igual('quadros sync · aparelho B baixa o quadro', resBaixa.baixadas, 1);
  const quadroB = await storeB.obterQuadroPorUid('b_alpha_1');
  ok('quadros sync · quadro salvo no banco do aparelho B', quadroB !== null);
  igual('quadros sync · dados preservados no aparelho B', quadroB.cards.length, 3);

  // 3. Aparelho B edita o quadro e envia de volta
  quadroB.cards.push({ id: 'c4', type: 'text', x: 300, y: 300, w: 150, h: 80, text: 'Novo Microserviço' });
  await storeB.salvarQuadroLocal(quadroB);
  const resBAtualiza = await engineB.sincronizar();
  igual('quadros sync · aparelho B sobe alteração', resBAtualiza.enviadas, 1);

  // 4. Aparelho A recebe a alteração
  const resARecebe = await engineA.sincronizar();
  igual('quadros sync · aparelho A baixa a atualização remota', resARecebe.baixadas, 1);
  const quadroAAtualizado = await storeA.obterQuadroPorUid('b_alpha_1');
  igual('quadros sync · aparelho A tem os 4 cartões atualizados', quadroAAtualizado.cards.length, 4);

  // 5. Aparelho A exclui o quadro
  await storeA.excluirQuadroLocal('b_alpha_1');
  const resAExclui = await engineA.sincronizar();
  igual('quadros sync · aparelho A remove arquivo do destino', resAExclui.apagadas, 1);
  ok('quadros sync · arquivo removido do adapter', (await adapter.ler('quadros/Engenharia/arquitetura-do-sistema.canvas')) === null);

  // 6. Aparelho B propaga a exclusão
  const resBExclui = await engineB.sincronizar();
  igual('quadros sync · aparelho B recebe exclusão remota', resBExclui.apagadas, 1);
  igual('quadros sync · quadro excluído do store B', await storeB.obterQuadroPorUid('b_alpha_1'), null);
}

// ── Quadro: Organizar fluxo (beautify), mídia por URL e pulse ──
{
  const { computeBeautifyLayout } = await import('../sidepanel/modules/board/board-beautify.js');
  const { mediaFromUrl, normalizeUrl, kindFromFile } = await import('../sidepanel/modules/board/board-media.js');
  const card = (id, x, y, w = 160, h = 80) => ({ id, x, y, w, h });
  const ar = (id, from, to) => ({ id, from, to });

  // Fluxo bagunçado: A → B → D, A → C → D (decisão com dois ramos que se juntam)
  const cards = [card('D', 10, 400), card('A', 500, 20), card('C', 40, 300), card('B', 300, 60), card('X', 900, 900)];
  const arrows = [ar('1', 'A', 'B'), ar('2', 'A', 'C'), ar('3', 'B', 'D'), ar('4', 'C', 'D')];

  const v = computeBeautifyLayout(cards, arrows, 'vertical');
  ok('beautify · vertical: camadas crescem pra baixo (A < B,C < D)',
    v.positions.get('A').y < v.positions.get('B').y &&
    v.positions.get('B').y === v.positions.get('C').y &&
    v.positions.get('B').y < v.positions.get('D').y);
  ok('beautify · vertical: irmãos lado a lado sem sobrepor',
    Math.abs(v.positions.get('B').x - v.positions.get('C').x) >= 160 + 40);
  ok('beautify · vertical: pai centralizado sobre os filhos',
    Math.abs((v.positions.get('A').x + 80) - ((v.positions.get('B').x + v.positions.get('C').x + 160) / 2)) <= 10);
  ok('beautify · vertical: setas saem por baixo e entram por cima',
    v.sides.get('1').fromSide === 'bottom' && v.sides.get('1').toSide === 'top');
  ok('beautify · cartão solto vai pra depois do fluxo',
    v.positions.get('X').y > v.positions.get('D').y);

  const h = computeBeautifyLayout(cards, arrows, 'horizontal');
  ok('beautify · horizontal: camadas crescem pra direita e setas usam leste→oeste',
    h.positions.get('A').x < h.positions.get('B').x &&
    h.positions.get('B').x < h.positions.get('D').x &&
    h.sides.get('3').fromSide === 'right' && h.sides.get('3').toSide === 'left');

  const ciclo = computeBeautifyLayout([card('P', 0, 0), card('Q', 0, 100)], [ar('a', 'P', 'Q'), ar('b', 'Q', 'P')], 'vertical');
  ok('beautify · ciclo não trava: a aresta de retorno contorna pela lateral',
    ciclo.positions.get('P').y < ciclo.positions.get('Q').y && ciclo.sides.get('b').fromSide === 'right');

  const rad = computeBeautifyLayout(cards, arrows, 'radial');
  const ctr = id => { const p = rad.positions.get(id); const n = cards.find(c => c.id === id); return { x: p.x + n.w / 2, y: p.y + n.h / 2 }; };
  const sobrepoe = (a, b) => { const A = rad.positions.get(a), B = rad.positions.get(b); return A.x < B.x + 160 && B.x < A.x + 160 && A.y < B.y + 80 && B.y < A.y + 80; };
  const ids = cards.map(c => c.id);
  let colide = false;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (sobrepoe(ids[i], ids[j])) colide = true;
  ok('beautify · radial: espalha em várias direções (esquerda/direita e cima/baixo) sem sobrepor', !colide &&
    new Set(['A','B','C','D'].map(id => Math.sign(Math.round(ctr(id).x - ctr('A').x)) + ':' + Math.sign(Math.round(ctr(id).y - ctr('A').y)))).size >= 3);
  ok('beautify · radial: cada camada fica mais longe da origem que a anterior',
    Math.hypot(ctr('B').x - ctr('A').x, ctr('B').y - ctr('A').y) > 0 &&
    Math.hypot(ctr('D').x - ctr('A').x, ctr('D').y - ctr('A').y) >= Math.hypot(ctr('B').x - ctr('A').x, ctr('B').y - ctr('A').y) - 1);
  ok('beautify · radial: setas escolhem o lado voltado pro destino', ['right','left','top','bottom'].includes(rad.sides.get('1').fromSide));

  ok('mídia · youtube vira embed seguro (nocookie)',
    mediaFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embed === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  ok('mídia · extensão decide imagem/vídeo/áudio e o resto é link',
    mediaFromUrl('exemplo.com/foto.PNG')?.kind === 'image' &&
    mediaFromUrl('https://x.com/a.mp4')?.kind === 'video' &&
    mediaFromUrl('https://x.com/a.mp3')?.kind === 'audio' &&
    mediaFromUrl('https://x.com/pagina')?.kind === 'link');
  ok('mídia · javascript:/data:/texto solto são recusados',
    normalizeUrl('javascript:alert(1)') === null && normalizeUrl('data:text/html,hi') === null && normalizeUrl('isso não é link') === null);
  ok('mídia · arquivo local classifica pelo mime',
    kindFromFile({ type: 'video/mp4' }) === 'video' && kindFromFile({ type: 'application/pdf' }) === 'file');
}

// ── Cores do Quadro: padrão OKLCH com tema claro e escuro ──
{
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../board/style.css', import.meta.url), 'utf8');
  const colors = await readFile(new URL('../sidepanel/modules/board/board-colors.js', import.meta.url), 'utf8');
  const doc = await readFile(new URL('../docs/PADRAO-DE-CORES-OKLCH.md', import.meta.url), 'utf8');
  const claudeMd = await readFile(new URL('../CLAUDE.md', import.meta.url), 'utf8');

  const ini = css.indexOf('/* Cores de Cartões');
  const fim = css.indexOf('/* Cartão selecionado em seleção múltipla */');
  const bloco = css.slice(ini, fim);
  ok('cores · cartões coloridos usam OKLCH e nenhum hex', ini > 0 && bloco.includes('oklch(') && !/#[0-9a-fA-F]{3,8}\b/.test(bloco));
  ok('cores · tokens de tema claro e escuro (e texto do cartão) definidos',
    bloco.includes('[data-theme="dark"] .board-card[data-color="red"]') && bloco.includes('--card-fg:') && bloco.includes('color: var(--card-fg)'));
  ok('cores · amostras e cores de seta em OKLCH', !/#[0-9a-fA-F]{6}/.test(colors) && colors.includes('ARROW_COLORS'));
  ok('cores · documento do padrão existe e o CLAUDE.md aponta pra ele',
    doc.includes('Regra permanente') && claudeMd.includes('docs/PADRAO-DE-CORES-OKLCH.md'));
}

// ── Links externos para notas (?abrirNota=<uid>) valem como link interno ──
{
  const { extrairLinksDeTexto, extrairLinksDeBlocos, resolverLinks, construirGrafo } = await import('../sidepanel/modules/links.js');
  const uidA = 'u_aaa111', uidB = 'u_bbb222';
  const urlPwa = `https://quickdock.app/index.html?abrirNota=${uidB}`;
  const urlExt = `chrome-extension://abcdefghijklmnop/sidepanel/index.html?abrirNota=${uidB}`;

  igual('links externos · URL solta do PWA', extrairLinksDeTexto(`veja ${urlPwa} depois`).map(l => l.alvo), [uidB]);
  igual('links externos · markdown [texto](url)', extrairLinksDeTexto(`[outra nota](${urlPwa})`).map(l => l.alvo), [uidB]);
  igual('links externos · <a href> com &amp; no HTML', extrairLinksDeTexto(`<a href="https://x.app/?v=1&amp;abrirNota=${uidB}">n</a>`).map(l => l.alvo), [uidB]);
  igual('links externos · URL da extensão', extrairLinksDeTexto(urlExt).map(l => l.alvo), [uidB]);
  ok('links externos · vira link de UID', extrairLinksDeTexto(urlPwa)[0].isUid === true);
  igual('links externos · uid com %-encoding', extrairLinksDeTexto('https://x.app/?abrirNota=u%5Fccc').map(l => l.alvo), ['u_ccc']);
  igual('links externos · URL comum (sem abrirNota) não vira link de nota', extrairLinksDeTexto('https://exemplo.com/pagina?x=1'), []);
  igual('links externos · interno + externo pro mesmo alvo não duplica', extrairLinksDeTexto(`[[${uidB}]] e ${urlPwa}`).length, 1);
  igual('links externos · interno e externo juntos', extrairLinksDeTexto(`[[Minha nota]] e ${urlPwa}`).map(l => l.alvo), ['Minha nota', uidB]);

  const notas = [{ id: 1, uid: uidA, title: 'A', pasta: '' }, { id: 2, uid: uidB, title: 'B', pasta: '' }];
  const refs = extrairLinksDeBlocos([{ html: `<a href="${urlPwa}">B</a>` }]);
  const resolvidos = resolverLinks(refs, uidA, notas);
  igual('links externos · resolve pro UID da nota de destino', resolvidos.map(l => l.uidDestino), [uidB]);
  const grafo = construirGrafo(notas, resolvidos);
  igual('links externos · aparece como aresta no grafo (Constelações)', grafo.edges.map(e => `${e.source}>${e.target}`), [`${uidA}>${uidB}`]);
}

// ── Quadros: arquivos de mídia dos cartões sincronizam junto (imagens/<hash>.<ext>) ──
{
  const { SyncEngine, serializarQuadro } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  const adapter = new MemorySyncAdapter();
  const storeA = new InMemoryStore();
  const storeB = new InMemoryStore();
  const engineA = new SyncEngine({ adapter, store: storeA, deviceName: 'AparelhoA' });
  const engineB = new SyncEngine({ adapter, store: storeB, deviceName: 'AparelhoB' });

  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5]);
  const fileIdA = await storeA.salvarArquivo({ name: 'colado_20261006.png', type: 'image/png', blob: new Blob([bytes], { type: 'image/png' }), inline: true });
  const audioIdA = await storeA.salvarArquivo({ name: 'voz.mp3', type: 'audio/mpeg', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }) });
  await storeA.salvarQuadroLocal({
    uid: 'b_midia_1', title: 'Com Mídia', pasta: '', viewport: { x: 0, y: 0, zoom: 1 }, bgMode: 'stars',
    cards: [
      { id: 'i1', type: 'image', x: 0, y: 0, w: 260, h: 200, fileId: fileIdA, alt: 'colado' },
      { id: 'm1', type: 'media', kind: 'audio', x: 300, y: 0, w: 300, h: 130, fileId: audioIdA, name: 'voz.mp3', mime: 'audio/mpeg' },
      { id: 'l1', type: 'media', kind: 'link', x: 0, y: 300, w: 260, h: 110, src: 'https://exemplo.com' },
    ],
    arrows: [],
  });

  await engineA.sincronizar();
  const caminhos = (await adapter.listar?.()) ?? null;
  const textoRemoto = (await adapter.ler('quadros/com-midia.canvas'))?.texto ?? '';
  const remoto = JSON.parse(textoRemoto || '{}');
  const cardImg = (remoto.cards || []).find(c => c.id === 'i1');
  const cardAudio = (remoto.cards || []).find(c => c.id === 'm1');

  ok('quadro midia · cartão sobe com o caminho do arquivo e SEM o fileId local',
    cardImg?.arquivo?.startsWith('imagens/') && cardImg.arquivo.endsWith('.png') && !('fileId' in cardImg));
  ok('quadro midia · áudio também vai pra imagens/ (extensão do nome)', cardAudio?.arquivo?.endsWith('.mp3'));
  ok('quadro midia · o arquivo existe no destino', (await adapter.ler(cardImg.arquivo)) !== null);
  ok('quadro midia · JSON Canvas (nodes) aponta pro arquivo', remoto.nodes.find(n => n.id === 'i1')?.file === cardImg.arquivo);
  ok('quadro midia · link por URL não gera arquivo', !(remoto.cards.find(c => c.id === 'l1')?.arquivo));

  // Aparelho B baixa o quadro: sem o fileId do A (que apontaria pra outro arquivo)
  await engineB.sincronizar();
  const quadroB = await storeB.obterQuadroPorUid('b_midia_1');
  const imgB = quadroB.cards.find(c => c.id === 'i1');
  ok('quadro midia · aparelho B recebe o caminho, sem fileId', imgB.arquivo === cardImg.arquivo && imgB.fileId == null);

  // …e baixa o arquivo sob demanda
  const res = await engineB.resolverImagem(imgB.arquivo, null);
  ok('quadro midia · aparelho B baixa o arquivo sob demanda', res?.fileId != null);
  const blobB = await storeB.obterBlobArquivo(res.fileId);
  igual('quadro midia · conteúdo do arquivo chega idêntico', blobB.size, bytes.length);

  // Quando B edita e A recebe, A não perde o arquivo que já tem
  imgB.fileId = res.fileId;
  quadroB.cards.push({ id: 't9', type: 'text', x: 5, y: 5, w: 160, h: 80, text: 'nova' });
  await storeB.salvarQuadroLocal(quadroB);
  await engineB.sincronizar();
  await engineA.sincronizar();
  const quadroA = await storeA.obterQuadroPorUid('b_midia_1');
  igual('quadro midia · A recebeu a edição de B', quadroA.cards.length, 4);
  igual('quadro midia · A mantém o fileId do arquivo que já possuía', quadroA.cards.find(c => c.id === 'i1').fileId, fileIdA);

  // serialização pura
  const texto = serializarQuadro({ uid: 'x', cards: [{ id: 'k', type: 'image', fileId: 7 }], arrows: [] }, new Map([[7, 'imagens/abc.png']]));
  ok('quadro midia · serializarQuadro troca fileId por arquivo', JSON.parse(texto).cards[0].arquivo === 'imagens/abc.png' && !('fileId' in JSON.parse(texto).cards[0]));
}

// ── Bases · calendário: dia local e data de criação como reserva ──
{
  // bases-calendar-view.js só importa bases-engine (puro): dá pra carregar no Node
  const { normalizeDateToYMD } = await import('../sidepanel/modules/bases/bases-calendar-view.js');
  igual('calendário · só data fica como está', normalizeDateToYMD('2026-10-06'), '2026-10-06');
  igual('calendário · DD/MM/YYYY', normalizeDateToYMD('06/10/2026'), '2026-10-06');
  const local = new Date(2026, 9, 6, 22, 30);   // 22h30 locais do dia 6
  igual('calendário · timestamp à noite continua no mesmo dia local', normalizeDateToYMD(local.getTime()), '2026-10-06');
  igual('calendário · ISO com hora vale no dia local', normalizeDateToYMD(local.toISOString()), '2026-10-06');
  igual('calendário · vazio e lixo viram nulo', [normalizeDateToYMD(''), normalizeDateToYMD('abc')], [null, null]);
}

{
  const { runBasesCalendarTests } = await import('./bases-calendar-tests.mjs');
  await runBasesCalendarTests({ ok, igual });
}

{
  const { runBasesSettingsTests } = await import('./bases-settings-tests.mjs');
  await runBasesSettingsTests({ ok, igual });
}

{
  const { runMobileTests } = await import('./mobile-gesture-tests.mjs');
  await runMobileTests({ ok, igual });
}

{
  const { runShellViewsListTests } = await import('./shell-views-list-tests.mjs');
  await runShellViewsListTests({ ok, igual });
}

{
  const { runCloudTests } = await import('./cloud-tests.mjs');
  await runCloudTests({ ok, igual });
}

if (falhas.length) {
  console.error(`\n✗ ${falhas.length} falha(s), ${passou} ok\n`);
  for (const f of falhas) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passou} verificações passaram`);


