// ── note-image-select.js ─────────────────────────────────────────────────────
// Modo "Gerar imagem": cada bloco da nota ganha uma caixinha na calha da esquerda (como no modo de
// impressão), mas TODAS começam desmarcadas. Os controles (selecionar todos, baixar PNG, copiar imagem)
// moram na aba "Imagem" da barra inferior (note-outline.js liga e desliga este modo ao trocar de aba).
// O desenho é o de snapshot.js. Não mexe no texto: o editor fica travado enquanto o modo está ligado.

import { copyBlocksAsImage, downloadBlocksAsImage } from './snapshot.js';

let ativo = false;
let botao = null, painel = null, calha = null;
let observadorBlocos = null, observadorCorpo = null, observadorTamanho = null;
let travados = [];
const selecionados = new Set();     // blocos marcados
const caixas = new Map();           // bloco → caixinha da calha
let avisoTimer = null;

const editorEl = () => document.querySelector('.note-editor');
const raizEl = () => document.getElementById('note-editor-blocks');
const blocosDaNota = () => [...(raizEl()?.querySelectorAll(':scope > .block') ?? [])];

export const isImageSelectActive = () => ativo;

// ── Painel (aba Imagem) ─────────────────────────────────────────────────────
function atualizarPainel() {
  if (!painel) return;
  const total = blocosDaNota().length;
  const marcados = selecionados.size;
  const contagem = painel.querySelector('#note-image-count');
  if (contagem && !avisoTimer) {
    contagem.textContent = marcados === 0 ? 'Nenhum bloco marcado' : `${marcados} de ${total} ${total === 1 ? 'bloco' : 'blocos'} marcados`;
  }
  const todos = painel.querySelector('[data-image-act="todos"]');
  if (todos) todos.textContent = marcados === total && total > 0 ? 'Desmarcar todos' : 'Selecionar todos';
  painel.querySelectorAll('[data-image-act="copiar"], [data-image-act="baixar"]').forEach(b => { b.disabled = marcados === 0; });
}

function aviso(texto) {
  const contagem = painel?.querySelector('#note-image-count');
  if (!contagem) return;
  contagem.textContent = texto;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { avisoTimer = null; atualizarPainel(); }, 2200);
}

function blocosMarcados() {
  return blocosDaNota().filter(b => selecionados.has(b));
}

function tituloDaNota() {
  return document.getElementById('note-header-title')?.textContent?.trim() || 'nota';
}

async function aoClicarPainel(e) {
  const btn = e.target.closest('[data-image-act]');
  if (!btn || btn.disabled) return;
  const acao = btn.dataset.imageAct;
  if (acao === 'todos') {
    const todos = blocosDaNota();
    const marcar = selecionados.size !== todos.length;
    todos.forEach(b => alternar(b, marcar));
    return;
  }
  const blocos = blocosMarcados();
  if (!blocos.length) return;
  try {
    if (acao === 'copiar') {
      const ok = await copyBlocksAsImage(blocos);
      aviso(ok ? 'Imagem copiada' : 'Nada para desenhar');
    } else if (acao === 'baixar') {
      const ok = await downloadBlocksAsImage(blocos, tituloDaNota());
      aviso(ok ? 'PNG baixado' : 'Nada para desenhar');
    }
  } catch (err) {
    console.error('Gerar imagem:', err);
    aviso('Não foi possível gerar a imagem');
  }
}

// ── Caixinhas ───────────────────────────────────────────────────────────────
function criarCaixa(bloco) {
  const h = document.createElement('div');
  h.className = 'print-select-handle is-unchecked';
  h.setAttribute('role', 'checkbox');
  h.setAttribute('aria-checked', 'false');
  h.setAttribute('tabindex', '0');
  h.title = 'Clique para incluir este bloco na imagem';
  h.innerHTML = '<span class="print-checkbox-indicator"><span class="qd-icon material-symbols-rounded">check</span></span>';
  h.addEventListener('click', (e) => { e.stopPropagation(); alternar(bloco); });
  return h;
}

function alternar(bloco, marcar = !selecionados.has(bloco)) {
  if (marcar) selecionados.add(bloco); else selecionados.delete(bloco);
  bloco.classList.toggle('image-selected', marcar);
  const h = caixas.get(bloco);
  if (h) {
    h.classList.toggle('is-checked', marcar);
    h.classList.toggle('is-unchecked', !marcar);
    h.setAttribute('aria-checked', String(marcar));
  }
  atualizarPainel();
}

// Cada bloco ganha a caixinha; a seleção sobrevive a mudanças na lista de blocos (quando um some, sai da seleção)
function reconstruir() {
  if (!ativo || !calha) return;
  const atuais = new Set(blocosDaNota());
  for (const [bloco, h] of caixas) {
    if (!atuais.has(bloco)) { h.remove(); caixas.delete(bloco); selecionados.delete(bloco); }
  }
  for (const bloco of atuais) {
    if (caixas.has(bloco)) continue;
    const h = criarCaixa(bloco);
    calha.appendChild(h);
    caixas.set(bloco, h);
    bloco.classList.add('image-selectable');
    bloco.classList.toggle('image-selected', selecionados.has(bloco));
    h.classList.toggle('is-checked', selecionados.has(bloco));
    h.classList.toggle('is-unchecked', !selecionados.has(bloco));
    h.setAttribute('aria-checked', String(selecionados.has(bloco)));
  }
  posicionar();
  atualizarPainel();
}

function posicionar() {
  if (!ativo || !calha) return;
  const editor = editorEl(), raiz = raizEl();
  if (!editor || !raiz) return;
  const er = editor.getBoundingClientRect();
  const rr = raiz.getBoundingClientRect();
  const x = Math.max(14, Math.round(rr.left - er.left + editor.scrollLeft + 16));
  for (const [bloco, h] of caixas) {
    if (!bloco.isConnected) continue;
    const br = bloco.getBoundingClientRect();
    h.style.left = `${x}px`;
    h.style.top = `${Math.round(br.top - er.top + editor.scrollTop + 4)}px`;
  }
  calha.style.height = `${Math.max(editor.scrollHeight, editor.clientHeight)}px`;
}

function aoClicarBloco(e) {
  const bloco = e.target.closest('#note-editor-blocks > .block');
  if (!bloco) return;
  e.preventDefault();
  e.stopPropagation();
  alternar(bloco);
}

function aoTeclar(e) {
  if (e.key === 'Escape') sair();
}

// ── Entrar e sair ───────────────────────────────────────────────────────────
export function enterImageSelect() {
  if (ativo) return;
  // o modo de impressão tem a mesma calha: ele sai antes (com o botão dele, que já cuida de tudo)
  if (document.body.classList.contains('is-print-mode')) document.getElementById('btn-note-print')?.click();
  const editor = editorEl(), raiz = raizEl();
  if (!editor || !raiz || !blocosDaNota().length) return;

  ativo = true;
  selecionados.clear();
  document.body.classList.add('is-image-select-mode');
  botao?.classList.add('active');
  botao?.setAttribute('aria-pressed', 'true');
  document.dispatchEvent(new CustomEvent('quickdock:flush-pending-save'));

  travados = [...editor.querySelectorAll('[contenteditable="true"]')];
  travados.forEach(el => el.setAttribute('contenteditable', 'false'));

  calha = document.createElement('div');
  calha.className = 'note-print-gutter note-image-gutter';
  editor.appendChild(calha);

  raiz.addEventListener('click', aoClicarBloco, true);
  observadorBlocos = new MutationObserver(reconstruir);
  observadorBlocos.observe(raiz, { childList: true });
  observadorTamanho = new ResizeObserver(posicionar);
  observadorTamanho.observe(editor);
  observadorTamanho.observe(raiz);
  observadorCorpo = new MutationObserver(() => { if (document.body.classList.contains('is-print-mode')) sair(); });
  observadorCorpo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', posicionar);
  document.addEventListener('keydown', aoTeclar);
  reconstruir();
}

export function sair() {
  if (!ativo) return;
  ativo = false;
  document.body.classList.remove('is-image-select-mode');
  botao?.classList.remove('active');
  botao?.setAttribute('aria-pressed', 'false');
  clearTimeout(avisoTimer); avisoTimer = null;

  const raiz = raizEl();
  raiz?.removeEventListener('click', aoClicarBloco, true);
  observadorBlocos?.disconnect(); observadorBlocos = null;
  observadorTamanho?.disconnect(); observadorTamanho = null;
  observadorCorpo?.disconnect(); observadorCorpo = null;
  window.removeEventListener('resize', posicionar);
  document.removeEventListener('keydown', aoTeclar);

  travados.forEach(el => { if (el.isConnected) el.setAttribute('contenteditable', 'true'); });
  travados = [];
  for (const bloco of caixas.keys()) bloco.classList.remove('image-selectable', 'image-selected');
  caixas.forEach(h => h.remove());
  caixas.clear();
  selecionados.clear();
  calha?.remove(); calha = null;
  // quem está com a aba Imagem aberta volta para Backlinks (note-outline.js ouve este evento)
  document.dispatchEvent(new CustomEvent('quickdock:image-select-ended'));
}

// ── Ligações ────────────────────────────────────────────────────────────────
function montar() {
  painel = document.getElementById('note-image-panel');
  painel?.addEventListener('click', aoClicarPainel);
  botao = document.createElement('button');
  botao.id = 'btn-note-image';
  botao.type = 'button';
  botao.className = 'section-btn btn-image-note';
  botao.title = 'Gerar imagem (aba Imagem)';
  botao.setAttribute('aria-label', 'Gerar imagem');
  botao.setAttribute('aria-pressed', 'false');
  botao.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">image</span>';
  const acoes = document.querySelector('#section-note .section-header-actions');
  const paginas = document.getElementById('btn-note-pages');
  if (paginas) paginas.after(botao); else if (acoes) acoes.insertBefore(botao, acoes.firstChild);
  // o botão do cabeçalho só abre (ou fecha) a aba Imagem da barra inferior
  botao.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById(ativo ? 'tab-btn-backlinks' : 'tab-btn-imagem')?.click();
  });

  document.addEventListener('quickdock:note-selected', sair);
  document.addEventListener('quickdock:active-note-changed', sair);
  document.addEventListener('quickdock:shell-focus', () => {
    if (document.documentElement.dataset.shellFocus !== 'notes') sair();
  });
}

// fora de um navegador de verdade (testes) não há cabeçalho nem editor: não monta nada
try { if (typeof document !== 'undefined') montar(); } catch { /* ambiente sem DOM completo */ }
