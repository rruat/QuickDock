import { initNotesTabs, createTutorialNote, downloadAllNotes } from './modules/notes-tabs.js';
import { positionPopover } from './modules/popover.js';
import { initDocuments } from './modules/documents.js';
import { loadTheme, saveTheme } from './modules/storage.js';
import { initResizer } from './modules/resizer.js';

const btnAppMenu = document.getElementById('btn-app-menu');
const html       = document.documentElement;

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

// ── Menu "⋯" ──────────────────────────────────────────────────────────────────
// Tutorial e tema viviam num header próprio, que repetia o ícone e o nome que
// o painel lateral do Chrome já mostra. Limpar/excluir é por nota, no menu da
// própria aba — com várias notas, um botão que apagava tudo de uma vez só
// convidava ao acidente.
let appMenuEl = null;

function closeAppMenu() {
  appMenuEl?.remove();
  appMenuEl = null;
}

function openAppMenu() {
  const menu = document.createElement('div');
  menu.className = 'copy-menu app-menu';

  // Ícone à esquerda (Material Symbols), como nos menus da Apple.
  const addOpt = (icon, label, onClick) => {
    const opt = document.createElement('button');
    opt.className = 'copy-opt';
    const iconEl = document.createElement('span');
    iconEl.className = 'copy-opt-icon material-symbols-rounded';
    iconEl.textContent = icon;
    const valueEl = document.createElement('span');
    valueEl.className = 'copy-opt-value';
    valueEl.textContent = label;
    opt.append(iconEl, valueEl);
    opt.addEventListener('click', async () => {
      closeAppMenu();
      await onClick();
    });
    menu.appendChild(opt);
  };

  const dark = html.getAttribute('data-theme') === 'dark';
  addOpt('menu_book', 'Ver tutorial', createTutorialNote);
  addOpt(dark ? 'light_mode' : 'dark_mode', dark ? 'Tema claro' : 'Tema escuro', toggleTheme);
  const docsHidden = document.body.classList.contains('docs-hidden');
  addOpt(docsHidden ? 'visibility' : 'visibility_off', docsHidden ? 'Mostrar documentos' : 'Ocultar documentos', toggleDocs);

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  // Um arquivo com tudo dentro. Existe pra que atualizar a extensão nunca
  // dependa de confiança: dá pra guardar as notas antes e conferir depois.
  addOpt('download', 'Baixar todas as notas', downloadAllNotes);

  document.body.appendChild(menu);
  appMenuEl = menu;
  positionPopover(menu, btnAppMenu);
}

btnAppMenu.addEventListener('click', e => {
  e.stopPropagation();
  if (appMenuEl) closeAppMenu();
  else openAppMenu();
});

// O próprio botão fica de fora: mousedown vem antes do click, então fechar
// aqui faria o clique seguinte reabrir o menu que se acabou de fechar.
document.addEventListener('mousedown', e => {
  if (!appMenuEl) return;
  if (appMenuEl.contains(e.target) || btnAppMenu.contains(e.target)) return;
  closeAppMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAppMenu();
});

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
    await initTheme();
    applyDocsHidden(await loadDocsHidden());
    await initNotesTabs();
    await initDocuments();
    await initResizer();
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
