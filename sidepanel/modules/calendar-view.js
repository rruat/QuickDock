// ── calendar-view.js ───────────────────────────────────────────────────────
// Visualização em Calendário nativo para as notas do QuickDock.
// Zero frameworks, zero dependências externas.
// Permite visualizar notas distribuídas por data (campo `data` nas propriedades),
// filtrar por categoria, navegar entre meses e criar notas diretamente em qualquer dia.

import { loadAllNotesMeta, createNoteRecord, getNoteById } from './storage.js';
import { switchView, goBack } from './views.js';
import { escHtml } from './blocks.js';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

let anoAtual = new Date().getFullYear();
let mesAtual = new Date().getMonth(); // 0 a 11
let categoriaSelecionada = '';

let containerEl = null;
let gridEl = null;
let monthYearEl = null;
let noteCountEl = null;
let categorySelectEl = null;

// ── Funções Puras de Cálculo de Datas (Testáveis) ──────────────────────────────

/**
 * Normaliza qualquer valor para string YYYY-MM-DD segura.
 * Suporta string YYYY-MM-DD, timestamp numérico ou objeto Date.
 */
export function normalizarDataString(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dia}`;
    }
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dia}`;
    }
  }
  return null;
}

/**
 * Extrai a data associada a uma nota (propriedades `data`, `date`, `dueDate` ou campos diretos).
 */
export function extrairDataDaNota(nota) {
  if (!nota) return null;
  const props = nota.properties || {};
  return normalizarDataString(props.data ?? props.date ?? props.dueDate ?? nota.data ?? nota.date);
}

/**
 * Extrai a categoria da nota.
 */
export function extrairCategoriaDaNota(nota) {
  if (!nota) return '';
  const props = nota.properties || {};
  const cat = props.categoria ?? props.category ?? props.tag ?? '';
  return typeof cat === 'string' ? cat.trim() : '';
}

/**
 * Retorna o título por extenso do mês e ano.
 */
export function formatarMesAno(ano, mes) {
  const nomeMes = MESES[mes] ?? '';
  return `${nomeMes} de ${ano}`;
}

/**
 * Gera a matriz de células do calendário (dias do mês anterior, atual e posterior)
 * para exibição em uma grade de 7 colunas (Domingo a Sábado).
 */
export function gerarMatrizCalendario(ano, mes) {
  const hoje = new Date();
  const hojeString = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  const primeiroDiaDoMes = new Date(ano, mes, 1);
  const diaSemanaInicio = primeiroDiaDoMes.getDay(); // 0 = Domingo, 1 = Segunda, ...

  const totalDiasMes = new Date(ano, mes + 1, 0).getDate();
  const totalDiasMesAnterior = new Date(ano, mes, 0).getDate();

  const celulas = [];

  // 1. Dias do mês anterior para preencher a primeira semana
  for (let i = diaSemanaInicio - 1; i >= 0; i--) {
    const d = totalDiasMesAnterior - i;
    const mesAnt = mes === 0 ? 11 : mes - 1;
    const anoAnt = mes === 0 ? ano - 1 : ano;
    const dataStr = `${anoAnt}-${String(mesAnt + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celulas.push({
      ano: anoAnt,
      mes: mesAnt,
      dia: d,
      dataFormatada: dataStr,
      outroMes: true,
      ehHoje: dataStr === hojeString
    });
  }

  // 2. Dias do mês corrente
  for (let d = 1; d <= totalDiasMes; d++) {
    const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celulas.push({
      ano,
      mes,
      dia: d,
      dataFormatada: dataStr,
      outroMes: false,
      ehHoje: dataStr === hojeString
    });
  }

  // 3. Dias do mês seguinte para completar até múltiplo de 7 (35 ou 42 células)
  const resto = celulas.length % 7;
  const diasExtras = resto === 0 ? 0 : 7 - resto;
  // Garante pelo menos 35 células para estabilidade visual
  const totalAlvo = (celulas.length + diasExtras < 35) ? 35 : celulas.length + diasExtras;
  const diasAAdicionar = totalAlvo - celulas.length;

  for (let d = 1; d <= diasAAdicionar; d++) {
    const mesProx = mes === 11 ? 0 : mes + 1;
    const anoProx = mes === 11 ? ano + 1 : ano;
    const dataStr = `${anoProx}-${String(mesProx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celulas.push({
      ano: anoProx,
      mes: mesProx,
      dia: d,
      dataFormatada: dataStr,
      outroMes: true,
      ehHoje: dataStr === hojeString
    });
  }

  return celulas;
}

// ── Inicialização da Interface ─────────────────────────────────────────────────

export function initCalendarView() {
  containerEl = document.getElementById('calendar-view');
  gridEl = document.getElementById('calendar-grid');
  monthYearEl = document.getElementById('calendar-month-year');
  noteCountEl = document.getElementById('calendar-note-count');
  categorySelectEl = document.getElementById('calendar-filter-category');

  if (!containerEl) return;

  // Botões de navegação
  document.getElementById('btn-calendar-back')?.addEventListener('click', () => goBack());

  document.getElementById('btn-calendar-prev')?.addEventListener('click', () => {
    mesAtual--;
    if (mesAtual < 0) {
      mesAtual = 11;
      anoAtual--;
    }
    carregarERenderizarCalendario();
  });

  document.getElementById('btn-calendar-next')?.addEventListener('click', () => {
    mesAtual++;
    if (mesAtual > 11) {
      mesAtual = 0;
      anoAtual++;
    }
    carregarERenderizarCalendario();
  });

  document.getElementById('btn-calendar-today')?.addEventListener('click', () => {
    const agora = new Date();
    anoAtual = agora.getFullYear();
    mesAtual = agora.getMonth();
    carregarERenderizarCalendario();
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
    switchView('editor');
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

  // 1. Extrai categorias existentes para o filtro
  const categoriasSet = new Set();
  const notasPorData = new Map(); // dataString -> Array<nota>
  let notasComDataContador = 0;

  for (const nota of todasNotas) {
    const data = extrairDataDaNota(nota);
    const cat = extrairCategoriaDaNota(nota);
    if (cat) categoriasSet.add(cat);

    if (data) {
      // Aplica filtro de categoria se selecionado
      if (categoriaSelecionada && cat !== categoriaSelecionada) {
        continue;
      }
      if (!notasPorData.has(data)) {
        notasPorData.set(data, []);
      }
      notasPorData.get(data).push(nota);
      notasComDataContador++;
    }
  }

  // 2. Atualiza o dropdown de categorias
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

  // 3. Atualiza cabeçalho
  if (monthYearEl) {
    monthYearEl.textContent = formatarMesAno(anoAtual, mesAtual);
  }
  if (noteCountEl) {
    noteCountEl.textContent = `${notasComDataContador} ${notasComDataContador === 1 ? 'nota' : 'notas'}`;
  }

  // 4. Constrói a grade de células
  const matriz = gerarMatrizCalendario(anoAtual, mesAtual);
  gridEl.innerHTML = '';

  for (const celula of matriz) {
    const diaEl = document.createElement('div');
    diaEl.className = 'calendar-day'
      + (celula.outroMes ? ' calendar-day-other-month' : '')
      + (celula.ehHoje ? ' calendar-day-today' : '');
    diaEl.dataset.date = celula.dataFormatada;

    // Cabeçalho do dia (número + botão de adicionar rápido)
    const headerEl = document.createElement('div');
    headerEl.className = 'calendar-day-header';

    const numEl = document.createElement('span');
    numEl.className = 'calendar-day-number';
    numEl.textContent = String(celula.dia);

    const btnAddEl = document.createElement('button');
    btnAddEl.type = 'button';
    btnAddEl.className = 'calendar-day-add-btn';
    btnAddEl.title = `Adicionar nota em ${celula.dataFormatada}`;
    btnAddEl.innerHTML = '<span class="qd-icon material-symbols-rounded" aria-hidden="true">add</span>';
    btnAddEl.addEventListener('click', e => {
      e.stopPropagation();
      criarENavegarNotaPorData(celula.dataFormatada, categoriaSelecionada);
    });

    headerEl.appendChild(numEl);
    headerEl.appendChild(btnAddEl);
    diaEl.appendChild(headerEl);

    // Contêiner de notas do dia
    const notasDiaEl = document.createElement('div');
    notasDiaEl.className = 'calendar-day-notes';

    const notasDesteDia = notasPorData.get(celula.dataFormatada) || [];
    for (const nota of notasDesteDia) {
      const chipEl = document.createElement('div');
      chipEl.className = 'calendar-note-chip';
      chipEl.title = nota.title || 'Sem título';

      // Marcador de cor ou ícone
      const dotEl = document.createElement('span');
      dotEl.className = 'calendar-chip-dot';
      if (nota.color) {
        dotEl.style.backgroundColor = nota.color;
      }

      const titleEl = document.createElement('span');
      titleEl.className = 'calendar-chip-title';
      titleEl.textContent = nota.title || 'Sem título';

      chipEl.appendChild(dotEl);
      chipEl.appendChild(titleEl);

      const cat = extrairCategoriaDaNota(nota);
      if (cat) {
        const catBadge = document.createElement('span');
        catBadge.className = 'calendar-chip-cat';
        catBadge.textContent = cat;
        chipEl.appendChild(catBadge);
      }

      // Clique abre a nota no editor
      chipEl.addEventListener('click', e => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('quickdock:activate-note', {
          detail: { id: nota.id, uid: nota.uid }
        }));
        switchView('editor');
      });

      notasDiaEl.appendChild(chipEl);
    }

    diaEl.appendChild(notasDiaEl);

    // Clique na célula do dia também pode adicionar nota se vazia
    diaEl.addEventListener('click', e => {
      if (e.target.closest('.calendar-note-chip') || e.target.closest('.calendar-day-add-btn')) return;
      criarENavegarNotaPorData(celula.dataFormatada, categoriaSelecionada);
    });

    gridEl.appendChild(diaEl);
  }
}
