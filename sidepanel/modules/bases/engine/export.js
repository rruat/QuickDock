// ── export.js ───────────────────────────────────────────────────────────────
// Exportação das notas visíveis de uma view: CSV (UTF-8 com BOM, abre certo no Excel),
// tabela em Markdown e JSON. PURO — quem baixa o arquivo é a UI.

import { getNotePropertyValue } from '../bases-engine.js';
import { formatPropertyValue } from '../bases-schema.js';

const vazio = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Texto "humano" de um valor (listas com "; ", sim/não, tarefas como x/y). */
export function cellText(note, key, def = {}) {
  const raw = getNotePropertyValue(note, key);
  if (vazio(raw)) return '';
  if (Array.isArray(raw)) return raw.map(String).join('; ');
  if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não';
  if (def.type === 'tasks' && raw && typeof raw === 'object') return `${raw.checked || 0}/${raw.total || 0}`;
  if (raw && typeof raw === 'object') {
    if ('lat' in raw && 'lng' in raw) return `${raw.name ? `${raw.name} ` : ''}(${raw.lat}, ${raw.lng})`;
    if ('start' in raw) return raw.end && raw.end !== raw.start ? `${raw.start} → ${raw.end}` : String(raw.start);
    return JSON.stringify(raw);
  }
  const f = formatPropertyValue(raw, def.type, { ...def, format: undefined });
  return typeof f === 'string' ? f : Array.isArray(f) ? f.join('; ') : String(raw);
}

/**
 * Protege contra "injeção de fórmula" em planilhas: texto que começa com = + - @ (ou tab/CR)
 * seria executado pelo Excel/Sheets. Números de verdade (ex.: -5) não são alterados.
 */
export function guardSpreadsheet(texto) {
  if (/^[=+\-@\t\r]/.test(texto) && !/^[+-]?\d+([.,]\d+)?$/.test(texto)) return `'${texto}`;
  return texto;
}

const csvCampo = t => (/[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

export function toCsv(notes, columns, schema, { bom = true } = {}) {
  const cab = columns.map(k => csvCampo(guardSpreadsheet(schema[k]?.label || k)));
  const linhas = notes.map(n => columns.map(k => csvCampo(guardSpreadsheet(cellText(n, k, schema[k])))).join(','));
  return (bom ? '﻿' : '') + [cab.join(','), ...linhas].join('\r\n') + '\r\n';
}

const mdCampo = t => t.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function toMarkdownTable(notes, columns, schema) {
  const cab = `| ${columns.map(k => mdCampo(schema[k]?.label || k)).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const linhas = notes.map(n => `| ${columns.map(k => mdCampo(cellText(n, k, schema[k]))).join(' | ')} |`);
  return [cab, sep, ...linhas].join('\n') + '\n';
}

export function toJson(notes, columns, schema) {
  return JSON.stringify(notes.map(n => Object.fromEntries(columns.map(k => [k, getNotePropertyValue(n, k) ?? null]))), null, 2) + '\n';
}

/** Nome de arquivo seguro: sem barras/aspas, com data local. */
export function exportFileName(baseName, ext, now = new Date()) {
  const limpo = String(baseName || 'base').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'base';
  const z = n => String(n).padStart(2, '0');
  return `${limpo}-${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}.${ext}`;
}
