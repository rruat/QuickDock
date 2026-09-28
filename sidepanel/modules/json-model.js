// Funções puras de validação e manipulação de dados JSON — sem estado de
// módulo, sem DOM. Operam em (root, path) recebidos como parâmetro e
// devolvem dados novos, nunca mutam o que receberam.
// ── Funções Puras de Validação e Manipulação de Dados ────────────────────────

export function getJsonType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val; // 'string', 'number', 'boolean', 'object'
}

export function extractJsonErrorPosition(rawText, error) {
  const msg = error?.message || 'Erro de sintaxe JSON';
  const text = rawText || '';

  // 1. Line & Column format (Firefox, Safari, linters)
  const lineColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColMatch) {
    return {
      line: parseInt(lineColMatch[1], 10),
      column: parseInt(lineColMatch[2], 10),
      message: msg
    };
  }

  // 2. Position format (older V8, Node <20, standard V8)
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = Math.max(0, parseInt(posMatch[1], 10));
    const textBefore = text.slice(0, pos);
    const lines = textBefore.split('\n');
    return { line: lines.length, column: lines[lines.length - 1].length + 1, pos, message: msg };
  }

  // 3. Modern V8 format: "...<snippet>" is not valid JSON
  // Example: Unexpected token '}', ..." "erro": \n}" is not valid JSON
  const snippetMatch = msg.match(/\.\.\.("?.*"?)\s+is not valid JSON/s);
  if (snippetMatch) {
    let snippet = snippetMatch[1];
    // Remove wrapping quotes if present
    if (snippet.startsWith('"') && snippet.endsWith('"')) {
      snippet = snippet.slice(1, -1);
    }
    // Unescape escaped chars like \n, \t, etc.
    try {
      snippet = snippet.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    } catch (_) {}

    // Find snippet in text
    let idx = text.lastIndexOf(snippet);
    if (idx === -1 && snippet.length > 5) {
      // Try with first 10 chars of snippet
      idx = text.lastIndexOf(snippet.slice(0, 10));
    }
    if (idx !== -1) {
      // The error is usually near the end of snippet or at the unexpected token
      const tokenCharMatch = msg.match(/Unexpected token '([^']+)'/);
      if (tokenCharMatch) {
        const tokenChar = tokenCharMatch[1];
        const tokenIdx = text.indexOf(tokenChar, idx);
        if (tokenIdx !== -1) {
          idx = tokenIdx;
        }
      }
      const textBefore = text.slice(0, idx);
      const lines = textBefore.split('\n');
      return { line: lines.length, column: lines[lines.length - 1].length + 1, pos: idx, message: msg };
    }
  }

  // 4. Unexpected end of JSON
  if (/unexpected end of/i.test(msg)) {
    const lines = text.split('\n');
    return { line: lines.length, column: (lines[lines.length - 1] || '').length + 1, pos: text.length, message: msg };
  }

  // 5. Fallback: Search for token in message
  const tokenMatch = msg.match(/Unexpected token '([^']+)'/);
  if (tokenMatch) {
    const token = tokenMatch[1];
    const idx = text.lastIndexOf(token);
    if (idx !== -1) {
      const textBefore = text.slice(0, idx);
      const lines = textBefore.split('\n');
      return { line: lines.length, column: lines[lines.length - 1].length + 1, pos: idx, message: msg };
    }
  }

  return { line: 1, column: 1, message: msg };
}

export function validateJsonString(rawText) {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return { valid: true, data: {}, lineCount: 1, charCount: 0, isEmpty: true };
  }
  try {
    const data = JSON.parse(trimmed);
    const lineCount = (rawText.match(/\n/g) || []).length + 1;
    const charCount = rawText.length;
    return { valid: true, data, lineCount, charCount, isEmpty: false };
  } catch (err) {
    const pos = extractJsonErrorPosition(rawText, err);
    return {
      valid: false,
      error: pos.message,
      line: pos.line,
      column: pos.column,
      pos: pos.pos
    };
  }
}

export function convertJsonType(val, targetType) {
  const curType = getJsonType(val);
  if (curType === targetType) return val;

  switch (targetType) {
    case 'string':
      if (curType === 'null') return '';
      if (curType === 'object' || curType === 'array') return JSON.stringify(val);
      return String(val);
    case 'number':
      if (curType === 'boolean') return val ? 1 : 0;
      if (curType === 'string') {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
      }
      return 0;
    case 'boolean':
      if (curType === 'string') {
        const s = val.trim().toLowerCase();
        return s === 'true' || s === '1';
      }
      if (curType === 'number') return val !== 0;
      return false;
    case 'null':
      return null;
    case 'object':
      if (curType === 'array') {
        const obj = {};
        val.forEach((item, idx) => { obj[`item_${idx}`] = item; });
        return obj;
      }
      return {};
    case 'array':
      if (curType === 'object' && val !== null) {
        return Object.values(val);
      }
      return val !== null && val !== undefined ? [val] : [];
    default:
      return val;
  }
}

export function deepCloneJson(val) {
  if (val === undefined) return null;
  return JSON.parse(JSON.stringify(val));
}

export function getNodeByPath(root, path) {
  if (!path || path.length === 0) return { parent: null, key: null, value: root };
  let curr = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (curr === null || typeof curr !== 'object') return null;
    curr = curr[path[i]];
  }
  const lastKey = path[path.length - 1];
  return { parent: curr, key: lastKey, value: curr ? curr[lastKey] : undefined };
}

export function updateValueByPath(root, path, newValue) {
  if (!path || path.length === 0) {
    return deepCloneJson(newValue);
  }
  const cloned = deepCloneJson(root);
  let curr = cloned;
  for (let i = 0; i < path.length - 1; i++) {
    curr = curr[path[i]];
  }
  const lastKey = path[path.length - 1];
  curr[lastKey] = newValue;
  return cloned;
}

export function deleteByPath(root, path) {
  if (!path || path.length === 0) return {};
  const cloned = deepCloneJson(root);
  let curr = cloned;
  for (let i = 0; i < path.length - 1; i++) {
    curr = curr[path[i]];
  }
  const lastKey = path[path.length - 1];
  if (Array.isArray(curr)) {
    const idx = parseInt(lastKey, 10);
    if (!isNaN(idx)) curr.splice(idx, 1);
  } else if (curr && typeof curr === 'object') {
    delete curr[lastKey];
  }
  return cloned;
}

export function renameKeyByPath(root, path, newKey) {
  if (!path || path.length === 0) return root;
  const cloned = deepCloneJson(root);
  let curr = cloned;
  for (let i = 0; i < path.length - 1; i++) {
    curr = curr[path[i]];
  }
  const oldKey = path[path.length - 1];
  if (curr && typeof curr === 'object' && !Array.isArray(curr)) {
    if (oldKey === newKey || newKey.trim() === '') return cloned;
    const newObj = {};
    for (const [k, v] of Object.entries(curr)) {
      if (k === oldKey) {
        newObj[newKey] = v;
      } else {
        newObj[k] = v;
      }
    }
    if (path.length === 1) {
      return newObj;
    }
    let parent = cloned;
    for (let i = 0; i < path.length - 2; i++) {
      parent = parent[path[i]];
    }
    parent[path[path.length - 2]] = newObj;
  }
  return cloned;
}

export function insertChildNode(root, path, initialType = 'string') {
  const cloned = deepCloneJson(root);
  const target = path.length === 0 ? cloned : getNodeByPath(cloned, path)?.value;
  if (!target || typeof target !== 'object') return cloned;

  let defaultValue = '';
  if (initialType === 'number') defaultValue = 0;
  else if (initialType === 'boolean') defaultValue = false;
  else if (initialType === 'null') defaultValue = null;
  else if (initialType === 'object') defaultValue = {};
  else if (initialType === 'array') defaultValue = [];

  if (Array.isArray(target)) {
    if (target.length > 0 && typeof target[0] === 'object' && target[0] !== null && !Array.isArray(target[0]) && initialType === 'string') {
      const templateObj = {};
      for (const [k, v] of Object.entries(target[0])) {
        const vType = getJsonType(v);
        templateObj[k] = vType === 'number' ? 0
          : vType === 'boolean' ? false
          : vType === 'null' ? null
          : vType === 'array' ? []
          : vType === 'object' ? {}
          : '';
      }
      target.push(templateObj);
    } else {
      target.push(defaultValue);
    }
  } else {
    let keyIndex = 1;
    let newKey = `nova_chave_${keyIndex}`;
    while (Object.prototype.hasOwnProperty.call(target, newKey)) {
      keyIndex++;
      newKey = `nova_chave_${keyIndex}`;
    }
    target[newKey] = defaultValue;
  }
  return cloned;
}

export function duplicateNodeByPath(root, path) {
  if (!path || path.length === 0) return deepCloneJson(root);
  const cloned = deepCloneJson(root);
  let parent = cloned;
  for (let i = 0; i < path.length - 1; i++) {
    parent = parent[path[i]];
  }
  const lastKey = path[path.length - 1];
  const valueToCopy = deepCloneJson(parent[lastKey]);

  if (Array.isArray(parent)) {
    const idx = parseInt(lastKey, 10);
    parent.splice(idx + 1, 0, valueToCopy);
  } else if (parent && typeof parent === 'object') {
    let copyKey = `${lastKey}_copia`;
    let counter = 1;
    while (Object.prototype.hasOwnProperty.call(parent, copyKey)) {
      counter++;
      copyKey = `${lastKey}_copia_${counter}`;
    }
    parent[copyKey] = valueToCopy;
  }
  return cloned;
}

export function moveNodeByPath(root, path, direction) {
  // direction: -1 (para cima) ou +1 (para baixo)
  if (!path || path.length === 0) return root;
  const cloned = deepCloneJson(root);
  let parent = cloned;
  for (let i = 0; i < path.length - 1; i++) {
    parent = parent[path[i]];
  }
  const lastKey = path[path.length - 1];

  if (Array.isArray(parent)) {
    const idx = parseInt(lastKey, 10);
    const targetIdx = idx + direction;
    if (targetIdx >= 0 && targetIdx < parent.length) {
      const temp = parent[idx];
      parent[idx] = parent[targetIdx];
      parent[targetIdx] = temp;
    }
  } else if (parent && typeof parent === 'object') {
    const entries = Object.entries(parent);
    const idx = entries.findIndex(([k]) => k === lastKey);
    const targetIdx = idx + direction;
    if (targetIdx >= 0 && targetIdx < entries.length) {
      const temp = entries[idx];
      entries[idx] = entries[targetIdx];
      entries[targetIdx] = temp;
      const reordered = {};
      for (const [k, v] of entries) {
        reordered[k] = v;
      }
      if (path.length === 1) return reordered;
      let grandParent = cloned;
      for (let i = 0; i < path.length - 2; i++) {
        grandParent = grandParent[path[i]];
      }
      grandParent[path[path.length - 2]] = reordered;
    }
  }
  return cloned;
}
