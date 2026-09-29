// Detecção inteligente de CPF/CNPJ/telefone/data/CEP/e-mail/cálculo em texto,
// menu de cópia rápida e menu de resultado de cálculo, e o indicador visual
// de feedback ("copiado!", modo Ctrl/toque ativo).
import { escHtml } from './blocks.js';
import { tryParseMath } from './math-parser.js';
import { indicator, noteSection } from './note-state.js';
import {
  isTouchSelectionMode, setTouchSelectionMode, getIsCtrlHeld, setIsCtrlHeld,
  getIndicatorTimer, setIndicatorTimer,
} from './note.js';

let activeMenu = null;
export const mathCache = new Map(); // expr raw → resultado parseado

// ── Utilitários de data ───────────────────────────────────────────────────────
function parseDate(raw) {
  const s = raw.trim();
  let day, month, year;

  if (/^\d{8}$/.test(s)) {
    year = +s.slice(0, 4); month = +s.slice(4, 6); day = +s.slice(6, 8);
  } else if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(s)) {
    [year, month, day] = s.split(/[-\/]/).map(Number);
  } else if (/^\d{2}[\/\-\. ]\d{2}[\/\-\. ]\d{4}$/.test(s)) {
    [day, month, year] = s.split(/[\/\-\. ]/).map(Number);
  } else {
    return null;
  }

  if (!day || !month || !year) return null;
  if (month < 1 || month > 12) return null;
  if (day   < 1 || day   > 31) return null;
  if (year  < 1900 || year > new Date().getFullYear()) return null;

  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function calculateAge(date) {
  const now = new Date();
  let age   = now.getFullYear() - date.getFullYear();
  const m   = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age--;
  return age;
}

function formatDateBR(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

const ATE_RE = /[ \t]+at[eé][ \t]+/i;

function parseDateRange(raw) {
  const parts = raw.split(ATE_RE);
  if (parts.length !== 2) return null;
  const d1 = parseDate(parts[0].trim());
  const d2 = parseDate(parts[1].trim());
  if (!d1 || !d2) return null;
  const days = Math.round((d2 - d1) / 86400000);
  return { d1, d2, days };
}

function parseTime(raw) {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = +m[1], min = +m[2], sec = m[3] ? +m[3] : 0;
  if (h > 23 || min > 59 || sec > 59) return null;
  return { h, min, sec, totalSec: h * 3600 + min * 60 + sec };
}

function fmtTime(t) {
  return `${String(t.h).padStart(2,'0')}:${String(t.min).padStart(2,'0')}`;
}

function parseTimeRange(raw) {
  const parts = raw.split(ATE_RE);
  if (parts.length !== 2) return null;
  const t1 = parseTime(parts[0].trim());
  const t2 = parseTime(parts[1].trim());
  if (!t1 || !t2) return null;
  return { t1, t2, diffSec: t2.totalSec - t1.totalSec };
}

function parseDateTime(raw) {
  const m = raw.trim().match(/^(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})[ \t]+(\d{1,2}:\d{2}(?::\d{2})?)$/);
  if (!m) return null;
  const d = parseDate(m[1]);
  const t = parseTime(m[2]);
  if (!d || !t) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.min, t.sec);
}

function parseDateTimeRange(raw) {
  const parts = raw.split(ATE_RE);
  if (parts.length !== 2) return null;
  const dt1 = parseDateTime(parts[0].trim());
  const dt2 = parseDateTime(parts[1].trim());
  if (!dt1 || !dt2) return null;
  return { dt1, dt2, diffSec: Math.round((dt2 - dt1) / 1000) };
}

function fmtTimeDiff(absSec) {
  const d   = Math.floor(absSec / 86400);
  const rem = absSec % 86400;
  const h   = Math.floor(rem / 3600);
  const min = Math.floor((rem % 3600) / 60);
  const parts = [];
  if (d   > 0)              parts.push(`${d} ${d === 1 ? 'dia' : 'dias'}`);
  if (h   > 0)              parts.push(`${h}h`);
  if (min > 0 || d + h === 0) parts.push(`${min}min`);
  return parts.join(' ');
}

function onlyDigits(str) { return str.replace(/\D/g, ''); }

function maskCPF(n)   { return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`; }
function maskCNPJ(n)  { return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`; }

function validateCPF(raw) {
  const n = raw.replace(/\D/g, '');
  if (n.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(n)) return false;
  const d = n.split('').map(Number);
  const dig = (len, base) => {
    const r = d.slice(0, len).reduce((s, v, i) => s + v * (base - i), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dig(9, 10) === d[9] && dig(10, 11) === d[10];
}

function validateCNPJ(raw) {
  const n = raw.replace(/[.\-\/]/g, '').toUpperCase();
  if (n.length !== 14) return false;
  if (/^(.)\1{13}$/.test(n)) return false;
  if (!/^[A-Z0-9]{12}\d{2}$/.test(n)) return false;
  const val = c => c.charCodeAt(0) - 48;
  const chars = n.split('');
  const dig = (len, w) => {
    const r = chars.slice(0, len).reduce((s, c, i) => s + val(c) * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dig(12, [5,4,3,2,9,8,7,6,5,4,3,2]) === +n[12] &&
         dig(13, [6,5,4,3,2,9,8,7,6,5,4,3,2]) === +n[13];
}
function maskCEP(n)   { return `${n.slice(0,5)}-${n.slice(5)}`; }
function maskPhone(n) {
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return n;
}

const TYPE_LABELS = { cpf: 'CPF', cnpj: 'CNPJ', phone: 'Telefone', date: 'Data', daterange: 'Período', timerange: 'Intervalo de horas', datetimerange: 'Período com hora', cep: 'CEP', email: 'E-mail', math: 'Cálculo' };

function buildCopyOptions(type, raw) {
  const d = onlyDigits(raw);

  switch (type) {
    case 'cpf': {
      const masked = d.length === 11 ? maskCPF(d) : raw;
      return [
        { label: masked, hint: 'com máscara', value: masked },
        { label: d,      hint: 'só números',  value: d      },
      ];
    }
    case 'cnpj': {
      const stripped = raw.replace(/[.\-\/]/g, '').toUpperCase();
      const masked = stripped.length === 14 ? maskCNPJ(stripped) : raw;
      return [
        { label: masked,   hint: 'com máscara', value: masked   },
        { label: stripped, hint: 'sem máscara', value: stripped },
      ];
    }
    case 'phone': {
      const formatted = maskPhone(d.slice(0, 11));
      return [
        { label: formatted, hint: 'formatado BR', value: formatted },
        { label: d,         hint: 'só números',   value: d         },
      ];
    }
    case 'date': {
      const date = parseDate(raw);
      if (!date) return [{ label: raw, hint: 'data', value: raw }];
      const age    = calculateAge(date);
      const dateBR = formatDateBR(date);
      return [
        { label: dateBR,        hint: 'data',       value: dateBR        },
        { label: `${age} anos`, hint: 'idade',      value: `${age} anos` },
        { label: String(age),   hint: 'só a idade', value: String(age)   },
      ];
    }
    case 'cep': {
      const digits = onlyDigits(raw);
      const masked = digits.length === 8 ? maskCEP(digits) : raw;
      return [
        { label: masked,  hint: 'com máscara', value: masked  },
        { label: digits,  hint: 'só números',  value: digits  },
      ];
    }
    case 'daterange': {
      const range = parseDateRange(raw);
      if (!range) return [{ label: raw, hint: 'período', value: raw }];
      const { d1, d2, days } = range;
      const abs = Math.abs(days);
      const inv = days < 0 ? ' (invertido)' : '';

      const opts = [];

      const dStr = `${abs} ${abs === 1 ? 'dia' : 'dias'}${inv}`;
      opts.push({ label: dStr, hint: 'total em dias', value: dStr });

      if (abs >= 7) {
        const w = Math.floor(abs / 7), rd = abs % 7;
        const wStr = `${w} ${w === 1 ? 'semana' : 'semanas'}${rd ? ` e ${rd} ${rd === 1 ? 'dia' : 'dias'}` : ''}${inv}`;
        opts.push({ label: wStr, hint: 'em semanas', value: wStr });
      }

      if (abs >= 28) {
        const [lo, hi] = days >= 0 ? [d1, d2] : [d2, d1];
        let m = (hi.getFullYear() - lo.getFullYear()) * 12 + (hi.getMonth() - lo.getMonth());
        const pivot = new Date(lo.getFullYear(), lo.getMonth() + m, lo.getDate());
        if (pivot > hi) m--;
        const pivot2 = new Date(lo.getFullYear(), lo.getMonth() + m, lo.getDate());
        const rd = Math.round((hi - pivot2) / 86400000);
        const mStr = `${m} ${m === 1 ? 'mês' : 'meses'}${rd ? ` e ${rd} ${rd === 1 ? 'dia' : 'dias'}` : ''}${inv}`;
        opts.push({ label: mStr, hint: 'em meses', value: mStr });
      }

      if (abs >= 365) {
        const [lo, hi] = days >= 0 ? [d1, d2] : [d2, d1];
        let y = hi.getFullYear() - lo.getFullYear();
        const pivot = new Date(lo.getFullYear() + y, lo.getMonth(), lo.getDate());
        if (pivot > hi) y--;
        const pivot2 = new Date(lo.getFullYear() + y, lo.getMonth(), lo.getDate());
        let rm = (hi.getFullYear() - pivot2.getFullYear()) * 12 + (hi.getMonth() - pivot2.getMonth());
        const yStr = `${y} ${y === 1 ? 'ano' : 'anos'}${rm ? ` e ${rm} ${rm === 1 ? 'mês' : 'meses'}` : ''}${inv}`;
        opts.push({ label: yStr, hint: 'em anos', value: yStr });
      }

      opts.push({ label: `${formatDateBR(d1)} até ${formatDateBR(d2)}`, hint: 'período formatado', value: `${formatDateBR(d1)} até ${formatDateBR(d2)}` });

      return opts;
    }
    case 'timerange': {
      const r = parseTimeRange(raw);
      if (!r) return [{ label: raw, hint: 'intervalo', value: raw }];
      const abs = Math.abs(r.diffSec);
      const inv = r.diffSec < 0 ? ' (invertido)' : '';
      const opts = [];
      const totalMin = Math.round(abs / 60);
      const h = Math.floor(totalMin / 60), m = totalMin % 60;
      if (h > 0) {
        const s = `${h}h${m > 0 ? ` ${m}min` : ''}${inv}`;
        opts.push({ label: s, hint: 'duração', value: s });
      }
      const ms = `${totalMin} ${totalMin === 1 ? 'minuto' : 'minutos'}${inv}`;
      opts.push({ label: ms, hint: 'em minutos', value: ms });
      opts.push({ label: `${fmtTime(r.t1)} até ${fmtTime(r.t2)}`, hint: 'período', value: `${fmtTime(r.t1)} até ${fmtTime(r.t2)}` });
      return opts;
    }
    case 'datetimerange': {
      const r = parseDateTimeRange(raw);
      if (!r) return [{ label: raw, hint: 'período', value: raw }];
      const abs = Math.abs(r.diffSec);
      const inv = r.diffSec < 0 ? ' (invertido)' : '';
      const opts = [];
      opts.push({ label: `${fmtTimeDiff(abs)}${inv}`, hint: 'duração', value: `${fmtTimeDiff(abs)}${inv}` });
      const totalH = Math.floor(abs / 3600), remMin = Math.round((abs % 3600) / 60);
      const hs = `${totalH}h${remMin > 0 ? ` ${remMin}min` : ''}${inv}`;
      opts.push({ label: hs, hint: 'total em horas', value: hs });
      const totalMin = Math.round(abs / 60);
      opts.push({ label: `${totalMin} minutos${inv}`, hint: 'total em minutos', value: `${totalMin} minutos${inv}` });
      opts.push({ label: raw, hint: 'período', value: raw });
      return opts;
    }
    case 'email': {
      const lower = raw.toLowerCase();
      const opts = [{ label: raw, hint: 'email', value: raw }];
      if (lower !== raw) opts.push({ label: lower, hint: 'minúsculas', value: lower });
      return opts;
    }
    default:
      return [{ label: raw, hint: '', value: raw }];
  }
}

// ── Detecção inteligente (CPF / CNPJ / telefone / data / CEP / e-mail / cálculo) ──
const DETECTORS = [
  { type: 'tag',           re: /(?:^|(?<=[\s,.:;!?'"([{<]))#([a-zA-Z\u00C0-\u017F0-9_\-]+(?:\/[a-zA-Z\u00C0-\u017F0-9_\-]+)*)(?=$|[\s,.:;!?'")\]}>])/g },
  { type: 'email',         re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  { type: 'cnpj',          re: /[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2}/gi },
  { type: 'cpf',           re: /\d{3}\.\d{3}\.\d{3}-\d{2}/g                         },
  { type: 'cep',           re: /\b\d{5}-\d{3}\b/g },
  { type: 'datetimerange', re: /\b\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}[ \t]+\d{1,2}:\d{2}(?::\d{2})?[ \t]+at[eé][ \t]+\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}[ \t]+\d{1,2}:\d{2}(?::\d{2})?\b/gi },
  { type: 'daterange',     re: /\b\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}[ \t]+at[eé][ \t]+\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}\b/gi },
  { type: 'timerange',     re: /\b\d{1,2}:\d{2}(?::\d{2})?[ \t]+at[eé][ \t]+\d{1,2}:\d{2}(?::\d{2})?\b/gi },
  { type: 'date',          re: /\b\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}\b/g },
  { type: 'date',  re: /\b\d{4}-\d{2}-\d{2}\b/g                             },
  { type: 'date',  re: /\b\d{2} \d{2} \d{4}\b/g                             },
  { type: 'phone', re: /\(?\d{2}\)?[\s]?\d{4,5}-\d{4}/g                     },
  { type: 'date',  re: /\b(?:19|20)\d{6}\b/g                                 },
  { type: 'cnpj',  re: /\b\d{14}\b/g                                         },
  { type: 'cpf',   re: /\b\d{11}\b/g                                         },
  { type: 'phone', re: /\b\d{10}\b/g                                          },
  { type: 'cep',   re: /\b\d{8}\b/g                                           },
  { type: 'math',  re: /\(*-?\d+(?:[.,]\d+)*[)%]*(?:\s*(?:\*\*|[-+×÷*/^])\s*\(*-?\d+(?:[.,]\d+)*[)%]*)+/g },
];

function findDetectionMatches(text) {
  const matches = [];
  for (const { type, re } of DETECTORS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end   = start + m[0].length;
      if (type === 'tag'          && (/^\d+$/.test(m[1] || '') || !(m[1] || '').trim())) continue;
      if (type === 'date'          && !parseDate(m[0]))          continue;
      if (type === 'daterange'     && !parseDateRange(m[0]))     continue;
      if (type === 'timerange'     && !parseTimeRange(m[0]))     continue;
      if (type === 'datetimerange' && !parseDateTimeRange(m[0])) continue;
      if (type === 'math') {
        const p = tryParseMath(m[0]);
        if (!p) continue;
        mathCache.set(m[0], p);
      }
      const overlaps = matches.some(e => e.start < end && e.end > start);
      if (!overlaps) matches.push({ start, end, type, raw: m[0] });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

// Remove marcações antigas de um bloco, deixando só o texto/formatação real.
export function unwrapMarks(el) {
  el.querySelectorAll('mark').forEach(mark => mark.replaceWith(...mark.childNodes));
  el.normalize();
}

// Reaplica <mark> nos trechos de texto puro do bloco (não mexe no que já é
// negrito/itálico/código real — só varre os nós de texto).
export function applyDetectionMarks(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const textNode of textNodes) {
    const text = textNode.data;
    const matches = findDetectionMatches(text);
    if (matches.length === 0) continue;

    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const m of matches) {
      if (m.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
      const mark = document.createElement('mark');
      let cls = m.type;
      if (m.type === 'cpf')  cls += validateCPF(m.raw)  ? ' valid' : ' invalid';
      if (m.type === 'cnpj') cls += validateCNPJ(m.raw) ? ' valid' : ' invalid';
      if (m.type === 'tag') {
        cls = 'note-tag tag';
        mark.dataset.tag = m.raw.replace(/^#/, '');
      }
      mark.className = cls;
      mark.dataset.type = m.type;
      mark.dataset.value = m.raw;
      mark.textContent = m.raw;
      frag.appendChild(mark);
      pos = m.end;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    textNode.replaceWith(frag);
  }
}


export function positionMenu(menu, anchorRect) {
  if (menu.classList.contains('is-bottom-sheet')) return;
  const gap = 6;
  const margin = 8;
  const below = window.innerHeight - anchorRect.bottom - gap - margin;
  const above = anchorRect.top - gap - margin;
  const openDown = below >= above;
  const avail = Math.max(80, openDown ? below : above);

  menu.style.maxHeight = `${avail}px`;
  menu.style.overflowY = 'auto';

  const height = Math.min(menu.scrollHeight, avail);
  // Prende dentro da janela nas duas pontas: num painel bem baixo o espaço do
  // lado escolhido pode ser menor que o piso, e sem isto o menu vazaria.
  let top = openDown ? anchorRect.bottom + gap : anchorRect.top - gap - height;
  top = Math.max(margin, Math.min(top, window.innerHeight - margin - height));

  menu.style.top  = `${top}px`;
  menu.style.left = `${Math.max(margin, Math.min(anchorRect.left, window.innerWidth - menu.offsetWidth - margin))}px`;
}

// ── Menu de cópia ─────────────────────────────────────────────────────────────
export function closeCopyMenu() {
  activeMenu?.remove();
  activeMenu = null;
}

export function showCopyMenu(type, raw, anchorRect) {
  closeCopyMenu();

  const options = buildCopyOptions(type, raw);
  const menu    = document.createElement('div');
  menu.className = 'copy-menu';

  const header = document.createElement('div');
  header.className   = 'copy-menu-header';
  header.textContent = TYPE_LABELS[type] || 'Valor detectado';
  menu.appendChild(header);

  if (type === 'cpf' || type === 'cnpj') {
    const valid  = type === 'cpf' ? validateCPF(raw) : validateCNPJ(raw);
    const badge  = document.createElement('div');
    badge.className   = `copy-menu-badge ${valid ? 'valid' : 'invalid'}`;
    badge.textContent = valid ? '✓ Válido' : '✗ Inválido';
    menu.appendChild(badge);
  }

  for (const { label, hint, value } of options) {
    const btn = document.createElement('button');
    btn.className = 'copy-opt';
    btn.innerHTML = `
      <span class="copy-opt-value">${escHtml(label)}</span>
      ${hint ? `<span class="copy-opt-hint">${escHtml(hint)}</span>` : ''}
    `;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(value).then(() => {
        showFeedback('copiado!');
        closeCopyMenu();
      });
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenu = menu;
  positionMenu(menu, anchorRect);
}

document.addEventListener('mousedown', e => {
  if (activeMenu && !activeMenu.contains(e.target)) closeCopyMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCopyMenu();
    if (isTouchSelectionMode()) setTouchSelectionMode(false);
  }
});

// ── Feedback visual ───────────────────────────────────────────────────────────
export function showFeedback(msg) {
  indicator.textContent = msg;
  indicator.classList.add('visible');
  clearTimeout(getIndicatorTimer());
  setIndicatorTimer(setTimeout(() => {
    indicator.classList.remove('visible');
    if (getIsCtrlHeld()) {
      indicator.textContent = 'Ctrl+clique para copiar';
      indicator.classList.add('visible');
    } else if (isTouchSelectionMode()) {
      indicator.textContent = 'Modo seleção ativo · toque para selecionar';
      indicator.classList.add('visible');
    }
  }, 1400));
}

// ── Ctrl: ativa modo de cópia rápida ──────────────────────────────────────────
export function setCtrl(active) {
  if (getIsCtrlHeld() === active) return;
  setIsCtrlHeld(active);
  noteSection.classList.toggle('ctrl-active', active || isTouchSelectionMode());

  if (active) {
    showFeedback('Ctrl+clique para copiar');
  } else {
    if (!activeMenu && !isTouchSelectionMode()) indicator.classList.remove('visible');
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Control' || e.key === 'Meta') setCtrl(true);
});
document.addEventListener('keyup', e => {
  if (e.key === 'Control' || e.key === 'Meta') setCtrl(false);
});
window.addEventListener('blur', () => setCtrl(false));


// ── Menu de cálculo ───────────────────────────────────────────────────────────
export function showMathMenu(parsed, anchorRect) {
  closeCopyMenu();
  const { raw, resultFmt, steps } = parsed;
  const menu = document.createElement('div');
  menu.className = 'copy-menu math-menu';

  const hdr = document.createElement('div');
  hdr.className   = 'copy-menu-header';
  hdr.textContent = 'Cálculo';
  menu.appendChild(hdr);

  const exprEl = document.createElement('div');
  exprEl.className   = 'math-expr';
  exprEl.textContent = raw;
  menu.appendChild(exprEl);

  if (steps.length > 0) {
    const sl = document.createElement('div');
    sl.className   = 'math-section-label';
    sl.textContent = 'Passo a passo';
    menu.appendChild(sl);
    for (const s of steps) {
      const el = document.createElement('div');
      el.className   = 'math-step';
      el.textContent = s;
      menu.appendChild(el);
    }
  }

  const resRow = document.createElement('div');
  resRow.className = 'math-result-row';
  resRow.innerHTML =
    `<span class="math-result-label">Resultado</span>` +
    `<span class="math-result-value" title="Clique para copiar">${escHtml(resultFmt)}</span>`;
  resRow.querySelector('.math-result-value').addEventListener('mousedown', e => e.stopPropagation());
  resRow.querySelector('.math-result-value').addEventListener('click', () => {
    navigator.clipboard.writeText(resultFmt).then(() => { showFeedback('copiado!'); closeCopyMenu(); });
  });
  menu.appendChild(resRow);

  const addDiv = () => menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  addDiv();

  const calcText = `${raw}\n${steps.join('\n')}\n= ${resultFmt}`;
  for (const { label, hint, value } of [
    { label: resultFmt,          hint: 'resultado',    value: resultFmt },
    { label: raw,                hint: 'expressão',    value: raw       },
    { label: 'Cálculo completo', hint: 'com passos',   value: calcText  },
  ]) {
    const btn = document.createElement('button');
    btn.className = 'copy-opt';
    btn.innerHTML =
      `<span class="copy-opt-value">${escHtml(label)}</span>` +
      `<span class="copy-opt-hint">${escHtml(hint)}</span>`;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(value).then(() => { showFeedback('copiado!'); closeCopyMenu(); });
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenu = menu;
  positionMenu(menu, anchorRect);
}

