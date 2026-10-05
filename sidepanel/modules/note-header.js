// Cabeçalho da nota: ícone, título editável e cor.
import { getNoteById, updateNoteMetaById } from './storage.js';
import { openAppearancePopover, toggleIconPanel, closeIconPanel } from './notes-appearance.js';
import { renderNoteCover, clearNoteCover, closeCoverMenu } from './note-cover.js';
import { hasIconImage, buildIconImageNode } from './note-icon-image.js';
import { toggleNoteSection, closeNoteSection, openNoteSection } from './reminders/note-expandable-section.js';
import { openReminderPopover, closeReminderPopoverIfOutside } from './reminders/reminder-popover.js';
import { openLocationPopover, closeLocationPopoverIfOutside } from './reminders/location-popover.js';

const headerIconBtn      = document.getElementById('btn-note-header-icon');
const headerIconEl       = document.getElementById('note-header-icon');
const headerTitleEl      = document.getElementById('note-header-title');
const headerReminderBtn  = document.getElementById('btn-note-header-reminder');
const headerLocationBtn  = document.getElementById('btn-note-header-location');
const headerBadgesEl     = document.getElementById('note-header-badges');
const mobileAppearanceBtn = document.getElementById('btn-note-appearance-mobile');

let headerTitleDebounce = null;
// A nota mostrada agora no cabeçalho — guardada à parte pra comparar o valor
// no momento de gravar, mesmo se a pessoa já tiver trocado de nota antes do
// debounce dos 500ms terminar (o timer é sempre cancelado ao trocar, ver
// switchToNote, mas fica como segunda trava).
let headerNoteRef = null;

export function renderNoteHeader(note) {
  if (headerNoteRef && note && headerNoteRef.id !== note.id) {
    closeIconPanel();
    closeCoverMenu();
  }
  headerNoteRef = note;
  if (!headerIconEl || !headerTitleEl) return;
  if (!note) return;

  // Ícone com imagem ocupa o lugar do glifo; o texto do glifo some junto.
  if (hasIconImage(note)) {
    headerIconEl.textContent = '';
    headerIconEl.appendChild(buildIconImageNode(note.iconImage, 'note-header-icon-img'));
    headerIconEl.classList.add('has-icon-image');
  } else {
    headerIconEl.classList.remove('has-icon-image');
    headerIconEl.textContent = note.icon || 'description';
  }
  headerIconEl.classList.toggle('icon-filled', !!note.iconFilled);
  headerIconEl.style.color = note.color || '';

  const labelEl = document.getElementById('note-header-icon-label');
  if (labelEl) {
    if (hasIconImage(note)) {
      labelEl.textContent = 'Ícone personalizado (imagem)';
    } else if (note.icon) {
      labelEl.textContent = `Ícone: ${note.icon}`;
    } else {
      labelEl.textContent = 'Ícone & Aparência';
    }
  }

  const hasCustomIcon = Boolean(note.icon || hasIconImage(note));
  headerIconBtn?.classList.toggle('has-custom-icon', hasCustomIcon);
  document.getElementById('note-header-icon-row')?.classList.toggle('has-custom-icon', hasCustomIcon);
  document.querySelector('.note-editor')?.classList.toggle('has-custom-icon', hasCustomIcon);

  if (mobileAppearanceBtn) {
    const iconSpan = mobileAppearanceBtn.querySelector('.qd-icon');
    if (iconSpan) {
      iconSpan.style.color = note.color || '';
    }
    mobileAppearanceBtn.hidden = hasCustomIcon;
    mobileAppearanceBtn.style.display = hasCustomIcon ? 'none' : '';
  }

  // Não sobrescreve o texto se a pessoa estiver com o cursor ali agora —
  // re-renderizar por baixo da digitação faria o cursor pular de lugar.
  if (document.activeElement !== headerTitleEl) {
    headerTitleEl.textContent = note.title || '';
  }

  renderNoteCover(note);

  // Renderiza badges de Lembrete de Foco e Localização Maps
  if (headerBadgesEl) {
    headerBadgesEl.innerHTML = '';
    const props = note.properties || {};
    const rem = props.reminder || props.lembrete;
    const loc = props.location || props.localizacao;

    if (rem && rem.active && !rem.completed) {
      const badgeRem = document.createElement('button');
      badgeRem.type = 'button';
      badgeRem.className = 'note-header-badge badge-reminder';

      let labelTexto = `A cada ${rem.intervalMinutes || 5}m`;
      if (rem.datetime) {
        const dt = new Date(rem.datetime);
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
          labelTexto += ` (${rem.intervalMinutes || 5}m)`;
        }
      }

      badgeRem.title = `Lembrete agendado: ${labelTexto} · Clique para editar`;
      badgeRem.innerHTML = `<span class="qd-icon material-symbols-rounded">alarm</span><span>${labelTexto}</span>`;
      badgeRem.addEventListener('click', e => {
        e.stopPropagation();
        toggleNoteSection('reminder', note, () => renderNoteHeader(note));
      });
      headerBadgesEl.appendChild(badgeRem);
      headerReminderBtn?.classList.add('is-active');
    } else {
      headerReminderBtn?.classList.remove('is-active');
    }

    if (loc && (loc.name || loc.lat)) {
      const badgeLoc = document.createElement('button');
      badgeLoc.type = 'button';
      badgeLoc.className = 'note-header-badge badge-location';
      badgeLoc.title = `Localização: ${loc.name || 'Ponto no Mapa'} (${loc.radius || 150}m) · Clique para expandir mapa`;
      badgeLoc.innerHTML = `<span class="qd-icon material-symbols-rounded">location_on</span><span>${loc.name || 'Local'} (${loc.radius || 150}m)</span>`;
      badgeLoc.addEventListener('click', e => {
        e.stopPropagation();
        toggleNoteSection('location', note, () => renderNoteHeader(note));
      });
      headerBadgesEl.appendChild(badgeLoc);
      headerLocationBtn?.classList.add('is-active');
    } else {
      headerLocationBtn?.classList.remove('is-active');
    }
  }
}

export function getHeaderNoteRef() { return headerNoteRef; }

// Grava agora um título pendente de gravar (debounce ainda não estourou) —
// chamado antes de trocar de nota, pra não perder a edição em silêncio.
export function flushHeaderTitle() {
  if (headerTitleDebounce) commitHeaderTitle();
}

// Reseta o cabeçalho pra estado vazio (ex.: ao fechar a última nota aberta).
export function clearNoteHeader() {
  headerNoteRef = null;
  if (headerTitleEl) headerTitleEl.textContent = '';
  if (headerIconEl) { headerIconEl.textContent = ''; headerIconEl.classList.remove('has-icon-image'); }
  const labelEl = document.getElementById('note-header-icon-label');
  if (labelEl) labelEl.textContent = 'Ícone & Aparência';
  headerIconBtn?.classList.remove('has-custom-icon', 'section-active');
  document.querySelector('.note-editor')?.classList.remove('has-custom-icon');
  if (mobileAppearanceBtn) {
    mobileAppearanceBtn.hidden = false;
    mobileAppearanceBtn.style.removeProperty('display');
    mobileAppearanceBtn.classList.remove('section-active');
  }
  if (headerBadgesEl) headerBadgesEl.innerHTML = '';
  headerReminderBtn?.classList.remove('is-active', 'section-active');
  headerLocationBtn?.classList.remove('is-active', 'section-active');
  closeNoteSection();
  closeIconPanel();
  clearNoteCover();
}

function commitHeaderTitle() {
  clearTimeout(headerTitleDebounce);
  headerTitleDebounce = null;
  if (!headerNoteRef) return;
  const val = (headerTitleEl.textContent || '').trim() || 'Sem título';
  if (val === headerNoteRef.title) return;
  updateNoteMetaById(headerNoteRef.id, { title: val });
  headerNoteRef.title = val;
  // O título editado aqui nunca passa pelo notesMeta da aside (notes-tabs.js
  // mantém seu próprio cache) — sem isto, o nome ficava desatualizado ali até
  // fechar e reabrir a nota.
  document.dispatchEvent(new CustomEvent('quickdock:note-title-committed', {
    detail: { noteId: headerNoteRef.id, title: val }
  }));
}

if (headerTitleEl) {
  headerTitleEl.addEventListener('input', () => {
    if (!headerNoteRef) return;
    const val = headerTitleEl.textContent || '';
    // Atualiza a aba na hora, só visualmente — gravar de verdade espera a
    // pausa de digitação (mesma lógica de debounce da sincronização, só que
    // bem mais curta: aqui o custo de gravar cedo demais é só desperdiçar
    // escrita no banco, não travar o editor).
    document.dispatchEvent(new CustomEvent('quickdock:note-title-preview', {
      detail: { noteId: headerNoteRef.id, title: val.trim() || 'Sem título' }
    }));
    clearTimeout(headerTitleDebounce);
    headerTitleDebounce = setTimeout(commitHeaderTitle, 500);
  });
  headerTitleEl.addEventListener('blur', commitHeaderTitle);
  headerTitleEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); headerTitleEl.blur(); }
  });
}

// Ícone, cor e aparência da nota expandem o menu de opções conectado diretamente ao elemento
headerIconBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (headerNoteRef) {
    toggleIconPanel(headerNoteRef, () => renderNoteHeader(headerNoteRef));
  }
});
mobileAppearanceBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (headerNoteRef) {
    toggleIconPanel(headerNoteRef, () => renderNoteHeader(headerNoteRef));
  }
});

// A aba (ou a aside) pode mudar título/ícone/cor desta mesma nota por fora do
// cabeçalho (menu "⋯"); precisa refletir isso mesmo quando não foi o
// cabeçalho quem disparou a troca. `headerNoteRef` é um objeto próprio deste
// módulo (vem de um getNoteById() separado do notesMeta da aside) — sem
// buscar de novo, renderNoteHeader(headerNoteRef) só repetiria os dados
// antigos, sem mudar nada na tela.
document.addEventListener('quickdock:note-appearance-updated', async e => {
  if (!headerNoteRef || e.detail?.noteId !== headerNoteRef.id) return;
  const fresh = await getNoteById(headerNoteRef.id);
  if (fresh) {
    headerNoteRef = fresh;
    renderNoteHeader(headerNoteRef);
  }
});

// Botão de Lembrete de Foco no cabeçalho da nota
headerReminderBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (headerNoteRef) {
    toggleNoteSection('reminder', headerNoteRef, () => {
      renderNoteHeader(headerNoteRef);
    });
  }
});

// Botão de Localização & Maps no cabeçalho da nota
headerLocationBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (headerNoteRef) {
    toggleNoteSection('location', headerNoteRef, () => {
      renderNoteHeader(headerNoteRef);
    });
  }
});

document.addEventListener('pointerdown', e => {
  closeReminderPopoverIfOutside(e.target);
  closeLocationPopoverIfOutside(e.target);
});

