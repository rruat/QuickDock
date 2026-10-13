// Imagem com o cursor nela: a linha `![Texto alternativo](endereço|300)` (e `|300x200`) — leitura,
// escrita e como ela convive com a forma do Obsidian que o arquivo da nota continua usando.
export async function runImageSourceTests({ ok, igual }) {
  const b = await import('../sidepanel/modules/blocks.js');

  // ── Leitura da linha ──
  igual('imagem · alt, endereço e largura', b.parseImageMarkdownLine('![Alt text](quickdock:file/12|300)'), { alt: 'Alt text', src: 'quickdock:file/12', width: 300, height: null });
  igual('imagem · largura e altura (|300x200)', b.parseImageMarkdownLine('![foto](quickdock:file/3|300x200)'), { alt: 'foto', src: 'quickdock:file/3', width: 300, height: 200 });
  igual('imagem · sem tamanho', b.parseImageMarkdownLine('![foto](../imagens/abc123.png)'), { alt: 'foto', src: '../imagens/abc123.png', width: null, height: null });
  igual('imagem · alt vazio é aceito', b.parseImageMarkdownLine('![](quickdock:file/1|120)').alt, '');
  igual('imagem · espaços ao redor do tamanho são tolerados', b.parseImageMarkdownLine('![a](quickdock:file/1 | 300 x 200 )'), { alt: 'a', src: 'quickdock:file/1', width: 300, height: 200 });
  igual('imagem · "×" também vale como separador', b.parseImageMarkdownLine('![a](quickdock:file/1|300×200)').height, 200);
  igual('imagem · a forma do Obsidian (tamanho no alt) também é lida', b.parseImageMarkdownLine('![Alt text|300](quickdock:file/12)'), { alt: 'Alt text', src: 'quickdock:file/12', width: 300, height: null });
  igual('imagem · Obsidian com largura e altura', b.parseImageMarkdownLine('![x|300x200](quickdock:file/12)').height, 200);
  igual('imagem · o tamanho depois do endereço vence o do alt', b.parseImageMarkdownLine('![a|50](quickdock:file/1|300)').width, 300);
  igual('imagem · texto que não é imagem devolve null', b.parseImageMarkdownLine('só um texto'), null);
  igual('imagem · faltou o parêntese devolve null', b.parseImageMarkdownLine('![a](quickdock:file/1|300'), null);
  igual('imagem · tamanho não numérico invalida', b.parseImageMarkdownLine('![a](quickdock:file/1|grande)'), null);

  // ── Escrita da linha ──
  igual('imagem · linha com largura', b.imageMarkdownLine({ alt: 'Alt text', src: 'quickdock:file/12', width: 300 }), '![Alt text](quickdock:file/12|300)');
  igual('imagem · linha com largura e altura', b.imageMarkdownLine({ alt: 'a', src: 'quickdock:file/12', width: 300, height: 200 }), '![a](quickdock:file/12|300x200)');
  igual('imagem · altura sozinha não é gravada (sem largura não há tamanho)', b.imageMarkdownLine({ alt: 'a', src: 'quickdock:file/12', height: 200 }), '![a](quickdock:file/12)');
  igual('imagem · colchetes no alt não quebram a linha', b.imageMarkdownLine({ alt: 'a [b]', src: 'quickdock:file/1' }), '![a b](quickdock:file/1)');
  const dados = { alt: 'foto', src: 'quickdock:file/9', width: 320, height: 180 };
  igual('imagem · escrever e ler devolve o mesmo', b.parseImageMarkdownLine(b.imageMarkdownLine(dados)), dados);

  // ── O arquivo da nota continua na forma do Obsidian (compatível com qualquer editor) ──
  const md = b.blocksToMarkdown([{ type: 'image', fileId: 12, alt: 'Alt text', width: 300, height: 200 }]);
  igual('imagem · o arquivo grava o tamanho no texto alternativo (Obsidian)', md, '![Alt text|300x200](quickdock:file/12)');
  const volta = b.parseMarkdownToBlocks(md)[0];
  igual('imagem · e lê de volta as mesmas medidas', [volta.type, volta.fileId, volta.alt, volta.width, volta.height], ['image', 12, 'Alt text', 300, 200]);
  const viaLinha = b.parseMarkdownToBlocks('![Alt text|300](quickdock:file/12)')[0];
  igual('imagem · a linha convertida para a forma do arquivo vira o mesmo bloco', [viaLinha.alt, viaLinha.width], ['Alt text', 300]);

  // ── Endereço da internet NÃO vira imagem (privacidade) ──
  const remoto = b.parseMarkdownToBlocks('![foto](https://exemplo.com/f.png)')[0];
  ok('imagem · endereço remoto vira link, não imagem', remoto.type === 'paragraph' && remoto.html.includes('<a href="https://exemplo.com/f.png">'));

  // ── Ligações no código ──
  const { readFile } = await import('node:fs/promises');
  const note = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  ok('imagem · o bloco leva a linha em markdown acima da imagem', note.includes('buildImageSource(), frame, buildImageTools()'));
  ok('imagem · entra/sai com o cursor (reveal/collapse)', note.includes('showImageSource(block)') && note.includes('hideImageSource(block)'));
  ok('imagem · clicar nela e navegar com as setas levam o cursor para a linha', note.includes('activateImageSource(bloco)') && note.includes('chegarNoBlocoSemTexto(vizinho)'));
}
