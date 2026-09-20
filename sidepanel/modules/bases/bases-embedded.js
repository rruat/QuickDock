// ── bases-embedded.js ────────────────────────────────────────────────────────
// Conector do bloco embutido de Base (tipo 'base') com o editor de notas.
// Transforma ```base ... ``` em um banco de dados vivo e interativo inline.

import { renderBaseComponent } from './bases-view-container.js';

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
  block.dataset.config = rawConfig || '';

  const wrapper = document.createElement('div');
  wrapper.className = 'base-embedded-wrapper';
  block.appendChild(wrapper);

  const initialConfig = rawConfig && rawConfig.trim() ? rawConfig : `name: Base de Notas
source:
  folder: /
views:
  - type: table
    name: Visão Geral
    columns: [title, folder, tags, updatedAt]`;

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
