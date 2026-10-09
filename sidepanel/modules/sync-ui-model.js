// ── sync-ui-model.js ────────────────────────────────────────────────────────
// Regras (puras, sem DOM) do que a pessoa vê da sincronização: o texto do indicador e a decisão
// de travar ou não a abertura de uma nota. Separado do DOM para ser testável sem navegador.

export const ESTADO = {
  DESLIGADO: 'disconnected',
  REAUTORIZAR: 'needs-reauth',
  SINCRONIZANDO: 'syncing',
  PARADO: 'idle',
  ERRO: 'error',
};

/** "agora", "40 s", "3 min", "2 h", "5 d" — curto, para caber num selo pequeno. */
export function formatarHa(ts, agora = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((agora - ts) / 1000));
  if (s < 10) return 'agora';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/**
 * O que mostrar no indicador. `tipo` vira a cor/ícone no CSS; `texto` é o selo curto e `titulo`
 * a explicação completa (dica ao segurar/passar o mouse e leitor de tela).
 */
export function descreverEstado(resumo, { online = true, agora = Date.now() } = {}) {
  const conflitos = resumo?.totalConflitos || 0;
  const base = { conflitos };

  if (!resumo || resumo.state === ESTADO.DESLIGADO) {
    return { ...base, tipo: 'desligado', icone: 'cloud_off', texto: 'Sem sincronização', titulo: 'A sincronização está desligada. Toque para conectar.' };
  }
  if (resumo.state === ESTADO.REAUTORIZAR) {
    return { ...base, tipo: 'reautorizar', icone: 'lock', texto: 'Entrar de novo', titulo: 'É preciso entrar de novo para sincronizar. Toque para entrar.' };
  }
  if (!online) {
    return { ...base, tipo: 'offline', icone: 'cloud_off', texto: 'Sem internet', titulo: 'Sem internet. O que você escrever sobe quando a conexão voltar.' };
  }
  if (resumo.state === ESTADO.SINCRONIZANDO) {
    return { ...base, tipo: 'sincronizando', icone: 'sync', texto: 'Sincronizando…', titulo: 'Sincronizando notas e quadros…' };
  }
  if (resumo.state === ESTADO.ERRO) {
    return { ...base, tipo: 'erro', icone: 'cloud_alert', texto: 'Erro ao sincronizar', titulo: `Erro ao sincronizar: ${resumo.lastSyncError || 'falha desconhecida'}. Toque para ver.` };
  }
  const ha = formatarHa(resumo.lastSyncAt, agora);
  const titulo = conflitos > 0
    ? `Sincronizado, mas há ${conflitos} conflito(s) para revisar. Toque para ver.`
    : (ha ? `Sincronizado (${ha === 'agora' ? 'agora mesmo' : `há ${ha}`}).` : 'Sincronização ativa.');
  return { ...base, tipo: conflitos > 0 ? 'conflito' : 'ok', icone: 'cloud_done', texto: ha ? `Sincronizado · ${ha}` : 'Sincronizado', titulo };
}

const JANELA_SYNC_RECENTE_MS = 10_000;   // sincronizou há menos que isso: abrir direto
const JANELA_NOTA_NOVA_MS = 15_000;      // nota criada agora: não existe versão remota para esperar

/**
 * Travar a abertura da nota até sincronizar? Devolve `{ travar, motivo }`.
 * A trava existe para a pessoa nunca começar a editar em cima de uma versão velha (a causa
 * mais comum das cópias de conflito). Nos casos em que não há nada a confirmar, passa direto.
 */
export function decidirTrava({
  estado, online = true, agora = Date.now(), ultimaSync = null, mesmaNota = false,
  notaCriadaEm = null, criarSeFaltar = false, jaPassou = false,
}) {
  if (jaPassou) return { travar: false, motivo: 'ja_passou' };
  if (criarSeFaltar) return { travar: false, motivo: 'nota_nova' };
  if (estado === ESTADO.DESLIGADO || estado === ESTADO.REAUTORIZAR || !estado) return { travar: false, motivo: 'sem_sincronizacao' };
  if (mesmaNota) return { travar: false, motivo: 'mesma_nota' };
  if (!online) return { travar: false, motivo: 'sem_internet' };
  if (notaCriadaEm && agora - notaCriadaEm < JANELA_NOTA_NOVA_MS) return { travar: false, motivo: 'nota_nova' };
  if (estado === ESTADO.PARADO && ultimaSync && agora - ultimaSync < JANELA_SYNC_RECENTE_MS) return { travar: false, motivo: 'sync_recente' };
  return { travar: true, motivo: 'verificar' };
}
