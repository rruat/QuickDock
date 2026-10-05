// Barra de Propriedades da Nota (QuickDock Modular Sections):
// Cada propriedade é uma seção independente (.section), sem bordas quando fechada,
// com bordas apenas quando aberta, sem setas, e com menu de configurações
// que expande inline (.section-body) sem menus flutuantes.

import { getNoteById, updateNoteMetaById } from './storage.js';
import { PROPERTY_TYPES, inferirTipoPropriedade, migrarPropriedadeParaTipo } from './property-types.js';
import { getCurrentNoteId } from './note.js';
import { openLocationPopover } from './reminders/location-popover.js';
import { openReminderPopover } from './reminders/reminder-popover.js';
import { openNoteSection } from './reminders/note-expandable-section.js';

const propertiesBarEl       = document.getElementById('note-properties-bar');
const propertiesToggleBtn   = document.getElementById('btn-properties-toggle');
const propertiesCountEl     = document.getElementById('note-properties-count');
const propertiesSuggestedEl = document.getElementById('note-properties-suggested');
const propertiesListEl      = document.getElementById('note-properties-list');
const btnAddProperty        = document.getElementById('btn-add-property');

export const PROPRIEDADES_SUGERIDAS = [
  { tipo: 'reminder',  nome: 'Lembrete',    icon: 'alarm',           label: 'Lembrete' },
  { tipo: 'location',  nome: 'Localização', icon: 'location_on',     label: 'Localização' },
  { tipo: 'date',      nome: 'Data',        icon: 'calendar_today',  label: 'Data' },
  { tipo: 'datetime',  nome: 'Horário',     icon: 'schedule',        label: 'Horário' },
  { tipo: 'list',      nome: 'Tags',        icon: 'label',           label: 'Tags' },
  { tipo: 'select',    nome: 'Status',      icon: 'flag',            label: 'Status' },
  { tipo: 'checkbox',  nome: 'Concluído',   icon: 'check_box',       label: 'Concluído' },
  { tipo: 'text',      nome: 'Texto',       icon: 'notes',           label: 'Texto' },
  { tipo: 'number',    nome: 'Número',      icon: 'tag',             label: 'Número' }
];

const SELECT_OPCOES_PADRAO = ['A Fazer', 'Em Andamento', 'Concluído', 'Pausado'];

const VALOR_PADRAO_POR_TIPO = {
  text: '',
  list: [],
  number: '',
  checkbox: false,
  date: '',
  datetime: '',
  daterange: { start: '', end: '', allDay: true },
  location: { name: '', radius: 150 },
  reminder: { active: true, intervalMinutes: 5 },
  select: ''
};

const NOMES_PADRAO_POR_TIPO = {
  reminder: 'Lembrete',
  location: 'Localização',
  date: 'Data',
  datetime: 'Horário',
  daterange: 'Período',
  text: 'Texto',
  number: 'Número',
  checkbox: 'Concluído',
  list: 'Tags',
  select: 'Status'
};

// Guarda o conjunto de chaves de propriedades que estão abertas (.is-open)
// para preservar o estado de expansão durante re-renderizações e edições
const openPropertyKeys = new Set();

let activePropertiesMenu = null;
function closePropertiesMenu() {
  if (activePropertiesMenu) {
    activePropertiesMenu.remove();
    activePropertiesMenu = null;
  }
}

// Mantido para compatibilidade com chamadas externas e testes
export function abrirMenuDeTipo(anchor = null, tipoAtual = '', onEscolher = null) {
  closePropertiesMenu();
  if (typeof onEscolher === 'function') {
    onEscolher(tipoAtual || 'text');
  }
}

// Constrói o campo de valor apropriado ao tipo (text/number/checkbox/date/list/select).
// `salvar(chave, novoValor, extra)` é o único ponto de gravação.
function renderPropertyValue(tipo, chave, valor, opcoes, salvar) {
  let el;
  switch (tipo) {
    case 'date': {
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'property-input property-input-date';
      input.value = typeof valor === 'string' ? valor.slice(0, 10) : '';
      input.addEventListener('change', e => salvar(chave, e.target.value));
      el = input;
      break;
    }
    case 'number': {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'property-input property-input-number';
      input.value = typeof valor === 'number' && Number.isFinite(valor) ? valor : '';
      input.placeholder = '0';
      input.addEventListener('change', e => salvar(chave, e.target.value === '' ? 0 : parseFloat(e.target.value)));
      el = input;
      break;
    }
    case 'checkbox': {
      const label = document.createElement('label');
      label.className = 'property-checkbox-wrap';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!valor;
      input.addEventListener('change', e => salvar(chave, e.target.checked));
      label.appendChild(input);
      el = label;
      break;
    }
    case 'datetime':
      el = renderPropertyDateTime(chave, valor, salvar);
      break;
    case 'daterange':
      el = renderPropertyDateRange(chave, valor, salvar);
      break;
    case 'location':
      el = renderPropertyLocation(chave, valor, salvar);
      break;
    case 'reminder':
      el = renderPropertyReminder(chave, valor, salvar);
      break;
    case 'list':
      el = renderPropertyList(chave, Array.isArray(valor) ? valor : [], salvar);
      break;
    case 'select':
      el = renderPropertySelect(chave, valor, Array.isArray(opcoes) && opcoes.length ? opcoes : SELECT_OPCOES_PADRAO, salvar);
      break;
    default: {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'property-input property-input-text';
      input.value = valor == null ? '' : String(valor);
      input.placeholder = 'Vazio';
      input.addEventListener('change', e => salvar(chave, e.target.value.trim()));
      el = input;
      break;
    }
  }

  el.addEventListener('click', e => e.stopPropagation());
  el.addEventListener('pointerdown', e => e.stopPropagation());
  return el;
}

function renderPropertyDateTime(chave, valor, salvar) {
  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.className = 'property-input property-input-datetime';
  input.value = typeof valor === 'string' ? valor.slice(0, 16) : '';
  input.addEventListener('change', e => salvar(chave, e.target.value));
  return input;
}

function renderPropertyDateRange(chave, valor, salvar) {
  const wrap = document.createElement('div');
  wrap.className = 'property-daterange-wrap';
  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.className = 'property-input property-input-date';
  startInput.value = (valor && valor.start) ? valor.start.slice(0, 10) : '';

  const sep = document.createElement('span');
  sep.className = 'property-daterange-sep';
  sep.textContent = '→';

  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.className = 'property-input property-input-date';
  endInput.value = (valor && valor.end) ? valor.end.slice(0, 10) : '';

  const commit = () => {
    salvar(chave, {
      start: startInput.value,
      end: endInput.value || startInput.value,
      allDay: true
    });
  };
  startInput.addEventListener('change', commit);
  endInput.addEventListener('change', commit);

  wrap.append(startInput, sep, endInput);
  return wrap;
}

function renderPropertyLocation(chave, valor, salvar) {
  const wrap = document.createElement('div');
  wrap.className = 'property-location-wrap';
  const valObj = (valor && typeof valor === 'object') ? valor : { name: String(valor || ''), radius: 150 };

  const hasLocation = Boolean(valObj.lat != null || (valObj.name && valObj.name.trim() !== ''));

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `property-location-chip ${hasLocation ? 'has-location' : 'is-empty'}`;
  chip.title = hasLocation
    ? `${valObj.name || 'Local marcado'} — Clique para abrir no mapa`
    : 'Clique para definir localização no mapa';

  if (hasLocation) {
    const icon = document.createElement('span');
    icon.className = 'chip-icon qd-icon material-symbols-rounded';
    icon.textContent = 'location_on';

    const label = document.createElement('span');
    label.className = 'chip-location-name';
    label.textContent = valObj.name || (valObj.lat ? `${valObj.lat.toFixed(4)}, ${valObj.lng.toFixed(4)}` : 'Local marcado');

    const radiusTag = document.createElement('span');
    radiusTag.className = 'chip-location-radius';
    radiusTag.textContent = `${valObj.radius || 150}m`;

    const clearBtn = document.createElement('span');
    clearBtn.className = 'chip-location-clear qd-icon material-symbols-rounded';
    clearBtn.textContent = 'close';
    clearBtn.title = 'Remover localização';
    clearBtn.setAttribute('role', 'button');
    clearBtn.setAttribute('tabindex', '0');

    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      salvar(chave, { name: '', lat: null, lng: null, radius: 150 });
    });

    chip.append(icon, label, radiusTag, clearBtn);
  } else {
    const icon = document.createElement('span');
    icon.className = 'chip-icon qd-icon material-symbols-rounded';
    icon.textContent = 'add_location_alt';

    const label = document.createElement('span');
    label.className = 'chip-location-name';
    label.textContent = 'Definir local';

    chip.append(icon, label);
  }

  chip.addEventListener('click', async e => {
    e.stopPropagation();
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) return;
    const note = await getNoteById(currentNoteId);
    if (!note) return;

    openNoteSection('location', note, novaLoc => {
      if (novaLoc) {
        salvar(chave, novaLoc);
      } else if (novaLoc === null) {
        salvar(chave, { name: '', lat: null, lng: null, radius: 150 });
      }
    });
  });

  wrap.appendChild(chip);
  return wrap;
}

function renderPropertyReminder(chave, valor, salvar) {
  const wrap = document.createElement('div');
  wrap.className = 'property-reminder-wrap';
  const valObj = (valor && typeof valor === 'object') ? valor : { active: false, intervalMinutes: 5 };

  const hasReminder = Boolean(valObj.active && !valObj.completed);

  let labelTexto = 'Definir lembrete';
  if (hasReminder) {
    labelTexto = `A cada ${valObj.intervalMinutes || 5}m`;
    if (valObj.datetime) {
      const dt = new Date(valObj.datetime);
      if (!isNaN(dt.getTime())) {
        const hoje = new Date();
        const ehHoje = dt.toDateString() === hoje.toDateString();
        const amanha = new Date(hoje);
        amanha.setDate(hoje.getDate() + 1);
        const ehAmanha = dt.toDateString() === amanha.toDateString();
        const horaFmt = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (ehHoje) {
          labelTexto = `Hoje às ${horaFmt}`;
        } else if (ehAmanha) {
          labelTexto = `Amanhã às ${horaFmt}`;
        } else {
          const dataFmt = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          labelTexto = `${dataFmt} às ${horaFmt}`;
        }
      }
    }
  }

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `property-location-chip ${hasReminder ? 'has-location' : 'is-empty'}`;
  chip.title = hasReminder
    ? `Lembrete ativo: ${labelTexto} · Clique para editar`
    : 'Clique para definir data/hora e alarme persistente';

  const icon = document.createElement('span');
  icon.className = 'chip-icon qd-icon material-symbols-rounded';
  icon.textContent = hasReminder ? 'alarm' : 'notification_add';

  const label = document.createElement('span');
  label.className = 'chip-location-name';
  label.textContent = labelTexto;

  chip.append(icon, label);

  if (hasReminder) {
    const repTag = document.createElement('span');
    repTag.className = 'chip-location-radius';
    repTag.textContent = `${valObj.intervalMinutes || 5}m`;
    chip.appendChild(repTag);

    const clearBtn = document.createElement('span');
    clearBtn.className = 'chip-location-clear qd-icon material-symbols-rounded';
    clearBtn.textContent = 'close';
    clearBtn.title = 'Remover lembrete';
    clearBtn.setAttribute('role', 'button');
    clearBtn.setAttribute('tabindex', '0');
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      salvar(chave, { active: false, datetime: '', intervalMinutes: 5, completed: true });
    });
    chip.appendChild(clearBtn);
  }

  chip.addEventListener('click', async e => {
    e.stopPropagation();
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) return;
    const note = await getNoteById(currentNoteId);
    if (!note) return;
    openNoteSection('reminder', note, novoRem => {
      if (novoRem) {
        salvar(chave, novoRem);
      } else if (novoRem === null) {
        salvar(chave, { active: false, datetime: '', intervalMinutes: 5, completed: true });
      }
    });
  });

  wrap.appendChild(chip);
  return wrap;
}

function renderPropertyList(chave, itens, salvar) {
  const wrap = document.createElement('div');
  wrap.className = 'property-chip-list';
  const commit = novosItens => salvar(chave, novosItens);

  itens.forEach((item, i) => {
    const chip = document.createElement('span');
    chip.className = 'property-chip';
    const texto = document.createElement('span');
    texto.textContent = item;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'property-chip-remove';
    del.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">close</span>';
    del.addEventListener('click', e => {
      e.stopPropagation();
      commit(itens.filter((_, idx) => idx !== i));
    });
    chip.append(texto, del);
    wrap.appendChild(chip);
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'property-chip-input';
  input.placeholder = itens.length ? '' : 'Adicionar...';
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim();
      if (val && !itens.includes(val)) commit([...itens, val]);
      input.value = '';
    } else if (e.key === 'Backspace' && !input.value && itens.length) {
      commit(itens.slice(0, -1));
    }
  });
  wrap.appendChild(input);
  return wrap;
}

function renderPropertySelect(chave, valor, opcoes, salvar) {
  const select = document.createElement('select');
  select.className = 'property-select';

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = 'Selecionar...';
  select.appendChild(emptyOpt);

  for (const opt of opcoes) {
    const optionEl = document.createElement('option');
    optionEl.value = opt;
    optionEl.textContent = opt;
    if (opt === valor) optionEl.selected = true;
    select.appendChild(optionEl);
  }
  if (valor && !opcoes.includes(valor)) {
    const customOpt = document.createElement('option');
    customOpt.value = valor;
    customOpt.textContent = valor;
    customOpt.selected = true;
    select.appendChild(customOpt);
  }

  select.addEventListener('click', e => e.stopPropagation());
  select.addEventListener('change', e => {
    salvar(chave, e.target.value);
  });
  return select;
}

// Barra de sugestões desativada / limpa para um design limpo e sem poluição
export function renderSuggestedChipsBar(note) {
  const container = document.getElementById('note-properties-suggested') || propertiesSuggestedEl;
  if (!container) return;
  container.innerHTML = '';
  container.hidden = true;
}

// Renderiza a gaveta inline de opções da propriedade (.section-body)
function renderPropertyDrawer(chave, tipo, valor, opcoes, salvar, renomear, deletar) {
  const body = document.createElement('div');
  body.className = 'section-body';

  const content = document.createElement('div');
  content.className = 'section-content property-drawer-content';

  // 1. Tipo da propriedade (chips visuais)
  const typeSection = document.createElement('div');
  typeSection.className = 'property-drawer-section';
  const typeLabel = document.createElement('div');
  typeLabel.className = 'property-drawer-label';
  typeLabel.textContent = 'Tipo da propriedade';
  typeSection.appendChild(typeLabel);

  const chipsGrid = document.createElement('div');
  chipsGrid.className = 'property-type-chips-grid';

  for (const [tipoId, def] of Object.entries(PROPERTY_TYPES)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'property-type-chip' + (tipoId === tipo ? ' active' : '');
    chip.innerHTML = `
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">${def.icon}</span>
      <span>${def.label}</span>
    `;
    chip.addEventListener('click', e => {
      e.stopPropagation();
      if (tipoId !== tipo) {
        salvar(chave, migrarPropriedadeParaTipo(chave, valor, tipoId), { tipo: tipoId });
      }
    });
    chipsGrid.appendChild(chip);
  }
  typeSection.appendChild(chipsGrid);
  content.appendChild(typeSection);

  // 2. Se for select, gerenciador de opções inline
  if (tipo === 'select') {
    const selectSection = document.createElement('div');
    selectSection.className = 'property-drawer-section property-select-manager';
    const selectLabel = document.createElement('div');
    selectLabel.className = 'property-drawer-label';
    selectLabel.textContent = 'Opções disponíveis';
    selectSection.appendChild(selectLabel);

    const currentOpcoes = Array.isArray(opcoes) && opcoes.length ? opcoes : SELECT_OPCOES_PADRAO;
    const chipsList = document.createElement('div');
    chipsList.className = 'property-select-options-list';

    currentOpcoes.forEach((opt, idx) => {
      const optChip = document.createElement('span');
      optChip.className = 'property-select-option-chip';
      const optText = document.createElement('span');
      optText.textContent = opt;
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'property-select-option-delete';
      delBtn.title = 'Remover opção';
      delBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">close</span>';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        const novas = currentOpcoes.filter((_, i) => i !== idx);
        salvar(chave, valor === opt ? '' : valor, { opcoes: novas });
      });
      optChip.append(optText, delBtn);
      chipsList.appendChild(optChip);
    });
    selectSection.appendChild(chipsList);

    const addRow = document.createElement('div');
    addRow.className = 'property-select-add-row';
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.className = 'property-select-add-input';
    addInput.placeholder = '+ Nova opção...';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'property-select-add-btn';
    addBtn.textContent = 'Adicionar';

    const commitNovaOpcao = () => {
      const val = addInput.value.trim();
      if (!val || currentOpcoes.includes(val)) return;
      const novas = [...currentOpcoes, val];
      salvar(chave, valor, { opcoes: novas });
    };

    addInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commitNovaOpcao();
      }
    });
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      commitNovaOpcao();
    });

    addRow.append(addInput, addBtn);
    selectSection.appendChild(addRow);
    content.appendChild(selectSection);
  }

  // 3. Ações: Renomear e Excluir
  const actionsRow = document.createElement('div');
  actionsRow.className = 'property-drawer-actions';

  const renameWrap = document.createElement('div');
  renameWrap.className = 'property-rename-wrap';
  const renameInput = document.createElement('input');
  renameInput.type = 'text';
  renameInput.className = 'property-inline-rename-input';
  renameInput.value = chave;
  renameInput.placeholder = 'Nome da propriedade';
  const renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'property-rename-btn';
  renameBtn.textContent = 'Renomear';

  const commitRename = () => {
    const novoNome = renameInput.value.trim();
    if (novoNome && novoNome !== chave) {
      renomear(chave, novoNome);
    }
  };

  renameInput.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    }
  });
  renameInput.addEventListener('click', e => e.stopPropagation());
  renameBtn.addEventListener('click', e => {
    e.stopPropagation();
    commitRename();
  });
  renameWrap.append(renameInput, renameBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'property-drawer-delete-btn';
  deleteBtn.title = `Excluir propriedade "${chave}"`;
  deleteBtn.innerHTML = `
    <span class="qd-icon material-symbols-rounded" aria-hidden="true">delete</span>
    <span>Excluir</span>
  `;
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deletar(chave);
  });

  actionsRow.append(renameWrap, deleteBtn);
  content.appendChild(actionsRow);

  body.appendChild(content);
  return body;
}

export function renderPropertiesBar(note) {
  if (!propertiesBarEl || !propertiesListEl || !note) {
    if (propertiesBarEl) propertiesBarEl.hidden = true;
    if (propertiesSuggestedEl) {
      propertiesSuggestedEl.innerHTML = '';
      propertiesSuggestedEl.hidden = true;
    }
    return;
  }
  propertiesBarEl.hidden = false;
  propertiesListEl.hidden = false;

  const props = { ...(note.properties || {}) };
  const tipos = { ...(note.propertyTypes || {}) };
  const opcoesSelect = { ...(note.propertySelectOptions || {}) };
  const chaves = Object.keys(props);
  const total = chaves.length;

  renderSuggestedChipsBar(note);

  if (propertiesCountEl) {
    propertiesCountEl.textContent = String(total);
    propertiesCountEl.hidden = total === 0;
  }

  propertiesListEl.innerHTML = '';

  const salvar = async (chave, novoValor, extra = {}) => {
    props[chave] = novoValor;
    note.properties = { ...props };
    const patch = { properties: note.properties };
    if (extra.tipo) {
      tipos[chave] = extra.tipo;
      note.propertyTypes = { ...tipos };
      patch.propertyTypes = note.propertyTypes;
    }
    if (extra.opcoes) {
      opcoesSelect[chave] = extra.opcoes;
      note.propertySelectOptions = { ...opcoesSelect };
      patch.propertySelectOptions = note.propertySelectOptions;
    }
    await updateNoteMetaById(note.id, patch);
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    renderPropertiesBar(note);
  };

  const renomear = async (chaveAntiga, chaveNova) => {
    if (!chaveNova || chaveNova === chaveAntiga || chaveNova in props) {
      renderPropertiesBar(note);
      return;
    }
    const novasProps = {}, novosTipos = {}, novasOpcoes = {};
    for (const k of chaves) {
      const kk = k === chaveAntiga ? chaveNova : k;
      novasProps[kk] = props[k];
      if (k in tipos) novosTipos[kk] = tipos[k];
      if (k in opcoesSelect) novasOpcoes[kk] = opcoesSelect[k];
    }
    note.properties = novasProps;
    note.propertyTypes = novosTipos;
    note.propertySelectOptions = novasOpcoes;

    if (openPropertyKeys.has(chaveAntiga)) {
      openPropertyKeys.delete(chaveAntiga);
      openPropertyKeys.add(chaveNova);
    }

    await updateNoteMetaById(note.id, {
      properties: note.properties,
      propertyTypes: note.propertyTypes,
      propertySelectOptions: note.propertySelectOptions,
    });
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    renderPropertiesBar(note);
  };

  const deletar = async (chave) => {
    delete props[chave];
    delete tipos[chave];
    delete opcoesSelect[chave];
    openPropertyKeys.delete(chave);
    note.properties = { ...props };
    note.propertyTypes = { ...tipos };
    note.propertySelectOptions = { ...opcoesSelect };
    await updateNoteMetaById(note.id, {
      properties: note.properties,
      propertyTypes: note.propertyTypes,
      propertySelectOptions: note.propertySelectOptions,
    });
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    renderPropertiesBar(note);
  };

  const reordenar = async (chaveOrigem, chaveAlvo, antes) => {
    if (chaveOrigem === chaveAlvo) return;
    const resto = chaves.filter(k => k !== chaveOrigem);
    const idxAlvo = resto.indexOf(chaveAlvo);
    if (idxAlvo === -1) return;
    resto.splice(antes ? idxAlvo : idxAlvo + 1, 0, chaveOrigem);
    const novasProps = {};
    for (const k of resto) novasProps[k] = props[k];
    note.properties = novasProps;
    await updateNoteMetaById(note.id, { properties: note.properties });
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    renderPropertiesBar(note);
  };

  let propDragOrigemChave = null;
  let propDropIndicator = null;

  for (const chave of chaves) {
    const valor = props[chave];
    const tipo = inferirTipoPropriedade(chave, tipos);
    const def = PROPERTY_TYPES[tipo] || PROPERTY_TYPES.text;

    // Seção modular independente (estilo MKP/SECS.HTML)
    const section = document.createElement('div');
    section.className = 'section note-property-section note-property-row';
    section.dataset.propKey = chave;
    section.draggable = true;

    if (openPropertyKeys.has(chave)) {
      section.classList.add('is-open');
    }

    // Drag and drop reordering
    section.addEventListener('dragstart', e => {
      propDragOrigemChave = chave;
      e.dataTransfer.effectAllowed = 'move';
      section.classList.add('is-dragging');
      propDropIndicator = document.createElement('div');
      propDropIndicator.className = 'note-property-drop-indicator';
    });
    section.addEventListener('dragover', e => {
      if (propDragOrigemChave == null || propDragOrigemChave === chave || !propDropIndicator) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = section.getBoundingClientRect();
      const antes = e.clientY < rect.top + rect.height / 2;
      section[antes ? 'before' : 'after'](propDropIndicator);
    });
    section.addEventListener('drop', e => {
      e.preventDefault();
      if (propDragOrigemChave == null) return;
      const rect = section.getBoundingClientRect();
      const antes = e.clientY < rect.top + rect.height / 2;
      const origem = propDragOrigemChave;
      propDropIndicator?.remove();
      propDropIndicator = null;
      reordenar(origem, chave, antes);
    });
    section.addEventListener('dragend', () => {
      section.classList.remove('is-dragging');
      propDropIndicator?.remove();
      propDropIndicator = null;
      propDragOrigemChave = null;
    });

    // 1. Gatilho (.section-trigger): linha clicável sem setas
    const trigger = document.createElement('div');
    trigger.className = 'section-trigger note-property-trigger';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'property-drag-handle qd-icon material-symbols-rounded';
    dragHandle.textContent = 'drag_indicator';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.title = 'Arraste para reordenar';

    const typeBtn = document.createElement('button');
    typeBtn.type = 'button';
    typeBtn.className = 'property-type-btn';
    typeBtn.title = `Tipo: ${def.label}`;
    typeBtn.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${def.icon}</span>`;

    const propLabel = document.createElement('span');
    propLabel.className = 'prop-label property-name';
    propLabel.textContent = chave;
    propLabel.title = `Propriedade: ${chave} (clique para abrir opções)`;

    const valueWrap = document.createElement('div');
    valueWrap.className = 'prop-value note-property-value-wrap';
    valueWrap.appendChild(renderPropertyValue(tipo, chave, valor, opcoesSelect[chave], salvar));

    const optionsBtn = document.createElement('button');
    optionsBtn.type = 'button';
    optionsBtn.className = 'property-options-btn';
    optionsBtn.title = 'Configurações da propriedade';
    optionsBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">more_horiz</span>';

    trigger.append(dragHandle, typeBtn, propLabel, valueWrap, optionsBtn);

    // Clicar no gatilho alterna abertura da seção (se não for no editor de valor)
    trigger.addEventListener('click', e => {
      if (e.target.closest('.note-property-value-wrap')) return;
      const isOpen = section.classList.toggle('is-open');
      if (isOpen) {
        openPropertyKeys.add(chave);
      } else {
        openPropertyKeys.delete(chave);
      }
    });

    // 2. Gaveta de configurações inline (.section-body)
    const drawer = renderPropertyDrawer(chave, tipo, valor, opcoesSelect[chave], salvar, renomear, deletar);

    section.append(trigger, drawer);
    propertiesListEl.appendChild(section);
  }
}

// Adiciona uma nova propriedade inline com gaveta aberta e foco no nome
export async function iniciarNovaPropriedade(note, anchorEl = btnAddProperty) {
  if (!note) return;
  const props = note.properties || {};
  const tipos = note.propertyTypes || {};
  const nomeBase = 'Propriedade';
  let nome = nomeBase;
  let counter = 2;
  while (nome in props) {
    nome = `${nomeBase} ${counter++}`;
  }
  const defaultType = 'text';
  note.properties = { ...props, [nome]: VALOR_PADRAO_POR_TIPO[defaultType] ?? '' };
  note.propertyTypes = { ...tipos, [nome]: defaultType };
  openPropertyKeys.add(nome);

  await updateNoteMetaById(note.id, {
    properties: note.properties,
    propertyTypes: note.propertyTypes
  });

  document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
    detail: { noteId: note.id, properties: note.properties }
  }));

  renderPropertiesBar(note);

  // abrirMenuDeTipo(anchorEl, defaultType, ...) mantido para retrocompatibilidade
  if (!anchorEl && false) abrirMenuDeTipo(anchorEl);

  setTimeout(() => {
    const row = propertiesListEl?.querySelector(`[data-prop-key="${nome}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const renameInput = row.querySelector('.property-inline-rename-input');
      renameInput?.focus();
      renameInput?.select();
    }
  }, 60);
}

// Botão "+ Adicionar propriedade"
if (btnAddProperty) {
  btnAddProperty.addEventListener('click', async e => {
    e.stopPropagation();
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) return;
    const note = await getNoteById(currentNoteId);
    if (!note) return;
    iniciarNovaPropriedade(note, btnAddProperty);
  });
}

document.addEventListener('quickdock:note-properties-updated', async e => {
  const noteId = e.detail?.noteId;
  const currentNoteId = getCurrentNoteId();
  if (noteId && currentNoteId && noteId === currentNoteId) {
    const note = await getNoteById(noteId);
    if (note) renderPropertiesBar(note);
  }
});
