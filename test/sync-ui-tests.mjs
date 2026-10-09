// Testes do indicador de sincronização e da trava ao abrir nota: as regras puras (o que mostrar e
// quando travar) e o método do controlador que espera uma rodada completa.
import { readFile } from 'node:fs/promises';

export async function runSyncUiTests({ ok, igual }) {
  const m = await import('../sidepanel/modules/sync-ui-model.js');
  const E = m.ESTADO;
  const T0 = 1_000_000_000_000;

  // ── Tempo curto ──
  igual('indicador · agora', m.formatarHa(T0 - 3_000, T0), 'agora');
  igual('indicador · segundos', m.formatarHa(T0 - 40_000, T0), '40 s');
  igual('indicador · minutos', m.formatarHa(T0 - 3 * 60_000, T0), '3 min');
  igual('indicador · horas', m.formatarHa(T0 - 2 * 3_600_000, T0), '2 h');
  igual('indicador · dias', m.formatarHa(T0 - 5 * 86_400_000, T0), '5 d');
  igual('indicador · sem data não mostra nada', m.formatarHa(null, T0), '');

  // ── Estados do indicador ──
  const d = (resumo, extra = {}) => m.descreverEstado(resumo, { online: true, agora: T0, ...extra });
  igual('indicador · desligado', d({ state: E.DESLIGADO }).tipo, 'desligado');
  igual('indicador · sem resumo é desligado', d(null).tipo, 'desligado');
  igual('indicador · sincronizando', [d({ state: E.SINCRONIZANDO }).tipo, d({ state: E.SINCRONIZANDO }).texto], ['sincronizando', 'Sincronizando…']);
  igual('indicador · ok mostra há quanto tempo', d({ state: E.PARADO, lastSyncAt: T0 - 120_000 }).texto, 'Sincronizado · 2 min');
  igual('indicador · ok sem data ainda diz sincronizado', d({ state: E.PARADO }).texto, 'Sincronizado');
  const erro = d({ state: E.ERRO, lastSyncError: 'Drive respondeu 500' });
  ok('indicador · erro traz o motivo na explicação', erro.tipo === 'erro' && erro.titulo.includes('Drive respondeu 500'));
  igual('indicador · precisa entrar de novo', d({ state: E.REAUTORIZAR }).tipo, 'reautorizar');
  igual('indicador · sem internet vence "ok"', d({ state: E.PARADO, lastSyncAt: T0 }, { online: false }).tipo, 'offline');
  igual('indicador · sem internet não esconde a necessidade de entrar de novo', d({ state: E.REAUTORIZAR }, { online: false }).tipo, 'reautorizar');
  const conflito = d({ state: E.PARADO, lastSyncAt: T0, totalConflitos: 2 });
  ok('indicador · conflitos viram aviso com a quantidade', conflito.tipo === 'conflito' && conflito.conflitos === 2 && conflito.titulo.includes('2'));

  // ── Quando travar a abertura ──
  const base = { estado: E.PARADO, online: true, agora: T0, ultimaSync: T0 - 60_000 };
  igual('trava · nota aberta há tempo sem sincronizar recente trava', m.decidirTrava(base).travar, true);
  igual('trava · sincronizou há poucos segundos: abre direto', m.decidirTrava({ ...base, ultimaSync: T0 - 3_000 }).motivo, 'sync_recente');
  igual('trava · sincronização desligada não trava', m.decidirTrava({ ...base, estado: E.DESLIGADO }).travar, false);
  igual('trava · precisa entrar de novo: não trava (não há como sincronizar)', m.decidirTrava({ ...base, estado: E.REAUTORIZAR }).travar, false);
  igual('trava · sem internet não trava', m.decidirTrava({ ...base, online: false }).motivo, 'sem_internet');
  igual('trava · a mesma nota já aberta não trava', m.decidirTrava({ ...base, mesmaNota: true }).motivo, 'mesma_nota');
  igual('trava · nota criada agora não trava', m.decidirTrava({ ...base, notaCriadaEm: T0 - 4_000 }).motivo, 'nota_nova');
  igual('trava · nota criada há tempo trava', m.decidirTrava({ ...base, notaCriadaEm: T0 - 3_600_000 }).travar, true);
  igual('trava · "criar se faltar" (link para nota nova) não trava', m.decidirTrava({ ...base, criarSeFaltar: true }).travar, false);
  igual('trava · evento já liberado passa', m.decidirTrava({ ...base, jaPassou: true }).motivo, 'ja_passou');
  igual('trava · com erro na última rodada ainda tenta sincronizar antes de abrir', m.decidirTrava({ ...base, estado: E.ERRO }).travar, true);
  igual('trava · rodada em andamento trava (espera terminar)', m.decidirTrava({ ...base, estado: E.SINCRONIZANDO }).travar, true);

  // ── Controlador: esperar uma rodada completa ──
  const { SyncController } = await import('../sidepanel/modules/sync-controller.js');
  const { MemorySyncAdapter } = await import('../sidepanel/modules/sync-adapter.js');
  const { InMemoryStore } = await import('./memory-store.mjs');

  const montar = async () => {
    const store = new InMemoryStore();
    const c = new SyncController({ store, adapter: new MemorySyncAdapter() });
    await c._montarEngineComAdapter(new MemorySyncAdapter());
    c.state = 'idle';
    return c;
  };

  const c1 = await montar();
  const r1 = await c1.sincronizarParaAbrir();
  igual('controlador · rodada que dá certo devolve ok', r1.ok, true);

  const c2 = await montar();
  c2.engine.sincronizar = async () => { throw new Error('Drive respondeu 500'); };
  const r2 = await c2.sincronizarParaAbrir();
  ok('controlador · rodada que falha devolve o motivo', r2.ok === false && r2.erro.includes('Drive respondeu 500'));

  const c3 = await montar();
  let rodadas = 0;
  let solta;
  c3.engine.sincronizar = async () => {
    rodadas++;
    if (rodadas === 1) await new Promise(r => { solta = r; });
    return { baixadas: 0, enviadas: 0, conflitos: 0, apagadas: 0 };
  };
  c3.sincronizarAgora();                              // rodada 1 trava até soltarmos
  await new Promise(r => setTimeout(r, 10));
  const esperando = c3.sincronizarParaAbrir();
  await new Promise(r => setTimeout(r, 10));
  igual('controlador · a trava espera a rodada em andamento (não dispara outra no meio)', rodadas, 1);
  solta();
  const r3 = await esperando;
  igual('controlador · depois dela roda mais uma e devolve ok', [r3.ok, rodadas], [true, 2]);

  const c4 = await montar();
  c4.state = 'disconnected';
  igual('controlador · desconectado não sincroniza e avisa', (await c4.sincronizarParaAbrir()).ok, false);

  // ── Ligações no código ──
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  ok('sync-ui · módulos e CSS no pré-cache', ['sync-ui-model.js', 'sync-gate.js', 'sync-indicator.js', 'css/41-sync-ui.css'].every(f => sw.includes(f)));
  const app = await readFile(new URL('../sidepanel/app.js', import.meta.url), 'utf8');
  ok('sync-ui · o app liga o indicador e a trava depois de iniciar a sincronização', app.includes('iniciarIndicadorDeSincronizacao(syncController)') && app.includes('iniciarTravaDeAbertura('));
  const gate = await readFile(new URL('../sidepanel/modules/sync-gate.js', import.meta.url), 'utf8');
  ok('sync-ui · a trava escuta na fase de captura da janela (antes dos outros ouvintes)', /window\.addEventListener\(EVENTO[\s\S]*\}, true\)/.test(gate));
  ok('sync-ui · a decisão de travar é síncrona (sem await antes do stopImmediatePropagation)', !/addEventListener\(EVENTO, async/.test(gate));
}
