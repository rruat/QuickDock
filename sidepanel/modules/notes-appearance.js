// Popover de ícone + cor da nota — conteúdo embutido tanto no menu "⋯" da aba
// (notes-tabs.js) quanto no popover solto do cabeçalho (note-header.js).
import { updateNoteMetaById } from './storage.js';
import { positionPopover } from './popover.js';
import { iconSvg } from './icons.js';
import { MATERIAL_ICONS } from './material-icons-list.js';
import {
  getNotesMeta, getActiveId, setAccent, renderTabs, refreshOpenAsideRows,
} from './notes-tabs.js';

// As 7 cores do arco-íris, na ordem — "Nenhuma" fica à parte, sempre primeiro
// na lista do popover.
const COLORS = [
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Laranja',  hex: '#f97316' },
  { name: 'Amarelo',  hex: '#eab308' },
  { name: 'Verde',    hex: '#22c55e' },
  { name: 'Azul',     hex: '#3b82f6' },
  { name: 'Anil',     hex: '#6366f1' },
  { name: 'Violeta',  hex: '#a855f7' },
];

// Ícones comuns (Material Symbols) — qualquer outro nome do catálogo
// (fonts.google.com/icons) também funciona via o campo de texto livre.
// Onze: com o "nenhum" na frente fecham duas fileiras de seis na grade.
const COMMON_ICONS = [
  'note', 'edit_note', 'checklist', 'star', 'flag', 'bookmark',
  'folder', 'lightbulb', 'push_pin', 'label', 'event',
];

// ── Conteúdo de ícone + cor (embutido no menu "⋯" e no popover do cabeçalho
// da nota, ver openTabMenu e openAppearancePopover) ─────────────────────────
// Escolher um ícone ou uma cor não fecha quem estiver mostrando isto, só
// re-renderiza este bloco no lugar, pra dar pra ajustar os dois sem reabrir
// nada — os dois pontos de entrada chamam a mesma função, o mesmo estado.
// Aplica os campos mudados também na entrada de verdade do notesMeta —
// necessário porque `meta` pode ser um objeto de fora (o cabeçalho da nota,
// em note.js, guarda o seu próprio via getNoteById(), separado deste array).
// Mutar só o `meta` recebido deixava a aside intocada quando o ícone/cor eram
// trocados pelo cabeçalho: refreshOpenAsideRows() reconstruía a lista, mas a
// partir do notesMeta antigo, sem efeito visível nenhum.
function sincronizarComNotesMeta(meta, patch) {
  Object.assign(meta, patch);
  const real = getNotesMeta().find(n => n.id === meta.id);
  if (real && real !== meta) Object.assign(real, patch);
}

export function renderAppearanceContent(pop, meta) {
  pop.innerHTML = '';

  const iconHeader = document.createElement('div');
  iconHeader.className = 'copy-menu-header';
  iconHeader.innerHTML = `<span>Ícone</span><span class="icon-catalog-header-count">${(MATERIAL_ICONS?.length || 4284).toLocaleString('pt-BR')} disponíveis</span>`;
  pop.appendChild(iconHeader);

  // Barra de busca de ícones
  const searchWrap = document.createElement('div');
  searchWrap.className = 'icon-search-wrap';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'icon-search-input';
  searchInput.placeholder = 'Buscar entre 4.000+ ícones...';
  searchInput.setAttribute('aria-label', 'Buscar ícones');
  searchInput.addEventListener('mousedown', e => e.stopPropagation());

  const searchClear = document.createElement('button');
  searchClear.className = 'icon-search-clear icon-btn';
  searchClear.innerHTML = iconSvg('close');
  searchClear.title = 'Limpar busca';
  searchClear.hidden = true;

  searchWrap.append(searchInput, searchClear);
  pop.appendChild(searchWrap);

  const countEl = document.createElement('div');
  countEl.className = 'icon-catalog-count';
  pop.appendChild(countEl);

  const iconScrollContainer = document.createElement('div');
  iconScrollContainer.className = 'icon-catalog-scroll';

  const iconGrid = document.createElement('div');
  iconGrid.className = 'icon-grid icon-catalog-grid';
  iconScrollContainer.appendChild(iconGrid);
  pop.appendChild(iconScrollContainer);

  const pickIcon = async (name) => {
    await updateNoteMetaById(meta.id, { icon: name });
    sincronizarComNotesMeta(meta, { icon: name });
    renderTabs();
    renderAppearanceContent(pop, meta);
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
  };

  const filledClass = meta.iconFilled ? ' icon-filled' : '';

  const noneIconBtn = document.createElement('button');
  noneIconBtn.className = 'icon-swatch icon-swatch-none' + (!meta.icon ? ' active' : '');
  noneIconBtn.textContent = '—';
  noneIconBtn.title = 'Nenhum ícone';
  noneIconBtn.setAttribute('aria-label', 'Nenhum ícone');
  noneIconBtn.addEventListener('mousedown', e => e.stopPropagation());
  noneIconBtn.addEventListener('click', e => { e.stopPropagation(); pickIcon(null); });

  const createSwatch = (name) => {
    const btn = document.createElement('button');
    btn.className = 'icon-swatch' + filledClass + (meta.icon === name ? ' active' : '');
    btn.innerHTML = iconSvg(name);
    btn.title = name;
    btn.setAttribute('aria-label', name);
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); pickIcon(name); });
    return btn;
  };

  let renderLimit = 72;
  let currentFilteredList = [];

  const renderBatch = () => {
    const q = searchInput.value.trim().toLowerCase();
    const isSearching = !!q;

    if (!isSearching) {
      countEl.textContent = 'Populares e catálogo completo:';
      iconGrid.appendChild(noneIconBtn);
      for (const name of COMMON_ICONS) {
        iconGrid.appendChild(createSwatch(name));
      }
      if (meta.icon && !COMMON_ICONS.includes(meta.icon)) {
        iconGrid.appendChild(createSwatch(meta.icon));
      }
      currentFilteredList = (MATERIAL_ICONS || []).filter(name => !COMMON_ICONS.includes(name));
    } else {
      currentFilteredList = (MATERIAL_ICONS || []).filter(name => name.toLowerCase().includes(q));
      countEl.textContent = `${currentFilteredList.length} ícone(s) encontrado(s):`;
      if (currentFilteredList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'icon-catalog-empty';
        empty.textContent = 'Nenhum ícone encontrado para esta busca.';
        iconGrid.appendChild(empty);
        return;
      }
    }

    const slice = currentFilteredList.slice(0, renderLimit);
    for (const name of slice) {
      iconGrid.appendChild(createSwatch(name));
    }
  };

  const updateGrid = () => {
    iconGrid.innerHTML = '';
    renderLimit = 72;
    renderBatch();
  };

  searchInput.addEventListener('input', () => {
    searchClear.hidden = !searchInput.value;
    updateGrid();
  });

  searchClear.addEventListener('click', e => {
    e.stopPropagation();
    searchInput.value = '';
    searchClear.hidden = true;
    updateGrid();
    searchInput.focus();
  });

  iconScrollContainer.addEventListener('scroll', () => {
    if (iconScrollContainer.scrollTop + iconScrollContainer.clientHeight >= iconScrollContainer.scrollHeight - 40) {
      if (renderLimit < currentFilteredList.length) {
        renderLimit += 60;
        const nextBatch = currentFilteredList.slice(renderLimit - 60, renderLimit);
        for (const name of nextBatch) {
          iconGrid.appendChild(createSwatch(name));
        }
      }
    }
  });

  updateGrid();

  // Alterna entre o estilo "contorno" (padrão) e "preenchido" do ícone —
  // usa o eixo FILL da própria fonte variável, não precisa carregar outra.
  const fillRow = document.createElement('label');
  fillRow.className = 'icon-fill-row';
  const fillCheckbox = document.createElement('input');
  fillCheckbox.type = 'checkbox';
  fillCheckbox.checked = !!meta.iconFilled;
  fillCheckbox.addEventListener('mousedown', e => e.stopPropagation());
  fillCheckbox.addEventListener('change', async e => {
    e.stopPropagation();
    await updateNoteMetaById(meta.id, { iconFilled: e.target.checked });
    sincronizarComNotesMeta(meta, { iconFilled: e.target.checked });
    renderTabs();
    renderAppearanceContent(pop, meta);
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
  });
  const fillLabel = document.createElement('span');
  fillLabel.textContent = 'Ícone preenchido';
  fillRow.append(fillCheckbox, fillLabel);
  pop.appendChild(fillRow);
  pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  const colorHeader = document.createElement('div');
  colorHeader.className = 'copy-menu-header';
  colorHeader.textContent = 'Cor';
  pop.appendChild(colorHeader);

  const colorGrid = document.createElement('div');
  colorGrid.className = 'color-grid';

  const pickColor = async (hex) => {
    await updateNoteMetaById(meta.id, { color: hex });
    sincronizarComNotesMeta(meta, { color: hex });
    if (meta.id === getActiveId()) setAccent(hex);
    renderTabs();
    renderAppearanceContent(pop, meta);
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
  };

  const noneColorBtn = document.createElement('button');
  noneColorBtn.className = 'color-swatch color-swatch-none' + (!meta.color ? ' active' : '');
  noneColorBtn.title = 'Nenhuma cor';
  noneColorBtn.addEventListener('mousedown', e => e.stopPropagation());
  noneColorBtn.addEventListener('click', e => { e.stopPropagation(); pickColor(null); });
  colorGrid.appendChild(noneColorBtn);

  for (const { name, hex } of COLORS) {
    const sw = document.createElement('button');
    sw.className = 'color-swatch' + (meta.color === hex ? ' active' : '');
    sw.style.background = hex;
    sw.title = name;
    sw.addEventListener('mousedown', e => e.stopPropagation());
    sw.addEventListener('click', e => { e.stopPropagation(); pickColor(hex); });
    colorGrid.appendChild(sw);
  }
  // "Outra cor" entra como a última bolinha da própria grade, em vez de uma
  // linha solta embaixo — é o que deixava a seção desalinhada.
  const isCustomColor = !!meta.color && !COLORS.some(c => c.hex === meta.color);
  const customSwatch = document.createElement('label');
  customSwatch.className = 'color-swatch color-swatch-custom' + (isCustomColor ? ' active' : '');
  customSwatch.title = 'Outra cor…';
  if (isCustomColor) customSwatch.style.background = meta.color;

  const colorInput = document.createElement('input');
  colorInput.type  = 'color';
  colorInput.className = 'color-custom-input';
  colorInput.value = (meta.color && /^#[0-9a-f]{6}$/i.test(meta.color)) ? meta.color : '#888888';
  colorInput.addEventListener('mousedown', e => e.stopPropagation());
  colorInput.addEventListener('input',  e => { e.target.closest('.color-swatch').style.background = e.target.value; });
  colorInput.addEventListener('change', e => { e.stopPropagation(); pickColor(e.target.value); });

  customSwatch.appendChild(colorInput);
  colorGrid.appendChild(customSwatch);
  pop.appendChild(colorGrid);

  // Ocultar o nome só faz sentido se sobrar ícone ou cor pra identificar a
  // aba — sem isso a aba ficaria completamente vazia, então a opção nem
  // aparece nesse caso (a nota volta a mostrar o nome automaticamente).
  if (meta.icon || meta.color) {
    pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

    const hideRow = document.createElement('label');
    hideRow.className = 'icon-fill-row';
    const hideCheckbox = document.createElement('input');
    hideCheckbox.type = 'checkbox';
    hideCheckbox.checked = !!meta.titleHidden;
    hideCheckbox.addEventListener('mousedown', e => e.stopPropagation());
    hideCheckbox.addEventListener('change', async e => {
      e.stopPropagation();
      await updateNoteMetaById(meta.id, { titleHidden: e.target.checked });
      meta.titleHidden = e.target.checked;
      renderTabs();
    });
    const hideLabel = document.createElement('span');
    hideLabel.textContent = 'Ocultar nome na aba';
    hideRow.append(hideCheckbox, hideLabel);
    pop.appendChild(hideRow);
  }
}

// ── Popover de ícone + cor sozinho (cabeçalho da nota) ───────────────────────
// Mesmo conteúdo do "Ícone e cor" do menu "⋯", só que como popover próprio —
// pro clique no ícone/bolinha de cor do cabeçalho não precisar abrir o menu
// inteiro da aba pra chegar lá.
let appearancePopoverEl = null;
function closeAppearancePopover() {
  appearancePopoverEl?.remove();
  appearancePopoverEl = null;
}

// Usado pelo listener global de mousedown em notes-tabs.js pra fechar o
// popover ao clicar fora — sem expor o elemento em si pra fora do módulo.
export function closeAppearancePopoverIfOutside(target) {
  if (appearancePopoverEl && !appearancePopoverEl.contains(target)
    && target.id !== 'btn-note-header-icon' && target.id !== 'btn-note-header-color'
    && !target.closest('#btn-note-header-icon') && !target.closest('#btn-note-header-color')) {
    closeAppearancePopover();
  }
}

export function openAppearancePopover(anchorEl, meta) {
  // Segundo clique no mesmo botão fecha em vez de reabrir — sem isso o
  // mousedown de fechar (fora do popover) e o click de abrir, nesta ordem,
  // fariam o popover nunca fechar clicando de novo no ícone.
  const jaAbertoNesteAncora = appearancePopoverEl?.dataset.anchor === anchorEl.id;
  closeAppearancePopover();
  if (jaAbertoNesteAncora) return;

  const pop = document.createElement('div');
  pop.dataset.anchor = anchorEl.id;
  pop.className = 'copy-menu tab-menu-appearance appearance-popover';
  renderAppearanceContent(pop, meta);
  document.body.appendChild(pop);
  positionPopover(pop, anchorEl);
  appearancePopoverEl = pop;
}
