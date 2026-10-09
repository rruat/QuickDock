// GET /api/auth/login?return=/caminho — começa o login com o Google.
import { exigirConfig } from '../../_lib/config.js';
import { randomToken, pkceChallenge } from '../../_lib/crypto.js';
import { COOKIE_OAUTH, caminhoSeguro, montarCookie, redirect } from '../../_lib/http.js';
import { redirectUri, urlDeLogin } from '../../_lib/google.js';

export async function onRequestGet({ request, env }) {
  const falha = exigirConfig(env);
  if (falha) return falha;

  const url = new URL(request.url);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const volta = caminhoSeguro(url.searchParams.get('return'));

  // state e verifier só precisam voltar junto com o navegador que começou o login: cookie curto
  const cookie = montarCookie(COOKIE_OAUTH, JSON.stringify({ state, verifier, volta }), { maxAge: 600 });
  return redirect(urlDeLogin({
    clientId: env.GOOGLE_CLIENT_ID,
    redirect: redirectUri(request.url),
    state,
    challenge: await pkceChallenge(verifier),
  }), { 'Set-Cookie': cookie });
}
