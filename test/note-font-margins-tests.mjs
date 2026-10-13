// Fonte da nota (Google Fonts) e margens de impressão (ABNT).
export async function runNoteFontMarginsTests({ ok, igual }) {
  const f = await import('../sidepanel/modules/note-font.js');
  const m = await import('../sidepanel/modules/note-print-margins.js');

  ok('fonte · há predefinidas e todas têm nome válido', f.NOTE_FONTS.length >= 8 && f.NOTE_FONTS.every(x => f.fonteValida(x.name)));
  ok('fonte · inclui as parecidas com Arial e Times (ABNT)', f.NOTE_FONTS.some(x => x.name === 'Arimo') && f.NOTE_FONTS.some(x => x.name === 'Tinos'));
  igual('fonte · nome com espaço vale', f.fonteValida('Crimson Text'), true);
  igual('fonte · nome com símbolos é recusado (vai para URL/CSS)', [f.fonteValida('a;b'), f.fonteValida('x"y'), f.fonteValida('<b>'), f.fonteValida(''), f.fonteValida(null)], [false, false, false, false, false]);
  igual('fonte · url do Google Fonts', f.urlDaFonte('Open Sans').startsWith('https://fonts.googleapis.com/css2?family=Open+Sans:'), true);

  igual('margens · ABNT: sup 3, dir 2, inf 2, esq 3', m.pageMarginValue({ preset: 'abnt' }), '3cm 2cm 2cm 3cm');
  igual('margens · padrão continua 14 mm (1,4 cm)', m.pageMarginValue({ preset: 'padrao' }), '1.4cm 1.4cm 1.4cm 1.4cm');
  igual('margens · personalizada usa os 4 lados', m.pageMarginValue({ preset: 'custom', custom: { top: 3, right: 1.5, bottom: 2, left: 4 } }), '3cm 1.5cm 2cm 4cm');
  igual('margens · valor absurdo é limitado a 0–10 cm', [m.clampCm(99), m.clampCm(-4), m.clampCm('2,5'), m.clampCm('abc', 3)], [10, 0, 2.5, 3]);
  igual('margens · lixo salvo volta ao padrão', m.normalizeMargins({ preset: 'xyz' }), { preset: 'padrao', custom: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } });

  // ── Texto da página impressa (tamanho dos títulos, parágrafo, entrelinha) ──
  const x = await import('../sidepanel/modules/note-print-text.js');
  igual('texto · ABNT: 12 pt em tudo, 1,5, justificado, recuo, citação longa', x.ABNT_TEXT, { p: 12, h1: 12, h2: 12, h3: 12, h4: 12, line: 1.5, alignP: 'justify', alignH: null, indent: true, longQuote: true });
  igual('texto · o formato antigo (justify: true) ainda vale', x.normalizeText({ justify: true }).alignP, 'justify');
  const cssAbnt = x.textCss(x.ABNT_TEXT);
  ok('texto · alinhamento da impressão não passa por cima do alinhamento do próprio bloco', cssAbnt.includes(':not([data-text-align])') && cssAbnt.includes('text-align: justify !important'));
  ok('texto · citação longa ABNT: recuo de 4 cm e 10 pt, sem pegar destaques', cssAbnt.includes('margin-left: 4cm') && cssAbnt.includes('font-size: 10pt') && cssAbnt.includes(':not([data-callout])'));
  igual('texto · títulos centralizados na impressão', x.textCss({ alignH: 'center' }).includes('h1, h2, h3, h4, h5, h6).block:not([data-text-align]) { text-align: center !important'), true);

  // ── Alinhamento do texto no arquivo: <div align="center"> (GitHub, Obsidian, Typora…) ──
  const bl = await import('../sidepanel/modules/blocks.js');
  const md = ['Antes', '<div align="center">', '', '# Título', 'Autor', '', '</div>', '', 'Depois'].join('\n');
  const lidos = bl.parseMarkdownToBlocks(md);
  igual('alinhamento · o <div align="center"> alinha os blocos de dentro', lidos.map(b => [b.type, b.textAlign ?? null]), [['paragraph', null], ['heading1', 'center'], ['paragraph', 'center'], ['paragraph', null], ['paragraph', null]]);
  ok('alinhamento · as linhas em branco de dentro do div não viram blocos', lidos.length === 5);
  const volta = bl.blocksToMarkdown(lidos);
  ok('alinhamento · grava <div align="center"> com linha em branco antes e depois do conteúdo', volta.includes('<div align="center">\n\n# Título\nAutor\n\n</div>'), volta);
  ok('alinhamento · blocos seguidos com o mesmo alinhamento dividem um div só', (volta.match(/<div /g) || []).length === 1);
  igual('alinhamento · ler, gravar e ler de novo não muda nada (nem cria linhas vazias)', bl.blocksToMarkdown(bl.parseMarkdownToBlocks(volta)), volta);
  igual('alinhamento · <p align="right"> numa linha', bl.parseMarkdownToBlocks('<p align="right">à direita</p>').map(b => [b.type, b.html, b.textAlign]), [['paragraph', 'à direita', 'right']]);
  igual('alinhamento · <h2 align="center"> numa linha vira título 2 centralizado', bl.parseMarkdownToBlocks('<h2 align="center">Capítulo</h2>').map(b => [b.type, b.textAlign]), [['heading2', 'center']]);
  igual('alinhamento · <center> e style="text-align" também são lidos', [bl.parseMarkdownToBlocks('<center>x</center>')[0].textAlign, bl.parseMarkdownToBlocks('<div style="text-align: right">\n\ny\n\n</div>')[0].textAlign], ['center', 'right']);
  igual('alinhamento · cerca ::: do Pandoc', bl.parseMarkdownToBlocks('::: {style="text-align:center"}\n\nz\n\n:::').map(b => [b.html, b.textAlign]), [['z', 'center']]);
  igual('alinhamento · à esquerda é o padrão e não escreve nada', bl.blocksToMarkdown([{ type: 'paragraph', html: 'a', textAlign: 'left' }]), 'a');
  igual('alinhamento · parágrafo vazio e citação não ganham div', bl.blocksToMarkdown([{ type: 'paragraph', html: '', textAlign: 'center' }, { type: 'paragraph', html: 'q', quoted: true, textAlign: 'center' }]), '\n> q');
  igual('alinhamento · alinhamentos diferentes seguidos viram divs separados', bl.blocksToMarkdown([{ type: 'paragraph', html: 'a', textAlign: 'center' }, { type: 'paragraph', html: 'b', textAlign: 'right' }]).split('\n').filter(l => l.startsWith('<div')), ['<div align="center">', '<div align="right">']);
  igual('alinhamento · texto sem div segue exatamente como era', bl.blocksToMarkdown(bl.parseMarkdownToBlocks('# T\nlinha')), '# T\nlinha');
  igual('texto · sem nada definido não gera CSS', x.textCss(null), '');
  const css = x.textCss({ p: 11, h1: 18.5, line: 1.5, justify: true });
  ok('texto · tamanhos viram regras só do modo de impressão', css.includes('body.is-print-mode #note-editor-blocks .block[data-type="paragraph"] { font-size: 11pt') && css.includes('h1.block { font-size: 18.5pt') && !css.includes('h2.block'), css);
  ok('texto · entrelinha e justificado entram', css.includes('line-height: 1.5') && css.includes('text-align: justify') && !css.includes('text-indent'));
  igual('texto · valores absurdos são limitados e vazio volta ao padrão', [x.clampPt(500), x.clampPt(1), x.clampPt(''), x.clampLine(9), x.clampLine('1,5')], [72, 6, null, 3, 1.5]);
  igual('texto · reconhece a predefinição ABNT', [x.isAbnt(x.ABNT_TEXT), x.isAbnt(null), x.isDefaultText(null)], [true, false, true]);

  const { readFile } = await import('node:fs/promises');
  const tabs = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  const print = await readFile(new URL('../sidepanel/modules/note-print.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../sidepanel/modules/notes-appearance.js', import.meta.url), 'utf8');
  ok('fonte · aplicada ao abrir a nota (junto da cor)', (tabs.match(/setAccent\(meta\?\.color, meta\?\.font\)/g) || []).length === 2);
  ok('fonte · trocar a cor não apaga a fonte', !/setAccent\(hex\);/.test(app));
  ok('fonte · o seletor está nas 3 telas de aparência', (app.match(/buildFontPicker\(meta/g) || []).length === 3);
  const storage = await readFile(new URL('../sidepanel/modules/storage.js', import.meta.url), 'utf8');
  const sync = await readFile(new URL('../sidepanel/modules/sync-engine.js', import.meta.url), 'utf8');
  ok('fonte · a lista de notas devolve a fonte salva', storage.includes('font: font ?? null'));
  ok('fonte · vai no arquivo da nota (fonte:) e volta ao ler, sem virar propriedade',
     sync.includes('{ fonte: nota.font }') && (sync.match(/font: metaNota\.fonte \?\? null/g) || []).length === 3 && sync.includes("'fonte', 'font',"));
  ok('impressão · o texto escolhido entra no estilo da página', print.includes('textCss(textSettings)'));
  ok('impressão · desktop: painel na aside; celular: barra no topo', print.includes('buildPrintPanel(') && print.includes('buildPageAndTextGroups('));
  const shell = await readFile(new URL('../sidepanel/modules/spatial-shell.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sidepanel/index.html', import.meta.url), 'utf8');
  ok('impressão · o painel não tem cabeçalho próprio (a aside leva o ícone e a contagem)', !(await readFile(new URL('../sidepanel/modules/note-print-panel.js', import.meta.url), 'utf8')).includes('print-head'));
  ok('impressão · Ctrl+P só imprime com nota aberta; sem nota segue na busca', print.includes('if (!noteAberta()) return;') && shell.includes('!comNotaAberta'));
  ok('impressão · o atalho aparece no rodapé (4 cópias do index iguais)', html.includes('id="footer-print-shortcut"') && (await readFile(new URL('../index.html', import.meta.url), 'utf8')).includes('id="footer-print-shortcut"') && (await readFile(new URL('../404.html', import.meta.url), 'utf8')).includes('id="footer-print-shortcut"'));
  // ── Excluir tudo: quadros não renascem; notas apagadas por fora saem das abas/listas ──
  const board = await readFile(new URL('../sidepanel/modules/board-engine.js', import.meta.url), 'utf8');
  ok('quadros · excluir o último não cria outro (nem "Espaço Inicial" nem demonstração)', !board.includes("createBlankBoard('Espaço Inicial')") && !board.includes('Brainstorming Inicial') && (board.match(/esvaziarQuadroAberto\(\)/g) || []).length >= 2);
  ok('quadros · o espaço vazio só na memória não é gravado até ter conteúdo', board.includes('currentBoard?.naoSalvo') && board.includes('!currentBoard.cards?.length && !currentBoard.arrows?.length'));
  ok('quadros · o botão de excluir o espaço existe mesmo com um só quadro', !board.includes('if (allBoards.length > 1) {'));
  ok('notas · a lista em memória é conferida quando o conjunto de notas muda', tabs.includes("'quickdock:notes-changed'") && tabs.includes('conferirListaDeNotas') && storage.includes('export async function loadAllNoteIds'));
  ok('notas · dá para excluir a última nota (vai para "nenhuma nota aberta")', !tabs.includes('Deve existir ao menos uma nota') && tabs.includes('else await deactivateActiveNote();'));
  const noteSrc = await readFile(new URL('../sidepanel/modules/note.js', import.meta.url), 'utf8');
  const ddSrc = await readFile(new URL('../sidepanel/modules/note/note-drag-drop.js', import.meta.url), 'utf8');
  ok('alinhamento · o bloco guarda e devolve o alinhamento (criar, serializar, Enter, trocar de tipo)', noteSrc.includes('setBlockTextAlign(el, b.textAlign)') && noteSrc.includes('b.textAlign = block.dataset.textAlign') && noteSrc.includes('setBlockTextAlign(newBlock, block.dataset.textAlign)') && noteSrc.includes('setBlockTextAlign(newBlock, blockEl.dataset.textAlign)'));
  ok('alinhamento · atalhos Ctrl+Shift+L/E/R/J', noteSrc.includes("['l', 'e', 'r', 'j'].includes(key)") && noteSrc.includes("{ l: 'left', e: 'center', r: 'right', j: 'justify' }"));
  ok('alinhamento · o menu do bloco tem a linha Alinhar (esquerda, centro, direita, justificado)', ddSrc.includes('block-align-row') && ddSrc.includes('format_align_justify'));
  ok('impressão · o @page usa as margens escolhidas', print.includes('pageMarginValue(margins)') && !print.includes('margin: 14mm'));
}
