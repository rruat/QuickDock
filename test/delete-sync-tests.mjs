// Excluir uma nota num aparelho tem que sumir nos outros — inclusive quando o outro aparelho
// recarregou o app no meio (o adaptador do Drive guarda os ids dos arquivos só em memória, e um
// aparelho "novo" nunca viu o arquivo que acabou na lixeira).
export async function runDeleteSyncTests({ ok, igual }) {
  const { criarDriveFalso } = await import('./drive-falso.mjs');
  const { GoogleDriveAdapter } = await import('../sidepanel/modules/google-drive-adapter.js');
  const { SyncEngine } = await import('../sidepanel/modules/sync-engine.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  const nota = (uid, titulo, extra = {}) => ({
    uid, title: titulo, ordem: 'a0', blocks: [{ type: 'paragraph', html: titulo }],
    createdAt: 1000, updatedAt: 1000, ...extra,
  });

  // ── O caso do relato: apaga no celular, o PC (com o app recarregado) não vê ──
  {
    const drive = criarDriveFalso();
    const adaptador = () => new GoogleDriveAdapter({ obterToken: async () => 'tok', fetchImpl: drive.fetchFalso });
    const celular = new InMemoryStore();
    const pc = new InMemoryStore();
    const engCelular = new SyncEngine({ adapter: adaptador(), store: celular, deviceName: 'Celular' });
    const engPc = new SyncEngine({ adapter: adaptador(), store: pc, deviceName: 'PC' });

    await celular.salvarNotaLocal(nota('u_del_1', 'Vai ser apagada'));
    await celular.salvarNotaLocal(nota('u_del_2', 'Fica', { ordem: 'a1' }));
    await engCelular.sincronizar();
    await engPc.sincronizar();
    igual('exclusão · o PC recebeu as duas notas', (await pc.listarNotasLocais()).length, 2);

    // o PC fecha o app (o adaptador novo não conhece nenhum arquivo) e o celular apaga uma nota
    await celular.excluirNotaLocal('u_del_1');
    const rCel = await engCelular.sincronizar();
    igual('exclusão · o celular manda a exclusão para o Drive', rCel.apagadas, 1);
    ok('exclusão · o arquivo foi para a lixeira do Drive', [...drive.arquivos.values()].some(a => a.name.startsWith('vai-ser-apagada') && a.trashed));

    const engPcRecarregado = new SyncEngine({ adapter: adaptador(), store: pc, deviceName: 'PC' });   // app reaberto
    const rPc = await engPcRecarregado.sincronizar();
    igual('exclusão · o PC (recarregado) apaga a nota', (await pc.listarNotasLocais()).map(n => n.uid), ['u_del_2']);
    igual('exclusão · conta como apagada na rodada', rPc.apagadas, 1);

    // ociosas depois: nada volta, nada duplica
    let conflitos = 0;
    for (let i = 0; i < 3; i++) {
      conflitos += (await engCelular.sincronizar()).conflitos;
      conflitos += (await engPcRecarregado.sincronizar()).conflitos;
    }
    igual('exclusão · rodadas seguintes não ressuscitam nem geram conflito', [conflitos, (await pc.listarNotasLocais()).length, (await celular.listarNotasLocais()).length], [0, 1, 1]);
  }

  // ── Sem recarregar também funciona (o caminho que já existia) ──
  {
    const drive = criarDriveFalso();
    const adaptador = () => new GoogleDriveAdapter({ obterToken: async () => 'tok', fetchImpl: drive.fetchFalso });
    const celular = new InMemoryStore(), pc = new InMemoryStore();
    const engCelular = new SyncEngine({ adapter: adaptador(), store: celular, deviceName: 'Celular' });
    const engPc = new SyncEngine({ adapter: adaptador(), store: pc, deviceName: 'PC' });
    await celular.salvarNotaLocal(nota('u_del_3', 'Mesma sessão'));
    await engCelular.sincronizar();
    await engPc.sincronizar();
    await celular.excluirNotaLocal('u_del_3');
    await engCelular.sincronizar();
    await engPc.sincronizar();
    igual('exclusão · na mesma sessão a nota também some', (await pc.listarNotasLocais()).length, 0);
  }

  // ── Nota apagada num aparelho mas EDITADA no outro: não se perde a edição ──
  {
    const drive = criarDriveFalso();
    const adaptador = () => new GoogleDriveAdapter({ obterToken: async () => 'tok', fetchImpl: drive.fetchFalso });
    const celular = new InMemoryStore(), pc = new InMemoryStore();
    const engCelular = new SyncEngine({ adapter: adaptador(), store: celular, deviceName: 'Celular' });
    const engPc = new SyncEngine({ adapter: adaptador(), store: pc, deviceName: 'PC' });
    await celular.salvarNotaLocal(nota('u_del_4', 'Editada no PC'));
    await engCelular.sincronizar();
    await engPc.sincronizar();

    const noPc = await pc.obterNotaPorUid('u_del_4');
    await pc.salvarNotaLocal({ ...noPc, blocks: [{ type: 'paragraph', html: 'ESCRITA IMPORTANTE' }], updatedAt: 5000 });
    await celular.excluirNotaLocal('u_del_4');
    await engCelular.sincronizar();

    const engPc2 = new SyncEngine({ adapter: adaptador(), store: pc, deviceName: 'PC' });
    await engPc2.sincronizar();
    const sobrou = await pc.obterNotaPorUid('u_del_4');
    ok('exclusão · apagada de um lado e editada do outro: a edição não se perde', sobrou?.blocks?.[0]?.html === 'ESCRITA IMPORTANTE', JSON.stringify(sobrou?.blocks));
  }
}
