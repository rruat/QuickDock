// ── paste-grid.js ───────────────────────────────────────────────────────────
// Colar de planilha na tabela — PURO. Converte o texto da área de transferência (TSV do
// Excel/Sheets, com aspas e quebras de linha dentro de célula) em grade e planeja as gravações.
// Tudo ou nada: se QUALQUER célula for inválida, nada é gravado e os erros são devolvidos.

import { parsePropertyInput } from '../bases-schema.js';

/** TSV com aspas ("a ""b"" c", quebras dentro de aspas). Remove a linha final vazia que planilhas adicionam. */
export function parseClipboardGrid(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  const t = String(texto ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === '') aspas = true;
    else if (c === '\t') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

const NAO_COLAVEIS = new Set(['title', 'folder', 'createdAt', 'updatedAt', 'tasks']);
const COLAVEIS = new Set(['text', 'number', 'date', 'checkbox', 'select', 'url', 'list', 'link', 'email', 'phone']);

/**
 * @param {string[][]} grade
 * @param {{ row:number, col:number }} inicio  célula ativa (índices em `notas` e `colunas`)
 * @param {Array} notas  linhas visíveis, na ordem da tabela
 * @param {string[]} colunas  chaves das colunas, na ordem
 * @param {Object} schema
 * @returns {{ writes: Array<{ noteId, key, value, type }>, errors: Array<{ row, col, key, motivo }>, skipped: number }}
 */
export function planPaste(grade, inicio, notas, colunas, schema) {
  const writes = [], errors = [];
  let skipped = 0;
  grade.forEach((linha, r) => {
    const nota = notas[inicio.row + r];
    if (!nota) { skipped += linha.length; return; }              // além da última linha: não cria notas
    linha.forEach((bruto, c) => {
      const key = colunas[inicio.col + c];
      if (key === undefined) { skipped++; return; }               // além da última coluna
      const def = schema[key] || {};
      const tipo = def.type || 'text';
      if (NAO_COLAVEIS.has(key) || def.isDerived || def.isUniqueId || def.isSystem || !COLAVEIS.has(tipo)) {
        errors.push({ row: inicio.row + r, col: inicio.col + c, key, motivo: 'esta coluna não pode ser editada' });
        return;
      }
      const txt = String(bruto).trim();
      if (txt === '') { writes.push({ noteId: nota.id, key, value: null, type: tipo }); return; }   // vazio limpa
      if (tipo === 'number') {
        const n = parsePropertyInput(txt, 'number');
        if (n === null) { errors.push({ row: inicio.row + r, col: inicio.col + c, key, motivo: `"${txt}" não é um número` }); return; }
        writes.push({ noteId: nota.id, key, value: n, type: tipo }); return;
      }
      if (tipo === 'date') {
        const d = parsePropertyInput(txt, 'date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) { errors.push({ row: inicio.row + r, col: inicio.col + c, key, motivo: `"${txt}" não é uma data (use dd/mm/aaaa ou aaaa-mm-dd)` }); return; }
        writes.push({ noteId: nota.id, key, value: d, type: tipo }); return;
      }
      if (tipo === 'checkbox') {
        const v = /^(sim|true|verdadeiro|1|x|✓)$/i.test(txt) ? true : /^(n[aã]o|false|falso|0|)$/i.test(txt) ? false : null;
        if (v === null) { errors.push({ row: inicio.row + r, col: inicio.col + c, key, motivo: `"${txt}" não é sim/não` }); return; }
        writes.push({ noteId: nota.id, key, value: v, type: tipo }); return;
      }
      if (tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt)) { errors.push({ row: inicio.row + r, col: inicio.col + c, key, motivo: `"${txt}" não é um e-mail` }); return; }
      if (tipo === 'phone' && (txt.match(/\d/g) || []).length < 6) { errors.push({ row: inicio.row + r, col: inicio.col + c, key, motivo: `"${txt}" não parece um telefone` }); return; }
      writes.push({ noteId: nota.id, key, value: parsePropertyInput(txt, ['select', 'email', 'phone'].includes(tipo) ? 'text' : tipo), type: tipo });
    });
  });
  return { writes, errors, skipped };
}

/** Agrupa as gravações por nota → patches prontos para updateNoteMetaById (não muta as notas). */
export function writesToPatches(writes, notas) {
  const porNota = new Map();
  for (const w of writes) {
    if (!porNota.has(w.noteId)) porNota.set(w.noteId, []);
    porNota.get(w.noteId).push(w);
  }
  const out = [];
  for (const [id, ws] of porNota) {
    const nota = notas.find(n => n.id === id);
    const properties = { ...(nota?.properties || {}) };
    const propertyTypes = { ...(nota?.propertyTypes || {}) };
    for (const w of ws) {
      if (w.value === null || w.value === undefined) delete properties[w.key];
      else { properties[w.key] = w.value; propertyTypes[w.key] = w.type; }
    }
    out.push({ id, patch: { properties, propertyTypes } });
  }
  return out;
}
