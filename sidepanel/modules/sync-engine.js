// ── sync-engine.js ───────────────────────────────────────────────────────────
// Motor de sincronização de notas do QuickDock.
//
// Projetado para operar sem DOM e sem acoplamento direto a fornecedores de nuvem:
// recebe um adaptador de sincronização (MemorySyncAdapter, LocalFolderAdapter, etc.)
// e um repositório de dados local (Dexie em produção ou InMemoryStore em testes).
//
// Ordem das operações (ver PLANEJAMENTO.md v3.0 e HANDOFF.md):
//   1. Pergunta o que mudou lá (adapter.listarMudancas)
//   2. Baixa o que mudou lá e reconcilia (baixar antes de subir, sempre)
//   3. Sobe o que mudou aqui
//   4. Conflito → preserva ambos criando cópia de conflito identificada
//
// O estado local de sincronização ({ uid, caminho, rev, hash, sincronizadoEm })
// reside exclusivamente no aparelho e nunca sobe. É ele que diferencia uma
// nota apagada remotamente de uma nota que ainda não chegou.

import { buildNoteFile, parseNoteFile, extrairMetadadosBrutos, FORMATO_QUICKDOCK_SUPORTADO } from './notefile.js';
import { parseMarkdownToBlocks, blocksToMarkdown } from './blocks.js';
// Só a função pura de ordenação — o motor não fala com o banco.
import { ordemEntre } from './storage.js';

/**
 * Hash determinístico síncrono de 64 bits para detectar alterações de texto
 * em qualquer ambiente (Node.js ou navegador MV3) sem overhead assíncrono.
 */
export function hashConteudo(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Hash usado para detectar mudança de verdade num arquivo de nota.
 *
 * O `atualizadoEm` do frontmatter NÃO entra na conta, e isso é o ponto todo da
 * função. O `flushSave()` do editor grava sempre que é chamado — inclusive
 * quando nada mudou — e carimba `updatedAt: Date.now()`. Como ele roda antes de
 * cada rodada de sincronização, o texto serializado mudava a cada rodada, a nota
 * parecia editada localmente, e bastava o lado remoto também parecer mudado para
 * nascer uma cópia de conflito. A cópia então virava fonte da próxima, e o nome
 * do arquivo crescia até estourar o limite de caminho do sistema.
 *
 * Carimbo de tempo é metadado, não conteúdo. Fica no arquivo para quem lê, mas
 * não decide se houve mudança.
 */
export function hashDaNota(texto) {
  return hashConteudo(
    String(texto ?? '')
      .replace(/^atualizadoEm:.*\r?\n?/gm, '')
      .replace(/^criadoEm:.*\r?\n?/gm, '')
  );
}

export function slugTitulo(titulo) {
  const s = (titulo ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  // Teto de tamanho. O motor nunca pode gerar um nome que ele não consegue
  // gravar: o Windows recusa caminho acima de ~260 caracteres, e a falha é
  // permanente — toda sincronização seguinte tenta o mesmo nome e falha de novo.
  // Apareceu em uso real, com um título inchado por sufixos de conflito
  // empilhados gerando 243 caracteres só no caminho relativo.
  //
  // Cortar é seguro porque o nome do arquivo é enfeite legível: a identidade da
  // nota é o `id` do frontmatter. Dois títulos que colidam depois do corte são
  // resolvidos por quem chama, que nunca sobrescreve arquivo ocupado.
  const corte = cortarNoHifen(s, MAX_SLUG);
  return corte || 'sem-titulo';
}

export function extrairPastaDoCaminho(caminho) {
  if (!caminho) return '';
  const relativo = caminho.startsWith('notas/') ? caminho.slice('notas/'.length) : caminho;
  const ultimoSlash = relativo.lastIndexOf('/');
  if (ultimoSlash === -1) return '';
  return relativo.slice(0, ultimoSlash);
}

export function extrairPastaDoCaminhoQuadro(caminho) {
  if (!caminho) return '';
  const relativo = caminho.startsWith('quadros/') ? caminho.slice('quadros/'.length) : caminho;
  const ultimoSlash = relativo.lastIndexOf('/');
  if (ultimoSlash === -1) return '';
  return relativo.slice(0, ultimoSlash);
}

export function ehCaminhoDeQuadro(caminho) {
  if (!caminho || typeof caminho !== 'string') return false;
  const c = caminho.toLowerCase();
  if (c.startsWith('modelos/') || c.startsWith('imagens/') || c.startsWith('notas/')) return false;
  if (c.startsWith('quadros/') && (c.endsWith('.canvas') || c.endsWith('.json'))) return true;
  if (c.endsWith('.canvas')) return true;
  return false;
}

export function hashDoQuadro(texto) {
  try {
    const obj = JSON.parse(texto);
    if (obj && typeof obj === 'object') {
      const clone = { ...obj };
      delete clone.updatedAt;
      delete clone.createdAt;
      delete clone.atualizadoEm;
      delete clone.criadoEm;
      return hashConteudo(JSON.stringify(clone));
    }
  } catch {}
  return hashConteudo(
    String(texto ?? '')
      .replace(/^"?(?:updatedAt|createdAt|atualizadoEm|criadoEm)"?:.*\r?\n?/gm, '')
  );
}

// Arquivos de mídia de cartões (imagem colada, vídeo, áudio, PDF…) vão pra mesma pasta
// `imagens/` das notas, nomeados pelo hash do conteúdo. Acima disso o arquivo fica só
// neste aparelho (o cartão sincroniza, o arquivo não) pra não estourar a cota do Drive.
const MAX_BYTES_ARQUIVO_QUADRO = 25 * 1024 * 1024;

/**
 * @param {object} quadro
 * @param {Map<number,string>|null} mapaArquivos fileId local → caminho remoto (imagens/<hash>.<ext>).
 *   `fileId` é um número do banco DESTE aparelho — não pode viajar no arquivo: em outro
 *   aparelho ele apontaria pra outro arquivo (ou pra nenhum). Vai o caminho (`arquivo`).
 */
export function serializarQuadro(quadro, mapaArquivos = null) {
  const arrows = Array.isArray(quadro.arrows) ? quadro.arrows : [];
  const cards = (Array.isArray(quadro.cards) ? quadro.cards : []).map(c => {
    if (c.fileId == null) return c;
    const { fileId, ...resto } = c;
    const arquivo = mapaArquivos?.get(fileId) || c.arquivo;
    return arquivo ? { ...resto, arquivo } : resto;
  });

  // Mapeamento compatível com a especificação JSON Canvas (Obsidian Canvas)
  const nodes = cards.map(c => {
    const node = {
      id: c.id,
      x: c.x ?? 0,
      y: c.y ?? 0,
      width: c.w ?? 220,
      height: c.h ?? 120,
    };
    if (c.type === 'group') {
      node.type = 'group';
      node.label = c.label || '';
    } else if (c.type === 'image') {
      node.type = 'file';
      node.file = c.arquivo || c.alt || `imagem-${c.id}`;
    } else if (c.type === 'note') {
      node.type = 'file';
      node.file = c.noteUid || '';
    } else if (c.type === 'media') {
      if (c.src) {
        node.type = 'link';
        node.url = c.src;
      } else {
        node.type = 'file';
        node.file = c.arquivo || c.name || `arquivo-${c.id}`;
      }
    } else {
      node.type = 'text';
      node.text = c.text || '';
    }
    if (c.color && c.color !== 'default') node.color = c.color;
    return node;
  });

  const edges = arrows.map(a => {
    const edge = {
      id: a.id,
      fromNode: a.from,
      toNode: a.to,
    };
    if (a.fromSide) edge.fromSide = a.fromSide;
    if (a.toSide) edge.toSide = a.toSide;
    if (a.color) edge.color = a.color;
    if (a.label) edge.label = a.label;
    return edge;
  });

  const payload = {
    quickdock: 1,
    id: quadro.uid,
    title: quadro.title || 'Espaço Sem Título',
    pasta: quadro.pasta || undefined,
    viewport: quadro.viewport || { x: 0, y: 0, zoom: 1 },
    bgMode: quadro.bgMode || 'stars',
    cards,
    arrows,
    nodes,
    edges,
    createdAt: quadro.createdAt ? (typeof quadro.createdAt === 'number' ? new Date(quadro.createdAt).toISOString() : quadro.createdAt) : undefined,
    updatedAt: quadro.updatedAt ? (typeof quadro.updatedAt === 'number' ? new Date(quadro.updatedAt).toISOString() : quadro.updatedAt) : undefined,
  };

  return JSON.stringify(payload, null, 2);
}

export function parseQuadroFile(texto) {
  try {
    const obj = JSON.parse(texto);
    if (!obj || typeof obj !== 'object') return null;

    let cards = Array.isArray(obj.cards) ? obj.cards : null;
    let arrows = Array.isArray(obj.arrows) ? obj.arrows : null;

    if (!cards && Array.isArray(obj.nodes)) {
      cards = obj.nodes.map(n => {
        if (n.type === 'group') {
          return { id: n.id, x: n.x, y: n.y, w: n.width, h: n.height, type: 'group', label: n.label || 'Grupo', color: n.color || null };
        } else if (n.type === 'file') {
          return { id: n.id, x: n.x, y: n.y, w: n.width, h: n.height, type: 'note', noteUid: n.file, color: n.color || null };
        } else {
          return { id: n.id, x: n.x, y: n.y, w: n.width, h: n.height, text: n.text || '', color: n.color || 'default' };
        }
      });
    }

    if (!arrows && Array.isArray(obj.edges)) {
      arrows = obj.edges.map(e => ({
        id: e.id,
        from: e.fromNode,
        to: e.toNode,
        fromSide: e.fromSide || null,
        toSide: e.toSide || null,
        color: e.color || null,
        label: e.label || null,
        style: 'solid',
        lineStyle: 'straight'
      }));
    }

    return {
      uid: obj.id || obj.uid,
      title: obj.title || obj.titulo || 'Espaço Sem Título',
      pasta: obj.pasta || '',
      viewport: obj.viewport || { x: 0, y: 0, zoom: 1 },
      bgMode: obj.bgMode || 'stars',
      cards: cards || [],
      arrows: arrows || [],
      createdAt: obj.createdAt ? new Date(obj.createdAt).getTime() : undefined,
      updatedAt: obj.updatedAt ? new Date(obj.updatedAt).getTime() : undefined,
    };
  } catch {
    return null;
  }
}

const MAX_SLUG = 60;

function cortarNoHifen(s, max) {
  if (s.length <= max) return s;
  const bruto = s.slice(0, max);
  const ultimo = bruto.lastIndexOf('-');
  // Corta na última palavra inteira, desde que não jogue fora quase tudo.
  return (ultimo > max * 0.6 ? bruto.slice(0, ultimo) : bruto).replace(/-+$/, '');
}

/**
 * Título da cópia de conflito, sem aninhar.
 *
 * Rede de segurança: se a cópia já traz um sufixo de conflito, ele é SUBSTITUÍDO
 * em vez de acrescentado. Sem isso, conflitos repetidos empilham sufixos e o nome
 * do arquivo cresce sem limite até estourar o caminho máximo do sistema — que foi
 * exatamente o sintoma que apareceu em uso real, com seis sufixos empilhados e
 * uma falha de gravação no fim.
 *
 * A causa raiz daquele caso era outra (ver `hashDaNota`), mas empilhar sufixo
 * nunca é o comportamento desejado: a marca precisa dizer "esta é uma cópia de
 * conflito", e uma vez basta.
 */
const SUFIXO_CONFLITO = /\s*\(conflito \d{4}-\d{2}-\d{2}, [^)]*\)\s*$/;

function tituloDeConflito(titulo, aparelho) {
  // Repete até estabilizar: um título que já empilhou vários sufixos (dano de
  // uma versão anterior) volta ao nome original, não fica com um a menos.
  let base = String(titulo ?? '').trim();
  let antes;
  do { antes = base; base = base.replace(SUFIXO_CONFLITO, '').trim(); } while (base !== antes);
  if (!base) base = 'Sem título';
  return `${base} (conflito ${dataIsoHoje()}, ${aparelho})`;
}

function dataIsoHoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calcula o hash SHA-256 dos bytes da imagem e extrai os primeiros 12 dígitos
 * hexadecimais (ex: a1b2c3d4e5f6), garantindo nome único, imutável e idêntico
 * em qualquer aparelho ou plataforma.
 */
export async function calcularHashImagem(bytesOuBlob) {
  let buffer;
  if (bytesOuBlob instanceof ArrayBuffer) {
    buffer = bytesOuBlob;
  } else if (ArrayBuffer.isView(bytesOuBlob)) {
    buffer = bytesOuBlob.buffer.slice(bytesOuBlob.byteOffset, bytesOuBlob.byteOffset + bytesOuBlob.byteLength);
  } else if (bytesOuBlob && typeof bytesOuBlob.arrayBuffer === 'function') {
    buffer = await bytesOuBlob.arrayBuffer();
  } else if (typeof bytesOuBlob === 'string') {
    buffer = new TextEncoder().encode(bytesOuBlob);
  } else {
    throw new Error('Tipo de dado não suportado para cálculo de hash de imagem');
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hashHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 12);
}

export function extensaoDeMimeOuNome(mime, nome = '') {
  if (nome && /\.[a-z0-9]+$/i.test(nome)) {
    return nome.split('.').pop().toLowerCase();
  }
  if (!mime) return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/svg+xml') return 'svg';
  return 'png';
}

export class SyncEngine {
  /**
   * @param {Object} opcoes
   * @param {Object} opcoes.adapter Adaptador que cumpre o contrato de sync-adapter.js
   * @param {Object} opcoes.store   Armazenamento local (notas e estado de sync)
   * @param {string} [opcoes.deviceName='Dispositivo'] Nome para etiquetar cópias de conflito
   */
  constructor({
    adapter,
    store,
    deviceName = 'Dispositivo',
    obterNotaAbertaUid = null,
    podeRecarregarNotaAberta = null,
    recarregarNotaAberta = null,
    antesDeSincronizar = null,
    emModoModelo = null,
  }) {
    this.adapter = adapter;
    this.store = store;
    this.deviceName = deviceName;
    this.obterNotaAbertaUid = obterNotaAbertaUid;
    this.podeRecarregarNotaAberta = podeRecarregarNotaAberta;
    this.recarregarNotaAberta = recarregarNotaAberta;
    this.antesDeSincronizar = antesDeSincronizar;
    this.emModoModelo = emModoModelo;
    this.cacheImagensLocais = new Map();
  }

  _caminhoDesejado(nota) {
    const slug = slugTitulo(nota.title);
    const pasta = nota.pasta ? String(nota.pasta).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
    return pasta ? `notas/${pasta}/${slug}.md` : `notas/${slug}.md`;
  }

  _caminhoDesejadoQuadro(quadro) {
    const slug = slugTitulo(quadro.title || 'espaco');
    const pasta = quadro.pasta ? String(quadro.pasta).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
    return pasta ? `quadros/${pasta}/${slug}.canvas` : `quadros/${slug}.canvas`;
  }

  /**
   * Sobe pra `imagens/` os arquivos de mídia dos cartões de um quadro (se ainda não
   * estão lá) e devolve fileId local → caminho remoto. O que já foi enviado fica num
   * cache persistido: conferir existência no Drive baixa o arquivo inteiro, e refazer
   * isso a cada abertura do painel pra cada vídeo seria um desperdício enorme.
   */
  async _mapaArquivosDoQuadro(quadro) {
    const mapa = new Map();
    const cards = Array.isArray(quadro?.cards) ? quadro.cards : [];
    const chaveCache = 'quickdock:sync:arquivos-de-quadro';
    let enviados = {};
    try { enviados = JSON.parse(localStorage.getItem(chaveCache) || '{}'); } catch {}
    let mudou = false;

    for (const c of cards) {
      if (c.fileId == null || (c.type !== 'image' && c.type !== 'media')) continue;
      if (enviados[c.fileId]) { mapa.set(c.fileId, enviados[c.fileId]); continue; }
      try {
        const blob = this.store.obterBlobArquivo
          ? await this.store.obterBlobArquivo(c.fileId)
          : (this.store.obterArquivo ? (await this.store.obterArquivo(c.fileId))?.blob : null);
        if (!blob || blob.size > MAX_BYTES_ARQUIVO_QUADRO) continue;
        const hash = await calcularHashImagem(blob);
        let ext = extensaoDeMimeOuNome(blob.type, c.name || blob.name);
        if (!/^[a-z0-9]{1,5}$/.test(ext)) ext = extensaoDeMimeOuNome(blob.type);
        const caminhoRemoto = `imagens/${hash}.${ext}`;
        if (!(await this.adapter.ler(caminhoRemoto))) {
          await this.adapter.escrever(caminhoRemoto, blob, null);
        }
        enviados[c.fileId] = caminhoRemoto;
        mapa.set(c.fileId, caminhoRemoto);
        mudou = true;
      } catch {
        // Falhou o envio do arquivo: o quadro sobe do mesmo jeito e tenta de novo na próxima rodada
      }
    }
    if (mudou) { try { localStorage.setItem(chaveCache, JSON.stringify(enviados)); } catch {} }
    return mapa;
  }

  // Arquivo que veio DO destino já existe lá: marca no cache de "enviados" pra não
  // baixá-lo de novo só pra conferir quando o quadro for salvo.
  _lembrarArquivoEnviado(fileId, caminhoRemoto) {
    const chave = 'quickdock:sync:arquivos-de-quadro';
    try {
      const enviados = JSON.parse(localStorage.getItem(chave) || '{}');
      if (enviados[fileId] === caminhoRemoto) return;
      enviados[fileId] = caminhoRemoto;
      localStorage.setItem(chave, JSON.stringify(enviados));
    } catch {}
  }

  /**
   * Quadro baixado traz `arquivo` (caminho) e nenhum fileId. Se o aparelho já tem o
   * arquivo (é o dono dele), devolve o mesmo fileId ao cartão — senão ele perderia a
   * imagem que já está aqui e a baixaria de novo.
   */
  async _preservarFileIds(cardsRemotos, quadroLocal) {
    if (!Array.isArray(cardsRemotos) || !quadroLocal) return cardsRemotos;
    const mapa = await this._mapaArquivosDoQuadro(quadroLocal);
    if (mapa.size === 0) return cardsRemotos;
    const locais = new Map((quadroLocal.cards || []).map(c => [c.id, c]));
    return cardsRemotos.map(c => {
      const local = locais.get(c.id);
      if (c.arquivo && c.fileId == null && local?.fileId != null && mapa.get(local.fileId) === c.arquivo) {
        return { ...c, fileId: local.fileId };
      }
      return c;
    });
  }

  _prefixoRelativoImagens(caminhoNota) {
    const slashes = (caminhoNota.match(/\//g) || []).length;
    return '../'.repeat(slashes) + 'imagens/';
  }

  /**
   * Serializa uma nota local para o formato final do arquivo .md (frontmatter + blocos).
   */
  /**
   * Caminho (em imagens/) da capa ENVIADA do computador, se ela viaja com a nota. Vale só quando a
   * capa não é um link e o caminho gravado corresponde ao arquivo local atual (ou a uma capa que
   * ainda está sendo baixada: não pode sumir do arquivo remoto por não ter chegado ainda).
   */
  _capaDeArquivo(nota) {
    if (nota.coverUrl || !nota.coverRemote) return null;
    return (nota.coverRemoteId ?? null) === (nota.coverFileId ?? null) ? nota.coverRemote : null;
  }

  serializarNota(nota, mapaImagens = null) {
    const md = blocksToMarkdown(nota.blocks ?? [], { sync: true, mapaImagens });
    const capaArquivo = this._capaDeArquivo(nota);
    const temCapa = !!(nota.coverUrl || capaArquivo);
    const meta = {
      quickdock: 1,
      id: nota.uid,
      titulo: nota.title,
      cor: nota.color ?? null,
      icone: nota.icon ?? null,
      iconePreenchido: !!nota.iconFilled,
      tituloOculto: !!nota.titleHidden,
      // Capa por endereço (`capa`) ou enviada do computador (`capaImagem`: imagens/<hash>.<ext>, o
      // mesmo esquema e a mesma pasta das imagens das notas). Posição e altura valem para as duas.
      capa: nota.coverUrl || undefined,
      capaImagem: capaArquivo || undefined,
      capaPosicao: (temCapa && typeof nota.coverPosition === 'number') ? nota.coverPosition : undefined,
      capaAltura: (temCapa && (typeof nota.coverHeight === 'number' || typeof nota.coverHeight === 'string')) ? nota.coverHeight : undefined,
      // Ícone com imagem: só o endereço e o corte viajam (arquivo enviado é local).
      iconeImagem: nota.iconImage?.url || undefined,
      iconeCorte: nota.iconImage?.url
        ? `${nota.iconImage.x ?? 50},${nota.iconImage.y ?? 50},${nota.iconImage.zoom ?? 1}`
        : undefined,
      ordem: nota.ordem ?? 'a0',
      pasta: nota.pasta || undefined,
      criadoEm: nota.createdAt ? (typeof nota.createdAt === 'number' ? new Date(nota.createdAt).toISOString() : nota.createdAt) : undefined,
      atualizadoEm: nota.updatedAt ? (typeof nota.updatedAt === 'number' ? new Date(nota.updatedAt).toISOString() : nota.updatedAt) : undefined,
      properties: nota.properties || {},
    };
    return buildNoteFile({ meta, md });
  }

  /**
   * Serializa um modelo local para o formato final do arquivo .md (frontmatter + conteúdo).
   */
  serializarModelo(modelo) {
    const meta = {
      quickdock: 1,
      id: modelo.uid,
      nome: modelo.name,
      tipo: modelo.kind || 'note',
      ordem: modelo.ordem ?? 'a0',
      criadoEm: modelo.createdAt ? (typeof modelo.createdAt === 'number' ? new Date(modelo.createdAt).toISOString() : modelo.createdAt) : undefined,
      atualizadoEm: modelo.updatedAt ? (typeof modelo.updatedAt === 'number' ? new Date(modelo.updatedAt).toISOString() : modelo.updatedAt) : undefined,
    };
    return buildNoteFile({ meta, md: modelo.content || '' });
  }

  // Ícone com imagem vindo do arquivo: link + "x,y,zoom". Sem link no arquivo, quem
  // tem imagem enviada localmente fica com ela (só o link sincroniza).
  _iconImageDeMeta(meta, local) {
    if (meta?.iconeImagem) {
      const [x, y, zoom] = String(meta.iconeCorte ?? '').split(',').map(Number);
      return {
        url: String(meta.iconeImagem),
        x: Number.isFinite(x) ? x : 50,
        y: Number.isFinite(y) ? y : 50,
        zoom: Number.isFinite(zoom) ? zoom : 1,
      };
    }
    return local?.iconImage?.fileId != null ? local.iconImage : null;
  }

  /**
   * Antes de subir: se a capa é uma imagem enviada do computador, manda o arquivo para imagens/ (uma
   * vez; deduplicado por conteúdo) e grava na nota o caminho remoto. Esse caminho precisa ficar na
   * nota (e não só na memória) porque o texto da nota é recalculado em outros pontos da rodada para
   * comparar com o que foi sincronizado — sem ele, a nota pareceria editada e viraria conflito.
   * Devolve a nota (atualizada, se foi o caso).
   */
  async _prepararCapa(nota) {
    if (nota.coverUrl || nota.coverFileId == null) {
      // Sem capa de arquivo: um caminho remoto guardado deixou de valer (a capa foi removida ou
      // trocada por link) — a não ser que seja uma capa PENDENTE de download, que tem que ficar.
      const pendente = !!nota.coverRemote && nota.coverRemoteId == null && nota.coverFileId == null && !nota.coverUrl;
      if (nota.coverRemote !== undefined && !pendente) {
        const limpa = { ...nota, coverRemote: undefined, coverRemoteId: undefined };   // undefined remove o campo no Dexie
        await this.store.salvarNotaLocal(limpa);
        return limpa;
      }
      return nota;
    }
    if (nota.coverRemote && nota.coverRemoteId === nota.coverFileId) return nota;   // já enviada

    try {
      const blob = this.store.obterBlobArquivo
        ? await this.store.obterBlobArquivo(nota.coverFileId)
        : (this.store.obterArquivo ? (await this.store.obterArquivo(nota.coverFileId))?.blob : null);
      if (!blob) return nota;
      const hash = await calcularHashImagem(blob);
      const caminhoRemoto = `imagens/${hash}.${extensaoDeMimeOuNome(blob.type, blob.name)}`;
      if (!(await this.adapter.ler(caminhoRemoto))) await this.adapter.escrever(caminhoRemoto, blob, null);
      const atualizada = { ...nota, coverRemote: caminhoRemoto, coverRemoteId: nota.coverFileId };
      await this.store.salvarNotaLocal(atualizada);
      return atualizada;
    } catch {
      return nota;   // falhou o envio da capa: a nota sobe sem ela e a próxima rodada tenta de novo
    }
  }

  /**
   * Ao baixar: o que fazer com a capa que veio no arquivo remoto. Devolve os campos da nota.
   *  - `capaImagem` presente → baixa a imagem (se falhar, guarda o caminho como pendente e mantém
   *    a capa atual; NUNCA deixa o caminho sumir, ou a próxima subida apagaria a capa do arquivo);
   *  - `capa` (link) → vale o link;
   *  - nenhuma das duas → se esta capa já tinha sido sincronizada, alguém a removeu: remove aqui
   *    também; se nunca foi sincronizada (arquivo escrito por versão antiga), mantém a local.
   */
  async _capaDoArquivoRemoto(metaNota, notaLocal = null) {
    const atual = {
      coverFileId: notaLocal?.coverFileId ?? null,
      coverRemote: notaLocal?.coverRemote,
      coverRemoteId: notaLocal?.coverRemoteId,
    };
    const caminho = typeof metaNota?.capaImagem === 'string' && metaNota.capaImagem.startsWith('imagens/') ? metaNota.capaImagem : null;

    if (caminho) {
      let res = null;
      try { res = await this.resolverImagem(caminho, null); } catch { res = null; }
      if (res?.fileId != null) return { coverUrl: null, coverFileId: res.fileId, coverRemote: caminho, coverRemoteId: res.fileId };
      // pendente: sem arquivo ainda, mas o caminho fica gravado
      return { coverUrl: null, coverFileId: null, coverRemote: caminho, coverRemoteId: null };
    }
    if (metaNota?.capa) return { ...atual, coverUrl: metaNota.capa, coverRemote: undefined, coverRemoteId: undefined };
    if (atual.coverRemote) return { coverUrl: null, coverFileId: null, coverRemote: undefined, coverRemoteId: undefined };
    return { ...atual, coverUrl: null };
  }

  /** Capas que ficaram pendentes (sem rede ou arquivo ainda não gravado): tenta baixar de novo. */
  async _completarCapasPendentes() {
    for (const nota of await this.store.listarNotasLocais()) {
      if (!nota.coverRemote || nota.coverRemoteId != null || nota.coverFileId != null || nota.coverUrl) continue;
      let res = null;
      try { res = await this.resolverImagem(nota.coverRemote, null); } catch { res = null; }
      if (res?.fileId != null) {
        await this.store.salvarNotaLocal({ ...nota, coverFileId: res.fileId, coverRemoteId: res.fileId });
      }
    }
  }

  _extrairPropriedadesDeMeta(meta) {
    const tratadas = new Set([
      'quickdock', 'id', 'uid', 'titulo', 'title', 'cor', 'color',
      'icone', 'icon', 'iconePreenchido', 'iconFilled', 'tituloOculto',
      'capa', 'capaImagem', 'capaPosicao', 'capaAltura', 'iconeImagem', 'iconeCorte', 'titleHidden', 'ordem', 'order', 'pasta', 'criadoEm', 'createdAt',
      'atualizadoEm', 'updatedAt', 'content', 'blocks', 'properties',
    ]);
    const props = { ...(meta?.properties || {}) };
    for (const [k, v] of Object.entries(meta || {})) {
      if (!tratadas.has(k) && v !== undefined && v !== null && !(k in props)) {
        props[k] = v;
      }
    }
    return props;
  }

  /**
   * Executa uma rodada completa de sincronização bidirecional.
   * @returns {Promise<{ baixadas: number, enviadas: number, conflitos: number, apagadas: number, puladas: number, notasConflito: Array, abortadoModelo?: boolean }>}
   */
  async sincronizar() {
    // Regra 3 (Tarefa 2): Nunca sincronize enquanto isEditingTemplate() for verdadeiro.
    // O editor está exibindo um modelo, não uma nota; sincronizar gravaria por cima.
    if (this.emModoModelo && this.emModoModelo()) {
      return { baixadas: 0, enviadas: 0, conflitos: 0, apagadas: 0, puladas: 0, notasConflito: [], abortadoModelo: true };
    }

    // Regra 1 (Tarefa 2): Antes de cada rodada, chame flushSave() para que o banco
    // reflita fielmente o que estiver no DOM.
    if (this.antesDeSincronizar) {
      await this.antesDeSincronizar();
    }

    await this.adapter.autenticar();

    const resultado = { baixadas: 0, enviadas: 0, conflitos: 0, apagadas: 0, puladas: 0, notasConflito: [], avisosVersao: [] };
    const cursor = await this.store.obterCursorSync();
    let maiorCursor = cursor;
    let tevePulo = false;
    const uidsPulados = new Set();
    const caminhosRecusadosPorVersao = new Set();

    // ── PASSO 1 & 2: Baixar o que mudou lá (sempre antes de subir) ─────────────
    // O adaptador pode devolver uma lista simples, ou `{ mudancas, cursor }`
    // quando ele sabe dizer qual é o cursor seguinte.
    //
    // Isso existe porque "cursor" significa coisas diferentes em cada destino, e
    // o motor não tem como adivinhar: no adaptador de memória é um contador; na
    // pasta local é a revisão "mtime-tamanho", que nem é número; no Drive é um
    // pageToken opaco do changes.list. O motor tentava avançar com
    // `Number(rev) > Number(cursor)`, o que dava NaN em tudo que não fosse
    // numérico -- o cursor nunca avançava e cada rodada reprocessava o destino
    // inteiro. Foi metade da causa do laço de conflitos em uso real.
    //
    // Quem sabe o que é o cursor é o adaptador. Quando ele diz, o motor obedece
    // e não tenta comparar nada.
    const resposta = await this.adapter.listarMudancas(cursor);
    const mudancasBrutas = Array.isArray(resposta) ? resposta : (resposta?.mudancas ?? []);
    // Processa criações e alterações antes de exclusões para que arquivos movidos de pasta
    // não sejam excluídos prematuramente antes do arquivo novo ser processado
    const mudancas = [...mudancasBrutas].sort((a, b) => (a.apagado === b.apagado ? 0 : a.apagado ? 1 : -1));
    const cursorDoAdaptador = Array.isArray(resposta) ? undefined : resposta?.cursor;

    for (const mudanca of mudancas) {
      const { caminho, rev, apagado } = mudanca;

      const ehModelo = caminho.startsWith('modelos/') && caminho.endsWith('.md');
      const ehQuadro = ehCaminhoDeQuadro(caminho);
      const ehNota = !ehModelo && !ehQuadro && caminho.endsWith('.md');

      if (!ehNota && !ehModelo && !ehQuadro) {
        if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) maiorCursor = rev;
        continue;
      }

      const estadoLocal = await this.store.obterEstadoSyncPorCaminho(caminho);

      // Tratamento específico de modelos na pasta modelos/
      if (ehModelo) {
        if (apagado) {
          if (!estadoLocal) continue;
          const modLocal = await this.store.obterModeloPorUid(estadoLocal.uid);
          if (!modLocal) {
            await this.store.excluirEstadoSync(estadoLocal.uid);
            continue;
          }
          const textoLocalMod = this.serializarModelo(modLocal);
          if (hashDaNota(textoLocalMod) === estadoLocal.hash) {
            await this.store.excluirModeloLocal(modLocal.uid);
            await this.store.excluirEstadoSync(modLocal.uid);
            resultado.apagadas++;
          } else {
            await this.store.salvarEstadoSync({ ...estadoLocal, rev: null, hash: null });
          }
          if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) maiorCursor = rev;
          continue;
        }

        const arqMod = await this.adapter.ler(caminho);
        if (!arqMod) continue;
        const revRemotaMod = arqMod.rev;
        const parsedMod = parseNoteFile(arqMod.texto);
        if (!parsedMod || !parsedMod.meta || !parsedMod.meta.id) {
          // Se o arquivo foi recusado por usar uma versão de formato mais recente do que
          // este cliente suporta, nunca devemos sobrescrevê-lo nem tentar aceitá-lo com perdas.
          const brutoMod = extrairMetadadosBrutos(arqMod.texto);
          if (brutoMod?.meta?.quickdock && brutoMod.meta.quickdock > FORMATO_QUICKDOCK_SUPORTADO) {
            tevePulo = true;
            resultado.puladas++;
            if (brutoMod.meta.id) uidsPulados.add(brutoMod.meta.id);
            caminhosRecusadosPorVersao.add(caminho);
            resultado.avisosVersao.push({
              caminho,
              titulo: brutoMod.meta.nome || brutoMod.meta.titulo || caminho,
              versao: brutoMod.meta.quickdock,
              mensagem: 'esta nota foi criada por uma versão mais nova do QuickDock',
            });
          }
          continue;
        }

        const uidMod = parsedMod.meta.id;
        const hashRemotoMod = hashDaNota(arqMod.texto);
        const modLocal = await this.store.obterModeloPorUid(uidMod);
        const estadoModPorUid = await this.store.obterEstadoSync(uidMod);

        if (!modLocal) {
          await this.store.salvarModeloLocal({
            uid: uidMod,
            name: parsedMod.meta.nome || parsedMod.meta.titulo || 'Sem título',
            kind: parsedMod.meta.tipo || parsedMod.meta.kind || 'note',
            content: parsedMod.md || '',
            ordem: parsedMod.meta.ordem ?? 'a0',
            createdAt: parsedMod.meta.criadoEm ? new Date(parsedMod.meta.criadoEm).getTime() : Date.now(),
            updatedAt: parsedMod.meta.atualizadoEm ? new Date(parsedMod.meta.atualizadoEm).getTime() : Date.now(),
          });
          await this.store.salvarEstadoSync({
            uid: uidMod,
            caminho,
            rev: revRemotaMod,
            hash: hashRemotoMod,
            sincronizadoEm: Date.now(),
          });
          resultado.baixadas++;
        } else {
          const textoModLocal = this.serializarModelo(modLocal);
          const hashModLocal = hashDaNota(textoModLocal);

          if (estadoModPorUid && estadoModPorUid.hash === hashRemotoMod && estadoModPorUid.rev === revRemotaMod) {
            if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) maiorCursor = rev;
            continue;
          }

          if (!estadoModPorUid || hashModLocal === estadoModPorUid.hash) {
            await this.store.salvarModeloLocal({
              ...modLocal,
              name: parsedMod.meta.nome || parsedMod.meta.titulo || modLocal.name,
              kind: parsedMod.meta.tipo || parsedMod.meta.kind || modLocal.kind,
              content: parsedMod.md || '',
              ordem: parsedMod.meta.ordem || modLocal.ordem,
              updatedAt: parsedMod.meta.atualizadoEm ? new Date(parsedMod.meta.atualizadoEm).getTime() : Date.now(),
            });
            await this.store.salvarEstadoSync({
              uid: uidMod,
              caminho,
              rev: revRemotaMod,
              hash: hashRemotoMod,
              sincronizadoEm: Date.now(),
            });
            resultado.baixadas++;
          } else {
            const uidConflitoMod = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            const nomeConflitoMod = `${modLocal.name} (conflito ${dataIsoHoje()}, ${this.deviceName})`;
            await this.store.salvarModeloLocal({
              ...modLocal,
              uid: uidConflitoMod,
              name: nomeConflitoMod,
              ordem: ordemEntre(modLocal.ordem ?? 'a0', null),
            });
            await this.store.salvarModeloLocal({
              ...modLocal,
              name: parsedMod.meta.nome || parsedMod.meta.titulo || modLocal.name,
              kind: parsedMod.meta.tipo || parsedMod.meta.kind || modLocal.kind,
              content: parsedMod.md || '',
              ordem: parsedMod.meta.ordem || modLocal.ordem,
              updatedAt: parsedMod.meta.atualizadoEm ? new Date(parsedMod.meta.atualizadoEm).getTime() : Date.now(),
            });
            await this.store.salvarEstadoSync({
              uid: uidMod,
              caminho,
              rev: revRemotaMod,
              hash: hashRemotoMod,
              sincronizadoEm: Date.now(),
            });
            resultado.conflitos++;
            resultado.baixadas++;
          }
        }
        if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) maiorCursor = rev;
        continue;
      }

      // Tratamento de quadros infinitos (.canvas / .json em quadros/)
      if (ehQuadro) {
        if (apagado) {
          if (!estadoLocal) continue;
          const quadroLocal = this.store.obterQuadroPorUid ? await this.store.obterQuadroPorUid(estadoLocal.uid) : null;
          if (!quadroLocal) {
            await this.store.excluirEstadoSync(estadoLocal.uid);
            continue;
          }
          const textoLocalQ = serializarQuadro(quadroLocal, await this._mapaArquivosDoQuadro(quadroLocal));
          if (hashDoQuadro(textoLocalQ) === estadoLocal.hash) {
            if (this.store.excluirQuadroLocal) await this.store.excluirQuadroLocal(quadroLocal.uid);
            await this.store.excluirEstadoSync(quadroLocal.uid);
            resultado.apagadas++;
          } else {
            await this.store.salvarEstadoSync({ ...estadoLocal, rev: null, hash: null });
          }
          if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) maiorCursor = rev;
          continue;
        }

        const arqQ = await this.adapter.ler(caminho);
        if (!arqQ) continue;
        const revRemotaQ = arqQ.rev;
        const parsedQ = parseQuadroFile(arqQ.texto);
        if (!parsedQ) continue;

        let uidQ = parsedQ.uid;
        if (!uidQ) {
          if (estadoLocal && estadoLocal.uid) {
            uidQ = estadoLocal.uid;
          } else {
            uidQ = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          }
          parsedQ.uid = uidQ;
        }

        const hashRemotoQ = hashDoQuadro(arqQ.texto);
        const quadroLocal = this.store.obterQuadroPorUid ? await this.store.obterQuadroPorUid(uidQ) : null;
        const estadoQPorUid = await this.store.obterEstadoSync(uidQ);
        const pastaDoCaminho = extrairPastaDoCaminhoQuadro(caminho);
        const pastaFinal = parsedQ.pasta || pastaDoCaminho;

        if (!quadroLocal) {
          if (this.store.salvarQuadroLocal) {
            await this.store.salvarQuadroLocal({
              uid: uidQ,
              title: parsedQ.title || 'Espaço Sem Título',
              pasta: pastaFinal,
              viewport: parsedQ.viewport || { x: 0, y: 0, zoom: 1 },
              bgMode: parsedQ.bgMode || 'stars',
              cards: parsedQ.cards || [],
              arrows: parsedQ.arrows || [],
              createdAt: parsedQ.createdAt || Date.now(),
              updatedAt: parsedQ.updatedAt || Date.now(),
            });
          }
          await this.store.salvarEstadoSync({
            uid: uidQ,
            caminho,
            rev: revRemotaQ,
            hash: hashRemotoQ,
            sincronizadoEm: Date.now(),
          });
          resultado.baixadas++;
        } else {
          const textoQLocal = serializarQuadro(quadroLocal, await this._mapaArquivosDoQuadro(quadroLocal));
          const hashQLocal = hashDoQuadro(textoQLocal);

          if (estadoQPorUid && estadoQPorUid.hash === hashRemotoQ && estadoQPorUid.rev === revRemotaQ) {
            if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) maiorCursor = rev;
            continue;
          }

          if (!estadoQPorUid || hashQLocal === estadoQPorUid.hash) {
            if (this.store.salvarQuadroLocal) {
              await this.store.salvarQuadroLocal({
                ...quadroLocal,
                title: parsedQ.title || quadroLocal.title,
                pasta: pastaFinal,
                viewport: parsedQ.viewport || quadroLocal.viewport,
                bgMode: parsedQ.bgMode || quadroLocal.bgMode,
                cards: (await this._preservarFileIds(parsedQ.cards, quadroLocal)) || quadroLocal.cards,
                arrows: parsedQ.arrows || quadroLocal.arrows,
                updatedAt: parsedQ.updatedAt || Date.now(),
              });
            }
            await this.store.salvarEstadoSync({
              uid: uidQ,
              caminho,
              rev: revRemotaQ,
              hash: hashRemotoQ,
              sincronizadoEm: Date.now(),
            });
            resultado.baixadas++;
          } else {
            const uidConflitoQ = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const nomeConflitoQ = `${quadroLocal.title} (conflito ${dataIsoHoje()}, ${this.deviceName})`;
            if (this.store.salvarQuadroLocal) {
              await this.store.salvarQuadroLocal({
                ...quadroLocal,
                uid: uidConflitoQ,
                title: nomeConflitoQ,
              });
              await this.store.salvarQuadroLocal({
                ...quadroLocal,
                title: parsedQ.title || quadroLocal.title,
                pasta: pastaFinal,
                viewport: parsedQ.viewport || quadroLocal.viewport,
                bgMode: parsedQ.bgMode || quadroLocal.bgMode,
                cards: (await this._preservarFileIds(parsedQ.cards, quadroLocal)) || quadroLocal.cards,
                arrows: parsedQ.arrows || quadroLocal.arrows,
                updatedAt: parsedQ.updatedAt || Date.now(),
              });
            }
            await this.store.salvarEstadoSync({
              uid: uidQ,
              caminho,
              rev: revRemotaQ,
              hash: hashRemotoQ,
              sincronizadoEm: Date.now(),
            });
            resultado.conflitos++;
            resultado.baixadas++;
          }
        }
        if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) maiorCursor = rev;
        continue;
      }

      // Cenário 2.1: Arquivo foi apagado no destino remoto
      if (apagado) {
        if (!estadoLocal) continue;

        // Se o registro de sincronização do UID já estiver associado a outro caminho
        // (ex.: a nota foi movida/renomeada na mesma rodada), não devemos apagar localmente.
        const estadoAtualUid = await this.store.obterEstadoSync(estadoLocal.uid);
        if (estadoAtualUid && estadoAtualUid.caminho !== caminho) {
          continue;
        }

        const notaLocal = await this.store.obterNotaPorUid(estadoLocal.uid);
        if (!notaLocal) {
          await this.store.excluirEstadoSync(estadoLocal.uid);
          continue;
        }

        const caminhoLocalEsperado = this._caminhoDesejado(notaLocal);
        if (caminhoLocalEsperado !== caminho) {
          // A nota foi movida localmente: não apagar!
          continue;
        }

        const uidAberta = this.obterNotaAbertaUid ? this.obterNotaAbertaUid() : null;
        const ehNotaAberta = uidAberta != null && uidAberta === estadoLocal.uid;
        if (ehNotaAberta) {
          const podeRecarregar = this.podeRecarregarNotaAberta ? this.podeRecarregarNotaAberta() : true;
          if (!podeRecarregar) {
            tevePulo = true;
            uidsPulados.add(estadoLocal.uid);
            resultado.puladas++;
            continue;
          }
        }

        // Verifica se o usuário editou localmente após o último sync
        const textoLocalAtual = this.serializarNota(notaLocal);
        const hashAtual = hashDaNota(textoLocalAtual);

        if (hashAtual === estadoLocal.hash) {
          // Nota não foi tocada localmente: exclusão remota propaga para cá
          await this.store.excluirNotaLocal(notaLocal.uid);
          await this.store.excluirEstadoSync(notaLocal.uid);
          resultado.apagadas++;
        } else {
          // Nota foi editada aqui enquanto era apagada lá:
          // Regra do QuickDock: a nota RESSUSCITA (edição do usuário nunca se perde).
          // Remove o vínculo com a revisão antiga para subir como novo arquivo no Passo 3.
          await this.store.salvarEstadoSync({
            ...estadoLocal,
            rev: null,
            hash: null,
          });
        }
        continue;
      }

      // Cenário 2.2: Arquivo criado ou atualizado no destino remoto
      const arquivoRemoto = await this.adapter.ler(caminho);
      if (!arquivoRemoto) continue;

      const { texto: textoRemoto, rev: revRemota } = arquivoRemoto;
      const parsed = parseNoteFile(textoRemoto);
      let mdCorpo = parsed?.md;
      let metaNota = parsed?.meta;
      let uid = metaNota?.id;

      if (!uid) {
        // Se a nota remota tem formato mais novo que este cliente não conhece (ex.: quickdock: 2),
        // recusa com segurança: pula sem escrever por cima e registra aviso explícito.
        const bruto = extrairMetadadosBrutos(textoRemoto);
        if (bruto?.meta?.quickdock && bruto.meta.quickdock > FORMATO_QUICKDOCK_SUPORTADO) {
          tevePulo = true;
          resultado.puladas++;
          if (bruto.meta.id) uidsPulados.add(bruto.meta.id);
          caminhosRecusadosPorVersao.add(caminho);
          resultado.avisosVersao.push({
            caminho,
            titulo: bruto.meta.titulo || bruto.meta.title || caminho,
            versao: bruto.meta.quickdock,
            mensagem: 'esta nota foi criada por uma versão mais nova do QuickDock',
          });
          continue;
        }

        // Adoção segura de arquivo .md externo (Obsidian, notas prévias, markdown comum):
        // QuickDock NUNCA apaga dados do usuário. Se o arquivo não possui 'id', geramos
        // um UID estável para ele e o adotamos no banco local.
        if (estadoLocal && estadoLocal.uid) {
          // Já tínhamos adotado este caminho anteriormente
          metaNota = { ...(metaNota || {}), id: estadoLocal.uid };
        } else {
          const novoUid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

          // Se não há frontmatter, todo o texto é o corpo markdown
          if (mdCorpo === undefined) {
            mdCorpo = textoRemoto;
          }

          // Extrai título do frontmatter ou do primeiro # Cabeçalho ou do nome do arquivo
          let tituloDerivado = metaNota?.titulo || metaNota?.title;
          if (!tituloDerivado) {
            const matchH1 = /^#\s+(.+)$/m.exec(mdCorpo);
            if (matchH1) {
              tituloDerivado = matchH1[1].trim();
            } else {
              const nomeBase = caminho.split('/').pop().replace(/\.md$/i, '');
              tituloDerivado = nomeBase || 'Sem título';
            }
          }

          metaNota = {
            ...(metaNota || {}),
            id: novoUid,
            titulo: tituloDerivado,
          };
        }
      }

      uid = metaNota.id;
      const hashRemoto = hashDaNota(textoRemoto);
      const notaLocal = await this.store.obterNotaPorUid(uid);
      const estadoPorUid = await this.store.obterEstadoSync(uid);

      if (!notaLocal && estadoPorUid && !estadoPorUid.caminho?.startsWith('modelos/')
        && (estadoPorUid.hash === hashRemoto || estadoPorUid.rev === revRemota)) {
        // A nota JÁ foi sincronizada por aqui, o arquivo remoto é exatamente o que registramos, e
        // ela não existe mais localmente: foi APAGADA aqui e a exclusão ainda não subiu (o passo 4
        // cuida disso). Não é uma nota nova: baixá-la de volta ressuscitaria o que a pessoa acabou
        // de apagar — era o que acontecia quando a exclusão vinha logo depois do envio, porque a
        // rodada seguinte recebe de volta o "eco" do próprio envio.
        // (Se o arquivo remoto MUDOU depois, cai no caminho abaixo: editada lá ≠ apagada aqui, e
        // preservar o texto vence.)
        if (!tevePulo && Number(revRemota) > Number(maiorCursor || 0)) maiorCursor = revRemota;
        continue;
      }

      if (!notaLocal) {
        // Nota não existe localmente: baixa como nota nova
        const blocks = parseMarkdownToBlocks(mdCorpo);
        const pasta = metaNota.pasta !== undefined ? metaNota.pasta : extrairPastaDoCaminho(caminho);
        const capaNova = await this._capaDoArquivoRemoto(metaNota, null);
        await this.store.salvarNotaLocal({
          uid,
          title: metaNota.titulo || 'Sem título',
          pasta,
          blocks,
          color: metaNota.cor ?? null,
          icon: metaNota.icone ?? null,
          iconFilled: !!metaNota.iconePreenchido,
          ...capaNova,
          coverPosition: typeof metaNota.capaPosicao === 'number' ? metaNota.capaPosicao : ((metaNota.capa || metaNota.capaImagem) ? 50 : undefined),
          coverHeight: metaNota.capaAltura ?? null,
          iconImage: this._iconImageDeMeta(metaNota, null),
          titleHidden: !!metaNota.tituloOculto,
          ordem: metaNota.ordem ?? 'a0',
          properties: this._extrairPropriedadesDeMeta(metaNota),
          // Sem inventar: se o arquivo não traz criadoEm, a nota fica sem ele, e a
          // reserialização volta a omitir o campo. Carimbar Date.now() aqui fazia o
          // arquivo nunca convergir — quem baixava regravava com um campo que quem
          // enviou não tinha, o outro lado via diferença e regravava sem, sem fim.
          // Com os dois clientes sincronizando ao mesmo tempo, virava conflito.
          createdAt: metaNota.criadoEm ? new Date(metaNota.criadoEm).getTime() : undefined,
          updatedAt: metaNota.atualizadoEm ? new Date(metaNota.atualizadoEm).getTime() : undefined,
        });

        // Se o arquivo remoto não tinha 'id' (foi adotado agora), gravamos os metadados
        // no arquivo sem alterar o texto para que futuros syncs mantenham a identidade estável.
        let revSalva = revRemota;
        let hashSalvo = hashRemoto;
        if (!parsed?.meta?.id) {
          try {
            const notaAdotada = await this.store.obterNotaPorUid(uid);
            if (notaAdotada) {
              const textoComMeta = this.serializarNota(notaAdotada);
              const resEscrita = await this.adapter.escrever(caminho, textoComMeta, revRemota);
              if (resEscrita && resEscrita.rev) {
                revSalva = resEscrita.rev;
                hashSalvo = hashDaNota(textoComMeta);
              }
            }
          } catch {
            // Em caso de falha de escrita, preserva a revisão original
          }
        }

        await this.store.salvarEstadoSync({
          uid,
          caminho,
          rev: revSalva,
          hash: hashSalvo,
          sincronizadoEm: Date.now(),
        });
        resultado.baixadas++;
      } else {
        // Nota existe localmente: verifica se houve alteração de ambos os lados
        const textoLocal = this.serializarNota(notaLocal);
        const hashLocal = hashDaNota(textoLocal);

        if (estadoPorUid && estadoPorUid.hash === hashRemoto && estadoPorUid.rev === revRemota && estadoPorUid.caminho === caminho) {
          // Conteúdo remoto é idêntico ao já sincronizado: nada a fazer no download
          continue;
        }

        // Regra 2 (Tarefa 2): Se a alteração remota for modificar a nota aberta,
        // só aplique se o editor não estiver com foco nem com edição pendente.
        // Caso contrário, pule a nota nesta rodada: ela sincroniza na próxima.
        const uidAberta = this.obterNotaAbertaUid ? this.obterNotaAbertaUid() : null;
        const ehNotaAberta = uidAberta != null && uidAberta === uid;
        if (ehNotaAberta) {
          const podeRecarregar = this.podeRecarregarNotaAberta ? this.podeRecarregarNotaAberta() : true;
          if (!podeRecarregar) {
            tevePulo = true;
            uidsPulados.add(uid);
            resultado.puladas++;
            continue;
          }
        }

        if (!estadoPorUid || hashLocal === estadoPorUid.hash) {
          // Lado local não foi editado (ou reconciliação inicial sem estado): remoto vence com segurança
          const blocks = parseMarkdownToBlocks(mdCorpo);
          this._preservarImagensLocais(notaLocal.blocks, blocks);
          const pasta = metaNota.pasta !== undefined ? metaNota.pasta : extrairPastaDoCaminho(caminho);
          const capaNova = await this._capaDoArquivoRemoto(metaNota, notaLocal);
          await this.store.salvarNotaLocal({
            ...notaLocal,
            uid,
            title: metaNota.titulo || notaLocal.title,
            pasta,
            blocks,
            color: metaNota.cor !== undefined ? metaNota.cor : notaLocal.color,
            icon: metaNota.icone !== undefined ? metaNota.icone : notaLocal.icon,
            iconFilled: metaNota.iconePreenchido !== undefined ? metaNota.iconePreenchido : notaLocal.iconFilled,
            ...capaNova,
            coverPosition: typeof metaNota.capaPosicao === 'number' ? metaNota.capaPosicao : ((metaNota.capa || metaNota.capaImagem) ? (notaLocal.coverPosition ?? 50) : undefined),
            coverHeight: metaNota.capaAltura !== undefined ? metaNota.capaAltura : (notaLocal.coverHeight ?? null),
            iconImage: this._iconImageDeMeta(metaNota, notaLocal),
            titleHidden: metaNota.tituloOculto !== undefined ? metaNota.tituloOculto : notaLocal.titleHidden,
            ordem: metaNota.ordem || notaLocal.ordem,
            properties: this._extrairPropriedadesDeMeta(metaNota),
            updatedAt: metaNota.atualizadoEm ? new Date(metaNota.atualizadoEm).getTime() : undefined,
          });
          await this.store.salvarEstadoSync({
            uid,
            caminho,
            rev: revRemota,
            hash: hashRemoto,
            sincronizadoEm: Date.now(),
          });
          resultado.baixadas++;

          if (ehNotaAberta && this.recarregarNotaAberta) {
            await this.recarregarNotaAberta(notaLocal.id ?? null, uid);
          }
        } else {
          // Conflito: ambos os lados mudaram em relação à base compartilhada!
          // Política: preserva os dois conteúdos. O remoto atualiza a nota local,
          // e o conteúdo local divergente é salvo como cópia de conflito com novo uid.
          const uidConflito = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

          const tituloConflito = tituloDeConflito(notaLocal.title, this.deviceName);
          const pastaLocal = notaLocal.pasta ? String(notaLocal.pasta).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
          const prefixoLocal = pastaLocal ? `notas/${pastaLocal}` : 'notas';
          const caminhoConflito = `${prefixoLocal}/${slugTitulo(notaLocal.title)} (conflito ${dataIsoHoje()}, ${this.deviceName}).md`;

          // 1. Salva a cópia de conflito com os dados locais.
          //
          // A cópia precisa de ordem PRÓPRIA, logo depois da original. Herdar a
          // mesma deixaria duas notas com a mesma chave de ordenação — e aí
          // mover qualquer uma das duas cai no caminho de reparo do
          // `moveNoteRecord`, que renumera a lista inteira. Um conflito não
          // pode degradar a ordenação de todas as outras notas.
          const notaConflito = {
            ...notaLocal,
            uid: uidConflito,
            title: tituloConflito,
            ordem: ordemEntre(notaLocal.ordem ?? 'a0', null),
          };
          delete notaConflito.id;
          await this.store.salvarNotaLocal(notaConflito);

          // 2. Atualiza a nota principal com o conteúdo que veio do remoto
          const blocks = parseMarkdownToBlocks(mdCorpo);
          this._preservarImagensLocais(notaLocal.blocks, blocks);
          const pastaRemota = metaNota.pasta !== undefined ? metaNota.pasta : extrairPastaDoCaminho(caminho);
          const capaNovaConflito = await this._capaDoArquivoRemoto(metaNota, notaLocal);
          await this.store.salvarNotaLocal({
            ...notaLocal,
            uid,
            title: metaNota.titulo || notaLocal.title,
            pasta: pastaRemota,
            blocks,
            color: metaNota.cor !== undefined ? metaNota.cor : notaLocal.color,
            icon: metaNota.icone !== undefined ? metaNota.icone : notaLocal.icon,
            iconFilled: metaNota.iconePreenchido !== undefined ? metaNota.iconePreenchido : notaLocal.iconFilled,
            ...capaNovaConflito,
            coverPosition: typeof metaNota.capaPosicao === 'number' ? metaNota.capaPosicao : ((metaNota.capa || metaNota.capaImagem) ? (notaLocal.coverPosition ?? 50) : undefined),
            iconImage: this._iconImageDeMeta(metaNota, notaLocal),
            titleHidden: metaNota.tituloOculto !== undefined ? metaNota.tituloOculto : notaLocal.titleHidden,
            ordem: metaNota.ordem || notaLocal.ordem,
            updatedAt: metaNota.atualizadoEm ? new Date(metaNota.atualizadoEm).getTime() : undefined,
          });

          await this.store.salvarEstadoSync({
            uid,
            caminho,
            rev: revRemota,
            hash: hashRemoto,
            sincronizadoEm: Date.now(),
          });

          resultado.conflitos++;
          resultado.baixadas++;
          resultado.notasConflito.push({
            tituloOriginal: notaLocal.title,
            tituloConflito,
            uidOriginal: uid,
            uidConflito,
            caminhoOriginal: caminho,
            caminhoConflito,
            criadoEm: Date.now(),
          });

          if (ehNotaAberta && this.recarregarNotaAberta) {
            await this.recarregarNotaAberta(notaLocal.id ?? null, uid);
          }
        }
      }

      if (!tevePulo && Number(rev) > Number(maiorCursor || 0)) {
        maiorCursor = rev;
      }
    }

    // ── PASSO 3: Subir o que mudou aqui ─────────────────────────────────────────
    // Antes de subir, cura títulos que uma versão anterior empilhou. Uma nota
    // chamada "X (conflito ...) (conflito ...) (conflito ...)" não é escolha de
    // ninguém: é dano do laço de conflito que existia até aqui. Deixar como está
    // seria manter na cara do usuário o estrago de um bug já corrigido.
    // Um único sufixo é preservado — esse pode ser legítimo.
    await this._curarTitulosEmpilhados();

    const notasLocais = await this.store.listarNotasLocais();

    // Capas que chegaram como pendentes (sem rede ou arquivo ainda não gravado) tentam de novo
    await this._completarCapasPendentes();

    for (let nota of notasLocais) {
      // SUBIR a nota aberta é sempre seguro: enviar só grava um arquivo e não
      // encosta no editor. Quem arrisca atropelar o que está sendo digitado é
      // BAIXAR, e essa parte continua adiando.
      //
      // Havia aqui uma segunda condição que também bloqueava a subida enquanto o
      // editor estivesse em foco. O efeito era grave e silencioso: uma nota
      // aberta simplesmente nunca era enviada -- nem na primeira vez. A pessoa
      // editava, clicava em sincronizar, e o arquivo nem chegava a existir na
      // pasta; do outro lado não havia o que buscar, e parecia que o outro
      // cliente é que estava travado.
      //
      // O adiamento por download continua: se a descida desta nota foi adiada
      // nesta rodada, subir agora colidiria com a versão remota que ainda não
      // foi reconciliada, e isso viraria cópia de conflito à toa.
      if (uidsPulados.has(nota.uid)) continue;

      // Traduz imagens locais para caminhos imutáveis ../imagens/<hash>.<ext> (ajustando profundidade da pasta)
      const caminhoNotaDesejado = this._caminhoDesejado(nota);
      const prefixoImagens = this._prefixoRelativoImagens(caminhoNotaDesejado);
      const mapaImagens = new Map();
      if (Array.isArray(nota.blocks)) {
        for (const b of nota.blocks) {
          if (b.type === 'image' && b.fileId != null) {
            try {
              const blob = this.store.obterBlobArquivo
                ? await this.store.obterBlobArquivo(b.fileId)
                : (this.store.obterArquivo ? (await this.store.obterArquivo(b.fileId))?.blob : null);
              if (blob) {
                const hash = await calcularHashImagem(blob);
                const ext = extensaoDeMimeOuNome(blob.type, blob.name);
                const caminhoRemoto = `imagens/${hash}.${ext}`;
                const caminhoRelativo = `${prefixoImagens}${hash}.${ext}`;
                mapaImagens.set(b.fileId, caminhoRelativo);

                // Grava na pasta imagens/ se ainda não existir no destino (deduplicação por conteúdo)
                const existe = await this.adapter.ler(caminhoRemoto);
                if (!existe) {
                  await this.adapter.escrever(caminhoRemoto, blob, null);
                }
              }
            } catch {
              // Se falhar o upload da imagem, a nota sobe normalmente e a imagem é marcada como não-sincronizada
            }
          }
        }
      }

      // Capa enviada do computador: sobe para imagens/ e o caminho entra na nota ANTES de serializar
      nota = await this._prepararCapa(nota);

      const texto = this.serializarNota(nota, mapaImagens);
      const hashAtual = hashDaNota(texto);
      const estado = await this.store.obterEstadoSync(nota.uid);

      if (!estado) {
        // Nota criada localmente: sobe arquivo novo respeitando a pasta
        const caminho = caminhoNotaDesejado;
        // Proteção contra sobrescrita de arquivo remoto recusado por versão mais nova
        if (caminhosRecusadosPorVersao.has(caminho)) continue;
        const res = await this.adapter.escrever(caminho, texto, null);

        if (res && res.rev) {
          await this.store.salvarEstadoSync({
            uid: nota.uid,
            caminho,
            rev: res.rev,
            hash: hashAtual,
            sincronizadoEm: Date.now(),
          });
          if (!tevePulo && Number(res.rev) > Number(maiorCursor || 0)) maiorCursor = res.rev;
          resultado.enviadas++;
        } else if (res && res.conflito) {
          // Arquivo já existia no remoto com outro conteúdo: gera caminho único
          const slug = slugTitulo(nota.title);
          const pasta = nota.pasta ? String(nota.pasta).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
          const caminhoAlt = pasta ? `notas/${pasta}/${slug}-${nota.uid.slice(0, 8)}.md` : `notas/${slug}-${nota.uid.slice(0, 8)}.md`;
          const resAlt = await this.adapter.escrever(caminhoAlt, texto, null);
          if (resAlt && resAlt.rev) {
            await this.store.salvarEstadoSync({
              uid: nota.uid,
              caminho: caminhoAlt,
              rev: resAlt.rev,
              hash: hashAtual,
              sincronizadoEm: Date.now(),
            });
            if (!tevePulo && Number(resAlt.rev) > Number(maiorCursor || 0)) maiorCursor = resAlt.rev;
            resultado.enviadas++;
          }
        }
      } else if (estado.hash !== hashAtual) {
        // Se o arquivo remoto estiver numa versão mais nova recusada, não sobrescreve
        if (caminhosRecusadosPorVersao.has(estado.caminho)) continue;

        // Renomear a nota ou mover de pasta altera o caminho do arquivo.
        // A identidade continua sendo o `id` do frontmatter.
        const caminhoUsado = await this._renomearSePreciso(nota, estado);
        if (caminhosRecusadosPorVersao.has(caminhoUsado)) continue;

        // Nota editada localmente: tenta atualizar com revBase
        const revBase = caminhoUsado === estado.caminho ? estado.rev : null;
        const res = await this.adapter.escrever(caminhoUsado, texto, revBase);

        if (res && res.rev) {
          // O antigo só sai depois que o novo já está gravado. Na ordem inversa,
          // uma falha no meio deixaria a nota sem arquivo nenhum.
          if (caminhoUsado !== estado.caminho) {
            try { await this.adapter.apagar(estado.caminho); } catch { /* sobra é melhor que perda */ }
          }
          await this.store.salvarEstadoSync({
            uid: nota.uid,
            caminho: caminhoUsado,
            rev: res.rev,
            hash: hashAtual,
            sincronizadoEm: Date.now(),
          });
          if (!tevePulo && Number(res.rev) > Number(maiorCursor || 0)) maiorCursor = res.rev;
          resultado.enviadas++;
        } else if (res && res.conflito) {
          // Colisão na subida: gera arquivo de cópia de conflito no destino
          const tituloConflito = tituloDeConflito(nota.title, this.deviceName);
          const pasta = nota.pasta ? String(nota.pasta).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
          const prefixo = pasta ? `notas/${pasta}` : 'notas';
          const caminhoConflito = `${prefixo}/${slugTitulo(nota.title)} (conflito ${dataIsoHoje()}, ${this.deviceName}).md`;
          const resConf = await this.adapter.escrever(caminhoConflito, texto, null);
          if (resConf && resConf.rev) {
            if (!tevePulo && Number(resConf.rev) > Number(maiorCursor || 0)) maiorCursor = resConf.rev;
            resultado.conflitos++;
            resultado.notasConflito.push({
              tituloOriginal: nota.title,
              tituloConflito,
              uidOriginal: nota.uid,
              uidConflito: null,
              caminhoOriginal: estado.caminho,
              caminhoConflito,
              criadoEm: Date.now(),
            });
          }
        }
      }
    }

    // ── PASSO 3.1: Subir modelos locais ─────────────────────────────────────────
    if (this.store.listarModelosLocais) {
      const modelosLocais = await this.store.listarModelosLocais();
      for (const mod of modelosLocais) {
        if (uidsPulados.has(mod.uid)) continue;
        const textoMod = this.serializarModelo(mod);
        const hashAtualMod = hashDaNota(textoMod);
        const estadoMod = await this.store.obterEstadoSync(mod.uid);

        if (!estadoMod) {
          const caminhoMod = `modelos/${slugTitulo(mod.name)}.md`;
          if (caminhosRecusadosPorVersao.has(caminhoMod)) continue;
          const res = await this.adapter.escrever(caminhoMod, textoMod, null);
          if (res && res.rev) {
            await this.store.salvarEstadoSync({
              uid: mod.uid,
              caminho: caminhoMod,
              rev: res.rev,
              hash: hashAtualMod,
              sincronizadoEm: Date.now(),
            });
            if (!tevePulo && Number(res.rev) > Number(maiorCursor || 0)) maiorCursor = res.rev;
            resultado.enviadas++;
          }
        } else if (estadoMod.hash !== hashAtualMod) {
          if (caminhosRecusadosPorVersao.has(estadoMod.caminho)) continue;
          const res = await this.adapter.escrever(estadoMod.caminho, textoMod, estadoMod.rev);
          if (res && res.rev) {
            await this.store.salvarEstadoSync({
              uid: mod.uid,
              caminho: estadoMod.caminho,
              rev: res.rev,
              hash: hashAtualMod,
              sincronizadoEm: Date.now(),
            });
            if (!tevePulo && Number(res.rev) > Number(maiorCursor || 0)) maiorCursor = res.rev;
            resultado.enviadas++;
          }
        }
      }
    }

    // ── PASSO 3.2: Subir quadros locais ─────────────────────────────────────────
    if (this.store.listarQuadrosLocais) {
      const quadrosLocais = await this.store.listarQuadrosLocais();
      for (const q of quadrosLocais) {
        if (uidsPulados.has(q.uid)) continue;
        const textoQ = serializarQuadro(q, await this._mapaArquivosDoQuadro(q));
        const hashAtualQ = hashDoQuadro(textoQ);
        const estadoQ = await this.store.obterEstadoSync(q.uid);

        if (!estadoQ) {
          const caminhoQ = this._caminhoDesejadoQuadro(q);
          if (caminhosRecusadosPorVersao.has(caminhoQ)) continue;
          const res = await this.adapter.escrever(caminhoQ, textoQ, null);
          if (res && res.rev) {
            await this.store.salvarEstadoSync({
              uid: q.uid,
              caminho: caminhoQ,
              rev: res.rev,
              hash: hashAtualQ,
              sincronizadoEm: Date.now(),
            });
            if (!tevePulo && Number(res.rev) > Number(maiorCursor || 0)) maiorCursor = res.rev;
            resultado.enviadas++;
          }
        } else if (estadoQ.hash !== hashAtualQ) {
          if (caminhosRecusadosPorVersao.has(estadoQ.caminho)) continue;
          const caminhoDesejado = this._caminhoDesejadoQuadro(q);
          const caminhoUsado = (caminhoDesejado !== estadoQ.caminho) ? caminhoDesejado : estadoQ.caminho;
          const revBase = caminhoUsado === estadoQ.caminho ? estadoQ.rev : null;
          const res = await this.adapter.escrever(caminhoUsado, textoQ, revBase);
          if (res && res.rev) {
            if (caminhoUsado !== estadoQ.caminho) {
              try { await this.adapter.apagar(estadoQ.caminho); } catch {}
            }
            await this.store.salvarEstadoSync({
              uid: q.uid,
              caminho: caminhoUsado,
              rev: res.rev,
              hash: hashAtualQ,
              sincronizadoEm: Date.now(),
            });
            if (!tevePulo && Number(res.rev) > Number(maiorCursor || 0)) maiorCursor = res.rev;
            resultado.enviadas++;
          }
        }
      }
    }

    // ── PASSO 4: Exclusões locais para subir ao destino ─────────────────────────
    const todosEstados = await this.store.listarTodosEstadosSync();
    for (const est of todosEstados) {
      if (est.caminho.startsWith('modelos/')) {
        const modExiste = this.store.obterModeloPorUid ? await this.store.obterModeloPorUid(est.uid) : null;
        if (!modExiste) {
          await this.adapter.apagar(est.caminho);
          await this.store.excluirEstadoSync(est.uid);
          resultado.apagadas++;
        }
      } else if (ehCaminhoDeQuadro(est.caminho)) {
        const quadroExiste = this.store.obterQuadroPorUid ? await this.store.obterQuadroPorUid(est.uid) : null;
        if (!quadroExiste) {
          await this.adapter.apagar(est.caminho);
          await this.store.excluirEstadoSync(est.uid);
          resultado.apagadas++;
        }
      } else {
        const notaExiste = await this.store.obterNotaPorUid(est.uid);
        if (!notaExiste) {
          // Usuário apagou localmente: propaga exclusão
          await this.adapter.apagar(est.caminho);
          await this.store.excluirEstadoSync(est.uid);
          resultado.apagadas++;
        }
      }
    }

    // Cursor dito pelo adaptador vence. Só se ele não disser nada é que o motor
    // usa o palpite numérico -- que funciona no adaptador de memória e é inócuo
    // nos outros, já que ali ele simplesmente não avança.
    //
    // Nada disso avança quando algo foi adiado nesta rodada (`tevePulo`): o que
    // foi pulado precisa ser reencontrado na próxima, e um cursor à frente o
    // esconderia para sempre.
    if (cursorDoAdaptador !== undefined && !tevePulo) {
      if (cursorDoAdaptador !== cursor) await this.store.salvarCursorSync(cursorDoAdaptador);
    } else if (maiorCursor !== cursor) {
      await this.store.salvarCursorSync(maiorCursor);
    }

    return resultado;
  }

  /**
   * Resolve uma imagem remota sob demanda (download preguiçoso).
   * Lê o arquivo de imagens/<hash>.<ext> no adaptador e grava no store local (files),
   * devolvendo o novo fileId local criado.
   */
  async resolverImagem(caminhoImagem, notaUid = null) {
    if (!caminhoImagem || typeof caminhoImagem !== 'string') return null;
    const caminhoRemoto = caminhoImagem.replace(/^(?:\.\.\/)+/, '');
    if (!caminhoRemoto.startsWith('imagens/')) return null;

    const nomeArquivo = caminhoRemoto.split('/').pop();

    if (this.cacheImagensLocais.has(caminhoRemoto)) {
      const idExistente = this.cacheImagensLocais.get(caminhoRemoto);
      if (notaUid) await this._associarImagemLocalANota(notaUid, caminhoImagem, idExistente);
      this._lembrarArquivoEnviado(idExistente, caminhoRemoto);
      return { fileId: idExistente };
    }

    // O cache acima vive só em memória e zera quando o painel fecha. O banco não:
    // como o nome do arquivo É o hash do conteúdo, procurar por ele encontra a
    // mesma imagem com certeza. Sem esta busca, reabrir o painel e abrir uma
    // segunda nota que usa a mesma imagem baixaria tudo de novo e guardaria uma
    // cópia a mais — desperdício do disco de quem usa, com prints de megabytes.
    if (this.store.obterArquivoPorNome) {
      const jaTem = await this.store.obterArquivoPorNome(nomeArquivo);
      if (jaTem && jaTem.id != null) {
        this.cacheImagensLocais.set(caminhoRemoto, jaTem.id);
        if (notaUid) await this._associarImagemLocalANota(notaUid, caminhoImagem, jaTem.id);
        this._lembrarArquivoEnviado(jaTem.id, caminhoRemoto);
        return { fileId: jaTem.id };
      }
    }

    const arq = await this.adapter.ler(caminhoRemoto);
    if (!arq) return null;

    const ext = nomeArquivo.split('.').pop().toLowerCase();
    const MIMES = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
      avif: 'image/avif', bmp: 'image/bmp',
      mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg',
      pdf: 'application/pdf',
    };
    const mime = MIMES[ext] || 'image/png';
    const blob = arq.blob || arq.conteudo || arq.texto;

    let fileId = null;
    if (this.store.salvarArquivo) {
      fileId = await this.store.salvarArquivo({
        name: nomeArquivo,
        type: mime,
        blob,
        inline: true,
      });
    }

    if (fileId != null) {
      this.cacheImagensLocais.set(caminhoRemoto, fileId);
      if (notaUid) {
        await this._associarImagemLocalANota(notaUid, caminhoImagem, fileId);
      }
    }

    if (fileId != null) this._lembrarArquivoEnviado(fileId, caminhoRemoto);
    return { fileId, blob };
  }

  /**
   * Decide em qual caminho a nota deve ser gravada quando o título mudou.
   *
   * Não renomeia se o destino já existir: dois títulos diferentes podem gerar o
   * mesmo apelido de arquivo, e sobrescrever seria apagar a nota de outra
   * pessoa. Nome feio é melhor que nota perdida — e o `id` do frontmatter
   * continua sendo a identidade, então ficar com o nome antigo não quebra nada.
   */
  async _renomearSePreciso(nota, estado) {
    // Se a nota foi adotada fora de notas/ (ex: raiz "arquivo.md" ou subpasta externa)
    // e o título/pasta não mudou, preserva o caminho existente
    const slugAtual = slugTitulo(nota.title);
    const pastaNota = nota.pasta ? String(nota.pasta).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
    const pastaEstado = extrairPastaDoCaminho(estado.caminho);
    const nomeBaseEstado = estado.caminho.split('/').pop().replace(/\.md$/i, '');

    if (!estado.caminho.startsWith('notas/') && pastaEstado === pastaNota && nomeBaseEstado === slugAtual) {
      return estado.caminho;
    }

    const desejado = this._caminhoDesejado(nota);
    if (desejado === estado.caminho) return estado.caminho;

    try {
      const ocupado = await this.adapter.ler(desejado);
      if (ocupado) return estado.caminho;
    } catch {
      return estado.caminho;   // na dúvida, não mexe no nome
    }
    return desejado;
  }

  async _curarTitulosEmpilhados() {
    const notas = await this.store.listarNotasLocais();
    for (const nota of notas) {
      const titulo = String(nota.title ?? '');
      // Dois ou mais sufixos empilhados = dano. Um só pode ser conflito de verdade.
      const quantos = (titulo.match(/\(conflito \d{4}-\d{2}-\d{2}, [^)]*\)/g) || []).length;
      if (quantos < 2) continue;

      let base = titulo.trim(), antes;
      do { antes = base; base = base.replace(SUFIXO_CONFLITO, '').trim(); } while (base !== antes);
      const primeiro = titulo.match(/\(conflito \d{4}-\d{2}-\d{2}, [^)]*\)/)[0];
      const limpo = `${base || 'Sem título'} ${primeiro}`;
      if (limpo !== titulo) await this.store.salvarNotaLocal({ ...nota, title: limpo });
    }
  }

  async _associarImagemLocalANota(notaUid, caminhoImagem, fileId) {
    const nota = await this.store.obterNotaPorUid(notaUid);
    if (!nota || !Array.isArray(nota.blocks)) return;
    let mudou = false;
    for (const b of nota.blocks) {
      if (b.type === 'image' && (b.imagePath === caminhoImagem || b.src === caminhoImagem)) {
        b.fileId = fileId;
        mudou = true;
      }
    }
    if (mudou) {
      await this.store.salvarNotaLocal(nota);
    }
  }

  async resolverImagensDaNota(notaOuUid) {
    const nota = typeof notaOuUid === 'string'
      ? await this.store.obterNotaPorUid(notaOuUid)
      : notaOuUid;
    if (!nota || !Array.isArray(nota.blocks)) return;

    let mudou = false;
    for (const b of nota.blocks) {
      if (b.type === 'image' && b.fileId == null && b.imagePath) {
        const res = await this.resolverImagem(b.imagePath, nota.uid);
        if (res && res.fileId != null) {
          b.fileId = res.fileId;
          mudou = true;
        }
      }
    }
    if (mudou) {
      await this.store.salvarNotaLocal(nota);
    }
  }

  /**
   * Quando blocos de imagem descem sem `fileId`, tenta reencontrar o arquivo
   * local correspondente — mas só quando dá pra ter CERTEZA de qual é.
   *
   * Uma versão anterior casava pela ordem de ocorrência quando o texto
   * alternativo não ajudava. Casar por posição não é identificar, é chutar: se
   * o outro aparelho apagou a primeira imagem e manteve a segunda, o bloco
   * passa a exibir a imagem errada, com toda a confiança e sem aviso nenhum.
   * É o mesmo estrago que a troca de `quickdock:file/<id>` por hash existiu
   * pra impedir, voltando por uma heurística.
   *
   * A regra agora é errar pra menos: sem certeza, o bloco fica sem `fileId` e
   * aparece como imagem indisponível. Indisponível é honesto; errada não é.
   */
  _preservarImagensLocais(blocosLocais, novosBlocos) {
    if (!Array.isArray(blocosLocais) || !Array.isArray(novosBlocos)) return;
    const imagensLocais = blocosLocais.filter(b => b.type === 'image' && b.fileId != null);
    if (!imagensLocais.length) return;

    const candidatos = novosBlocos.filter(b => b.type === 'image' && b.fileId == null);
    if (!candidatos.length) return;

    const usados = new Set();

    // 1. Identidade de verdade: mesmo caminho = mesmo hash = mesma imagem.
    for (const nb of candidatos) {
      if (!nb.imagePath) continue;
      const igual = imagensLocais.find(ib => ib.imagePath === nb.imagePath && !usados.has(ib.fileId));
      if (igual) {
        nb.fileId = igual.fileId;
        usados.add(igual.fileId);
      }
    }

    // 2. Texto alternativo, e só quando ele identifica sozinho: não-vazio e
    //    único dos DOIS lados. Dois blocos com o mesmo alt não identificam nada,
    //    e alt vazio identifica menos ainda.
    const contar = (lista, pegar) => {
      const n = new Map();
      for (const b of lista) {
        const k = pegar(b);
        if (k) n.set(k, (n.get(k) ?? 0) + 1);
      }
      return n;
    };
    const alt = b => (b.alt ?? '').trim();
    const quantosLocais = contar(imagensLocais, alt);
    const quantosNovos  = contar(candidatos, alt);

    for (const nb of candidatos) {
      if (nb.fileId != null) continue;
      const a = alt(nb);
      if (!a || quantosLocais.get(a) !== 1 || quantosNovos.get(a) !== 1) continue;
      const unico = imagensLocais.find(ib => alt(ib) === a && !usados.has(ib.fileId));
      if (unico) {
        nb.fileId = unico.fileId;
        usados.add(unico.fileId);
      }
    }

    // O que sobrou fica sem fileId de propósito.
  }
}
