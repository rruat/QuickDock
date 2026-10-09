// ── config.js ───────────────────────────────────────────────────────────────
// O que o servidor precisa do ambiente. Sem isto as rotas respondem 503 com a lista do que falta,
// em vez de quebrar no meio do login.
//   DB                    banco D1 (binding)
//   GOOGLE_CLIENT_ID      id do cliente OAuth "Aplicativo da Web" (variável pública)
//   GOOGLE_CLIENT_SECRET  segredo desse cliente            (segredo)
//   TOKEN_ENC_KEY         32 bytes em base64url, cifra os refresh tokens (segredo)

import { json } from './http.js';

export function faltando(env) {
  return ['DB', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENC_KEY'].filter(k => !env?.[k]);
}

/** Resposta 503 se a configuração estiver incompleta; null se estiver tudo no lugar. */
export function exigirConfig(env) {
  const f = faltando(env);
  return f.length ? json({ erro: 'nao_configurado', faltando: f }, 503) : null;
}
