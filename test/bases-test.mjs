// ── bases-test.mjs ──────────────────────────────────────────────────────────
// Testes unitários automatizados do motor central do QuickDock Bases.
// Rode com: node test/bases-test.mjs

import {
  formatPropertyValue,
  parsePropertyInput,
  inferBaseSchema,
  normalizeBaseDefinition,
} from '../sidepanel/modules/bases/bases-schema.js';

import {
  getNotePropertyValue,
  evaluateFilterCondition,
  queryBaseNotes,
  sortBaseNotes,
  groupBaseNotes,
  calculateBaseSummaries,
} from '../sidepanel/modules/bases/bases-engine.js';

import {
  parseYamlOrJson,
  stringifyBaseToYaml,
} from '../sidepanel/modules/bases/bases-yaml.js';

let passou = 0;
const falhas = [];

function ok(nome, condicao, detalhe = '') {
  if (condicao) { passou++; return; }
  falhas.push(`${nome}${detalhe ? `\n    ${detalhe.replace(/\n/g, '\n    ')}` : ''}`);
}

function igual(nome, obtido, esperado) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  ok(nome, a === b, a === b ? '' : `esperado: ${b}\nobtido:   ${a}`);
}

console.log('--- Testando Bases Schema ---');

// 1. Formatação de valores
igual('format · checkbox true', formatPropertyValue(true, 'checkbox'), true);
igual('format · checkbox false', formatPropertyValue(false, 'checkbox'), false);
igual('format · number default', formatPropertyValue(1250.5, 'number'), '1.250,5');
ok('format · number currency_brl', formatPropertyValue(1500, 'number', { format: 'currency_brl' }).includes('1.500,00'));
igual('format · number percent', formatPropertyValue(0.754, 'number', { format: 'percent' }), '75.4%');
igual('format · date ISO to DD/MM/AAAA', formatPropertyValue('2026-09-20', 'date'), '20/09/2026');
igual('format · list array', formatPropertyValue(['design', 'ux'], 'list'), ['design', 'ux']);
igual('format · list string', formatPropertyValue('dev, api', 'list'), ['dev', 'api']);
igual('format · link wikilink', formatPropertyValue('[[Nota Alvo|Meu Alias]]', 'link'), { target: 'Nota Alvo', alias: 'Meu Alias' });
igual('format · tasks', formatPropertyValue({ total: 5, checked: 3 }, 'tasks'), { total: 5, checked: 3 });

// 2. Parser de inputs
igual('parse · checkbox', parsePropertyInput('true', 'checkbox'), true);
igual('parse · number', parsePropertyInput('R$ 1.250,50', 'number'), 1250.5);
igual('parse · date BR', parsePropertyInput('20/09/2026', 'date'), '2026-09-20');
igual('parse · date ISO', parsePropertyInput('2026-09-20', 'date'), '2026-09-20');
igual('parse · list comma', parsePropertyInput('frontend, backend, db', 'list'), ['frontend', 'backend', 'db']);
igual('parse · link', parsePropertyInput('Minha Nota', 'link'), '[[Minha Nota]]');

// 3. Inferência de Schema
const fakeNotes = [
  {
    id: 1,
    title: 'Nota 1',
    pasta: 'Projetos',
    properties: {
      prioridade: 'Alta',
      orcamento: 5000,
      prazo: '2026-10-01',
      ativo: true,
      tags: ['importante', 'urgente'],
    },
  },
  {
    id: 2,
    title: 'Nota 2',
    pasta: 'Projetos',
    properties: {
      prioridade: 'Média',
      orcamento: 3200,
      site: 'https://example.com',
    },
  },
];

const schema = inferBaseSchema(fakeNotes, {
  prioridade: { type: 'select', label: 'Nível de Prioridade' },
});

ok('schema · contém colunas de sistema', !!schema.title && !!schema.folder && !!schema.tags && !!schema.tasks);
igual('schema · tipo explícito sobrescreve inferido', schema.prioridade.type, 'select');
igual('schema · label explícito sobrescreve inferido', schema.prioridade.label, 'Nível de Prioridade');
igual('schema · inferiu number para orcamento', schema.orcamento.type, 'number');
igual('schema · inferiu date para prazo', schema.prazo.type, 'date');
igual('schema · inferiu checkbox para ativo', schema.ativo.type, 'checkbox');
igual('schema · inferiu url para site', schema.site.type, 'url');

// 4. Normalização de definição de Base
const defNorm = normalizeBaseDefinition({ source: '#projetos' });
igual('def · source tag normalizado', defNorm.source, { tag: '#projetos' });
ok('def · view padrão criada', defNorm.views.length > 0 && defNorm.views[0].type === 'table');

console.log('--- Testando Bases Engine ---');

const testNotes = [
  {
    id: 101,
    title: 'Desenvolver API',
    pasta: 'Trabalho/Backend',
    content: 'Implementar endpoints #v1 e #backend/core',
    properties: { status: 'Em Progresso', prioridade: 3, horas: 12, concluido: false, data: '2026-09-22' },
    blocks: [{ type: 'checklist', checked: true }, { type: 'checklist', checked: false }],
  },
  {
    id: 102,
    title: 'Criar Telas UI',
    pasta: 'Trabalho/Design',
    content: 'Figma e componentes #design',
    properties: { status: 'Concluído', prioridade: 2, horas: 8, concluido: true, data: '2026-09-15' },
    blocks: [{ type: 'checklist', checked: true }],
  },
  {
    id: 103,
    title: 'Reunião de Alinhamento',
    pasta: 'Geral',
    content: 'Pauta semanal',
    properties: { status: 'A Fazer', prioridade: 1, horas: 2, concluido: false, data: '2026-09-20' },
  },
  {
    id: 104,
    title: 'Testes de Integração',
    pasta: 'Trabalho/QA',
    content: 'Cobertura de testes #qa e #backend/test',
    properties: { status: 'A Fazer', prioridade: 3, horas: 16, concluido: false, data: '2026-09-30' },
  },
];

// 5. Query: Source filtering
const inTrabalho = queryBaseNotes(testNotes, { source: { folder: 'Trabalho' } });
igual('query · source folder recursivo', inTrabalho.length, 3);

const inBackend = queryBaseNotes(testNotes, { source: { tag: '#backend' } });
igual('query · source tag aninhada (#backend casa #backend/core e #backend/test)', inBackend.length, 2);

// 6. Query: Filters
const altaPrioridade = queryBaseNotes(testNotes, {
  filters: [{ property: 'prioridade', operator: '>=', value: 3 }],
});
igual('query · filtro numérico >= 3', altaPrioridade.map(n => n.id), [101, 104]);

const concluidos = queryBaseNotes(testNotes, {
  filters: [{ property: 'concluido', operator: 'is_checked' }],
});
igual('query · filtro is_checked', concluidos.map(n => n.id), [102]);

const textoStatus = queryBaseNotes(testNotes, {
  filters: [{ property: 'status', operator: 'contains', value: 'Progresso' }],
});
igual('query · filtro texto contains', textoStatus.map(n => n.id), [101]);

// 7. Query: QuickSearch
const searchRes = queryBaseNotes(testNotes, { quickSearch: 'figma' });
igual('query · quickSearch encontra conteúdo', searchRes.map(n => n.id), [102]);

// 8. Sorting
const sortedHorasDesc = sortBaseNotes(testNotes, [{ property: 'horas', direction: 'desc' }], schema);
igual('sort · horas desc', sortedHorasDesc.map(n => n.properties.horas), [16, 12, 8, 2]);

const sortedTitleAsc = sortBaseNotes(testNotes, [{ property: 'title', direction: 'asc' }], schema);
igual('sort · title asc', sortedTitleAsc.map(n => n.title), [
  'Criar Telas UI',
  'Desenvolver API',
  'Reunião de Alinhamento',
  'Testes de Integração',
]);

// 9. Grouping
const grouped = groupBaseNotes(testNotes, 'status', schema);
ok('group · agrupamento criou grupos para status', grouped.length >= 3);
const afazer = grouped.find(g => g.key === 'A Fazer');
igual('group · grupo A Fazer contém 2 notas', afazer?.notes.length, 2);

// 10. Summaries / Métricas de rodapé
const summaries = calculateBaseSummaries(testNotes, {
  title: 'count',
  horas: 'sum',
  prioridade: 'average',
  concluido: 'percent_checked',
}, schema);

igual('summaries · count total notas', summaries.title.value, 4);
igual('summaries · sum horas', summaries.horas.value, 38);
igual('summaries · avg prioridade', summaries.prioridade.value, 2.25);
igual('summaries · percent_checked concluido', summaries.concluido.value, '25%');

// 11. YAML / JSON Parser & Serializer
console.log('--- Testando Bases YAML Parser ---');
const sampleYaml = `
# Configuração da Base
folder: /Projetos
tag: #trabalho
views:
  - type: table
    name: Todas
    columns: [title, status, data]
  - type: board
    name: Kanban
    groupBy: status
`;

const parsedConfig = parseYamlOrJson(sampleYaml);
igual('yaml · parse folder', parsedConfig.folder, '/Projetos');
igual('yaml · parse tag', parsedConfig.tag, '#trabalho');
ok('yaml · parse views is array', Array.isArray(parsedConfig.views) && parsedConfig.views.length === 2);
igual('yaml · parse view 0 type', parsedConfig.views?.[0]?.type, 'table');
igual('yaml · parse view 0 name', parsedConfig.views?.[0]?.name, 'Todas');
igual('yaml · parse view 0 columns', parsedConfig.views?.[0]?.columns, ['title', 'status', 'data']);
igual('yaml · parse view 1 type', parsedConfig.views?.[1]?.type, 'board');
igual('yaml · parse view 1 groupBy', parsedConfig.views?.[1]?.groupBy, 'status');

const yamlOutput = stringifyBaseToYaml({
  folder: 'Projetos',
  views: [{ type: 'table', name: 'Visão Geral' }]
});
ok('yaml · stringify contains folder', yamlOutput.includes('folder: Projetos'));
ok('yaml · stringify contains views', yamlOutput.includes('type: table'));

// JSON fallback
const parsedJson = parseYamlOrJson('{"folder":"/Docs","views":[{"type":"list"}]}');
igual('json · parse fallback', parsedJson.folder, '/Docs');

// 12. Integração com blocos Markdown
import { parseMarkdownToBlocks, blocksToMarkdown, blocksToPlainText } from '../sidepanel/modules/blocks.js';

console.log('--- Testando Integração com Blocks Markdown ---');
const baseMd = '```base\nname: Projetos\nviews:\n  - type: table\n```';
const parsedBlocks = parseMarkdownToBlocks(baseMd);
ok('blocks · parse base block type', parsedBlocks.length === 1 && parsedBlocks[0].type === 'base');
ok('blocks · parse base config contains name', parsedBlocks[0].config.includes('name: Projetos'));

const serializedMd = blocksToMarkdown(parsedBlocks);
ok('blocks · blocksToMarkdown starts with ```base', serializedMd.startsWith('```base'));
ok('blocks · blocksToMarkdown ends with ```', serializedMd.endsWith('```'));

const plainText = blocksToPlainText(parsedBlocks);
igual('blocks · blocksToPlainText is [base de dados]', plainText.trim(), '[base de dados]');

// 13. Formatação de Badges
import { formatSelectBadge } from '../sidepanel/modules/bases/bases-cell-editors.js';
console.log('--- Testando Bases Badges ---');
const badgeHtml = formatSelectBadge('Em Andamento', [{ name: 'Em Andamento', color: '#3b82f6' }]);
ok('badge · contains class base-select-badge', badgeHtml.includes('class="base-select-badge"'));
ok('badge · contains text Em Andamento', badgeHtml.includes('Em Andamento'));
ok('badge · contains color #3b82f6', badgeHtml.includes('#3b82f6'));

if (falhas.length) {
  console.error(`\n✗ ${falhas.length} falha(s), ${passou} ok\n`);
  for (const f of falhas) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n✓ Todos os ${passou} testes de Bases Core passaram com sucesso!`);

