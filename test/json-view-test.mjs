// ── test/json-view-test.mjs ──────────────────────────────────────────────────
// Testes automatizados para o motor do JSON Studio (json-view.js).

import {
  getJsonType,
  validateJsonString,
  extractJsonErrorPosition,
  convertJsonType,
  deepCloneJson,
  getNodeByPath,
  updateValueByPath,
  deleteByPath,
  renameKeyByPath,
  insertChildNode,
  duplicateNodeByPath,
  moveNodeByPath,
  JSON_TEMPLATES
} from '../sidepanel/modules/json-view.js';

let passed = 0;
const failed = [];

function ok(title, condition, detail = '') {
  if (condition) {
    passed++;
  } else {
    failed.push(`${title}${detail ? ` -> ${detail}` : ''}`);
  }
}

function equal(title, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  ok(title, a === b, `Esperado: ${b} | Obtido: ${a}`);
}

console.log('--- Testando JSON Studio Engine ---');

// 1. Detecção de tipos
equal('Tipo string', getJsonType('olá'), 'string');
equal('Tipo number', getJsonType(42), 'number');
equal('Tipo boolean true', getJsonType(true), 'boolean');
equal('Tipo boolean false', getJsonType(false), 'boolean');
equal('Tipo null', getJsonType(null), 'null');
equal('Tipo object', getJsonType({ a: 1 }), 'object');
equal('Tipo array', getJsonType([1, 2, 3]), 'array');

// 2. Validação e extração de erro
const validRes = validateJsonString('{"nome": "QuickDock", "versao": 3}');
ok('Validação de JSON válido', validRes.valid === true);
equal('Dados parseados', validRes.data.nome, 'QuickDock');

const invalidRes = validateJsonString('{\n  "nome": "QuickDock",\n  "erro": \n}');
ok('Validação de JSON inválido detecta erro', invalidRes.valid === false);
ok('Linha do erro detectada', invalidRes.line >= 3);
ok('Mensagem de erro presente', typeof invalidRes.error === 'string' && invalidRes.error.length > 0);

// 3. Conversão de tipos
equal('Converter string para number', convertJsonType('123', 'number'), 123);
equal('Converter string inválida para number', convertJsonType('abc', 'number'), 0);
equal('Converter number para string', convertJsonType(42, 'string'), '42');
equal('Converter boolean true para string', convertJsonType(true, 'string'), 'true');
equal('Converter string "true" para boolean', convertJsonType('true', 'boolean'), true);
equal('Converter string "false" para boolean', convertJsonType('false', 'boolean'), false);
equal('Converter qualquer tipo para null', convertJsonType('qualquer', 'null'), null);
equal('Converter array para object', convertJsonType(['a', 'b'], 'object'), { item_0: 'a', item_1: 'b' });
equal('Converter object para array', convertJsonType({ x: 10, y: 20 }, 'array'), [10, 20]);
equal('Converter primitivo para array', convertJsonType(99, 'array'), [99]);

// 4. Operações de Árvore por Caminho (Path)
const testDoc = {
  usuario: {
    nome: 'Carlos',
    idade: 30,
    tags: ['admin', 'dev']
  },
  ativo: true
};

// getNodeByPath
const nodeVal = getNodeByPath(testDoc, ['usuario', 'nome']);
equal('Buscar nó por caminho', nodeVal.value, 'Carlos');

// updateValueByPath
const updatedDoc = updateValueByPath(testDoc, ['usuario', 'idade'], 31);
equal('Atualizar valor por caminho', updatedDoc.usuario.idade, 31);
equal('Original preservado (imutabilidade)', testDoc.usuario.idade, 30);

// renameKeyByPath
const renamedDoc = renameKeyByPath(testDoc, ['usuario', 'nome'], 'nome_completo');
ok('Chave antiga renomeada', renamedDoc.usuario.nome === undefined);
equal('Chave nova atribuída', renamedDoc.usuario.nome_completo, 'Carlos');

// insertChildNode
const withNewProp = insertChildNode(testDoc, ['usuario'], 'string');
ok('Inserir propriedade em objeto', Object.keys(withNewProp.usuario).some(k => k.startsWith('nova_chave_')));

const withNewItem = insertChildNode(testDoc, ['usuario', 'tags'], 'number');
equal('Inserir item em array', withNewItem.usuario.tags.length, 3);
equal('Valor default de número inserido', withNewItem.usuario.tags[2], 0);

// duplicateNodeByPath
const withDupItem = duplicateNodeByPath(testDoc, ['usuario', 'tags', '0']);
equal('Duplicar item de array', withDupItem.usuario.tags, ['admin', 'admin', 'dev']);

// deleteByPath
const withDeleted = deleteByPath(testDoc, ['usuario', 'idade']);
ok('Deletar propriedade', withDeleted.usuario.idade === undefined);

// moveNodeByPath
const movedDoc = moveNodeByPath(testDoc, ['usuario', 'tags', '1'], -1);
equal('Mover item para cima no array', movedDoc.usuario.tags, ['dev', 'admin']);

// 5. Templates pré-definidos
for (const [key, tpl] of Object.entries(JSON_TEMPLATES)) {
  const jsonStr = JSON.stringify(tpl);
  const parsed = JSON.parse(jsonStr);
  ok(`Template "${key}" é JSON serializável válido`, parsed !== null);
}

// 6. Testes de Integração com Shell, Views e Estilos
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const spatialShellSrc = fs.readFileSync(path.join(rootDir, 'sidepanel/modules/spatial-shell.js'), 'utf-8');
const viewsSrc = fs.readFileSync(path.join(rootDir, 'sidepanel/modules/views.js'), 'utf-8');
const desktopPanelsSrc = fs.readFileSync(path.join(rootDir, 'sidepanel/modules/desktop-panels.js'), 'utf-8');
const documentsSrc = fs.readFileSync(path.join(rootDir, 'sidepanel/modules/documents.js'), 'utf-8');
const styleCssSrc = fs.readFileSync(path.join(rootDir, 'sidepanel/style.css'), 'utf-8');
const indexHtmlSrc = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const errorHtmlSrc = fs.readFileSync(path.join(rootDir, '404.html'), 'utf-8');

ok('spatial-shell: SHELL_VIEWS contém view json', spatialShellSrc.includes("id: 'json'"));
ok('spatial-shell: applyViewVisibility mapeia viewMap.json', spatialShellSrc.includes("json: document.querySelector('.json-view')"));
ok('spatial-shell: triggerOpenViewsRefresh emite refresh-json-view', spatialShellSrc.includes("quickdock:refresh-json-view"));

ok('desktop-panels: PANEL_ORDER contém json', desktopPanelsSrc.includes("json: 70"));
ok('desktop-panels: MAXIMIZE_BTN_ID contém btn-json-toggle-fullscreen', desktopPanelsSrc.includes("json: 'btn-json-toggle-fullscreen'"));
ok('desktop-panels: REFRESH_EVENT_NAME contém json', desktopPanelsSrc.includes("json: 'json'"));
ok('desktop-panels: panelElement trata caso json', desktopPanelsSrc.includes("case 'json': return document.querySelector('.json-view');"));

ok('views.js: switchView delega para window.quickdockOpenView no desktop', viewsSrc.includes("window.quickdockOpenView(shellMap[viewName] || viewName);"));
ok('views.js: switchView ativa jsonView com display flex !important', viewsSrc.includes("jsonView.style.setProperty('display', 'flex', 'important');"));
ok('views.js: switchView remove display ao ocultar jsonView', viewsSrc.includes("jsonView.style.removeProperty('display');"));

ok('documents.js: menu aux em desktop usa toggleDesktopPanel e isDesktopPanelOpen para json',
  documentsSrc.includes("() => toggleDesktopPanel('json'), isDesktopPanelOpen('json')"));

ok('style.css: desktop #app possui regra para .json-view:not([hidden])', styleCssSrc.includes('.json-view:not([hidden])'));
ok('style.css: desktop body.no-note-open possui regra para .json-view:not([hidden])', styleCssSrc.includes('html[data-platform="desktop"] body.no-note-open .json-view:not([hidden])'));
ok('style.css: desktop #btn-json-toggle-height é ocultado', styleCssSrc.includes('#btn-json-toggle-height'));
ok('style.css: desktop .json-view[hidden] é display none', styleCssSrc.includes('html[data-platform="desktop"] .json-view[hidden]'));

const indexHash = crypto.createHash('sha256').update(indexHtmlSrc).digest('hex');
const errorHash = crypto.createHash('sha256').update(errorHtmlSrc).digest('hex');
ok('HTML Parity: index.html e 404.html são 100% idênticos', indexHash === errorHash);
ok('index.html contém seção #json-view', indexHtmlSrc.includes('id="json-view"'));

if (failed.length > 0) {
  console.error(`\n❌ ${failed.length} testes falharam:`);
  failed.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log(`\n✓ Todos os ${passed} testes do JSON Studio passaram com sucesso!`);
}
