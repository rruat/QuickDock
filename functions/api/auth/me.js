// GET /api/auth/me — quem está logado (ou { logado: false }). Também serve de "o servidor existe?":
// o app usa a resposta JSON desta rota para decidir se oferece o login próprio.
import { exigirConfig } from '../../_lib/config.js';
import { json } from '../../_lib/http.js';
import { lerSessao } from '../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const falha = exigirConfig(env);
  if (falha) return json({ logado: false, disponivel: false, faltando: (await falha.json()).faltando });

  const s = await lerSessao(env, request);
  if (!s) return json({ logado: false, disponivel: true });
  return json({ logado: true, disponivel: true, usuario: s.usuario }, 200, s.setCookie ? { 'Set-Cookie': s.setCookie } : {});
}
