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
import { toggleDesktopPanel } from './desktop-panels.js';
import { switchView, goBack } from './views.js';
import { escHtml } from './blocks.js';

import { JSON_TEMPLATES } from './json-templates.js';
export { JSON_TEMPLATES };
import {
  getJsonType, extractJsonErrorPosition, validateJsonString, convertJsonType,
  deepCloneJson, getNodeByPath, updateValueByPath, deleteByPath, renameKeyByPath,
  insertChildNode, duplicateNodeByPath, moveNodeByPath,
} from './json-model.js';
export {
  getJsonType, extractJsonErrorPosition, validateJsonString, convertJsonType,
  deepCloneJson, getNodeByPath, updateValueByPath, deleteByPath, renameKeyByPath,
  insertChildNode, duplicateNodeByPath, moveNodeByPath,
};

let currentJsonData = deepCloneJson(JSON_TEMPLATES['records-list']);
let rawJsonText = JSON.stringify(currentJsonData, null, 2);
let currentViewMode = isDesktopMode() ? 'split' : 'tree'; // 'split', 'tree' ou 'code'
let searchQuery = '';
const expandedPaths = new Set(['', '0', '1', 'endereco', 'interesses', 'dados', 'servidor', 'recursos']);

let containerEl = null;
let panesWrapperEl = null;
let resizerEl = null;
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

export function autoExpandInitialPaths(data) {
  expandedPaths.add('');
  if (Array.isArray(data)) {
    data.forEach((item, idx) => {
      if (idx < 50) {
        expandedPaths.add(String(idx));
      }
    });
  } else if (data && typeof data === 'object') {
    Object.keys(data).forEach(k => {
      expandedPaths.add(k);
    });
  }
}

export function syncVisualToCode() {
  rawJsonText = JSON.stringify(currentJsonData, null, 2);
  if (codeEditorEl) {
    codeEditorEl.value = rawJsonText;
    updateLineNumbers();
    if (validationBarEl) {
      validationBarEl.classList.remove('is-invalid');
      validationBarEl.classList.add('is-valid');
    }
    if (validationIconEl) validationIconEl.textContent = 'check_circle';
    if (validationMsgEl) validationMsgEl.textContent = 'JSON Válido e pronto para uso';
    if (gotoErrorBtnEl) gotoErrorBtnEl.hidden = true;
    if (charCountEl) {
      const chars = rawJsonText.length;
      const lines = (rawJsonText.match(/\n/g) || []).length + 1;
      charCountEl.textContent = `${lines} linhas · ${chars} caracteres`;
    }
  }
  updateStatsBadge();
  persistState();
}

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
    if (savedMode === 'code' || savedMode === 'tree' || savedMode === 'split') {
      currentViewMode = savedMode;
    } else if (isDesktopMode()) {
      currentViewMode = 'split';
    }
    autoExpandInitialPaths(currentJsonData);
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
    if (resizerEl) resizerEl.hidden = true;
    panesWrapperEl?.classList.remove('is-split');
    renderTreeView();
  } else if (targetMode === 'code') {
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
    if (resizerEl) resizerEl.hidden = true;
    panesWrapperEl?.classList.remove('is-split');
  } else if (targetMode === 'split') {
    // Modo Dividido (Texto de um lado e Visual do outro)
    currentViewMode = 'split';
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    if (codeEditorEl) {
      codeEditorEl.value = rawJsonText;
      updateLineNumbers();
      validateAndSyncCodeEditor();
    }
    if (visualContainerEl) visualContainerEl.hidden = false;
    if (codeContainerEl) codeContainerEl.hidden = false;
    if (resizerEl) resizerEl.hidden = false;
    panesWrapperEl?.classList.add('is-split');
    renderTreeView();
  }

  if (typeof document !== 'undefined') {
    document.getElementById('btn-json-mode-tree')?.classList.toggle('is-active', currentViewMode === 'tree');
    document.getElementById('btn-json-mode-code')?.classList.toggle('is-active', currentViewMode === 'code');
    document.getElementById('btn-json-mode-split')?.classList.toggle('is-active', currentViewMode === 'split');
  }
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
    { id: 'string', label: 'Texto (string)', icon: 'format_quote', color: 'oklch(69.6% 0.149 162.5)' },
    { id: 'number', label: 'Número (number)', icon: 'numbers', color: 'oklch(62.3% 0.188 259.8)' },
    { id: 'boolean', label: 'Booleano (boolean)', icon: 'toggle_on', color: 'oklch(60.6% 0.219 292.7)' },
    { id: 'null', label: 'Nulo (null)', icon: 'block', color: 'oklch(55.4% 0.041 257.4)' },
    { id: 'object', label: 'Objeto ({})', icon: 'data_object', color: 'oklch(58.8% 0.139 242)' },
    { id: 'array', label: 'Lista ([])', icon: 'data_array', color: 'oklch(76.86% 0.1647 70.08)' }
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
          syncVisualToCode();
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
      syncVisualToCode();
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
    strInput.addEventListener('input', () => {
      currentJsonData = updateValueByPath(currentJsonData, path, strInput.value);
      syncVisualToCode();
    });
    strInput.addEventListener('change', () => {
      currentJsonData = updateValueByPath(currentJsonData, path, strInput.value);
      syncVisualToCode();
    });
    valWrapper.appendChild(strInput);
  } else if (type === 'number') {
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'json-val-input json-val-number';
    numInput.value = value;
    numInput.step = 'any';
    numInput.addEventListener('input', () => {
      const num = Number(numInput.value);
      currentJsonData = updateValueByPath(currentJsonData, path, isNaN(num) ? 0 : num);
      syncVisualToCode();
    });
    numInput.addEventListener('change', () => {
      const num = Number(numInput.value);
      currentJsonData = updateValueByPath(currentJsonData, path, isNaN(num) ? 0 : num);
      syncVisualToCode();
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
      syncVisualToCode();
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
      syncVisualToCode();
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
      syncVisualToCode();
      renderTreeView();
    });

    const falseBtn = document.createElement('button');
    falseBtn.type = 'button';
    falseBtn.className = `json-bool-btn ${value === false ? 'is-active is-false' : ''}`;
    falseBtn.textContent = 'false';
    falseBtn.addEventListener('click', () => {
      currentJsonData = updateValueByPath(currentJsonData, path, false);
      syncVisualToCode();
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
    const entries = Object.entries(value || {});
    const summary = document.createElement('span');
    summary.className = 'json-collapsible-summary';
    if (entries.length === 0) {
      summary.textContent = '{ } (vazio)';
    } else {
      const preview = entries.slice(0, 3).map(([k, v]) => {
        const displayV = typeof v === 'object' && v !== null
          ? (Array.isArray(v) ? '[...]' : '{...}')
          : JSON.stringify(v);
        return `${k}: ${displayV}`;
      }).join(', ');
      const more = entries.length > 3 ? `, +${entries.length - 3}` : '';
      summary.textContent = `{ ${preview}${more} }`;
    }
    valWrapper.appendChild(summary);
  } else if (isArr) {
    const items = value || [];
    const summary = document.createElement('span');
    summary.className = 'json-collapsible-summary';
    if (items.length === 0) {
      summary.textContent = '[ ] (vazio)';
    } else {
      summary.textContent = `[ ${items.length} ${items.length === 1 ? 'item' : 'itens'} ]`;
    }
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
      syncVisualToCode();
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
      syncVisualToCode();
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
      syncVisualToCode();
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
      syncVisualToCode();
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
      syncVisualToCode();
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
          syncVisualToCode();
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
          syncVisualToCode();
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
      <button type="button" class="json-template-item" data-template="records-list">
        <span class="qd-icon material-symbols-rounded">view_list</span>
        <div class="json-tpl-info">
          <span class="json-tpl-name">Lista de Registros (Array de Objetos)</span>
          <span class="json-tpl-desc">Nomes, CPFs, datas e atributos</span>
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
        autoExpandInitialPaths(currentJsonData);
        rawJsonText = JSON.stringify(currentJsonData, null, 2);
        if (codeEditorEl) codeEditorEl.value = rawJsonText;
        persistState();
        if (currentViewMode === 'tree') {
          renderTreeView();
        } else if (currentViewMode === 'split') {
          validateAndSyncCodeEditor();
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
  if ((currentViewMode === 'code' || currentViewMode === 'split') && codeEditorEl) {
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
    if (currentViewMode === 'split') renderTreeView();
  } else {
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    renderTreeView();
  }
  persistState();
  showJsonToast('JSON formatado (Prettify)!');
}

function minifyJson() {
  if ((currentViewMode === 'code' || currentViewMode === 'split') && codeEditorEl) {
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
    if (currentViewMode === 'split') renderTreeView();
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
    autoExpandInitialPaths(currentJsonData);
    rawJsonText = JSON.stringify(currentJsonData, null, 2);
    if (codeEditorEl) codeEditorEl.value = rawJsonText;
    persistState();
    if (currentViewMode === 'tree') {
      renderTreeView();
    } else if (currentViewMode === 'split') {
      validateAndSyncCodeEditor();
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

  panesWrapperEl = document.getElementById('json-panes-wrapper');
  resizerEl = document.getElementById('json-panes-resizer');
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
  document.getElementById('btn-json-mode-split')?.addEventListener('click', () => switchJsonMode('split'));

  // Resizer interativo entre painéis em modo dividido
  if (resizerEl && panesWrapperEl) {
    let isDragging = false;
    let startX = 0;
    let startCodeWidth = 0;
    let wrapperWidth = 0;

    resizerEl.addEventListener('pointerdown', e => {
      if (currentViewMode !== 'split') return;
      isDragging = true;
      startX = e.clientX;
      startCodeWidth = codeContainerEl.getBoundingClientRect().width;
      wrapperWidth = panesWrapperEl.getBoundingClientRect().width;
      resizerEl.setPointerCapture(e.pointerId);
      resizerEl.classList.add('is-active');
      document.body.classList.add('is-resizing-panes');
    });

    resizerEl.addEventListener('pointermove', e => {
      if (!isDragging) return;
      const delta = e.clientX - startX;
      const minW = 200;
      const maxW = wrapperWidth - 200;
      const newWidth = Math.max(minW, Math.min(maxW, startCodeWidth + delta));
      const pct = (newWidth / wrapperWidth) * 100;
      codeContainerEl.style.flex = `0 0 ${pct}%`;
      codeContainerEl.style.width = `${pct}%`;
      visualContainerEl.style.flex = `1 1 auto`;
    });

    const stopDrag = e => {
      if (isDragging) {
        isDragging = false;
        try { resizerEl.releasePointerCapture(e.pointerId); } catch (_) {}
        resizerEl.classList.remove('is-active');
        document.body.classList.remove('is-resizing-panes');
      }
    };
    resizerEl.addEventListener('pointerup', stopDrag);
    resizerEl.addEventListener('pointercancel', stopDrag);
  }

  // Voltar
  document.getElementById('btn-json-back')?.addEventListener('click', () => {
    if (isDesktopMode()) toggleDesktopPanel('json');
    else switchView('editor');
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
    syncVisualToCode();
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
  let codeInputDebounce = null;
  if (codeEditorEl) {
    codeEditorEl.addEventListener('input', () => {
      validateAndSyncCodeEditor();
      if (currentViewMode === 'split') {
        clearTimeout(codeInputDebounce);
        codeInputDebounce = setTimeout(() => {
          const val = validateJsonString(codeEditorEl.value);
          if (val.valid) {
            currentJsonData = val.data;
            renderTreeView();
          }
        }, 150);
      }
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
    } else if (currentViewMode === 'split') {
      validateAndSyncCodeEditor();
      renderTreeView();
    } else {
      validateAndSyncCodeEditor();
    }
  });

  // Inicializa a visualização inicial
  if (currentViewMode === 'split') {
    if (visualContainerEl) visualContainerEl.hidden = false;
    if (codeContainerEl) codeContainerEl.hidden = false;
    if (resizerEl) resizerEl.hidden = false;
    panesWrapperEl?.classList.add('is-split');
    document.getElementById('btn-json-mode-split')?.classList.add('is-active');
    document.getElementById('btn-json-mode-tree')?.classList.remove('is-active');
    document.getElementById('btn-json-mode-code')?.classList.remove('is-active');
    validateAndSyncCodeEditor();
    renderTreeView();
  } else if (currentViewMode === 'tree') {
    if (visualContainerEl) visualContainerEl.hidden = false;
    if (codeContainerEl) codeContainerEl.hidden = true;
    if (resizerEl) resizerEl.hidden = true;
    panesWrapperEl?.classList.remove('is-split');
    document.getElementById('btn-json-mode-tree')?.classList.add('is-active');
    document.getElementById('btn-json-mode-code')?.classList.remove('is-active');
    document.getElementById('btn-json-mode-split')?.classList.remove('is-active');
    renderTreeView();
  } else {
    if (visualContainerEl) visualContainerEl.hidden = true;
    if (codeContainerEl) codeContainerEl.hidden = false;
    if (resizerEl) resizerEl.hidden = true;
    panesWrapperEl?.classList.remove('is-split');
    document.getElementById('btn-json-mode-code')?.classList.add('is-active');
    document.getElementById('btn-json-mode-tree')?.classList.remove('is-active');
    document.getElementById('btn-json-mode-split')?.classList.remove('is-active');
    validateAndSyncCodeEditor();
  }
}
