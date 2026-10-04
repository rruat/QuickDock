// ── code-highlighter.js ───────────────────────────────────────────────────
// Motor leve e rápido de destaque de sintaxe (syntax highlighting) para
// blocos de código e partes de código de programação, sem dependências externas.
// Suporta JavaScript/TypeScript, Python, HTML/XML, CSS, JSON, SQL, Bash/Shell,
// C/C++, Java, C#, Go, Rust, PHP e fallback universal com auto-detecção.

import { escHtml } from './blocks.js';

// Mapeamento de apelidos comuns para o identificador canônico da linguagem
export const LANG_ALIASES = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  pyw: 'python',
  html: 'html',
  htm: 'html',
  xml: 'html',
  svg: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  json: 'json',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'shell',
  powershell: 'shell',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  'c#': 'csharp',
  java: 'java',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  php: 'php',
  rb: 'ruby',
  ruby: 'ruby',
  md: 'markdown',
  markdown: 'markdown',
  jsonc: 'json',
  yml: 'shell',
  yaml: 'shell',
  shell: 'shell',
  terminal: 'shell',
  console: 'shell',
  cmd: 'shell',
  bat: 'shell',
  batch: 'shell',
  pwsh: 'shell',
  ps: 'shell',
  fish: 'shell',
  cli: 'shell',
  term: 'shell',
};

// Rótulos amigáveis para exibição no cabeçalho do bloco de código
export const LANG_DISPLAY = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  sql: 'SQL',
  shell: 'Terminal / Bash',
  bash: 'Bash',
  sh: 'Shell',
  zsh: 'Zsh',
  powershell: 'PowerShell',
  cmd: 'CMD',
  terminal: 'Terminal',
  console: 'Console',
  batch: 'Batch',
  bat: 'Batch',
  fish: 'Fish',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  markdown: 'Markdown',
};

export function normalizeLang(lang) {
  if (!lang || typeof lang !== 'string') return '';
  const clean = lang.trim().toLowerCase();
  return LANG_ALIASES[clean] || clean;
}

export function getLanguageDisplayName(lang) {
  if (!lang || typeof lang !== 'string') return '';
  const clean = lang.trim().toLowerCase();
  if (LANG_DISPLAY[clean]) return LANG_DISPLAY[clean];
  const norm = normalizeLang(clean);
  if (LANG_DISPLAY[norm]) return LANG_DISPLAY[norm];
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

// ── Regras de Tokenização por Linguagem ──────────────────────────────────────

const JS_RULES = [
  { type: 'tok-com', re: /\/\*[\s\S]*?(?:\*\/|$)/ },
  { type: 'tok-com', re: /\/\/[^\n]*/ },
  { type: 'tok-str', re: /`(?:\\[\s\S]|[^`\\])*`/ },
  { type: 'tok-str', re: /"(?:\\[\s\S]|[^"\\])*"/ },
  { type: 'tok-str', re: /'(?:\\[\s\S]|[^'\\])*'/ },
  { type: 'tok-num', re: /\b(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/ },
  { type: 'tok-lit', re: /\b(?:true|false|null|undefined|NaN|Infinity)\b/ },
  { type: 'tok-kw', re: /\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|get|if|import|in|instanceof|let|new|of|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|from|as)\b/ },
  { type: 'tok-type', re: /\b(?:type|interface|enum|implements|declare|namespace|any|unknown|never|void|string|number|boolean|symbol|bigint|object|Array|Object|Function|Promise|Set|Map|Date|RegExp|Math|JSON|console|window|document)\b/ },
  { type: 'tok-fn', re: /\b([a-zA-Z_$][\w$]*)(?=\s*\()/ },
  { type: 'tok-op', re: /=>|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|(?<!<)\/=|%=|&=|\|=|\^=|\?\.|\?\?|[-+*\/%&|^~!=<>?:]/ },
  { type: 'tok-punc', re: /[{}()\[\];,.]/ },
];

const PYTHON_RULES = [
  { type: 'tok-com', re: /#[^\n]*/ },
  { type: 'tok-str', re: /"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)/ },
  { type: 'tok-str', re: /[frbFRB]?"(?:\\[\s\S]|[^"\\])*"|[frbFRB]?'(?:\\[\s\S]|[^'\\])*'/ },
  { type: 'tok-kw', re: /@[a-zA-Z_]\w*/ },
  { type: 'tok-num', re: /\b(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/ },
  { type: 'tok-lit', re: /\b(?:True|False|None)\b/ },
  { type: 'tok-kw', re: /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/ },
  { type: 'tok-type', re: /\b(?:self|cls|int|float|str|list|dict|set|tuple|bool|bytes|object|print|len|range|enumerate|zip|isinstance|type|super|open|map|filter|sum|min|max|abs|round|id)\b/ },
  { type: 'tok-fn', re: /\b([a-zA-Z_]\w*)(?=\s*\()/ },
  { type: 'tok-op', re: /==|!=|<=|>=|\/\/|\*\*|\+=|-=|\*=|\/=|->|[-+*\/%&|^~!=<>:]/ },
  { type: 'tok-punc', re: /[{}()\[\],.;]/ },
];

const HTML_RULES = [
  { type: 'tok-com', re: /<!--[\s\S]*?(?:-->|$)/ },
  { type: 'tok-kw', re: /<!DOCTYPE[^>]*>/i },
  { type: 'tok-tag', re: /<\/?[a-zA-Z0-9:-]+/ },
  { type: 'tok-tag', re: /\/?>/ },
  { type: 'tok-attr', re: /\b[a-zA-Z0-9:-]+(?=\s*=)/ },
  { type: 'tok-str', re: /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/ },
  { type: 'tok-lit', re: /&[a-zA-Z0-9#]+;/ },
  { type: 'tok-op', re: /=/ },
];

const CSS_RULES = [
  { type: 'tok-com', re: /\/\*[\s\S]*?(?:\*\/|$)/ },
  { type: 'tok-str', re: /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/ },
  { type: 'tok-kw', re: /@[a-zA-Z-]+/ },
  { type: 'tok-prop', re: /\b[a-zA-Z-]+(?=\s*:)/ },
  { type: 'tok-num', re: /#[0-9a-fA-F]{3,8}\b/ },
  { type: 'tok-tag', re: /[#\.][a-zA-Z0-9_-]+/ },
  { type: 'tok-attr', re: /::?[a-zA-Z0-9_-]+/ },
  { type: 'tok-num', re: /\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr)?\b/ },
  { type: 'tok-lit', re: /!important/ },
  { type: 'tok-fn', re: /\b[a-zA-Z-]+(?=\s*\()/ },
  { type: 'tok-punc', re: /[{}();:,]/ },
];

const JSON_RULES = [
  { type: 'tok-prop', re: /"(?:\\[\s\S]|[^"\\])*"(?=\s*:)/ },
  { type: 'tok-str', re: /"(?:\\[\s\S]|[^"\\])*"/ },
  { type: 'tok-num', re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
  { type: 'tok-lit', re: /\b(?:true|false|null)\b/ },
  { type: 'tok-punc', re: /[{}()\[\],:]/ },
];

const SQL_RULES = [
  { type: 'tok-com', re: /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/ },
  { type: 'tok-str', re: /'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"/ },
  { type: 'tok-num', re: /\b\d+(?:\.\d+)?\b/ },
  { type: 'tok-kw', re: /\b(?:SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|ON|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|OFFSET|CREATE|TABLE|ALTER|DROP|INDEX|VIEW|DATABASE|SCHEMA|AND|OR|NOT|IN|LIKE|ILIKE|BETWEEN|IS|NULL|AS|UNION|ALL|EXISTS|CASE|WHEN|THEN|ELSE|END|DEFAULT|PRIMARY|KEY|FOREIGN|REFERENCES|CHECK|UNIQUE|VALUES|SET|DISTINCT|COUNT|SUM|AVG|MIN|MAX)\b/i },
  { type: 'tok-type', re: /\b(?:INT|INTEGER|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|VARCHAR|CHAR|TEXT|BLOB|BOOLEAN|DATE|TIME|DATETIME|TIMESTAMP|JSON)\b/i },
  { type: 'tok-op', re: /!=|<>|<=|>=|==|=|<|>|\+|-|\*|\// },
  { type: 'tok-punc', re: /[();,.]/ },
];

const SHELL_RULES = [
  // Prompts comuns de terminal: $, #, ❯, >, PS C:\path>, user@host:~$
  { type: 'tok-prompt', re: /(?<=^|\n)[ \t]*(?:\$|❯|>|#|PS [^>\n]+>|[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+:[^#$\n]*[$#])[ \t]*/ },
  // Comentários em scripts shell
  { type: 'tok-com', re: /#[^\n]*/ },
  // Strings
  { type: 'tok-str', re: /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/ },
  // Variáveis ($VAR, ${VAR}, $?, $1, $*, etc.)
  { type: 'tok-prop', re: /\$[a-zA-Z_]\w*|\$\{[^}]+\}|\$\d+|\$[?@*#$!]/ },
  // Flags e parâmetros CLI (--option, -p, -la, --name=app, etc.)
  { type: 'tok-attr', re: /--?[a-zA-Z0-9][a-zA-Z0-9_-]*(?:=[^\s"']*)?/ },
  // Palavras reservadas e controle de fluxo do shell
  { type: 'tok-kw', re: /\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|select|function|time|return|exit|export|local|declare|typeset|readonly|unset|set|shift|eval|exec|trap|source|alias|unalias)\b/ },
  // Comandos de terminal, ferramentas CLI, devops, utilitários e package managers
  { type: 'tok-kw', re: /\b(?:docker(?:-compose)?|podman|kubectl|helm|minikube|containerd|nerdctl|git|gh|svn|npm|npx|pnpm|yarn|bun|deno|node|ts-node|pip3?|python3?|poetry|cargo|rustc|rustup|go|dotnet|java|javac|mvn|gradle|ruby|gem|bundle|composer|php|apt(?:-get)?|dpkg|brew|pacman|yay|dnf|yum|apk|zypper|snap|flatpak|sudo|su|doas|systemctl|journalctl|service|crontab|curl|wget|ping|traceroute|netstat|ss|ssh|scp|sftp|rsync|echo|printf|cat|tac|head|tail|less|more|grep|egrep|fgrep|rg|sed|awk|cut|sort|uniq|wc|tr|tee|xargs|ls|ll|la|dir|cd|pwd|mkdir|rmdir|rm|cp|mv|touch|ln|find|which|where|whereis|chmod|chown|chgrp|tar|zip|unzip|gzip|gunzip|7z|kill|killall|pkill|ps|top|htop|clear|cls|reset|history|whoami|id|groups|env|printenv|date|sleep|watch|nohup|wait|Get-[a-zA-Z]+|Set-[a-zA-Z]+|New-[a-zA-Z]+|Remove-[a-zA-Z]+|Start-[a-zA-Z]+|Stop-[a-zA-Z]+|Invoke-[a-zA-Z]+|Write-Host|Test-[a-zA-Z]+)\b/ },
  // Subcomandos comuns em ferramentas CLI (ex.: docker run, git commit, npm install)
  { type: 'tok-fn', re: /\b(?:commit|push|pull|clone|checkout|branch|merge|rebase|stash|status|diff|log|fetch|remote|init|add|reset|install|build|run|start|test|serve|dev|publish|pack|exec|stop|restart|logs|images|compose|container|network|volume|create|delete|get|describe|apply|version|help|update|upgrade)\b/ },
  // Números e portas de rede
  { type: 'tok-num', re: /\b\d+(?:\.\d+)*\b/ },
  // Operadores, pipes, redirecionamentos e encadeamentos
  { type: 'tok-op', re: /\|\||&&|>>|2>&1|1>&2|>&|<<|<&|[-+*\/%&|^~!=<>?:;|=]|\|/ },
  // Parênteses e delimitadores
  { type: 'tok-punc', re: /[{}()\[\]]/ },
];

const GENERIC_RULES = [
  { type: 'tok-com', re: /\/\*[\s\S]*?(?:\*\/|$)|(?:\/\/|#)[^\n]*/ },
  { type: 'tok-str', re: /`(?:\\[\s\S]|[^`\\])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/ },
  { type: 'tok-num', re: /\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/ },
  { type: 'tok-lit', re: /\b(?:true|false|null|undefined|nil|True|False|None)\b/ },
  { type: 'tok-kw', re: /\b(?:function|fn|def|func|class|interface|type|struct|enum|impl|trait|mod|crate|defer|chan|return|if|else|elif|for|while|loop|match|switch|case|break|continue|let|var|const|val|mut|pub|public|private|protected|static|async|await|try|catch|finally|throw|raise|import|export|from|use|package|namespace)\b/ },
  { type: 'tok-type', re: /\b(?:int|float|double|bool|boolean|string|str|char|void|any|unknown|never|u8|u16|u32|u64|i8|i16|i32|i64|f32|f64|Self|self|this)\b/ },
  { type: 'tok-fn', re: /\b([a-zA-Z_]\w*)(?=\s*\()/ },
  { type: 'tok-op', re: /=>|->|===|!==|==|!=|<=|>=|&&|\|\||[-+*\/%&|^~!=<>?:=]/ },
  { type: 'tok-punc', re: /[{}()\[\],;.]/ },
];

const RULES_BY_LANG = {
  javascript: JS_RULES,
  typescript: JS_RULES,
  python:     PYTHON_RULES,
  html:       HTML_RULES,
  css:        CSS_RULES,
  json:       JSON_RULES,
  sql:        SQL_RULES,
  shell:      SHELL_RULES,
  c:          GENERIC_RULES,
  cpp:        GENERIC_RULES,
  csharp:     GENERIC_RULES,
  java:       GENERIC_RULES,
  go:         GENERIC_RULES,
  rust:       GENERIC_RULES,
  php:        GENERIC_RULES,
  ruby:       PYTHON_RULES,
  markdown:   GENERIC_RULES,
};

// Cache de expressões regulares compiladas por linguagem
const COMPILED_REGEX_CACHE = new Map();

function getCompiledRegex(lang) {
  const norm = normalizeLang(lang);
  const cacheKey = norm || 'generic';
  if (COMPILED_REGEX_CACHE.has(cacheKey)) {
    return COMPILED_REGEX_CACHE.get(cacheKey);
  }

  const rules = RULES_BY_LANG[norm] || GENERIC_RULES;
  const parts = rules.map((r, i) => `(?<t_${i}>${r.re.source})`);
  const hasIgnoreCase = rules.some(r => r.re.ignoreCase);
  const regex = new RegExp(parts.join('|'), hasIgnoreCase ? 'gi' : 'g');
  const compiled = { regex, rules };
  COMPILED_REGEX_CACHE.set(cacheKey, compiled);
  return compiled;
}

/**
 * Tenta detectar a linguagem a partir do código quando não for especificada.
 * @param {string} code
 * @returns {string}
 */
export function detectLanguage(code) {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim();
  if (/^<(!DOCTYPE|html|xml|svg|div|span|p|a|head|body)/i.test(trimmed)) return 'html';
  if (/^\{[\s\S]*:[ \t]*/.test(trimmed) && !/;\s*$/.test(trimmed)) return 'json';
  if (/\b(def\s+\w+|elif\s+|import\s+numpy|print\s*\(|self\.)/m.test(code)) return 'python';
  if (/\b(SELECT\s+[\w*]+|FROM\s+\w+|INSERT\s+INTO|CREATE\s+TABLE)\b/i.test(code)) return 'sql';
  if (/(?:^|\n)\s*(?:[.#][a-zA-Z0-9_-]+|body|html|div|span|p)\s*\{[\s\S]*?[a-zA-Z-]+:\s*[^;]+;/i.test(code)) return 'css';
  if (/\b(const\s+\w+|let\s+\w+|var\s+\w+|function\s+\w+|console\.log|=>)\b/.test(code)) return 'javascript';
  if (/\b(#include\s+<|int\s+main\s*\()/.test(code)) return 'cpp';
  if (/(?:^|\n)[ \t]*(?:\$|❯|PS [^>\n]+>)\s+\w+/.test(code)) return 'shell';
  if (/\b(?:docker(?:-compose)?|podman|kubectl|helm|git|npm|npx|pnpm|yarn|bun|pip3?|cargo|dotnet|composer|brew|apt(?:-get)?|sudo|systemctl|curl|wget|ssh|cat|grep|mkdir|rm|cp|mv|touch|echo|chmod|chown)\s+/i.test(code)) return 'shell';
  if (/\b(?:Get-[a-zA-Z]+|Set-[a-zA-Z]+|New-[a-zA-Z]+|Remove-[a-zA-Z]+|Start-[a-zA-Z]+|Invoke-[a-zA-Z]+|Write-Host)\b/i.test(code)) return 'shell';
  if (/^#{1,6}\s+\w+/m.test(code)) return 'markdown';
  return '';
}

/**
 * Converte um texto de código de programação em HTML com spans estilizados por token.
 * Todos os caracteres passam obrigatoriamente por escHtml para segurança contra XSS.
 * Quebras de linha são transformadas em <br>.
 *
 * @param {string} code Texto bruto de código de programação
 * @param {string} [lang] Linguagem do bloco de código (ex.: 'js', 'python', 'html')
 * @returns {string} HTML com tokens e tags <br>
 */
export function highlightCode(code, lang = '') {
  if (!code) return '';

  let effectiveLang = normalizeLang(lang);
  if (!effectiveLang) {
    effectiveLang = detectLanguage(code);
  }

  const { regex, rules } = getCompiledRegex(effectiveLang);
  regex.lastIndex = 0;

  let out = '';
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escHtml(code.slice(lastIndex, match.index)).replace(/\n/g, '<br>');
    }

    let tokenType = 'tok-text';
    const groups = match.groups || {};
    for (const key in groups) {
      if (groups[key] !== undefined && key.startsWith('t_')) {
        const idx = Number(key.slice(2));
        tokenType = rules[idx]?.type || 'tok-text';
        break;
      }
    }

    const tokenText = escHtml(match[0]).replace(/\n/g, '<br>');
    out += `<span class="${tokenType}">${tokenText}</span>`;
    lastIndex = regex.lastIndex;
    if (regex.lastIndex === match.index) {
      regex.lastIndex++;
    }
  }

  if (lastIndex < code.length) {
    out += escHtml(code.slice(lastIndex)).replace(/\n/g, '<br>');
  }

  return out;
}

/**
 * Extrai o texto limpo de um bloco de código (substituindo <br> por \n e ignorando cabeçalho).
 * @param {HTMLElement} blockOrContent
 * @returns {string}
 */
export function getCodeBlockText(blockOrContent) {
  if (!blockOrContent) return '';
  const content = blockOrContent.querySelector?.(':scope > .block-content') || blockOrContent;
  const clone = content.cloneNode(true);
  clone.querySelectorAll('.code-block-header').forEach(h => h.remove());
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return clone.textContent || '';
}

/**
 * Copia o texto do bloco para o clipboard e aplica feedback visual no botão.
 * @param {HTMLElement} btn
 * @param {HTMLElement} block
 */
export function handleCodeBlockCopy(btn, block) {
  const text = getCodeBlockText(block);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showCopySuccess(btn);
    }).catch(() => {
      fallbackCopy(text, btn);
    });
  } else {
    fallbackCopy(text, btn);
  }
}

function showCopySuccess(btn) {
  btn.classList.add('copied');
  const label = btn.querySelector('.code-copy-text');
  const original = label ? label.textContent : 'Copiar';
  if (label) label.textContent = 'Copiado!';
  setTimeout(() => {
    btn.classList.remove('copied');
    if (label) label.textContent = original;
  }, 1800);
}

function fallbackCopy(text, btn) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showCopySuccess(btn);
  } catch {
    // Falha silenciosa
  }
}

/**
 * Cria ou atualiza o elemento de cabeçalho do bloco de código (com label e botão de cópia).
 * @param {HTMLElement} block
 * @param {string} lang
 */
export function renderCodeBlockHeader(block, lang) {
  let header = block.querySelector(':scope > .code-block-header');
  if (!header) {
    header = document.createElement('div');
    header.className = 'code-block-header';
    header.contentEditable = 'false';

    const label = document.createElement('span');
    label.className = 'code-lang-label';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.title = 'Copiar código';
    btn.innerHTML = `<svg class="code-copy-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span class="code-copy-text">Copiar</span>`;

    header.append(label, btn);
    block.prepend(header);
  }

  const labelEl = header.querySelector('.code-lang-label');
  if (labelEl) {
    const effective = lang || detectLanguage(getCodeBlockText(block));
    const disp = getLanguageDisplayName(effective) || (effective ? effective.toUpperCase() : 'CÓDIGO');
    labelEl.textContent = disp;
  }
}

/**
 * Aplica destaque de sintaxe e atualiza cabeçalho em um elemento de bloco de código no DOM.
 * @param {HTMLElement} block
 */
export function updateCodeBlockHighlight(block) {
  if (!block || block.dataset?.type !== 'code') return;
  const content = block.querySelector(':scope > .block-content') || block;
  const lang = block.dataset.lang || '';

  renderCodeBlockHeader(block, lang);

  const rawText = getCodeBlockText(block);
  const highlighted = highlightCode(rawText, lang);
  content.innerHTML = highlighted || '<br>';
}

/**
 * Obtém o offset do cursor dentro do bloco de código contando nós de texto e quebras <br>.
 * @param {HTMLElement} contentEl
 * @returns {number|null}
 */
export function getCodeCaretOffset(contentEl) {
  if (!contentEl || typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') return null;
  const sel = document.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!contentEl.contains(range.startContainer)) return null;

  const walker = document.createTreeWalker(
    contentEl,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE || node.nodeName === 'BR') {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  let offset = 0;
  let node;
  while ((node = walker.nextNode())) {
    if (node === range.startContainer) {
      offset += range.startOffset;
      return offset;
    }
    if (range.startContainer.nodeType === Node.ELEMENT_NODE && node.parentNode === range.startContainer) {
      const childIdx = Array.prototype.indexOf.call(range.startContainer.childNodes, node);
      if (childIdx >= range.startOffset) {
        return offset;
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.data.length;
    } else if (node.nodeName === 'BR') {
      offset += 1;
    }
  }
  return offset;
}

/**
 * Restaura o cursor no offset de caractere exato considerando nós de texto e tags <br>.
 * @param {HTMLElement} contentEl
 * @param {number} targetOffset
 */
export function setCodeCaretOffset(contentEl, targetOffset) {
  if (!contentEl || typeof document === 'undefined' || typeof document.createTreeWalker !== 'function' || targetOffset === null || targetOffset === undefined) return;
  const walker = document.createTreeWalker(
    contentEl,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE || node.nodeName === 'BR') {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  let acc = 0;
  let node;
  let lastText = null;
  let lastBr = null;

  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      lastText = node;
      const len = node.data.length;
      if (acc + len >= targetOffset) {
        const sel = document.getSelection();
        if (!sel) return;
        const r = document.createRange();
        r.setStart(node, Math.min(Math.max(0, targetOffset - acc), len));
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      acc += len;
    } else if (node.nodeName === 'BR') {
      lastBr = node;
      if (acc + 1 >= targetOffset) {
        const sel = document.getSelection();
        if (!sel) return;
        const r = document.createRange();
        if (acc + 1 === targetOffset) {
          const next = walker.nextNode();
          if (next && next.nodeType === Node.TEXT_NODE) {
            r.setStart(next, 0);
          } else if (next && next.nodeName === 'BR') {
            r.setStartBefore(next);
          } else {
            r.setStartAfter(node);
          }
        } else {
          r.setStartBefore(node);
        }
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      acc += 1;
    }
  }

  const sel = document.getSelection();
  if (!sel) return;
  const r = document.createRange();
  if (lastText) {
    r.setStart(lastText, lastText.data.length);
  } else if (lastBr) {
    r.setStartAfter(lastBr);
  } else {
    r.setStart(contentEl, 0);
  }
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}
