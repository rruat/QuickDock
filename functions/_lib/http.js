// ── http.js ─────────────────────────────────────────────────────────────────
// Respostas, cookies e a checagem de origem das rotas da API.

export const COOKIE_SESSAO = '__Host-qd_session';
export const COOKIE_OAUTH = '__Host-qd_oauth';

const HEADERS_API = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(corpo, status = 200, extra = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...HEADERS_API, ...extra },
  });
}

export function redirect(destino, extra = {}) {
  return new Response(null, { status: 302, headers: { Location: destino, ...HEADERS_API, ...extra } });
}

export function lerCookies(request) {
  const out = {};
  for (const par of (request.headers.get('Cookie') || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}

/** `__Host-` exige Secure, Path=/ e nenhum Domain: o cookie fica preso a este endereço. */
export function montarCookie(nome, valor, { maxAge = null, sameSite = 'Lax' } = {}) {
  const partes = [`${nome}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'Secure', `SameSite=${sameSite}`];
  if (maxAge !== null) partes.push(`Max-Age=${Math.floor(maxAge)}`);
  return partes.join('; ');
}

export const apagarCookie = nome => montarCookie(nome, '', { maxAge: 0 });

/**
 * Defesa contra requisição forjada em POST: o navegador sempre manda `Origin` em POST com
 * `fetch`, e ele tem que ser o do próprio site. (O cookie também é SameSite=Lax.)
 */
export function mesmaOrigem(request) {
  const origem = request.headers.get('Origin');
  return !!origem && origem === new URL(request.url).origin;
}

/** Só caminhos do próprio site: nunca `//outro.com` nem `https://...` (redirecionamento aberto). */
export function caminhoSeguro(valor, padrao = '/') {
  if (typeof valor !== 'string' || !valor.startsWith('/') || valor.startsWith('//') || valor.includes('\\')) return padrao;
  return valor;
}
