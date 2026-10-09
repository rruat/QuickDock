// ── cloud-session.js ────────────────────────────────────────────────────────
// Login do QuickDock hospedado (Cloudflare Pages + D1). O servidor guarda o refresh token do
// Google e uma sessão longa; este módulo só pede a ele um access token novo quando precisa.
// Com isso o PWA deixa de depender da renovação silenciosa do Google (que cai no Safari do
// iPhone) e a pessoa não precisa entrar de novo a cada hora.
//
// Mesma forma do provedor da extensão e do GIS (obterToken/conectar/renovar/desconectar), para o
// adaptador do Drive e o controlador não saberem de onde o token vem. As notas continuam
// indo direto do navegador para o Drive: o servidor nunca as vê.

const MARGEM_MS = 90 * 1000;   // renova um pouco antes do vencimento (ver google-auth-web.js)

/**
 * O servidor de login existe e está configurado neste endereço? Em `localhost` com servidor
 * estático, ou numa cópia sem a API, a rota não existe e a resposta não é JSON: devolve null e o
 * app usa o caminho antigo (GIS/extensão), sem erro.
 */
export async function consultarNuvem(fetchImpl = (...a) => globalThis.fetch(...a)) {
  try {
    const resp = await fetchImpl('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!resp.ok || !/json/.test(resp.headers.get('content-type') || '')) return null;
    const corpo = await resp.json();
    return corpo?.disponivel ? corpo : null;
  } catch {
    return null;   // offline ou sem API
  }
}

export class SessaoExpiradaError extends Error {
  constructor(motivo) { super(`Sessão do QuickDock: ${motivo}`); this.name = 'SessaoExpiradaError'; this.motivo = motivo; }
}

export function criarProvedorDeTokenNuvem({ fetchImpl = (...a) => globalThis.fetch(...a), irPara = url => location.assign(url) } = {}) {
  let token = null;
  let expiraEm = 0;

  const valido = () => !!token && Date.now() < expiraEm - MARGEM_MS;

  async function pedir() {
    const resp = await fetchImpl('/api/drive/token', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    if (resp.status === 401) {
      const corpo = await resp.json().catch(() => ({}));
      token = null; expiraEm = 0;
      throw new SessaoExpiradaError(corpo?.erro || 'sem_sessao');
    }
    if (!resp.ok) throw new Error(`O servidor do QuickDock respondeu ${resp.status}. Tente de novo em instantes.`);
    const corpo = await resp.json();
    token = corpo.access_token;
    expiraEm = Date.now() + (Number(corpo.expires_in || 3600) * 1000);
    return token;
  }

  return {
    /** O controlador usa isto para gravar o estado ANTES de sair da página (login é redirecionamento). */
    redireciona: true,
    ehSuportado: () => typeof window !== 'undefined',
    tokenAtual: () => token,

    async obterToken() {
      return valido() ? token : pedir();
    },

    /** Só a partir de clique. Sai da página para o Google e volta já logado: a promessa não resolve. */
    conectar() {
      irPara(`/api/auth/login?return=${encodeURIComponent(location.pathname + location.search)}`);
      return new Promise(() => {});
    },

    async renovar() {
      token = null; expiraEm = 0;
      return pedir();
    },

    /** Desconectar apaga o registro no servidor e revoga o acesso no Google. As notas não são tocadas. */
    async desconectar() {
      token = null; expiraEm = 0;
      try {
        await fetchImpl('/api/account/delete', { method: 'POST', credentials: 'same-origin' });
      } catch { /* offline: a sessão local sai de qualquer jeito; o registro apaga na próxima */ }
    },
  };
}
