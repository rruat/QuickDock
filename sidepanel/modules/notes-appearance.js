// Popover de ícone + cor da nota — conteúdo embutido tanto no menu "⋯" da aba
// (notes-tabs.js) quanto no popover solto do cabeçalho (note-header.js).
import { updateNoteMetaById, deleteFile, saveFile } from './storage.js';
import { positionPopover } from './popover.js';
import { iconSvg } from './icons.js';
import { MATERIAL_ICONS } from './material-icons-list.js';
import { hasIconImage, renderIconImageEditor, buildIconImageNode, forgetIconFile } from './note-icon-image.js';
import { hasCover, applyCover, removeCover, startReposition, normalizeUrl, MAX_BYTES, openCoverMenu } from './note-cover.js';
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

  // Imagem própria (link ou arquivo) no lugar do ícone do catálogo, com corte quadrado.
  const imageRow = document.createElement('button');
  imageRow.type = 'button';
  imageRow.className = 'icon-image-row' + (hasIconImage(meta) ? ' active' : '');
  const thumb = hasIconImage(meta) ? buildIconImageNode(meta.iconImage, 'icon-image-thumb') : null;
  if (thumb) imageRow.appendChild(thumb);
  else imageRow.insertAdjacentHTML('beforeend', '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add_photo_alternate</span>');
  const imageLabel = document.createElement('span');
  imageLabel.textContent = hasIconImage(meta) ? 'Alterar imagem do ícone' : 'Usar uma imagem (link ou arquivo)';
  imageRow.appendChild(imageLabel);
  imageRow.addEventListener('mousedown', e => e.stopPropagation());
  imageRow.addEventListener('click', e => {
    e.stopPropagation();
    renderIconImageEditor(pop, meta, {
      back: () => renderAppearanceContent(pop, meta),
      save: async (iconImage) => {
        const antigo = meta.iconImage?.fileId;
        // Imagem e ícone do catálogo são excludentes: ficar com os dois só
        // deixaria dúvida sobre qual aparece.
        const patch = { iconImage, ...(iconImage ? { icon: null } : {}) };
        await updateNoteMetaById(meta.id, patch);
        sincronizarComNotesMeta(meta, patch);
        if (antigo != null && antigo !== iconImage?.fileId) {
          try { await deleteFile(antigo); } catch {}
          forgetIconFile(antigo);
        }
        renderTabs();
        refreshOpenAsideRows();
        document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
        renderAppearanceContent(pop, meta);
      },
    });
  });
  pop.appendChild(imageRow);

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
    const antigo = meta.iconImage?.fileId;
    await updateNoteMetaById(meta.id, { icon: name, iconImage: null });
    sincronizarComNotesMeta(meta, { icon: name, iconImage: null });
    if (antigo != null) {
      try { await deleteFile(antigo); } catch {}
      forgetIconFile(antigo);
    }
    renderTabs();
    renderAppearanceContent(pop, meta);
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
  };

  const filledClass = meta.iconFilled ? ' icon-filled' : '';

  const noneIconBtn = document.createElement('button');
  noneIconBtn.className = 'icon-swatch icon-swatch-none' + (!meta.icon && !hasIconImage(meta) ? ' active' : '');
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
  if (meta.icon || meta.color || hasIconImage(meta)) {
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

// ── Seção Expansível Integrada de Aparência da Nota (Desktop & Mobile) ─────────
// Substitui popups flutuantes por uma seção em linha rica, com capa, ícone e cor.
export function renderAppearanceSection(container, meta, onSaved, onClose) {
  if (!container || !meta) return;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'expandable-section-header';
  header.innerHTML = `
    <div class="expandable-section-title">
      <span class="qd-icon material-symbols-rounded">palette</span>
      <span>Aparência da Nota</span>
    </div>
    <button type="button" class="icon-btn btn-collapse-section" title="Recolher seção" aria-label="Recolher seção">
      <span class="qd-icon material-symbols-rounded">expand_less</span>
    </button>
  `;
  header.querySelector('.btn-collapse-section')?.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose?.();
  });
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'expandable-section-body appearance-expandable-body';

  // ── CARD 1: CAPA DA NOTA ─────────────────────────────────────────────────
  const coverCard = document.createElement('div');
  coverCard.className = 'appearance-section-card';

  const coverHeader = document.createElement('div');
  coverHeader.className = 'appearance-card-header';
  coverHeader.innerHTML = `
    <span class="qd-icon material-symbols-rounded">image</span>
    <span class="appearance-card-title">Capa da Nota</span>
  `;
  coverCard.appendChild(coverHeader);

  const noteHasCover = hasCover(meta);
  if (noteHasCover) {
    const statusRow = document.createElement('div');
    statusRow.className = 'appearance-cover-row';
    statusRow.innerHTML = `
      <div class="appearance-cover-status">
        <span class="qd-icon material-symbols-rounded">check_circle</span>
        <span>Capa configurada</span>
      </div>
      <div class="appearance-cover-actions-group">
        <button type="button" class="calendar-action-btn secondary btn-sec-reposition" title="Ajustar posição vertical da imagem da capa">
          <span class="qd-icon material-symbols-rounded">drag_pan</span>
          <span>Reposicionar</span>
        </button>
        <button type="button" class="calendar-action-btn secondary btn-sec-change-cover" title="Alterar imagem de capa">
          <span class="qd-icon material-symbols-rounded">edit</span>
          <span>Alterar</span>
        </button>
        <button type="button" class="calendar-action-btn danger btn-sec-remove-cover" title="Remover capa desta nota">
          <span class="qd-icon material-symbols-rounded">delete</span>
          <span>Remover</span>
        </button>
      </div>
    `;

    const changeBox = document.createElement('div');
    changeBox.className = 'appearance-cover-change-box';
    changeBox.hidden = true;
    changeBox.innerHTML = `
      <div class="appearance-cover-input-group" style="margin-top: 6px;">
        <input type="url" class="property-input sec-cover-url-input" placeholder="Novo link de imagem (https://...)" spellcheck="false" autocomplete="off">
        <button type="button" class="calendar-action-btn primary btn-sec-apply-url" title="Aplicar link da imagem">
          <span class="qd-icon material-symbols-rounded">link</span>
          <span>Aplicar</span>
        </button>
        <label class="calendar-action-btn secondary appearance-cover-btn-file" title="Enviar arquivo do aparelho">
          <input type="file" accept="image/*" class="sec-cover-file-input" hidden>
          <span class="qd-icon material-symbols-rounded">upload_file</span>
          <span>Arquivo</span>
        </label>
      </div>
      <div class="appearance-cover-error-msg" hidden></div>
    `;

    statusRow.querySelector('.btn-sec-reposition')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onClose?.();
      startReposition();
    });

    statusRow.querySelector('.btn-sec-change-cover')?.addEventListener('click', (e) => {
      e.stopPropagation();
      changeBox.hidden = !changeBox.hidden;
      if (!changeBox.hidden) changeBox.querySelector('.sec-cover-url-input')?.focus();
    });

    statusRow.querySelector('.btn-sec-remove-cover')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeCover(meta);
      onSaved?.();
      renderAppearanceSection(container, meta, onSaved, onClose);
    });

    const urlInput = changeBox.querySelector('.sec-cover-url-input');
    const applyBtn = changeBox.querySelector('.btn-sec-apply-url');
    const fileInput = changeBox.querySelector('.sec-cover-file-input');
    const errMsg = changeBox.querySelector('.appearance-cover-error-msg');

    const handleApplyUrl = async () => {
      const url = normalizeUrl(urlInput.value);
      if (!url) {
        errMsg.textContent = 'Digite um link http:// ou https:// válido.';
        errMsg.hidden = false;
        return;
      }
      errMsg.hidden = true;
      await applyCover({ coverUrl: url, coverFileId: null }, meta);
      onSaved?.();
      renderAppearanceSection(container, meta, onSaved, onClose);
    };

    applyBtn?.addEventListener('click', handleApplyUrl);
    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleApplyUrl(); }
    });

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        errMsg.textContent = 'Escolha um arquivo de imagem.';
        errMsg.hidden = false;
        return;
      }
      if (file.size > MAX_BYTES) {
        errMsg.textContent = 'A imagem passa de 10 MB. Escolha uma menor.';
        errMsg.hidden = false;
        return;
      }
      errMsg.hidden = true;
      const fileId = await saveFile(file, meta.id, { inline: true });
      await applyCover({ coverFileId: fileId, coverUrl: null }, meta);
      onSaved?.();
      renderAppearanceSection(container, meta, onSaved, onClose);
    });

    coverCard.appendChild(statusRow);
    coverCard.appendChild(changeBox);
  } else {
    const addBox = document.createElement('div');
    addBox.className = 'appearance-cover-add-box';
    addBox.innerHTML = `
      <div class="appearance-cover-input-group">
        <input type="url" class="property-input sec-cover-url-input" placeholder="Colar link de imagem (https://...)" spellcheck="false" autocomplete="off">
        <button type="button" class="calendar-action-btn primary btn-sec-apply-url" title="Aplicar link da imagem">
          <span class="qd-icon material-symbols-rounded">link</span>
          <span>Aplicar</span>
        </button>
        <label class="calendar-action-btn secondary appearance-cover-btn-file" title="Enviar arquivo do aparelho">
          <input type="file" accept="image/*" class="sec-cover-file-input" hidden>
          <span class="qd-icon material-symbols-rounded">upload_file</span>
          <span>Arquivo</span>
        </label>
      </div>
      <div class="appearance-cover-error-msg" hidden></div>
    `;

    const urlInput = addBox.querySelector('.sec-cover-url-input');
    const applyBtn = addBox.querySelector('.btn-sec-apply-url');
    const fileInput = addBox.querySelector('.sec-cover-file-input');
    const errMsg = addBox.querySelector('.appearance-cover-error-msg');

    const handleApplyUrl = async () => {
      const url = normalizeUrl(urlInput.value);
      if (!url) {
        errMsg.textContent = 'Digite um link http:// ou https:// válido.';
        errMsg.hidden = false;
        return;
      }
      errMsg.hidden = true;
      await applyCover({ coverUrl: url, coverFileId: null }, meta);
      onSaved?.();
      renderAppearanceSection(container, meta, onSaved, onClose);
    };

    applyBtn?.addEventListener('click', handleApplyUrl);
    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleApplyUrl(); }
    });

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        errMsg.textContent = 'Escolha um arquivo de imagem.';
        errMsg.hidden = false;
        return;
      }
      if (file.size > MAX_BYTES) {
        errMsg.textContent = 'A imagem passa de 10 MB. Escolha uma menor.';
        errMsg.hidden = false;
        return;
      }
      errMsg.hidden = true;
      const fileId = await saveFile(file, meta.id, { inline: true });
      await applyCover({ coverFileId: fileId, coverUrl: null }, meta);
      onSaved?.();
      renderAppearanceSection(container, meta, onSaved, onClose);
    });

    coverCard.appendChild(addBox);
  }
  body.appendChild(coverCard);

  // ── CARD 2: ÍCONE DA NOTA ────────────────────────────────────────────────
  const iconCard = document.createElement('div');
  iconCard.className = 'appearance-section-card';

  const iconHeader = document.createElement('div');
  iconHeader.className = 'appearance-card-header';
  iconHeader.innerHTML = `
    <span class="qd-icon material-symbols-rounded">sentiment_satisfied</span>
    <span class="appearance-card-title">Ícone</span>
    <span class="icon-catalog-header-count">${(MATERIAL_ICONS?.length || 4284).toLocaleString('pt-BR')} disponíveis</span>
  `;
  iconCard.appendChild(iconHeader);

  // Imagem própria (link ou arquivo)
  const imageRow = document.createElement('button');
  imageRow.type = 'button';
  imageRow.className = 'icon-image-row' + (hasIconImage(meta) ? ' active' : '');
  const thumb = hasIconImage(meta) ? buildIconImageNode(meta.iconImage, 'icon-image-thumb') : null;
  if (thumb) imageRow.appendChild(thumb);
  else imageRow.insertAdjacentHTML('beforeend', '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add_photo_alternate</span>');
  const imageLabel = document.createElement('span');
  imageLabel.textContent = hasIconImage(meta) ? 'Alterar imagem do ícone' : 'Usar uma imagem (link ou arquivo)';
  imageRow.appendChild(imageLabel);
  imageRow.addEventListener('click', (e) => {
    e.stopPropagation();
    renderIconImageEditor(iconCard, meta, {
      back: () => renderAppearanceSection(container, meta, onSaved, onClose),
      save: async (iconImage) => {
        const antigo = meta.iconImage?.fileId;
        const patch = { iconImage, ...(iconImage ? { icon: null } : {}) };
        await updateNoteMetaById(meta.id, patch);
        sincronizarComNotesMeta(meta, patch);
        if (antigo != null && antigo !== iconImage?.fileId) {
          try { await deleteFile(antigo); } catch {}
          forgetIconFile(antigo);
        }
        renderTabs();
        refreshOpenAsideRows();
        document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
        onSaved?.();
        renderAppearanceSection(container, meta, onSaved, onClose);
      },
    });
  });
  iconCard.appendChild(imageRow);

  // Barra de busca
  const searchWrap = document.createElement('div');
  searchWrap.className = 'icon-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'icon-search-input';
  searchInput.placeholder = 'Buscar entre 4.000+ ícones...';
  searchInput.setAttribute('aria-label', 'Buscar ícones');
  const searchClear = document.createElement('button');
  searchClear.className = 'icon-search-clear icon-btn';
  searchClear.innerHTML = iconSvg('close');
  searchClear.title = 'Limpar busca';
  searchClear.hidden = true;
  searchWrap.append(searchInput, searchClear);
  iconCard.appendChild(searchWrap);

  const countEl = document.createElement('div');
  countEl.className = 'icon-catalog-count';
  iconCard.appendChild(countEl);

  const iconScrollContainer = document.createElement('div');
  iconScrollContainer.className = 'icon-catalog-scroll';
  const iconGrid = document.createElement('div');
  iconGrid.className = 'icon-grid icon-catalog-grid';
  iconScrollContainer.appendChild(iconGrid);
  iconCard.appendChild(iconScrollContainer);

  const pickIcon = async (name) => {
    const antigo = meta.iconImage?.fileId;
    await updateNoteMetaById(meta.id, { icon: name, iconImage: null });
    sincronizarComNotesMeta(meta, { icon: name, iconImage: null });
    if (antigo != null) {
      try { await deleteFile(antigo); } catch {}
      forgetIconFile(antigo);
    }
    renderTabs();
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
    onSaved?.();
    renderAppearanceSection(container, meta, onSaved, onClose);
  };

  const filledClass = meta.iconFilled ? ' icon-filled' : '';
  const noneIconBtn = document.createElement('button');
  noneIconBtn.className = 'icon-swatch icon-swatch-none' + (!meta.icon && !hasIconImage(meta) ? ' active' : '');
  noneIconBtn.textContent = '—';
  noneIconBtn.title = 'Nenhum ícone';
  noneIconBtn.setAttribute('aria-label', 'Nenhum ícone');
  noneIconBtn.addEventListener('click', (e) => { e.stopPropagation(); pickIcon(null); });

  const createSwatch = (name) => {
    const btn = document.createElement('button');
    btn.className = 'icon-swatch' + filledClass + (meta.icon === name ? ' active' : '');
    btn.innerHTML = iconSvg(name);
    btn.title = name;
    btn.setAttribute('aria-label', name);
    btn.addEventListener('click', (e) => { e.stopPropagation(); pickIcon(name); });
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

  searchClear.addEventListener('click', (e) => {
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

  // Ícone preenchido
  const fillRow = document.createElement('label');
  fillRow.className = 'icon-fill-row';
  const fillCheckbox = document.createElement('input');
  fillCheckbox.type = 'checkbox';
  fillCheckbox.checked = !!meta.iconFilled;
  fillCheckbox.addEventListener('change', async (e) => {
    e.stopPropagation();
    await updateNoteMetaById(meta.id, { iconFilled: e.target.checked });
    sincronizarComNotesMeta(meta, { iconFilled: e.target.checked });
    renderTabs();
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
    onSaved?.();
    renderAppearanceSection(container, meta, onSaved, onClose);
  });
  const fillLabel = document.createElement('span');
  fillLabel.textContent = 'Ícone preenchido';
  fillRow.append(fillCheckbox, fillLabel);
  iconCard.appendChild(fillRow);

  body.appendChild(iconCard);

  // ── CARD 3: COR DA NOTA ──────────────────────────────────────────────────
  const colorCard = document.createElement('div');
  colorCard.className = 'appearance-section-card';

  const colorHeader = document.createElement('div');
  colorHeader.className = 'appearance-card-header';
  colorHeader.innerHTML = `
    <span class="qd-icon material-symbols-rounded">format_paint</span>
    <span class="appearance-card-title">Cor da Nota</span>
  `;
  colorCard.appendChild(colorHeader);

  const colorGrid = document.createElement('div');
  colorGrid.className = 'color-grid';

  const pickColor = async (hex) => {
    await updateNoteMetaById(meta.id, { color: hex });
    sincronizarComNotesMeta(meta, { color: hex });
    if (meta.id === getActiveId()) setAccent(hex);
    renderTabs();
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
    onSaved?.();
    renderAppearanceSection(container, meta, onSaved, onClose);
  };

  const noneColorBtn = document.createElement('button');
  noneColorBtn.className = 'color-swatch color-swatch-none' + (!meta.color ? ' active' : '');
  noneColorBtn.title = 'Nenhuma cor';
  noneColorBtn.addEventListener('click', (e) => { e.stopPropagation(); pickColor(null); });
  colorGrid.appendChild(noneColorBtn);

  for (const { name, hex } of COLORS) {
    const sw = document.createElement('button');
    sw.className = 'color-swatch' + (meta.color === hex ? ' active' : '');
    sw.style.background = hex;
    sw.title = name;
    sw.addEventListener('click', (e) => { e.stopPropagation(); pickColor(hex); });
    colorGrid.appendChild(sw);
  }

  const isCustomColor = !!meta.color && !COLORS.some(c => c.hex === meta.color);
  const customSwatch = document.createElement('label');
  customSwatch.className = 'color-swatch color-swatch-custom' + (isCustomColor ? ' active' : '');
  customSwatch.title = 'Outra cor…';
  if (isCustomColor) customSwatch.style.background = meta.color;

  const colorInput = document.createElement('input');
  colorInput.type  = 'color';
  colorInput.className = 'color-custom-input';
  colorInput.value = (meta.color && /^#[0-9a-f]{6}$/i.test(meta.color)) ? meta.color : '#888888';
  colorInput.addEventListener('input', (e) => { e.target.closest('.color-swatch').style.background = e.target.value; });
  colorInput.addEventListener('change', (e) => { e.stopPropagation(); pickColor(e.target.value); });
  customSwatch.appendChild(colorInput);
  colorGrid.appendChild(customSwatch);

  colorCard.appendChild(colorGrid);
  body.appendChild(colorCard);

  // ── CARD 4: OPÇÃO NA ABA ─────────────────────────────────────────────────
  if (meta.icon || meta.color || hasIconImage(meta)) {
    const optionsCard = document.createElement('div');
    optionsCard.className = 'appearance-section-card';

    const hideRow = document.createElement('label');
    hideRow.className = 'icon-fill-row';
    const hideCheckbox = document.createElement('input');
    hideCheckbox.type = 'checkbox';
    hideCheckbox.checked = !!meta.titleHidden;
    hideCheckbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      await updateNoteMetaById(meta.id, { titleHidden: e.target.checked });
      meta.titleHidden = e.target.checked;
      renderTabs();
    });
    const hideLabel = document.createElement('span');
    hideLabel.textContent = 'Ocultar nome na aba';
    hideRow.append(hideCheckbox, hideLabel);
    optionsCard.appendChild(hideRow);
    body.appendChild(optionsCard);
  }

  container.appendChild(body);
}

// ── Sessão Expansível em Linha para Ícone & Aparência ─────────────────────
let currentNoteMeta = null;

export function getIconPanelEl() {
  let el = document.getElementById('note-icon-panel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'note-icon-panel';
    el.className = 'note-inline-expansion note-icon-expansion';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="note-inline-expansion-inner">
        <div class="note-expansion-header">
          <div class="note-expansion-title">
            <span class="qd-icon material-symbols-rounded">sentiment_satisfied</span>
            <span>Opções do Ícone & Aparência</span>
          </div>
          <button type="button" class="icon-btn btn-close-expansion" title="Recolher opções do ícone" aria-label="Recolher opções">
            <span class="qd-icon material-symbols-rounded">expand_less</span>
          </button>
        </div>
        <div class="note-expansion-body" id="note-icon-body"></div>
      </div>
    `;

    const iconRow = document.getElementById('note-header-icon-row');
    const titleRow = document.getElementById('note-header-title-row') || document.getElementById('note-header-title');
    if (iconRow && iconRow.parentNode) {
      iconRow.parentNode.insertBefore(el, iconRow.nextSibling);
    } else if (titleRow && titleRow.parentNode) {
      titleRow.parentNode.insertBefore(el, titleRow);
    } else {
      const headerBar = document.getElementById('note-header-bar');
      if (headerBar) headerBar.insertBefore(el, headerBar.firstChild);
    }
  }

  const closeBtn = el.querySelector('.btn-close-expansion');
  if (closeBtn && !closeBtn._hasClickListener) {
    closeBtn._hasClickListener = true;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeIconPanel();
    });
  }

  return el;
}

export const getIconDetailsEl = getIconPanelEl;

export function isIconPanelOpen() {
  const el = document.getElementById('note-icon-panel');
  return el && el.classList.contains('is-open');
}

export function closeIconPanel() {
  const el = document.getElementById('note-icon-panel');
  if (el) {
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('btn-note-header-icon')?.classList.remove('section-active', 'is-active');
  document.getElementById('btn-note-header-color')?.classList.remove('section-active', 'is-active');
  document.getElementById('btn-note-appearance-mobile')?.classList.remove('section-active', 'is-active');
}

export function openIconPanel(meta, onSaved) {
  if (!meta) return;
  window.dispatchEvent(new CustomEvent('quickdock:close-cover-menu'));
  window.dispatchEvent(new CustomEvent('quickdock:close-note-section'));

  currentNoteMeta = meta;
  const el = getIconPanelEl();
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');

  document.getElementById('btn-note-header-icon')?.classList.add('section-active', 'is-active');
  document.getElementById('btn-note-header-color')?.classList.add('section-active', 'is-active');
  document.getElementById('btn-note-appearance-mobile')?.classList.add('section-active', 'is-active');

  renderIconPanelContent(el, meta, onSaved);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function toggleIconPanel(meta, onSaved) {
  if (isIconPanelOpen()) {
    closeIconPanel();
  } else {
    openIconPanel(meta, onSaved);
  }
}

export function renderIconPanelContent(panel, meta, onSaved) {
  if (!panel || !meta) return;
  currentNoteMeta = meta;

  const body = panel.querySelector('#note-icon-body') || panel;
  body.innerHTML = '';

  // ── SEÇÃO 1: ÍCONE DA NOTA ───────────────────────────────────────────────
  const iconCard = document.createElement('div');
  iconCard.className = 'appearance-section-card';

  const iconHeader = document.createElement('div');
  iconHeader.className = 'appearance-card-header';
  iconHeader.innerHTML = `
    <span class="qd-icon material-symbols-rounded">sentiment_satisfied</span>
    <span class="appearance-card-title">Ícone</span>
    <span class="icon-catalog-header-count">${(MATERIAL_ICONS?.length || 4284).toLocaleString('pt-BR')} disponíveis</span>
  `;
  iconCard.appendChild(iconHeader);

  // Imagem própria (link ou arquivo)
  const imageRow = document.createElement('button');
  imageRow.type = 'button';
  imageRow.className = 'icon-image-row' + (hasIconImage(meta) ? ' active' : '');
  const thumb = hasIconImage(meta) ? buildIconImageNode(meta.iconImage, 'icon-image-thumb') : null;
  if (thumb) imageRow.appendChild(thumb);
  else imageRow.insertAdjacentHTML('beforeend', '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add_photo_alternate</span>');
  const imageLabel = document.createElement('span');
  imageLabel.textContent = hasIconImage(meta) ? 'Alterar imagem do ícone' : 'Usar uma imagem (link ou arquivo)';
  imageRow.appendChild(imageLabel);
  imageRow.addEventListener('click', (e) => {
    e.stopPropagation();
    renderIconImageEditor(iconCard, meta, {
      back: () => renderIconPanelContent(panel, meta, onSaved),
      save: async (iconImage) => {
        const antigo = meta.iconImage?.fileId;
        const patch = { iconImage, ...(iconImage ? { icon: null } : {}) };
        await updateNoteMetaById(meta.id, patch);
        sincronizarComNotesMeta(meta, patch);
        if (antigo != null && antigo !== iconImage?.fileId) {
          try { await deleteFile(antigo); } catch {}
          forgetIconFile(antigo);
        }
        renderTabs();
        refreshOpenAsideRows();
        document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
        onSaved?.();
        renderIconPanelContent(panel, meta, onSaved);
      },
    });
  });
  iconCard.appendChild(imageRow);

  // Barra de busca
  const searchWrap = document.createElement('div');
  searchWrap.className = 'icon-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'icon-search-input';
  searchInput.placeholder = 'Buscar entre 4.000+ ícones...';
  searchInput.setAttribute('aria-label', 'Buscar ícones');
  const searchClear = document.createElement('button');
  searchClear.className = 'icon-search-clear icon-btn';
  searchClear.innerHTML = iconSvg('close');
  searchClear.title = 'Limpar busca';
  searchClear.hidden = true;
  searchWrap.append(searchInput, searchClear);
  iconCard.appendChild(searchWrap);

  const countEl = document.createElement('div');
  countEl.className = 'icon-catalog-count';
  iconCard.appendChild(countEl);

  const iconScrollContainer = document.createElement('div');
  iconScrollContainer.className = 'icon-catalog-scroll';
  const iconGrid = document.createElement('div');
  iconGrid.className = 'icon-grid icon-catalog-grid';
  iconScrollContainer.appendChild(iconGrid);
  iconCard.appendChild(iconScrollContainer);

  const pickIcon = async (name) => {
    const antigo = meta.iconImage?.fileId;
    await updateNoteMetaById(meta.id, { icon: name, iconImage: null });
    sincronizarComNotesMeta(meta, { icon: name, iconImage: null });
    if (antigo != null) {
      try { await deleteFile(antigo); } catch {}
      forgetIconFile(antigo);
    }
    renderTabs();
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
    onSaved?.();
    renderIconPanelContent(panel, meta, onSaved);
  };

  const filledClass = meta.iconFilled ? ' icon-filled' : '';
  const noneIconBtn = document.createElement('button');
  noneIconBtn.className = 'icon-swatch icon-swatch-none' + (!meta.icon && !hasIconImage(meta) ? ' active' : '');
  noneIconBtn.textContent = '—';
  noneIconBtn.title = 'Nenhum ícone';
  noneIconBtn.setAttribute('aria-label', 'Nenhum ícone');
  noneIconBtn.addEventListener('click', (e) => { e.stopPropagation(); pickIcon(null); });

  const createSwatch = (name) => {
    const btn = document.createElement('button');
    btn.className = 'icon-swatch' + filledClass + (meta.icon === name ? ' active' : '');
    btn.innerHTML = iconSvg(name);
    btn.title = name;
    btn.setAttribute('aria-label', name);
    btn.addEventListener('click', (e) => { e.stopPropagation(); pickIcon(name); });
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

  searchClear.addEventListener('click', (e) => {
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

  // Ícone preenchido
  const fillRow = document.createElement('label');
  fillRow.className = 'icon-fill-row';
  const fillCheckbox = document.createElement('input');
  fillCheckbox.type = 'checkbox';
  fillCheckbox.checked = !!meta.iconFilled;
  fillCheckbox.addEventListener('change', async (e) => {
    e.stopPropagation();
    await updateNoteMetaById(meta.id, { iconFilled: e.target.checked });
    sincronizarComNotesMeta(meta, { iconFilled: e.target.checked });
    renderTabs();
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
    onSaved?.();
    renderIconPanelContent(panel, meta, onSaved);
  });
  const fillLabel = document.createElement('span');
  fillLabel.textContent = 'Ícone preenchido';
  fillRow.append(fillCheckbox, fillLabel);
  iconCard.appendChild(fillRow);

  body.appendChild(iconCard);

  // ── SEÇÃO 2: COR DA NOTA ─────────────────────────────────────────────────
  const colorCard = document.createElement('div');
  colorCard.className = 'appearance-section-card';

  const colorHeader = document.createElement('div');
  colorHeader.className = 'appearance-card-header';
  colorHeader.innerHTML = `
    <span class="qd-icon material-symbols-rounded">format_paint</span>
    <span class="appearance-card-title">Cor da Nota</span>
  `;
  colorCard.appendChild(colorHeader);

  const colorGrid = document.createElement('div');
  colorGrid.className = 'color-grid';

  const pickColor = async (hex) => {
    await updateNoteMetaById(meta.id, { color: hex });
    sincronizarComNotesMeta(meta, { color: hex });
    if (meta.id === getActiveId()) setAccent(hex);
    renderTabs();
    refreshOpenAsideRows();
    document.dispatchEvent(new CustomEvent('quickdock:note-appearance-updated', { detail: { noteId: meta.id } }));
    onSaved?.();
    renderIconPanelContent(panel, meta, onSaved);
  };

  const noneColorBtn = document.createElement('button');
  noneColorBtn.className = 'color-swatch color-swatch-none' + (!meta.color ? ' active' : '');
  noneColorBtn.title = 'Nenhuma cor';
  noneColorBtn.addEventListener('click', (e) => { e.stopPropagation(); pickColor(null); });
  colorGrid.appendChild(noneColorBtn);

  for (const { name, hex } of COLORS) {
    const sw = document.createElement('button');
    sw.className = 'color-swatch' + (meta.color === hex ? ' active' : '');
    sw.style.background = hex;
    sw.title = name;
    sw.addEventListener('click', (e) => { e.stopPropagation(); pickColor(hex); });
    colorGrid.appendChild(sw);
  }

  const isCustomColor = !!meta.color && !COLORS.some(c => c.hex === meta.color);
  const customSwatch = document.createElement('label');
  customSwatch.className = 'color-swatch color-swatch-custom' + (isCustomColor ? ' active' : '');
  customSwatch.title = 'Outra cor…';
  if (isCustomColor) customSwatch.style.background = meta.color;

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-custom-input';
  colorInput.value = (meta.color && /^#[0-9a-f]{6}$/i.test(meta.color)) ? meta.color : '#888888';
  colorInput.addEventListener('input', (e) => { e.target.closest('.color-swatch').style.background = e.target.value; });
  colorInput.addEventListener('change', (e) => { e.stopPropagation(); pickColor(e.target.value); });
  customSwatch.appendChild(colorInput);
  colorGrid.appendChild(customSwatch);

  colorCard.appendChild(colorGrid);
  body.appendChild(colorCard);

  // ── SEÇÃO 3: OPÇÕES NA ABA ───────────────────────────────────────────────
  if (meta.icon || meta.color || hasIconImage(meta)) {
    const optionsCard = document.createElement('div');
    optionsCard.className = 'appearance-section-card';

    const hideRow = document.createElement('label');
    hideRow.className = 'icon-fill-row';
    const hideCheckbox = document.createElement('input');
    hideCheckbox.type = 'checkbox';
    hideCheckbox.checked = !!meta.titleHidden;
    hideCheckbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      await updateNoteMetaById(meta.id, { titleHidden: e.target.checked });
      meta.titleHidden = e.target.checked;
      renderTabs();
    });
    const hideLabel = document.createElement('span');
    hideLabel.textContent = 'Ocultar nome na aba';
    hideRow.append(hideCheckbox, hideLabel);
    optionsCard.appendChild(hideRow);
    body.appendChild(optionsCard);
  }
}

// Ouvintes globais para fechamento e integridade
window.addEventListener('quickdock:close-icon-menu', () => {
  closeIconPanel();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isIconPanelOpen()) closeIconPanel();
});
