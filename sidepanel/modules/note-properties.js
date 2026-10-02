// Barra de Propriedades da Nota (Notion / Obsidian style): renderização,
// edição, reordenar por arrastar e criação da propriedade nova.
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

let propertiesExpanded = typeof localStorage !== 'undefined'
  ? localStorage.getItem('quickdock:properties:expanded') === 'true'
  : false;

// Enquanto não tem nome confirmado (Enter), a propriedade nova é só esse
// estado — não existe em note.properties. É o que faz a linha de "nome +
// tipo" aparecer no fim da lista antes de virar propriedade de verdade.
let pendingNewProperty = null;

let activePropertiesMenu = null;

function closePropertiesMenu() {
  if (activePropertiesMenu) {
    activePropertiesMenu.remove();
    activePropertiesMenu = null;
  }
}

document.addEventListener('pointerdown', e => {
  if (activePropertiesMenu && !activePropertiesMenu.contains(e.target)
    && !e.target.closest('#btn-add-property') && !e.target.closest('.property-type-btn')) {
    closePropertiesMenu();
  }
});

if (propertiesToggleBtn && propertiesListEl) {
  propertiesToggleBtn.addEventListener('click', () => {
    propertiesExpanded = !propertiesExpanded;
    try { localStorage.setItem('quickdock:properties:expanded', String(propertiesExpanded)); } catch {}
    atualizarEstadoExpansaoPropriedades();
  });
}

function atualizarEstadoExpansaoPropriedades() {
  if (!propertiesToggleBtn || !propertiesListEl) return;
  propertiesToggleBtn.setAttribute('aria-expanded', propertiesExpanded ? 'true' : 'false');
  propertiesBarEl?.classList.toggle('is-expanded', propertiesExpanded);
  propertiesListEl.hidden = !propertiesExpanded;
  const chevron = propertiesToggleBtn.querySelector('.properties-chevron');
  if (chevron) {
    chevron.textContent = propertiesExpanded ? 'expand_more' : 'chevron_right';
  }
}

// Constrói o campo de valor apropriado ao tipo (text/number/checkbox/date/list/select).
// `salvar(chave, novoValor, extra)` é o único ponto de gravação — cada campo só
// decide QUAL valor virou, quem persiste/notifica/re-renderiza é sempre o mesmo.
function renderPropertyValue(tipo, chave, valor, opcoes, salvar) {
  switch (tipo) {
    case 'date': {
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'property-input property-input-date';
      input.value = typeof valor === 'string' ? valor.slice(0, 10) : '';
      input.addEventListener('change', e => salvar(chave, e.target.value));
      return input;
    }
    case 'number': {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'property-input property-input-number';
      input.value = typeof valor === 'number' && Number.isFinite(valor) ? valor : '';
      input.addEventListener('change', e => salvar(chave, e.target.value === '' ? 0 : parseFloat(e.target.value)));
      return input;
    }
    case 'checkbox': {
      const label = document.createElement('label');
      label.className = 'property-checkbox-wrap';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!valor;
      input.addEventListener('change', e => salvar(chave, e.target.checked));
      label.appendChild(input);
      return label;
    }
    case 'datetime':
      return renderPropertyDateTime(chave, valor, salvar);
    case 'daterange':
      return renderPropertyDateRange(chave, valor, salvar);
    case 'location':
      return renderPropertyLocation(chave, valor, salvar);
    case 'reminder':
      return renderPropertyReminder(chave, valor, salvar);
    case 'list':
      return renderPropertyList(chave, Array.isArray(valor) ? valor : [], salvar);
    case 'select':
      return renderPropertySelect(chave, valor, Array.isArray(opcoes) && opcoes.length ? opcoes : ['A Fazer', 'Em Andamento', 'Concluído', 'Pausado'], salvar);
    default: {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'property-input property-input-text';
      input.value = valor == null ? '' : String(valor);
      input.placeholder = 'Valor...';
      input.addEventListener('change', e => salvar(chave, e.target.value.trim()));
      return input;
    }
  }
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

// Lista de "chips" (tags) com input para adicionar via Enter/vírgula e Backspace
// no input vazio para remover o último — mesmo padrão de qualquer editor de tags.
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

// Select com opção "+ Nova opção..." que pede o nome e grava tanto o valor
// quanto a lista de opções atualizada (note.propertySelectOptions[chave]).
function renderPropertySelect(chave, valor, opcoes, salvar) {
  const select = document.createElement('select');
  select.className = 'property-select';
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
  const addOpt = document.createElement('option');
  addOpt.value = '__nova__';
  addOpt.textContent = '+ Nova opção...';
  select.appendChild(addOpt);

  select.addEventListener('change', e => {
    if (e.target.value === '__nova__') {
      const nome = window.prompt('Nome da nova opção:');
      select.value = valor || '';
      if (!nome || !nome.trim()) return;
      const novoNome = nome.trim();
      const novasOpcoes = opcoes.includes(novoNome) ? opcoes : [...opcoes, novoNome];
      salvar(chave, novoNome, { opcoes: novasOpcoes });
      return;
    }
    salvar(chave, e.target.value);
  });
  return select;
}

// Popover de escolha de tipo — aberto pelo ícone à esquerda de cada
// propriedade (troca o tipo de uma que já existe) e também ao criar uma nova
// (escolhe o tipo antes de dar nome). `onEscolher(tipoId)` decide o que fazer
// com a escolha em cada caso.
function abrirMenuDeTipo(anchorEl, tipoAtual, onEscolher) {
  closePropertiesMenu();
  const menu = document.createElement('div');
  menu.className = 'note-properties-popup-menu popover-menu';
  // Sem isto, o mousedown num item tira o foco de onde estava antes (ex.: o
  // input de nome da propriedade nova) e o blur cancela aquele fluxo antes
  // do click do item chegar a rodar.
  menu.addEventListener('mousedown', e => e.preventDefault());

  for (const [tipoId, def] of Object.entries(PROPERTY_TYPES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'popover-item' + (tipoId === tipoAtual ? ' active' : '');
    btn.innerHTML = `
      <span class="qd-icon material-symbols-rounded" aria-hidden="true">${def.icon}</span>
      <span>${def.label}</span>
    `;
    btn.addEventListener('click', () => {
      closePropertiesMenu();
      if (tipoId !== tipoAtual) onEscolher(tipoId);
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activePropertiesMenu = menu;
  const rect = anchorEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(8, rect.left)}px`;
  menu.style.zIndex = '99999';
}

export function renderSuggestedChipsBar(note) {
  const container = document.getElementById('note-properties-suggested') || propertiesSuggestedEl;
  if (!container) return;
  container.innerHTML = '';
  if (!note) return;

  const props = note.properties || {};
  const tipos = note.propertyTypes || {};

  const wrap = document.createElement('div');
  wrap.className = 'suggested-chips-container';

  const label = document.createElement('span');
  label.className = 'suggested-chips-label';
  label.textContent = 'Sugeridos:';
  wrap.appendChild(label);

  const chipsList = document.createElement('div');
  chipsList.className = 'suggested-chips-scroll';

  for (const sug of PROPRIEDADES_SUGERIDAS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'property-suggested-chip';
    chip.dataset.tipo = sug.tipo;

    let jaExiste = false;
    let chaveExistente = null;

    if (sug.tipo === 'reminder') {
      jaExiste = Boolean(props.reminder || props.lembrete || props['Lembrete']);
      chaveExistente = props.reminder ? 'reminder' : (props.lembrete ? 'lembrete' : (props['Lembrete'] ? 'Lembrete' : null));
    } else if (sug.tipo === 'location') {
      jaExiste = Boolean(props.location || props.localizacao || props['Localização']);
      chaveExistente = props.location ? 'location' : (props.localizacao ? 'localizacao' : (props['Localização'] ? 'Localização' : null));
    } else {
      if (sug.nome in props) {
        jaExiste = true;
        chaveExistente = sug.nome;
      } else {
        const match = Object.keys(props).find(k => tipos[k] === sug.tipo);
        if (match) {
          jaExiste = true;
          chaveExistente = match;
        }
      }
    }

    if (jaExiste) {
      chip.classList.add('is-present');
      chip.title = `Propriedade "${sug.label}" já adicionada · Clique para abrir`;
      chip.innerHTML = `
        <span class="qd-icon material-symbols-rounded chip-icon">${sug.icon}</span>
        <span class="chip-text">${sug.label}</span>
        <span class="qd-icon material-symbols-rounded chip-status-icon">check</span>
      `;
    } else {
      chip.title = `Adicionar propriedade "${sug.label}"`;
      chip.innerHTML = `
        <span class="qd-icon material-symbols-rounded chip-icon">${sug.icon}</span>
        <span class="chip-text">${sug.label}</span>
        <span class="qd-icon material-symbols-rounded chip-status-icon">add</span>
      `;
    }

    chip.addEventListener('click', async e => {
      e.stopPropagation();

      if (jaExiste) {
        if (sug.tipo === 'reminder') {
          openNoteSection('reminder', note, () => renderPropertiesBar(note));
          return;
        }
        if (sug.tipo === 'location') {
          openNoteSection('location', note, () => renderPropertiesBar(note));
          return;
        }
        propertiesExpanded = true;
        try { localStorage.setItem('quickdock:properties:expanded', 'true'); } catch {}
        renderPropertiesBar(note);

        setTimeout(() => {
          const row = propertiesListEl?.querySelector(`[data-prop-key="${chaveExistente}"]`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            row.classList.add('is-highlighted');
            setTimeout(() => row.classList.remove('is-highlighted'), 1500);
            const input = row.querySelector('input, select');
            input?.focus();
          }
        }, 50);
        return;
      }

      // Adiciona propriedade sugerida com 1 clique
      propertiesExpanded = true;
      try { localStorage.setItem('quickdock:properties:expanded', 'true'); } catch {}

      const nomeBase = sug.nome;
      let nome = nomeBase;
      let counter = 2;
      const currentProps = note.properties || {};
      while (nome in currentProps) {
        nome = `${nomeBase} ${counter++}`;
      }

      note.properties = { ...currentProps, [nome]: VALOR_PADRAO_POR_TIPO[sug.tipo] ?? '' };
      note.propertyTypes = { ...(note.propertyTypes || {}), [nome]: sug.tipo };
      if (sug.tipo === 'select') {
        note.propertySelectOptions = { ...(note.propertySelectOptions || {}), [nome]: SELECT_OPCOES_PADRAO };
      }

      await updateNoteMetaById(note.id, {
        properties: note.properties,
        propertyTypes: note.propertyTypes,
        ...(note.propertySelectOptions ? { propertySelectOptions: note.propertySelectOptions } : {})
      });

      document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
        detail: { noteId: note.id, properties: note.properties }
      }));

      renderPropertiesBar(note);

      if (sug.tipo === 'reminder') {
        openNoteSection('reminder', note, () => renderPropertiesBar(note));
      } else if (sug.tipo === 'location') {
        openNoteSection('location', note, () => renderPropertiesBar(note));
      }
    });

    chipsList.appendChild(chip);
  }

  wrap.appendChild(chipsList);
  container.appendChild(wrap);
}

export function renderPropertiesBar(note) {
  if (!propertiesBarEl || !propertiesListEl || !note) {
    if (propertiesBarEl) propertiesBarEl.hidden = true;
    if (propertiesSuggestedEl) propertiesSuggestedEl.innerHTML = '';
    return;
  }
  propertiesBarEl.hidden = false;

  const props = { ...(note.properties || {}) };
  const tipos = { ...(note.propertyTypes || {}) };
  const opcoesSelect = { ...(note.propertySelectOptions || {}) };
  const chaves = Object.keys(props);
  const total = chaves.length;

  // Renderiza a barra de chips sugeridos
  renderSuggestedChipsBar(note);

  // Nota sem nenhuma propriedade não carrega a caixa inteira por padrão — só
  // um link discreto pra criar a primeira. É o mesmo tanto faz de uma nota
  // nova no Obsidian, que não vem com a seção de Properties até alguém pedir
  // uma (digitando "---" no início da nota ou clicando aqui).
  const vazia = total === 0 && !pendingNewProperty;
  propertiesBarEl.classList.toggle('is-empty-ghost', vazia);

  if (propertiesCountEl) {
    propertiesCountEl.textContent = String(total);
    propertiesCountEl.hidden = total === 0;
  }

  atualizarEstadoExpansaoPropriedades();

  propertiesListEl.innerHTML = '';

  if (vazia) {
    const ghost = document.createElement('button');
    ghost.type = 'button';
    ghost.className = 'note-properties-ghost-add';
    ghost.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add</span><span>Adicionar propriedade personalizada</span>';
    ghost.addEventListener('click', () => iniciarNovaPropriedade(note));
    propertiesListEl.hidden = false;
    propertiesListEl.appendChild(ghost);
    return;
  }

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

  // Renomear preserva a posição: reconstrói o objeto na mesma ordem, só
  // trocando a chave, em vez de apagar e recriar no fim.
  const renomear = async (chaveAntiga, chaveNova) => {
    if (!chaveNova || chaveNova === chaveAntiga || chaveNova in props) { renderPropertiesBar(note); return; }
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

  // Arrastar reordena: tira a chave de origem do lugar antigo e a reinsere
  // antes/depois da chave alvo, preservando a ordem de todo o resto.
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
    const row = document.createElement('div');
    row.className = 'note-property-row';
    row.dataset.propKey = chave;
    row.draggable = true;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'property-drag-handle qd-icon material-symbols-rounded';
    dragHandle.textContent = 'drag_indicator';
    dragHandle.setAttribute('aria-hidden', 'true');

    row.addEventListener('dragstart', e => {
      propDragOrigemChave = chave;
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
      propDropIndicator = document.createElement('div');
      propDropIndicator.className = 'note-property-drop-indicator';
    });
    row.addEventListener('dragover', e => {
      if (propDragOrigemChave == null || propDragOrigemChave === chave || !propDropIndicator) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const antes = e.clientY < rect.top + rect.height / 2;
      row[antes ? 'before' : 'after'](propDropIndicator);
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (propDragOrigemChave == null) return;
      const rect = row.getBoundingClientRect();
      const antes = e.clientY < rect.top + rect.height / 2;
      const origem = propDragOrigemChave;
      propDropIndicator?.remove();
      propDropIndicator = null;
      reordenar(origem, chave, antes);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      propDropIndicator?.remove();
      propDropIndicator = null;
      propDragOrigemChave = null;
    });

    const typeBtn = document.createElement('button');
    typeBtn.type = 'button';
    typeBtn.className = 'property-type-btn';
    typeBtn.title = `Tipo: ${def.label}`;
    typeBtn.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${def.icon}</span>`;
    typeBtn.addEventListener('click', e => {
      e.stopPropagation();
      abrirMenuDeTipo(typeBtn, tipo, tipoId => {
        salvar(chave, migrarPropriedadeParaTipo(chave, valor, tipoId), { tipo: tipoId });
      });
    });

    const labelWrap = document.createElement('div');
    labelWrap.className = 'note-property-label-wrap';
    const nameEl = document.createElement('span');
    nameEl.className = 'property-name';
    nameEl.textContent = chave;
    nameEl.title = 'Clique para renomear';
    nameEl.addEventListener('click', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'property-name-input';
      input.value = chave;
      let resolvido = false;
      input.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); resolvido = true; renderPropertiesBar(note); }
      });
      input.addEventListener('blur', () => {
        if (resolvido) return;
        resolvido = true;
        renomear(chave, input.value.trim());
      });
      nameEl.replaceWith(input);
      input.focus();
      input.select();
    });
    labelWrap.append(typeBtn, nameEl);

    const valueWrap = document.createElement('div');
    valueWrap.className = 'note-property-value-wrap';
    valueWrap.appendChild(renderPropertyValue(tipo, chave, valor, opcoesSelect[chave], salvar));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'property-delete-btn';
    deleteBtn.title = `Remover propriedade ${chave}`;
    deleteBtn.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">close</span>';
    deleteBtn.addEventListener('click', async e => {
      e.stopPropagation();
      delete props[chave];
      delete tipos[chave];
      delete opcoesSelect[chave];
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
    });

    row.appendChild(dragHandle);
    row.appendChild(labelWrap);
    row.appendChild(valueWrap);
    row.appendChild(deleteBtn);
    propertiesListEl.appendChild(row);
  }

  if (pendingNewProperty) {
    propertiesListEl.appendChild(criarLinhaNovaPropriedade(note, props));
  }
}

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

// Abre o menu de tipos de propriedade ao clicar em "+ Propriedade"
export function iniciarNovaPropriedade(note, anchorEl = btnAddProperty) {
  propertiesExpanded = true;
  try { localStorage.setItem('quickdock:properties:expanded', 'true'); } catch {}
  renderPropertiesBar(note);

  const anchor = anchorEl || btnAddProperty || propertiesBarEl;
  if (anchor) {
    abrirMenuDeTipo(anchor, '', async (tipoId) => {
      const nomeBase = NOMES_PADRAO_POR_TIPO[tipoId] || 'Propriedade';
      let nome = nomeBase;
      let counter = 2;
      const props = note.properties || {};
      while (nome in props) {
        nome = `${nomeBase} ${counter++}`;
      }
      note.properties = { ...props, [nome]: VALOR_PADRAO_POR_TIPO[tipoId] ?? '' };
      note.propertyTypes = { ...(note.propertyTypes || {}), [nome]: tipoId };
      if (tipoId === 'select') {
        note.propertySelectOptions = { ...(note.propertySelectOptions || {}), [nome]: SELECT_OPCOES_PADRAO };
      }
      await updateNoteMetaById(note.id, {
        properties: note.properties,
        propertyTypes: note.propertyTypes,
        ...(note.propertySelectOptions ? { propertySelectOptions: note.propertySelectOptions } : {}),
      });
      document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
        detail: { noteId: note.id, properties: note.properties }
      }));
      renderPropertiesBar(note);
    });
  }
}

// Linha transitória: só vira propriedade de verdade ao confirmar (Enter com
// nome preenchido e ainda não usado). Cancela sozinha ao clicar fora vazia
// ou com Esc — do jeito que o Obsidian também desiste se você não nomear.
//
// Fechar é decidido por CLIQUE FORA (pointerdown em algo que não é a linha
// nem o popover de tipo aberto), não por blur do input: blur dispara mesmo
// quando o clique é no próprio seletor de tipo (que fica fora da linha, solto
// em document.body), e nem sempre dá tempo do preventDefault no mousedown
// segurar o foco antes do blur dessa troca correr — cancelava a linha antes
// do popover de tipo terminar de abrir. Mesmo padrão de "clique fora" que
// closePropertiesMenu já usa pro popover em si.
function criarLinhaNovaPropriedade(note, props) {
  const row = document.createElement('div');
  row.className = 'note-property-row note-property-row-new';

  const def = PROPERTY_TYPES[pendingNewProperty.tipo] || PROPERTY_TYPES.text;
  const typeBtn = document.createElement('button');
  typeBtn.type = 'button';
  typeBtn.className = 'property-type-btn';
  typeBtn.title = `Tipo: ${def.label}`;
  typeBtn.innerHTML = `<span class="qd-icon material-symbols-rounded" aria-hidden="true">${def.icon}</span>`;
  typeBtn.addEventListener('click', e => {
    e.stopPropagation();
    abrirMenuDeTipo(typeBtn, pendingNewProperty.tipo, tipoId => {
      pendingNewProperty.tipo = tipoId;
      renderPropertiesBar(note);
    });
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'property-input property-name-input-new';
  input.placeholder = 'Nome da propriedade';
  // Escolher o tipo reconstrói a linha (renderPropertiesBar de novo) — sem
  // guardar o que já foi digitado em pendingNewProperty, o nome sumia junto.
  input.value = pendingNewProperty.nome || '';
  input.addEventListener('input', () => { pendingNewProperty.nome = input.value; });

  let resolvido = false;
  const desanexar = () => document.removeEventListener('pointerdown', aoClicarFora);

  const confirmar = async () => {
    if (resolvido) return;
    resolvido = true;
    desanexar();
    const nome = input.value.trim();
    if (!nome || nome in props) {
      pendingNewProperty = null;
      renderPropertiesBar(note);
      return;
    }
    const tipo = pendingNewProperty.tipo;
    note.properties = { ...props, [nome]: VALOR_PADRAO_POR_TIPO[tipo] ?? '' };
    note.propertyTypes = { ...(note.propertyTypes || {}), [nome]: tipo };
    if (tipo === 'select') {
      note.propertySelectOptions = { ...(note.propertySelectOptions || {}), [nome]: SELECT_OPCOES_PADRAO };
    }
    pendingNewProperty = null;
    await updateNoteMetaById(note.id, {
      properties: note.properties,
      propertyTypes: note.propertyTypes,
      ...(note.propertySelectOptions ? { propertySelectOptions: note.propertySelectOptions } : {}),
    });
    document.dispatchEvent(new CustomEvent('quickdock:note-properties-updated', {
      detail: { noteId: note.id, properties: note.properties }
    }));
    renderPropertiesBar(note);
  };

  const cancelar = () => {
    if (resolvido) return;
    resolvido = true;
    desanexar();
    pendingNewProperty = null;
    renderPropertiesBar(note);
  };

  const aoClicarFora = e => {
    // A linha pode ter sumido por outro caminho — outra composição começou
    // (clicar em "+ Propriedade" de novo antes de resolver esta) ou a nota
    // trocou — sem isto o listener sobrevive à linha e o próximo clique fora
    // chama confirmar() com pendingNewProperty já nulo (de quem resolveu a
    // composição nova), estourando "Cannot read properties of null".
    if (!document.body.contains(row)) { document.removeEventListener('pointerdown', aoClicarFora); return; }
    if (row.contains(e.target) || activePropertiesMenu?.contains(e.target)) return;
    confirmar();
  };
  document.addEventListener('pointerdown', aoClicarFora);

  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
  });

  row.append(typeBtn, input);
  queueMicrotask(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  return row;
}

// Botão "+ Propriedade"
if (btnAddProperty) {
  btnAddProperty.addEventListener('click', async e => {
    e.stopPropagation();
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) return;
    const note = await getNoteById(currentNoteId);
    if (!note) return;
    closePropertiesMenu();
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

