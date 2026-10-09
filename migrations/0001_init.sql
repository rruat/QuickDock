-- QuickDock · D1 · 0001
-- O banco guarda SÓ quem entrou e o necessário para não pedir login de novo. As notas ficam no
-- Google Drive de cada pessoa; nada delas passa por aqui.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub    TEXT    NOT NULL UNIQUE,   -- identificador estável da conta Google
  email         TEXT,
  name          TEXT,
  picture       TEXT,
  created_at    INTEGER NOT NULL,          -- segundos Unix
  last_login_at INTEGER NOT NULL
);

-- Sessão longa. `id_hash` é o SHA-256 do token do cookie: vazar o banco não permite entrar.
CREATE TABLE sessions (
  id_hash      TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  user_agent   TEXT
);
CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Refresh token do Google, cifrado (AES-256-GCM, chave em segredo do Cloudflare, não no banco).
CREATE TABLE drive_tokens (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_enc TEXT    NOT NULL,
  scope             TEXT,
  updated_at        INTEGER NOT NULL
);
