// ── crypto.js ───────────────────────────────────────────────────────────────
// Primitivas do servidor com Web Crypto (roda no Cloudflare e no Node, para os testes).
// Nada aqui guarda estado: chave e dados entram por parâmetro.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64uEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/** Token aleatório (padrão 32 bytes = 256 bits), em base64url. */
export function randomToken(bytes = 32) {
  return b64uEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** SHA-256 em hexadecimal. A sessão é guardada só como hash: o banco sozinho não permite entrar. */
export async function sha256Hex(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Challenge do PKCE (S256) a partir do verifier. */
export async function pkceChallenge(verifier) {
  return b64uEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}

async function importKey(chaveB64) {
  const raw = b64uDecode(chaveB64);
  if (raw.length !== 32) throw new Error('TOKEN_ENC_KEY precisa ter 32 bytes (base64url).');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Cifra com AES-256-GCM. Formato: `v1.<iv>.<cifra+tag>` (base64url). `contexto` entra como dado
 * autenticado: um token cifrado para o usuário 1 não decifra se for copiado para a linha do 2.
 */
export async function encrypt(texto, chaveB64, contexto = '') {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(chaveB64);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(contexto) }, key, enc.encode(texto)));
  return `v1.${b64uEncode(iv)}.${b64uEncode(ct)}`;
}

export async function decrypt(pacote, chaveB64, contexto = '') {
  const [v, iv, ct] = String(pacote).split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('formato de token cifrado desconhecido');
  const key = await importKey(chaveB64);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64uDecode(iv), additionalData: enc.encode(contexto) }, key, b64uDecode(ct));
  return dec.decode(pt);
}
