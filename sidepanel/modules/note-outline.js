// Sumário (Outline) da nota, scrollspy, e as abas da sidebar/rodapé que
// alternam entre sumário e backlinks.
import { headingSlug, headingSlugs, escHtml } from './blocks.js';
import { root, noteEditorEl } from './note-state.js';
import { getContentEl } from './note-dom-utils.js';
import {
  refreshBacklinks, backlinksListEl, desktopBacklinksListEl,
} from './note-backlinks.js';
import { HEADING_TAGS, showFeedback, getCurrentNoteId } from './note.js';

// Sumário (Outline), Backlinks e Abas
const outlineSidebarEl = document.getElementById('note-outline-sidebar');
const toggleOutlineSidebarBtn = document.getElementById('btn-toggle-outline-sidebar');
const toggleOutlineHeaderBtn = document.getElementById('btn-note-outline-toggle-desktop');
const desktopOutlineListEl = document.getElementById('note-desktop-outline-list');
const desktopOutlineCountEl = document.getElementById('note-outline-desktop-count');
const tabSidebarOutline = document.getElementById('tab-sidebar-outline');
const tabSidebarBacklinks = document.getElementById('tab-sidebar-backlinks');
const mobileOutlineListEl = document.getElementById('note-mobile-outline-list');
const mobileOutlineCountEl = document.getElementById('note-outline-count');
const floatingOutlineToggleBtn = document.getElementById('btn-outline-floating-toggle');
const floatingOutlineBadge = document.getElementById('note-outline-floating-badge');
const tabBtnBacklinks = document.getElementById('tab-btn-backlinks');
const tabBtnOutline = document.getElementById('tab-btn-outline');

// ── Âncora: pular pro título da própria nota ──────────────────────────────────
// Os títulos da nota aberta e o apelido de cada um. É calculado na hora do
// clique, e não guardado: renomear um título muda o apelido, e um mapa gravado
// ficaria desatualizado sem ninguém perceber.
function titulosDaNota() {
  const titulos = [...root.children].filter(b => HEADING_TAGS[b.dataset.type]);
  const apelidos = headingSlugs(titulos.map(b => getContentEl(b).textContent));
  return titulos.map((el, i) => ({ el, slug: apelidos[i] }));
}

let isProgrammaticScroll = false;
let programmaticScrollTimer = null;

export function irParaTitulo(alvoBruto) {
  const alvo = headingSlug(decodeURIComponent(alvoBruto));
  const titulos = titulosDaNota();
  const achadoIdx = titulos.findIndex(t => t.slug === alvo || t.slug === alvo.replace(/-\d+$/, ''));
  const achado = achadoIdx >= 0 ? titulos[achadoIdx] : null;

  if (!achado) { showFeedback('não achei esse título na nota'); return; }

  // Marca imediatamente o item no sumário para resposta instantânea ao clique
  const markList = (listEl) => {
    if (!listEl) return;
    const items = listEl.querySelectorAll('.outline-item');
    items.forEach((item, idx) => {
      item.classList.toggle('active', idx === achadoIdx);
    });
  };
  markList(desktopOutlineListEl);
  markList(mobileOutlineListEl);

  // Trava temporariamente o scrollspy para a rolagem suave não sobrescrever com o título anterior
  isProgrammaticScroll = true;
  clearTimeout(programmaticScrollTimer);
  programmaticScrollTimer = setTimeout(() => {
    isProgrammaticScroll = false;
    updateActiveOutlineHeading();
  }, 600);

  achado.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  // Um pisca-pisca curto: sem ele, num título parecido com os vizinhos, não dá
  // pra saber se a rolagem parou no lugar certo.
  achado.el.classList.add('heading-alvo');
  setTimeout(() => achado.el.classList.remove('heading-alvo'), 1200);
}

// ── Sumário da Nota (Outline) ─────────────────────────────────────────────────
export function extrairSumarioDaNota() {
  if (!root || !root.children) return [];
  const titulos = [...root.children].filter(b => b && b.dataset && HEADING_TAGS[b.dataset.type]);
  const apelidos = headingSlugs(titulos.map(b => (getContentEl(b)?.textContent || '')));
  return titulos.map((el, i) => {
    const rawType = el.dataset.type || 'heading1';
    const nivel = parseInt(rawType.replace('heading', ''), 10) || 1;
    const texto = (getContentEl(el)?.textContent || '').trim();
    return {
      el,
      nivel,
      texto: texto || `Título ${nivel}`,
      slug: apelidos[i],
    };
  });
}

export function renderOutline() {
  if (typeof document === 'undefined') return;
  const headings = extrairSumarioDaNota();
  const countStr = String(headings.length);

  if (desktopOutlineCountEl) desktopOutlineCountEl.textContent = countStr;
  if (mobileOutlineCountEl) mobileOutlineCountEl.textContent = countStr;
  if (floatingOutlineBadge) {
    floatingOutlineBadge.textContent = countStr;
    floatingOutlineBadge.hidden = headings.length === 0;
  }

  const populateList = (listEl) => {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (headings.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'outline-empty';
      empty.innerHTML = `
        <span class="qd-icon material-symbols-rounded">notes</span>
        <span>Nenhum título na nota</span>
      `;
      listEl.appendChild(empty);
      return;
    }

    for (const h of headings) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `outline-item outline-level-${h.nivel}`;
      item.dataset.slug = h.slug;
      item.style.paddingLeft = `${Math.max(8, (h.nivel - 1) * 12 + 8)}px`;
      item.innerHTML = `
        <span class="outline-badge">H${h.nivel}</span>
        <span class="outline-text" title="${escHtml(h.texto)}">${escHtml(h.texto)}</span>
      `;
      item.addEventListener('click', () => {
        irParaTitulo(h.slug);
      });
      listEl.appendChild(item);
    }
  };

  populateList(desktopOutlineListEl);
  populateList(mobileOutlineListEl);
  updateActiveOutlineHeading();
}

let scrollSpyRaf = null;
export function updateActiveOutlineHeading() {
  if (typeof document === 'undefined' || !noteEditorEl || !root || !root.children) return;
  if (isProgrammaticScroll) return;
  const titulos = [...root.children].filter(b => b && b.dataset && HEADING_TAGS[b.dataset.type]);
  if (titulos.length === 0) return;

  let activeIndex = -1;

  // Se o scroll estiver no final ou quase no final do editor, o último título deve ficar ativo
  const distFromBottom = noteEditorEl.scrollHeight - noteEditorEl.scrollTop - noteEditorEl.clientHeight;
  if (distFromBottom < 40) {
    activeIndex = titulos.length - 1;
  } else {
    const editorRect = noteEditorEl.getBoundingClientRect ? noteEditorEl.getBoundingClientRect() : { top: 0 };
    const targetTop = (editorRect.top || 0) + 120;

    for (let i = 0; i < titulos.length; i++) {
      const el = titulos[i];
      if (el.getBoundingClientRect) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= targetTop) {
          activeIndex = i;
        } else {
          break;
        }
      }
    }
  }

  if (activeIndex === -1 && titulos.length > 0) {
    activeIndex = 0;
  }

  const markList = (listEl) => {
    if (!listEl) return;
    const items = listEl.querySelectorAll('.outline-item');
    items.forEach((item, idx) => {
      item.classList.toggle('active', idx === activeIndex);
    });
  };

  markList(desktopOutlineListEl);
  markList(mobileOutlineListEl);
}

if (noteEditorEl) {
  noteEditorEl.addEventListener('scroll', () => {
    if (scrollSpyRaf) return;
    scrollSpyRaf = requestAnimationFrame(() => {
      scrollSpyRaf = null;
      updateActiveOutlineHeading();
    });
  }, { passive: true });
}

let outlineTimer = null;
export function scheduleOutlineUpdate() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => {
    renderOutline();
  }, 150);
}

// ── Alternador de Abas da Sidebar Desktop ((sumário)(backlinks)) ───────────────
let activeSidebarTab = typeof localStorage !== 'undefined' ? (localStorage.getItem('quickdock:note-sidebar-tab') || 'outline') : 'outline';

export function setSidebarTab(tab) {
  activeSidebarTab = tab === 'backlinks' ? 'backlinks' : 'outline';
  try { localStorage.setItem('quickdock:note-sidebar-tab', activeSidebarTab); } catch {}

  const isOutline = activeSidebarTab === 'outline';
  if (tabSidebarOutline) {
    tabSidebarOutline.classList.toggle('active', isOutline);
    tabSidebarOutline.setAttribute('aria-selected', isOutline ? 'true' : 'false');
  }
  if (tabSidebarBacklinks) {
    tabSidebarBacklinks.classList.toggle('active', !isOutline);
    tabSidebarBacklinks.setAttribute('aria-selected', !isOutline ? 'true' : 'false');
  }
  if (desktopOutlineListEl) desktopOutlineListEl.hidden = !isOutline;
  if (desktopBacklinksListEl) desktopBacklinksListEl.hidden = isOutline;
  if (isOutline) {
    renderOutline();
  } else {
    refreshBacklinks(getCurrentNoteId());
  }
}

if (tabSidebarOutline) {
  tabSidebarOutline.addEventListener('click', () => setSidebarTab('outline'));
}
if (tabSidebarBacklinks) {
  tabSidebarBacklinks.addEventListener('click', () => setSidebarTab('backlinks'));
}

// ── Alternador do Rodapé (Backlinks vs Sumário) ───────────────────────────────
let activeBottomTab = typeof localStorage !== 'undefined' ? (localStorage.getItem('quickdock:note-bottom-tab') || 'backlinks') : 'backlinks';

export function setBottomTab(tab) {
  activeBottomTab = tab === 'outline' ? 'outline' : 'backlinks';
  try { localStorage.setItem('quickdock:note-bottom-tab', activeBottomTab); } catch {}

  const isBacklinks = activeBottomTab === 'backlinks';
  if (tabBtnBacklinks) {
    tabBtnBacklinks.classList.toggle('active', isBacklinks);
    tabBtnBacklinks.setAttribute('aria-selected', isBacklinks ? 'true' : 'false');
  }
  if (tabBtnOutline) {
    tabBtnOutline.classList.toggle('active', !isBacklinks);
    tabBtnOutline.setAttribute('aria-selected', !isBacklinks ? 'true' : 'false');
  }
  if (backlinksListEl) backlinksListEl.hidden = !isBacklinks;
  if (mobileOutlineListEl) mobileOutlineListEl.hidden = isBacklinks;
  if (!isBacklinks) renderOutline();
}

if (tabBtnBacklinks) {
  tabBtnBacklinks.addEventListener('click', () => setBottomTab('backlinks'));
}
if (tabBtnOutline) {
  tabBtnOutline.addEventListener('click', () => setBottomTab('outline'));
}

// ── Barra Lateral do Sumário (Desktop) ────────────────────────────────────────
let outlineSidebarOpen = typeof localStorage !== 'undefined' ? localStorage.getItem('quickdock:outline-sidebar:open') !== 'false' : true;

export function setOutlineSidebarOpen(open) {
  outlineSidebarOpen = Boolean(open);
  try { localStorage.setItem('quickdock:outline-sidebar:open', String(outlineSidebarOpen)); } catch {}
  if (outlineSidebarEl) {
    outlineSidebarEl.classList.toggle('is-collapsed', !outlineSidebarOpen);
  }
  if (toggleOutlineHeaderBtn) {
    toggleOutlineHeaderBtn.classList.toggle('active', outlineSidebarOpen);
  }
}

if (toggleOutlineSidebarBtn) {
  toggleOutlineSidebarBtn.addEventListener('click', () => setOutlineSidebarOpen(false));
}
if (toggleOutlineHeaderBtn) {
  toggleOutlineHeaderBtn.addEventListener('click', () => setOutlineSidebarOpen(!outlineSidebarOpen));
}
if (floatingOutlineToggleBtn) {
  floatingOutlineToggleBtn.addEventListener('click', () => setOutlineSidebarOpen(true));
}

setOutlineSidebarOpen(outlineSidebarOpen);
setSidebarTab(activeSidebarTab);
setBottomTab(activeBottomTab);
