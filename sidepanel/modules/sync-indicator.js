// ── sync-indicator.js ───────────────────────────────────────────────────────
// Indicador de sincronização sempre visível, fora do menu. Mostra de relance se está tudo certo,
// se está sincronizando, se deu erro, se não há internet ou se a sincronização está desligada.
// Tocar nele abre o painel de sincronização (os detalhes e o botão "Sincronizar agora").
//
// Onde aparece:
//   • desktop — o botão de sincronização do cabeçalho ganha o ícone certo e um selo de texto;
//   • mobile  — um selo no topo, no meio, em cada tela (nota, quadro e views da Base), entre os
//               botões flutuantes das asides.

import { descreverEstado } from './sync-ui-model.js';

const HOSTS_MOBILE = ['#section-note', '#board-view', '#bases-view'];
const ATUALIZA_TEMPO_MS = 30_000;   // "há 3 min" envelhece sozinho

export function iniciarIndicadorDeSincronizacao(controlador) {
  // Desktop: o botão do cabeçalho já existe; só ganha o selo de texto
  const botaoCabecalho = document.getElementById('btn-header-sync');
  if (botaoCabecalho && !botaoCabecalho.querySelector('.sync-selo')) {
    const selo = document.createElement('span');
    selo.className = 'sync-selo';
    botaoCabecalho.appendChild(selo);
    botaoCabecalho.dataset.syncIndicador = '';
    botaoCabecalho.classList.add('sync-indicador');
  }

  // Mobile: um selo por tela
  for (const sel of HOSTS_MOBILE) {
    const host = document.querySelector(sel);
    if (!host || host.querySelector(':scope > .sync-indicador')) continue;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'sync-indicador sync-indicador-flutuante';
    botao.dataset.syncIndicador = '';
    botao.innerHTML = '<span class="material-symbols-rounded sync-icone" aria-hidden="true"></span><span class="sync-selo"></span>';
    host.appendChild(botao);
  }

  const todos = () => document.querySelectorAll('[data-sync-indicador]');

  function atualizar() {
    const d = descreverEstado(controlador.obterResumoEstado(), { online: navigator.onLine !== false });
    for (const el of todos()) {
      el.dataset.tipo = d.tipo;
      el.title = d.titulo;
      el.setAttribute('aria-label', d.titulo);
      el.classList.toggle('tem-conflito', d.conflitos > 0);
      el.querySelector('.sync-selo').textContent = d.texto;
      // o ícone do botão do cabeçalho é o <span> que já existia; nos flutuantes é o .sync-icone
      const icone = el.querySelector('.sync-icone') || el.querySelector('.material-symbols-rounded');
      if (icone) icone.textContent = d.icone;
    }
  }

  // Tocar abre o painel. O fluxo antigo (btn-header-sync) já faz isso; só os selos novos precisam
  document.addEventListener('click', e => {
    const botao = e.target.closest?.('.sync-indicador-flutuante');
    if (!botao) return;
    e.stopPropagation();
    controlador.abrirPopover(botao);
  });

  controlador.adicionarListener(atualizar);
  window.addEventListener('online', atualizar);
  window.addEventListener('offline', atualizar);
  setInterval(() => { if (!document.hidden) atualizar(); }, ATUALIZA_TEMPO_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar(); });
  atualizar();
}
