// ── note-table-source.js ────────────────────────────────────────────────────
// Modo "texto" da tabela, como o bloco de código mostra as cercas: com o cursor na tabela, ela vira
// o MARKDOWN editável (colunas alinhadas, linha `| --- | :---: |`); ao sair, volta a ser tabela.
// Dentro dele vale tudo que o markdown vale — `**negrito**`, `*itálico*`, `[link](url)`, e o
// alinhamento pela linha separadora.
//
//   entrar: cursor numa célula → a grade some e o texto aparece, com o cursor na mesma célula;
//   editar: a cada pausa o texto refaz a grade (escondida), para o salvamento nunca ficar velho;
//   sair:   texto aplicado; se deixou de ser tabela, vira parágrafos (nada digitado se perde).
// A barra "+ linha / + coluna / alinhar" continua valendo: age sobre o texto, na célula do cursor.

import { tableToSourceText, parseTableMarkdown } from '../blocks.js';
import { buildTableEl, tableAligns, focusedCell, getTableCallbacks } from './note-table.js';

const ESPERA_APLICAR_MS = 350;

const cb = () => getTableCallbacks();

// ── Montagem ────────────────────────────────────────────────────────────────
export function buildTableSource() {
  const painel = document.createElement('div');
  painel.className = 'table-source';
  painel.hidden = true;
  painel.spellcheck = false;
  painel.setAttribute('role', 'textbox');
  painel.setAttribute('aria-multiline', 'true');
  painel.setAttribute('aria-label', 'Tabela em markdown');
  painel.contentEditable = 'plaintext-only';
  if (painel.contentEditable !== 'plaintext-only') painel.contentEditable = 'true';   // navegador sem plaintext-only

  painel.addEventListener('input', () => {
    clearTimeout(painel._timer);
    painel._timer = setTimeout(() => { painel._timer = null; aplicar(blocoDe(painel)); }, ESPERA_APLICAR_MS);
  });
  painel.addEventListener('keydown', aoTeclar);
  return painel;
}

const blocoDe = painel => painel.closest('.block-table');
const painelDe = bloco => bloco?.querySelector?.(':scope > .table-source') ?? null;
const grade = bloco => bloco?.querySelector?.(':scope > .table-scroll') ?? null;
export const tableSourceActive = bloco => !!bloco?.classList?.contains('is-source');

function linhasDa(table) {
  return [...table.rows].map(tr => [...tr.cells].map(c => cb().sanitizeForSave(c.innerHTML)));
}

// ── Posições no texto ───────────────────────────────────────────────────────
/** Onde começa e termina o conteúdo de cada célula no texto (a linha `| --- |` não tem células). */
export function celulasDoTexto(texto) {
  const out = [];
  let offset = 0;
  texto.split('\n').forEach((linha, i) => {
    if (i !== 1) {
      const barras = [];
      for (let k = 0; k < linha.length; k++) if (linha[k] === '|' && linha[k - 1] !== '\\') barras.push(k);
      for (let p = 0; p < barras.length - 1; p++) {
        const seg = linha.slice(barras[p] + 1, barras[p + 1]);
        const conteudo = seg.trim();
        const folga = seg.length - seg.trimStart().length;
        const ini = offset + barras[p] + 1 + (conteudo ? folga : Math.min(folga, 1));
        out.push({ row: i === 0 ? 0 : i - 1, col: p, inicio: ini, fim: ini + conteudo.length });
      }
    }
    offset += linha.length + 1;
  });
  return out;
}

function posicaoNoTexto(painel) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !painel.contains(sel.anchorNode)) return 0;
  const r = document.createRange();
  r.selectNodeContents(painel);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString().length;
}

function colocarCursor(painel, pos) {
  const no = painel.firstChild;
  const sel = document.getSelection();
  const r = document.createRange();
  if (no && no.nodeType === Node.TEXT_NODE) r.setStart(no, Math.max(0, Math.min(pos, no.length)));
  else r.setStart(painel, 0);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Linha e coluna (da tabela, sem contar a linha `---`) onde está o cursor do painel. */
function celulaDoCursor(painel) {
  const texto = painel.textContent;
  const pos = Math.min(posicaoNoTexto(painel), texto.length);
  const antes = texto.slice(0, pos);
  const linha = antes.split('\n').length - 1;
  const linhaTxt = antes.slice(antes.lastIndexOf('\n') + 1);
  let barras = 0;
  for (let k = 0; k < linhaTxt.length; k++) if (linhaTxt[k] === '|' && linhaTxt[k - 1] !== '\\') barras++;
  return { row: linha <= 1 ? 0 : linha - 1, col: Math.max(0, barras - 1) };
}

// ── Entrar e sair ───────────────────────────────────────────────────────────
/** O cursor entrou na tabela: a grade vira o texto, com o cursor na célula em que estava. */
export function showTableSource(bloco) {
  const painel = painelDe(bloco);
  const table = bloco?.querySelector?.('table');
  if (!painel || !table || tableSourceActive(bloco)) return;

  const celula = focusedCell();
  let alvo = { row: 0, col: 0, k: 0 };
  if (celula && bloco.contains(celula)) {
    const sel = document.getSelection();
    let k = 0;
    if (sel?.rangeCount) {
      const r = document.createRange();
      r.selectNodeContents(celula);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      k = r.toString().replace(/[​]/g, '').length;
    }
    alvo = { row: celula.parentElement.rowIndex, col: celula.cellIndex, k };
  }

  const texto = tableToSourceText(linhasDa(table), tableAligns(table));
  bloco.classList.add('is-source');
  grade(bloco).hidden = true;
  painel.hidden = false;
  painel.classList.remove('is-invalid');
  painel.textContent = texto;
  painel._desfazerFeito = false;
  painel.focus({ preventScroll: true });

  const cel = celulasDoTexto(texto).find(c => c.row === alvo.row && c.col === alvo.col);
  colocarCursor(painel, cel ? cel.inicio + Math.min(alvo.k, cel.fim - cel.inicio) : 0);
}

/** O cursor saiu da tabela: o texto é aplicado e a grade volta. Texto que deixou de ser tabela vira parágrafos. */
export function hideTableSource(bloco) {
  const painel = painelDe(bloco);
  if (!painel || !tableSourceActive(bloco) || !bloco.isConnected) return;
  clearTimeout(painel._timer);
  painel._timer = null;

  const lido = parseTableMarkdown(painel.innerText ?? painel.textContent);
  if (!lido) { virarParagrafos(bloco, painel); return; }

  aplicar(bloco, lido);
  bloco.classList.remove('is-source');
  painel.hidden = true;
  const g = grade(bloco);
  if (g) g.hidden = false;
}

function virarParagrafos(bloco, painel) {
  const linhas = (painel.innerText ?? painel.textContent).replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  cb().captureUndoPoint();
  const paragrafos = linhas.map(l => cb().createBlockEl('paragraph', cb().escHtml(l)));
  if (paragrafos.length) bloco.replaceWith(...paragrafos); else bloco.remove();
  cb().renumberLists();
  cb().scheduleSave();
  cb().showFeedback?.('A tabela virou texto: a estrutura (a linha | --- | e as barras) deixou de estar completa.');
}

/** Refaz a grade (escondida) a partir do texto. Devolve false se o texto ainda não é uma tabela. */
function aplicar(bloco, lido = null) {
  const painel = painelDe(bloco);
  if (!painel || !bloco?.isConnected) return false;
  const dados = lido ?? parseTableMarkdown(painel.innerText ?? painel.textContent);
  if (!dados) { painel.classList.add('is-invalid'); return false; }
  painel.classList.remove('is-invalid');
  if (!painel._desfazerFeito) { cb().captureUndoPoint(); painel._desfazerFeito = true; }
  const nova = buildTableEl(dados.rows, dados.align);
  nova.hidden = tableSourceActive(bloco);
  grade(bloco)?.replaceWith(nova);
  cb().scheduleSave();
  return true;
}

// ── Teclado dentro do texto ─────────────────────────────────────────────────
function irParaBloco(bloco, depois) {
  const vizinho = depois ? bloco.nextElementSibling : bloco.previousElementSibling;
  if (depois) {
    const alvo = vizinho ?? (() => { const p = cb().createBlockEl('paragraph'); bloco.after(p); return p; })();
    cb().focusBlockStart(alvo);
  } else if (vizinho) {
    cb().focusBlockEnd(vizinho);
  }
}

function aoTeclar(e) {
  const painel = e.currentTarget;
  const bloco = blocoDe(painel);
  if (e.key === 'Escape') { e.preventDefault(); irParaBloco(bloco, true); return; }

  if (e.key === 'Tab') {
    e.preventDefault();
    moverEntreCelulas(painel, e.shiftKey ? -1 : 1);
    return;
  }

  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const texto = painel.textContent;
    const pos = posicaoNoTexto(painel);
    const linha = texto.slice(0, pos).split('\n').length - 1;
    const ultima = texto.split('\n').length - 1;
    if (e.key === 'ArrowUp' && linha === 0) { e.preventDefault(); irParaBloco(bloco, false); }
    if (e.key === 'ArrowDown' && linha >= ultima) { e.preventDefault(); irParaBloco(bloco, true); }
  }
}

/** Tab / Shift+Tab: pula para a célula seguinte/anterior; no fim da tabela, abre uma linha nova. */
function moverEntreCelulas(painel, delta) {
  const texto = painel.textContent;
  const pos = posicaoNoTexto(painel);
  const celulas = celulasDoTexto(texto);
  if (!celulas.length) return;
  let i = celulas.findIndex(c => pos >= c.inicio && pos <= c.fim);
  if (i < 0) i = celulas.findIndex(c => c.inicio >= pos) - (delta > 0 ? 1 : 0);
  const alvo = i + delta;
  if (alvo >= celulas.length) {
    aplicarFerramenta(blocoDe(painel), 'add-row-end');
    return;
  }
  colocarCursor(painel, celulas[Math.max(0, alvo)].inicio);
}

// ── Barra "+ linha / + coluna / alinhar" agindo sobre o texto ───────────────────
/** Devolve true se tratou o clique (a tabela está no modo texto). */
export function handleTableToolInSource(btn) {
  const bloco = btn.closest('.block-table');
  if (!tableSourceActive(bloco)) return false;
  aplicarFerramenta(bloco, btn.dataset.act);
  return true;
}

function aplicarFerramenta(bloco, acao) {
  const painel = painelDe(bloco);
  const dados = parseTableMarkdown(painel.innerText ?? painel.textContent);
  if (!dados) return;
  const { row, col } = celulaDoCursor(painel);
  const cols = dados.rows[0].length;
  const r = Math.min(row, dados.rows.length - 1);
  const c = Math.min(col, cols - 1);
  let { rows, align } = dados;
  let novaLinha = r, novaCol = c;

  switch (acao) {
    case 'add-row':
      rows = [...rows.slice(0, r + 1), Array(cols).fill(''), ...rows.slice(r + 1)]; novaLinha = r + 1; break;
    case 'add-row-end':
      rows = [...rows, Array(cols).fill('')]; novaLinha = rows.length - 1; novaCol = 0; break;
    case 'add-col':
      rows = rows.map(l => [...l.slice(0, c + 1), '', ...l.slice(c + 1)]);
      align = [...align.slice(0, c + 1), null, ...align.slice(c + 1)]; novaCol = c + 1; break;
    case 'del-row':
      if (rows.length <= 2 || r === 0) return;
      rows = rows.filter((_, i) => i !== r); novaLinha = Math.min(r, rows.length - 1); break;
    case 'del-col':
      if (cols <= 1) return;
      rows = rows.map(l => l.filter((_, i) => i !== c)); align = align.filter((_, i) => i !== c); novaCol = Math.min(c, cols - 2); break;
    case 'align-left': case 'align-center': case 'align-right': {
      const alvo = acao.slice('align-'.length);
      align = align.map((a, i) => (i === c ? (a === alvo ? null : alvo) : a)); break;
    }
    default: return;
  }

  const texto = tableToSourceText(rows, align);
  painel.textContent = texto;
  painel.focus({ preventScroll: true });
  const cel = celulasDoTexto(texto).find(x => x.row === novaLinha && x.col === novaCol);
  colocarCursor(painel, cel ? cel.inicio : 0);
  clearTimeout(painel._timer);
  painel._timer = null;
  aplicar(bloco);
}
