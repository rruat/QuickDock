// ── session.js ──────────────────────────────────────────────────────────────
// Sessão longa no D1. O cookie leva um token aleatório; o banco guarda só o hash dele. A sessão é
// "deslizante": quem usa o app de vez em quando nunca precisa entrar de novo, e quem some por
// 180 dias volta ao login.

import { randomToken, sha256Hex } from './crypto.js';
import { COOKIE_SESSAO, lerCookies, montarCookie } from './http.js';

export const DURACAO_SESSAO_S = 180 * 24 * 3600;
const RENOVAR_APOS_S = 24 * 3600;   // regrava a validade no máximo 1x por dia (poupa escrita no D1)

const agora = () => Math.floor(Date.now() / 1000);

export async function criarSessao(env, userId, userAgent = '') {
  const token = randomToken(32);
  const t = agora();
  await env.DB.prepare(
    'INSERT INTO sessions (id_hash, user_id, created_at, last_used_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(await sha256Hex(token), userId, t, t, t + DURACAO_SESSAO_S, String(userAgent).slice(0, 200)).run();
  return { token, cookie: montarCookie(COOKIE_SESSAO, token, { maxAge: DURACAO_SESSAO_S }) };
}

/**
 * Sessão da requisição, ou null. Devolve também `setCookie` quando a validade foi renovada, para
 * quem responder anexar ao Set-Cookie.
 */
export async function lerSessao(env, request) {
  const token = lerCookies(request)[COOKIE_SESSAO];
  if (!token) return null;
  const hash = await sha256Hex(token);
  const t = agora();
  const row = await env.DB.prepare(
    `SELECT s.id_hash, s.user_id, s.last_used_at, s.expires_at, u.google_sub, u.email, u.name, u.picture
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`
  ).bind(hash).first();
  if (!row || row.expires_at <= t) {
    if (row) await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hash).run();
    return null;
  }
  let setCookie = null;
  if (t - row.last_used_at > RENOVAR_APOS_S) {
    await env.DB.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id_hash = ?')
      .bind(t, t + DURACAO_SESSAO_S, hash).run();
    setCookie = montarCookie(COOKIE_SESSAO, token, { maxAge: DURACAO_SESSAO_S });
  }
  return {
    hash, userId: row.user_id, setCookie,
    usuario: { email: row.email, nome: row.name, foto: row.picture },
  };
}

export async function apagarSessao(env, hash) {
  await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hash).run();
}

/** Limpeza oportunista: roda no login, que é raro, em vez de exigir um agendador. */
export async function limparSessoesVencidas(env) {
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(agora()).run();
}
