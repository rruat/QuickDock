// Capa ENVIADA do computador sincroniza junto com a nota (imagens/<hash>.<ext>, como as imagens das
// notas), com dois aparelhos simulados falando com a mesma pasta remota.
import { calcularHashImagem } from '../sidepanel/modules/sync-engine.js';

export async function runCoverSyncTests({ ok, igual }) {
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  const png = bytes => new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  const bytesDe = async (store, id) => new Uint8Array(await (await store.obterBlobArquivo(id)).arrayBuffer());
  const dois = () => {
    const adapter = new MemorySyncAdapter();
    const A = { store: new InMemoryStore() };
    const B = { store: new InMemoryStore() };
    A.engine = new SyncEngine({ adapter, store: A.store, deviceName: 'Notebook' });
    B.engine = new SyncEngine({ adapter, store: B.store, deviceName: 'Celular' });
    return { adapter, A, B };
  };
  const nota = (uid, titulo, extra = {}) => ({
    uid, title: titulo, ordem: 'a0', blocks: [{ id: 'b1', type: 'paragraph', html: titulo }], ...extra,
  });
  const bytes1 = [137, 80, 78, 71, 1, 2, 3, 4, 5, 6, 7, 8];
  const bytes2 = [137, 80, 78, 71, 9, 9, 9, 9, 1, 1, 1, 1, 2];

  // ── A define uma capa do computador; ela chega em B ──
  {
    const { adapter, A, B } = dois();
    const arq = await A.store.salvarArquivo({ name: 'foto.png', type: 'image/png', blob: png(bytes1), inline: true });
    await A.store.salvarNotaLocal(nota('u_cv_1', 'Com capa do PC', { coverFileId: arq, coverPosition: 30, coverHeight: 'medium' }));
    await A.engine.sincronizar();

    const hash = await calcularHashImagem(png(bytes1));
    const caminho = `imagens/${hash}.png`;
    ok('capa · a imagem sobe para imagens/<hash>.png', !!(await adapter.ler(caminho)));
    const arquivo = await adapter.ler('notas/com-capa-do-pc.md');
    ok('capa · o arquivo da nota aponta para a imagem (capaImagem)', arquivo.texto.includes(`capaImagem: "${caminho}"`) || arquivo.texto.includes(`capaImagem: ${caminho}`), arquivo.texto);
    ok('capa · posição e altura viajam junto', /capaPosicao: 30/.test(arquivo.texto) && /capaAltura:/.test(arquivo.texto), arquivo.texto);

    await B.engine.sincronizar();
    const emB = await B.store.obterNotaPorUid('u_cv_1');
    ok('capa · chega no outro aparelho como arquivo local (não só o link)', emB && emB.coverFileId != null && !emB.coverUrl);
    igual('capa · o conteúdo da imagem é o mesmo', [...await bytesDe(B.store, emB.coverFileId)], bytes1);
    igual('capa · posição e altura chegam', [emB.coverPosition, emB.coverHeight], [30, 'medium']);
    ok('capa · "capaImagem/capaPosicao/capaAltura" não viram propriedades da nota', !Object.keys(emB.properties || {}).some(k => /^capa/.test(k)), JSON.stringify(emB.properties));

    // ── convergência: nada muda, nada duplica, nenhum conflito ──
    const rA = await A.engine.sincronizar();
    const rB = await B.engine.sincronizar();
    igual('capa · rodada seguinte em A: nada a enviar e sem conflito', [rA.enviadas, rA.conflitos], [0, 0]);
    igual('capa · rodada seguinte em B: nada a enviar e sem conflito', [rB.enviadas, rB.conflitos], [0, 0]);
    igual('capa · continua uma nota em cada aparelho', [(await A.store.listarNotasLocais()).length, (await B.store.listarNotasLocais()).length], [1, 1]);
    igual('capa · um só arquivo de imagem no destino', [...adapter.arquivos.keys()].filter(c => c.startsWith('imagens/')).length, 1);

    // ── A troca a capa por outra imagem ──
    const arq2 = await A.store.salvarArquivo({ name: 'outra.png', type: 'image/png', blob: png(bytes2), inline: true });
    const emA = await A.store.obterNotaPorUid('u_cv_1');
    await A.store.salvarNotaLocal({ ...emA, coverFileId: arq2 });
    await A.engine.sincronizar();
    const rB2 = await B.engine.sincronizar();
    const emB2 = await B.store.obterNotaPorUid('u_cv_1');
    igual('capa · trocar a capa em A muda a capa em B', [...await bytesDe(B.store, emB2.coverFileId)], bytes2);
    igual('capa · a troca não gera conflito', rB2.conflitos, 0);

    // ── A remove a capa ──
    const emA2 = await A.store.obterNotaPorUid('u_cv_1');
    await A.store.salvarNotaLocal({ ...emA2, coverFileId: null });
    await A.engine.sincronizar();
    const arquivoSemCapa = await adapter.ler('notas/com-capa-do-pc.md');
    ok('capa · sem capa o arquivo não aponta mais para imagem', !/capaImagem/.test(arquivoSemCapa.texto), arquivoSemCapa.texto);
    const rB3 = await B.engine.sincronizar();
    const emB3 = await B.store.obterNotaPorUid('u_cv_1');
    ok('capa · remover a capa em A remove em B', emB3.coverFileId == null && !emB3.coverRemote, JSON.stringify([emB3.coverFileId, emB3.coverRemote]));
    igual('capa · a remoção não gera conflito', rB3.conflitos, 0);
  }

  // ── capa por link continua igual (e vence a de arquivo) ──
  {
    const { A, B } = dois();
    await A.store.salvarNotaLocal(nota('u_cv_2', 'Capa por link', { coverUrl: 'https://exemplo.com/c.jpg' }));
    await A.engine.sincronizar();
    await B.engine.sincronizar();
    const emB = await B.store.obterNotaPorUid('u_cv_2');
    igual('capa · link continua viajando como antes', [emB.coverUrl, emB.coverFileId ?? null], ['https://exemplo.com/c.jpg', null]);
  }

  // ── versão antiga do app escreveu o arquivo sem capaImagem: a capa local não some ──
  {
    const { engine } = { engine: new SyncEngine({ adapter: new MemorySyncAdapter(), store: new InMemoryStore(), deviceName: 'X' }) };
    const semHistorico = await engine._capaDoArquivoRemoto({}, { coverFileId: 5 });
    igual('capa · arquivo antigo sem capa e capa local nunca sincronizada: mantém a local', semHistorico.coverFileId, 5);
    const comHistorico = await engine._capaDoArquivoRemoto({}, { coverFileId: 5, coverRemote: 'imagens/x.png', coverRemoteId: 5 });
    ok('capa · capa já sincronizada que sumiu do arquivo foi removida por outro aparelho', comHistorico.coverFileId === null && comHistorico.coverRemote === undefined);
    const porLink = await engine._capaDoArquivoRemoto({ capa: 'https://x/y.jpg' }, { coverFileId: 5, coverRemote: 'imagens/x.png', coverRemoteId: 5 });
    ok('capa · link no arquivo vence a imagem antiga e solta o caminho remoto', porLink.coverUrl === 'https://x/y.jpg' && porLink.coverRemote === undefined);
  }

  // ── imagem da capa ainda não disponível no destino: fica pendente e NÃO é apagada do arquivo ──
  {
    const adapter = new MemorySyncAdapter();
    const B = { store: new InMemoryStore() };
    B.engine = new SyncEngine({ adapter, store: B.store, deviceName: 'Celular' });
    const hash = await calcularHashImagem(png(bytes1));
    const caminho = `imagens/${hash}.png`;
    const texto = `---\nquickdock: 1\nid: u_cv_3\ntitulo: Pendente\ncapaImagem: "${caminho}"\ncapaPosicao: 50\nordem: a0\n---\n\ntexto\n`;
    await adapter.escrever('notas/pendente.md', texto, null);       // a nota chega, a imagem ainda não

    await B.engine.sincronizar();
    const pend = await B.store.obterNotaPorUid('u_cv_3');
    ok('capa · sem a imagem ainda: nota baixa e a capa fica pendente com o caminho guardado', pend && pend.coverFileId == null && pend.coverRemote === caminho);
    ok('capa · a nota pendente continua apontando para a imagem ao serializar (não apaga a capa remota)', B.engine.serializarNota(pend).includes('capaImagem'));

    await adapter.escrever(caminho, png(bytes1), null);              // a imagem chega depois
    await B.engine.sincronizar();
    const completa = await B.store.obterNotaPorUid('u_cv_3');
    ok('capa · quando a imagem chega, a capa pendente é completada na rodada seguinte', completa.coverFileId != null && completa.coverRemoteId === completa.coverFileId);
    const arquivoFinal = await adapter.ler('notas/pendente.md');
    ok('capa · e o arquivo remoto nunca perdeu a referência', arquivoFinal.texto.includes('capaImagem'));
  }
}
