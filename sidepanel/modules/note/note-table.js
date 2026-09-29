// ── note-table.js ────────────────────────────────────────────────────────────
// Operações e renderização de tabelas no editor de blocos.
// Suporta criação de células editáveis, botões de linha/coluna, navegação por
// teclado (Tab para próxima célula / criar linha no fim) e colar do Excel/TSV.

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
};

export function initNoteTable(callbacks) {
  _callbacks = { ..._callbacks, ...callbacks };
}

export function buildCell(isHeader, html) {
  const cell = document.createElement(isHeader ? 'th' : 'td');
  cell.className = 'table-cell';
  cell.contentEditable = 'true';
  cell.innerHTML = html || '<br>';
  return cell;
}

export function buildTableEl(rows) {
  const data   = rows?.length ? rows : DEFAULT_TABLE;
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');

  data.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach(html => tr.appendChild(buildCell(r === 0, html)));
    table.appendChild(tr);
  });

  scroll.appendChild(table);
  return scroll;
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
  return bar;
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
  const tr   = table.insertRow(Math.min(afterIndex + 1, table.rows.length));
  for (let i = 0; i < cols; i++) tr.appendChild(buildCell(false, ''));
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
  }
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
