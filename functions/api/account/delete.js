// POST /api/account/delete — apaga TUDO que o servidor tem da pessoa (usuário, sessões, token) e
// revoga o acesso ao Drive no Google. As notas não são tocadas: estão no Drive dela.
import { exigirConfig } from '../../_lib/config.js';
import { decrypt } from '../../_lib/crypto.js';
import { COOKIE_SESSAO, apagarCookie, json, mesmaOrigem } from '../../_lib/http.js';
import { revogar } from '../../_lib/google.js';
import { lerSessao } from '../../_lib/session.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'origem_invalida' }, 403);
  const falha = exigirConfig(env);
  if (falha) return falha;

  const s = await lerSessao(env, request);
  if (!s) return json({ erro: 'sem_sessao' }, 401);

  const row = await env.DB.prepare('SELECT refresh_token_enc FROM drive_tokens WHERE user_id = ?').bind(s.userId).first();
  if (row) {
    try { await revogar(await decrypt(row.refresh_token_enc, env.TOKEN_ENC_KEY, `user:${s.userId}`)); }
    catch { /* não decifrou: apaga mesmo assim, o objetivo é não guardar nada */ }
  }
  // sessions e drive_tokens saem em cascata
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(s.userId).run();
  return json({ ok: true }, 200, { 'Set-Cookie': apagarCookie(COOKIE_SESSAO) });
}
