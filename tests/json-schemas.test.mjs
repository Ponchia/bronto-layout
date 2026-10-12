import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseContract } from '../dist/contract.js';
import { parseBatchManifest } from '../dist/batch.js';
import { parseLayoutActions } from '../dist/actions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = filename => JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const contractSchema = read('schemas/layout-contract.schema.json');
const batchSchema = read('schemas/batch-manifest.schema.json');
const actionsSchema = read('schemas/layout-actions.schema.json');
const checkContract = ajv.compile(contractSchema);
const checkBatch = ajv.compile(batchSchema);
const checkActions = ajv.compile(actionsSchema);
const canonicalBase = 'https://raw.githubusercontent.com/Ponchia/bronto-layout/main/schemas/';

test('all public Draft 2020-12 editor schemas compile and advertise the correct source paths', () => {
  for (const [schema, filename] of [[contractSchema, 'layout-contract.schema.json'],
    [batchSchema, 'batch-manifest.schema.json'], [actionsSchema, 'layout-actions.schema.json']]) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.$id, canonicalBase + filename);
    if (schema.type === 'object') assert.equal(schema.additionalProperties, false);
    assert.equal(typeof ajv.getSchema(schema.$id), 'function');
  }
});

test('every bundled contract and batch manifest accepted by the runtime also passes its editor schema', () => {
  let contracts = 0, batches = 0, actionFiles = 0;
  for (const filename of readdirSync(path.join(root, 'examples')).filter(item => item.endsWith('.json'))) {
    const example = read('examples/' + filename);
    if (Array.isArray(example)) {
      assert.doesNotThrow(() => parseLayoutActions(example), filename);
      assert.equal(checkActions(example),true,filename+': '+JSON.stringify(checkActions.errors));
      actionFiles++;continue;
    }
    if (Array.isArray(example.jobs)) {
      const manifest = parseBatchManifest(example);
      assert.equal(manifest.jobs.length, example.jobs.length);
      assert.equal(checkBatch(example), true, filename + ': ' + JSON.stringify(checkBatch.errors));
      batches++;
    } else if (Array.isArray(example.rules)) {
      assert.equal(parseContract(example).rules.length, example.rules.length);
      assert.equal(checkContract(example), true, filename + ': ' + JSON.stringify(checkContract.errors));
      contracts++;
    } else assert.fail('Unclassified bundled JSON file: ' + filename);
  }
  assert.ok(contracts >= 15, 'All versioned layout contract examples must remain covered');
  assert.ok(batches >= 10, 'Both contract-check and zero-contract audit manifests must be covered');
  assert.ok(actionFiles >= 3, 'Action arrays are intentionally NOT contract or batch manifests');
});

test('an optional $schema editor hint is accepted and never changes runtime contract/batch behavior', () => {
  const annotatedContract = read('examples/schema-enabled-layout.json');
  const annotatedBatch = read('examples/schema-enabled-batch.json');
  assert.equal(annotatedContract.$schema, contractSchema.$id);
  assert.equal(annotatedBatch.$schema, batchSchema.$id);
  assert.equal(checkContract(annotatedContract), true);
  assert.equal(checkBatch(annotatedBatch), true);
  assert.equal(parseContract(annotatedContract).$schema, contractSchema.$id);
  assert.equal(parseBatchManifest(annotatedBatch).jobs.length, 2);
  assert.doesNotThrow(() => parseContract({ ...annotatedContract, $schema: '../schemas/layout-contract.schema.json' }));
  assert.doesNotThrow(() => parseBatchManifest({ ...annotatedBatch, $schema: '../schemas/batch-manifest.schema.json' }));
});

test('schema and runtime both reject malformed contract rules, actions and metadata', () => {
  const good = read('examples/schema-enabled-layout.json');
  const variants = [
    { ...good, selectors: null },
    { ...good, rules: [] },
    { ...good, rules: [{ id: 'bad', type: 'unknown' }] },
    { ...good, rules: [{ id: 'bad', type: 'centered', element: 'shell', in: 'viewport', axis: 'diagonal' }] },
    { ...good, rules: [{ id: 'bad', type: 'align-edge', a: 'shell', b: 'shell' }] },
    { ...good, rules: [{ id: 'bad', type: 'size-range', element: 'shell', axis: 'width' }] },
    { ...good, rules: [{ id: 'bad', type: 'selector-count', element: 'shell', exactly: 1, min: 1 }] },
    { ...good, rules: [{ id: 'bad', type: 'no-clipping', element: 'shell', axis: 'diagonal' }] },
    { ...good, rules: [{ id: 'bad', type: 'document-overflow', tolerance: -1 }] },
    { ...good, rules: [{ id: 'bad', type: 'document-overflow', minWidth: 199 }] },
    { ...good, actions: [{ type: 'fill', selector: '#a' }] },
    { ...good, actions: [{ type: 'execute', javascript: 'alert(1)' }] },
    { ...good, scenario: { colorScheme: 'blue' } },
    { ...good, madeUpTopLevel: true },
    { ...good, $schema: 42 }
  ];
  for (const [i, variant] of variants.entries()) {
    assert.equal(checkContract(variant), false, `Contract mutation #${i} should fail editor schema`);
    assert.throws(() => parseContract(variant), /Invalid layout contract/, `Contract mutation #${i} should fail runtime`);
  }
});

test('schema and runtime both reject invalid or unsafe batch job combinations', () => {
  const good = read('examples/schema-enabled-batch.json');
  const original = good.jobs[0];
  const audit = good.jobs[1];
  const variants = [
    { ...good, schemaVersion: 2 },
    { ...good, jobs: [] },
    { ...good, jobs: Array.from({ length: 17 }, (_, i) => ({ ...original, id: 'job-' + i })) },
    { ...good, jobs: [{ ...original, spec: undefined }] },
    { ...good, jobs: [{ ...original, actions: 'file.json' }] },
    { ...good, jobs: [{ ...original, widths: [375, 375] }] },
    { ...good, jobs: [{ ...original, widths: [150] }] },
    { ...good, jobs: [{ ...original, cssBreakpoints: true }] },
    { ...good, jobs: [{ ...original, scan: 'bad:range' }] },
    { ...good, jobs: [{ ...original, colorScheme: 'blue' }] },
    { ...good, jobs: [{ ...audit, spec: 'layout.json' }] },
    { ...good, jobs: [{ ...audit, domLimit: 50001 }] },
    { ...good, jobs: [{ ...audit, stableFor: 250 }] },
    { ...good, jobs: [{ ...audit, mode: 'invalid' }] },
    { ...good, unexpected: true },
    { ...good, $schema: 42 }
  ];
  for (const [i, variant] of variants.entries()) {
    assert.equal(checkBatch(variant), false, `Batch mutation #${i} should fail editor schema`);
    assert.throws(() => parseBatchManifest(variant), /Batch/, `Batch mutation #${i} should fail runtime`);
  }
});

test('editor schema supplements runtime checks: aliases and cross-field numeric relationships remain authoritative in CLI', () => {
  const good = read('examples/schema-enabled-layout.json');
  const unknownAlias = { ...good, rules: [{ id: 'edge', type: 'align-edge', a: 'missing', b: 'shell', edgeA: 'right' }] };
  assert.equal(checkContract(unknownAlias), true, 'JSON Schema cannot cross-reference map property names');
  assert.throws(() => parseContract(unknownAlias), /undeclared selector alias/);
  const impossibleRange = { ...good, rules: [{ id: 'range', type: 'size-range', element: 'shell', axis: 'width', min: 100, max: 20 }] };
  assert.equal(checkContract(impossibleRange), true, 'JSON Schema cannot compare min and max field values');
  assert.throws(() => parseContract(impossibleRange), /min exceeds max/);
  const badBatch = { ...read('examples/schema-enabled-batch.json'), jobs: [{ id: 'invalid', spec: 'layout.json', scan: '900:320:100' }] };
  assert.equal(checkBatch(badBatch), true, 'Schema checks syntax, not cross-field numeric scan bounds');
  assert.throws(() => parseBatchManifest(badBatch), /Invalid scan range/);
});

test('all fourteen supported contract rule discriminators have editor-completion shapes accepted by the engine',()=>{
  const select = { a:'#first',b:'#second',c:'#third' };
  const rules = [
    {type:'layout-stability',maxScore:0.1},
    {type:'document-overflow'},
    {type:'align-edge',a:'a',b:'b',edgeA:'inline-start',edgeB:'inline-end'},
    {type:'centered',element:'a',in:'viewport',axis:'x'},
    {type:'contained',element:'a',in:'b',axis:'both'},
    {type:'non-overlapping',a:'a',b:'b'},
    {type:'equal-gaps',elements:['a','b','c'],axis:'y'},
    {type:'uniform-gaps',element:'a',axis:'x',laneTolerance:2},
    {type:'image-aspect',element:'a',tolerancePercent:1.2},
    {type:'gap-range',a:'a',b:'b',axis:'x',min:2,max:12},
    {type:'same-size',a:'a',b:'b',axis:'both'},
    {type:'size-range',element:'a',axis:'width',min:100,max:200},
    {type:'selector-count',element:'a',min:0,max:5},
    {type:'no-clipping',element:'b',axis:'both'}
  ];
  assert.equal(rules.length,14);
  assert.equal(new Set(rules.map(r=>r.type)).size,14);
  for(const [i,rule] of rules.entries()){
    const value={schemaVersion:1,selectors:select,rules:[{id:'type-'+i,...rule}]};
    assert.equal(checkContract(value),true,rule.type+': '+JSON.stringify(checkContract.errors));
    assert.equal(parseContract(value).rules[0].type,rule.type);
  }
});


test('standalone action schema exactly mirrors the contract schema action definitions',()=>{
 assert.deepEqual(actionsSchema.items,contractSchema.$defs.action);
 assert.deepEqual(actionsSchema.$defs.actionSelector,contractSchema.$defs.actionSelector);
 assert.equal(actionsSchema.maxItems,30);
 assert.equal(actionsSchema.$id,canonicalBase+'layout-actions.schema.json');
});

test('standalone action schema and runtime reject the same forbidden scripts and invalid inputs',()=>{
 const good=read('examples/audit-stateful-actions.json');
 assert.equal(checkActions(good),true);
 assert.deepEqual(parseLayoutActions(good),good);
 const variants=[
   [{type:'javascript',script:'alert(1)'}],
   [{type:'fill',selector:'#input'}],
   [{type:'fill',selector:'#input',value:3}],
   [{type:'click',selector:' '}],
   [{type:'click',selector:'#input',extra:'unexpected'}],
   [{type:'pause',milliseconds:5001}],
   [{type:'pause',milliseconds:-1}],
   [{type:'pause',milliseconds:100.5}],
   [{type:'scroll-into-view',selector:'a'.repeat(2001)}],
   Array.from({length:31},()=>({type:'click',selector:'#target'}))
 ];
 for(const [i,invalid] of variants.entries()){
   assert.equal(checkActions(invalid),false,'Action mutation #'+i+' should fail editor schema');
   assert.throws(()=>parseLayoutActions(invalid),/Invalid layout contract/,
     'Action mutation #'+i+' should fail runtime');
 }
});
