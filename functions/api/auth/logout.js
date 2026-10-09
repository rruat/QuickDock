// POST /api/auth/logout — sai SÓ deste aparelho (a sessão daqui). O acesso ao Drive e os outros
// aparelhos continuam; para cortar tudo, /api/account/delete.
import { exigirConfig } from '../../_lib/config.js';
import { COOKIE_SESSAO, apagarCookie, json, mesmaOrigem } from '../../_lib/http.js';
import { apagarSessao, lerSessao } from '../../_lib/session.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'origem_invalida' }, 403);
  const falha = exigirConfig(env);
  if (falha) return falha;

  const s = await lerSessao(env, request);
  if (s) await apagarSessao(env, s.hash);
  return json({ ok: true }, 200, { 'Set-Cookie': apagarCookie(COOKIE_SESSAO) });
}
