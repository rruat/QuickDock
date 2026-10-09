// POST /api/drive/token — entrega um access token do Drive novo (vale ~1h) a quem tem sessão.
// É isto que acaba com o "relogar sempre": o refresh token fica aqui, o navegador só recebe o
// token curto e fala direto com o Drive.
import { exigirConfig } from '../../_lib/config.js';
import { decrypt } from '../../_lib/crypto.js';
import { json, mesmaOrigem } from '../../_lib/http.js';
import { renovarAcesso } from '../../_lib/google.js';
import { lerSessao } from '../../_lib/session.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'origem_invalida' }, 403);
  const falha = exigirConfig(env);
  if (falha) return falha;

  const s = await lerSessao(env, request);
  if (!s) return json({ erro: 'sem_sessao' }, 401);
  const extra = s.setCookie ? { 'Set-Cookie': s.setCookie } : {};

  const row = await env.DB.prepare('SELECT refresh_token_enc FROM drive_tokens WHERE user_id = ?').bind(s.userId).first();
  if (!row) return json({ erro: 'reautorizar' }, 401, extra);

  let refreshToken;
  try { refreshToken = await decrypt(row.refresh_token_enc, env.TOKEN_ENC_KEY, `user:${s.userId}`); }
  catch { return json({ erro: 'reautorizar' }, 401, extra); }   // chave trocada ou linha adulterada

  const r = await renovarAcesso({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken });
  if (!r.ok) {
    // invalid_grant: a pessoa revogou o acesso na conta Google (ou o token expirou): sem volta
    if (r.corpo?.error === 'invalid_grant') {
      await env.DB.prepare('DELETE FROM drive_tokens WHERE user_id = ?').bind(s.userId).run();
      return json({ erro: 'reautorizar' }, 401, extra);
    }
    return json({ erro: 'google_indisponivel' }, 502, extra);   // falha passada: tenta de novo depois
  }
  return json({ access_token: r.corpo.access_token, expires_in: r.corpo.expires_in ?? 3600 }, 200, extra);
}
