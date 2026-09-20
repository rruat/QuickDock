// ── bases-cell-editors.js ───────────────────────────────────────────────────
// Editores de célula inline e popovers interativos para o QuickDock Bases.
// Gerencia a edição direta de valores de propriedades em tabelas e cards.

import { parsePropertyInput } from './bases-schema.js';
import { updateNoteMetaById, getNoteById, listarPastas, moverNotaParaPasta } from '../storage.js';

/**
 * Ativa o editor inline apropriado para a célula clicada.
 *
 * @param {HTMLElement} cellEl Elemento <td> ou campo do card
 * @param {Object} note Objeto da nota correspondente
 * @param {string} propKey Chave da propriedade (ex: 'status', 'title', 'data')
 * @param {Object} propDef Definição da propriedade no schema
 * @param {Function} onSave Callback chamado após salvar com sucesso
 */
export async function activateCellEditor(cellEl, note, propKey, propDef = {}, onSave = () => {}) {
  if (!cellEl || !note) return;
  if (propDef.type === 'tasks' || propDef.type === 'formula' || propDef.isReadOnly) return;

  const currentVal = propKey === 'title'
    ? (note.title || note.titulo || '')
    : propKey === 'folder'
      ? (note.pasta || '')
      : (note.properties?.[propKey] ?? '');

  // 1. Checkbox: alternância direta instantânea sem abrir input
  if (propDef.type === 'checkbox') {
    const newVal = !currentVal;
    await commitPropertyChange(note, propKey, newVal, propDef);
    onSave(note, propKey, newVal);
    return;
  }

  // 2. Pasta: menu seletor de pastas
  if (propDef.type === 'folder') {
    openFolderCellPicker(cellEl, note, onSave);
    return;
  }

  // 3. Select: dropdown de seleção com cores
  if (propDef.type === 'select') {
    openSelectCellDropdown(cellEl, note, propKey, propDef, currentVal, onSave);
    return;
  }

  // 4. Input inline de texto, número ou data
  openInlineTextInput(cellEl, note, propKey, propDef, currentVal, onSave);
}

/**
 * Abre input inline dentro da célula para edição de texto, número ou data.
 */
function openInlineTextInput(cellEl, note, propKey, propDef, currentVal, onSave) {
  const originalHtml = cellEl.innerHTML;
  cellEl.innerHTML = '';
  cellEl.classList.add('is-editing');

  const input = document.createElement('input');
  input.className = 'base-cell-input';

  if (propDef.type === 'number') {
    input.type = 'text'; // Permite digitar vírgula ou moeda
    input.inputMode = 'decimal';
    input.value = currentVal !== undefined && currentVal !== null ? String(currentVal) : '';
  } else if (propDef.type === 'date') {
    input.type = 'date';
    input.value = typeof currentVal === 'string' ? currentVal.slice(0, 10) : '';
  } else {
    input.type = 'text';
    input.value = String(currentVal ?? '');
  }

  cellEl.appendChild(input);
  input.focus();
  if (input.type === 'text') input.select();

  let committed = false;

  const finish = async (save = true) => {
    if (committed) return;
    committed = true;

    if (save) {
      const raw = input.value;
      const parsed = parsePropertyInput(raw, propDef.type);
      cellEl.classList.remove('is-editing');
      await commitPropertyChange(note, propKey, parsed, propDef);
      onSave(note, propKey, parsed);
    } else {
      cellEl.classList.remove('is-editing');
      cellEl.innerHTML = originalHtml;
    }
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    } else if (e.key === 'Tab') {
      // Tab avança para próxima célula
      finish(true);
    }
  });
}

/**
 * Dropdown de seleção para propriedades do tipo 'select'.
 */
function openSelectCellDropdown(cellEl, note, propKey, propDef, currentVal, onSave) {
  const existingDropdown = document.querySelector('.base-select-dropdown');
  if (existingDropdown) existingDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.className = 'base-select-dropdown popover-menu';

  const options = propDef.options || [];

  // Campo de busca / criação de nova opção
  const searchInput = document.createElement('input');
  searchInput.className = 'base-select-search';
  searchInput.placeholder = 'Buscar ou criar opção...';
  dropdown.appendChild(searchInput);

  const listEl = document.createElement('div');
  listEl.className = 'base-select-options-list';
  dropdown.appendChild(listEl);

  const renderOptions = (filter = '') => {
    listEl.innerHTML = '';
    const q = filter.toLowerCase().trim();

    // Opção de limpar seleção
    const clearOpt = document.createElement('button');
    clearOpt.className = 'base-select-opt base-select-opt-clear';
    clearOpt.innerHTML = '<span class="qd-icon material-symbols-rounded">block</span><span>Sem valor</span>';
    clearOpt.onclick = async () => {
      dropdown.remove();
      await commitPropertyChange(note, propKey, null, propDef);
      onSave(note, propKey, null);
    };
    listEl.appendChild(clearOpt);

    let matchCount = 0;
    for (const opt of options) {
      const label = typeof opt === 'string' ? opt : (opt.label || opt.id);
      const color = typeof opt === 'object' && opt.color ? opt.color : 'var(--accent)';
      if (q && !label.toLowerCase().includes(q)) continue;

      matchCount++;
      const btn = document.createElement('button');
      btn.className = 'base-select-opt';
      if (label === currentVal) btn.classList.add('active');

      btn.innerHTML = `
        <span class="base-select-badge" style="background: color-mix(in srgb, ${color} 18%, transparent); color: ${color}; border: 1px solid color-mix(in srgb, ${color} 35%, transparent);">
          ${escapeHtml(label)}
        </span>
      `;
      btn.onclick = async () => {
        dropdown.remove();
        await commitPropertyChange(note, propKey, label, propDef);
        onSave(note, propKey, label);
      };
      listEl.appendChild(btn);
    }

    // Botão para criar nova opção caso não exista exatamente
    if (q && !options.some(o => (typeof o === 'string' ? o : o.label).toLowerCase() === q)) {
      const createBtn = document.createElement('button');
      createBtn.className = 'base-select-opt base-select-opt-create';
      createBtn.innerHTML = `<span class="qd-icon material-symbols-rounded">add</span><span>Criar "<strong>${escapeHtml(filter)}</strong>"</span>`;
      createBtn.onclick = async () => {
        dropdown.remove();
        const newLabel = filter.trim();
        if (!propDef.options) propDef.options = [];
        propDef.options.push({ id: newLabel, label: newLabel, color: getRandomOptionColor() });
        await commitPropertyChange(note, propKey, newLabel, propDef);
        onSave(note, propKey, newLabel);
      };
      listEl.appendChild(createBtn);
    }
  };

  renderOptions();
  searchInput.addEventListener('input', () => renderOptions(searchInput.value));

  document.body.appendChild(dropdown);
  positionDropdown(dropdown, cellEl);
  searchInput.focus();

  // Fechar ao clicar fora
  const onDocClick = e => {
    if (!dropdown.contains(e.target) && !cellEl.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('mousedown', onDocClick);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 10);
}

/**
 * Seletor de pasta para mover a nota.
 */
async function openFolderCellPicker(cellEl, note, onSave) {
  const pastas = await listarPastas();
  const dropdown = document.createElement('div');
  dropdown.className = 'base-select-dropdown popover-menu';

  const listEl = document.createElement('div');
  listEl.className = 'base-select-options-list';
  dropdown.appendChild(listEl);

  // Opção Raiz (Sem pasta)
  const rootBtn = document.createElement('button');
  rootBtn.className = 'base-select-opt';
  rootBtn.innerHTML = '<span class="qd-icon material-symbols-rounded">folder_off</span><span>Sem pasta (Raiz)</span>';
  rootBtn.onclick = async () => {
    dropdown.remove();
    await moverNotaParaPasta(note.id, null);
    note.pasta = '';
    onSave(note, 'folder', '');
  };
  listEl.appendChild(rootBtn);

  for (const pasta of pastas) {
    const btn = document.createElement('button');
    btn.className = 'base-select-opt';
    btn.innerHTML = `<span class="qd-icon material-symbols-rounded">folder</span><span>${escapeHtml(pasta.caminho)}</span>`;
    btn.onclick = async () => {
      dropdown.remove();
      await moverNotaParaPasta(note.id, pasta.id);
      note.pasta = pasta.caminho;
      onSave(note, 'folder', pasta.caminho);
    };
    listEl.appendChild(btn);
  }

  document.body.appendChild(dropdown);
  positionDropdown(dropdown, cellEl);

  const onDocClick = e => {
    if (!dropdown.contains(e.target) && !cellEl.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('mousedown', onDocClick);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 10);
}

/**
 * Salva a alteração da propriedade na nota no IndexedDB e dispara evento de reatividade.
 */
async function commitPropertyChange(note, propKey, newVal, propDef = {}) {
  if (!note || !note.id) return;

  if (propKey === 'title') {
    note.title = newVal;
    note.titulo = newVal;
    await updateNoteMetaById(note.id, { title: newVal, titulo: newVal });
  } else if (propKey === 'folder') {
    // Tratado via moverNotaParaPasta
  } else {
    if (!note.properties) note.properties = {};
    if (!note.propertyTypes) note.propertyTypes = {};

    if (newVal === null || newVal === undefined || newVal === '') {
      delete note.properties[propKey];
    } else {
      note.properties[propKey] = newVal;
    }

    if (propDef.type) {
      note.propertyTypes[propKey] = propDef.type;
    }

    await updateNoteMetaById(note.id, {
      properties: { ...note.properties },
      propertyTypes: { ...note.propertyTypes },
    });
  }

  // Notifica o restante do QuickDock que a nota foi atualizada em tempo real
  document.dispatchEvent(new CustomEvent('quickdock:note-updated', {
    detail: { id: note.id, note }
  }));
}

function positionDropdown(dropdown, targetEl) {
  const rect = targetEl.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${Math.max(8, rect.left)}px`;
  dropdown.style.minWidth = `${Math.max(rect.width, 180)}px`;
  dropdown.style.zIndex = '9999';
}

function getRandomOptionColor() {
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renderiza um badge estilizado em HTML para valores de propriedade 'select'.
 * @param {string|Array<string>} value
 * @param {Array<Object>|Array<string>} options
 * @returns {string}
 */
export function formatSelectBadge(value, options = []) {
  if (value == null || value === '') return '';

  const values = Array.isArray(value) ? value : [value];
  return values.map(val => {
    const s = String(val).trim();
    if (!s) return '';
    let color = null;
    if (Array.isArray(options)) {
      const found = options.find(opt => (typeof opt === 'object' ? opt?.name === s : opt === s));
      if (found && typeof found === 'object' && found.color) color = found.color;
    }
    if (!color) {
      const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
      let hash = 0;
      for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
      color = palette[hash % palette.length];
    }
    return `<span class="base-select-badge" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}40;">${escapeHtml(s)}</span>`;
  }).join(' ');
}

