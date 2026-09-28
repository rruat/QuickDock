import {
  loadAllNotesMeta, createNoteRecord, updateNoteMetaById, deleteNoteRecordById,
  reorderNoteRecords, moveNoteRecord, migrateLegacyNoteIfNeeded, loadActiveNoteId, saveActiveNoteId,
  getNoteById, detachFilesFromNote, updateNoteBlocksById,
  updateTemplateById, gcInlineFiles,
  listarPastas, criarPasta, renomearPasta, excluirPasta, moverNotaParaPasta, normalizarCaminhoPasta,
} from './storage.js';
import { setDocumentsNote, refreshDocuments } from './documents.js';
import { positionPopover } from './popover.js';
import {
  initTemplates, getTemplates, noteTemplates, openTemplatesManager,
  refreshTemplates, closeTemplatesManager,
} from './templates.js';
import {
  switchToNote, flushSave, getCurrentBlocks, clearCurrentNote,
  openTemplateInEditor, currentTemplateMarkdown, clearTemplateEditing,
  blocksToExportMarkdown, absorbDataUrls,
} from './note.js';
import { blocksToMarkdown, blocksToPlainText, parseMarkdownToBlocks } from './blocks.js';
import { buildBackup, parseBackup } from './backup.js';
import { iconSvg, createIcon } from './icons.js';
import { switchView, getCurrentView } from './views.js';
import { createTutorialNote } from './notes-tutorial.js';
export { createTutorialNote };
import {
  renderAppearanceContent, openAppearancePopover, closeAppearancePopoverIfOutside,
} from './notes-appearance.js';
export { renderAppearanceContent, openAppearancePopover };

const tabsEl        = document.getElementById('notes-tabs');
const btnNew        = document.getElementById('btn-new-note');
const btnNotesList  = document.getElementById('btn-notes-list');
const importInput   = document.getElementById('note-import-input');
const noteEditorEl  = document.querySelector('.note-editor');
const noteSection   = document.querySelector('.note-section');

// A tira de abas só rola na horizontal, mas a roda do mouse manda scroll
// vertical por padrão (só vira horizontal segurando Shift) — aqui a gente
// já converte deltaY em scrollLeft direto, sem precisar da tecla. Vale pra
// todas as plataformas: no desktop o #notes-tabs também é uma tira horizontal
// (fica no topo do .note-section, ver initDesktopNotesAsideDrawer).
tabsEl.addEventListener('wheel', e => {
  if (e.deltaY === 0) return;
  e.preventDefault();
  tabsEl.scrollLeft += e.deltaY;
}, { passive: false });



let notesMeta = [];
let activeId  = null;

// Getters/setter expostos pros módulos extraídos de notes-tabs.js (notes-tutorial.js,
// notes-appearance.js, etc.) — notesMeta/activeId continuam vivendo aqui porque são
// lidos/escritos de quase todo canto do arquivo; mover o estado em si exigiria tocar
// dezenas de pontos de reatribuição de uma vez, então por enquanto só o acesso é
// exposto por função (mesmo padrão usado no split de note.js).
export function getNotesMeta() { return notesMeta; }
export function setNotesMeta(arr) { notesMeta = arr; }
export function getActiveId() { return activeId; }

// ── Reordenar notas por arraste (abas e lista do "☰") ─────────────────────────
// Mesma lógica de mover-dentro-do-array pros dois lugares; cada um só monta
// o indicador visual (barra vertical nas abas, linha horizontal na lista) do
// seu próprio jeito e chama isto no drop.
let noteDragSrcId = null;
let tabDropIndicatorEl = null;

function cleanupTabDrag() {
  tabDropIndicatorEl?.remove();
  tabDropIndicatorEl = null;
  noteDragSrcId = null;
}

async function reorderNotes(srcId, targetId, before) {
  if (srcId == null || srcId === targetId) return false;
  const from = notesMeta.findIndex(n => n.id === srcId);
  if (from === -1) return false;
  const [moved] = notesMeta.splice(from, 1);
  let to = notesMeta.findIndex(n => n.id === targetId);
  if (to === -1) to = notesMeta.length;
  else if (!before) to += 1;
  notesMeta.splice(to, 0, moved);

  // Só a nota arrastada é regravada — os vizinhos dizem onde ela cai. É o
  // ganho concreto da ordem fracionária: arrastar toca 1 registro, não N.
  const anterior = notesMeta[to - 1]?.ordem ?? null;
  const seguinte = notesMeta[to + 1]?.ordem ?? null;
  const novaOrdem = await moveNoteRecord(moved.id, anterior, seguinte);

  if (novaOrdem) {
    moved.ordem = novaOrdem;
  } else {
    // Vizinhança inconsistente: renumera a lista uma vez e segue. Caro, mas é
    // reparo — e deixa o banco são pro próximo arrasto ser barato de novo.
    const ordens = await reorderNoteRecords(notesMeta.map(n => n.id));
    notesMeta.forEach((n, i) => { n.ordem = ordens[i]; });
  }
  return true;
}

// Sem cor definida: remove a variável (não seta "transparent") pra que os
// elementos temáticos (citação, marcadores, checkbox) caiam de volta no
// var(--accent) padrão em vez de ficarem invisíveis.
export function setAccent(color) {
  if (color) {
    noteEditorEl?.style.setProperty('--note-accent', color);
    document.documentElement.style.setProperty('--note-accent', color);
  } else {
    noteEditorEl?.style.removeProperty('--note-accent');
    document.documentElement.style.removeProperty('--note-accent');
  }
}

// ── Gestão de Abas Abertas (Prevenção de Abas Infinitas) ──────────────────────
const OPEN_TABS_KEY = 'quickdock:open_tabs';

function getOpenTabIds() {
  try {
    const raw = localStorage.getItem(OPEN_TABS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr.map(Number);
    }
  } catch {}
  return null;
}

function saveOpenTabIds(ids) {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(ids));
  } catch {}
}

let openTabIds = getOpenTabIds() || [];

let emptyDashboardEl = null;

function formatRelativeTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const horas = String(d.getHours()).padStart(2, '0');
  const minutos = String(d.getMinutes()).padStart(2, '0');
  if (isToday) return `Hoje às ${horas}:${minutos}`;
  const ontem = new Date(now);
  ontem.setDate(now.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${horas}:${minutos}`;
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes} às ${horas}:${minutos}`;
}

export function hideEmptyDashboard() {
  document.body.classList.remove('no-note-open');
  document.documentElement.classList.remove('no-note-open');
  if (noteEditorEl) {
    noteEditorEl.hidden = false;
    noteEditorEl.style.display = '';
  }
  if (emptyDashboardEl) {
    emptyDashboardEl.hidden = true;
    emptyDashboardEl.style.display = 'none';
  }
}

export function showEmptyDashboard() {
  document.body.classList.add('no-note-open');
  document.documentElement.classList.add('no-note-open');
  if (noteEditorEl) {
    noteEditorEl.hidden = true;
    noteEditorEl.style.display = 'none';
  }
  if (!emptyDashboardEl) {
    emptyDashboardEl = document.createElement('div');
    emptyDashboardEl.id = 'notes-empty-dashboard';
    emptyDashboardEl.className = 'notes-empty-dashboard';
    noteSection.appendChild(emptyDashboardEl);
  }
  emptyDashboardEl.hidden = false;
  emptyDashboardEl.style.display = 'flex';
  renderEmptyDashboardContent(emptyDashboardEl);
}

export function renderEmptyDashboardContent(container) {
  container.innerHTML = '';

  const inner = document.createElement('div');
  inner.className = 'empty-dashboard-inner';

  // 1. Hero
  const hero = document.createElement('div');
  hero.className = 'empty-dashboard-hero';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'empty-dashboard-icon-wrap';
  iconWrap.innerHTML = iconSvg('sticky_note_2');

  const title = document.createElement('h2');
  title.className = 'empty-dashboard-title';
  title.textContent = 'Nenhuma nota aberta';

  const subtitle = document.createElement('p');
  subtitle.className = 'empty-dashboard-subtitle';
  subtitle.textContent = 'Escolha uma nota recente para continuar ou use as ações rápidas abaixo.';

  hero.append(iconWrap, title, subtitle);
  inner.appendChild(hero);

  // 2. Ações Rápidas
  const actionsSection = document.createElement('div');
  actionsSection.className = 'empty-dashboard-section';

  const actionsTitle = document.createElement('div');
  actionsTitle.className = 'empty-dashboard-section-title';
  actionsTitle.innerHTML = `${iconSvg('bolt')}<span>Ações Rápidas</span>`;
  actionsSection.appendChild(actionsTitle);

  const actionsGrid = document.createElement('div');
  actionsGrid.className = 'empty-dashboard-actions-grid';

  const createActionCard = (icon, color, bg, titleText, descText, onClick) => {
    const card = document.createElement('button');
    card.className = 'empty-dashboard-action-card';
    card.innerHTML = `
      <div class="dash-action-icon" style="background: ${bg}; color: ${color};">
        ${iconSvg(icon)}
      </div>
      <div class="dash-action-info">
        <span class="dash-action-title">${titleText}</span>
        <span class="dash-action-desc">${descText}</span>
      </div>
    `;
    card.addEventListener('click', async e => {
      e.stopPropagation();
      await onClick();
    });
    return card;
  };

  actionsGrid.appendChild(createActionCard('edit_note', 'var(--accent)', 'rgba(37, 99, 235, 0.1)', 'Nova nota', 'Começar nota em branco', () => createBlankNote()));
  actionsGrid.appendChild(createActionCard('view_kanban', '#a855f7', 'rgba(168, 85, 247, 0.1)', 'Nova Base', 'Tabelas e quadros dinâmicos', () => createNewBaseNote()));
  actionsGrid.appendChild(createActionCard('folder_open', '#22c55e', 'rgba(34, 197, 94, 0.1)', 'Todas as notas', 'Navegar em pastas e arquivos', () => openNotesAsideDrawer()));
  actionsGrid.appendChild(createActionCard('auto_stories', '#eab308', 'rgba(234, 179, 8, 0.1)', 'Modelos', 'Explorar modelos prontos', () => switchView('templates')));

  actionsSection.appendChild(actionsGrid);
  inner.appendChild(actionsSection);

  // 3. Notas Recentes
  if (notesMeta && notesMeta.length > 0) {
    const recentsSection = document.createElement('div');
    recentsSection.className = 'empty-dashboard-section';

    const recentsTitle = document.createElement('div');
    recentsTitle.className = 'empty-dashboard-section-title';
    recentsTitle.innerHTML = `${iconSvg('history')}<span>Notas Recentes</span>`;
    recentsSection.appendChild(recentsTitle);

    const recentsList = document.createElement('div');
    recentsList.className = 'empty-dashboard-recents-list';

    const sorted = notesMeta.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);

    for (const meta of sorted) {
      const item = document.createElement('button');
      item.className = 'empty-dashboard-recent-item';

      const indicator = buildTabIndicator(meta) || createIcon('description', 'note-tab-icon');

      const titleSpan = document.createElement('span');
      titleSpan.className = 'recent-item-title';
      titleSpan.textContent = meta.title || 'Sem título';

      item.append(indicator, titleSpan);

      if (meta.pasta) {
        const folderBadge = document.createElement('span');
        folderBadge.className = 'recent-item-folder';
        folderBadge.textContent = meta.pasta;
        item.appendChild(folderBadge);
      }

      if (meta.updatedAt) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'recent-item-time';
        timeSpan.textContent = formatRelativeTime(meta.updatedAt);
        item.appendChild(timeSpan);
      }

      item.addEventListener('click', async e => {
        e.stopPropagation();
        await activateNote(meta.id);
        renderTabs();
        scrollTabIntoView(meta.id);
      });

      recentsList.appendChild(item);
    }

    recentsSection.appendChild(recentsList);
    inner.appendChild(recentsSection);
  }

  // 4. Recursos & Dicas Úteis
  const tipsSection = document.createElement('div');
  tipsSection.className = 'empty-dashboard-section';

  const tipsTitle = document.createElement('div');
  tipsTitle.className = 'empty-dashboard-section-title';
  tipsTitle.innerHTML = `${iconSvg('tips_and_updates')}<span>Recursos e Atalhos Úteis</span>`;
  tipsSection.appendChild(tipsTitle);

  const tipsGrid = document.createElement('div');
  tipsGrid.className = 'empty-dashboard-tips-grid';

  const tips = [
    { badge: '[[', title: 'Links Internos', desc: 'Digite [[ para conectar notas e criar wikilinks.' },
    { badge: '/', title: 'Menu de Blocos', desc: 'Digite / para inserir tabelas, destaques, cálculos e listas.' },
    { badge: '#', title: 'Tags e Títulos', desc: 'Use #tags para marcar tópicos ou # para criar títulos.' },
    { badge: '📘', title: 'Ver Tutorial', desc: 'Clique para abrir o guia interativo do QuickDock.', onClick: () => createTutorialNote() },
  ];

  for (const t of tips) {
    const card = document.createElement(t.onClick ? 'button' : 'div');
    card.className = 'empty-dashboard-tip-card' + (t.onClick ? ' is-clickable' : '');
    card.innerHTML = `
      <span class="tip-badge">${t.badge}</span>
      <div class="tip-content">
        <strong>${t.title}</strong>
        <span>${t.desc}</span>
      </div>
    `;
    if (t.onClick) {
      card.addEventListener('click', async e => {
        e.stopPropagation();
        await t.onClick();
      });
    }
    tipsGrid.appendChild(card);
  }

  tipsSection.appendChild(tipsGrid);
  inner.appendChild(tipsSection);

  container.appendChild(inner);
}

export async function deactivateActiveNote() {
  activeId = null;
  await saveActiveNoteId(null);
  await switchToNote(null);
  await setDocumentsNote(null);
  setAccent(null);
  updateNoteFolderBar(null);
  showEmptyDashboard();
}

export async function closeTab(noteId) {
  const idNum = Number(noteId);
  const idx = openTabIds.indexOf(idNum);
  if (idx === -1) return;

  openTabIds.splice(idx, 1);
  saveOpenTabIds(openTabIds);

  if (idNum === activeId) {
    if (openTabIds.length > 0) {
      const nextIdx = Math.min(idx, openTabIds.length - 1);
      await activateNote(openTabIds[nextIdx]);
    } else {
      await deactivateActiveNote();
    }
  }

  renderTabs();
  if (activeId) scrollTabIntoView(activeId);
}

export function renderTabs() {
  tabsEl.innerHTML = '';
  let validOpenIds = (openTabIds || []).filter(id => notesMeta.some(n => n.id === id));
  openTabIds = validOpenIds;
  saveOpenTabIds(openTabIds);

  for (const id of openTabIds) {
    const meta = notesMeta.find(n => n.id === id);
    if (meta) tabsEl.appendChild(buildTab(meta));
  }

  if (openTabIds.length === 0) {
    showEmptyDashboard();
  } else {
    hideEmptyDashboard();
  }

  if (notesAsideDrawer) {
    notesAsideDrawer.querySelectorAll('.notes-list-item').forEach(el => {
      const isCur = Number(el.dataset.id) === activeId;
      el.classList.toggle('current', isCur);
    });
    const badge = notesAsideDrawer.querySelector('.notes-aside-badge');
    if (badge) badge.textContent = String(notesMeta.length);
  }

  // Notifica o Spatial Shell (spatial-shell.js) pra sincronizar uma tile por
  // nota aberta no mosaico — cada nota vira sua própria view (design-pattern),
  // não só uma aba. Ver também getOpenTabsSnapshot() pro estado inicial.
  document.dispatchEvent(new CustomEvent('quickdock:notes-open-tabs-changed', {
    detail: getOpenTabsSnapshot()
  }));
}

// Estado atual de abas abertas, pro Spatial Shell montar as tiles de notas no
// mosaico sem precisar duplicar o acesso a notesMeta/openTabIds (privados
// deste módulo). Usado tanto no listener do evento acima quanto na leitura
// inicial de spatial-shell.js (initSpatialShell roda depois de initNotesTabs,
// então o primeiro evento já teria disparado antes do listener existir).
export function getOpenTabsSnapshot() {
  return {
    openIds: [...openTabIds],
    activeId,
    notes: openTabIds.map(id => notesMeta.find(n => n.id === id)).filter(Boolean)
  };
}

// A tira de abas rola só na horizontal — trocar de nota por um caminho que
// não seja clicar na própria aba (menu "☰", carregamento inicial) pode
// deixar a aba ativa fora da área visível.
export function scrollTabIntoView(id) {
  const tab = tabsEl.querySelector(`.note-tab[data-id="${id}"]`);
  tab?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

// Indicador visual da aba: ícone se a nota tem um definido, senão a bolinha
// de cor se tem cor, senão nada (só o título aparece). Não existe mais um
// "modo" separado — é só o que estiver de fato preenchido. Não tem clique
// próprio: o duplo clique em qualquer parte da aba (texto, ícone ou cor)
// é tratado no nível da própria aba, em buildTab.
function buildTabIndicator(meta) {
  if (meta.icon) {
    const ico = createIcon(meta.icon, 'note-tab-icon' + (meta.iconFilled ? ' icon-filled' : ''));
    ico.style.color = meta.color || 'var(--text-muted)';
    return ico;
  }

  if (meta.color) {
    const dot = document.createElement('span');
    dot.className = 'note-tab-dot';
    dot.style.background = meta.color;
    return dot;
  }

  return null;
}

function buildTab(meta) {
  const isConflict = /conflito/i.test(meta.title ?? '');
  const isActive = meta.id === activeId;
  const tab = document.createElement('div');
  tab.className = 'note-tab' + (isActive ? ' active' : '') + (isConflict ? ' is-conflict' : '');
  tab.draggable = true;
  tab.dataset.id = String(meta.id);
  tab.title = meta.pasta
    ? `${meta.title || 'Sem título'} (📁 ${meta.pasta})`
    : (meta.title || 'Sem título');

  // Se a aba estiver ativa: se tiver cor definida, usa essa cor na borda; senão cai no cinza mais escuro do CSS
  if (isActive) {
    if (meta.color) {
      tab.style.setProperty('--active-accent', meta.color);
      tab.style.borderColor = meta.color;
    } else {
      tab.style.removeProperty('--active-accent');
      tab.style.removeProperty('border-color');
    }
  }

  const indicator = buildTabIndicator(meta);

  // Só oculta o nome se sobrar ícone ou cor pra identificar a aba — nunca os
  // três (ícone, cor e nome) somem ao mesmo tempo.
  const titleHidden = !!meta.titleHidden && !!(meta.icon || meta.color);

  const titleGroup = document.createElement('div');
  titleGroup.className = 'note-tab-title-group';
  if (titleHidden) titleGroup.hidden = true;

  const title = document.createElement('span');
  title.className   = 'note-tab-title';
  title.textContent = meta.title || 'Sem título';
  titleGroup.appendChild(title);

  if (meta.pasta) {
    const folderEl = document.createElement('span');
    folderEl.className = 'note-tab-folder note-tab-folder-badge';
    folderEl.textContent = meta.pasta;
    folderEl.title = `Pasta: ${meta.pasta}`;
    titleGroup.appendChild(folderEl);
    tab.classList.add('has-folder');
  }

  if (indicator) tab.appendChild(indicator);
  tab.appendChild(titleGroup);

  // Botão de fechar aba
  const closeBtn = document.createElement('button');
  closeBtn.className = 'note-tab-close icon-btn';
  closeBtn.title = 'Fechar aba';
  closeBtn.setAttribute('aria-label', 'Fechar aba');
  closeBtn.innerHTML = iconSvg('close');
  closeBtn.addEventListener('mousedown', e => e.stopPropagation());
  closeBtn.addEventListener('click', async e => {
    e.stopPropagation();
    e.preventDefault();
    await closeTab(meta.id);
  });
  tab.appendChild(closeBtn);

  // Clique com botão do meio fecha a aba
  tab.addEventListener('auxclick', async e => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      await closeTab(meta.id);
    }
  });

  // Um clique só troca de nota (nunca abre menu, pra não abrir sem querer).
  // O clique duplo ou clique com botão direito abre o menu da nota (Mover para pasta, Renomear, etc.)
  tab.addEventListener('click', async () => {
    if (meta.id === activeId) return;
    await activateNote(meta.id);
    renderTabs();
  });
  tab.addEventListener('dblclick', e => {
    e.preventDefault();
    openTabMenu(meta, tab);
  });
  tab.addEventListener('contextmenu', e => {
    e.preventDefault();
    openTabMenu(meta, tab);
  });

  tab.addEventListener('dragstart', e => {
    noteDragSrcId = meta.id;
    e.dataTransfer.effectAllowed = 'move';
    tabDropIndicatorEl = document.createElement('div');
    tabDropIndicatorEl.className = 'tab-drop-indicator';
  });
  tab.addEventListener('dragover', e => {
    if (noteDragSrcId == null || noteDragSrcId === meta.id || !tabDropIndicatorEl) return;
    e.preventDefault();
    const rect = tab.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    tab[before ? 'before' : 'after'](tabDropIndicatorEl);
  });
  tab.addEventListener('drop', async e => {
    e.preventDefault();
    if (noteDragSrcId == null) return;
    const rect = tab.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    const srcId = noteDragSrcId;
    cleanupTabDrag();
    const srcIdx = openTabIds.indexOf(srcId);
    const targetIdx = openTabIds.indexOf(meta.id);
    if (srcIdx !== -1 && targetIdx !== -1) {
      openTabIds.splice(srcIdx, 1);
      const insertIdx = openTabIds.indexOf(meta.id) + (before ? 0 : 1);
      openTabIds.splice(insertIdx, 0, srcId);
      saveOpenTabIds(openTabIds);
    }
    const moved = await reorderNotes(srcId, meta.id, before);
    if (moved) { renderTabs(); scrollTabIntoView(srcId); }
  });
  tab.addEventListener('dragend', cleanupTabDrag);

  return tab;
}


// ── Menu "⋯" (nome / ícone / cor / copiar / baixar / excluir) ────────────────
// Pega os blocos da nota pedida: se for a nota aberta na tela, lê o DOM ao
// vivo (depois de garantir que está salvo); se for outra aba, lê do banco —
// mesma lógica de fallback usada ao trocar de nota.
async function getBlocksForNote(meta) {
  if (meta.id === activeId) {
    await flushSave();
    return getCurrentBlocks();
  }
  const note = await getNoteById(meta.id);
  return (note?.blocks?.length) ? note.blocks : parseMarkdownToBlocks(note?.content ?? '');
}

// Cria uma nota a partir de markdown de fora (.md importado, backup).
// A nota nasce vazia de propósito: a imagem em base64 precisa de um noteId pra
// virar arquivo, e só depois disso é que os blocos são gravados — senão o
// registro da nota carregaria os megabytes e seria regravado inteiro a cada
// autosave.
async function createNoteFromMarkdown(title, md) {
  const brutos = parseMarkdownToBlocks(md);
  const id     = await createNoteRecord({ title, content: '', blocks: [] });
  const blocks = await absorbDataUrls(brutos, id);
  await updateNoteBlocksById(id, blocks, blocksToMarkdown(blocks));
  notesMeta.push({ id, title, color: null, icon: null, updatedAt: Date.now() });
  return id;
}

function safeFilename(title) {
  return (title || 'nota').replace(/[\\/:*?"<>|]/g, '_').trim() || 'nota';
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Backup de todas as notas ──────────────────────────────────────────────────
// Um arquivo só, e não um por nota: um download não pede permissão de "vários
// downloads" ao navegador, e um arquivo único é mais fácil de guardar e de
// conferir. O formato e a leitura de volta estão em backup.js.
export async function downloadAllNotes() {
  await flushSave();

  const notas = [];
  for (const meta of notesMeta) {
    notas.push({ title: meta.title, md: await blocksToExportMarkdown(await getBlocksForNote(meta)) });
  }

  const carimbo = new Date().toISOString().slice(0, 10);
  downloadText(`quickdock-backup-${carimbo}.md`, buildBackup(notas));
}

let tabMenuEl = null;
let tabMenuAppearanceOpen = false;

function closeTabMenu() {
  tabMenuEl?.remove();
  tabMenuEl = null;
  tabMenuAppearanceOpen = false;
}

function renderTabMenu(meta, anchorEl) {
  const menu = tabMenuEl ?? document.createElement('div');
  menu.className = 'copy-menu tab-menu';
  menu.innerHTML = '';

  // Nome — o próprio input já dentro do menu, sem botão "Renomear" separado.
  const renameInput = document.createElement('input');
  renameInput.className = 'tab-menu-rename';
  renameInput.value = meta.title;
  renameInput.placeholder = 'Sem título';
  renameInput.addEventListener('mousedown', e => e.stopPropagation());
  renameInput.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  renameInput.blur();
    if (e.key === 'Escape') { renameInput.value = meta.title; renameInput.blur(); }
  });
  renameInput.addEventListener('blur', async () => {
    const val = renameInput.value.trim() || 'Sem título';
    if (val === meta.title) return;
    await updateNoteMetaById(meta.id, { title: val });
    meta.title = val;
    renderTabs();
    refreshOpenAsideRows();
    // Se esta for a nota aberta no momento, o cabeçalho precisa saber —
    // reaproveita o mesmo aviso do ícone/cor (note.js já busca dados frescos).
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
  });
  menu.appendChild(renameInput);

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  // Ícone e cor — dropdown embutido no mesmo menu, em vez de abrir outro
  // popover por cima. Expande/recolhe sem fechar o menu.
  const appearanceToggle = document.createElement('button');
  appearanceToggle.className = 'copy-opt tab-menu-appearance-toggle';
  appearanceToggle.innerHTML =
    `<span class="copy-opt-value">Ícone e cor</span><span class="copy-opt-hint">${tabMenuAppearanceOpen ? '▲' : '▼'}</span>`;
  appearanceToggle.addEventListener('mousedown', e => e.stopPropagation());
  appearanceToggle.addEventListener('click', e => {
    e.stopPropagation();
    tabMenuAppearanceOpen = !tabMenuAppearanceOpen;
    renderTabMenu(meta, anchorEl);
  });
  menu.appendChild(appearanceToggle);

  if (tabMenuAppearanceOpen) {
    const wrap = document.createElement('div');
    wrap.className = 'tab-menu-appearance';
    renderAppearanceContent(wrap, meta);
    menu.appendChild(wrap);
  }

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  const addOpt = (label, run) => {
    const btn = document.createElement('button');
    btn.className = 'copy-opt';
    btn.innerHTML = `<span class="copy-opt-value">${label}</span>`;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', async e => { e.stopPropagation(); closeTabMenu(); await run(); });
    menu.appendChild(btn);
  };

  addOpt('Copiar como Markdown', async () => {
    const text = await blocksToExportMarkdown(await getBlocksForNote(meta));
    await navigator.clipboard.writeText(text);
  });
  addOpt('Copiar como texto', async () => {
    const text = blocksToPlainText(await getBlocksForNote(meta));
    await navigator.clipboard.writeText(text);
  });
  addOpt('Baixar .md', async () => {
    const text = await blocksToExportMarkdown(await getBlocksForNote(meta));
    downloadText(`${safeFilename(meta.title)}.md`, text);
  });
  addOpt('Baixar .txt', async () => {
    const text = blocksToPlainText(await getBlocksForNote(meta));
    downloadText(`${safeFilename(meta.title)}.txt`, text);
  });

  addOpt('Mover para pasta...', async () => {
    await promptMoverNotaParaPasta(meta, anchorEl, () => {
      renderTabs();
    });
  });

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  addOpt('Fechar aba', async () => {
    await closeTab(meta.id);
  });

  if (openTabIds.length > 1) {
    addOpt('Fechar outras abas', async () => {
      openTabIds = [meta.id];
      saveOpenTabIds(openTabIds);
      if (activeId !== meta.id) await activateNote(meta.id);
      renderTabs();
    });
  }

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  addOpt('Limpar conteúdo', async () => {
    if (!confirm(`Limpar o conteúdo de "${meta.title}"?\n\nO nome, a cor e os documentos da nota não mudam.`)) return;
    if (meta.id === activeId) await clearCurrentNote();
    else await updateNoteBlocksById(meta.id, [], '');
  });

  addOpt('Excluir', async () => {
    if (notesMeta.length <= 1) { alert('Deve existir ao menos uma nota.'); return; }
    if (!confirm(`Excluir a nota "${meta.title}"?`)) return;
    // Os documentos vinculados viram gerais: some a nota, não os arquivos.
    await detachFilesFromNote(meta.id);
    await deleteNoteRecordById(meta.id);
    // Imagem inline só existe dentro daquela nota: sem a nota, é lixo.
    await gcInlineFiles();
    notesMeta = notesMeta.filter(n => n.id !== meta.id);
    openTabIds = openTabIds.filter(id => id !== meta.id);
    saveOpenTabIds(openTabIds);
    if (activeId === meta.id) {
      const nextId = openTabIds[0] ?? notesMeta[0]?.id;
      if (nextId) await activateNote(nextId);
    }
    await refreshDocuments();
    renderTabs();
  });

  if (!tabMenuEl) {
    document.body.appendChild(menu);
    tabMenuEl = menu;
  }
  positionPopover(menu, anchorEl);
}

function openTabMenu(meta, anchorEl) {
  closeTabMenu();
  renderTabMenu(meta, anchorEl);
  const renameInput = tabMenuEl.querySelector('.tab-menu-rename');
  renameInput?.focus();
  renameInput?.select();
}


document.addEventListener('mousedown', e => {
  if (tabMenuEl && !tabMenuEl.contains(e.target)) closeTabMenu();
  closeAppearancePopoverIfOutside(e.target);
});

// Título editado direto no cabeçalho da nota (note.js) atualiza a aba na
// hora, a cada tecla — só o texto visível, sem gravar nada: gravar de
// verdade (e reescrever links de quem aponta pra esta nota) espera o
// debounce lá do cabeçalho, essa atualização aqui é só cosmética.
document.addEventListener('quickdock:note-title-preview', e => {
  const { noteId, title } = e.detail || {};
  if (noteId == null) return;
  const tabTitleEl = tabsEl.querySelector(`.note-tab[data-id="${noteId}"] .note-tab-title`);
  if (tabTitleEl) tabTitleEl.textContent = title || 'Sem título';
});

// ── Gestão e Árvore de Pastas (Fase 2) ─────────────────────────────────────────
const FOLDERS_OPEN_KEY = 'quickdock:folders:open';

function getOpenFolders() {
  try {
    const raw = localStorage.getItem(FOLDERS_OPEN_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return null;
}

function saveOpenFolders(set) {
  try {
    localStorage.setItem(FOLDERS_OPEN_KEY, JSON.stringify([...set]));
  } catch {}
}

export function buildFolderTree(pastas, notes) {
  const root = {
    caminho: '',
    nome: '',
    nivel: 0,
    subpastas: new Map(),
    notas: [],
  };

  const todosCaminhos = new Set();
  for (const p of (pastas || [])) if (p.caminho) todosCaminhos.add(p.caminho);
  for (const n of (notes || [])) if (n.pasta) todosCaminhos.add(n.pasta);

  for (const c of [...todosCaminhos]) {
    const partes = c.split('/');
    for (let i = 1; i <= partes.length; i++) {
      todosCaminhos.add(partes.slice(0, i).join('/'));
    }
  }

  const caminhosOrdenados = [...todosCaminhos].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  function getNode(caminho) {
    if (!caminho) return root;
    const partes = caminho.split('/');
    let cur = root;
    for (let i = 0; i < partes.length; i++) {
      const subCaminho = partes.slice(0, i + 1).join('/');
      if (!cur.subpastas.has(partes[i])) {
        cur.subpastas.set(partes[i], {
          caminho: subCaminho,
          nome: partes[i],
          nivel: i + 1,
          subpastas: new Map(),
          notas: [],
        });
      }
      cur = cur.subpastas.get(partes[i]);
    }
    return cur;
  }

  for (const c of caminhosOrdenados) getNode(c);

  for (const n of notes) {
    const node = getNode(n.pasta || '');
    node.notas.push(n);
  }

  return root;
}

function contarNotasTotal(node) {
  let count = node.notas.length;
  for (const sub of node.subpastas.values()) {
    count += contarNotasTotal(sub);
  }
  return count;
}

let folderModalEl = null;
function closeFolderModal() { folderModalEl?.remove(); folderModalEl = null; }

export let renamingFolderPath = null;

export async function startCreateFolderInline(parentPath = '', onDone = null) {
  closeFolderModal();
  closeFolderMenu();
  const pastas = await listarPastas();
  const existentes = new Set(pastas.map(p => p.caminho));
  for (const n of notesMeta) if (n.pasta) existentes.add(n.pasta);

  const baseName = parentPath ? 'Nova subpasta' : 'Nova pasta';
  let candidate = parentPath ? `${parentPath}/${baseName}` : baseName;
  let counter = 2;
  while (existentes.has(candidate)) {
    candidate = parentPath ? `${parentPath}/${baseName} ${counter}` : `${baseName} ${counter}`;
    counter++;
  }

  try {
    normalizarCaminhoPasta(candidate);
  } catch (err) {
    alert(err.message || 'Caminho excede 3 níveis de profundidade.');
    return;
  }

  await criarPasta(candidate);
  const openSet = getOpenFolders() || new Set();
  openSet.add(candidate);
  if (parentPath) {
    const partes = parentPath.split('/');
    for (let i = 1; i <= partes.length; i++) {
      openSet.add(partes.slice(0, i).join('/'));
    }
  }
  saveOpenFolders(openSet);

  renamingFolderPath = candidate;

  if (notesAsideDrawer && notesAsideDrawer.classList.contains('open')) {
    const scroll = notesAsideDrawer.querySelector('.notes-list-scroll');
    const input = notesAsideDrawer.querySelector('.notes-search-input');
    const countEl = notesAsideDrawer.querySelector('.notes-search-count');
    const clearBtn = notesAsideDrawer.querySelector('.notes-search-clear');
    if (scroll) await renderNotesListRows(scroll, input?.value || '', countEl, clearBtn);
  } else {
    openNotesAsideDrawer();
  }
  if (onDone) await onDone();
}

export async function startRenameFolderInline(caminho, onDone = null) {
  closeFolderModal();
  closeFolderMenu();
  renamingFolderPath = caminho;
  if (notesAsideDrawer && notesAsideDrawer.classList.contains('open')) {
    const scroll = notesAsideDrawer.querySelector('.notes-list-scroll');
    const input = notesAsideDrawer.querySelector('.notes-search-input');
    const countEl = notesAsideDrawer.querySelector('.notes-search-count');
    const clearBtn = notesAsideDrawer.querySelector('.notes-search-clear');
    if (scroll) await renderNotesListRows(scroll, input?.value || '', countEl, clearBtn);
  }
  if (onDone) await onDone();
}

export function promptNovaPasta(parentPath = '', onDone = null) {
  startCreateFolderInline(parentPath, onDone);
}

export function promptRenomearPasta(caminhoAntigo, onDone = null) {
  startRenameFolderInline(caminhoAntigo, onDone);
}

function promptExcluirPasta(caminho, totalNotas, onDone = null) {
  closeFolderModal();
  const pop = document.createElement('div');
  pop.className = 'copy-menu folder-modal';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = `Excluir pasta "${caminho}"`;

  const desc = document.createElement('div');
  desc.className = 'folder-modal-desc';
  desc.textContent = totalNotas > 0
    ? `Esta pasta contém ${totalNotas} nota(s). O que deseja fazer com elas?`
    : 'Tem certeza que deseja excluir esta pasta vazia?';

  const btnRow = document.createElement('div');
  btnRow.className = 'folder-modal-actions-col';

  if (totalNotas > 0) {
    const btnMoverRaiz = document.createElement('button');
    btnMoverRaiz.className = 'copy-opt folder-action-opt';
    btnMoverRaiz.innerHTML = '<span class="copy-opt-value">Mover notas para a raiz e excluir pasta</span>';
    btnMoverRaiz.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderModal();
      await excluirPasta(caminho, { manterNotas: true });
      notesMeta = await loadAllNotesMeta();
      openTabIds = openTabIds.filter(id => notesMeta.some(n => n.id === id));
      saveOpenTabIds(openTabIds);
      renderTabs();
      if (onDone) await onDone();
    });
    btnRow.appendChild(btnMoverRaiz);

    const btnApagarTudo = document.createElement('button');
    btnApagarTudo.className = 'copy-opt folder-action-opt folder-action-danger';
    btnApagarTudo.innerHTML = '<span class="copy-opt-value">Excluir pasta e todas as notas</span>';
    btnApagarTudo.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderModal();
      await excluirPasta(caminho, { manterNotas: false });
      notesMeta = await loadAllNotesMeta();
      openTabIds = openTabIds.filter(id => notesMeta.some(n => n.id === id));
      saveOpenTabIds(openTabIds);
      if (!notesMeta.some(n => n.id === activeId) && notesMeta.length > 0) {
        await activateNote(openTabIds[0] ?? notesMeta[0].id);
      }
      renderTabs();
      if (onDone) await onDone();
    });
    btnRow.appendChild(btnApagarTudo);
  } else {
    const btnConfirmVazia = document.createElement('button');
    btnConfirmVazia.className = 'copy-opt folder-action-opt folder-action-danger';
    btnConfirmVazia.innerHTML = '<span class="copy-opt-value">Excluir pasta</span>';
    btnConfirmVazia.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderModal();
      await excluirPasta(caminho, { manterNotas: true });
      notesMeta = await loadAllNotesMeta();
      renderTabs();
      if (onDone) await onDone();
    });
    btnRow.appendChild(btnConfirmVazia);
  }

  const btnCancel = document.createElement('button');
  btnCancel.className = 'copy-opt folder-action-opt';
  btnCancel.innerHTML = '<span class="copy-opt-value">Cancelar</span>';
  btnCancel.addEventListener('click', e => { e.stopPropagation(); closeFolderModal(); });
  btnRow.appendChild(btnCancel);

  pop.append(head, desc, btnRow);
  pop.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(pop);
  folderModalEl = pop;

  pop.style.position = 'fixed';
  pop.style.top = '50%';
  pop.style.left = '50%';
  pop.style.transform = 'translate(-50%, -50%)';
  pop.style.zIndex = '2500';
}

let moveMenuEl = null;
function closeMoveMenu() { moveMenuEl?.remove(); moveMenuEl = null; }

export async function promptMoverNotaParaPasta(meta, anchorEl, onDone = null) {
  closeMoveMenu();
  const pop = document.createElement('div');
  pop.className = 'copy-menu folder-picker-popover';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = 'Mover para pasta';
  pop.appendChild(head);

  const pastas = await listarPastas();
  const todosCaminhos = new Set();
  for (const p of pastas) if (p.caminho) todosCaminhos.add(p.caminho);
  for (const n of notesMeta) if (n.pasta) todosCaminhos.add(n.pasta);
  const ordenados = [...todosCaminhos].sort();

  const optRaiz = document.createElement('button');
  optRaiz.className = 'copy-opt' + (!meta.pasta ? ' current' : '');
  optRaiz.innerHTML = `<span class="copy-opt-value">📁 Raiz (sem pasta)</span>${!meta.pasta ? '<span class="copy-opt-hint">✓</span>' : ''}`;
  optRaiz.addEventListener('click', async e => {
    e.stopPropagation();
    closeMoveMenu();
    await moverNotaParaPasta(meta.id, '');
    meta.pasta = '';
    notesMeta = await loadAllNotesMeta();
    renderTabs();
    if (meta.id === activeId) updateNoteFolderBar(meta);
    if (onDone) await onDone();
  });
  pop.appendChild(optRaiz);

  for (const cam of ordenados) {
    const isCurrent = meta.pasta === cam;
    const parts = cam.split('/');
    const indent = '&nbsp;&nbsp;'.repeat(parts.length - 1);
    const opt = document.createElement('button');
    opt.className = 'copy-opt' + (isCurrent ? ' current' : '');
    opt.innerHTML = `<span class="copy-opt-value">${indent}📁 ${parts[parts.length - 1]}</span>${isCurrent ? '<span class="copy-opt-hint">✓</span>' : ''}`;
    opt.title = cam;
    opt.addEventListener('click', async e => {
      e.stopPropagation();
      closeMoveMenu();
      await moverNotaParaPasta(meta.id, cam);
      meta.pasta = cam;
      notesMeta = await loadAllNotesMeta();
      renderTabs();
      if (meta.id === activeId) updateNoteFolderBar(meta);
      if (onDone) await onDone();
    });
    pop.appendChild(opt);
  }

  pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  const optNova = document.createElement('button');
  optNova.className = 'copy-opt';
  optNova.innerHTML = '<span class="copy-opt-value">＋ Nova pasta...</span>';
  optNova.addEventListener('click', e => {
    e.stopPropagation();
    closeMoveMenu();
    promptNovaPasta('', async () => {
      await promptMoverNotaParaPasta(meta, anchorEl, onDone);
    });
  });
  pop.appendChild(optNova);

  pop.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(pop);
  moveMenuEl = pop;

  if (anchorEl) {
    positionPopover(pop, anchorEl);
  } else {
    pop.style.position = 'fixed';
    pop.style.top = '50%';
    pop.style.left = '50%';
    pop.style.transform = 'translate(-50%, -50%)';
    pop.style.zIndex = '2500';
  }
}

let folderMenuEl = null;
function closeFolderMenu() { folderMenuEl?.remove(); folderMenuEl = null; }

function openFolderMenu(caminho, nivel, totalNotas, anchorEl, onRefresh) {
  closeFolderMenu();
  const menu = document.createElement('div');
  menu.className = 'copy-menu folder-context-menu';

  const head = document.createElement('div');
  head.className = 'copy-menu-header';
  head.textContent = caminho;
  menu.appendChild(head);

  const btnNota = document.createElement('button');
  btnNota.className = 'copy-opt';
  btnNota.innerHTML = '<span class="copy-opt-value">＋ Nova nota nesta pasta</span>';
  btnNota.addEventListener('click', async e => {
    e.stopPropagation();
    closeFolderMenu();
    await createNoteInFolder(caminho, false);
    if (onRefresh) await onRefresh();
  });
  menu.appendChild(btnNota);

  const btnBase = document.createElement('button');
  btnBase.className = 'copy-opt';
  btnBase.innerHTML = '<span class="copy-opt-value">🗃️ Nova Base nesta pasta</span>';
  btnBase.addEventListener('click', async e => {
    e.stopPropagation();
    closeFolderMenu();
    await createNoteInFolder(caminho, true);
    if (onRefresh) await onRefresh();
  });
  menu.appendChild(btnBase);

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  if (nivel < 3) {
    const btnSub = document.createElement('button');
    btnSub.className = 'copy-opt';
    btnSub.innerHTML = '<span class="copy-opt-value">＋ Nova subpasta</span>';
    btnSub.addEventListener('click', async e => {
      e.stopPropagation();
      closeFolderMenu();
      await startCreateFolderInline(caminho, onRefresh);
    });
    menu.appendChild(btnSub);
  }

  const btnRenomear = document.createElement('button');
  btnRenomear.className = 'copy-opt';
  btnRenomear.innerHTML = '<span class="copy-opt-value">✎ Renomear pasta</span>';
  btnRenomear.addEventListener('click', async e => {
    e.stopPropagation();
    closeFolderMenu();
    await startRenameFolderInline(caminho, onRefresh);
  });
  menu.appendChild(btnRenomear);

  const btnExcluir = document.createElement('button');
  btnExcluir.className = 'copy-opt folder-action-danger';
  btnExcluir.innerHTML = '<span class="copy-opt-value">🗑 Excluir pasta</span>';
  btnExcluir.addEventListener('click', e => {
    e.stopPropagation();
    closeFolderMenu();
    promptExcluirPasta(caminho, totalNotas, onRefresh);
  });
  menu.appendChild(btnExcluir);

  menu.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(menu);
  folderMenuEl = menu;
  positionPopover(menu, anchorEl);
}

// ── Lista de notas / Painel Lateral Aside ("☰") ──────────────────────────────
let notesAsideDrawer = null;
let notesAsideBackdrop = null;
let notesListPopover = null; // Mantido para compatibilidade reversa

function isDesktopMode() {
  return document.documentElement.dataset.platform === 'desktop'
      || document.documentElement.classList.contains('platform-desktop');
}

export function closeNotesAsideDrawer() {
  // No desktop o drawer é permanente — nunca fechar nem remover.
  if (isDesktopMode()) return;

  const mAside = document.getElementById('mAside');
  if (mAside) {
    mAside.classList.remove('is-open-mobile');
    return;
  }

  if (notesAsideDrawer) {
    notesAsideDrawer.classList.remove('open');
    notesAsideDrawer.classList.add('closing');
    const drawerEl = notesAsideDrawer;
    setTimeout(() => {
      drawerEl?.remove();
    }, 240);
    notesAsideDrawer = null;
    notesListPopover = null;
  }
  if (notesAsideBackdrop) {
    notesAsideBackdrop.classList.remove('open');
    const backdropEl = notesAsideBackdrop;
    setTimeout(() => {
      backdropEl?.remove();
    }, 240);
    notesAsideBackdrop = null;
  }
  closeFolderModal();
  closeMoveMenu();
  closeFolderMenu();
}

export function closeNotesListPopover() {
  closeNotesAsideDrawer();
}

function openTabMenuForNote(meta) {
  if (isDesktopMode()) {
    // No desktop, o menu abre ancorado no próprio item da lista no drawer
    const listItem = notesAsideDrawer?.querySelector(`.notes-list-item[data-id="${meta.id}"]`);
    const anchor = listItem?.querySelector('.notes-list-edit-btn') || listItem;
    if (anchor) openTabMenu(meta, anchor);
    return;
  }
  closeNotesAsideDrawer();
  const tabEl = tabsEl.querySelector(`.note-tab[data-id="${meta.id}"]`);
  if (!tabEl) return;
  tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  openTabMenu(meta, tabEl);
}

let listDropIndicatorEl = null;

function cleanupListDrag() {
  listDropIndicatorEl?.remove();
  listDropIndicatorEl = null;
  noteDragSrcId = null;
  document.querySelectorAll('.folder-header.drag-over, .folder-children.drag-over').forEach(el => el.classList.remove('drag-over'));
}

async function renderNotesListRows(container, filterQuery = '', countEl = null, clearBtn = null) {
  container.querySelectorAll('.notes-list-item, .folder-item, .notes-list-empty, .root-folder-header').forEach(el => el.remove());

  const q = filterQuery.trim().toLowerCase();
  const isSearching = !!q;

  if (countEl && clearBtn) {
    if (isSearching) {
      const filtered = notesMeta.filter(m => {
        const titleMatch = (m.title || '').toLowerCase().includes(q);
        const contentMatch = (m.content || '').toLowerCase().includes(q);
        return titleMatch || contentMatch;
      });
      const visible = filtered.length;
      const total = notesMeta.length;
      const hidden = total - visible;
      countEl.textContent = `Mostrando ${visible} de ${total} notas (${hidden} oculta${hidden === 1 ? '' : 's'})`;
      countEl.hidden = false;
      clearBtn.hidden = false;
    } else {
      countEl.hidden = true;
      clearBtn.hidden = true;
    }
  }

  // Se estiver buscando, exibe notas correspondentes em lista plana com tag da pasta
  if (isSearching) {
    const filtered = notesMeta.filter(m => {
      const titleMatch = (m.title || '').toLowerCase().includes(q);
      const contentMatch = (m.content || '').toLowerCase().includes(q);
      return titleMatch || contentMatch;
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'copy-opt notes-list-empty';
      empty.style.color = 'var(--text-muted)';
      empty.style.justifyContent = 'center';
      empty.textContent = 'Nenhuma nota encontrada';
      container.appendChild(empty);
      return;
    }

    for (const meta of filtered) {
      const isConflict = /conflito/i.test(meta.title ?? '');
      const row = document.createElement('div');
      row.className = 'copy-opt notes-list-item' + (meta.id === activeId ? ' current' : '') + (isConflict ? ' is-conflict' : '');
      row.dataset.id = String(meta.id);

      const indicator = buildTabIndicator(meta);
      const label = document.createElement('span');
      label.className = 'copy-opt-value';
      label.textContent = meta.title || 'Sem título';

      if (indicator) row.appendChild(indicator);
      row.appendChild(label);

      if (meta.pasta) {
        const badge = document.createElement('span');
        badge.className = 'note-folder-badge';
        badge.textContent = meta.pasta;
        badge.title = `Pasta: ${meta.pasta}`;
        row.appendChild(badge);
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'notes-list-edit-btn';
      editBtn.innerHTML = iconSvg('more_horiz');
      editBtn.title = 'Opções da nota';
      editBtn.setAttribute('aria-label', 'Opções da nota');
      editBtn.addEventListener('mousedown', e => e.stopPropagation());
      editBtn.addEventListener('click', e => { e.stopPropagation(); openTabMenuForNote(meta); });
      row.appendChild(editBtn);

      row.addEventListener('mousedown', e => e.stopPropagation());
      ligarCliqueEDuploCliqueNaLinha(row, label, meta, async () => {
        closeNotesAsideDrawer();
        if (meta.id !== activeId) { await activateNote(meta.id); renderTabs(); }
        if (typeof window !== 'undefined' && typeof window.quickdockOpenView === 'function') {
          window.quickdockOpenView('notes');
        }
        scrollTabIntoView(meta.id);
      });

      container.appendChild(row);
    }
    return;
  }

  // Sem busca: Renderiza a árvore hierárquica completa de pastas e notas
  const pastas = await listarPastas();
  const tree = buildFolderTree(pastas, notesMeta);
  const openFolders = getOpenFolders();

  const renderNoteRow = (meta, indentPx = 0) => {
    const isConflict = /conflito/i.test(meta.title ?? '');
    const row = document.createElement('div');
    row.className = 'copy-opt notes-list-item' + (meta.id === activeId ? ' current' : '') + (isConflict ? ' is-conflict' : '');
    row.draggable = true;
    row.dataset.id = String(meta.id);
    if (indentPx > 0) row.style.paddingLeft = `${indentPx}px`;

    const indicator = buildTabIndicator(meta);
    const label = document.createElement('span');
    label.className = 'copy-opt-value';
    label.textContent = meta.title || 'Sem título';
    if (indicator) row.appendChild(indicator);
    row.appendChild(label);

    const editBtn = document.createElement('button');
    editBtn.className = 'notes-list-edit-btn';
    editBtn.innerHTML = iconSvg('more_horiz');
    editBtn.title = 'Opções da nota';
    editBtn.setAttribute('aria-label', 'Opções da nota');
    editBtn.addEventListener('mousedown', e => e.stopPropagation());
    editBtn.addEventListener('click', e => { e.stopPropagation(); openTabMenuForNote(meta); });
    row.appendChild(editBtn);

    row.addEventListener('mousedown', e => e.stopPropagation());
    ligarCliqueEDuploCliqueNaLinha(row, label, meta, async () => {
      closeNotesAsideDrawer();
      if (meta.id !== activeId) { await activateNote(meta.id); renderTabs(); }
      if (typeof window !== 'undefined' && typeof window.quickdockOpenView === 'function') {
        window.quickdockOpenView('notes');
      }
      scrollTabIntoView(meta.id);
    });

    row.addEventListener('dragstart', e => {
      e.stopPropagation();
      noteDragSrcId = meta.id;
      e.dataTransfer.effectAllowed = 'move';
      listDropIndicatorEl = document.createElement('div');
      listDropIndicatorEl.className = 'notes-list-drop-indicator';
    });

    row.addEventListener('dragover', e => {
      if (noteDragSrcId == null || noteDragSrcId === meta.id || !listDropIndicatorEl) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      row[before ? 'before' : 'after'](listDropIndicatorEl);
    });

    row.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (noteDragSrcId == null) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const srcId = noteDragSrcId;
      cleanupListDrag();

      // Se a nota veio de outra pasta, move para a pasta da nota de destino
      const srcMeta = notesMeta.find(n => n.id === srcId);
      if (srcMeta && (srcMeta.pasta || '') !== (meta.pasta || '')) {
        await moverNotaParaPasta(srcId, meta.pasta || '');
      }
      const moved = await reorderNotes(srcId, meta.id, before);
      notesMeta = await loadAllNotesMeta();
      const activeMeta = notesMeta.find(n => n.id === activeId);
      if (activeMeta) updateNoteFolderBar(activeMeta);
      renderTabs();
      await renderNotesListRows(container, filterQuery, countEl, clearBtn);
    });

    row.addEventListener('dragend', e => { e.stopPropagation(); cleanupListDrag(); });

    return row;
  };

  const renderNode = (node, parentEl) => {
    // 1. Renderiza subpastas deste nó
    for (const [, sub] of node.subpastas) {
      const isOpen = openFolders ? openFolders.has(sub.caminho) : true;
      const totalNotas = contarNotasTotal(sub);

      const folderItem = document.createElement('div');
      folderItem.className = 'folder-item';

      const header = document.createElement('div');
      header.className = 'folder-header';
      header.style.paddingLeft = `${(sub.nivel - 1) * 14 + 8}px`;

      const chevronBtn = document.createElement('button');
      chevronBtn.className = 'folder-chevron icon-btn' + (isOpen ? ' open' : '');
      chevronBtn.innerHTML = iconSvg(isOpen ? 'expand_more' : 'chevron_right');
      chevronBtn.title = isOpen ? 'Recolher pasta' : 'Expandir pasta';
      chevronBtn.addEventListener('click', e => {
        e.stopPropagation();
        const set = getOpenFolders() || new Set();
        if (set.has(sub.caminho)) set.delete(sub.caminho);
        else set.add(sub.caminho);
        saveOpenFolders(set);
        renderNotesListRows(container, filterQuery, countEl, clearBtn);
      });

      const folderIcon = document.createElement('span');
      folderIcon.className = 'folder-icon';
      folderIcon.innerHTML = iconSvg(isOpen ? 'folder_open' : 'folder');

      const isRenaming = renamingFolderPath === sub.caminho;
      let nameEl;

      if (isRenaming) {
        const inputRename = document.createElement('input');
        inputRename.type = 'text';
        inputRename.className = 'folder-inline-rename-input';
        inputRename.value = sub.nome;
        inputRename.addEventListener('click', e => e.stopPropagation());
        inputRename.addEventListener('mousedown', e => e.stopPropagation());

        let finished = false;
        const applyRename = async () => {
          if (finished) return;
          finished = true;
          const novoNome = inputRename.value.trim().replace(/[\\/:*?"<>|]/g, '');
          renamingFolderPath = null;
          if (!novoNome || novoNome === sub.nome) {
            await renderNotesListRows(container, filterQuery, countEl, clearBtn);
            return;
          }
          const partes = sub.caminho.split('/');
          const novoCaminho = partes.length > 1
            ? `${partes.slice(0, -1).join('/')}/${novoNome}`
            : novoNome;
          try {
            normalizarCaminhoPasta(novoCaminho);
            await renomearPasta(sub.caminho, novoCaminho);
            notesMeta = await loadAllNotesMeta();
            const openSet = getOpenFolders() || new Set();
            if (openSet.has(sub.caminho)) {
              openSet.delete(sub.caminho);
              openSet.add(novoCaminho);
              saveOpenFolders(openSet);
            }
            renderTabs();
          } catch (err) {
            console.error(err);
          }
          await renderNotesListRows(container, filterQuery, countEl, clearBtn);
        };

        inputRename.addEventListener('keydown', async e => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            await applyRename();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            finished = true;
            renamingFolderPath = null;
            await renderNotesListRows(container, filterQuery, countEl, clearBtn);
          }
        });
        inputRename.addEventListener('blur', async () => {
          await applyRename();
        });

        setTimeout(() => {
          inputRename.focus();
          inputRename.select();
        }, 60);

        nameEl = inputRename;
      } else {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-name';
        nameSpan.textContent = sub.nome;
        nameSpan.title = sub.caminho;
        nameSpan.addEventListener('dblclick', e => {
          e.stopPropagation();
          startRenameFolderInline(sub.caminho);
        });
        nameEl = nameSpan;
      }

      const countBadge = document.createElement('span');
      countBadge.className = 'folder-count';
      countBadge.textContent = String(totalNotas);

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'folder-actions-wrap';

      const addNoteBtn = document.createElement('button');
      addNoteBtn.className = 'folder-add-note-btn icon-btn';
      addNoteBtn.innerHTML = iconSvg('add');
      addNoteBtn.title = 'Nova nota nesta pasta';
      addNoteBtn.setAttribute('aria-label', 'Nova nota nesta pasta');
      addNoteBtn.addEventListener('click', async e => {
        e.stopPropagation();
        await createNoteInFolder(sub.caminho, false);
      });
      actionsWrap.appendChild(addNoteBtn);

      if (sub.nivel < 3) {
        const addSubBtn = document.createElement('button');
        addSubBtn.className = 'folder-add-subfolder-btn icon-btn';
        addSubBtn.innerHTML = iconSvg('create_new_folder');
        addSubBtn.title = 'Nova subpasta';
        addSubBtn.setAttribute('aria-label', 'Nova subpasta');
        addSubBtn.addEventListener('click', async e => {
          e.stopPropagation();
          await startCreateFolderInline(sub.caminho, () => {
            renderNotesListRows(container, filterQuery, countEl, clearBtn);
          });
        });
        actionsWrap.appendChild(addSubBtn);
      }

      const moreBtn = document.createElement('button');
      moreBtn.className = 'folder-more-btn icon-btn';
      moreBtn.innerHTML = iconSvg('more_horiz');
      moreBtn.title = 'Ações da pasta';
      moreBtn.setAttribute('aria-label', 'Ações da pasta');
      moreBtn.addEventListener('click', e => {
        e.stopPropagation();
        openFolderMenu(sub.caminho, sub.nivel, totalNotas, moreBtn, () => {
          renderNotesListRows(container, filterQuery, countEl, clearBtn);
        });
      });
      actionsWrap.appendChild(moreBtn);

      header.append(chevronBtn, folderIcon, nameEl, countBadge, actionsWrap);

      header.addEventListener('click', e => {
        e.stopPropagation();
        const set = getOpenFolders() || new Set();
        if (set.has(sub.caminho)) set.delete(sub.caminho);
        else set.add(sub.caminho);
        saveOpenFolders(set);
        renderNotesListRows(container, filterQuery, countEl, clearBtn);
      });

      header.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        openFolderMenu(sub.caminho, sub.nivel, totalNotas, header, () => {
          renderNotesListRows(container, filterQuery, countEl, clearBtn);
        });
      });

      // Drop target para mover notas arrastando para a pasta
      header.addEventListener('dragover', e => {
        if (noteDragSrcId == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        header.classList.add('drag-over');
      });

      header.addEventListener('dragleave', () => {
        header.classList.remove('drag-over');
      });

      header.addEventListener('drop', async e => {
        e.preventDefault();
        e.stopPropagation();
        header.classList.remove('drag-over');
        if (noteDragSrcId == null) return;
        const srcId = noteDragSrcId;
        cleanupListDrag();
        await moverNotaParaPasta(srcId, sub.caminho);
        notesMeta = await loadAllNotesMeta();
        const activeMeta = notesMeta.find(n => n.id === activeId);
        if (activeMeta) updateNoteFolderBar(activeMeta);
        renderTabs();
        await renderNotesListRows(container, filterQuery, countEl, clearBtn);
      });

      folderItem.appendChild(header);

      if (isOpen) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        const guideLeft = (sub.nivel - 1) * 14 + 17;
        childrenContainer.style.setProperty('--guide-left', `${guideLeft}px`);

        childrenContainer.addEventListener('dragover', e => {
          if (noteDragSrcId == null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          childrenContainer.classList.add('drag-over');
          header.classList.add('drag-over');
        });

        childrenContainer.addEventListener('dragleave', e => {
          if (!childrenContainer.contains(e.relatedTarget)) {
            childrenContainer.classList.remove('drag-over');
            header.classList.remove('drag-over');
          }
        });

        childrenContainer.addEventListener('drop', async e => {
          e.preventDefault();
          e.stopPropagation();
          childrenContainer.classList.remove('drag-over');
          header.classList.remove('drag-over');
          if (noteDragSrcId == null) return;
          const srcId = noteDragSrcId;
          cleanupListDrag();
          await moverNotaParaPasta(srcId, sub.caminho);
          notesMeta = await loadAllNotesMeta();
          const activeMeta = notesMeta.find(n => n.id === activeId);
          if (activeMeta) updateNoteFolderBar(activeMeta);
          renderTabs();
          await renderNotesListRows(container, filterQuery, countEl, clearBtn);
        });

        // Renderiza subpastas aninhadas
        renderNode(sub, childrenContainer);
        // Renderiza notas diretas desta pasta
        for (const meta of sub.notas) {
          childrenContainer.appendChild(renderNoteRow(meta, sub.nivel * 14 + 18));
        }
        if (sub.subpastas.size === 0 && sub.notas.length === 0) {
          const emptyRow = document.createElement('div');
          emptyRow.className = 'folder-empty-hint';
          emptyRow.style.paddingLeft = `${sub.nivel * 14 + 18}px`;
          emptyRow.textContent = 'Pasta vazia';
          childrenContainer.appendChild(emptyRow);
        }
        folderItem.appendChild(childrenContainer);
      }

      parentEl.appendChild(folderItem);
    }

    // 2. Se for a raiz, renderiza as notas da raiz
    if (node === tree) {
      if (tree.subpastas.size > 0) {
        const rootHeader = document.createElement('div');
        rootHeader.className = 'folder-header root-folder-header';
        rootHeader.style.paddingLeft = '8px';

        const rootIcon = document.createElement('span');
        rootIcon.className = 'folder-icon';
        rootIcon.innerHTML = iconSvg('folder_open');

        const rootName = document.createElement('span');
        rootName.className = 'folder-name';
        rootName.textContent = 'Raiz (sem pasta)';

        const rootCount = document.createElement('span');
        rootCount.className = 'folder-count';
        rootCount.textContent = String(tree.notas.length);

        const rootActions = document.createElement('div');
        rootActions.className = 'folder-actions-wrap';

        const addRootBtn = document.createElement('button');
        addRootBtn.className = 'folder-add-note-btn icon-btn';
        addRootBtn.innerHTML = iconSvg('add');
        addRootBtn.title = 'Nova nota na raiz';
        addRootBtn.setAttribute('aria-label', 'Nova nota na raiz');
        addRootBtn.addEventListener('click', async e => {
          e.stopPropagation();
          await createNoteInFolder('', false);
        });
        rootActions.appendChild(addRootBtn);

        const addRootFolderBtn = document.createElement('button');
        addRootFolderBtn.className = 'folder-add-subfolder-btn icon-btn';
        addRootFolderBtn.innerHTML = iconSvg('create_new_folder');
        addRootFolderBtn.title = 'Nova pasta na raiz';
        addRootFolderBtn.setAttribute('aria-label', 'Nova pasta na raiz');
        addRootFolderBtn.addEventListener('click', async e => {
          e.stopPropagation();
          await startCreateFolderInline('', () => {
            renderNotesListRows(container, filterQuery, countEl, clearBtn);
          });
        });
        rootActions.appendChild(addRootFolderBtn);

        rootHeader.append(rootIcon, rootName, rootCount, rootActions);

        rootHeader.addEventListener('dragover', e => {
          if (noteDragSrcId == null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          rootHeader.classList.add('drag-over');
        });
        rootHeader.addEventListener('dragleave', () => {
          rootHeader.classList.remove('drag-over');
        });
        rootHeader.addEventListener('drop', async e => {
          e.preventDefault();
          e.stopPropagation();
          rootHeader.classList.remove('drag-over');
          if (noteDragSrcId == null) return;
          const srcId = noteDragSrcId;
          cleanupListDrag();
          await moverNotaParaPasta(srcId, '');
          notesMeta = await loadAllNotesMeta();
          const activeMeta = notesMeta.find(n => n.id === activeId);
          if (activeMeta) updateNoteFolderBar(activeMeta);
          renderTabs();
          await renderNotesListRows(container, filterQuery, countEl, clearBtn);
        });
        parentEl.appendChild(rootHeader);
      }

      for (const meta of node.notas) {
        parentEl.appendChild(renderNoteRow(meta, tree.subpastas.size > 0 ? 20 : 8));
      }
    }
  };

  renderNode(tree, container);
}

export function openNotesAsideDrawer() {
  // No desktop o drawer já está permanentemente montado em #app
  if (isDesktopMode()) return;

  const mAside = document.getElementById('mAside');
  if (mAside) {
    mAside.classList.add('is-open-mobile');
    return;
  }

  closeNotesAsideDrawer();

  const backdrop = document.createElement('div');
  backdrop.className = 'notes-drawer-backdrop';
  document.body.appendChild(backdrop);
  notesAsideBackdrop = backdrop;
  requestAnimationFrame(() => backdrop.classList.add('open'));
  backdrop.addEventListener('click', () => closeNotesAsideDrawer());

  const drawer = document.createElement('aside');
  drawer.className = 'notes-aside-drawer notes-list-popover';

  // Cabeçalho do Drawer Aside
  const asideHeader = document.createElement('div');
  asideHeader.className = 'notes-aside-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'notes-aside-title-group';

  const titleIcon = document.createElement('span');
  titleIcon.className = 'notes-aside-title-icon';
  titleIcon.innerHTML = iconSvg('folder_open');

  const titleText = document.createElement('span');
  titleText.className = 'notes-aside-title-text';
  titleText.textContent = 'Todas as notas';

  const titleBadge = document.createElement('span');
  titleBadge.className = 'notes-aside-badge';
  titleBadge.textContent = String(notesMeta.length);

  titleGroup.append(titleIcon, titleText, titleBadge);

  const headerActions = document.createElement('div');
  headerActions.className = 'notes-aside-header-actions';

  const btnAddFolder = document.createElement('button');
  btnAddFolder.className = 'icon-btn notes-aside-action-btn';
  btnAddFolder.innerHTML = iconSvg('create_new_folder');
  btnAddFolder.title = 'Nova pasta';
  btnAddFolder.setAttribute('aria-label', 'Nova pasta');
  btnAddFolder.addEventListener('click', async e => {
    e.stopPropagation();
    await startCreateFolderInline('', () => renderNotesListRows(scrollArea, input.value, countEl, clearBtn));
  });

  const btnAddNote = document.createElement('button');
  btnAddNote.className = 'icon-btn notes-aside-action-btn';
  btnAddNote.innerHTML = iconSvg('add');
  btnAddNote.title = 'Nova nota';
  btnAddNote.setAttribute('aria-label', 'Nova nota');
  btnAddNote.addEventListener('click', async e => {
    e.stopPropagation();
    await createBlankNote();
    await renderNotesListRows(scrollArea, input.value, countEl, clearBtn);
    titleBadge.textContent = String(notesMeta.length);
  });

  const btnClose = document.createElement('button');
  btnClose.className = 'icon-btn notes-aside-close-btn';
  btnClose.innerHTML = iconSvg('close');
  btnClose.title = 'Fechar painel';
  btnClose.setAttribute('aria-label', 'Fechar painel');
  btnClose.addEventListener('click', e => {
    e.stopPropagation();
    closeNotesAsideDrawer();
  });

  headerActions.append(btnAddFolder, btnAddNote, btnClose);
  asideHeader.append(titleGroup, headerActions);
  drawer.appendChild(asideHeader);

  // Barra de busca
  const searchBar = document.createElement('div');
  searchBar.className = 'notes-search-bar';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'search-icon';
  searchIcon.innerHTML = iconSvg('search');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'notes-search-input';
  input.placeholder = 'Buscar por título ou conteúdo...';
  input.setAttribute('aria-label', 'Buscar por título ou conteúdo');

  const clearBtn = document.createElement('button');
  clearBtn.className = 'notes-search-clear icon-btn';
  clearBtn.innerHTML = iconSvg('close');
  clearBtn.title = 'Limpar busca';
  clearBtn.setAttribute('aria-label', 'Limpar busca');
  clearBtn.hidden = true;

  searchBar.append(searchIcon, input, clearBtn);
  drawer.appendChild(searchBar);

  // Barra de ferramentas
  const toolbar = document.createElement('div');
  toolbar.className = 'notes-list-toolbar';

  const btnNewFolder = document.createElement('button');
  btnNewFolder.className = 'notes-list-action-btn';
  btnNewFolder.innerHTML = `${iconSvg('create_new_folder')}<span>Nova pasta</span>`;
  btnNewFolder.title = 'Criar nova pasta';
  btnNewFolder.addEventListener('click', async e => {
    e.stopPropagation();
    await startCreateFolderInline('', () => renderNotesListRows(scrollArea, input.value, countEl, clearBtn));
  });
  toolbar.appendChild(btnNewFolder);

  const btnNewBase = document.createElement('button');
  btnNewBase.className = 'notes-list-action-btn';
  btnNewBase.innerHTML = `<span class="qd-icon material-symbols-rounded" style="font-size:14px;">view_kanban</span><span>Nova Base</span>`;
  btnNewBase.title = 'Criar nova Base de dados';
  btnNewBase.addEventListener('click', async e => {
    e.stopPropagation();
    await createNewBaseNote();
    await renderNotesListRows(scrollArea, input.value, countEl, clearBtn);
    titleBadge.textContent = String(notesMeta.length);
  });
  toolbar.appendChild(btnNewBase);

  const btnToggleAll = document.createElement('button');
  btnToggleAll.className = 'notes-list-action-btn';
  btnToggleAll.title = 'Expandir ou recolher todas as pastas';
  const openSet = getOpenFolders();
  const hasClosed = !openSet || openSet.size === 0;
  btnToggleAll.innerHTML = `${iconSvg(hasClosed ? 'expand_more' : 'unfold_less')}<span>${hasClosed ? 'Expandir' : 'Recolher'}</span>`;
  btnToggleAll.addEventListener('click', async e => {
    e.stopPropagation();
    const pastas = await listarPastas();
    const curOpen = getOpenFolders() || new Set();
    if (curOpen.size > 0) {
      saveOpenFolders(new Set());
    } else {
      const allPaths = new Set();
      for (const p of pastas) if (p.caminho) allPaths.add(p.caminho);
      for (const n of notesMeta) if (n.pasta) allPaths.add(n.pasta);
      saveOpenFolders(allPaths);
    }
    await renderNotesListRows(scrollArea, input.value, countEl, clearBtn);
    const newOpen = getOpenFolders() || new Set();
    btnToggleAll.innerHTML = `${iconSvg(newOpen.size === 0 ? 'expand_more' : 'unfold_less')}<span>${newOpen.size === 0 ? 'Expandir' : 'Recolher'}</span>`;
  });
  toolbar.appendChild(btnToggleAll);

  drawer.appendChild(toolbar);

  const countEl = document.createElement('div');
  countEl.className = 'notes-search-count';
  countEl.hidden = true;
  drawer.appendChild(countEl);

  const scrollArea = document.createElement('div');
  scrollArea.className = 'notes-list-scroll';
  drawer.appendChild(scrollArea);

  // Rodapé do Drawer Aside com Visões e Ações
  const footer = document.createElement('div');
  footer.className = 'notes-aside-footer';

  // 1. Visões
  const secViews = document.createElement('div');
  secViews.className = 'aside-footer-section';

  const titleViews = document.createElement('div');
  titleViews.className = 'aside-footer-title';
  titleViews.textContent = 'Visões';
  secViews.appendChild(titleViews);

  const gridViews = document.createElement('div');
  gridViews.className = 'aside-footer-grid';

  const createFooterBtn = (iconName, label, onClick) => {
    const b = document.createElement('button');
    b.className = 'aside-footer-btn';
    b.innerHTML = `${iconSvg(iconName)}<span>${label}</span>`;
    b.addEventListener('click', async e => {
      e.stopPropagation();
      closeNotesAsideDrawer();
      await onClick();
    });
    return b;
  };

  gridViews.appendChild(createFooterBtn('description', 'Documentos', () => {
    document.dispatchEvent(new CustomEvent('quickdock:toggle-docs'));
  }));
  gridViews.appendChild(createFooterBtn('space_dashboard', 'Espaço', () => switchView('board', { fullscreen: true })));
  gridViews.appendChild(createFooterBtn('hub', 'Constelações', () => switchView('grafo', { fullscreen: true })));
  gridViews.appendChild(createFooterBtn('calendar_month', 'Calendário', () => switchView('calendar', { fullscreen: true })));
  gridViews.appendChild(createFooterBtn('view_kanban', 'Base', () => switchView('bases', { fullscreen: true })));
  gridViews.appendChild(createFooterBtn('auto_stories', 'Modelos', () => switchView('templates')));
  gridViews.appendChild(createFooterBtn('data_object', 'JSON', () => switchView('json', { fullscreen: true })));

  secViews.appendChild(gridViews);
  footer.appendChild(secViews);

  // 2. Ações & Ajustes
  const secActions = document.createElement('div');
  secActions.className = 'aside-footer-section';

  const titleActions = document.createElement('div');
  titleActions.className = 'aside-footer-title';
  titleActions.textContent = 'Ações';
  secActions.appendChild(titleActions);

  const gridActions = document.createElement('div');
  gridActions.className = 'aside-footer-grid';

  gridActions.appendChild(createFooterBtn('sync', 'Sincronização', () => {
    document.dispatchEvent(new CustomEvent('quickdock:open-sync'));
  }));
  gridActions.appendChild(createFooterBtn('light_mode', 'Alternar Tema', () => {
    document.dispatchEvent(new CustomEvent('quickdock:toggle-theme'));
  }));
  gridActions.appendChild(createFooterBtn('download', 'Exportar Notas', () => downloadAllNotes()));
  gridActions.appendChild(createFooterBtn('menu_book', 'Tutorial', () => createTutorialNote()));

  secActions.appendChild(gridActions);
  footer.appendChild(secActions);

  drawer.appendChild(footer);

  const doUpdate = () => renderNotesListRows(scrollArea, input.value, countEl, clearBtn);

  input.addEventListener('input', doUpdate);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (input.value) {
        e.stopPropagation();
        input.value = '';
        doUpdate();
      } else {
        closeNotesAsideDrawer();
      }
    }
  });

  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    input.value = '';
    doUpdate();
    input.focus();
  });

  renderNotesListRows(scrollArea, '', countEl, clearBtn);
  document.body.appendChild(drawer);
  notesAsideDrawer = drawer;
  notesListPopover = drawer;

  requestAnimationFrame(() => drawer.classList.add('open'));
  setTimeout(() => input.focus(), 80);
}

export function openNotesListPopover() {
  openNotesAsideDrawer();
}

// Reflete uma mudança de metadado (título, ícone, cor...) na lista de "Todas
// as notas" já aberta — sem isto, a linha da aside ficava com o valor antigo
// até a pessoa fechar e reabrir a busca/pasta que a redesenha do zero. No
// desktop o drawer fica sempre `.open` (é o nav permanente), então isto roda
// toda vez; nas outras plataformas só faz algo se o popover estiver na tela.
export async function refreshOpenAsideRows() {
  if (!notesAsideDrawer || !notesAsideDrawer.classList.contains('open')) return;
  const scroll = notesAsideDrawer.querySelector('.notes-list-scroll');
  if (!scroll) return;
  const input = notesAsideDrawer.querySelector('.notes-search-input');
  const countEl = notesAsideDrawer.querySelector('.notes-search-count');
  const clearBtn = notesAsideDrawer.querySelector('.notes-search-clear');
  await renderNotesListRows(scroll, input?.value || '', countEl, clearBtn);
}

// Renomear com 2 cliques direto na linha da aside, sem passar pelo menu "⋯".
// Troca o <span> do título por um <input> no lugar; Enter/perder foco grava,
// Escape cancela. `refreshOpenAsideRows()` no fim resolve os dois casos: ele
// reconstrói a linha a partir do notesMeta (já atualizado ou não), então tanto
// faz gravar quanto cancelar, o <input> sempre volta a ser um <span> normal.
function iniciarRenomeacaoInlineNaAside(label, meta) {
  const input = document.createElement('input');
  input.className = 'notes-list-rename-input';
  input.value = meta.title || '';
  input.placeholder = 'Sem título';
  label.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    input.removeEventListener('blur', commit);
    const val = input.value.trim() || 'Sem título';
    if (val !== meta.title) {
      await updateNoteMetaById(meta.id, { title: val });
      meta.title = val;
      renderTabs();
      if (meta.id === activeId) {
        document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
      }
    }
    await refreshOpenAsideRows();
  };

  input.addEventListener('mousedown', e => e.stopPropagation());
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('dblclick', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = meta.title; input.blur(); }
  });
  input.addEventListener('blur', commit);
}

// Distingue clique único (abre a nota) de duplo clique (renomeia) no mesmo
// elemento: o único jeito confiável é atrasar a ação do clique único e
// cancelá-la se um segundo clique chegar antes do tempo — dblclick nativo
// dispara à parte, depois do 2º click, então continua funcionando normal.
function ligarCliqueEDuploCliqueNaLinha(row, label, meta, aoAtivar) {
  let timerClique = null;
  row.addEventListener('click', () => {
    if (timerClique) {
      clearTimeout(timerClique);
      timerClique = null;
      return;
    }
    timerClique = setTimeout(() => {
      timerClique = null;
      aoAtivar();
    }, 220);
  });
  label.addEventListener('dblclick', e => {
    e.stopPropagation();
    iniciarRenomeacaoInlineNaAside(label, meta);
  });
}

// ── Drawer permanente para Desktop ──────────────────────────────────────────
// No modo desktop o drawer fica fixo dentro do #mAside do Spatial Shell, como
// o conteúdo do item "Explorador" da Activity Bar (#mNav) — ver setAsideMode
// em spatial-shell.js, que alterna este drawer com #asideSectionList (lista
// de views). Sem backdrop nem botão de fechar. Usa a mesma estrutura DOM do
// drawer overlay (mobile/extensão) mas montado estaticamente.
function initDesktopNotesAsideDrawer() {
  if (notesAsideDrawer) return; // Já montado

  const drawer = document.createElement('aside');
  drawer.className = 'notes-aside-drawer notes-list-popover open';

  // Cabeçalho do Drawer Aside
  const asideHeader = document.createElement('div');
  asideHeader.className = 'notes-aside-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'notes-aside-title-group';

  const titleIcon = document.createElement('span');
  titleIcon.className = 'notes-aside-title-icon';
  titleIcon.innerHTML = iconSvg('folder_open');

  const titleText = document.createElement('span');
  titleText.className = 'notes-aside-title-text';
  titleText.textContent = 'Todas as notas';

  const titleBadge = document.createElement('span');
  titleBadge.className = 'notes-aside-badge';
  titleBadge.textContent = String(notesMeta.length);

  titleGroup.append(titleIcon, titleText, titleBadge);

  const headerActions = document.createElement('div');
  headerActions.className = 'notes-aside-header-actions';

  const btnAddFolder = document.createElement('button');
  btnAddFolder.className = 'icon-btn notes-aside-action-btn';
  btnAddFolder.innerHTML = iconSvg('create_new_folder');
  btnAddFolder.title = 'Nova pasta';
  btnAddFolder.setAttribute('aria-label', 'Nova pasta');
  btnAddFolder.addEventListener('click', async e => {
    e.stopPropagation();
    await startCreateFolderInline('', () => renderNotesListRows(scrollArea, input.value, countEl, clearBtn));
  });

  const btnAddNote = document.createElement('button');
  btnAddNote.className = 'icon-btn notes-aside-action-btn';
  btnAddNote.innerHTML = iconSvg('add');
  btnAddNote.title = 'Nova nota';
  btnAddNote.setAttribute('aria-label', 'Nova nota');
  btnAddNote.addEventListener('click', async e => {
    e.stopPropagation();
    await createBlankNote();
    await renderNotesListRows(scrollArea, input.value, countEl, clearBtn);
    titleBadge.textContent = String(notesMeta.length);
  });

  // Sem botão de fechar no desktop
  headerActions.append(btnAddFolder, btnAddNote);
  asideHeader.append(titleGroup, headerActions);
  drawer.appendChild(asideHeader);

  // Barra de busca
  const searchBar = document.createElement('div');
  searchBar.className = 'notes-search-bar';

  const searchIconEl = document.createElement('span');
  searchIconEl.className = 'search-icon';
  searchIconEl.innerHTML = iconSvg('search');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'notes-search-input';
  input.placeholder = 'Buscar por título ou conteúdo...';
  input.setAttribute('aria-label', 'Buscar por título ou conteúdo');

  const clearBtn = document.createElement('button');
  clearBtn.className = 'notes-search-clear icon-btn';
  clearBtn.innerHTML = iconSvg('close');
  clearBtn.title = 'Limpar busca';
  clearBtn.setAttribute('aria-label', 'Limpar busca');
  clearBtn.hidden = true;

  searchBar.append(searchIconEl, input, clearBtn);
  drawer.appendChild(searchBar);

  // Barra de ferramentas
  const toolbar = document.createElement('div');
  toolbar.className = 'notes-list-toolbar';

  const btnNewFolder = document.createElement('button');
  btnNewFolder.className = 'notes-list-action-btn';
  btnNewFolder.innerHTML = `${iconSvg('create_new_folder')}<span>Nova pasta</span>`;
  btnNewFolder.title = 'Criar nova pasta';
  btnNewFolder.addEventListener('click', async e => {
    e.stopPropagation();
    await startCreateFolderInline('', () => renderNotesListRows(scrollArea, input.value, countEl, clearBtn));
  });
  toolbar.appendChild(btnNewFolder);

  const btnNewBase = document.createElement('button');
  btnNewBase.className = 'notes-list-action-btn';
  btnNewBase.innerHTML = `<span class="qd-icon material-symbols-rounded" style="font-size:14px;">view_kanban</span><span>Nova Base</span>`;
  btnNewBase.title = 'Criar nova Base de dados';
  btnNewBase.addEventListener('click', async e => {
    e.stopPropagation();
    await createNewBaseNote();
    await renderNotesListRows(scrollArea, input.value, countEl, clearBtn);
    titleBadge.textContent = String(notesMeta.length);
  });
  toolbar.appendChild(btnNewBase);

  const btnToggleAll = document.createElement('button');
  btnToggleAll.className = 'notes-list-action-btn';
  btnToggleAll.title = 'Expandir ou recolher todas as pastas';
  const openSet = getOpenFolders();
  const hasClosed = !openSet || openSet.size === 0;
  btnToggleAll.innerHTML = `${iconSvg(hasClosed ? 'expand_more' : 'unfold_less')}<span>${hasClosed ? 'Expandir' : 'Recolher'}</span>`;
  btnToggleAll.addEventListener('click', async e => {
    e.stopPropagation();
    const pastas = await listarPastas();
    const curOpen = getOpenFolders() || new Set();
    if (curOpen.size > 0) {
      saveOpenFolders(new Set());
    } else {
      const allPaths = new Set();
      for (const p of pastas) if (p.caminho) allPaths.add(p.caminho);
      for (const n of notesMeta) if (n.pasta) allPaths.add(n.pasta);
      saveOpenFolders(allPaths);
    }
    await renderNotesListRows(scrollArea, input.value, countEl, clearBtn);
    const newOpen = getOpenFolders() || new Set();
    btnToggleAll.innerHTML = `${iconSvg(newOpen.size === 0 ? 'expand_more' : 'unfold_less')}<span>${newOpen.size === 0 ? 'Expandir' : 'Recolher'}</span>`;
  });
  toolbar.appendChild(btnToggleAll);

  drawer.appendChild(toolbar);

  const countEl = document.createElement('div');
  countEl.className = 'notes-search-count';
  countEl.hidden = true;
  drawer.appendChild(countEl);

  const scrollArea = document.createElement('div');
  scrollArea.className = 'notes-list-scroll';
  drawer.appendChild(scrollArea);

  // Rodapé do Drawer Aside com Ações (o grid de "Visões" que existia aqui foi
  // removido — duplicava as views do mosaico do Spatial Shell, que já tem
  // seus próprios pontos de entrada: #mNav, #mMenu, "+" e a lista de views
  // do #mAside. Manter os dois inflava "Documentos" pra 3+ botões diferentes
  // e ainda abria o painel antigo de desktop-panels.js por fora do mosaico,
  // sem grid-area — nunca fechava de verdade pelo botão da view.)
  const footer = document.createElement('div');
  footer.className = 'notes-aside-footer';

  const createFooterBtn = (iconNameF, label, onClick) => {
    const b = document.createElement('button');
    b.className = 'aside-footer-btn';
    b.innerHTML = `${iconSvg(iconNameF)}<span>${label}</span>`;
    b.addEventListener('click', async e => {
      e.stopPropagation();
      await onClick();
    });
    return b;
  };

  // 2. Ações & Ajustes
  const secActions = document.createElement('div');
  secActions.className = 'aside-footer-section';

  const titleActions = document.createElement('div');
  titleActions.className = 'aside-footer-title';
  titleActions.textContent = 'Ações';
  secActions.appendChild(titleActions);

  const gridActions = document.createElement('div');
  gridActions.className = 'aside-footer-grid';

  gridActions.appendChild(createFooterBtn('sync', 'Sincronização', () => {
    document.dispatchEvent(new CustomEvent('quickdock:open-sync'));
  }));
  gridActions.appendChild(createFooterBtn('light_mode', 'Alternar Tema', () => {
    document.dispatchEvent(new CustomEvent('quickdock:toggle-theme'));
  }));
  gridActions.appendChild(createFooterBtn('download', 'Exportar Notas', () => downloadAllNotes()));
  gridActions.appendChild(createFooterBtn('menu_book', 'Tutorial', () => createTutorialNote()));

  secActions.appendChild(gridActions);
  footer.appendChild(secActions);

  drawer.appendChild(footer);

  const doUpdate = () => renderNotesListRows(scrollArea, input.value, countEl, clearBtn);

  input.addEventListener('input', doUpdate);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (input.value) {
        e.stopPropagation();
        input.value = '';
        doUpdate();
      }
      // No desktop, Escape não fecha o drawer
    }
  });

  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    input.value = '';
    doUpdate();
    input.focus();
  });

  renderNotesListRows(scrollArea, '', countEl, clearBtn);

  // Monta dentro do #mAside (Spatial Shell) — #mAside.mode-notes/.mode-views
  // decide se este drawer ou a lista de views fica visível (spatial-shell.js).
  const mAsideEl = document.getElementById('mAside');
  if (mAsideEl) {
    mAsideEl.appendChild(drawer);
  } else {
    document.body.prepend(drawer);
  }

  notesAsideDrawer = drawer;
  notesListPopover = drawer;

  // #notes-tabs (a tira horizontal de abas abertas) NÃO é movida pra dentro
  // de .note-section no desktop — cada nota aberta já é sua própria view no
  // mosaico do Spatial Shell, com cabeçalho independente (ícone, título,
  // fechar, mover — ver syncNoteSectionDOM em spatial-shell.js). Uma tira de
  // abas por cima disso duplicaria essa navegação e tirava espaço da view,
  // que deve preencher tudo que tem disponível como no design-pattern. O
  // elemento fica onde nasceu (.app-aside, escondido no desktop) — inerte,
  // sem afetar o mobile/extensão, que ainda usa a tira de verdade.
}

btnNotesList.addEventListener('click', e => {
  e.stopPropagation();
  if (notesAsideDrawer) {
    closeNotesAsideDrawer();
  } else {
    openNotesAsideDrawer();
  }
});

document.addEventListener('mousedown', e => {
  if (folderModalEl && !folderModalEl.contains(e.target)) closeFolderModal();
  if (moveMenuEl && !moveMenuEl.contains(e.target)) closeMoveMenu();
  if (folderMenuEl && !folderMenuEl.contains(e.target)) closeFolderMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (folderModalEl) { closeFolderModal(); return; }
    if (moveMenuEl) { closeMoveMenu(); return; }
    if (folderMenuEl) { closeFolderMenu(); return; }
    if (notesAsideDrawer) closeNotesAsideDrawer();
  }
});

// ── "Nova nota" / "Importar" (botão combinado) ────────────────────────────────
let newMenuPopover = null;
function closeNewMenu() { newMenuPopover?.remove(); newMenuPopover = null; }

export async function createNoteInFolder(pasta = '', isBase = false) {
  await flushSave();
  const pastaLimpa = normalizarCaminhoPasta(pasta || '');
  const title = isBase ? `Base ${notesMeta.length + 1}` : `Nota ${notesMeta.length + 1}`;
  let id;
  if (isBase) {
    const baseContent = `\`\`\`base
name: Nova Base
source:
  folder: ${pastaLimpa || '/'}
views:
  - type: table
    name: Tabela Geral
    columns: [title, folder, tags, updatedAt]
  - type: board
    name: Quadro
    groupBy: status
\`\`\``;
    const blocks = parseMarkdownToBlocks(baseContent);
    id = await createNoteRecord({
      title,
      pasta: pastaLimpa,
      content: baseContent,
      blocks,
      icon: 'view_kanban',
      properties: { folder: pastaLimpa },
    });
    notesMeta.push({
      id,
      title,
      pasta: pastaLimpa,
      color: null,
      icon: 'view_kanban',
      properties: { folder: pastaLimpa },
      updatedAt: Date.now()
    });
  } else {
    id = await createNoteRecord({
      title,
      pasta: pastaLimpa,
      content: '',
      properties: { folder: pastaLimpa },
    });
    notesMeta.push({
      id,
      title,
      pasta: pastaLimpa,
      color: null,
      icon: null,
      properties: { folder: pastaLimpa },
      updatedAt: Date.now()
    });
  }

  if (pastaLimpa) {
    const openSet = getOpenFolders() || new Set();
    const partes = pastaLimpa.split('/');
    for (let i = 1; i <= partes.length; i++) {
      openSet.add(partes.slice(0, i).join('/'));
    }
    saveOpenFolders(openSet);
  }

  await activateNote(id);
  renderTabs();
  scrollTabIntoView(id);

  if (notesAsideDrawer && notesAsideDrawer.classList.contains('open')) {
    const scroll = notesAsideDrawer.querySelector('.notes-list-scroll');
    const input = notesAsideDrawer.querySelector('.notes-search-input');
    const countEl = notesAsideDrawer.querySelector('.notes-search-count');
    const clearBtn = notesAsideDrawer.querySelector('.notes-search-clear');
    if (scroll) await renderNotesListRows(scroll, input?.value || '', countEl, clearBtn);
    const badge = notesAsideDrawer.querySelector('.notes-aside-badge');
    if (badge) badge.textContent = String(notesMeta.length);
  }
  return id;
}

async function createBlankNote() {
  return createNoteInFolder('', false);
}

async function createNewBaseNote() {
  return createNoteInFolder('', true);
}

// Nota a partir de um modelo: o markdown do modelo passa pelo mesmo parser da
// importação, então o que estava salvo como texto vira blocos de verdade —
// checklist clicável, títulos, tabela.
async function createNoteFromTemplate(tpl) {
  await flushSave();
  // Passa pelo mesmo caminho da importação: um modelo compartilhado por outra
  // pessoa pode trazer imagem em base64, que tem que virar arquivo.
  const id = await createNoteFromMarkdown(tpl.name, tpl.content);
  await activateNote(id);
  renderTabs();
  scrollTabIntoView(id);
}

// ── Modo modelo ───────────────────────────────────────────────────────────────
// O editor de blocos é um só, ligado a #note-editor-blocks. Em vez de construir
// um segundo editor, ele empresta: carrega o modelo, mostra esta barra e o que
// for digitado volta pro modelo em vez de pra uma nota.
const templateBar    = document.getElementById('template-bar');
const templateName   = document.getElementById('template-bar-name');
const templateKind   = document.getElementById('template-bar-kind');
const templateCancel = document.getElementById('template-bar-cancel');
const templateSave   = document.getElementById('template-bar-save');

let editingTpl  = null;   // {id, name, kind} do modelo aberto
let returnNoteId = null;  // nota pra onde voltar ao sair

export async function editTemplate(tpl) {
  closeTemplatesManager();
  returnNoteId = activeId;
  editingTpl = { id: tpl.id, name: tpl.name, kind: tpl.kind };

  await openTemplateInEditor(tpl);

  templateName.value = tpl.name;
  templateKind.value = tpl.kind;
  templateBar.hidden = false;
  noteSection.classList.add('template-mode');
  document.documentElement.classList.add('template-mode');
  document.body.classList.add('template-mode');
}

async function exitTemplate(salvar) {
  if (!editingTpl) return;

  if (salvar) {
    const nome = templateName.value.trim() || editingTpl.name;
    await updateTemplateById(editingTpl.id, {
      name: nome,
      kind: templateKind.value,
      content: currentTemplateMarkdown(),
    });
    await refreshTemplates();
  }

  editingTpl = null;
  templateBar.hidden = true;
  noteSection.classList.remove('template-mode');
  document.documentElement.classList.remove('template-mode');
  document.body.classList.remove('template-mode');

  const voltarPara = notesMeta.some(n => n.id === returnNoteId) ? returnNoteId : notesMeta[0]?.id;

  // O modo modelo só é desligado DEPOIS de a nota voltar pra tela.
  //
  // Desligar antes era perda de nota: switchToNote começa com um flushSave, e
  // esse save é justamente o que o modo modelo existe pra bloquear. Com a
  // marca já limpa, ele serializava o que estava na tela — os blocos do
  // MODELO — e gravava por cima da nota que estava aberta. Valia pra toda
  // saída, inclusive pelo "Cancelar".
  if (voltarPara != null) await activateNote(voltarPara);
  clearTemplateEditing();
  renderTabs();
}

// Evento em vez de import: templates.js e note.js precisam pedir "abre este
// modelo no editor", e os dois seriam import circular com este módulo.
document.addEventListener('quickdock:edit-template', e => { editTemplate(e.detail); });

templateSave.addEventListener('click', () => exitTemplate(true));
templateCancel.addEventListener('click', () => exitTemplate(false));
templateName.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); exitTemplate(true); }
});

async function currentNoteAsMarkdown() {
  const meta = notesMeta.find(n => n.id === activeId);
  if (!meta) return null;
  return { title: meta.title, markdown: blocksToMarkdown(await getBlocksForNote(meta)) };
}

// textContent, não innerHTML: nome de modelo é texto que o usuário escreveu.
function newMenuOpt(pop, label, run) {
  const btn = document.createElement('button');
  btn.className = 'copy-opt';
  const span = document.createElement('span');
  span.className = 'copy-opt-value';
  span.textContent = label;
  btn.appendChild(span);
  btn.addEventListener('mousedown', e => e.stopPropagation());
  btn.addEventListener('click', async e => { e.stopPropagation(); closeNewMenu(); await run(); });
  pop.appendChild(btn);
}

async function openNewMenu() {
  closeNewMenu();
  const pop = document.createElement('div');
  pop.className = 'copy-menu new-menu';

  newMenuOpt(pop, 'Nota em branco', createBlankNote);
  newMenuOpt(pop, 'Nova Base de dados', createNewBaseNote);
  newMenuOpt(pop, 'Importar (.md/.txt)', () => importInput.click());

  await getTemplates();               // atualiza o cache antes de listar
  const templates = noteTemplates();  // o menu do ＋ cria notas, não insere blocos
  if (templates.length > 0) {
    pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
    const head = document.createElement('div');
    head.className = 'copy-menu-header';
    head.textContent = 'A partir de um modelo';
    pop.appendChild(head);
    for (const tpl of templates) newMenuOpt(pop, tpl.name, () => createNoteFromTemplate(tpl));
  }

  pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));
  newMenuOpt(pop, 'Galeria de modelos…', () => switchView('templates'));
  newMenuOpt(pop, 'Gerenciar modelos (menu rápido)…', () => openTemplatesManager(btnNew, {
    onUse: createNoteFromTemplate,
    getCurrentNote: currentNoteAsMarkdown,
  }));

  document.body.appendChild(pop);
  newMenuPopover = pop;
  positionPopover(pop, btnNew);
}

btnNew.addEventListener('click', e => { e.stopPropagation(); openNewMenu(); });
document.addEventListener('mousedown', e => {
  if (newMenuPopover && !newMenuPopover.contains(e.target)) closeNewMenu();
});

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;

  const text = await file.text();
  await flushSave();

  // Arquivo de backup: vem com várias notas dentro, cada uma com o seu título.
  // Restaurar cria notas novas — nunca sobrescreve as que já existem, senão
  // um backup antigo apagaria o trabalho de quem o importou por engano.
  const backup = parseBackup(text);
  if (backup) {
    if (!confirm(`Este arquivo é um backup com ${backup.length} nota(s).\n\nElas serão adicionadas como notas novas — nada do que já existe é alterado.`)) return;
    let ultimoId = null;
    for (const { title, md } of backup) ultimoId = await createNoteFromMarkdown(title, md);
    if (ultimoId != null) await activateNote(ultimoId);
    renderTabs();
    return;
  }

  const title = file.name.replace(/\.(md|txt)$/i, '') || 'Nota importada';
  const id = await createNoteFromMarkdown(title, text);
  await activateNote(id);
  renderTabs();
});

// ── Ciclo de vida ──────────────────────────────────────────────────────────────
export function updateNoteFolderBar(meta) {
  const btn = document.getElementById('btn-note-folder');
  const nameEl = document.getElementById('note-folder-name');
  if (!btn || !nameEl) return;
  const pasta = meta?.pasta || '';
  if (pasta) {
    nameEl.textContent = pasta;
    btn.classList.add('has-folder');
    btn.title = `Pasta: ${pasta} (clique para mover ou alterar pasta)`;
  } else {
    nameEl.textContent = 'Sem pasta';
    btn.classList.remove('has-folder');
    btn.title = 'Mover esta nota para uma pasta';
  }
}

export async function activateNote(id) {
  hideEmptyDashboard();
  activeId = id;
  const numId = Number(id);
  if (!openTabIds.includes(numId)) {
    openTabIds.push(numId);
    saveOpenTabIds(openTabIds);
  }
  const meta = notesMeta.find(n => n.id === id);
  setAccent(meta?.color);
  await switchToNote(id);
  await setDocumentsNote(id);
  await saveActiveNoteId(id);
  updateNoteFolderBar(meta);
  renderTabs();
  if (getCurrentView() === 'templates') {
    switchView('editor');
  }
  document.dispatchEvent(new CustomEvent('quickdock:active-note-changed', { detail: { id } }));
}

// Nem toda troca de nota passa por activateNote() acima — o painel de Base
// (bases-view-container.js handleCreateNewNote) chama switchToNote() direto
// ao criar uma nota pelo botão "+ Nova Nota". Sem isto, `activeId` ficava
// preso na nota antiga: um clique na aside pra voltar pra ela era ignorado,
// porque o guard "meta.id !== activeId" (ver ligarCliqueEDuploCliqueNaLinha)
// achava, errado, que já era a nota atual.
document.addEventListener('quickdock:active-note-changed', e => {
  const { id } = e.detail ?? {};
  if (id === activeId) return; // já veio daqui mesmo, activateNote() já fez tudo
  activeId = id;
  if (id != null) {
    hideEmptyDashboard();
    const numId = Number(id);
    if (!openTabIds.includes(numId)) {
      openTabIds.push(numId);
      saveOpenTabIds(openTabIds);
    }
    const meta = notesMeta.find(n => n.id === id);
    setAccent(meta?.color);
    updateNoteFolderBar(meta);
  } else {
    setAccent(null);
    updateNoteFolderBar(null);
    showEmptyDashboard();
  }
  saveActiveNoteId(id);
  setDocumentsNote(id);
  renderTabs();
});

document.addEventListener('quickdock:use-template-note', async e => {
  const { template } = e.detail || {};
  if (template) await createNoteFromTemplate(template);
});

document.addEventListener('quickdock:activate-note', async e => {
  const { id, uid, title, path, createIfMissing } = e.detail || {};
  let target = null;
  if (id != null) {
    target = notesMeta.find(n => n.id === id);
  } else if (uid) {
    target = notesMeta.find(n => n.uid === uid);
  } else {
    const queryPath = (path || (title && title.includes('/') ? title : '')).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (queryPath) {
      target = notesMeta.find(n => {
        const p = (n.pasta || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const t = (n.title || '').trim();
        const full = (p ? `${p}/${t}` : t).toLowerCase();
        return full === queryPath;
      });
    }

    if (!target && title) {
      const titleLower = title.trim().toLowerCase();
      const candidatos = notesMeta.filter(n => (n.title || '').trim().toLowerCase() === titleLower);
      if (candidatos.length === 1) {
        target = candidatos[0];
      } else if (candidatos.length > 1) {
        // Proximidade com a nota ativa
        const activeMeta = notesMeta.find(n => n.id === activeId);
        const activePasta = (activeMeta?.pasta || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
        if (activePasta) {
          target = candidatos.find(n => {
            const p = (n.pasta || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
            return p === activePasta;
          });
        }
        if (!target) target = candidatos[0];
      }
    }
  }

  if (target) {
    await activateNote(target.id);
    renderTabs();
    scrollTabIntoView(target.id);
    if (typeof window !== 'undefined' && typeof window.quickdockOpenView === 'function') {
      window.quickdockOpenView('notes');
    }
    return;
  }

  if (createIfMissing && (title || path)) {
    const raw = (path || title).trim();
    let pasta = '';
    let nomeNota = raw;
    if (raw.includes('/')) {
      const idx = raw.lastIndexOf('/');
      pasta = raw.slice(0, idx).trim();
      nomeNota = raw.slice(idx + 1).trim();
    }
    const novoId = await createNoteRecord({ title: nomeNota, pasta: pasta || undefined });
    await refreshNotesList();
    await activateNote(novoId);
    renderTabs();
    scrollTabIntoView(novoId);
    if (typeof window !== 'undefined' && typeof window.quickdockOpenView === 'function') {
      window.quickdockOpenView('notes');
    }
  }
});

export async function initNotesTabs() {
  await migrateLegacyNoteIfNeeded();
  // Faxina de imagem órfã. Roda na abertura de propósito: é o único momento em
  // que não existe histórico de desfazer que pudesse trazer de volta um bloco
  // cujo arquivo acabou de ser apagado.
  await gcInlineFiles();
  await initTemplates();
  notesMeta = await loadAllNotesMeta();

  // Evento do botão de pasta no cabeçalho do editor
  document.getElementById('btn-note-folder')?.addEventListener('click', e => {
    e.stopPropagation();
    const meta = notesMeta.find(n => n.id === activeId);
    if (!meta) return;
    promptMoverNotaParaPasta(meta, e.currentTarget, () => {
      updateNoteFolderBar(meta);
      renderTabs();
    });
  });

  // No desktop e mobile com spatial shell, monta o drawer permanente em #mAside
  if (isDesktopMode() || document.getElementById('mAside')) {
    initDesktopNotesAsideDrawer();
  }

  const savedActiveId = await loadActiveNoteId();
  if (openTabIds.length > 0) {
    const initial = notesMeta.find(n => n.id === savedActiveId && openTabIds.includes(n.id))
      ?? notesMeta.find(n => n.id === openTabIds[0])
      ?? notesMeta[0];
    await activateNote(initial.id);
    renderTabs();
    scrollTabIntoView(initial.id);
  } else {
    await deactivateActiveNote();
    renderTabs();
  }
}

document.addEventListener('quickdock:note-folder-changed', async e => {
  const { notaId, pasta } = e.detail || {};
  const meta = notesMeta.find(n => n.id === Number(notaId));
  if (meta) {
    meta.pasta = pasta || '';
    if (meta.properties) meta.properties.folder = pasta || '';
  }
  if (Number(notaId) === activeId && meta) {
    updateNoteFolderBar(meta);
  }
  renderTabs();
  await refreshOpenAsideRows();
});

// Título editado direto no cabeçalho da nota (note.js) — diferente do preview
// a cada tecla (só cosmético, só a aba), este dispara já com o valor gravado
// no banco, então é aqui que o notesMeta de verdade (usado pela busca e pela
// lista "Todas as notas") fica sincronizado.
document.addEventListener('quickdock:note-title-committed', async e => {
  const { noteId, title } = e.detail || {};
  const meta = notesMeta.find(n => n.id === Number(noteId));
  if (!meta || meta.title === title) return;
  meta.title = title;
  renderTabs();
  await refreshOpenAsideRows();
});

export async function refreshNotesList() {
  notesMeta = await loadAllNotesMeta();
  renderTabs();
  const current = notesMeta.find(n => n.id === activeId);
  if (!current && notesMeta.length > 0) {
    await activateNote(notesMeta[0].id);
    renderTabs();
    scrollTabIntoView(notesMeta[0].id);
  }
  if (notesAsideDrawer && notesAsideDrawer.classList.contains('open')) {
    const scroll = notesAsideDrawer.querySelector('.notes-list-scroll');
    const input = notesAsideDrawer.querySelector('.notes-search-input');
    const countEl = notesAsideDrawer.querySelector('.notes-search-count');
    const clearBtn = notesAsideDrawer.querySelector('.notes-search-clear');
    if (scroll) await renderNotesListRows(scroll, input?.value || '', countEl, clearBtn);
    const badge = notesAsideDrawer.querySelector('.notes-aside-badge');
    if (badge) badge.textContent = String(notesMeta.length);
  }
}

export function getActiveNoteUid() {
  return notesMeta.find(n => n.id === activeId)?.uid ?? null;
}
