// ── google.js ───────────────────────────────────────────────────────────────
// Conversa do servidor com o Google (OAuth 2.0, fluxo de código). O servidor existe para uma
// coisa: guardar o refresh token que o PWA sozinho não consegue (não tem onde esconder o
// client secret). O acesso aos arquivos continua sendo direto do navegador para o Drive.

export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';

export const redirectUri = url => `${new URL(url).origin}/api/auth/callback`;

export function urlDeLogin({ clientId, redirect, state, challenge }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: `openid email profile ${ESCOPO_DRIVE}`,
    access_type: 'offline',          // pede o refresh token
    prompt: 'consent',               // sem isto o Google só entrega refresh token na 1ª vez
    include_granted_scopes: 'false',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH}?${p}`;
}

async function pedirToken(params, fetchImpl = fetch) {
  const resp = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const corpo = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, corpo };
}

export function trocarCodigo({ clientId, clientSecret, redirect, code, verifier }, fetchImpl) {
  return pedirToken({
    grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirect, code_verifier: verifier,
  }, fetchImpl);
}

export function renovarAcesso({ clientId, clientSecret, refreshToken }, fetchImpl) {
  return pedirToken({
    grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret,
  }, fetchImpl);
}

export async function revogar(token, fetchImpl = fetch) {
  try {
    await fetchImpl(REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch { /* sem rede: o registro local é apagado de qualquer jeito */ }
}

/**
 * Lê o id_token vindo DIRETO do endpoint do Google, por TLS, na troca do código: nesse caminho
 * o OIDC dispensa verificar a assinatura. NUNCA usar para um token que veio do navegador.
 */
export function lerIdToken(idToken, clientId) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) throw new Error('id_token inválido');
  const b = partes[1].replace(/-/g, '+').replace(/_/g, '/');
  const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), c => c.charCodeAt(0))));
  if (claims.aud !== clientId) throw new Error('id_token de outro cliente');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) throw new Error('id_token de emissor desconhecido');
  if (!claims.sub) throw new Error('id_token sem sub');
  return claims;
}

export const concedeuDrive = escopo => String(escopo || '').split(' ').includes(ESCOPO_DRIVE);
