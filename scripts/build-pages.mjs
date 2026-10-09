// ── build-pages.mjs ─────────────────────────────────────────────────────────
// Monta a pasta `dist-pages/` com SÓ o que vai para o site no Cloudflare Pages. O Pages não lê o
// .assetsignore (isso é do Workers), então a seleção é feita aqui. Usado pelo GitHub Actions
// (.github/workflows/deploy-pages.yml) e à mão: `npm run build:pages`.
// Uso: node scripts/build-pages.mjs [pasta-de-saida]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'dist-pages');

// Fora do site: controle de versão, desenvolvimento, documentação, configuração de deploy
const SKIP_DIRS = new Set(['.git', '.github', '.claude', '.wrangler', 'node_modules', 'test', 'docs', 'scripts', 'worker', 'dist-pages']);
const SKIP_FILES = new Set([
  'CLAUDE.md', 'Dockerfile', 'package.json', 'package-lock.json', 'server.mjs', 'wrangler.jsonc',
  '.assetsignore', '.gitignore', '.gitattributes', '.dockerignore', '.nojekyll',
]);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// cpSync não copia uma pasta para dentro dela mesma: copia cada item da raiz separadamente
let count = 0;
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  const src = path.join(root, entry.name);
  if (src === out || (entry.isDirectory() ? SKIP_DIRS : SKIP_FILES).has(entry.name)) continue;
  fs.cpSync(src, path.join(out, entry.name), {
    recursive: true,
    filter: p => { if (fs.statSync(p).isFile()) count++; return true; },
  });
}

console.log(`✓ ${count} arquivos em ${path.relative(root, out) || out}`);
