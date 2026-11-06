import { root } from './state.js';
import { scheduleSave } from './template-mode.js';
import { captureUndoPoint } from './undo.js';

export const DEFAULT_TABLE = [['', ''], ['', '']];

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
  return cell && root.contains(cell) ? cell : null;
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
    captureUndoPoint();
    addTableRow(table, table.rows.length - 1);
    scheduleSave();
    focusCell([...table.querySelectorAll('.table-cell')][i + 1]);
    return;
  }
  focusCell(cells[i + delta]);
}

root.addEventListener('mousedown', e => {
  if (!e.target.closest('.table-btn')) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

root.addEventListener('click', e => {
  const btn = e.target.closest('.table-btn');
  if (!btn) return;
  const table = btn.closest('.block-table')?.querySelector('table');
  if (!table) return;

  // Sem cursor em célula, a ação cai na última linha/coluna.
  const cell = focusedCell();
  const r = cell?.closest('tr')?.rowIndex ?? table.rows.length - 1;
  const c = cell?.cellIndex ?? (table.rows[0].cells.length - 1);

  captureUndoPoint();
  switch (btn.dataset.act) {
    case 'add-row': addTableRow(table, r); break;
    case 'add-col': addTableCol(table, c); break;
    case 'del-row': delTableRow(table, r); break;
    case 'del-col': delTableCol(table, c); break;
  }
  scheduleSave();
});
