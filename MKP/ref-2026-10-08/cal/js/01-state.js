// Referências de DOM e estado global do mockup
// Alternar tema claro / escuro
const btnTheme = document.getElementById('btn-header-theme');
btnTheme?.addEventListener('click', () => {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
});

// Controles do Painel Lateral Direito (#mRightAside)
const appContainer = document.getElementById('app');
const btnToggleRightHeader = document.getElementById('btnToggleRightHeader');
const btnToggleRightAside = document.getElementById('btnToggleRightAside');
const btnCloseRightAside = document.getElementById('btnCloseRightAside');
const rightAside = document.getElementById('mRightAside');
const rightAsideTitle = document.getElementById('rightAsideTitle');


const asideCalendarMode = document.getElementById('asideCalendarMode');
const asideNoteMode = document.getElementById('asideNoteMode');
const asideNoteDateBadge = document.getElementById('asideNoteDateBadge');
const asideNoteSubDate = document.getElementById('asideNoteSubDate');
const asideNoteStats = document.getElementById('asideNoteStats');
const btnAsideClearNote = document.getElementById('btnAsideClearNote');
const btnAsideDoneNote = document.getElementById('btnAsideDoneNote');

// Header da View Principal (Muda entre Calendário e Nota)
const sectionHeader = document.getElementById('sectionHeader');
const sectionHeaderIcon = document.getElementById('sectionHeaderIcon');
const sectionHeaderTitle = document.getElementById('sectionHeaderTitle');
const btnBackToCalendar = document.getElementById('btnBackToCalendar');
const btnCloseNoteHeader = document.getElementById('btnCloseNoteHeader');

// Célula Expansiva e Bloco de Notas Integrado (Zero Popup)
const calendarView = document.getElementById('calendarView');
const calendarMonthView = document.getElementById('calendarMonthView');
const calendarWeekView = document.getElementById('calendarWeekView');
const calendarDayView = document.getElementById('calendarDayView');
const calendarBody = document.querySelector('.calendar-body');
const calendarWeekdays = document.querySelector('.calendar-weekdays');
const calendarGrid = document.querySelector('.calendar-grid');
const inCellNotepad = document.getElementById('inCellNotepad');
const notepadTextarea = document.getElementById('notepadTextarea');
const notepadStatus = document.getElementById('notepadStatus');
const btnSaveNotepad = document.getElementById('btnSaveNotepad');
const footerActiveViewName = document.getElementById('footer-active-view-name');

const dayCells = Array.from(calendarGrid.querySelectorAll('.calendar-day'));
let activeCell = null;
let isTransitioning = false;
let currentAsideMode = 'calendar'; // 'calendar' ou 'note'
let currentViewMode = 'month';     // 'month' | 'week' | 'day'
let activeDayNumber = '7';
let dataView = 'calendar';         // 'calendar' | 'table' | 'gallery'
let openItem = null;               // item (nota ou quadro) aberto na célula/coluna/tela; null = nota do dia

