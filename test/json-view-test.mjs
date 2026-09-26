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

if (failed.length > 0) {
  console.error(`\n❌ ${failed.length} testes falharam:`);
  failed.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log(`\n✓ Todos os ${passed} testes do JSON Studio passaram com sucesso!`);
}
