// ── bases-gallery-view.js ────────────────────────────────────────────────────
// Visualização em Galeria (cartões/grade) para Bases do QuickDock.
// Estilo Obsidian Bases / Notion Gallery: cartões visuais com a CAPA da nota (a mesma
// capa do cabeçalho da nota), título e propriedades. Sem capa, o cartão mostra o ícone
// e a cor da nota.

import { getNotePropertyValue } from './bases-engine.js';
import { formatPropertyValue } from './bases-schema.js';
import { getViewProps } from './config/view-model.js';
import { renderGrouped } from './ui/grouped-sections.js';
import { enableReorder } from './ui/reorder.js';
import { hydrateNoteContent, lazyHydrate } from './note-preview.js';
import { formatSelectBadge } from './bases-cell-editors.js';
import { loadFileBlob } from '../storage.js';

const SIZES = [
  { id: 'small', label: 'Pequeno', icon: 'grid_view' },
  { id: 'medium', label: 'Médio', icon: 'view_module' },
  { id: 'large', label: 'Grande', icon: 'crop_square' },
];

// Capas guardadas como arquivo local viram Blob URL — uma por arquivo, reaproveitada
// entre renders (a galeria é redesenhada a cada mudança nas notas).
const urlsDeCapa = new Map();

async function urlDaCapa(fileId) {
  if (urlsDeCapa.has(fileId)) return urlsDeCapa.get(fileId);
  const blob = await loadFileBlob(fileId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlsDeCapa.set(fileId, url);
  return url;
}

// A capa vem do cabeçalho da nota (coverUrl/coverFileId/coverPosition); a propriedade
// `cover` explícita da Base continua valendo e tem prioridade.
function posicaoDaCapa(note) {
  const y = typeof note.coverPosition === 'number' ? note.coverPosition
    : (typeof note.coverPositionY === 'number' ? note.coverPositionY : 50);
  return Math.min(100, Math.max(0, y));
}

function buildCover(note, coverProp) {
  const cover = document.createElement('div');
  cover.className = 'base-gallery-cover';

  const explicita = note.properties?.[coverProp];
  const url = (typeof explicita === 'string' && explicita.trim()) ? explicita.trim() : (note.coverUrl || null);

  const comImagem = src => {
    cover.style.backgroundImage = `url("${String(src).replace(/"/g, '%22')}")`;
    cover.style.backgroundPosition = `center ${posicaoDaCapa(note)}%`;
    cover.classList.add('has-image');
  };

  if (url) {
    comImagem(url);
  } else if (note.coverFileId != null) {
    cover.classList.add('is-loading');
    urlDaCapa(note.coverFileId).then(src => {
      cover.classList.remove('is-loading');
      if (src) comImagem(src); else colocarPlaceholder(cover, note);
    }).catch(() => { cover.classList.remove('is-loading'); colocarPlaceholder(cover, note); });
  } else {
    colocarPlaceholder(cover, note);
  }
  return cover;
}

// Sem capa: ícone da nota sobre um fundo na cor dela (ou neutro)
function colocarPlaceholder(cover, note) {
  cover.classList.add('cover-placeholder');
  if (note.color) {
    cover.style.setProperty('--cover-accent', note.color);
    cover.classList.add('has-accent');
  }
  const icone = document.createElement('span');
  icone.className = 'qd-icon material-symbols-rounded base-gallery-placeholder-icon';
  icone.setAttribute('aria-hidden', 'true');
  icone.textContent = note.icon || 'description';
  cover.replaceChildren(icone);
}

function propriedadesVisiveis(viewConfig, coverProp) {
  return getViewProps(viewConfig)
    .filter(p => p && !['title', 'name', coverProp].includes(p));
}

/**
 * Renderiza a visualização em Galeria num contêiner DOM.
 * @param {HTMLElement} container
 * @param {Array<Object>} notes - Lista de notas já filtradas e ordenadas
 * @param {Object} schema - Schema da base ({ properties: [...] })
 * @param {Object} viewConfig - Configuração da visão ({ coverProperty, visibleProperties|properties, cardSize })
 * @param {Object} callbacks - { onOpenNote, onAddNote, onUpdateView }
 */
export function renderBaseGalleryView(container, notes, schema, viewConfig = {}, callbacks = {}) {
  container.innerHTML = '';
  container.className = 'base-view-container base-gallery-container';

  const cardSize = SIZES.some(s => s.id === viewConfig.cardSize) ? viewConfig.cardSize : 'medium';
  const coverProp = viewConfig.coverProperty || 'cover';
  const visibleProps = propriedadesVisiveis(viewConfig, coverProp);

  // Barra: quantidade + tamanho dos cartões (guardado na visão, vira YAML da Base)
  const bar = document.createElement('div');
  bar.className = 'base-gallery-toolbar';
  const contagem = document.createElement('span');
  contagem.className = 'base-gallery-count';
  contagem.textContent = `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}`;
  bar.appendChild(contagem);

  if (callbacks.onUpdateView) {
    const grupo = document.createElement('div');
    grupo.className = 'base-gallery-sizes';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', 'Tamanho dos cartões');
    for (const s of SIZES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'base-gallery-size-btn' + (s.id === cardSize ? ' is-active' : '');
      b.title = `Cartões ${s.label.toLowerCase()}s`;
      b.setAttribute('aria-pressed', String(s.id === cardSize));
      b.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${s.icon}</span>`;
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (s.id !== cardSize) callbacks.onUpdateView({ cardSize: s.id });
      });
      grupo.appendChild(b);
    }
    bar.appendChild(grupo);
  }
  container.appendChild(bar);

  const previewConteudo = viewConfig.card?.preview === 'content';
  const lazy = previewConteudo
    ? lazyHydrate(card => hydrateNoteContent(card.querySelector('.base-gallery-preview-body'), card._noteId))
    : { observe() {}, disconnect() {} };
  container._galleryCleanup?.();
  container._galleryCleanup = () => lazy.disconnect();
  const gridHost = document.createElement('div');
  const aspect = ['1/1', '4/3', '16/9', '3/4'].includes(viewConfig.card?.aspect) ? viewConfig.card.aspect : null;
  if (aspect) gridHost.style.setProperty('--gallery-aspect', aspect.replace('/', ' / '));
  gridHost.classList.toggle('fit-contain', viewConfig.card?.fit === 'contain');

  const desenhaCartoes = (grid, lista, ultimo) => lista.forEach(note => {
    const card = document.createElement('div');
    card.className = 'base-gallery-card';
    card.dataset.noteId = note.id;
    const tom = callbacks.rowTone?.(note);
    if (tom) card.classList.add(`tone-${tom}`);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    if (previewConteudo) {
      // prévia do conteúdo da nota no lugar da capa (carrega quando o cartão chega perto da tela)
      const prev = document.createElement('div');
      prev.className = 'base-gallery-cover base-gallery-preview';
      const corpoPrev = document.createElement('div');
      corpoPrev.className = 'bfeed-body base-gallery-preview-body';
      prev.appendChild(corpoPrev);
      card._noteId = note.id;
      card.appendChild(prev);
      lazy.observe(card);
    } else {
      card.appendChild(buildCover(note, coverProp));
    }

    const bodyEl = document.createElement('div');
    bodyEl.className = 'base-gallery-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'base-gallery-title';
    titleEl.textContent = note.title || 'Sem título';
    titleEl.title = note.title || 'Sem título';
    bodyEl.appendChild(titleEl);

    const propsEl = document.createElement('div');
    propsEl.className = 'base-gallery-props';
    visibleProps.forEach(propName => {
      // schema é um mapa chave -> definição (ver inferBaseSchema); aceita também a forma em lista
      const propDef = schema?.[propName] || schema?.properties?.find?.(p => p.name === propName) || { name: propName, type: 'text' };
      const rawVal = getNotePropertyValue(note, propName);
      if (rawVal == null || rawVal === '' || (Array.isArray(rawVal) && rawVal.length === 0)) return;

      const propRow = document.createElement('div');
      propRow.className = 'base-gallery-prop-row';

      const label = document.createElement('span');
      label.className = 'base-gallery-prop-name';
      label.textContent = propDef.label || propDef.name || propName;

      const valEl = document.createElement('span');
      valEl.className = 'base-gallery-prop-value';
      if (propDef.type === 'select') {
        valEl.innerHTML = formatSelectBadge(rawVal, propDef.options);
      } else if (propDef.type === 'checkbox') {
        valEl.textContent = rawVal ? '✓ Sim' : '—';
      } else {
        valEl.textContent = formatPropertyValue(rawVal, propDef.type);
      }

      propRow.append(label, valEl);
      propsEl.appendChild(propRow);
    });
    if (propsEl.children.length) bodyEl.appendChild(propsEl);

    card.appendChild(bodyEl);

    const abrir = e => {
      e.stopPropagation();
      callbacks.onOpenNote?.(note.id);
    };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } });

    grid.appendChild(card);
  });

  const montaGrade = (box, lista, escopo) => {
    const grid = document.createElement('div');
    grid.className = `base-gallery-grid base-gallery-${cardSize}`;
    desenhaCartoes(grid, lista);
    box.appendChild(grid);
    enableReorder(grid, { itemSelector: '.base-gallery-card[data-note-id]', scope: escopo, view: viewConfig, onViewChange: callbacks.onUpdateView, grid: true });
  };
  renderGrouped(gridHost, { notes, schema, view: viewConfig }, montaGrade, callbacks.onUpdateView);
  container.appendChild(gridHost);

  // "+ Adicionar nota"
  const addCard = document.createElement('div');
  addCard.className = 'base-gallery-card base-gallery-add-card';
  addCard.tabIndex = 0;
  addCard.setAttribute('role', 'button');
  addCard.innerHTML = `
    <div class="base-gallery-add-inner">
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">add</span>
      <span>Adicionar nota</span>
    </div>
  `;
  const adicionar = () => callbacks.onAddNote?.();
  addCard.addEventListener('click', adicionar);
  addCard.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); adicionar(); } });
  const rodape = document.createElement('div');
  rodape.className = `base-gallery-grid base-gallery-${cardSize}`;
  rodape.appendChild(addCard);
  container.appendChild(rodape);
}
