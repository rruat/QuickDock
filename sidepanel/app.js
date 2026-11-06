import { initNotesTabs, createTutorialNote, downloadAllNotes } from './modules/notes-tabs.js';
import { initDocuments } from './modules/documents.js';
import { loadTheme, saveTheme } from './modules/storage.js';
import { initResizer } from './modules/resizer.js';
import { aplicarIdiomaNoHtml, aplicarRotulosDestaque, carregarEscolhaIdioma, definirEscolhaIdioma, escolhaIdioma, idiomaAtual, t } from './modules/i18n.js';
import { bandeiraDoIdioma } from './modules/bandeiras.js';

const html      = document.documentElement;
const asideFoot = document.getElementById('notes-aside-foot');

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
}

async function initTheme() {
  let theme = await loadTheme();
  if (!theme) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme);
}

// Documentos ocultos: some a seção inteira e as notas ocupam a altura toda.
// A escolha fica salva (chrome.storage) e vale ao reabrir o painel.
const DOCS_HIDDEN_KEY = 'docs_hidden';

function applyDocsHidden(hidden) {
  document.body.classList.toggle('docs-hidden', hidden);
}

async function loadDocsHidden() {
  return new Promise(resolve => {
    chrome.storage.local.get(DOCS_HIDDEN_KEY, obj => resolve(!!obj[DOCS_HIDDEN_KEY]));
  });
}

async function toggleDocs() {
  const next = !document.body.classList.contains('docs-hidden');
  applyDocsHidden(next);
  await new Promise(resolve => chrome.storage.local.set({ [DOCS_HIDDEN_KEY]: next }, resolve));
}

async function toggleTheme() {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  await saveTheme(next);
  applyTheme(next);
}

// ── Rodapé da aside ───────────────────────────────────────────────────────────
// Tutorial, tema, documentos e backup ficam no fim da lista de notas (antes eram
// um menu ⋯ no cabeçalho). Os rótulos mudam conforme o estado (tema, documentos),
// então o rodapé é refeito a cada ação.
// `icon` é o nome de um ícone Material ou um SVG (bandeira). `ativo` destaca o item.
function addFootOpt(icon, label, onClick, ativo = false) {
  const opt = document.createElement('button');
  opt.className = 'copy-opt notes-aside-item' + (ativo ? ' is-active' : '');
  const iconEl = document.createElement('span');
  if (icon.startsWith('<')) {
    iconEl.className = 'copy-opt-icon copy-opt-flag';
    iconEl.innerHTML = icon;
  } else {
    iconEl.className = 'copy-opt-icon material-symbols-rounded';
    iconEl.textContent = icon;
  }
  const valueEl = document.createElement('span');
  valueEl.className = 'copy-opt-value';
  valueEl.textContent = label;
  opt.append(iconEl, valueEl);
  opt.addEventListener('click', async () => {
    await onClick();
    renderAsideFoot();
  });
  asideFoot.appendChild(opt);
}

// Escolha de idioma: o item abre a lista no próprio rodapé (no lugar dos itens).
// Escolher um idioma salva e recarrega o painel para tudo ser redesenhado.
let idiomaAberto = false;

async function escolherIdioma(codigo) {
  await definirEscolhaIdioma(codigo);
  location.reload();
}

function renderOpcoesIdioma() {
  const atual = escolhaIdioma();
  addFootOpt('arrow_back', t('aside.idioma'), () => { idiomaAberto = false; });
  addFootOpt('language', t('idioma.auto'), () => escolherIdioma(null), atual === null);
  for (const codigo of ['pt-BR', 'pt-PT', 'en', 'es']) {
    addFootOpt(bandeiraDoIdioma(codigo), t('idioma.' + codigo), () => escolherIdioma(codigo), atual === codigo);
  }
}

function renderAsideFoot() {
  asideFoot.replaceChildren();
  if (idiomaAberto) {
    renderOpcoesIdioma();
    return;
  }
  const dark = html.getAttribute('data-theme') === 'dark';
  addFootOpt('menu_book', t('aside.tutorial'), createTutorialNote);
  addFootOpt(dark ? 'light_mode' : 'dark_mode', dark ? t('aside.temaClaro') : t('aside.temaEscuro'), toggleTheme);
  const docsHidden = document.body.classList.contains('docs-hidden');
  addFootOpt(docsHidden ? 'visibility' : 'visibility_off', docsHidden ? t('aside.mostrarDocs') : t('aside.ocultarDocs'), toggleDocs);
  // Um arquivo com tudo dentro. Existe pra que atualizar a extensão nunca
  // dependa de confiança: dá pra guardar as notas antes e conferir depois.
  const escolha = escolhaIdioma();
  const visivel = escolha ?? idiomaAtual();
  addFootOpt(bandeiraDoIdioma(visivel) ?? 'translate', t('aside.idioma') + ': ' + (escolha ? t('idioma.' + escolha) : t('idioma.auto')), () => { idiomaAberto = true; });
  addFootOpt('download', t('aside.baixarTudo'), downloadAllNotes);
}

// O véu costuma durar só alguns milissegundos: sem um piso ele vira um flash de
// um frame, que lê como glitch em vez de carregamento.
const BOOT_MIN_MS = 120;
const bootStartedAt = performance.now();

function revealApp() {
  const remaining = Math.max(0, BOOT_MIN_MS - (performance.now() - bootStartedAt));
  setTimeout(() => document.body.classList.remove('booting'), remaining);
}

async function init() {
  try {
    await carregarEscolhaIdioma();
    aplicarIdiomaNoHtml();
    aplicarRotulosDestaque();
    await initTheme();
    applyDocsHidden(await loadDocsHidden());
    await initNotesTabs();
    await initDocuments();
    await initResizer();
    renderAsideFoot();
  } finally {
    // no finally: se um init falhar, o painel ainda aparece em vez de travar no véu
    revealApp();
  }
}

init();

// ── Registra este painel no background (necessário para o toggle Ctrl+Q) ───────
const _panelPort = chrome.runtime.connect({ name: 'sidepanel' });
_panelPort.onMessage.addListener(msg => {
  if (msg.type === 'close') window.close();
});
