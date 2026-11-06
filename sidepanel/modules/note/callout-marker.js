// Marcador do destaque: a primeira linha de um destaque tem o texto editável
// "> [!NOTE]" (classe callout-marker). É pelo marcador que a pessoa muda o tipo
// (NOTE → TIP) ou tira o destaque (apaga o "[!" e sobra só a citação), como no
// markdown. O marcador só aparece com o cursor no destaque (live-syntax.css);
// fora disso o rótulo colorido é que aparece.
import { markCalloutEdges } from './block-ops.js';
import { getContentEl, setBlockCallout } from './block-structure.js';
import { setCaretOffset } from './caret.js';
import { root } from './state.js';
import { scheduleSave } from './template-mode.js';

export const CALLOUT_KEYWORDS = /^>?\s*\[!(note|tip|important|warning|caution)\]/i;

export function buildCalloutMarker(tipo) {
  const marcador = document.createElement('span');
  marcador.className = 'callout-marker';
  marcador.contentEditable = 'true';
  marcador.spellcheck = false;
  marcador.textContent = `> [!${tipo.toUpperCase()}]`;
  return marcador;
}

// Garante o marcador certo no primeiro bloco de cada destaque e tira dos demais.
// Chamado junto com markCalloutEdges (renumberLists), que já calcula as pontas.
export function syncCalloutMarker(block) {
  const content = getContentEl(block);
  const existente = content.querySelector(':scope > .callout-marker');
  if (block.dataset.callout && block.dataset.calloutFirst === 'true') {
    if (!existente) content.prepend(buildCalloutMarker(block.dataset.callout));
  } else {
    existente?.remove();
  }
}

// Edição do marcador. Enquanto a pessoa digita, o tipo muda assim que "[!tipo]"
// está completo (NOTE → TIP). Se ela sai do marcador sem uma palavra-chave válida
// (apagou o "[!…]"), o destaque acaba e o bloco fica como citação. Não se desfaz
// no meio da digitação: senão trocar "> [!NOTE]" por "> [!TIP]" apagaria o
// destaque ao digitar o primeiro caractere.
root.addEventListener('input', () => {
  const no = document.getSelection()?.anchorNode;
  const marcador = no?.parentElement?.closest?.('.callout-marker');
  const bloco = (no?.nodeType === Node.TEXT_NODE ? no.parentElement : no)?.closest?.('.block');
  if (!bloco || bloco.parentElement !== root) return;

  if (marcador) {
    if (marcador.textContent.trim() === '') {
      // apagou o marcador inteiro: o destaque acaba
      removerDestaque(bloco, marcador);
    } else {
      const casa = CALLOUT_KEYWORDS.exec(marcador.textContent);
      if (casa) {
        const tipo = casa[1].toLowerCase();
        if (bloco.dataset.callout !== tipo) setBlockCallout(bloco, tipo);
      }
    }
  } else if (bloco.dataset.callout && bloco.dataset.calloutFirst === 'true') {
    // o cursor está no texto, não no marcador: se o marcador sumiu ou ficou vazio, o destaque acaba
    const restante = bloco.querySelector(':scope > .callout-marker');
    if (!restante || restante.textContent.trim() === '') removerDestaque(bloco, restante);
  }
  scheduleSave();
});

function removerDestaque(bloco, marcador) {
  setBlockCallout(bloco, null);
  marcador?.remove();
  markCalloutEdges();
  setCaretOffset(getContentEl(bloco), 0);
}
let marcadorEmEdicao = null;

document.addEventListener('selectionchange', () => {
  const no = document.getSelection()?.anchorNode;
  const agora = no?.parentElement?.closest?.('.callout-marker') ?? null;
  if (marcadorEmEdicao && marcadorEmEdicao !== agora && marcadorEmEdicao.isConnected) {
    validarMarcador(marcadorEmEdicao);
  }
  marcadorEmEdicao = agora;
});

function validarMarcador(marcador) {
  const bloco = marcador.closest('.block');
  // Enquanto o "[!" existe, o destaque continua (o tipo pode estar incompleto no meio da edição).
  if (!bloco || marcador.textContent.includes('[!')) return;
  // saiu do marcador sem um tipo válido: vira só citação
  setBlockCallout(bloco, null);
  marcador.remove();
  markCalloutEdges();
  scheduleSave();
}