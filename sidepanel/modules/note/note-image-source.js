// ── note-image-source.js ────────────────────────────────────────────────────
// Imagem com o cursor nela: aparece, acima da imagem, a linha em markdown editável
//
//     ![Texto alternativo](endereço-da-imagem|300)        largura          (|300)
//     ![Texto alternativo](endereço-da-imagem|300x200)    largura e altura (|300x200)
//
// como o `# ` de um título ou as cercas do bloco de código: a sintaxe só aparece com o cursor e a
// imagem continua visível, então mudar o tamanho já mostra o resultado.
//
// Entra clicando na imagem ou navegando até ela com as setas; sai com Enter, Esc ou as setas.
// Também lê a forma do Obsidian (`![Texto|300](endereço)`); o arquivo da nota continua gravando a
// forma do Obsidian, para a nota abrir igual em qualquer editor.

import { imageSrcOf, parseMarkdownToBlocks, parseImageMarkdownLine, imageMarkdownLine } from '../blocks.js';
import { aplicarTamanhoImagem, setImageData } from './note-media.js';

let cb = {
  captureUndoPoint: () => {}, scheduleSave: () => {}, escHtml: s => s, createBlockEl: () => null,
  focusBlockStart: () => {}, focusBlockEnd: () => {}, showFeedback: () => {}, renumberLists: () => {},
};

export function initNoteImageSource(callbacks) { cb = { ...cb, ...callbacks }; }

const ESPERA_APLICAR_MS = 350;
const SRC_LOCAL = 'quickdock:imagem-local';   // imagem sem arquivo/caminho ainda (aparece como indisponível)

// ── Texto ↔ imagem ──────────────────────────────────────────────────────────
export function srcDaImagem(bloco) {
  const fileId = Number(bloco.dataset.fileId);
  const b = { fileId: Number.isFinite(fileId) && bloco.dataset.fileId ? fileId : undefined, imagePath: bloco.dataset.imagePath };
  return imageSrcOf(b) || SRC_LOCAL;
}

/** `![alt](endereço|300)` a partir do estado atual do bloco. */
export function textoDaImagem(bloco) {
  return imageMarkdownLine({
    alt: bloco.dataset.alt ?? '',
    src: srcDaImagem(bloco),
    width: Number(bloco.dataset.width) || null,
    height: Number(bloco.dataset.height) || null,
  });
}

// ── Montagem ────────────────────────────────────────────────────────────────
export function buildImageSource() {
  const painel = document.createElement('div');
  painel.className = 'image-source';
  painel.hidden = true;
  painel.spellcheck = false;
  painel.setAttribute('role', 'textbox');
  painel.setAttribute('aria-label', 'Imagem em markdown: texto alternativo, endereço e tamanho');
  painel.contentEditable = 'plaintext-only';
  if (painel.contentEditable !== 'plaintext-only') painel.contentEditable = 'true';
  painel.addEventListener('input', () => {
    clearTimeout(painel._timer);
    painel._timer = setTimeout(() => { painel._timer = null; aplicar(blocoDe(painel)); }, ESPERA_APLICAR_MS);
  });
  painel.addEventListener('keydown', aoTeclar);
  return painel;
}

const blocoDe = painel => painel.closest('.block-image');
const painelDe = bloco => bloco?.querySelector?.(':scope > .image-source') ?? null;
export const imageSourceActive = bloco => !!bloco?.classList?.contains('is-source');

function colocarCursorNoFim(painel) {
  const sel = document.getSelection();
  const r = document.createRange();
  r.selectNodeContents(painel);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ── Entrar e sair ───────────────────────────────────────────────────────────
/** Mostra a linha. `foco` leva o cursor até ela (clicar na imagem ou chegar com as setas). */
export function showImageSource(bloco, { foco = false } = {}) {
  const painel = painelDe(bloco);
  if (!painel) return;
  if (!imageSourceActive(bloco)) {
    bloco.classList.add('is-source');
    painel.hidden = false;
    painel.classList.remove('is-invalid');
    painel.textContent = textoDaImagem(bloco);
    painel._desfazerFeito = false;
    observarTamanho(bloco, painel);
  }
  if (foco) { painel.focus({ preventScroll: true }); colocarCursorNoFim(painel); }
}

export function activateImageSource(bloco) { showImageSource(bloco, { foco: true }); }

/** O cursor saiu da imagem: aplica o que estava pendente e esconde a linha. */
export function hideImageSource(bloco) {
  const painel = painelDe(bloco);
  if (!painel || !imageSourceActive(bloco) || !bloco.isConnected) return;
  const pendente = !!painel._timer;
  clearTimeout(painel._timer);
  painel._timer = null;
  painel._observador?.disconnect();
  painel._observador = null;

  // Só aplica se algo foi digitado; a linha inválida não destrói nada: a imagem fica como estava
  if (pendente && !aplicar(bloco, { aoSair: true })) {
    cb.showFeedback?.('A linha da imagem estava inválida: mantive a imagem como estava.');
  }
  if (!bloco.isConnected) return;   // virou parágrafo (endereço da internet)
  bloco.classList.remove('is-source');
  painel.hidden = true;
}

/** Arrastar a alça de redimensionar muda a largura: a linha acompanha (se não está sendo digitada). */
function observarTamanho(bloco, painel) {
  painel._observador?.disconnect();
  painel._observador = new MutationObserver(() => {
    if (painel.contains(document.activeElement) || painel === document.activeElement) return;
    painel.textContent = textoDaImagem(bloco);
  });
  painel._observador.observe(bloco, { attributes: true, attributeFilter: ['data-width', 'data-height', 'data-alt'] });
}

// ── Aplicar o texto ─────────────────────────────────────────────────────────
function aplicar(bloco, { aoSair = false } = {}) {
  const painel = painelDe(bloco);
  if (!painel || !bloco?.isConnected) return false;
  const lido = parseImageMarkdownLine(painel.innerText ?? painel.textContent);
  if (!lido) { painel.classList.add('is-invalid'); return false; }
  painel.classList.remove('is-invalid');
  if (!painel._desfazerFeito) { cb.captureUndoPoint(); painel._desfazerFeito = true; }

  const srcAtual = srcDaImagem(bloco);
  if (lido.src === srcAtual) {
    // só texto alternativo e tamanho: não mexe no arquivo
    const img = bloco.querySelector('img');
    if (lido.alt) bloco.dataset.alt = lido.alt; else delete bloco.dataset.alt;
    if (img) img.alt = lido.alt;
    aplicarTamanhoImagem(bloco, lido.width, lido.height);
    cb.scheduleSave();
    return true;
  }

  // O endereço mudou: reaproveita o leitor de markdown (mesmas regras de arquivo local, imagem sincronizada
  // e endereço da internet). Endereço remoto NÃO vira imagem (privacidade): vira link, como ao colar.
  // (a forma do Obsidian, com o tamanho no texto alternativo, é a que o leitor de arquivo entende)
  const [novo] = parseMarkdownToBlocks(imageMarkdownLine({ alt: `${lido.alt}${lido.width ? `|${lido.width}${lido.height ? `x${lido.height}` : ''}` : ''}`, src: lido.src }));
  if (novo?.type === 'image') {
    setImageData(bloco, novo);
    cb.scheduleSave();
    return true;
  }
  const href = /^(https?:|mailto:)/i.test(lido.src) ? lido.src : null;
  if (!href) { painel.classList.add('is-invalid'); return false; }
  if (!aoSair) return true;   // ainda digitando um endereço: só vira link ao sair
  const paragrafo = cb.createBlockEl('paragraph', `<a href="${cb.escHtml(href)}">${cb.escHtml(lido.alt || href)}</a>`);
  bloco.replaceWith(paragrafo);
  cb.renumberLists();
  cb.scheduleSave();
  cb.showFeedback?.('Imagem por endereço da internet vira link (privacidade): ela não é carregada na nota.');
  return true;
}

// ── Teclado dentro da linha ─────────────────────────────────────────────────
function sairPara(bloco, depois) {
  const vizinho = depois ? bloco.nextElementSibling : bloco.previousElementSibling;
  if (depois) {
    const alvo = vizinho ?? (() => { const p = cb.createBlockEl('paragraph'); bloco.after(p); return p; })();
    cb.focusBlockStart(alvo);
  } else if (vizinho) {
    cb.focusBlockEnd(vizinho);
  }
}

function aoTeclar(e) {
  const bloco = blocoDe(e.currentTarget);
  if (e.key === 'Enter' || e.key === 'Escape' || (e.key === 'ArrowDown' && !e.shiftKey)) {
    e.preventDefault();
    sairPara(bloco, true);
  } else if (e.key === 'ArrowUp' && !e.shiftKey) {
    e.preventDefault();
    sairPara(bloco, false);
  }
}
