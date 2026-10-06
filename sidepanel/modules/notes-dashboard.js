// Dashboard vazio: tela mostrada quando nenhuma nota está aberta (hero,
// ações rápidas, notas recentes, dicas).
import { iconSvg, createIcon } from './icons.js';
import { switchView } from './views.js';
import { noteEditorEl, noteSection } from './note-state.js';
import { createTutorialNote } from './notes-tutorial.js';
import {
  getNotesMeta, activateNote, renderTabs, scrollTabIntoView, createBlankNote,
  createNewBaseNote, openNotesAsideDrawer, buildTabIndicator,
} from './notes-tabs.js';

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

  actionsGrid.appendChild(createActionCard('edit_note', 'var(--accent)', 'oklch(54.6% 0.215 262.9 / 0.1)', 'Nova nota', 'Começar nota em branco', () => createBlankNote()));
  actionsGrid.appendChild(createActionCard('view_kanban', 'oklch(62.7% 0.233 303.9)', 'oklch(62.7% 0.233 303.9 / 0.1)', 'Nova Base', 'Tabelas e quadros dinâmicos', () => createNewBaseNote()));
  actionsGrid.appendChild(createActionCard('folder_open', 'oklch(72.3% 0.192 149.6)', 'oklch(72.3% 0.192 149.6 / 0.1)', 'Todas as notas', 'Navegar em pastas e arquivos', () => openNotesAsideDrawer()));
  actionsGrid.appendChild(createActionCard('auto_stories', 'oklch(79.52% 0.1617 86.05)', 'oklch(79.52% 0.1617 86.05 / 0.1)', 'Modelos', 'Explorar modelos prontos', () => switchView('templates')));

  actionsSection.appendChild(actionsGrid);
  inner.appendChild(actionsSection);

  // 3. Notas Recentes
  const notesMeta = getNotesMeta();
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
