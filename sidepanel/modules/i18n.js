// Idioma da interface. O idioma vem do navegador (chrome.i18n.getUILanguage). Os
// idiomas suportados são pt-BR, pt-PT, en e es; qualquer outro cai no inglês.
// Textos fora do dicionário caem no pt-BR (chave original) e, em último caso, na chave.

import { TRADUCOES } from './i18n-textos.js';

const DICIONARIOS = {
  'pt-BR': {
    'aside.notas': 'Notas',
    'aside.fechar': 'Fechar notas',
    'aside.novaNota': 'Nova nota',
    'aside.modelos': 'Modelos',
    'aside.tutorial': 'Ver tutorial',
    'aside.idioma': 'Idioma',
    'idioma.auto': 'Automático (navegador)',
    'aside.temaEscuro': 'Tema escuro',
    'aside.temaClaro': 'Tema claro',
    'aside.ocultarDocs': 'Ocultar documentos',
    'aside.mostrarDocs': 'Mostrar documentos',
    'aside.baixarTudo': 'Baixar todas as notas',
    'tpl.titulo': 'Modelos',
    'tpl.voltar': 'Voltar às notas',
    'tpl.novo': 'Novo',
    'tpl.salvar': 'Salvar',
    'tpl.nota': 'Nota',
    'tpl.bloco': 'Bloco',
    'tpl.grupoNota': 'Modelos de nota',
    'tpl.grupoBloco': 'Modelos de bloco',
    'tpl.vazioNota': 'Nenhum modelo de nota ainda.',
    'tpl.vazioBloco': 'Nenhum modelo de bloco ainda.',
    'tpl.baixar': 'Baixar .md para compartilhar',
    'tpl.editar': 'Editar no editor de notas',
    'tpl.excluir': 'Excluir modelo',
    'tpl.usarBloco': 'Inserir este bloco na nota aberta',
    'tpl.usarNota': 'Criar uma nota com este modelo',
    'tpl.dicaNovo': 'Criar um modelo do zero',
    'tpl.dicaSalvar': 'Salvar a nota atual como modelo',
    'tpl.dicaImportNota': 'Importar um .md como modelo de nota',
    'tpl.dicaImportBloco': 'Importar um .md como modelo de bloco',
    'tpl.tipoBloco': 'Modelo de bloco',
    'tpl.tipoNota': 'Modelo de nota',
    'tpl.buscarEmpty': 'Buscar…',
    'tpl.nomeModelo': 'Nome do modelo',
    'tpl.cancelar': 'Cancelar',
    'tpl.salvarModelo': 'Salvar modelo',
    'font.buscar': 'Buscar entre {n} fontes…',
    'font.padrao': 'Padrão',
    'font.fontePadrao': 'Fonte padrão',
    'font.favoritas': 'Favoritas',
    'font.nenhumaFavorita': 'Nenhuma fonte favorita ainda.',
    'font.nenhumaFavoritaNome': 'Nenhuma favorita com esse nome.',
    'font.usar': 'Usar “{nome}”',
    'font.removerFavorita': 'Remover dos favoritos',
    'font.favoritar': 'Favoritar',
    'icone.titulo': 'Ícone',
    'icone.buscar': 'Buscar entre {n} ícones...',
    'icone.nenhum': 'Nenhum ícone',
    'icone.preenchido': 'Ícone preenchido',
    'icone.ocultarNome': 'Ocultar nome na aba',
    'icone.cor': 'Cor',
    'icone.nenhumaCor': 'Nenhuma cor',
    'icone.outraCor': 'Outra cor…',
    'idioma.pt-BR': 'Português (Brasil)',
    'idioma.pt-PT': 'Português (Portugal)',
    'idioma.en': 'English',
    'idioma.es': 'Español',
  },
  'pt-PT': {
    'aside.notas': 'Notas',
    'aside.fechar': 'Fechar notas',
    'aside.novaNota': 'Nova nota',
    'aside.modelos': 'Modelos',
    'aside.tutorial': 'Ver tutorial',
    'aside.idioma': 'Idioma',
    'idioma.auto': 'Automático (navegador)',
    'aside.temaEscuro': 'Tema escuro',
    'aside.temaClaro': 'Tema claro',
    'aside.ocultarDocs': 'Ocultar documentos',
    'aside.mostrarDocs': 'Mostrar documentos',
    'aside.baixarTudo': 'Transferir todas as notas',
    'tpl.titulo': 'Modelos',
    'tpl.voltar': 'Voltar às notas',
    'tpl.novo': 'Novo',
    'tpl.salvar': 'Guardar',
    'tpl.nota': 'Nota',
    'tpl.bloco': 'Bloco',
    'tpl.grupoNota': 'Modelos de nota',
    'tpl.grupoBloco': 'Modelos de bloco',
    'tpl.vazioNota': 'Ainda não há modelos de nota.',
    'tpl.vazioBloco': 'Ainda não há modelos de bloco.',
    'tpl.baixar': 'Transferir .md para partilhar',
    'tpl.editar': 'Editar no editor de notas',
    'tpl.excluir': 'Eliminar modelo',
    'tpl.usarBloco': 'Inserir este bloco na nota aberta',
    'tpl.usarNota': 'Criar uma nota com este modelo',
    'tpl.dicaNovo': 'Criar um modelo do zero',
    'tpl.dicaSalvar': 'Guardar a nota atual como modelo',
    'tpl.dicaImportNota': 'Importar um .md como modelo de nota',
    'tpl.dicaImportBloco': 'Importar um .md como modelo de bloco',
    'tpl.tipoBloco': 'Modelo de bloco',
    'tpl.tipoNota': 'Modelo de nota',
    'tpl.buscarEmpty': 'Pesquisar…',
    'tpl.nomeModelo': 'Nome do modelo',
    'tpl.cancelar': 'Cancelar',
    'tpl.salvarModelo': 'Guardar modelo',
    'font.buscar': 'Pesquisar entre {n} tipos de letra…',
    'font.padrao': 'Predefinida',
    'font.fontePadrao': 'Tipo de letra predefinido',
    'font.favoritas': 'Favoritas',
    'font.nenhumaFavorita': 'Ainda não há tipos de letra favoritos.',
    'font.nenhumaFavoritaNome': 'Nenhuma favorita com esse nome.',
    'font.usar': 'Usar “{nome}”',
    'font.removerFavorita': 'Remover dos favoritos',
    'font.favoritar': 'Adicionar aos favoritos',
    'icone.titulo': 'Ícone',
    'icone.buscar': 'Pesquisar entre {n} ícones...',
    'icone.nenhum': 'Nenhum ícone',
    'icone.preenchido': 'Ícone preenchido',
    'icone.ocultarNome': 'Ocultar nome no separador',
    'icone.cor': 'Cor',
    'icone.nenhumaCor': 'Nenhuma cor',
    'icone.outraCor': 'Outra cor…',
    'idioma.pt-BR': 'Português (Brasil)',
    'idioma.pt-PT': 'Português (Portugal)',
    'idioma.en': 'English',
    'idioma.es': 'Español',
  },
  en: {
    'aside.notas': 'Notes',
    'aside.fechar': 'Close notes',
    'aside.novaNota': 'New note',
    'aside.modelos': 'Templates',
    'aside.tutorial': 'View tutorial',
    'aside.idioma': 'Language',
    'idioma.auto': 'Automatic (browser)',
    'aside.temaEscuro': 'Dark theme',
    'aside.temaClaro': 'Light theme',
    'aside.ocultarDocs': 'Hide documents',
    'aside.mostrarDocs': 'Show documents',
    'aside.baixarTudo': 'Download all notes',
    'tpl.titulo': 'Templates',
    'tpl.voltar': 'Back to notes',
    'tpl.novo': 'New',
    'tpl.salvar': 'Save',
    'tpl.nota': 'Note',
    'tpl.bloco': 'Block',
    'tpl.grupoNota': 'Note templates',
    'tpl.grupoBloco': 'Block templates',
    'tpl.vazioNota': 'No note templates yet.',
    'tpl.vazioBloco': 'No block templates yet.',
    'tpl.baixar': 'Download .md to share',
    'tpl.editar': 'Edit in the note editor',
    'tpl.excluir': 'Delete template',
    'tpl.usarBloco': 'Insert this block into the open note',
    'tpl.usarNota': 'Create a note from this template',
    'tpl.dicaNovo': 'Create a template from scratch',
    'tpl.dicaSalvar': 'Save the current note as a template',
    'tpl.dicaImportNota': 'Import a .md as a note template',
    'tpl.dicaImportBloco': 'Import a .md as a block template',
    'tpl.tipoBloco': 'Block template',
    'tpl.tipoNota': 'Note template',
    'tpl.buscarEmpty': 'Search…',
    'tpl.nomeModelo': 'Template name',
    'tpl.cancelar': 'Cancel',
    'tpl.salvarModelo': 'Save template',
    'font.buscar': 'Search {n} fonts…',
    'font.padrao': 'Default',
    'font.fontePadrao': 'Default font',
    'font.favoritas': 'Favorites',
    'font.nenhumaFavorita': 'No favorite fonts yet.',
    'font.nenhumaFavoritaNome': 'No favorites with that name.',
    'font.usar': 'Use “{nome}”',
    'font.removerFavorita': 'Remove from favorites',
    'font.favoritar': 'Add to favorites',
    'icone.titulo': 'Icon',
    'icone.buscar': 'Search {n} icons...',
    'icone.nenhum': 'No icon',
    'icone.preenchido': 'Filled icon',
    'icone.ocultarNome': 'Hide name on tab',
    'icone.cor': 'Color',
    'icone.nenhumaCor': 'No color',
    'icone.outraCor': 'Other color…',
    'idioma.pt-BR': 'Português (Brasil)',
    'idioma.pt-PT': 'Português (Portugal)',
    'idioma.en': 'English',
    'idioma.es': 'Español',
  },
  es: {
    'aside.notas': 'Notas',
    'aside.fechar': 'Cerrar notas',
    'aside.novaNota': 'Nueva nota',
    'aside.modelos': 'Plantillas',
    'aside.tutorial': 'Ver tutorial',
    'aside.idioma': 'Idioma',
    'idioma.auto': 'Automático (navegador)',
    'aside.temaEscuro': 'Tema oscuro',
    'aside.temaClaro': 'Tema claro',
    'aside.ocultarDocs': 'Ocultar documentos',
    'aside.mostrarDocs': 'Mostrar documentos',
    'aside.baixarTudo': 'Descargar todas las notas',
    'tpl.titulo': 'Plantillas',
    'tpl.voltar': 'Volver a las notas',
    'tpl.novo': 'Nuevo',
    'tpl.salvar': 'Guardar',
    'tpl.nota': 'Nota',
    'tpl.bloco': 'Bloque',
    'tpl.grupoNota': 'Plantillas de nota',
    'tpl.grupoBloco': 'Plantillas de bloque',
    'tpl.vazioNota': 'Todavía no hay plantillas de nota.',
    'tpl.vazioBloco': 'Todavía no hay plantillas de bloque.',
    'tpl.baixar': 'Descargar .md para compartir',
    'tpl.editar': 'Editar en el editor de notas',
    'tpl.excluir': 'Eliminar plantilla',
    'tpl.usarBloco': 'Insertar este bloque en la nota abierta',
    'tpl.usarNota': 'Crear una nota con esta plantilla',
    'tpl.dicaNovo': 'Crear una plantilla desde cero',
    'tpl.dicaSalvar': 'Guardar la nota actual como plantilla',
    'tpl.dicaImportNota': 'Importar un .md como plantilla de nota',
    'tpl.dicaImportBloco': 'Importar un .md como plantilla de bloque',
    'tpl.tipoBloco': 'Plantilla de bloque',
    'tpl.tipoNota': 'Plantilla de nota',
    'tpl.buscarEmpty': 'Buscar…',
    'tpl.nomeModelo': 'Nombre de la plantilla',
    'tpl.cancelar': 'Cancelar',
    'tpl.salvarModelo': 'Guardar plantilla',
    'font.buscar': 'Buscar entre {n} fuentes…',
    'font.padrao': 'Predeterminada',
    'font.fontePadrao': 'Fuente predeterminada',
    'font.favoritas': 'Favoritas',
    'font.nenhumaFavorita': 'Todavía no hay fuentes favoritas.',
    'font.nenhumaFavoritaNome': 'No hay favoritas con ese nombre.',
    'font.usar': 'Usar “{nome}”',
    'font.removerFavorita': 'Quitar de favoritos',
    'font.favoritar': 'Añadir a favoritos',
    'icone.titulo': 'Icono',
    'icone.buscar': 'Buscar entre {n} iconos...',
    'icone.nenhum': 'Ningún icono',
    'icone.preenchido': 'Icono relleno',
    'icone.ocultarNome': 'Ocultar nombre en la pestaña',
    'icone.cor': 'Color',
    'icone.nenhumaCor': 'Ningún color',
    'icone.outraCor': 'Otro color…',
    'idioma.pt-BR': 'Português (Brasil)',
    'idioma.pt-PT': 'Português (Portugal)',
    'idioma.en': 'English',
    'idioma.es': 'Español',
  },
};

// Converte qualquer código de idioma do navegador para um dos quatro suportados.
export function resolverIdioma(codigo) {
  const c = String(codigo || '').toLowerCase();
  if (c.startsWith('pt-pt')) return 'pt-PT';
  if (c.startsWith('pt')) return 'pt-BR';
  if (c.startsWith('en')) return 'en';
  if (c.startsWith('es')) return 'es';
  return 'en';
}

export function idiomaDoNavegador() {
  const codigo = chrome.i18n?.getUILanguage?.() || navigator.language;
  return resolverIdioma(codigo);
}

const IDIOMAS_SUPORTADOS = ['pt-BR', 'pt-PT', 'en', 'es'];
const CHAVE_IDIOMA = 'ui_language';

// Escolha manual do usuário (null = automático, segue o idioma do navegador).
// Fica também no localStorage: os módulos leem o idioma ao carregar, antes do
// chrome.storage responder.
const CHAVE_LOCAL = 'quickdock_idioma';
function lerEscolhaLocal() {
  try {
    const v = localStorage.getItem(CHAVE_LOCAL);
    return IDIOMAS_SUPORTADOS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
function gravarEscolhaLocal(v) {
  try {
    if (v) localStorage.setItem(CHAVE_LOCAL, v);
    else localStorage.removeItem(CHAVE_LOCAL);
  } catch { /* sem localStorage: fica só o chrome.storage */ }
}
let escolhaManual = lerEscolhaLocal();
let idioma = null;

// Lê a escolha salva. Chamar antes de aplicarIdiomaNoHtml().
export async function carregarEscolhaIdioma() {
  try {
    const obj = await chrome.storage.local.get(CHAVE_IDIOMA);
    const valor = obj[CHAVE_IDIOMA];
    escolhaManual = IDIOMAS_SUPORTADOS.includes(valor) ? valor : null;
  } catch {
    escolhaManual = null;
  }
  idioma = null;
}

export function escolhaIdioma() {
  return escolhaManual;
}

// Salva a escolha (null volta ao automático).
export async function definirEscolhaIdioma(valor) {
  escolhaManual = IDIOMAS_SUPORTADOS.includes(valor) ? valor : null;
  idioma = null;
  gravarEscolhaLocal(escolhaManual);
  await chrome.storage.local.set({ [CHAVE_IDIOMA]: escolhaManual });
}

export function idiomaAtual() {
  if (idioma === null) idioma = escolhaManual || idiomaDoNavegador();
  return idioma;
}

export function t(chave, vars = {}) {
  const lang = idiomaAtual();
  let texto = DICIONARIOS[lang]?.[chave]
    ?? (Object.hasOwn(TRADUCOES, chave) ? TRADUCOES[chave][lang] : undefined)
    ?? DICIONARIOS['pt-BR'][chave]
    ?? chave;
  for (const [nome, valor] of Object.entries(vars)) texto = texto.replaceAll(`{${nome}}`, valor);
  return texto;
}

// Aplica os textos da interface marcados no HTML:
//   data-i18n="chave"            → texto do elemento
//   data-i18n-title="chave"      → atributo title
//   data-i18n-aria="chave"       → aria-label
//   data-i18n-placeholder="chave"→ placeholder
export function aplicarIdiomaNoHtml(raiz = document) {
  raiz.documentElement.setAttribute('lang', idiomaAtual());
  raiz.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  raiz.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  raiz.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  raiz.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  // Textos fixos do HTML: se o texto inteiro do nó (ou de um atributo) está no
  // dicionário de traduções, troca pelo texto do idioma atual.
  const nos = document.createTreeWalker(raiz.body, NodeFilter.SHOW_TEXT);
  for (let no = nos.nextNode(); no; no = nos.nextNode()) {
    const bruto = no.nodeValue.trim();
    if (bruto && Object.hasOwn(TRADUCOES, bruto)) no.nodeValue = no.nodeValue.replace(bruto, t(bruto));
  }
  raiz.querySelectorAll('[title], [aria-label], [placeholder]').forEach(el => {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const valor = el.getAttribute(attr);
      if (valor && Object.hasOwn(TRADUCOES, valor)) el.setAttribute(attr, t(valor));
    }
  });
}

// Rótulos dos destaques ("Nota", "Dica"…). Ficam no CSS (--callout-label), que não
// traduz sozinho: aqui sobrescreve as regras com o texto do idioma atual. A folha é
// adicionada por último no <head>, então vence a do CSS.
const ROTULOS_DESTAQUE = { note: 'Nota', tip: 'Dica', important: 'Importante', warning: 'Atenção', caution: 'Cuidado' };

export function aplicarRotulosDestaque() {
  const regras = Object.entries(ROTULOS_DESTAQUE)
    .map(([tipo, pt]) => `.note-editor-blocks .block[data-callout="${tipo}"] { --callout-label: ${JSON.stringify(t(pt))}; }`)
    .join('\n');
  let folha = document.getElementById('i18n-rotulos-destaque');
  if (!folha) {
    folha = document.createElement('style');
    folha.id = 'i18n-rotulos-destaque';
    document.head.appendChild(folha);
  }
  folha.textContent = regras;
}
