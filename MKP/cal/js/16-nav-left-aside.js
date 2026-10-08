// Nav (Home / Modelos / Configurações) e painéis da aside esquerda
// Desktop: a aside esquerda abre ao lado da nav. Mobile: vira drawer (ver 16-mobile.js).

const mobileMQ = window.matchMedia('(max-width: 768px)');
const leftDrawer = document.getElementById('mAside');
const leftAsideTitle = document.getElementById('leftAsideTitle');
const mainEl = document.getElementById('mMain');
const LEFT_TITLES = { home: 'HOME', models: 'MODELOS', settings: 'CONFIGURAÇÕES' };
let leftPanel = null; // 'home' | 'models' | 'settings' | null (aside recolhida)

// Abre o painel do item da nav; null recolhe a aside (sobra só a nav)
function setLeftPanel(name) {
  leftPanel = name;
  const open = name !== null;
  appContainer.classList.toggle('has-left-aside-hidden', !open);
  leftDrawer.classList.toggle('is-open-mobile', open);
  document.querySelectorAll('#mNav .nav-item').forEach(li =>
    li.classList.toggle('is-active', li.dataset.navPanel === name));
  document.querySelectorAll('.left-panel').forEach(p =>
    p.classList.toggle('is-active', p.dataset.panel === name));
  if (open) {
    leftAsideTitle.textContent = LEFT_TITLES[name];
    if (mobileMQ.matches) closeRightAside(); // no mobile só um drawer por vez
  }
}

function onNavItem(li) {
  const name = li.dataset.navPanel;
  setLeftPanel(leftPanel === name ? null : name);
}

document.querySelectorAll('#mNav .nav-item').forEach(li => {
  li.addEventListener('click', () => onNavItem(li));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavItem(li); }
  });
});
document.getElementById('btnCloseLeftAside')?.addEventListener('click', () => setLeftPanel(null));

// ── HOME: lista de views (17-views-list.js) + escala do calendário + grupos ──
function syncLeftHome() {
  document.querySelectorAll('#leftModeSegmented button').forEach(b =>
    b.classList.toggle('is-active', dataView === 'calendar' && b.dataset.leftMode === currentViewMode));
}

document.getElementById('leftModeSegmented').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-left-mode]');
  if (!btn) return;
  setCalendarViewMode(btn.dataset.leftMode);
  if (mobileMQ.matches) setLeftPanel(null);
});

function renderLeftGroups() {
  document.getElementById('leftGroupList').innerHTML = GROUP_ORDER.map(g => {
    const count = FAKE_NOTES.filter(n => n.group === g).length;
    return `<div class="left-group-row"><span class="group-pill" data-group="${g}">${GROUP_LABEL[g]}</span><span class="left-group-count">${count}</span></div>`;
  }).join('');
}

// ── MODELOS: notas e quadros modelo (clicar cria um item novo a partir do modelo) ──
const TEMPLATE_NOTES = [
  { icon: 'groups',        name: 'Reunião',              desc: 'Pauta, decisões e próximos passos',
    text: '# Reunião\n\nPauta:\n- \n\nDecisões:\n- \n\nPróximos passos:\n- ' },
  { icon: 'today',         name: 'Diário',               desc: 'Prioridades, anotações e gratidão',
    text: '# Diário\n\nPrioridades de hoje:\n1. \n\nAnotações:\n\nO que foi bom hoje:\n' },
  { icon: 'event_repeat',  name: 'Planejamento semanal', desc: 'Metas e blocos da semana',
    text: '# Planejamento semanal\n\nMetas:\n- \n\nSegunda:\nTerça:\nQuarta:\nQuinta:\nSexta:\n' },
  { icon: 'gavel',         name: 'Registro de decisão',  desc: 'Contexto, opções e escolha',
    text: '# Registro de decisão\n\nContexto:\n\nOpções:\n- \n\nDecisão:\n\nPor quê:\n' }
];
const TEMPLATE_BOARDS = [
  { icon: 'account_tree', name: 'Mapa mental',        desc: 'Um tema central e ramos',   tpl: 'mapa',  group: 'ideia' },
  { icon: 'moving',       name: 'Fluxo de processo',  desc: 'Etapas conectadas',         tpl: 'fluxo', group: 'projeto' },
  { icon: 'movie',        name: 'Storyboard',         desc: 'Cenas em sequência',        tpl: 'story', group: 'reuniao' }
];

function renderLeftTemplates() {
  const row = (t, kind, i) => `
    <button type="button" class="left-view-item" data-tpl-kind="${kind}" data-tpl-index="${i}">
      <span class="material-symbols-rounded">${t.icon}</span>
      <span class="left-view-text"><strong>${t.name}</strong><small>${t.desc}</small></span>
      <span class="left-view-badge">Usar</span>
    </button>`;
  document.getElementById('leftTemplateNotes').innerHTML = TEMPLATE_NOTES.map((t, i) => row(t, 'nota', i)).join('');
  document.getElementById('leftTemplateBoards').innerHTML = TEMPLATE_BOARDS.map((t, i) => row(t, 'quadro', i)).join('');
}

function useTemplate(kind, index) {
  const run = () => {
    if (kind === 'quadro') {
      const t = TEMPLATE_BOARDS[index];
      const item = { id: 'tpl-' + t.tpl, kind: 'quadro', tpl: t.tpl, group: t.group, day: 7, time: '—',
                     title: 'Novo quadro: ' + t.name, text: '' };
      openDirectNoteForDay('7', 'Modelo • ' + t.name, item);
    } else {
      const t = TEMPLATE_NOTES[index];
      openDirectNoteForDay('7', 'Modelo • ' + t.name, null);
      notepadTextarea.value = t.text;
      updateNoteStats();
    }
    if (mobileMQ.matches) setLeftPanel(null);
  };
  const somethingOpen = activeCell || activeWeekCol || inCellNotepad.style.display !== 'none';
  if (somethingOpen) { handleCloseNote(); setTimeout(run, 450); } else run();
}

document.getElementById('leftPanelModels').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tpl-kind]');
  if (btn) useTemplate(btn.dataset.tplKind, Number(btn.dataset.tplIndex));
});

// ── CONFIGURAÇÕES: tema acompanha o botão do header ──
function syncThemeSegmented() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  document.querySelectorAll('#settingsThemeSegmented button').forEach(b =>
    b.classList.toggle('is-active', b.dataset.themeChoice === current));
}

document.getElementById('settingsThemeSegmented').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-theme-choice]');
  if (btn) document.documentElement.setAttribute('data-theme', btn.dataset.themeChoice);
});
new MutationObserver(syncThemeSegmented)
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

renderLeftGroups();
renderLeftTemplates();
syncLeftHome();
syncThemeSegmented();
