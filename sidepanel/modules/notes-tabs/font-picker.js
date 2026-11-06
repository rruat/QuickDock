// Fonte da nota: escolhida no menu da aba, em "Fonte" (um item próprio, igual a
// "Ícone e cor"). A fonte fica salva na nota (meta.font) e é aplicada ao editor de
// blocos. A grade lista todas as famílias do Google Fonts (font-names.js); cada
// nome aparece na própria fonte, e as fontes são carregadas em lotes conforme a
// rolagem. Favoritas: estrela à direita de cada fonte, guardadas no navegador
// (valem para todas as notas) e vistas pelo filtro "Favoritas".
import { updateNoteMetaById } from '../storage.js';
import { S } from './state.js';
import { TODAS_FONTES } from './font-names.js';
import { t, idiomaAtual } from '../i18n.js';

const LOTE = 60;
const CHAVE_FAVORITAS = 'font_favorites';

// Só nomes de família (letras, números e espaço): evita injetar qualquer coisa na
// URL da folha de estilos do Google Fonts.
const NOME_VALIDO = /^[A-Za-z][A-Za-z0-9 ]{1,50}$/;

let favoritas = [];
let soFavoritas = false;
chrome.storage.local.get(CHAVE_FAVORITAS, obj => {
  favoritas = Array.isArray(obj[CHAVE_FAVORITAS]) ? obj[CHAVE_FAVORITAS] : [];
});

function salvarFavoritas() {
  return new Promise(resolve => chrome.storage.local.set({ [CHAVE_FAVORITAS]: favoritas }, resolve));
}

// Carrega famílias do Google Fonts numa folha própria (cada lote tem a sua).
const folhasCarregadas = new Set();
function carregarFamilias(nomes) {
  const pendentes = nomes.filter(n => !folhasCarregadas.has(n));
  if (pendentes.length === 0) return;
  pendentes.forEach(n => folhasCarregadas.add(n));
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?'
    + pendentes.map(n => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;600;700`).join('&')
    + '&display=swap';
  document.head.appendChild(link);
}

// Aplica a fonte ao editor da nota aberta (null volta à fonte padrão do painel).
export function setNoteFont(nome) {
  const editor = document.getElementById('note-editor-blocks');
  if (nome && NOME_VALIDO.test(nome)) {
    carregarFamilias([nome]);
    editor.style.fontFamily = `'${nome}', var(--font)`;
  } else {
    editor.style.fontFamily = '';
  }
}

const ICONE_ESTRELA = "<svg viewBox='0 0 24 24'><path d='M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z'/></svg>";

// Seção "Fonte" dentro do menu da aba. Escolher uma fonte só atualiza a grade (sem
// redesenhar o menu), para a rolagem ficar exatamente onde estava.
export function renderFontSection(pop, meta) {
  const busca = document.createElement('input');
  busca.type = 'text';
  busca.className = 'icon-search-input';
  busca.placeholder = t('font.buscar', { n: TODAS_FONTES.length.toLocaleString(idiomaAtual()) });
  busca.addEventListener('mousedown', e => e.stopPropagation());
  busca.addEventListener('keydown', e => e.stopPropagation());
  pop.appendChild(busca);

  const filtro = document.createElement('button');
  filtro.className = 'font-filter' + (soFavoritas ? ' active' : '');
  filtro.textContent = t('font.favoritas');
  filtro.addEventListener('mousedown', e => e.stopPropagation());
  filtro.addEventListener('click', e => {
    e.stopPropagation();
    soFavoritas = !soFavoritas;
    filtro.classList.toggle('active', soFavoritas);
    desenhar();
  });
  pop.appendChild(filtro);

  const grade = document.createElement('div');
  grade.className = 'font-grid';
  pop.appendChild(grade);

  let lista = [];
  let mostradas = 0;

  const linha = (nome, rotulo) => {
    const item = document.createElement('div');
    item.className = 'font-swatch' + (meta.font === nome ? ' active' : '');
    item.title = nome || t('font.fontePadrao');
    item.addEventListener('mousedown', e => e.stopPropagation());

    const nomeEl = document.createElement('span');
    nomeEl.className = 'font-name';
    nomeEl.textContent = rotulo;
    if (nome) nomeEl.style.fontFamily = `'${nome}', sans-serif`;
    nomeEl.addEventListener('click', e => { e.stopPropagation(); escolher(nome); });
    item.appendChild(nomeEl);

    if (nome) {
      const estrela = document.createElement('button');
      const ehFavorita = favoritas.includes(nome);
      estrela.className = 'font-fav' + (ehFavorita ? ' on' : '');
      estrela.title = ehFavorita ? t('font.removerFavorita') : t('font.favoritar');
      estrela.innerHTML = ICONE_ESTRELA;
      estrela.addEventListener('mousedown', e => e.stopPropagation());
      estrela.addEventListener('click', e => { e.stopPropagation(); alternarFavorita(nome); });
      item.appendChild(estrela);
    }
    return item;
  };

  // Mostra mais um lote da lista e carrega as fontes desse lote.
  const adicionarLote = () => {
    const fatia = lista.slice(mostradas, mostradas + LOTE);
    for (const nome of fatia) grade.appendChild(linha(nome, nome));
    carregarFamilias(fatia);
    mostradas += fatia.length;
  };

  const desenhar = () => {
    const posicao = grade.scrollTop;
    const q = busca.value.trim().toLowerCase();
    grade.innerHTML = '';
    mostradas = 0;
    const base = soFavoritas ? favoritas : TODAS_FONTES;
    lista = q ? base.filter(n => n.toLowerCase().includes(q)) : base;
    if (!q && !soFavoritas) grade.appendChild(linha(null, t('font.padrao')));
    if (soFavoritas && lista.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'font-empty';
      vazio.textContent = favoritas.length === 0 ? t('font.nenhumaFavorita') : t('font.nenhumaFavoritaNome');
      grade.appendChild(vazio);
    }
    if (q && NOME_VALIDO.test(busca.value.trim()) && !TODAS_FONTES.some(n => n.toLowerCase() === q)) {
      // Nome digitado que não está no catálogo: ainda assim pode ser uma família válida.
      const nome = busca.value.trim();
      const usar = linha(nome, t('font.usar', { nome }));
      usar.classList.add('font-swatch-wide');
      grade.appendChild(usar);
    }
    adicionarLote();
    // carrega lotes até alcançar a posição anterior, e então restaura a rolagem
    while (grade.scrollHeight < posicao + grade.clientHeight && mostradas < lista.length) adicionarLote();
    grade.scrollTop = posicao;
  };

  const escolher = async nome => {
    await updateNoteMetaById(meta.id, { font: nome });
    meta.font = nome;
    if (meta.id === S.activeId) setNoteFont(nome);
    desenhar();
  };

  const alternarFavorita = async nome => {
    favoritas = favoritas.includes(nome)
      ? favoritas.filter(n => n !== nome)
      : [...favoritas, nome];
    await salvarFavoritas();
    desenhar();
  };

  grade.addEventListener('scroll', () => {
    if (grade.scrollTop + grade.clientHeight >= grade.scrollHeight - 40 && mostradas < lista.length) {
      adicionarLote();
    }
  });
  busca.addEventListener('input', desenhar);
  desenhar();
}
