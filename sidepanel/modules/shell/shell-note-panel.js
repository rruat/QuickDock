// ── shell-note-panel.js ─────────────────────────────────────────────────────
// Painel da NOTA na aside direita (padrão do mockup): as propriedades da nota e o sumário /
// backlinks saem de dentro do editor e passam a morar na aside. Em vez de recriar esses
// painéis, os próprios elementos (com todos os seus botões e ouvintes, que os acham por id)
// são MOVIDOS para a aside enquanto a nota está em foco e voltam ao lugar ao sair.

const PANEL_IDS = ['note-properties-bar', 'note-outline-sidebar'];
const origins = new Map(); // id → { parent, next }

/** Move as propriedades e o sumário/backlinks da nota para dentro de `host`. */
export function showNotePanel(host) {
  for (const id of PANEL_IDS) {
    const el = document.getElementById(id);
    if (!el || el.parentElement === host) continue;
    if (!origins.has(id)) origins.set(id, { parent: el.parentElement, next: el.nextSibling });
    host.appendChild(el);
  }
  ensureActions(host);
  host.classList.add('has-note-panel');
  document.getElementById('section-note')?.classList.add('outline-in-aside'); // some o botão flutuante do sumário
}

// Menu de ações da nota (abaixo das propriedades e do sumário): hoje, excluir
function ensureActions(host) {
  let box = host.querySelector('[data-note-actions]');
  if (!box) {
    box = document.createElement('div');
    box.className = 'aside-panel-group';
    box.dataset.noteActions = '';
    box.innerHTML = `<h4>Ações</h4>
      <button type="button" class="aside-panel-btn is-danger" data-note-delete><span class="material-symbols-rounded">delete</span> Excluir nota</button>`;
    box.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-note-delete]')) return;
      const { deleteNoteById, getActiveId } = await import('../notes-tabs.js'); // só quando precisa (o módulo mexe no DOM ao carregar)
      const id = getActiveId();
      if (id != null && await deleteNoteById(id)) {
        // a nota aberta sumiu: volta às views (ou segue na próxima aba, se houver)
        if (getActiveId() == null) document.dispatchEvent(new CustomEvent('quickdock:open-view', { detail: { view: 'bases' } }));
      }
    });
  }
  host.appendChild(box); // sempre por último, depois de propriedades e sumário
}

/** Devolve cada painel ao lugar de origem dentro do editor. */
export function hideNotePanel(host) {
  for (const id of [...PANEL_IDS].reverse()) {
    const o = origins.get(id);
    const el = document.getElementById(id);
    if (!o || !el) continue;
    if (o.next && o.next.parentNode === o.parent) o.parent.insertBefore(el, o.next);
    else o.parent.appendChild(el);
    origins.delete(id);
  }
  host?.querySelector('[data-note-actions]')?.remove();
  host?.classList.remove('has-note-panel');
  document.getElementById('section-note')?.classList.remove('outline-in-aside');
}
