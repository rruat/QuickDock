// ── view-settings-panel.js ──────────────────────────────────────────────────
// Painel lateral "Configurar view". Aplica cada mudança na hora (sem botão Salvar):
// o container grava a Base e re-renderiza a view; o painel é reconstruído por cima
// preservando a rolagem e as seções abertas/fechadas.
//
// api: { getView(), getSchema(), onPatch(patch), onRename(nome), onDuplicate(), onDelete(),
//        canDelete(), onClose() }

import { VIEW_TYPES } from '../config/view-model.js';
import { el, section, row } from './controls.js';
import { calendarSections } from './section-calendar.js';
import { propertiesSection } from './section-properties.js';
import { filterSection } from './section-filter.js';
import { sortSection } from './section-sort.js';
import { groupSection } from './section-group.js';

const memoria = new Set();   // seções abertas/fechadas, vive enquanto a página estiver aberta

function secaoGeral(api) {
  const view = api.getView();
  const s = section('Geral', { chave: 'geral', memoria });
  s.body.appendChild(row('Nome', id => {
    const inp = el('input', 'bset-input');
    inp.id = id; inp.type = 'text'; inp.value = view.name || '';
    inp.maxLength = 60;
    inp.addEventListener('change', () => api.onRename(inp.value.trim() || VIEW_TYPES[view.type]?.label || 'View'));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    return inp;
  }));
  const acoes = el('div', 'bset-actions');
  const dup = el('button', 'bset-btn', 'Duplicar view');
  dup.type = 'button';
  dup.addEventListener('click', () => api.onDuplicate());
  acoes.appendChild(dup);
  const del = el('button', 'bset-btn bset-btn-danger', 'Excluir view');
  del.type = 'button';
  del.disabled = !api.canDelete();
  del.title = del.disabled ? 'Uma Base precisa ter pelo menos uma view' : '';
  del.addEventListener('click', () => {
    if (del.dataset.armed === '1') api.onDelete();
    else { del.dataset.armed = '1'; del.textContent = 'Confirmar exclusão'; setTimeout(() => { del.dataset.armed = ''; del.textContent = 'Excluir view'; }, 3000); }
  });
  acoes.appendChild(del);
  s.body.appendChild(acoes);
  return s.root;
}

/** Monta (ou remonta) o painel dentro de `host`. Devolve { destroy }. */
export function mountViewSettingsPanel(host, api) {
  host.replaceChildren();
  host.classList.add('bset-panel');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', 'Configurar view');

  const view = api.getView();
  const cab = el('div', 'bset-head');
  const meta = VIEW_TYPES[view.type];
  cab.appendChild(el('h3', 'bset-title', `Configurar ${meta ? meta.label.toLowerCase() : 'view'}`));
  const fechar = el('button', 'bset-close');
  fechar.type = 'button';
  fechar.title = 'Fechar'; fechar.setAttribute('aria-label', 'Fechar painel');
  fechar.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">close</span>';
  fechar.addEventListener('click', () => api.onClose());
  cab.appendChild(fechar);
  host.appendChild(cab);

  const corpo = el('div', 'bset-body');
  host.appendChild(corpo);
  corpo.appendChild(secaoGeral(api));

  const patch = p => api.onPatch(p);
  const ctx = { view, schema: api.getSchema(), memoria, patch };
  if (view.type === 'calendar') {
    for (const s of calendarSections(ctx)) corpo.appendChild(s);
  } else {
    corpo.appendChild(propertiesSection(ctx));
    const grupo = groupSection(ctx);
    if (grupo) corpo.appendChild(grupo);
  }
  corpo.appendChild(filterSection(ctx));
  if (view.type !== 'calendar') corpo.appendChild(sortSection(ctx));

  const onKey = e => { if (e.key === 'Escape') api.onClose(); };
  host.addEventListener('keydown', onKey);
  return { destroy: () => host.removeEventListener('keydown', onKey) };
}
