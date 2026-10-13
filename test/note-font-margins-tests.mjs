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
  igual('texto · ABNT: 12 pt em tudo, 1,5, justificado, recuo', x.ABNT_TEXT, { p: 12, h1: 12, h2: 12, h3: 12, h4: 12, line: 1.5, justify: true, indent: true });
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
  ok('impressão · o @page usa as margens escolhidas', print.includes('pageMarginValue(margins)') && !print.includes('margin: 14mm'));
}
