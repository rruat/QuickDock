import { MATERIAL_ICONS } from '../material-icons-list.js';
import { updateNoteMetaById } from '../storage.js';
import { COLORS, COMMON_ICONS } from './constants.js';
import { S } from './state.js';
import { renderTabs, setAccent } from './tab-strip.js';

export function renderAppearanceContent(pop, meta) {
  pop.innerHTML = '';

  const iconHeader = document.createElement('div');
  iconHeader.className = 'copy-menu-header';
  iconHeader.textContent = 'Ícone';
  pop.appendChild(iconHeader);

  // Busca no catálogo completo de ícones (MATERIAL_ICONS)
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'icon-search-input';
  searchInput.placeholder = `Buscar entre ${MATERIAL_ICONS.length.toLocaleString('pt-BR')} ícones...`;
  searchInput.addEventListener('mousedown', e => e.stopPropagation());
  searchInput.addEventListener('keydown', e => e.stopPropagation());
  pop.appendChild(searchInput);

  const iconGrid = document.createElement('div');
  iconGrid.className = 'icon-grid';

  const pickIcon = async (name) => {
    await updateNoteMetaById(meta.id, { icon: name });
    meta.icon = name;
    renderTabs();
    renderAppearanceContent(pop, meta);
  };

  const noneIconBtn = document.createElement('button');
  noneIconBtn.className = 'icon-swatch icon-swatch-none' + (!meta.icon ? ' active' : '');
  noneIconBtn.textContent = '—';
  noneIconBtn.title = 'Nenhum ícone';
  noneIconBtn.addEventListener('mousedown', e => e.stopPropagation());
  noneIconBtn.addEventListener('click', e => { e.stopPropagation(); pickIcon(null); });

  const filledClass = meta.iconFilled ? ' icon-filled' : '';
  const createSwatch = (name) => {
    const btn = document.createElement('button');
    btn.className = 'icon-swatch material-symbols-rounded' + filledClass + (meta.icon === name ? ' active' : '');
    btn.textContent = name;
    btn.title = name;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => { e.stopPropagation(); pickIcon(name); });
    return btn;
  };

  // O catálogo tem milhares de ícones: a grade cresce em lotes conforme a rolagem.
  const BATCH = 120;
  let shown = 0;
  let list = [];

  const appendBatch = () => {
    const slice = list.slice(shown, shown + BATCH);
    for (const name of slice) iconGrid.appendChild(createSwatch(name));
    shown += slice.length;
  };

  const rebuildGrid = () => {
    const q = searchInput.value.trim().toLowerCase();
    iconGrid.innerHTML = '';
    shown = 0;
    if (!q) {
      iconGrid.appendChild(noneIconBtn);
      for (const name of COMMON_ICONS) iconGrid.appendChild(createSwatch(name));
      list = MATERIAL_ICONS.filter(name => !COMMON_ICONS.includes(name));
    } else {
      list = MATERIAL_ICONS.filter(name => name.includes(q));
    }
    appendBatch();
    iconGrid.scrollTop = 0;
  };

  iconGrid.addEventListener('scroll', () => {
    if (iconGrid.scrollTop + iconGrid.clientHeight >= iconGrid.scrollHeight - 40) appendBatch();
  });
  searchInput.addEventListener('input', rebuildGrid);
  rebuildGrid();
  pop.appendChild(iconGrid);

  // Alterna entre o estilo "contorno" (padrão) e "preenchido" do ícone —
  // usa o eixo FILL da própria fonte variável, não precisa carregar outra.
  // Switch no estilo do iOS: texto à esquerda, trilho com bolinha à direita.
  const fillRow = document.createElement('label');
  fillRow.className = 'ios-switch-row';
  const fillLabel = document.createElement('span');
  fillLabel.textContent = 'Ícone preenchido';
  const fillSwitch = document.createElement('span');
  fillSwitch.className = 'apple-check';
  const fillCheckbox = document.createElement('input');
  fillCheckbox.type = 'checkbox';
  fillCheckbox.checked = !!meta.iconFilled;
  fillCheckbox.addEventListener('mousedown', e => e.stopPropagation());
  fillCheckbox.addEventListener('change', async e => {
    e.stopPropagation();
    await updateNoteMetaById(meta.id, { iconFilled: e.target.checked });
    meta.iconFilled = e.target.checked;
    renderTabs();
    renderAppearanceContent(pop, meta);
  });
  const fillTrack = document.createElement('span');
  fillTrack.className = 'apple-check-box';
  fillSwitch.append(fillCheckbox, fillTrack);
  fillRow.append(fillLabel, fillSwitch);
  pop.appendChild(fillRow);

  // Ocultar o nome só faz sentido se sobrar ícone ou cor pra identificar a
  // aba — sem isso a aba ficaria vazia, então a opção só aparece nesse caso.
  if (meta.icon || meta.color) {
    const hideRow = document.createElement('label');
    hideRow.className = 'ios-switch-row';
    const hideLabel = document.createElement('span');
    hideLabel.textContent = 'Ocultar nome na aba';
    const hideBox = document.createElement('span');
    hideBox.className = 'apple-check';
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
    const hideTrack = document.createElement('span');
    hideTrack.className = 'apple-check-box';
    hideBox.append(hideCheckbox, hideTrack);
    hideRow.append(hideLabel, hideBox);
    pop.appendChild(hideRow);
  }

  pop.appendChild(Object.assign(document.createElement('div'), { className: 'math-divider' }));

  const colorHeader = document.createElement('div');
  colorHeader.className = 'copy-menu-header';
  colorHeader.textContent = 'Cor';
  pop.appendChild(colorHeader);

  const colorGrid = document.createElement('div');
  colorGrid.className = 'color-grid';

  const pickColor = async (hex) => {
    await updateNoteMetaById(meta.id, { color: hex });
    meta.color = hex;
    if (meta.id === S.activeId) setAccent(hex);
    renderTabs();
    renderAppearanceContent(pop, meta);
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
}
