// ── note-table.js ────────────────────────────────────────────────────────────
// Operações e renderização de tabelas no editor de blocos.
// Suporta criação de células editáveis, botões de linha/coluna, navegação por
// teclado (Tab para próxima célula / criar linha no fim) e colar do Excel/TSV.

import { tableToSourceText, parseTableMarkdown } from '../blocks.js';

export const DEFAULT_TABLE = [['', ''], ['', '']];

let _callbacks = {
  getRoot: () => null,
  captureUndoPoint: () => {},
  scheduleSave: () => {},
  escHtml: (str) => str,
  createBlockEl: (type, html, checked, rows) => null,
  currentBlock: () => null,
  getContentEl: (el) => el,
  renumberLists: () => {},
  sanitizeForSave: (html) => html,
  showFeedback: () => {},
};

export function initNoteTable(callbacks) {
  _callbacks = { ..._callbacks, ...callbacks };
}

export function buildCell(isHeader, html, align = null) {
  const cell = document.createElement(isHeader ? 'th' : 'td');
  cell.className = 'table-cell';
  cell.contentEditable = 'true';
  cell.innerHTML = html || '<br>';
  if (align) cell.dataset.align = align;
  return cell;
}

export function buildTableEl(rows, align = null) {
  const data   = rows?.length ? rows : DEFAULT_TABLE;
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');

  data.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach((html, c) => tr.appendChild(buildCell(r === 0, html, align?.[c] ?? null)));
    table.appendChild(tr);
  });

  scroll.appendChild(table);
  return scroll;
}

// ── Alinhamento por coluna ──────────────────────────────────────────────────
// Vive nas células (`data-align`) e vale para a coluna inteira; no markdown é a linha separadora
// (`:---`, `:---:`, `---:`).
export function tableAligns(table) {
  return [...(table.rows[0]?.cells ?? [])].map(c => c.dataset.align || null);
}

export function setColumnAlign(table, index, align) {
  for (const tr of table.rows) {
    const cell = tr.cells[index];
    if (!cell) continue;
    if (align) cell.dataset.align = align; else delete cell.dataset.align;
  }
}

export function buildTableTools() {
  const bar = document.createElement('div');
  bar.className = 'table-tools';
  bar.contentEditable = 'false';
  const acts = [
    ['add-row', '+ linha',  'Adicionar linha abaixo da atual'],
    ['add-col', '+ coluna', 'Adicionar coluna à direita da atual'],
    ['del-row', '− linha',  'Remover a linha do cursor'],
    ['del-col', '− coluna', 'Remover a coluna do cursor'],
  ];
  for (const [act, label, title] of acts) {
    const btn = document.createElement('button');
    btn.className   = 'table-btn';
    btn.dataset.act = act;
    btn.textContent = label;
    btn.title       = title;
    bar.appendChild(btn);
  }
  // Alinhar a coluna do cursor (tocar de novo tira o alinhamento)
  for (const [act, icone, title] of [
    ['align-left',   'format_align_left',   'Alinhar a coluna à esquerda'],
    ['align-center', 'format_align_center', 'Centralizar a coluna'],
    ['align-right',  'format_align_right',  'Alinhar a coluna à direita'],
  ]) {
    const btn = document.createElement('button');
    btn.className   = 'table-btn table-btn-align';
    btn.dataset.act = act;
    btn.title       = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML   = `<span class="material-symbols-rounded" aria-hidden="true">${icone}</span>`;
    bar.appendChild(btn);
  }
  return bar;
}

// ── Estrutura em markdown (visível com o cursor na tabela) ───────────────────────
// Como o `# ` de um título, o markdown da tabela aparece quando o cursor está nela: um painel logo
// abaixo, com as colunas alinhadas e a linha de alinhamento. Dá para EDITAR ali (escrever
// `**negrito**`, `[link](url)`, mudar `:---:`): a tabela acima é refeita a partir do texto.
// Cursor numa célula → o painel espelha a tabela; cursor no painel → a tabela espelha o painel.
const ESPERA_APLICAR_MS = 350;

export function buildTableSource() {
  const painel = document.createElement('div');
  painel.className = 'table-source';
  painel.hidden = true;
  painel.spellcheck = false;
  painel.setAttribute('role', 'textbox');
  painel.setAttribute('aria-multiline', 'true');
  painel.setAttribute('aria-label', 'Estrutura da tabela em markdown');
  painel.contentEditable = 'plaintext-only';
  if (painel.contentEditable !== 'plaintext-only') painel.contentEditable = 'true';   // navegador sem plaintext-only
  painel.addEventListener('input', () => {
    clearTimeout(painel._timer);
    painel._timer = setTimeout(() => aplicarEstrutura(painel.closest('.block-table')), ESPERA_APLICAR_MS);
  });
  painel.addEventListener('focus', () => { painel._desfazerFeito = false; });
  return painel;
}

function painelDe(bloco) {
  return bloco?.querySelector?.(':scope > .table-source') ?? null;
}

function linhasDa(table) {
  return [...table.rows].map(tr => [...tr.cells].map(c => _callbacks.sanitizeForSave(c.innerHTML)));
}

/** Atualiza o texto do painel com o que está na tabela (não mexe se a pessoa está digitando nele). */
export function refreshTableSource(bloco) {
  const painel = painelDe(bloco);
  const table = bloco?.querySelector?.('table');
  if (!painel || !table || painel.hidden) return;
  if (painel.contains(document.activeElement) || painel === document.activeElement) return;
  painel.textContent = tableToSourceText(linhasDa(table), tableAligns(table));
  painel.classList.remove('is-invalid');
}

export function showTableSource(bloco) {
  const painel = painelDe(bloco);
  if (!painel || !painel.hidden) return;
  painel.hidden = false;
  refreshTableSource(bloco);
}

/** O cursor saiu da tabela: aplica o que estava pendente no painel e o esconde. */
export function hideTableSource(bloco) {
  const painel = painelDe(bloco);
  if (!painel || painel.hidden) return;
  if (painel._timer) { clearTimeout(painel._timer); painel._timer = null; aplicarEstrutura(bloco, { aoSair: true }); }
  painel.hidden = true;
}

/** Refaz a tabela a partir do texto do painel. Texto que deixou de ser tabela não destrói nada. */
function aplicarEstrutura(bloco, { aoSair = false } = {}) {
  const painel = painelDe(bloco);
  if (!painel || !bloco?.isConnected) return false;
  const lido = parseTableMarkdown(painel.innerText ?? painel.textContent);
  if (!lido) {
    painel.classList.add('is-invalid');
    if (aoSair) _callbacks.showFeedback?.('A estrutura da tabela estava inválida: mantive a tabela como estava.');
    return false;
  }
  painel.classList.remove('is-invalid');
  if (!painel._desfazerFeito) { _callbacks.captureUndoPoint(); painel._desfazerFeito = true; }
  const atual = bloco.querySelector('.table-scroll');
  atual?.replaceWith(buildTableEl(lido.rows, lido.align));
  _callbacks.scheduleSave();
  return true;
}

export function focusedCell() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const cell = node?.closest?.('.table-cell');
  const root = _callbacks.getRoot();
  return cell && (!root || root.contains(cell)) ? cell : null;
}

export function focusCell(cell) {
  if (!cell) return;
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function addTableRow(table, afterIndex) {
  const cols = table.rows[0]?.cells.length ?? 2;
  const aligns = tableAligns(table);
  const tr   = table.insertRow(Math.min(afterIndex + 1, table.rows.length));
  for (let i = 0; i < cols; i++) tr.appendChild(buildCell(false, '', aligns[i] ?? null));
  return tr;
}

export function addTableCol(table, afterIndex) {
  [...table.rows].forEach((tr, r) => {
    tr.insertBefore(buildCell(r === 0, ''), tr.cells[afterIndex + 1] ?? null);
  });
}

export function delTableRow(table, index) {
  if (table.rows.length <= 2 || index === 0) return;
  table.deleteRow(index);
}

export function delTableCol(table, index) {
  if ((table.rows[0]?.cells.length ?? 0) <= 1) return;
  [...table.rows].forEach(tr => tr.cells[index]?.remove());
}

export function moveCell(cell, delta) {
  const table = cell.closest('table');
  const cells = [...table.querySelectorAll('.table-cell')];
  const i     = cells.indexOf(cell);

  // Tab na última célula cria uma linha, em vez de sair da tabela.
  if (delta > 0 && i === cells.length - 1) {
    _callbacks.captureUndoPoint();
    addTableRow(table, table.rows.length - 1);
    _callbacks.scheduleSave();
    refreshTableSource(table.closest('.block-table'));
    focusCell([...table.querySelectorAll('.table-cell')][i + 1]);
    return;
  }
  focusCell(cells[i + delta]);
}

export function handleTableButtonClick(btn) {
  const table = btn.closest('.block-table')?.querySelector('table');
  if (!table) return;

  const cell = focusedCell();
  const r = cell?.closest('tr')?.rowIndex ?? table.rows.length - 1;
  const c = cell?.cellIndex ?? (table.rows[0].cells.length - 1);

  _callbacks.captureUndoPoint();
  switch (btn.dataset.act) {
    case 'add-row': addTableRow(table, r); break;
    case 'add-col': addTableCol(table, c); break;
    case 'del-row': delTableRow(table, r); break;
    case 'del-col': delTableCol(table, c); break;
    case 'align-left': case 'align-center': case 'align-right': {
      const alvo = btn.dataset.act.slice('align-'.length);
      setColumnAlign(table, c, tableAligns(table)[c] === alvo ? null : alvo);   // tocar de novo desfaz
      break;
    }
  }
  refreshTableSource(btn.closest('.block-table'));
  _callbacks.scheduleSave();
}

function cellText(el) {
  return _callbacks.escHtml(el.textContent.replace(/\s+/g, ' ').trim());
}

export function normalizeGrid(rows) {
  const cols = Math.max(...rows.map(r => r.length));
  const out = rows.map(r => [...r, ...Array(cols - r.length).fill('')]);
  if (out.length === 1) out.push(Array(cols).fill(''));
  return out;
}

export function parseClipboardTable(html) {
  if (!html || !/<table/i.test(html)) return null;
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
  if (!table) return null;
  const rows = [...table.rows].map(tr => [...tr.cells].map(cellText));
  if (!rows.length || !rows[0].length) return null;
  return normalizeGrid(rows);
}

export function parseTsvTable(text) {
  if (!text.includes('\t')) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.length > 0);
  if (lines.length < 2) return null;
  return normalizeGrid(lines.map(l => l.split('\t').map(c => _callbacks.escHtml(c.trim()))));
}

export function insertTableBlock(rows) {
  const root = _callbacks.getRoot();
  const block = _callbacks.currentBlock() ?? root?.lastElementChild;
  if (!block) return;

  _callbacks.captureUndoPoint();
  const table = _callbacks.createBlockEl('table', '', false, rows);

  const empty = block.dataset.type !== 'table' && !_callbacks.getContentEl(block).textContent.trim();
  if (empty) block.replaceWith(table);
  else block.after(table);

  if (!table.nextElementSibling) table.after(_callbacks.createBlockEl('paragraph'));
  focusCell(table.querySelector('.table-cell'));
  _callbacks.renumberLists();
  _callbacks.scheduleSave();
}
