// ── sync-gate.js ────────────────────────────────────────────────────────────
// Trava ao abrir uma nota: antes de abrir, sincroniza e só então deixa abrir. Assim a pessoa nunca
// começa a editar em cima de uma versão velha — a causa mais comum das cópias de conflito entre
// celular e computador.
//
// Como funciona: toda abertura de nota passa pelo evento `quickdock:activate-note`. Um ouvinte na
// fase de captura da janela (roda antes de todos os outros) segura esse evento, mostra "Sincronizando…",
// e quando a rodada termina dispara o MESMO evento de novo, marcado como já liberado.
//
// A trava nunca prende a pessoa: demorando mais de alguns segundos ou falhando, aparecem
// "Tentar de novo" e "Abrir mesmo assim". Se a sincronização terminar sozinha enquanto isso, abre.

import { decidirTrava } from './sync-ui-model.js';

const ESPERA_ATE_OFERECER_MS = 5000;
const EVENTO = 'quickdock:activate-note';

let overlay = null;
let emAndamento = false;   // uma trava por vez: toques repetidos não empilham
let liberadoAte = 0;       // depois de liberar, os redisparos internos do app (trocar de tela etc.) passam direto
const JANELA_LIBERADA_MS = 4000;

function criarOverlay() {
  const el = document.createElement('div');
  el.id = 'sync-gate';
  el.className = 'sync-gate';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'sync-gate-titulo');
  el.innerHTML = `
    <div class="sync-gate-card">
      <span class="material-symbols-rounded sync-gate-icone" aria-hidden="true">sync</span>
      <div class="sync-gate-titulo" id="sync-gate-titulo">Sincronizando…</div>
      <div class="sync-gate-texto">Buscando a versão mais nova da nota antes de abrir.</div>
      <div class="sync-gate-acoes" hidden>
        <button type="button" class="sync-gate-btn is-primario" data-acao="repetir">Tentar de novo</button>
        <button type="button" class="sync-gate-btn" data-acao="abrir">Abrir mesmo assim</button>
        <button type="button" class="sync-gate-btn is-discreto" data-acao="cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function mostrar({ titulo, texto, icone = 'sync', girando = true, acoes = false }) {
  overlay ??= criarOverlay();
  overlay.hidden = false;
  overlay.classList.toggle('is-girando', girando);
  overlay.classList.toggle('is-falha', !girando && icone !== 'sync');
  overlay.querySelector('.sync-gate-icone').textContent = icone;
  overlay.querySelector('.sync-gate-titulo').textContent = titulo;
  overlay.querySelector('.sync-gate-texto').textContent = texto;
  overlay.querySelector('.sync-gate-acoes').hidden = !acoes;
  if (acoes) overlay.querySelector('[data-acao="repetir"]').focus({ preventScroll: true });
}

function esconder() {
  if (overlay) overlay.hidden = true;
}

/**
 * @param {Object} opcoes
 * @param {() => import('./sync-controller.js').SyncController|null} opcoes.obterControlador
 * @param {() => number|null} opcoes.obterIdAtivo   id da nota aberta agora (para não travar a mesma nota)
 * @param {(id:any) => number|null} opcoes.obterCriacao   quando a nota foi criada (ms), se souber
 */
export function iniciarTravaDeAbertura({ obterControlador, obterIdAtivo, obterCriacao }) {
  // A decisão é SÍNCRONA de propósito: depois de qualquer `await` o evento já passou para os outros ouvintes.
  window.addEventListener(EVENTO, (e) => {
    const detalhe = e.detail || {};
    const controlador = obterControlador();
    if (!controlador || emAndamento) return;                     // sem sincronização, ou já há uma trava aberta

    const resumo = controlador.obterResumoEstado();
    const id = detalhe.id ?? null;
    const decisao = decidirTrava({
      estado: resumo.state,
      online: navigator.onLine !== false,
      ultimaSync: resumo.lastSyncAt,
      mesmaNota: id != null && id === obterIdAtivo(),
      notaCriadaEm: id != null ? obterCriacao(id) : null,
      criarSeFaltar: !!detalhe.createIfMissing,
      jaPassou: !!detalhe.liberado || Date.now() < liberadoAte,
    });
    if (!decisao.travar) return;                                  // deixa o evento seguir normalmente

    // Segura a abertura: nenhum outro ouvinte vê este evento até a trava liberar
    e.stopImmediatePropagation();
    emAndamento = true;
    esperarSincronizacao(controlador).then(liberar => {
      if (liberar) {
        liberadoAte = Date.now() + JANELA_LIBERADA_MS;
        document.dispatchEvent(new CustomEvent(EVENTO, { detail: { ...detalhe, liberado: true } }));
      }
    }).finally(() => {
      emAndamento = false;
      esconder();
    });
  }, true);
}

/** @returns {Promise<boolean>} true = pode abrir; false = a pessoa cancelou */
function esperarSincronizacao(controlador) {
  return new Promise(resolver => {
    let terminou = false;
    let ultimoErro = null;
    let timer = null;
    const fim = (podeAbrir) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      overlay?.removeEventListener('click', aoClicar);
      resolver(podeAbrir);
    };

    const oferecer = (titulo, texto, icone) => mostrar({ titulo, texto, icone, girando: false, acoes: true });

    const tentar = () => {
      ultimoErro = null;
      mostrar({ titulo: 'Sincronizando…', texto: 'Buscando a versão mais nova da nota antes de abrir.' });
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!terminou && ultimoErro === null) oferecer('Está demorando…', 'Você pode esperar mais um pouco ou abrir a nota agora. Se terminar sozinho, ela abre.', 'hourglass_top');
      }, ESPERA_ATE_OFERECER_MS);

      controlador.sincronizarParaAbrir().then(r => {
        if (terminou) return;
        if (r.ok) { fim(true); return; }                          // deu certo (mesmo depois do aviso de demora): abre
        ultimoErro = r.erro;
        oferecer('Não foi possível sincronizar', `${r.erro} Você pode tentar de novo ou abrir a nota mesmo assim (ela pode estar desatualizada).`, 'cloud_alert');
      }).catch(err => {
        if (terminou) return;
        ultimoErro = String(err?.message || err);
        oferecer('Não foi possível sincronizar', `${ultimoErro} Você pode tentar de novo ou abrir a nota mesmo assim.`, 'cloud_alert');
      });
    };

    function aoClicar(ev) {
      const acao = ev.target.closest?.('[data-acao]')?.dataset.acao;
      if (acao === 'repetir') tentar();
      else if (acao === 'abrir') fim(true);
      else if (acao === 'cancelar') fim(false);
    }

    overlay ??= criarOverlay();
    overlay.addEventListener('click', aoClicar);
    tentar();
  });
}
