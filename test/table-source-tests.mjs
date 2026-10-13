// Tabela em markdown: alinhamento por coluna (:---, :---:, ---:), o texto "estrutura" que aparece com
// o cursor na tabela, e a leitura desse texto editado à mão — sem mudar o arquivo das tabelas que já
// existem (compacto, sem espaços de enfeite).
export async function runTableSourceTests({ ok, igual }) {
  const b = await import('../sidepanel/modules/blocks.js');

  const EXEMPLO = [
    '| Tables   |      Are      |  Cool |',
    '|----------|:-------------:|------:|',
    '| col 1 is |  left-aligned | $1600 |',
    '| col 2 is |    centered   |   $12 |',
    '| col 3 is | right-aligned |    $1 |',
  ].join('\n');

  // ── Leitura: o exemplo do pedido ──
  const blocos = b.parseMarkdownToBlocks(EXEMPLO);
  igual('tabela · o markdown vira um bloco de tabela', [blocos.length, blocos[0].type], [1, 'table']);
  igual('tabela · 1 linha de títulos + 3 de dados', blocos[0].rows.length, 4);
  igual('tabela · alinhamento por coluna (:---:, ---:)', blocos[0].align, [null, 'center', 'right']);
  igual('tabela · o texto das células chega limpo', blocos[0].rows[1], ['col 1 is', 'left-aligned', '$1600']);

  const sem = b.parseMarkdownToBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |');
  ok('tabela · sem marcação de alinhamento o bloco não ganha `align`', !('align' in sem[0]));
  igual('tabela · :--- é esquerda', b.parseTableAligns('| :--- | --- |'), ['left', null]);
  igual('tabela · ---: é direita e :---: é centro', b.parseTableAligns('|---:|:-:|'), ['right', 'center']);

  // ── Escrita: o arquivo da nota ──
  const compacto = b.blocksToMarkdown(blocos);
  igual('tabela · o arquivo guarda o alinhamento (compacto)', compacto.split('\n')[1], '| --- | :---: | ---: |');
  igual('tabela · ler de novo dá o mesmo alinhamento e as mesmas células', [b.parseMarkdownToBlocks(compacto)[0].align, b.parseMarkdownToBlocks(compacto)[0].rows], [blocos[0].align, blocos[0].rows]);
  igual('tabela · tabela sem alinhamento continua IGUAL ao que sempre foi gravado',
        b.blocksToMarkdown(sem), '| a | b |\n| --- | --- |\n| 1 | 2 |');

  // ── Painel de estrutura (colunas alinhadas) ──
  const estrutura = b.tableToSourceText(blocos[0].rows, blocos[0].align);
  const linhas = estrutura.split('\n');
  ok('tabela · a estrutura tem a linha de alinhamento', /^\| -{3,} \| :-+: \| -+: \|$/.test(linhas[1]), linhas[1]);
  ok('tabela · todas as linhas têm a mesma largura (colunas alinhadas)', new Set(linhas.map(l => l.length)).size === 1, estrutura);
  ok('tabela · a coluna centralizada é centralizada e a da direita encosta à direita', /\|\s+Are\s+\|/.test(linhas[0]) && /\|\s+Cool \|$/.test(linhas[0]));
  igual('tabela · a estrutura é lida de volta sem perder nada', b.parseTableMarkdown(estrutura), { rows: blocos[0].rows, align: blocos[0].align });

  const estreita = b.tableToSourceText([['a', 'b', 'c'], ['1', '2', '3']], ['center', 'left', 'right']).split('\n');
  ok('tabela · colunas estreitas e alinhadas continuam com a mesma largura', new Set(estreita.map(l => l.length)).size === 1, estreita.join('\n'));
  igual('tabela · e a estrutura delas é lida de volta', b.parseTableMarkdown(estreita.join('\n')).align, ['center', 'left', 'right']);

  // ── Texto editado à mão ──
  const exemplo = b.parseTableMarkdown(EXEMPLO);
  igual('tabela · o exemplo do pedido é lido como veio', [exemplo.rows.length, exemplo.align], [4, [null, 'center', 'right']]);
  const rico = b.parseTableMarkdown('| **negrito** | *itálico* |\n| :--- | ---: |\n| [site](https://exemplo.com) | `código` |');
  ok('tabela · negrito, itálico, link e código dentro das células viram HTML',
     rico.rows[0][0].includes('<strong') && rico.rows[0][1].includes('<em') && rico.rows[1][0].includes('<a href="https://exemplo.com"') && rico.rows[1][1].includes('<code>'),
     JSON.stringify(rico.rows));
  ok('tabela · imagem por endereço remoto vira link, sem "!" sobrando', (() => {
    const t = b.parseTableMarkdown('| img |\n| --- |\n| ![foto](https://exemplo.com/f.png) |');
    return t.rows[1][0].includes('<a href="https://exemplo.com/f.png">foto</a>') && !t.rows[1][0].startsWith('!');
  })());
  igual('tabela · só uma linha de títulos ganha uma linha vazia', b.parseTableMarkdown('| a | b |\n| --- | --- |').rows.length, 2);
  igual('tabela · linha com menos colunas é completada', b.parseTableMarkdown('| a | b | c |\n| --- | --- | --- |\n| 1 |').rows[1], ['1', '', '']);
  igual('tabela · texto que deixou de ser tabela devolve null (nada é destruído)', b.parseTableMarkdown('só um parágrafo'), null);
  igual('tabela · sem a linha | --- | não é tabela', b.parseTableMarkdown('| a | b |\n| 1 | 2 |'), null);
  igual('tabela · uma linha estranha no meio invalida', b.parseTableMarkdown('| a |\n| --- |\n| 1 |\nsobrou texto'), null);
  igual('tabela · barra escapada dentro da célula não separa coluna', b.parseTableMarkdown('| a \\| b | c |\n| --- | --- |').rows[0].length, 2);

  // ── A formatação digitada na célula (HTML) volta como markdown no arquivo ──
  const html = [['<strong data-syntax="**">negrito</strong> e <em data-syntax="*">itálico</em>', '<a href="https://x.com">site</a>'], ['', '']];
  igual('tabela · HTML da célula vira markdown no arquivo', b.blocksToMarkdown([{ type: 'table', rows: html }]).split('\n')[0], '| **negrito** e *itálico* | [site](https://x.com) |');

  // ── Ligações no código ──
  const { readFile } = await import('node:fs/promises');
  const note = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  ok('tabela · o painel de estrutura aparece/some com o cursor (reveal/collapse)', note.includes('showTableSource(block)') && note.includes('hideTableSource(block)'));
  ok('tabela · a formatação inline vale dentro da célula', /table'\) \{[\s\S]{0,400}tryAutoFormatInline\(celula\)/.test(note));
  ok('tabela · o painel não é tratado como bloco de texto (teclado e colar são do campo)', note.includes("closest?.('.table-source')") && (note.match(/\.table-source/g) || []).length >= 2);
  ok('tabela · o alinhamento entra no modelo do bloco ao salvar', note.includes('b.align = align'));
}
