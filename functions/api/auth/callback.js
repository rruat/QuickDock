// GET /api/auth/callback — o Google volta aqui com o código; vira usuário + sessão + refresh token.
import { exigirConfig } from '../../_lib/config.js';
import { encrypt } from '../../_lib/crypto.js';
import { COOKIE_OAUTH, apagarCookie, caminhoSeguro, lerCookies, redirect } from '../../_lib/http.js';
import { concedeuDrive, lerIdToken, redirectUri, trocarCodigo } from '../../_lib/google.js';
import { criarSessao, limparSessoesVencidas } from '../../_lib/session.js';

const agora = () => Math.floor(Date.now() / 1000);

// Volta ao app com um motivo na URL; a interface mostra o aviso e limpa o parâmetro.
// `detalhe` é o código de erro do Google (ex.: invalid_client), nunca um valor secreto.
const voltarComErro = (motivo, volta = '/', detalhe = '') => {
  console.log(`login_erro motivo=${motivo} detalhe=${detalhe || '-'}`);   // só o código; aparece em `pages deployment tail`
  return redirect(`${volta}${volta.includes('?') ? '&' : '?'}login_erro=${motivo}${/^[a-z_]{1,40}$/.test(detalhe) ? `&detalhe=${detalhe}` : ''}`,
    { 'Set-Cookie': apagarCookie(COOKIE_OAUTH) });
};

// Qualquer exceção vira um redirecionamento com o NOME do erro (nunca valores), em vez da tela
// "Error 1101" da Cloudflare, que não diz nada à pessoa.
export async function onRequestGet(ctx) {
  try {
    return await processar(ctx);
  } catch (e) {
    const nome = String(e?.name || 'erro').toLowerCase().replace(/[^a-z]+/g, '_').slice(0, 40);
    console.log(`login_excecao nome=${nome} mensagem=${String(e?.message || '').slice(0, 120)}`);
    return voltarComErro('erro_interno', '/', nome);
  }
}

async function processar({ request, env }) {
  const falha = exigirConfig(env);
  if (falha) return falha;

  const url = new URL(request.url);
  let guardado = null;
  try { guardado = JSON.parse(lerCookies(request)[COOKIE_OAUTH] || 'null'); } catch { /* cookie corrompido */ }
  if (!guardado?.state) return voltarComErro('sessao_expirada');
  const volta = caminhoSeguro(guardado.volta);

  if (url.searchParams.get('error')) return voltarComErro('negado', volta);        // a pessoa recusou
  if (url.searchParams.get('state') !== guardado.state) return voltarComErro('estado_invalido', volta);
  const code = url.searchParams.get('code');
  if (!code) return voltarComErro('sem_codigo', volta);

  const r = await trocarCodigo({
    clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirect: redirectUri(request.url), code, verifier: guardado.verifier,
  });
  if (!r.ok) return voltarComErro('troca_falhou', volta, r.corpo?.error);

  const { refresh_token: refresh, id_token: idToken, scope } = r.corpo;
  // A pessoa pode desmarcar a permissão do Drive na tela do Google: sem ela não há o que sincronizar
  if (!concedeuDrive(scope)) return voltarComErro('sem_drive', volta);

  let claims;
  try { claims = lerIdToken(idToken, env.GOOGLE_CLIENT_ID); } catch { return voltarComErro('token_invalido', volta); }

  const t = agora();
  await env.DB.prepare(
    `INSERT INTO users (google_sub, email, name, picture, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name,
       picture = excluded.picture, last_login_at = excluded.last_login_at`
  ).bind(claims.sub, claims.email ?? null, claims.name ?? null, claims.picture ?? null, t, t).run();
  const user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(claims.sub).first();

  // prompt=consent faz o Google mandar refresh token sempre; sem ele, mantém o que já existe
  if (refresh) {
    const cifrado = await encrypt(refresh, env.TOKEN_ENC_KEY, `user:${user.id}`);
    await env.DB.prepare(
      `INSERT INTO drive_tokens (user_id, refresh_token_enc, scope, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET refresh_token_enc = excluded.refresh_token_enc,
         scope = excluded.scope, updated_at = excluded.updated_at`
    ).bind(user.id, cifrado, scope ?? null, t).run();
  } else {
    const existe = await env.DB.prepare('SELECT 1 AS ok FROM drive_tokens WHERE user_id = ?').bind(user.id).first();
    if (!existe) return voltarComErro('sem_refresh', volta);
  }

  await limparSessoesVencidas(env);
  const sessao = await criarSessao(env, user.id, request.headers.get('User-Agent') || '');
  const headers = new Headers({ Location: volta, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', sessao.cookie);
  headers.append('Set-Cookie', apagarCookie(COOKIE_OAUTH));
  return new Response(null, { status: 302, headers });
}
