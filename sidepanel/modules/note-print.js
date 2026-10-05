// ── note-print.js ─────────────────────────────────────────────────────────────
// Modo de impressão estilo WhatsApp: seleção por blocos com checkboxes interativos.
// Por padrão, todos os blocos começam selecionados. O usuário apenas desmarca
// o que não quer imprimir. Os checkboxes somem ao sair do modo de impressão.

const STORAGE_KEY = 'quickdock:note-print-orientation';

const headerBar = document.getElementById('note-header-bar');

let orientation = 'portrait';
try {
  if (localStorage.getItem(STORAGE_KEY) === 'landscape') orientation = 'landscape';
} catch {}

const pageStyleEl = document.createElement('style');
pageStyleEl.id = 'note-print-page-style';
document.head.appendChild(pageStyleEl);

function applyPageStyle() {
  pageStyleEl.textContent = `@page { size: A4 ${orientation}; margin: 14mm; }`;
}

let isPrintMode = false;
let printBtn = null;
let toolbarEl = null;
let gutterEl = null;
let savedEditables = [];
let trackedItems = [];

export function isPrintModeActive() {
  return isPrintMode;
}

function setOrientation(value) {
  orientation = value === 'landscape' ? 'landscape' : 'portrait';
  try { localStorage.setItem(STORAGE_KEY, orientation); } catch {}
  applyPageStyle();
  if (toolbarEl) {
    toolbarEl.querySelectorAll('[data-orientation]').forEach((btn) => {
      const active = btn.dataset.orientation === orientation;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }
}

function updateToolbarStatus() {
  if (!toolbarEl) return;
  const countEl = toolbarEl.querySelector('#note-print-selected-count');
  const toggleBtn = toolbarEl.querySelector('#btn-print-select-toggle');
  const toggleLabel = toggleBtn?.querySelector('.btn-toggle-label');

  const total = trackedItems.length;
  const selectedCount = trackedItems.filter(item => item.selected).length;

  if (countEl) {
    if (total === 0) {
      countEl.textContent = 'Nenhum bloco para imprimir';
    } else if (selectedCount === total) {
      countEl.textContent = `Todos os ${total} blocos selecionados`;
    } else {
      countEl.textContent = `${selectedCount} de ${total} blocos selecionados`;
    }
  }

  if (toggleLabel) {
    if (selectedCount > 0) {
      toggleLabel.textContent = 'Desmarcar Todos';
      toggleBtn.title = 'Desmarcar todos os blocos da impressão';
    } else {
      toggleLabel.textContent = 'Selecionar Todos';
      toggleBtn.title = 'Marcar todos os blocos para impressão';
    }
  }
}

function setItemState(itemObj, selected) {
  itemObj.selected = selected;
  const { el, handle } = itemObj;

  if (selected) {
    el.setAttribute('data-print-selected', 'true');
    el.classList.add('print-selected');
    el.classList.remove('print-excluded');
    if (handle) {
      handle.classList.add('is-checked');
      handle.classList.remove('is-unchecked');
      handle.setAttribute('aria-checked', 'true');
    }
  } else {
    el.setAttribute('data-print-selected', 'false');
    el.classList.remove('print-selected');
    el.classList.add('print-excluded');
    if (handle) {
      handle.classList.remove('is-checked');
      handle.classList.add('is-unchecked');
      handle.setAttribute('aria-checked', 'false');
    }
  }
}

function toggleItem(itemObj) {
  setItemState(itemObj, !itemObj.selected);
  updateToolbarStatus();
}

function createHandle(label = '') {
  const handle = document.createElement('div');
  handle.className = 'print-select-handle is-checked';
  handle.setAttribute('role', 'checkbox');
  handle.setAttribute('aria-checked', 'true');
  handle.setAttribute('tabindex', '0');
  handle.title = 'Clique para alternar inclusão na impressão';
  handle.innerHTML = `
    <span class="print-checkbox-indicator">
      <span class="qd-icon material-symbols-rounded">check</span>
    </span>
    ${label ? `<span class="print-handle-badge">${label}</span>` : ''}
  `;
  return handle;
}

function setupItem(itemObj) {
  const { el, handle } = itemObj;
  setItemState(itemObj, true);
  el.classList.add('print-selectable-item');

  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleItem(itemObj);
  });

  el.addEventListener('click', el._printClickHandler = (e) => {
    if (!isPrintMode) return;
    e.preventDefault();
    e.stopPropagation();
    toggleItem(itemObj);
  });

  handle.addEventListener('mouseenter', () => el.classList.add('print-hover'));
  handle.addEventListener('mouseleave', () => el.classList.remove('print-hover'));
  el.addEventListener('mouseenter', () => handle.classList.add('print-hover'));
  el.addEventListener('mouseleave', () => handle.classList.remove('print-hover'));
}

export function positionGutter() {
  if (!isPrintMode || !gutterEl) return;
  const editorContainer = document.querySelector('.note-editor');
  if (!editorContainer) return;

  const editorRect = editorContainer.getBoundingClientRect();
  const blocksContainer = document.getElementById('note-editor-blocks');
  const blocksRect = blocksContainer ? blocksContainer.getBoundingClientRect() : editorRect;

  // X fixo e IDÊNTICO para todos os checkboxes (estilo WhatsApp)
  // Alinhado no canal da margem esquerda da coluna de conteúdo
  const gutterX = Math.max(14, Math.round(blocksRect.left - editorRect.left + editorContainer.scrollLeft + 16));

  trackedItems.forEach(item => {
    const el = item.el;
    if (!el || !el.isConnected) return;
    const elRect = el.getBoundingClientRect();
    let targetTop = elRect.top - editorRect.top + editorContainer.scrollTop;

    if (item.type === 'cover') {
      targetTop += 16;
    } else if (item.type === 'header') {
      const titleEl = document.getElementById('note-header-title');
      if (titleEl) {
        targetTop = titleEl.getBoundingClientRect().top - editorRect.top + editorContainer.scrollTop + 6;
      } else {
        targetTop += 8;
      }
    } else if (item.type === 'properties') {
      targetTop += 8;
    } else if (item.type === 'block') {
      targetTop += 4;
    } else if (item.type === 'backlinks') {
      targetTop += 8;
    }

    item.handle.style.left = `${gutterX}px`;
    item.handle.style.top = `${Math.round(targetTop)}px`;
  });

  gutterEl.style.height = `${Math.max(editorContainer.scrollHeight, editorContainer.clientHeight)}px`;
}

export function enterPrintMode() {
  if (isPrintMode) return;

  // Fecha outros menus antes de entrar
  window.dispatchEvent(new CustomEvent('quickdock:close-cover-menu'));
  window.dispatchEvent(new CustomEvent('quickdock:close-icon-menu'));

  // Dispara evento para salvar qualquer edição de texto pendente antes de travar o editor
  document.dispatchEvent(new CustomEvent('quickdock:flush-pending-save'));

  isPrintMode = true;
  document.body.classList.add('is-print-mode');
  printBtn?.classList.add('active');
  printBtn?.setAttribute('aria-expanded', 'true');

  const editorContainer = document.querySelector('.note-editor');
  if (!editorContainer) return;

  // Trava contenteditable de todos os elementos para não haver edição durante o modo de seleção
  savedEditables = [];
  const editables = editorContainer.querySelectorAll('[contenteditable="true"]');
  editables.forEach(el => {
    savedEditables.push(el);
    el.setAttribute('contenteditable', 'false');
  });

  // Cria a barra superior de impressão
  toolbarEl = document.createElement('div');
  toolbarEl.id = 'note-print-toolbar';
  toolbarEl.className = 'note-print-toolbar';
  toolbarEl.innerHTML = `
    <div class="note-print-toolbar-left">
      <div class="note-print-icon-badge">
        <span class="qd-icon material-symbols-rounded">print</span>
      </div>
      <div class="note-print-toolbar-info">
        <span class="note-print-toolbar-title">Modo de Impressão</span>
        <span class="note-print-toolbar-count" id="note-print-selected-count">Carregando blocos...</span>
      </div>
    </div>
    <div class="note-print-toolbar-center">
      <div class="note-sidebar-tabs note-print-orientation-tabs" role="tablist" aria-label="Orientação do Papel">
        <button type="button" class="note-sidebar-tab ${orientation === 'portrait' ? 'active' : ''}" data-orientation="portrait" title="Orientação Retrato (Vertical)">
          <span class="note-sidebar-tab-title">Retrato</span>
        </button>
        <button type="button" class="note-sidebar-tab ${orientation === 'landscape' ? 'active' : ''}" data-orientation="landscape" title="Orientação Paisagem (Horizontal)">
          <span class="note-sidebar-tab-title">Paisagem</span>
        </button>
      </div>
      <button type="button" class="calendar-action-btn secondary btn-print-select-toggle" id="btn-print-select-toggle" title="Alternar seleção de todos os blocos">
        <span class="qd-icon material-symbols-rounded">checklist</span>
        <span class="btn-toggle-label">Desmarcar Todos</span>
      </button>
    </div>
    <div class="note-print-toolbar-right">
      <button type="button" class="calendar-action-btn primary btn-print-confirm" id="btn-print-confirm" title="Imprimir ou Salvar em PDF os blocos selecionados">
        <span class="qd-icon material-symbols-rounded">print</span>
        <span>Imprimir / Salvar PDF</span>
      </button>
      <button type="button" class="icon-btn btn-print-exit" id="btn-print-exit" title="Sair do modo de impressão (Esc)" aria-label="Sair">
        <span class="qd-icon material-symbols-rounded">close</span>
      </button>
    </div>
  `;

  editorContainer.insertBefore(toolbarEl, editorContainer.firstChild);

  // Cria a calha independente de checkboxes (estilo WhatsApp)
  // Ela é filha direta de .note-editor e NUNCA fica dentro dos blocos, garantindo 0 mutações no texto da nota
  gutterEl = document.createElement('div');
  gutterEl.id = 'note-print-gutter';
  gutterEl.className = 'note-print-gutter';
  editorContainer.appendChild(gutterEl);

  trackedItems = [];

  // 1. Capa
  const coverEl = document.querySelector('.note-cover');
  if (coverEl && !coverEl.hidden) {
    const handle = createHandle('Capa');
    gutterEl.appendChild(handle);
    const itemObj = { el: coverEl, handle, selected: true, type: 'cover' };
    setupItem(itemObj);
    trackedItems.push(itemObj);
  }

  // 2. Cabeçalho / Título
  const headerBarEl = document.getElementById('note-header-bar');
  if (headerBarEl) {
    const handle = createHandle('Título');
    gutterEl.appendChild(handle);
    const itemObj = { el: headerBarEl, handle, selected: true, type: 'header' };
    setupItem(itemObj);
    trackedItems.push(itemObj);
  }

  // 3. Propriedades
  const propsBarEl = document.getElementById('note-properties-bar');
  if (propsBarEl && !propsBarEl.hidden && propsBarEl.offsetHeight > 0) {
    const handle = createHandle('Propriedades');
    gutterEl.appendChild(handle);
    const itemObj = { el: propsBarEl, handle, selected: true, type: 'properties' };
    setupItem(itemObj);
    trackedItems.push(itemObj);
  }

  // 4. Blocos de Conteúdo
  const blocks = Array.from(document.querySelectorAll('#note-editor-blocks .block'));
  blocks.forEach((block) => {
    const handle = createHandle();
    gutterEl.appendChild(handle);
    const itemObj = { el: block, handle, selected: true, type: 'block' };
    setupItem(itemObj);
    trackedItems.push(itemObj);
  });

  // 5. Backlinks
  const backlinksSection = document.querySelector('.note-backlinks-section');
  if (backlinksSection && !backlinksSection.hidden && backlinksSection.offsetHeight > 0) {
    const handle = createHandle('Backlinks');
    gutterEl.appendChild(handle);
    const itemObj = { el: backlinksSection, handle, selected: true, type: 'backlinks' };
    setupItem(itemObj);
    trackedItems.push(itemObj);
  }

  // Posiciona todos os checkboxes na mesma linha vertical
  positionGutter();
  updateToolbarStatus();

  window.addEventListener('resize', positionGutter);

  // Eventos da toolbar
  toolbarEl.addEventListener('click', (e) => {
    const oriBtn = e.target.closest('[data-orientation]');
    if (oriBtn) {
      setOrientation(oriBtn.dataset.orientation);
      return;
    }

    if (e.target.closest('#btn-print-select-toggle')) {
      const anySelected = trackedItems.some(item => item.selected);
      const nextState = !anySelected;
      trackedItems.forEach(item => setItemState(item, nextState));
      updateToolbarStatus();
      return;
    }

    if (e.target.closest('#btn-print-confirm')) {
      executePrint();
      return;
    }

    if (e.target.closest('#btn-print-exit')) {
      exitPrintMode();
      return;
    }
  });

  toolbarEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function exitPrintMode() {
  if (!isPrintMode) return;
  isPrintMode = false;
  document.body.classList.remove('is-print-mode');
  printBtn?.classList.remove('active');
  printBtn?.setAttribute('aria-expanded', 'false');

  window.removeEventListener('resize', positionGutter);

  // Restaura contenteditable dos elementos travados
  savedEditables.forEach(el => {
    if (el.isConnected) el.setAttribute('contenteditable', 'true');
  });
  savedEditables = [];

  // Remove toolbar e calha de checkboxes
  if (toolbarEl) {
    toolbarEl.remove();
    toolbarEl = null;
  }
  if (gutterEl) {
    gutterEl.remove();
    gutterEl = null;
  }

  // Limpa classes e event listeners dos itens rastreados
  trackedItems.forEach(item => {
    item.el.classList.remove('print-selectable-item', 'print-selected', 'print-excluded', 'print-hover');
    item.el.removeAttribute('data-print-selected');
    if (item.el._printClickHandler) {
      item.el.removeEventListener('click', item.el._printClickHandler);
      delete item.el._printClickHandler;
    }
  });
  trackedItems = [];
}

export function executePrint() {
  const selectedCount = trackedItems.filter(item => item.selected).length;
  if (selectedCount === 0 && trackedItems.length > 0) {
    alert('Nenhum bloco selecionado. Por favor, marque pelo menos um bloco para imprimir.');
    return;
  }
  applyPageStyle();
  setTimeout(() => {
    window.print();
  }, 60);
}

function mount() {
  const viewActions = document.querySelector('#section-note .section-header-actions');
  printBtn = document.createElement('button');
  printBtn.id = 'btn-note-print';
  printBtn.type = 'button';
  printBtn.className = 'section-btn btn-print-note';
  printBtn.title = 'Modo de Impressão (Seleção de Blocos)';
  printBtn.setAttribute('aria-label', 'Modo de Impressão');
  printBtn.setAttribute('aria-haspopup', 'false');
  printBtn.setAttribute('aria-expanded', 'false');
  printBtn.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">print</span>';
  if (viewActions) {
    viewActions.insertBefore(printBtn, viewActions.firstChild);
  } else if (headerBar) {
    headerBar.appendChild(printBtn);
  }

  setOrientation(orientation);

  printBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isPrintMode) {
      exitPrintMode();
    } else {
      enterPrintMode();
    }
  });

  // Tecla Esc sai do modo de impressão
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPrintMode) {
      exitPrintMode();
    }
  });

  // Ao trocar ou fechar nota, sai do modo de impressão
  document.addEventListener('quickdock:note-selected', () => {
    if (isPrintMode) exitPrintMode();
  });
  document.addEventListener('quickdock:note-title-committed', () => {
    if (isPrintMode) updateToolbarStatus();
  });

  // Ctrl+P / Cmd+P aciona o modo de impressão com seleção
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (!isPrintMode) {
        enterPrintMode();
      } else {
        executePrint();
      }
    }
  });
}

mount();
window.addEventListener('beforeprint', applyPageStyle);
