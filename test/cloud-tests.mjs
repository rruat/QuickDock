// Testes do login hospedado: primitivas de cripto, rotas da API (functions/) de ponta a ponta com um
// D1 de mentira (SQLite em memória rodando a migração REAL) e um Google falso, e o provedor de
// token do app. Nada aqui toca a rede nem o Cloudflare.
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

// D1 mínimo em cima do SQLite do Node: prepare().bind().run()/first()/all()
function criarD1(sql) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(sql);
  return {
    _db: db,
    prepare(q) {
      const stmt = db.prepare(q);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async run() { stmt.run(...args); return { success: true }; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
      };
      return api;
    },
  };
}

const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeIdToken = (extra = {}) =>
  `${b64u({ alg: 'none' })}.${b64u({ iss: 'https://accounts.google.com', aud: 'cid', sub: 'sub-1', email: 'a@b.com', name: 'Ana', picture: 'http://x/p.png', ...extra })}.sig`;

export async function runCloudTests({ ok, igual }) {
  const cripto = await import('../functions/_lib/crypto.js');
  const http = await import('../functions/_lib/http.js');
  const google = await import('../functions/_lib/google.js');

  // ── Cripto ──
  const chave = cripto.randomToken(32);
  const cifrado = await cripto.encrypt('refresh-secreto', chave, 'user:1');
  ok('nuvem · o token cifrado não contém o texto original', !cifrado.includes('refresh-secreto') && cifrado.startsWith('v1.'));
  igual('nuvem · decifra de volta com a mesma chave e contexto', await cripto.decrypt(cifrado, chave, 'user:1'), 'refresh-secreto');
  const falha = async fn => { try { await fn(); return false; } catch { return true; } };
  ok('nuvem · outro usuário (contexto) não decifra o token copiado', await falha(() => cripto.decrypt(cifrado, chave, 'user:2')));
  ok('nuvem · chave errada não decifra', await falha(() => cripto.decrypt(cifrado, cripto.randomToken(32), 'user:1')));
  ok('nuvem · pacote adulterado é recusado', await falha(() => cripto.decrypt(cifrado.slice(0, -4) + 'AAAA', chave, 'user:1')));
  const chaveComQuebra = `${chave}\r\n`;   // como um terminal do Windows grava o segredo
  igual('nuvem · chave gravada com quebra de linha no fim ainda funciona', await cripto.decrypt(await cripto.encrypt('x', chaveComQuebra, 'u'), chave, 'u'), 'x');
  ok('nuvem · chave de tamanho errado é recusada', await falha(() => cripto.encrypt('x', cripto.randomToken(16))));
  igual('nuvem · PKCE confere com o vetor do RFC 7636', await cripto.pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  igual('nuvem · SHA-256 conhecido', await cripto.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  ok('nuvem · tokens aleatórios não repetem', cripto.randomToken() !== cripto.randomToken());

  // ── HTTP ──
  igual('nuvem · caminho seguro aceita caminho do site', http.caminhoSeguro('/notas?x=1'), '/notas?x=1');
  igual('nuvem · caminho seguro recusa //outro.com', http.caminhoSeguro('//evil.com'), '/');
  igual('nuvem · caminho seguro recusa URL absoluta', http.caminhoSeguro('https://evil.com'), '/');
  igual('nuvem · caminho seguro recusa barra invertida', http.caminhoSeguro('/\\evil.com'), '/');
  const cookie = http.montarCookie('__Host-x', 'a b', { maxAge: 60 });
  ok('nuvem · cookie é HttpOnly, Secure, SameSite e Path=/ (sem Domain)', ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=60'].every(p => cookie.includes(p)) && !cookie.includes('Domain'));
  igual('nuvem · lê cookies da requisição', http.lerCookies(new Request('https://q.dev/', { headers: { Cookie: 'a=1; __Host-x=a%20b' } })), { a: '1', '__Host-x': 'a b' });
  ok('nuvem · POST sem Origin é recusado', !http.mesmaOrigem(new Request('https://q.dev/api', { method: 'POST' })));
  ok('nuvem · POST de outra origem é recusado', !http.mesmaOrigem(new Request('https://q.dev/api', { method: 'POST', headers: { Origin: 'https://evil.com' } })));
  ok('nuvem · POST da mesma origem passa', http.mesmaOrigem(new Request('https://q.dev/api', { method: 'POST', headers: { Origin: 'https://q.dev' } })));

  // ── Google ──
  const u = new URL(google.urlDeLogin({ clientId: 'cid', redirect: 'https://q.dev/api/auth/callback', state: 'st', challenge: 'ch' }));
  igual('nuvem · login pede acesso offline (refresh token) e consentimento', [u.searchParams.get('access_type'), u.searchParams.get('prompt')], ['offline', 'consent']);
  ok('nuvem · login pede só drive.file, e-mail e perfil (nada de escopo restrito)', u.searchParams.get('scope') === 'openid email profile https://www.googleapis.com/auth/drive.file');
  igual('nuvem · login usa PKCE S256', [u.searchParams.get('code_challenge'), u.searchParams.get('code_challenge_method')], ['ch', 'S256']);
  igual('nuvem · id_token válido é lido', google.lerIdToken(fakeIdToken(), 'cid').email, 'a@b.com');
  ok('nuvem · id_token de outro cliente é recusado', await falha(async () => google.lerIdToken(fakeIdToken({ aud: 'outro' }), 'cid')));
  ok('nuvem · id_token de outro emissor é recusado', await falha(async () => google.lerIdToken(fakeIdToken({ iss: 'https://evil.com' }), 'cid')));
  ok('nuvem · sem permissão do Drive é detectado', !google.concedeuDrive('openid email') && google.concedeuDrive('openid https://www.googleapis.com/auth/drive.file'));

  // ── Rotas, de ponta a ponta ──
  const sql = await readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  const env = { DB: criarD1(sql), GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', TOKEN_ENC_KEY: cripto.randomToken(32) };
  const rotas = {
    login: (await import('../functions/api/auth/login.js')).onRequestGet,
    callback: (await import('../functions/api/auth/callback.js')).onRequestGet,
    me: (await import('../functions/api/auth/me.js')).onRequestGet,
    logout: (await import('../functions/api/auth/logout.js')).onRequestPost,
    token: (await import('../functions/api/drive/token.js')).onRequestPost,
    apagar: (await import('../functions/api/account/delete.js')).onRequestPost,
  };
  const SITE = 'https://quickdock.test';
  const chamar = (rota, path, { method = 'GET', cookie = '', origin = true, e = env } = {}) => {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (origin && method === 'POST') headers.Origin = SITE;
    return rota({ request: new Request(SITE + path, { method, headers }), env: e });
  };
  const cookiesDe = r => r.headers.getSetCookie().map(c => c.split(';')[0]);

  // Google falso: troca de código e renovação
  let google_resposta = null;
  const chamadasGoogle = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const alvo = String(url);
    const corpo = init?.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};
    chamadasGoogle.push({ alvo, corpo });
    if (alvo.includes('/token')) return new Response(JSON.stringify(google_resposta(corpo)), { status: google_resposta(corpo).error ? 400 : 200 });
    return new Response('{}', { status: 200 });   // revoke
  };

  try {
    // Sem configuração
    const semCfg = await chamar(rotas.login, '/api/auth/login', { e: { DB: env.DB } });
    igual('nuvem · sem segredos configurados a API responde 503 e diz o que falta', [semCfg.status, (await semCfg.json()).faltando], [503, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENC_KEY']]);
    const meSemCfg = await (await chamar(rotas.me, '/api/auth/me', { e: { DB: env.DB } })).json();
    ok('nuvem · /me sem configuração diz "indisponível" (o app usa o caminho antigo)', meSemCfg.disponivel === false);

    // Sem sessão
    const meAnon = await (await chamar(rotas.me, '/api/auth/me')).json();
    igual('nuvem · /me sem sessão: disponível mas não logado', [meAnon.logado, meAnon.disponivel], [false, true]);
    igual('nuvem · token sem sessão é 401', (await chamar(rotas.token, '/api/drive/token', { method: 'POST' })).status, 401);
    igual('nuvem · token sem Origin é 403 (requisição forjada)', (await chamar(rotas.token, '/api/drive/token', { method: 'POST', origin: false })).status, 403);

    // Login: redireciona para o Google e guarda state/verifier no cookie
    const login = await chamar(rotas.login, '/api/auth/login?return=/notas');
    const locLogin = new URL(login.headers.get('Location'));
    ok('nuvem · /login redireciona para o Google com state e PKCE', login.status === 302 && locLogin.host === 'accounts.google.com' && locLogin.searchParams.get('state') && locLogin.searchParams.get('code_challenge'));
    ok('nuvem · o redirect_uri do login é o do próprio site', locLogin.searchParams.get('redirect_uri') === `${SITE}/api/auth/callback`);
    const cookieOauth = cookiesDe(login).find(c => c.startsWith('__Host-qd_oauth='));
    const state = locLogin.searchParams.get('state');

    // Callback com state errado
    const errado = await chamar(rotas.callback, `/api/auth/callback?code=c&state=falso`, { cookie: cookieOauth });
    ok('nuvem · callback com state diferente é recusado', errado.status === 302 && errado.headers.get('Location').includes('login_erro=estado_invalido'));
    const semCookie = await chamar(rotas.callback, `/api/auth/callback?code=c&state=${state}`);
    ok('nuvem · callback sem o cookie do login é recusado', semCookie.headers.get('Location').includes('login_erro=sessao_expirada'));

    // Callback sem permissão do Drive
    google_resposta = () => ({ access_token: 'at', refresh_token: 'rt-1', id_token: fakeIdToken(), scope: 'openid email profile' });
    const semDrive = await chamar(rotas.callback, `/api/auth/callback?code=c&state=${state}`, { cookie: cookieOauth });
    ok('nuvem · quem desmarca o Drive na tela do Google volta com aviso e sem sessão', semDrive.headers.get('Location').includes('login_erro=sem_drive') && !cookiesDe(semDrive).some(c => c.startsWith('__Host-qd_session=') && c.length > 20));

    // Segredo errado no servidor: o motivo exato volta na URL (para o painel explicar), sem vazar valores
    google_resposta = () => ({ error: 'invalid_client' });
    const segredoErrado = await chamar(rotas.callback, `/api/auth/callback?code=c&state=${state}`, { cookie: cookieOauth });
    const locErro = segredoErrado.headers.get('Location');
    ok('nuvem · troca recusada pelo Google volta com o código do erro (invalid_client)', locErro.includes('login_erro=troca_falhou') && locErro.includes('detalhe=invalid_client') && !locErro.includes('csecret'));

    // Callback certo
    google_resposta = () => ({ access_token: 'at', refresh_token: 'rt-1', id_token: fakeIdToken(), scope: 'openid email profile https://www.googleapis.com/auth/drive.file' });
    const certo = await chamar(rotas.callback, `/api/auth/callback?code=c&state=${state}`, { cookie: cookieOauth });
    const trocada = chamadasGoogle.filter(c => c.alvo.includes('/token')).pop().corpo;
    igual('nuvem · a troca de código manda client_secret e o verifier do PKCE', [trocada.client_secret, !!trocada.code_verifier, trocada.grant_type], ['csecret', true, 'authorization_code']);
    igual('nuvem · callback volta para o caminho pedido', certo.headers.get('Location'), '/notas');
    const cookieSessao = cookiesDe(certo).find(c => c.startsWith('__Host-qd_session='));
    ok('nuvem · callback cria o cookie de sessão', !!cookieSessao && cookieSessao.length > 40);

    // O que foi parar no banco
    const linhaToken = env.DB._db.prepare('SELECT refresh_token_enc FROM drive_tokens').get();
    ok('nuvem · o refresh token vai cifrado para o banco (nunca em texto)', linhaToken.refresh_token_enc.startsWith('v1.') && !linhaToken.refresh_token_enc.includes('rt-1'));
    const linhaSessao = env.DB._db.prepare('SELECT id_hash FROM sessions').get();
    ok('nuvem · a sessão é guardada só como hash (o token do cookie não está no banco)', linhaSessao.id_hash.length === 64 && !cookieSessao.includes(linhaSessao.id_hash));
    igual('nuvem · um usuário criado a partir do id_token', env.DB._db.prepare('SELECT email, name FROM users').get(), { email: 'a@b.com', name: 'Ana' });

    // Chave de criptografia inválida no servidor: não pode virar "Error 1101" — volta ao app com o motivo
    const envRuim = { ...env, TOKEN_ENC_KEY: 'curta' };
    const quebrou = await chamar(rotas.callback, `/api/auth/callback?code=c&state=${state}`, { cookie: cookieOauth, e: envRuim });
    ok('nuvem · exceção no callback volta ao app com erro_interno (sem tela 1101 nem vazar valores)', quebrou.status === 302 && quebrou.headers.get('Location').includes('login_erro=erro_interno') && !quebrou.headers.get('Location').includes('curta'));

    // Usar a sessão
    const meLogado = await (await chamar(rotas.me, '/api/auth/me', { cookie: cookieSessao })).json();
    igual('nuvem · /me com sessão devolve o usuário', [meLogado.logado, meLogado.usuario.email], [true, 'a@b.com']);

    google_resposta = corpo => ({ access_token: `novo-${corpo.refresh_token}`, expires_in: 3599 });
    const tk = await chamar(rotas.token, '/api/drive/token', { method: 'POST', cookie: cookieSessao });
    igual('nuvem · /drive/token renova com o refresh token decifrado e devolve só o access token', [tk.status, await tk.json()], [200, { access_token: 'novo-rt-1', expires_in: 3599 }]);

    // Sessão deslizante: uma sessão antiga é renovada ao usar
    env.DB._db.prepare('UPDATE sessions SET last_used_at = last_used_at - 172800, expires_at = expires_at - 172800').run();
    const renovada = await chamar(rotas.me, '/api/auth/me', { cookie: cookieSessao });
    ok('nuvem · sessão usada depois de 2 dias renova a validade e reenvia o cookie', cookiesDe(renovada).some(c => c.startsWith('__Host-qd_session=')));

    // Sessão vencida
    env.DB._db.prepare('UPDATE sessions SET expires_at = 1').run();
    igual('nuvem · sessão vencida vira 401 e é apagada', [(await chamar(rotas.token, '/api/drive/token', { method: 'POST', cookie: cookieSessao })).status, env.DB._db.prepare('SELECT COUNT(*) n FROM sessions').get().n], [401, 0]);

    // Novo login (outro aparelho) e revogação pelo Google
    google_resposta = () => ({ access_token: 'at', refresh_token: 'rt-2', id_token: fakeIdToken(), scope: 'openid email profile https://www.googleapis.com/auth/drive.file' });
    const login2 = await chamar(rotas.login, '/api/auth/login');
    const c2 = await chamar(rotas.callback, `/api/auth/callback?code=c&state=${new URL(login2.headers.get('Location')).searchParams.get('state')}`, { cookie: cookiesDe(login2).find(c => c.startsWith('__Host-qd_oauth=')) });
    const sessao2 = cookiesDe(c2).find(c => c.startsWith('__Host-qd_session='));
    ok('nuvem · entrar de novo reaproveita o mesmo usuário (sem duplicar)', env.DB._db.prepare('SELECT COUNT(*) n FROM users').get().n === 1);
    google_resposta = () => ({ error: 'invalid_grant' });
    const rev = await chamar(rotas.token, '/api/drive/token', { method: 'POST', cookie: sessao2 });
    igual('nuvem · acesso revogado no Google vira "reautorizar" e apaga o token guardado', [rev.status, (await rev.json()).erro, env.DB._db.prepare('SELECT COUNT(*) n FROM drive_tokens').get().n], [401, 'reautorizar', 0]);

    // Sair deste aparelho
    const sair = await chamar(rotas.logout, '/api/auth/logout', { method: 'POST', cookie: sessao2 });
    ok('nuvem · sair apaga a sessão e limpa o cookie', sair.status === 200 && env.DB._db.prepare('SELECT COUNT(*) n FROM sessions').get().n === 0 && cookiesDe(sair).some(c => c === '__Host-qd_session='));

    // Apagar a conta: tudo do servidor some e o acesso é revogado no Google
    google_resposta = () => ({ access_token: 'at', refresh_token: 'rt-3', id_token: fakeIdToken(), scope: 'openid email profile https://www.googleapis.com/auth/drive.file' });
    const l3 = await chamar(rotas.login, '/api/auth/login');
    const c3 = await chamar(rotas.callback, `/api/auth/callback?code=c&state=${new URL(l3.headers.get('Location')).searchParams.get('state')}`, { cookie: cookiesDe(l3).find(c => c.startsWith('__Host-qd_oauth=')) });
    const sessao3 = cookiesDe(c3).find(c => c.startsWith('__Host-qd_session='));
    const antes = chamadasGoogle.length;
    const del = await chamar(rotas.apagar, '/api/account/delete', { method: 'POST', cookie: sessao3 });
    const contagens = ['users', 'sessions', 'drive_tokens'].map(t => env.DB._db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
    igual('nuvem · apagar a conta remove usuário, sessões e token do banco', [del.status, contagens], [200, [0, 0, 0]]);
    const revogou = chamadasGoogle.slice(antes).find(c => c.alvo.includes('/revoke'));
    igual('nuvem · apagar a conta revoga o acesso no Google (com o token decifrado)', revogou?.corpo.token, 'rt-3');
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  // ── Provedor de token do app ──
  const { criarProvedorDeTokenNuvem, consultarNuvem, SessaoExpiradaError } = await import('../sidepanel/modules/cloud-session.js');
  globalThis.location ??= { pathname: '/', search: '' };
  let pedidos = 0;
  const fetchFake = async (url, init) => {
    pedidos++;
    return new Response(JSON.stringify({ access_token: `t${pedidos}`, expires_in: 3600 }), { status: 200 });
  };
  const prov = criarProvedorDeTokenNuvem({ fetchImpl: fetchFake, irPara: () => {} });
  igual('app · pede o token ao servidor na primeira vez', await prov.obterToken(), 't1');
  igual('app · reaproveita o token válido (não bate no servidor de novo)', [await prov.obterToken(), pedidos], ['t1', 1]);
  igual('app · renovar força um token novo', await prov.renovar(), 't2');
  ok('app · o provedor da nuvem avisa que conectar é redirecionamento', prov.redireciona === true);

  const prov401 = criarProvedorDeTokenNuvem({ fetchImpl: async () => new Response('{"erro":"reautorizar"}', { status: 401 }) });
  let erro = null;
  try { await prov401.obterToken(); } catch (e) { erro = e; }
  ok('app · 401 do servidor vira SessaoExpiradaError com o motivo', erro instanceof SessaoExpiradaError && erro.motivo === 'reautorizar');
  let erro502 = null;
  try { await criarProvedorDeTokenNuvem({ fetchImpl: async () => new Response('', { status: 502 }) }).obterToken(); } catch (e) { erro502 = e; }
  ok('app · falha do servidor (5xx) NÃO é tratada como sessão expirada', erro502 && !(erro502 instanceof SessaoExpiradaError));

  igual('app · sem API (resposta HTML) o app usa o caminho antigo', await consultarNuvem(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })), null);
  igual('app · 404 da API estática também', await consultarNuvem(async () => new Response('', { status: 404 })), null);
  igual('app · rede fora também', await consultarNuvem(async () => { throw new Error('offline'); }), null);
  igual('app · servidor não configurado não conta como disponível', await consultarNuvem(async () => new Response('{"logado":false,"disponivel":false}', { status: 200, headers: { 'content-type': 'application/json' } })), null);
  igual('app · servidor configurado é disponível', (await consultarNuvem(async () => new Response('{"logado":false,"disponivel":true}', { status: 200, headers: { 'content-type': 'application/json' } }))).disponivel, true);

  // ── Ligações no código ──
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  ok('nuvem · o Service Worker não faz cache da API', sw.includes("startsWith('/api/')"));
  ok('nuvem · cloud-session.js está no pré-cache', sw.includes('sidepanel/modules/cloud-session.js'));
  const sc = await readFile(new URL('../sidepanel/modules/sync-controller.js', import.meta.url), 'utf8');
  ok('nuvem · o controlador escolhe o provedor da nuvem fora da extensão', sc.includes('criarProvedorDeTokenNuvem') && sc.includes('this.usarNuvem'));
  const build = await readFile(new URL('../scripts/build-pages.mjs', import.meta.url), 'utf8');
  ok('nuvem · functions/ e migrations/ não vão para o site público', build.includes("'functions'") && build.includes("'migrations'"));
}
