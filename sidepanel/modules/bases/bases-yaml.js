// ── bases-yaml.js ────────────────────────────────────────────────────────────
// Parser e serializador leve de YAML/JSON para blocos de Bases do QuickDock.
// Suporta a sintaxe comum do Obsidian Dataview e Bases:
// chaves, valores escalares, listas em colchetes [a, b], listas com traço (- item),
// objetos aninhados e comentários iniciados com #.

/**
 * Converte valor textual para o tipo primitivo correspondente (boolean, number, string, array).
 */
function parseScalar(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;

  // Aspas simples ou duplas
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }

  // Lista inline em colchetes: [a, b, c]
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(item => parseScalar(item.trim()));
  }

  // Objeto inline em chaves: { a: 1, b: 2 }
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return {};
    const obj = {};
    inner.split(',').forEach(part => {
      const idx = part.indexOf(':');
      if (idx !== -1) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        obj[k] = parseScalar(v);
      }
    });
    return obj;
  }

  // Número
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return Number(s);
  }

  return s;
}

/**
 * Analisa uma string YAML ou JSON e retorna o objeto de configuração correspondente.
 * @param {string} text
 * @returns {Object}
 */
export function parseYamlOrJson(text) {
  if (!text || typeof text !== 'string') return {};
  const trimmed = text.trim();
  if (!trimmed) return {};

  // Se começar com '{', tenta JSON primeiro
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // continua para o parser de YAML
    }
  }

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n');
  const root = {};
  const stack = [{ indent: -1, container: root, key: null }];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Se a linha inteira for comentário
    if (/^\s*#/.test(rawLine)) continue;
    // Remove comentário inline (espaço seguido de # e espaço)
    const lineWithoutComment = rawLine.replace(/\s+#[ \t].*$/, '');
    if (!lineWithoutComment.trim()) continue;

    const indent = rawLine.search(/\S/);
    const content = lineWithoutComment.trim();

    // Volta na pilha se a indentação diminuiu
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const currentContext = stack[stack.length - 1];

    // Item de lista com traço: "- item" ou "- key: value"
    if (content.startsWith('-')) {
      const rest = content.slice(1).trim();
      let targetArray;

      if (Array.isArray(currentContext.container)) {
        targetArray = currentContext.container;
      } else if (currentContext.key && Array.isArray(currentContext.container[currentContext.key])) {
        targetArray = currentContext.container[currentContext.key];
      } else if (currentContext.key) {
        targetArray = [];
        currentContext.container[currentContext.key] = targetArray;
        stack.push({ indent, container: targetArray, key: null });
      } else {
        targetArray = [];
        currentContext.container = targetArray;
      }

      const colonIdx = rest.indexOf(':');
      if (colonIdx !== -1) {
        // Item de lista que é um objeto: "- type: table"
        const k = rest.slice(0, colonIdx).trim();
        const v = rest.slice(colonIdx + 1).trim();
        const itemObj = {};
        if (k) itemObj[k] = v ? parseScalar(v) : {};
        targetArray.push(itemObj);
        stack.push({ indent, container: itemObj, key: k });
      } else {
        // Item de lista escalar simples: "- item"
        targetArray.push(parseScalar(rest));
      }
      continue;
    }

    // Par chave: valor ("key: value" ou "key:")
    const colonIdx = content.indexOf(':');
    if (colonIdx !== -1) {
      const key = content.slice(0, colonIdx).trim();
      const valStr = content.slice(colonIdx + 1).trim();

      let parentObj = currentContext.container;
      if (Array.isArray(parentObj)) {
        // Se o contexto atual é um array, anexa ao último objeto do array ou cria um
        let lastItem = parentObj[parentObj.length - 1];
        if (!lastItem || typeof lastItem !== 'object' || Array.isArray(lastItem)) {
          lastItem = {};
          parentObj.push(lastItem);
        }
        parentObj = lastItem;
      }

      if (valStr === '') {
        // Objeto ou lista aninhada que começará nas próximas linhas
        parentObj[key] = {};
        stack.push({ indent, container: parentObj, key });
      } else {
        parentObj[key] = parseScalar(valStr);
      }
    }
  }

  return root;
}

/**
 * Converte um objeto de configuração de Base para YAML legível do Obsidian.
 * @param {Object} obj
 * @param {number} indentLevel
 * @returns {string}
 */
export function stringifyBaseToYaml(obj, indentLevel = 0) {
  if (obj == null) return '';
  const pad = '  '.repeat(indentLevel);
  let out = '';

  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;

    if (val === null) {
      out += `${pad}${key}: null\n`;
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        out += `${pad}${key}: []\n`;
      } else if (val.every(item => typeof item !== 'object' || item === null)) {
        // Lista simples em colchetes: [a, b, c]
        const formatted = val.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(', ');
        out += `${pad}${key}: [${formatted}]\n`;
      } else {
        out += `${pad}${key}:\n`;
        val.forEach(item => {
          if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item);
            if (entries.length > 0) {
              const [firstK, firstV] = entries[0];
              const firstValStr = (typeof firstV === 'object' && firstV !== null) ? '' : ` ${firstV}`;
              out += `${pad}  - ${firstK}:${firstValStr}\n`;
              for (let i = 1; i < entries.length; i++) {
                const [subK, subV] = entries[i];
                out += stringifyBaseToYaml({ [subK]: subV }, indentLevel + 2);
              }
            }
          } else {
            out += `${pad}  - ${item}\n`;
          }
        });
      }
    } else if (typeof val === 'object') {
      out += `${pad}${key}:\n`;
      out += stringifyBaseToYaml(val, indentLevel + 1);
    } else {
      out += `${pad}${key}: ${val}\n`;
    }
  }

  return out;
}
