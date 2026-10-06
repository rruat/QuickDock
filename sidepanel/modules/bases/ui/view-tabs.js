// ── view-tabs.js ────────────────────────────────────────────────────────────
// Barra de abas de view: ícone, duplo clique renomeia, arrastar reordena, menu ⋯
// (renomear, duplicar, view padrão, bloquear, ícone, excluir) e "+" para novo tipo.
//
// api: { onSelect(id), onAdd(type), onRename(id, nome), onDuplicate(id), onDelete(id),
//        onReorder(de, para), onToggleLock(id), onSetDefault(id), onSetIcon(id) }

import { VIEW_TYPES } from '../config/view-model.js';
import { el } from './controls.js';

const icone = nome => {
  const s = el('span', 'qd-icon material-symbols-rounded base-tab-icon', nome);
  s.setAttribute('aria-hidden', 'true');
  return s;
};

function fechaMenus() { document.querySelectorAll('.base-add-view-dropdown').forEach(m => m.remove()); }

function abreMenu(ancora, itens) {
  const existente = document.querySelector('.base-add-view-dropdown');
  if (existente) { existente.remove(); if (existente._ancora === ancora) return; }
  const menu = el('div', 'base-add-view-dropdown');
  menu._ancora = ancora;
  menu.setAttribute('role', 'menu');
  for (const it of itens) {
    if (it.separador) { menu.appendChild(el('div', 'base-menu-sep')); continue; }
    const b = el('button', 'base-add-view-item' + (it.perigo ? ' is-danger' : ''), it.rotulo);
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    if (it.desabilitado) b.disabled = true;
    b.addEventListener('click', () => { menu.remove(); it.acao(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = ancora.getBoundingClientRect();
  menu.style.top = `${r.bottom + 4}px`;
  menu.style.left = `${Math.min(r.left, window.innerWidth - 200)}px`;
  const fora = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', fora, true); } };
  setTimeout(() => document.addEventListener('click', fora, true), 0);
  menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.remove(); ancora.focus(); } });
  menu.querySelector('button:not(:disabled)')?.focus();
}

function renomearInline(nomeEl, atual, onRename) {
  const inp = el('input', 'base-tab-rename');
  inp.value = atual; inp.maxLength = 60;
  inp.setAttribute('aria-label', 'Nome da view');
  nomeEl.replaceWith(inp);
  inp.focus(); inp.select();
  let feito = false;
  const fim = salvar => {
    if (feito) return; feito = true;
    if (salvar && inp.value.trim() && inp.value.trim() !== atual) onRename(inp.value.trim());
    else inp.replaceWith(nomeEl);
  };
  inp.addEventListener('blur', () => fim(true));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') fim(true);
    if (e.key === 'Escape') fim(false);
    e.stopPropagation();
  });
}

/** Desenha as abas em `host`. */
export function renderViewTabs(host, { views, activeId, defaultId }, api) {
  host.replaceChildren();
  host.setAttribute('role', 'tablist');
  let arrastando = -1;

  views.forEach((view, i) => {
    const aba = el('div', 'base-tab-btn' + (view.id === activeId ? ' is-active' : ''));
    aba.setAttribute('role', 'tab');
    aba.setAttribute('aria-selected', String(view.id === activeId));
    aba.tabIndex = 0;
    aba.draggable = true;
    aba.dataset.viewId = view.id;
    aba.appendChild(icone(view.icon || VIEW_TYPES[view.type]?.icon || 'table_chart'));
    const nome = el('span', 'base-tab-name', view.name || VIEW_TYPES[view.type]?.label || view.type);
    aba.appendChild(nome);
    if (view.locked) { const c = icone('lock'); c.classList.add('base-tab-lock'); c.title = 'View bloqueada'; aba.appendChild(c); }
    if (view.id === defaultId && views.length > 1) aba.title = 'View padrão';

    aba.addEventListener('click', e => { if (!e.target.closest('.base-tab-more')) api.onSelect(view.id); });
    aba.addEventListener('keydown', e => {
      if (e.target !== aba) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.onSelect(view.id); }
      if (e.key === 'F2') renomearInline(nome, nome.textContent, n => api.onRename(view.id, n));
    });
    nome.addEventListener('dblclick', e => {
      e.stopPropagation();
      if (!view.locked) renomearInline(nome, nome.textContent, n => api.onRename(view.id, n));
    });

    const mais = el('button', 'base-tab-more');
    mais.type = 'button'; mais.title = 'Opções da view'; mais.setAttribute('aria-label', `Opções de ${view.name}`);
    mais.appendChild(icone('more_horiz'));
    mais.addEventListener('click', e => {
      e.stopPropagation();
      abreMenu(mais, [
        { rotulo: 'Renomear', acao: () => renomearInline(host.querySelector(`[data-view-id="${view.id}"] .base-tab-name`) || nome, view.name, n => api.onRename(view.id, n)), desabilitado: view.locked },
        { rotulo: 'Trocar ícone…', acao: () => api.onSetIcon(view.id), desabilitado: view.locked },
        { rotulo: 'Duplicar', acao: () => api.onDuplicate(view.id) },
        { rotulo: view.id === defaultId ? 'É a view padrão' : 'Definir como padrão', acao: () => api.onSetDefault(view.id), desabilitado: view.id === defaultId },
        { rotulo: view.locked ? 'Desbloquear' : 'Bloquear', acao: () => api.onToggleLock(view.id) },
        { separador: true },
        { rotulo: 'Excluir', perigo: true, desabilitado: views.length <= 1 || view.locked, acao: () => api.onDelete(view.id) },
      ]);
    });
    aba.appendChild(mais);

    aba.addEventListener('dragstart', e => { arrastando = i; aba.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', view.id); });
    aba.addEventListener('dragend', () => { arrastando = -1; aba.classList.remove('is-dragging'); host.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); });
    aba.addEventListener('dragover', e => { if (arrastando >= 0) { e.preventDefault(); aba.classList.add('is-drop'); } });
    aba.addEventListener('dragleave', () => aba.classList.remove('is-drop'));
    aba.addEventListener('drop', e => { e.preventDefault(); if (arrastando >= 0 && arrastando !== i) api.onReorder(arrastando, i); });
    host.appendChild(aba);
  });

  const add = el('button', 'base-tab-btn base-tab-add', '+');
  add.type = 'button'; add.title = 'Adicionar visão'; add.setAttribute('aria-label', 'Adicionar visão');
  add.addEventListener('click', e => {
    e.stopPropagation();
    abreMenu(add, Object.entries(VIEW_TYPES).map(([type, m]) => ({ rotulo: m.label, acao: () => api.onAdd(type) })));
  });
  host.appendChild(add);
}

export { fechaMenus };
