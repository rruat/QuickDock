// ── bases-embedded.js ────────────────────────────────────────────────────────
// Conector do bloco embutido de Base (tipo 'base') com o editor de notas.
// Transforma ```base ... ``` em um banco de dados vivo e interativo inline.

import { renderBaseComponent } from './bases-view-container.js';

// YAML padrão de uma Base recém-criada — exportado pra quem monta um bloco
// 'base' sem config nenhuma (aqui e em note.js's appendBaseBlockToCurrentNote)
// usar exatamente o mesmo texto, em vez de duas cópias que podem desalinhar.
export const DEFAULT_BASE_CONFIG = `name: Base de Notas
source:
  folder: /
views:
  - type: table
    name: Visão Geral
    columns: [title, folder, tags, updatedAt]`;

/**
 * Cria o elemento de bloco DOM para uma Base embutida.
 * @param {string} rawConfig - Configuração YAML/JSON salva no bloco
 * @param {Function} onSave - Callback chamado ao alterar a configuração
 * @returns {HTMLElement}
 */
export function buildEmbeddedBaseBlock(rawConfig = '', onSave = null) {
  const block = document.createElement('div');
  block.className = 'block block-base';
  block.contentEditable = 'false';
  block.dataset.type = 'base';

  const initialConfig = rawConfig && rawConfig.trim() ? rawConfig : DEFAULT_BASE_CONFIG;
  // Grava o config resolvido (não o bruto, possivelmente vazio) desde já —
  // sem isso, uma base recém-criada só ganhava um config de verdade gravado
  // no banco depois da primeira interação da pessoa (onConfigChange abaixo).
  block.dataset.config = initialConfig;

  const wrapper = document.createElement('div');
  wrapper.className = 'base-embedded-wrapper';
  block.appendChild(wrapper);

  // Inicializa o componente de Base
  setTimeout(() => {
    renderBaseComponent(wrapper, initialConfig, {
      embedded: true,
      onConfigChange: (newYaml) => {
        block.dataset.config = newYaml;
        if (typeof onSave === 'function') onSave(newYaml);
      },
    });
  }, 0);

  return block;
}
