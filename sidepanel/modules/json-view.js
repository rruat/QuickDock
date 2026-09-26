// ── json-view.js ─────────────────────────────────────────────────────────────
// Visualizador, Editor e Criador de JSON Completo para o QuickDock.
// Suporta:
// 1. Visualização estrutural em árvore hierárquica colapsável com cores e badges.
// 2. Edição manual via editor de código com numeração de linhas, formatação e validação.
// 3. Edição visual direta de tipos primitivos (string, number, boolean, null) e coleções (object, array).
// 4. Criação dinâmica de objetos e listas, renomeação de chaves, reordenação e deleção.
// 5. Conversor dinâmico de tipos de dados para qualquer nó.
// 6. Sincronização bidirecional instantânea entre os modos Visual e Código.
// 7. Validação de sintaxe em tempo real com indicador de linha e coluna exata.

import { isDesktopMode } from './platform.js';
import { switchView, goBack } from './views.js';
import { escHtml } from './blocks.js';

// ── Modelos Pré-definidos ───────────────────────────────────────────────────
export const JSON_TEMPLATES = {
  'empty-object': {},
  'empty-array': [],
  'user-profile': {
    id: 101,
    nome: "Maria Silva",
    email: "maria.silva@exemplo.com",
    ativo: true,
    papel: "admin",
    interesses: ["desenvolvimento", "design", "produtividade"],
    endereco: {
      rua: "Av. Central",
      numero: 500,
      cidade: "São Paulo",
      estado: "SP",
      pais: "Brasil"
    },
    telefone: null
  },
  'app-config': {
    app: "QuickDock Studio",
    versao: "3.5.0",
    servidor: {
      host: "localhost",
      porta: 8080,
      ssl: true
    },
    recursos: {
      modoEscuro: true,
      autoSalvar: true,
      intervaloSegundos: 30
    },
    tags: ["produtivo", "notas", "desktop", "mobile"]
  },
  'api-response': {
    status: 200,
    mensagem: "Operação realizada com sucesso",
    dados: [
      { id: 1, titulo: "Aprender QuickDock", concluido: true },
      { id: 2, titulo: "Dominar JSON Studio", concluido: false }
    ],
    paginacao: {
      paginaAtual: 1,
      totalPaginas: 5,
      totalRegistros: 42
    }
  }
};

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
    target.push(defaultValue);
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

// ── Estado do Módulo do Visualizador / Editor JSON ──────────────────────────

let currentJsonData = deepCloneJson(JSON_TEMPLATES['user-profile']);
let rawJsonText = JSON.stringify(currentJsonData, null, 2);
let currentViewMode = 'tree'; // 'tree' (visual) ou 'code' (texto)
let searchQuery = '';
const expandedPaths = new Set(['', 'endereco', 'interesses', 'dados', 'servidor', 'recursos']);

let containerEl = null;
let visualContainerEl = null;
let codeContainerEl = null;
let codeEditorEl = null;
let lineNumbersEl = null;
let validationBarEl = null;
let validationMsgEl = null;
let validationIconEl = null;
let charCountEl = null;
let gotoErrorBtnEl = null;
let statsBadgeEl = null;
let treeContentEl = null;
let searchInputEl = null;
let searchClearBtnEl = null;
let fileInputEl = null;
let activePopoverEl = null;

// Carrega dados salvos do localStorage
function loadSavedState() {
  try {
    const saved = localStorage.getItem('quickdock:json:data');
    if (saved) {
      const validation = validateJsonString(saved);
      if (validation.valid) {
        currentJsonData = validation.data;
        rawJsonText = saved;
      }
    }
    const savedMode = localStorage.getItem('quickdock:json:mode');
    if (savedMode === 'code' || savedMode === 'tree') {
      currentViewMode = savedMode;
    }
  } catch (_) {}
}

function persistState() {
  try {
    localStorage.setItem('quickdock:json:data', rawJsonText);
    localStorage.setItem('quickdock:json:mode', currentViewMode);
  } catch (_) {}
}

// ── Notificações Toast no QuickDock ──────────────────────────────────────────

function showJsonToast(msg, isError = false) {
  const existing = document.getElementById('json-studio-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'json-studio-toast';
  toast.className = `json-toast ${isError ? 'is-error' : 'is-success'}`;
  toast.innerHTML = `
    <span class="qd-icon material-symbols-rounded">${isError ? 'error' : 'check_circle'}</span>
    <span>${escHtml(msg)}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('is-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ── Atualização e Validação do Editor de Código ─────────────────────────────

function updateLineNumbers() {
  if (!codeEditorEl || !lineNumbersEl) return;
  const lines = (codeEditorEl.value || '').split('\n').length;
  let html = '';
  for (let i = 1; i <= lines; i++) {
    html += `<div>${i}</div>`;
  }
  lineNumbersEl.innerHTML = html;
}

function validateAndSyncCodeEditor() {
  if (!codeEditorEl) return;
  const text = codeEditorEl.value;
  rawJsonText = text;
  updateLineNumbers();

  const res = validateJsonString(text);
  if (validationBarEl) {
    validationBarEl.classList.toggle('is-valid', res.valid);
    validationBarEl.classList.toggle('is-invalid', !res.valid);
  }
  if (validationIconEl) {
    validationIconEl.textContent = res.valid ? 'check_circle' : 'error';
  }
  if (validationMsgEl) {
    validationMsgEl.textContent = res.valid
      ? 'JSON Válido e pronto para uso'
      : `Erro na Linha ${res.line}, Coluna ${res.column}: ${res.error}`;
  }
  if (charCountEl) {
    const chars = text.length;
    const lines = (text.match(/\n/g) || []).length + 1;
    charCountEl.textContent = `${lines} linhas · ${chars} caracteres`;
  }
  if (gotoErrorBtnEl) {
    gotoErrorBtnEl.hidden = res.valid;
    if (!res.valid) {
      gotoErrorBtnEl.onclick = () => {
        focusEditorAtLineCol(res.line, res.column);
      };
    }
  }

  if (res.valid) {
    currentJsonData = res.data;
    updateStatsBadge();
    persistState();
  }
  return res;
}

function focusEditorAtLineCol(targetLine, targetCol) {
  if (!codeEditorEl) return;
  codeEditorEl.focus();
  const lines = codeEditorEl.value.split('\n');
  let pos = 0;
  for (let i = 0; i < targetLine - 1 && i < lines.length; i++) {
    pos += lines[i].length + 1;
  }
  pos += Math.max(0, targetCol - 1);
  codeEditorEl.setSelectionRange(pos, pos);

  // Rola o editor para a linha correspondente
  const lineHeight = 20;
  codeEditorEl.scrollTop = Math.max(0, (targetLine - 3) * lineHeight);
}

function updateStatsBadge() {
  if (!statsBadgeEl) return;
  const type = getJsonType(currentJsonData);
  let countText = '';
  if (type === 'object') {
    const keys = Object.keys(currentJsonData || {});
    countText = `Objeto (${keys.length} ${keys.length === 1 ? 'chave' : 'chaves'})`;
  } else if (type === 'array') {
    const len = (currentJsonData || []).length;
    countText = `Array (${len} ${len === 1 ? 'item' : 'itens'})`;
  } else {
    countText = `Tipo: ${type}`;
  }
  statsBadgeEl.textContent = countText;
}

// ── Alternância de Modos (Visual x Código) ──────────────────────────────────

export function switchJsonMode(targetMode) {
  if (targetMode === currentViewMode) return;

  if (targetMode === 'tree') {
    // Código -> Visual: exige JSON válido
    const validation = validateAndSyncCodeEditor();
    if (!validation.valid) {
      showJsonToast(`Corrija o erro de sintaxe na Linha ${validation.line} antes de alternar para o modo visual.`, true);
      focusEditorAtLineCol(validation.line, validation.column);
      return;
    }
    currentViewMode = 'tree';
    if (visualContainerEl) visualContainerEl.hidden = false;
    if (codeContainerEl) codeContainerEl.hidden = true;
    renderTreeView();
  } else {
    // Visual -> Código: serializa modelo estrutural em texto formatado
    currentViewMode = 'code';
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    if (codeEditorEl) {
      codeEditorEl.value = rawJsonText;
      updateLineNumbers();
      validateAndSyncCodeEditor();
    }
    if (visualContainerEl) visualContainerEl.hidden = true;
    if (codeContainerEl) codeContainerEl.hidden = false;
  }

  document.getElementById('btn-json-mode-tree')?.classList.toggle('is-active', currentViewMode === 'tree');
  document.getElementById('btn-json-mode-code')?.classList.toggle('is-active', currentViewMode === 'code');
  persistState();
}

// ── Renderizador do Modo Visual em Árvore ────────────────────────────────────

function closeAnyActivePopover() {
  activePopoverEl?.remove();
  activePopoverEl = null;
}

function showTypeSelectorPopover(anchorEl, currentType, onSelect) {
  closeAnyActivePopover();
  const pop = document.createElement('div');
  pop.className = 'json-type-popover';

  const types = [
    { id: 'string', label: 'Texto (string)', icon: 'format_quote', color: '#10b981' },
    { id: 'number', label: 'Número (number)', icon: 'numbers', color: '#3b82f6' },
    { id: 'boolean', label: 'Booleano (boolean)', icon: 'toggle_on', color: '#8b5cf6' },
    { id: 'null', label: 'Nulo (null)', icon: 'block', color: '#64748b' },
    { id: 'object', label: 'Objeto ({})', icon: 'data_object', color: '#0284c7' },
    { id: 'array', label: 'Lista ([])', icon: 'data_array', color: '#f59e0b' }
  ];

  pop.innerHTML = `
    <div class="json-popover-header">Mudar tipo para:</div>
    <div class="json-type-list">
      ${types.map(t => `
        <button type="button" class="json-type-opt ${t.id === currentType ? 'is-active' : ''}" data-type="${t.id}">
          <span class="json-type-dot" style="background:${t.color};"></span>
          <span class="json-type-label">${t.label}</span>
          ${t.id === currentType ? '<span class="qd-icon material-symbols-rounded check-icon">check</span>' : ''}
        </button>
      `).join('')}
    </div>
  `;

  pop.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const newType = btn.dataset.type;
      closeAnyActivePopover();
      onSelect(newType);
    });
  });

  pop.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(pop);

  const rect = anchorEl.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + 180 > window.innerWidth) left = window.innerWidth - 190;
  if (top + 220 > window.innerHeight) top = rect.top - 224;
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${Math.max(8, top)}px`;

  activePopoverEl = pop;
}

function matchesSearch(key, val, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (String(key).toLowerCase().includes(q)) return true;
  if (val !== null && typeof val !== 'object' && String(val).toLowerCase().includes(q)) return true;
  if (typeof val === 'object' && val !== null) {
    if (Array.isArray(val)) {
      return val.some((item, i) => matchesSearch(i, item, q));
    }
    return Object.entries(val).some(([k, v]) => matchesSearch(k, v, q));
  }
  return false;
}

function highlightMatchText(text, query) {
  if (!query) return escHtml(String(text));
  const safe = escHtml(String(text));
  const reg = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safe.replace(reg, '<mark>$1</mark>');
}

export function renderTreeView() {
  if (!treeContentEl) return;
  treeContentEl.innerHTML = '';
  closeAnyActivePopover();

  const rootType = getJsonType(currentJsonData);
  const rootNodeEl = createTreeNodeElement([], null, currentJsonData, rootType, true);
  treeContentEl.appendChild(rootNodeEl);
  updateStatsBadge();
}

function createTreeNodeElement(path, keyName, value, type, isRoot = false) {
  const pathStr = path.join('.');
  const isExpanded = expandedPaths.has(pathStr);
  const isObj = type === 'object';
  const isArr = type === 'array';
  const isCollapsible = isObj || isArr;

  const nodeEl = document.createElement('div');
  nodeEl.className = `json-tree-node json-type-${type} ${isExpanded ? 'is-expanded' : 'is-collapsed'}`;
  nodeEl.dataset.path = pathStr;

  // Linha de cabeçalho do nó
  const rowEl = document.createElement('div');
  rowEl.className = 'json-tree-row';

  // Toggle de colapso
  if (isCollapsible) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'json-toggle-btn';
    toggleBtn.title = isExpanded ? 'Recolher' : 'Expandir';
    toggleBtn.innerHTML = `<span class="qd-icon material-symbols-rounded">${isExpanded ? 'expand_more' : 'chevron_right'}</span>`;
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (expandedPaths.has(pathStr)) {
        expandedPaths.delete(pathStr);
      } else {
        expandedPaths.add(pathStr);
      }
      renderTreeView();
    });
    rowEl.appendChild(toggleBtn);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'json-tree-spacer';
    rowEl.appendChild(spacer);
  }

  // Chave ou Índice
  if (!isRoot && keyName !== null) {
    const parentNode = getNodeByPath(currentJsonData, path.slice(0, -1));
    const isParentArray = Array.isArray(parentNode?.value);

    if (isParentArray) {
      const idxBadge = document.createElement('span');
      idxBadge.className = 'json-index-badge';
      idxBadge.textContent = `[${keyName}]`;
      rowEl.appendChild(idxBadge);
    } else {
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.className = 'json-key-input';
      keyInput.value = keyName;
      keyInput.placeholder = 'chave';
      keyInput.addEventListener('change', () => {
        const newKey = keyInput.value.trim();
        if (newKey && newKey !== keyName) {
          currentJsonData = renameKeyByPath(currentJsonData, path, newKey);
          rawJsonText = JSON.stringify(currentJsonData, null, 2);
          persistState();
          renderTreeView();
        } else {
          keyInput.value = keyName;
        }
      });
      keyInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') keyInput.blur();
      });
      rowEl.appendChild(keyInput);
    }

    const colon = document.createElement('span');
    colon.className = 'json-colon';
    colon.textContent = ':';
    rowEl.appendChild(colon);
  }

  // Seletor / Badge de Tipo
  const typeBadge = document.createElement('button');
  typeBadge.type = 'button';
  typeBadge.className = `json-type-badge badge-${type}`;
  typeBadge.title = `Tipo: ${type} (clique para alterar o tipo)`;
  typeBadge.textContent = type === 'string' ? 'str'
    : type === 'number' ? 'num'
    : type === 'boolean' ? 'bool'
    : type === 'object' ? 'obj'
    : type === 'array' ? 'arr'
    : 'null';

  typeBadge.addEventListener('click', e => {
    e.stopPropagation();
    showTypeSelectorPopover(typeBadge, type, newType => {
      const converted = convertJsonType(value, newType);
      currentJsonData = updateValueByPath(currentJsonData, path, converted);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });
  });
  rowEl.appendChild(typeBadge);

  // Editor de Valor Específico por Tipo
  const valWrapper = document.createElement('div');
  valWrapper.className = 'json-value-wrapper';

  if (type === 'string') {
    const strInput = document.createElement('input');
    strInput.type = 'text';
    strInput.className = 'json-val-input json-val-string';
    strInput.value = value;
    strInput.placeholder = 'texto vazio';
    strInput.addEventListener('change', () => {
      currentJsonData = updateValueByPath(currentJsonData, path, strInput.value);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      updateStatsBadge();
    });
    valWrapper.appendChild(strInput);
  } else if (type === 'number') {
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'json-val-input json-val-number';
    numInput.value = value;
    numInput.step = 'any';
    numInput.addEventListener('change', () => {
      const num = Number(numInput.value);
      currentJsonData = updateValueByPath(currentJsonData, path, isNaN(num) ? 0 : num);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      updateStatsBadge();
    });

    const stepDown = document.createElement('button');
    stepDown.type = 'button';
    stepDown.className = 'json-stepper-btn';
    stepDown.title = 'Diminuir (-1)';
    stepDown.innerHTML = '<span class="qd-icon material-symbols-rounded">remove</span>';
    stepDown.addEventListener('click', () => {
      const num = (Number(numInput.value) || 0) - 1;
      numInput.value = num;
      currentJsonData = updateValueByPath(currentJsonData, path, num);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
    });

    const stepUp = document.createElement('button');
    stepUp.type = 'button';
    stepUp.className = 'json-stepper-btn';
    stepUp.title = 'Aumentar (+1)';
    stepUp.innerHTML = '<span class="qd-icon material-symbols-rounded">add</span>';
    stepUp.addEventListener('click', () => {
      const num = (Number(numInput.value) || 0) + 1;
      numInput.value = num;
      currentJsonData = updateValueByPath(currentJsonData, path, num);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
    });

    valWrapper.appendChild(stepDown);
    valWrapper.appendChild(numInput);
    valWrapper.appendChild(stepUp);
  } else if (type === 'boolean') {
    const boolGroup = document.createElement('div');
    boolGroup.className = 'json-bool-toggle';

    const trueBtn = document.createElement('button');
    trueBtn.type = 'button';
    trueBtn.className = `json-bool-btn ${value === true ? 'is-active is-true' : ''}`;
    trueBtn.textContent = 'true';
    trueBtn.addEventListener('click', () => {
      currentJsonData = updateValueByPath(currentJsonData, path, true);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });

    const falseBtn = document.createElement('button');
    falseBtn.type = 'button';
    falseBtn.className = `json-bool-btn ${value === false ? 'is-active is-false' : ''}`;
    falseBtn.textContent = 'false';
    falseBtn.addEventListener('click', () => {
      currentJsonData = updateValueByPath(currentJsonData, path, false);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });

    boolGroup.appendChild(trueBtn);
    boolGroup.appendChild(falseBtn);
    valWrapper.appendChild(boolGroup);
  } else if (type === 'null') {
    const nullTag = document.createElement('span');
    nullTag.className = 'json-val-null';
    nullTag.textContent = 'null';
    valWrapper.appendChild(nullTag);
  } else if (isObj) {
    const keysCount = Object.keys(value || {}).length;
    const summary = document.createElement('span');
    summary.className = 'json-collapsible-summary';
    summary.textContent = `{ ${keysCount} ${keysCount === 1 ? 'propriedade' : 'propriedades'} }`;
    valWrapper.appendChild(summary);
  } else if (isArr) {
    const itemsCount = (value || []).length;
    const summary = document.createElement('span');
    summary.className = 'json-collapsible-summary';
    summary.textContent = `[ ${itemsCount} ${itemsCount === 1 ? 'item' : 'itens'} ]`;
    valWrapper.appendChild(summary);
  }

  rowEl.appendChild(valWrapper);

  // Barra de Ações Rápidas do Nó
  const nodeActions = document.createElement('div');
  nodeActions.className = 'json-node-actions';

  // Botão Adicionar Filho (apenas para Objeto ou Array)
  if (isCollapsible) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'json-node-btn json-btn-add';
    addBtn.title = isObj ? 'Adicionar propriedade' : 'Adicionar item';
    addBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">add</span>';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      expandedPaths.add(pathStr);
      currentJsonData = insertChildNode(currentJsonData, path, 'string');
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });
    nodeActions.appendChild(addBtn);
  }

  if (!isRoot) {
    // Duplicar
    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'json-node-btn';
    dupBtn.title = 'Duplicar nó';
    dupBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">content_copy</span>';
    dupBtn.addEventListener('click', e => {
      e.stopPropagation();
      currentJsonData = duplicateNodeByPath(currentJsonData, path);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });
    nodeActions.appendChild(dupBtn);

    // Mover Para Cima
    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'json-node-btn';
    moveUpBtn.title = 'Mover para cima';
    moveUpBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">arrow_upward</span>';
    moveUpBtn.addEventListener('click', e => {
      e.stopPropagation();
      currentJsonData = moveNodeByPath(currentJsonData, path, -1);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });
    nodeActions.appendChild(moveUpBtn);

    // Mover Para Baixo
    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'json-node-btn';
    moveDownBtn.title = 'Mover para baixo';
    moveDownBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">arrow_downward</span>';
    moveDownBtn.addEventListener('click', e => {
      e.stopPropagation();
      currentJsonData = moveNodeByPath(currentJsonData, path, 1);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });
    nodeActions.appendChild(moveDownBtn);

    // Excluir
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'json-node-btn json-btn-danger';
    delBtn.title = 'Excluir nó';
    delBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">delete</span>';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      currentJsonData = deleteByPath(currentJsonData, path);
      rawJsonText = JSON.stringify(currentJsonData, null, 2);
      persistState();
      renderTreeView();
    });
    nodeActions.appendChild(delBtn);
  }

  rowEl.appendChild(nodeActions);
  nodeEl.appendChild(rowEl);

  // Renderização de Filhos
  if (isCollapsible && isExpanded) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'json-tree-children';

    if (isObj) {
      const entries = Object.entries(value || {});
      if (entries.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'json-empty-branch';
        emptyEl.innerHTML = `<span>Objeto vazio.</span> <button type="button" class="json-link-btn">+ Adicionar propriedade</button>`;
        emptyEl.querySelector('button').addEventListener('click', () => {
          currentJsonData = insertChildNode(currentJsonData, path, 'string');
          rawJsonText = JSON.stringify(currentJsonData, null, 2);
          persistState();
          renderTreeView();
        });
        childrenContainer.appendChild(emptyEl);
      } else {
        for (const [childKey, childVal] of entries) {
          if (!matchesSearch(childKey, childVal, searchQuery)) continue;
          const childType = getJsonType(childVal);
          const childPath = [...path, childKey];
          childrenContainer.appendChild(createTreeNodeElement(childPath, childKey, childVal, childType));
        }
      }
    } else if (isArr) {
      const items = value || [];
      if (items.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'json-empty-branch';
        emptyEl.innerHTML = `<span>Array vazio.</span> <button type="button" class="json-link-btn">+ Adicionar item</button>`;
        emptyEl.querySelector('button').addEventListener('click', () => {
          currentJsonData = insertChildNode(currentJsonData, path, 'string');
          rawJsonText = JSON.stringify(currentJsonData, null, 2);
          persistState();
          renderTreeView();
        });
        childrenContainer.appendChild(emptyEl);
      } else {
        items.forEach((childVal, idx) => {
          if (!matchesSearch(idx, childVal, searchQuery)) return;
          const childType = getJsonType(childVal);
          const childPath = [...path, idx];
          childrenContainer.appendChild(createTreeNodeElement(childPath, idx, childVal, childType));
        });
      }
    }

    nodeEl.appendChild(childrenContainer);
  }

  return nodeEl;
}

// ── Dropdown / Modal de Novo JSON e Modelos ──────────────────────────────────

function showNewJsonPopover(anchorEl) {
  closeAnyActivePopover();
  const pop = document.createElement('div');
  pop.className = 'json-new-popover';
  pop.innerHTML = `
    <div class="json-popover-header">Criar Novo JSON</div>
    <div class="json-template-list">
      <button type="button" class="json-template-item" data-template="empty-object">
        <span class="qd-icon material-symbols-rounded">data_object</span>
        <div class="json-tpl-info">
          <span class="json-tpl-name">Objeto Vazio</span>
          <span class="json-tpl-desc">{ }</span>
        </div>
      </button>
      <button type="button" class="json-template-item" data-template="empty-array">
        <span class="qd-icon material-symbols-rounded">data_array</span>
        <div class="json-tpl-info">
          <span class="json-tpl-name">Array Vazio</span>
          <span class="json-tpl-desc">[ ]</span>
        </div>
      </button>
      <button type="button" class="json-template-item" data-template="user-profile">
        <span class="qd-icon material-symbols-rounded">person</span>
        <div class="json-tpl-info">
          <span class="json-tpl-name">Perfil de Usuário</span>
          <span class="json-tpl-desc">ID, dados cadastrais e interesses</span>
        </div>
      </button>
      <button type="button" class="json-template-item" data-template="app-config">
        <span class="qd-icon material-symbols-rounded">settings</span>
        <div class="json-tpl-info">
          <span class="json-tpl-name">Configurações de App</span>
          <span class="json-tpl-desc">Host, portas, flags booleanas</span>
        </div>
      </button>
      <button type="button" class="json-template-item" data-template="api-response">
        <span class="qd-icon material-symbols-rounded">cloud_sync</span>
        <div class="json-tpl-info">
          <span class="json-tpl-name">Resposta de API</span>
          <span class="json-tpl-desc">Status HTTP, dados e paginação</span>
        </div>
      </button>
    </div>
  `;

  pop.querySelectorAll('[data-template]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tplKey = btn.dataset.template;
      closeAnyActivePopover();
      const tpl = JSON_TEMPLATES[tplKey];
      if (tpl !== undefined) {
        currentJsonData = deepCloneJson(tpl);
        rawJsonText = JSON.stringify(currentJsonData, null, 2);
        if (codeEditorEl) codeEditorEl.value = rawJsonText;
        persistState();
        if (currentViewMode === 'tree') {
          renderTreeView();
        } else {
          validateAndSyncCodeEditor();
        }
        showJsonToast('Novo JSON gerado com sucesso!');
      }
    });
  });

  pop.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(pop);

  const rect = anchorEl.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + 220 > window.innerWidth) left = window.innerWidth - 230;
  if (top + 280 > window.innerHeight) top = rect.top - 284;
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${Math.max(8, top)}px`;

  activePopoverEl = pop;
}

// ── Exportação, Importação e Ações Rápidas ───────────────────────────────────

function copyJsonToClipboard() {
  const text = currentViewMode === 'code' && codeEditorEl
    ? codeEditorEl.value
    : JSON.stringify(currentJsonData, null, 2);

  navigator.clipboard.writeText(text).then(() => {
    showJsonToast('JSON copiado para a área de transferência!');
  }).catch(() => {
    showJsonToast('Falha ao copiar JSON', true);
  });
}

function exportJsonFile() {
  const text = currentViewMode === 'code' && codeEditorEl
    ? codeEditorEl.value
    : JSON.stringify(currentJsonData, null, 2);

  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dados_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showJsonToast('Download do arquivo .json iniciado!');
}

function prettifyJson() {
  if (currentViewMode === 'code' && codeEditorEl) {
    const val = validateJsonString(codeEditorEl.value);
    if (!val.valid) {
      showJsonToast(`Impossível formatar: erro na linha ${val.line}, coluna ${val.column}`, true);
      focusEditorAtLineCol(val.line, val.column);
      return;
    }
    currentJsonData = val.data;
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    codeEditorEl.value = rawJsonText;
    validateAndSyncCodeEditor();
  } else {
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    renderTreeView();
  }
  persistState();
  showJsonToast('JSON formatado (Prettify)!');
}

function minifyJson() {
  if (currentViewMode === 'code' && codeEditorEl) {
    const val = validateJsonString(codeEditorEl.value);
    if (!val.valid) {
      showJsonToast(`Impossível minificar: erro na linha ${val.line}, coluna ${val.column}`, true);
      focusEditorAtLineCol(val.line, val.column);
      return;
    }
    currentJsonData = val.data;
    rawJsonText = JSON.stringify(currentJsonData);
    codeEditorEl.value = rawJsonText;
    validateAndSyncCodeEditor();
  } else {
    rawJsonText = JSON.stringify(currentJsonData);
  }
  persistState();
  showJsonToast('JSON minificado (Compact)!');
}

function importJsonFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const content = ev.target?.result;
    if (typeof content !== 'string') return;
    const res = validateJsonString(content);
    if (!res.valid) {
      showJsonToast(`Arquivo inválido: Erro na linha ${res.line}, coluna ${res.column}`, true);
      return;
    }
    currentJsonData = res.data;
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    if (codeEditorEl) codeEditorEl.value = rawJsonText;
    persistState();
    if (currentViewMode === 'tree') {
      renderTreeView();
    } else {
      validateAndSyncCodeEditor();
    }
    showJsonToast(`Arquivo "${file.name}" carregado com sucesso!`);
  };
  reader.readAsText(file);
}

// ── Inicialização da View no DOM ────────────────────────────────────────────

export function initJsonView() {
  if (typeof document === 'undefined') return;

  containerEl = document.getElementById('json-view');
  if (!containerEl) return;

  loadSavedState();

  visualContainerEl = document.getElementById('json-visual-container');
  codeContainerEl = document.getElementById('json-code-container');
  codeEditorEl = document.getElementById('json-code-editor');
  lineNumbersEl = document.getElementById('json-line-numbers');
  validationBarEl = document.getElementById('json-validation-bar');
  validationMsgEl = document.getElementById('json-validation-msg');
  validationIconEl = document.getElementById('json-validation-icon');
  charCountEl = document.getElementById('json-char-count');
  gotoErrorBtnEl = document.getElementById('btn-json-goto-error');
  statsBadgeEl = document.getElementById('json-stats-badge');
  treeContentEl = document.getElementById('json-tree-content');
  searchInputEl = document.getElementById('json-search-input');
  searchClearBtnEl = document.getElementById('btn-json-search-clear');
  fileInputEl = document.getElementById('json-file-input');

  // Inicializa valores nos editors
  if (codeEditorEl) {
    codeEditorEl.value = rawJsonText;
  }

  // Alternância de modo
  document.getElementById('btn-json-mode-tree')?.addEventListener('click', () => switchJsonMode('tree'));
  document.getElementById('btn-json-mode-code')?.addEventListener('click', () => switchJsonMode('code'));

  // Voltar
  document.getElementById('btn-json-back')?.addEventListener('click', () => {
    if (!isDesktopMode()) switchView('editor');
  });

  // Ações de cabeçalho
  document.getElementById('btn-json-new')?.addEventListener('click', e => {
    e.stopPropagation();
    showNewJsonPopover(e.currentTarget);
  });
  document.getElementById('btn-json-prettify')?.addEventListener('click', () => prettifyJson());
  document.getElementById('btn-json-minify')?.addEventListener('click', () => minifyJson());
  document.getElementById('btn-json-copy')?.addEventListener('click', () => copyJsonToClipboard());
  document.getElementById('btn-json-export')?.addEventListener('click', () => exportJsonFile());

  document.getElementById('btn-json-import')?.addEventListener('click', () => {
    fileInputEl?.click();
  });
  fileInputEl?.addEventListener('change', () => {
    if (fileInputEl.files?.[0]) {
      importJsonFile(fileInputEl.files[0]);
      fileInputEl.value = '';
    }
  });

  // Ações da barra de ferramentas da árvore
  document.getElementById('btn-json-expand-all')?.addEventListener('click', () => {
    function addAllPaths(obj, curPath = '') {
      if (!obj || typeof obj !== 'object') return;
      expandedPaths.add(curPath);
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => {
          const p = curPath ? `${curPath}.${idx}` : `${idx}`;
          addAllPaths(item, p);
        });
      } else {
        Object.entries(obj).forEach(([k, v]) => {
          const p = curPath ? `${curPath}.${k}` : k;
          addAllPaths(v, p);
        });
      }
    }
    addAllPaths(currentJsonData, '');
    renderTreeView();
  });

  document.getElementById('btn-json-collapse-all')?.addEventListener('click', () => {
    expandedPaths.clear();
    expandedPaths.add('');
    renderTreeView();
  });

  document.getElementById('btn-json-add-root-prop')?.addEventListener('click', () => {
    currentJsonData = insertChildNode(currentJsonData, [], 'string');
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    persistState();
    renderTreeView();
  });

  // Busca / Filtro em tempo real
  if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
      searchQuery = searchInputEl.value.trim();
      if (searchClearBtnEl) searchClearBtnEl.hidden = !searchQuery;
      renderTreeView();
    });
  }
  if (searchClearBtnEl) {
    searchClearBtnEl.addEventListener('click', () => {
      if (searchInputEl) searchInputEl.value = '';
      searchQuery = '';
      searchClearBtnEl.hidden = true;
      renderTreeView();
    });
  }

  // Eventos do editor de código
  if (codeEditorEl) {
    codeEditorEl.addEventListener('input', () => {
      validateAndSyncCodeEditor();
    });

    // Sincroniza scroll de linhas e textarea
    codeEditorEl.addEventListener('scroll', () => {
      if (lineNumbersEl) {
        lineNumbersEl.scrollTop = codeEditorEl.scrollTop;
      }
    });

    // Tecla Tab inteligente no editor (insere 2 espaços)
    codeEditorEl.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeEditorEl.selectionStart;
        const end = codeEditorEl.selectionEnd;
        const val = codeEditorEl.value;
        codeEditorEl.value = val.substring(0, start) + '  ' + val.substring(end);
        codeEditorEl.selectionStart = codeEditorEl.selectionEnd = start + 2;
        validateAndSyncCodeEditor();
      }
    });
  }

  // Drag & Drop de arquivo .json no container
  containerEl.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
    containerEl.classList.add('is-dragging-file');
  });

  containerEl.addEventListener('dragleave', e => {
    if (!containerEl.contains(e.relatedTarget)) {
      containerEl.classList.remove('is-dragging-file');
    }
  });

  containerEl.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    containerEl.classList.remove('is-dragging-file');
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.json') || file.type.includes('json') || file.type.includes('text'))) {
      importJsonFile(file);
    }
  });

  // Fecha popovers ao clicar fora
  document.addEventListener('pointerdown', e => {
    if (activePopoverEl && !activePopoverEl.contains(e.target)) {
      closeAnyActivePopover();
    }
  });

  // Escuta evento de refresh de view
  document.addEventListener('quickdock:refresh-json-view', () => {
    if (currentViewMode === 'tree') {
      renderTreeView();
    } else {
      validateAndSyncCodeEditor();
    }
  });

  // Inicializa a visualização inicial
  if (currentViewMode === 'tree') {
    if (visualContainerEl) visualContainerEl.hidden = false;
    if (codeContainerEl) codeContainerEl.hidden = true;
    renderTreeView();
  } else {
    if (visualContainerEl) visualContainerEl.hidden = true;
    if (codeContainerEl) codeContainerEl.hidden = false;
    validateAndSyncCodeEditor();
  }
}
