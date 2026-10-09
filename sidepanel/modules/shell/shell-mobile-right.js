// ── shell-mobile-right.js ───────────────────────────────────────────────────
// Menu do RODAPÉ da aside direita no mobile (mesmo desenho do rodapé do drawer esquerdo): um botão de
// seleção que abre PARA CIMA e troca o que a aside mostra — Sumário e Backlinks (da nota aberta),
// Constelações, Modelos e Configurações (da view, da nota ou do quadro). Substitui os botões que
// ficavam no cabeçalho. Quem guarda o modo é shell-right-aside.js (setRightAsideMode).

import { getRightAsideMode, setRightAsideMode } from './shell-right-aside.js';
import { isMobileMode } from '../platform.js';

const FOCUS_SETTINGS = { bases: 'Configurações da view', notes: 'Propriedades da nota', board: 'Painel do quadro' };

// Opções disponíveis conforme a tela em foco (Sumário/Backlinks só existem numa nota aberta)
export function rightMenuOptions(focus) {
  const opts = [];
  if (focus === 'notes') {
    opts.push({ id: 'outline', icon: 'format_list_bulleted', label: 'Sumário', mode: 'config', tab: 'tab-sidebar-outline' });
    opts.push({ id: 'backlinks', icon: 'link', label: 'Backlinks', mode: 'config', tab: 'tab-sidebar-backlinks' });
  }
  opts.push({ id: 'graph', icon: 'hub', label: 'Constelações', mode: 'graph' });
  opts.push({ id: 'models', icon: 'auto_stories', label: 'Modelos', mode: 'models' });
  opts.push({ id: 'config', icon: 'settings', label: FOCUS_SETTINGS[focus] || 'Configurações', mode: 'config' });
  return opts;
}

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = n => `<span class="material-symbols-rounded" aria-hidden="true">${n}</span>`;

export function initMobileRightMenu() {
  const aside = document.getElementById('mRightAside');
  if (!aside || aside.querySelector('.md-bottom')) return;

  const bar = el('div', 'md-bottom');
  const btn = el('button', 'md-scope'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const menu = el('div', 'md-scope-menu mr-menu'); menu.hidden = true; menu.setAttribute('role', 'listbox');
  bar.append(btn, menu);
  aside.appendChild(bar);

  let sub = null; // 'outline' | 'backlinks' lembrado dentro do modo config da nota
  const focus = () => document.documentElement.dataset.shellFocus;

  const current = () => {
    const mode = getRightAsideMode();
    const opts = rightMenuOptions(focus());
    if (mode === 'graph') return opts.find(o => o.id === 'graph');
    if (mode === 'models') return opts.find(o => o.id === 'models');
    return (focus() === 'notes' && sub && opts.find(o => o.id === sub)) || opts.find(o => o.id === 'config');
  };

  const paint = () => {
    const cur = current();
    const opts = rightMenuOptions(focus());
    btn.innerHTML = `${icon(cur.icon)}<span class="md-scope-label">${cur.label}</span>${icon('expand_less')}`;
    menu.innerHTML = opts.map(o => `<button type="button" role="option" class="md-scope-opt${o.id === cur.id ? ' is-active' : ''}" data-id="${o.id}">${icon(o.icon)}<span>${o.label}</span>${o.id === cur.id ? icon('check') : ''}</button>`).join('');
  };
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };

  btn.addEventListener('click', (e) => { e.stopPropagation(); paint(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-id]');
    if (!opt) return;
    e.stopPropagation();
    const o = rightMenuOptions(focus()).find(x => x.id === opt.dataset.id);
    if (!o) return;
    sub = o.tab ? o.id : null;
    setRightAsideMode(o.mode);
    if (o.tab) setTimeout(() => document.getElementById(o.tab)?.click(), 0); // as abas internas do painel da nota
    close(); paint();
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !bar.contains(e.target)) close(); });
  ['quickdock:right-aside-mode', 'quickdock:shell-focus'].forEach(ev => document.addEventListener(ev, () => { if (isMobileMode()) paint(); }));
  paint();
}
