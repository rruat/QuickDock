// ── calendar-view.js ───────────────────────────────────────────────────────
// Visualização em Calendário nativo para as notas do QuickDock.
// Zero frameworks, zero dependências externas.
// Permite visualizar notas distribuídas por data (campo `data` nas propriedades),
// filtrar por categoria, navegar entre meses e criar notas diretamente em qualquer dia.

import { loadAllNotesMeta, createNoteRecord, getNoteById, updateNoteMetaById } from './storage.js';
import { switchView, goBack } from './views.js';
import { escHtml } from './blocks.js';
import { isDesktopMode } from './platform.js';
import { toggleDesktopPanel } from './desktop-panels.js';

import {
  MESES,
  normalizarDataString,
  extrairDataDaNota,
  extrairIntervaloDaNota,
  formatarMesAno,
  gerarMatrizCalendario,
  gerarMatrizSemana
} from './calendar/calendar-engine.js';

export {
  MESES,
  normalizarDataString,
  extrairDataDaNota,
  extrairIntervaloDaNota,
  formatarMesAno,
  gerarMatrizCalendario,
  gerarMatrizSemana
};

import { renderMonthGrid } from './calendar/calendar-month-view.js';
import { renderWeekView } from './calendar/calendar-week-view.js';
import { renderAgendaView } from './calendar/calendar-agenda-view.js';
import { setupCalendarDropTargets } from './calendar/calendar-dnd.js';
import { renderCalendarInbox, filtrarNotasSemData } from './calendar/calendar-inbox.js';
import { extrairDataCriacaoNota } from './calendar/calendar-engine.js';

export {
  extrairDataCriacaoNota,
  filtrarNotasSemData
};

let anoAtual = new Date().getFullYear();
let mesAtual = new Date().getMonth(); // 0 a 11
let diaAtual = new Date().getDate();
let modoVisualizacao = 'month'; // 'month' | 'week' | 'agenda'
let fonteTemporal = 'auto'; // 'auto' (padrão: agendamento com fallback para criação) | 'schedule' | 'created'
let categoriaSelecionada = '';

let containerEl = null;
let gridEl = null;
let monthYearEl = null;
let noteCountEl = null;
let categorySelectEl = null;
let sourceSelectEl = null;
let inboxToggleBtn = null;
let inboxDrawerEl = null;

/**
 * Extrai a categoria da nota.
 */
export function extrairCategoriaDaNota(nota) {
  if (!nota) return '';
  const props = nota.properties || {};
  const cat = props.categoria ?? props.category ?? props.tag ?? '';
  return typeof cat === 'string' ? cat.trim() : '';
}

// ── Inicialização da Interface ─────────────────────────────────────────────────

export function initCalendarView() {
  containerEl = document.getElementById('calendar-view');
  gridEl = document.getElementById('calendar-grid');
  monthYearEl = document.getElementById('calendar-month-year');
  noteCountEl = document.getElementById('calendar-note-count');
  categorySelectEl = document.getElementById('calendar-filter-category');
  sourceSelectEl = document.getElementById('calendar-filter-source');
  inboxToggleBtn = document.getElementById('btn-calendar-inbox-toggle');
  inboxDrawerEl = document.getElementById('calendar-inbox-drawer');

  if (!containerEl) return;

  if (sourceSelectEl) {
    sourceSelectEl.value = fonteTemporal;
  }

  // Filtro de fonte temporal (agendamento vs criação vs híbrido)
  sourceSelectEl?.addEventListener('change', e => {
    fonteTemporal = e.target.value || 'auto';
    carregarERenderizarCalendario();
  });

  // Alternador da gaveta do Backlog / Inbox
  inboxToggleBtn?.addEventListener('click', () => {
    if (!inboxDrawerEl) return;
    const estavaOculto = inboxDrawerEl.hidden;
    inboxDrawerEl.hidden = !estavaOculto;
    inboxToggleBtn.classList.toggle('is-active', estavaOculto);
    if (estavaOculto) {
      atualizarInboxDrawer();
    }
  });

  // Botões de navegação
  document.getElementById('btn-calendar-back')?.addEventListener('click', () => {
    if (isDesktopMode()) toggleDesktopPanel('calendar');
    else goBack();
  });

  document.getElementById('btn-calendar-prev')?.addEventListener('click', () => {
    if (modoVisualizacao === 'week') {
      diaAtual -= 7;
      const ref = new Date(anoAtual, mesAtual, diaAtual);
      anoAtual = ref.getFullYear();
      mesAtual = ref.getMonth();
      diaAtual = ref.getDate();
    } else {
      mesAtual--;
      if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
      }
    }
    carregarERenderizarCalendario();
  });

  document.getElementById('btn-calendar-next')?.addEventListener('click', () => {
    if (modoVisualizacao === 'week') {
      diaAtual += 7;
      const ref = new Date(anoAtual, mesAtual, diaAtual);
      anoAtual = ref.getFullYear();
      mesAtual = ref.getMonth();
      diaAtual = ref.getDate();
    } else {
      mesAtual++;
      if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
      }
    }
    carregarERenderizarCalendario();
  });

  document.getElementById('btn-calendar-today')?.addEventListener('click', () => {
    const agora = new Date();
    anoAtual = agora.getFullYear();
    mesAtual = agora.getMonth();
    diaAtual = agora.getDate();
    carregarERenderizarCalendario();
  });

  // Seletor de Modo (Mês, Semana, Agenda)
  const modeBtns = document.querySelectorAll('#calendar-mode-switcher .cal-mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode && mode !== modoVisualizacao) {
        modoVisualizacao = mode;
        modeBtns.forEach(b => b.classList.toggle('is-active', b === btn));
        carregarERenderizarCalendario();
      }
    });
  });

  // Filtro de categoria
  categorySelectEl?.addEventListener('change', e => {
    categoriaSelecionada = e.target.value;
    carregarERenderizarCalendario();
  });

  // Criar nova nota com data de hoje
  document.getElementById('btn-calendar-new-note')?.addEventListener('click', () => {
    const hoje = new Date();
    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    criarENavegarNotaPorData(dataHoje);
  });

  // Botão na barra lateral
  document.getElementById('btn-nav-calendar')?.addEventListener('click', () => {
    switchView('calendar');
  });

  // Eventos de atualização
  document.addEventListener('quickdock:refresh-calendar-view', () => {
    carregarERenderizarCalendario();
  });

  document.addEventListener('quickdock:note-properties-updated', () => {
    if (containerEl && !containerEl.hidden) {
      carregarERenderizarCalendario();
    }
  });

  document.addEventListener('quickdock:view-changed', e => {
    if (e.detail?.view === 'calendar') {
      carregarERenderizarCalendario();
    }
  });
}

/**
 * Cria uma nova nota já associada a uma data específica e a abre imediatamente no editor.
 */
export async function criarENavegarNotaPorData(dataStr, categoria = '') {
  try {
    const props = { data: dataStr };
    if (categoria) props.categoria = categoria;

    const dataFormatadaAmigavel = dataStr.split('-').reverse().join('/');
    const id = await createNoteRecord({
      title: `Nota de ${dataFormatadaAmigavel}`,
      content: '',
      blocks: [{ id: `b_${Date.now()}`, type: 'paragraph', html: '' }],
      properties: props,
    });

    document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
      detail: { id }
    }));
    if (!isDesktopMode()) switchView('editor');
  } catch (err) {
    console.error('Falha ao criar nota no calendário:', err);
  }
}

/**
 * Carrega as notas do armazenamento e atualiza toda a exibição do calendário.
 */
export async function carregarERenderizarCalendario() {
  if (!containerEl || !gridEl) return;

  const todasNotas = await loadAllNotesMeta();

  const matriz = gerarMatrizCalendario(anoAtual, mesAtual);
  const diasDoMesSet = new Set(matriz.filter(c => !c.outroMes).map(c => c.dataFormatada));

  const categoriasSet = new Set();
  const notasPorData = new Map(); // dataString -> Array<nota>
  const eventosMultiDia = [];
  const itensAgendados = [];
  let notasComDataContador = 0;

  for (const nota of todasNotas) {
    const data = extrairDataDaNota(nota, fonteTemporal);
    const cat = extrairCategoriaDaNota(nota);
    if (cat) categoriasSet.add(cat);

    if (categoriaSelecionada && cat !== categoriaSelecionada) {
      continue;
    }

    const intervalo = extrairIntervaloDaNota(nota);
    if (intervalo && intervalo.start && intervalo.end && intervalo.start !== intervalo.end) {
      eventosMultiDia.push({ note: nota, start: intervalo.start, end: intervalo.end });
      for (const celula of matriz) {
        if (celula.dataFormatada >= intervalo.start && celula.dataFormatada <= intervalo.end) {
          if (!notasPorData.has(celula.dataFormatada)) notasPorData.set(celula.dataFormatada, []);
          notasPorData.get(celula.dataFormatada).push(nota);
        }
      }
      if (matriz.some(c => !c.outroMes && c.dataFormatada >= intervalo.start && c.dataFormatada <= intervalo.end)) {
        notasComDataContador++;
      }
      itensAgendados.push({ note: nota, date: intervalo.start, formattedDate: intervalo.start });
    } else if (data) {
      if (!notasPorData.has(data)) {
        notasPorData.set(data, []);
      }
      notasPorData.get(data).push(nota);
      if (diasDoMesSet.has(data)) {
        notasComDataContador++;
      }
      itensAgendados.push({ note: nota, date: data, formattedDate: data });
    }
  }

  // Atualiza o dropdown de categorias
  if (categorySelectEl) {
    const categoriasOrdenadas = Array.from(categoriasSet).sort((a, b) => a.localeCompare(b));
    const valorAtual = categoriaSelecionada;
    let htmlCat = '<option value="">Todas as categorias</option>';
    for (const c of categoriasOrdenadas) {
      const sel = c === valorAtual ? ' selected' : '';
      htmlCat += `<option value="${escHtml(c)}"${sel}>${escHtml(c)}</option>`;
    }
    categorySelectEl.innerHTML = htmlCat;
  }

  // Atualiza cabeçalho
  if (monthYearEl) {
    if (modoVisualizacao === 'week') {
      const semana = gerarMatrizSemana(anoAtual, mesAtual, diaAtual);
      const prim = semana[0];
      const ult = semana[6];
      monthYearEl.textContent = `${prim.dia} ${MESES[prim.mes].slice(0, 3)} - ${ult.dia} ${MESES[ult.mes].slice(0, 3)} de ${ult.ano}`;
    } else if (modoVisualizacao === 'agenda') {
      monthYearEl.textContent = 'Agenda de Notas';
    } else {
      monthYearEl.textContent = formatarMesAno(anoAtual, mesAtual);
    }
  }
  if (noteCountEl) {
    noteCountEl.textContent = `${notasComDataContador} ${notasComDataContador === 1 ? 'nota' : 'notas'}`;
  }

  const callbacks = {
    onOpenNote: (nota) => {
      document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
        detail: { id: nota.id, uid: nota.uid }
      }));
      if (!isDesktopMode()) switchView('editor');
    },
    onAddNote: (dataStr) => {
      criarENavegarNotaPorData(dataStr, categoriaSelecionada);
    }
  };

  // Alterna visibilidade dos cabeçalhos dos dias da semana (apenas no modo Mês)
  const weekdaysEl = containerEl?.querySelector('.calendar-weekdays');
  if (weekdaysEl) {
    weekdaysEl.style.display = (modoVisualizacao === 'month') ? 'grid' : 'none';
  }

  // Renderiza conforme o modo ativo
  if (modoVisualizacao === 'week') {
    renderWeekView(gridEl, anoAtual, mesAtual, diaAtual, notasPorData, eventosMultiDia, callbacks);
  } else if (modoVisualizacao === 'agenda') {
    renderAgendaView(gridEl, itensAgendados, new Date(anoAtual, mesAtual, diaAtual), callbacks);
  } else {
    renderMonthGrid(gridEl, matriz, notasPorData, eventosMultiDia, callbacks);
  }

  // Ativa Drag and Drop nas células renderizadas
  setupCalendarDropTargets(gridEl);

  // Se a gaveta de Backlog/Inbox estiver visível, atualiza o conteúdo
  if (inboxDrawerEl && !inboxDrawerEl.hidden) {
    atualizarInboxDrawerComNotas(todasNotas);
  }
}

/**
 * Atualiza o painel do Inbox / Backlog temporal com todas as notas.
 */
export async function atualizarInboxDrawer() {
  if (!inboxDrawerEl) return;
  const todasNotas = await loadAllNotesMeta();
  atualizarInboxDrawerComNotas(todasNotas);
}

function atualizarInboxDrawerComNotas(todasNotas) {
  if (!inboxDrawerEl) return;
  renderCalendarInbox(inboxDrawerEl, todasNotas, {
    onOpenNote: (nota) => {
      document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
        detail: { id: nota.id, uid: nota.uid }
      }));
      if (!isDesktopMode()) switchView('editor');
    },
    onAgendarNota: async (nota, dataStr) => {
      try {
        const idNota = nota.id || nota.uid;
        const notaCompleta = await getNoteById(idNota);
        const props = { ...((notaCompleta && notaCompleta.properties) || nota.properties || {}) };
        props.data = dataStr;
        delete props.daterange;
        await updateNoteMetaById(idNota, { properties: props });
        document.dispatchEvent(new CustomEvent('quickdock:refresh-calendar-view'));
      } catch (err) {
        console.error('Falha ao agendar nota do inbox:', err);
      }
    }
  });
}

