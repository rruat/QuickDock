// Testes da matemática pura dos gestos de drawer e da pilha de navegação mobile.
export async function runMobileTests({ ok, igual }) {
  const g = await import('../sidepanel/modules/shell/shell-mobile-gesture-math.js');
  const L = 320, R = 340;

  let p = g.dragPositions('open-left', 100, L, R);
  igual('gesto · open-left empurra o conteúdo pelo dx', p.push, 100);
  igual('gesto · open-left posiciona o drawer em dx - largura', p.aside, -220);
  igual('gesto · open-left limita à largura', g.dragPositions('open-left', 999, L, R).push, L);
  igual('gesto · open-left não passa de 0', g.dragPositions('open-left', -50, L, R).push, 0);
  p = g.dragPositions('open-right', -100, L, R);
  igual('gesto · open-right posiciona o drawer direito', p.right, 240);
  p = g.dragPositions('close-left', -100, L, R);
  igual('gesto · close-left recolhe o conteúdo', p.push, 220);
  igual('gesto · close-left move o drawer', p.aside, -100);
  p = g.dragPositions('close-right', 100, L, R);
  igual('gesto · close-right devolve o conteúdo', p.push, -240);

  ok('gesto · passar de 35% conclui', g.shouldComplete('open-left', 120, 0, L));
  ok('gesto · abaixo de 35% sem velocidade reverte', !g.shouldComplete('open-left', 60, 0.1, L));
  ok('gesto · flick rápido conclui mesmo curto', g.shouldComplete('open-left', 40, 0.8, L));
  ok('gesto · flick no sentido contrário não conclui', !g.shouldComplete('open-left', 40, -0.8, L));
  ok('gesto · fechar arrastando para a esquerda', g.shouldComplete('close-left', -150, 0, L));
  ok('gesto · abrir direito arrastando para a esquerda', g.shouldComplete('open-right', -150, 0, R));
  ok('gesto · largura zero nunca conclui', !g.shouldComplete('open-left', 100, 1, 0));

  igual('gesto · velocidade em px/ms', g.releaseVelocity([{ x: 0, t: 0 }, { x: 50, t: 50 }]), 1);
  igual('gesto · sem amostras suficientes = 0', g.releaseVelocity([{ x: 0, t: 0 }]), 0);

  // Contrato de CSS: o transform dos drawers não pode ter !important (venceria o arrasto)
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../sidepanel/css/23-mobile-spatial.css', import.meta.url), 'utf8');
  ok('css · drawers usam variáveis de arrasto sem !important',
    /transform:\s*translate3d\(var\(--aside-x, -100%\), 0, 0\);/.test(css)
    && /transform:\s*translate3d\(var\(--right-x, 100%\), 0, 0\);/.test(css)
    && /transform:\s*translate3d\(var\(--push-x, 0px\), 0, 0\);/.test(css));

  // As três cópias do HTML precisam ter os controles mobile (a da raiz estava defasada)
  for (const f of ['index.html', '404.html', 'sidepanel/index.html']) {
    const html = await readFile(new URL('../' + f, import.meta.url), 'utf8');
    ok(`html · ${f} tem o botão do drawer e o título mobile`,
      html.includes('id="btn-mobile-left-drawer"') && html.includes('id="mobile-header-note-title"')
      && html.includes('id="btn-touch-select"') && html.includes('id="btn-note-appearance-mobile"'));
  }

  const tabs = await readFile(new URL('../sidepanel/modules/notes-tabs.js', import.meta.url), 'utf8');
  ok('mobile · escolher uma view fecha o drawer por inteiro (body.has-left-drawer-open)',
    /closeMobileLeftDrawer\(\);\s*\n\s*document\.getElementById\('mobileDrawerScrim'\)/.test(tabs));
  const back = await readFile(new URL('../sidepanel/modules/shell/shell-mobile-back.js', import.meta.url), 'utf8');
  ok('mobile · botão voltar ouve o foco do shell e o popstate',
    back.includes("'quickdock:shell-focus'") && back.includes("'popstate'"));
}
