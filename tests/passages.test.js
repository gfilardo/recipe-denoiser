import test from 'node:test';
import assert from 'node:assert/strict';
import { sourcePassages } from '../src/sourcePassages.js';
import { acceptActions, actionSchema } from '../src/recipeExtraction.js';

test('passages retain source slices, numbers, fractions, units and parenthetical temperatures', () => {
  const source = 'Pizza\r\n1. Mix 1.8 cups water with 4 1/3 cups flour. Bake at 428°F for 30 minutes (220°C → 428°F).\nRest; serve.';
  const passages = sourcePassages(source);
  assert.deepEqual(passages.map(p=>p.text), ['Pizza','1. Mix 1.8 cups water with 4 1/3 cups flour.','Bake at 428°F for 30 minutes (220°C → 428°F).','Rest;','serve.']);
  assert.ok(passages.every(p=>source.slice(p.start,p.end)===p.text));
  assert.ok(passages.every((p,i)=>!i||p.start>=passages[i-1].end));
});
test('abbreviations do not split ingredient quantities away from units', () => {
  const passages=sourcePassages('Mix 1.5 tsp. salt and 2 tbsp. oil. Fold.');
  assert.deepEqual(passages.map(p=>p.text),['Mix 1.5 tsp. salt and 2 tbsp. oil.','Fold.']);
});
test('whole image placeholders are skipped but source cooking text is retained', () => {
  const source='[Image: pasted image — use Add image to insert a local copy]\nMix the dough.\n[Image: another]\nBake.';
  const passages=sourcePassages(source);
  assert.deepEqual(passages.map(p=>p.text),['Mix the dough.','Bake.']);
  assert.deepEqual(passages.map(p=>p.id),['p_1','p_2']);
  assert.ok(passages.every(p=>source.slice(p.start,p.end)===p.text));
});
test('selection restores source order and working cannot become work', () => {
  const source='Start by working the flour and yeast 1 in a bowl. Then bake at 428°F for 30 minutes.';
  const passages=sourcePassages(source);
  const result=acceptActions({passage_ids:['p_2','p_1']},passages);
  assert.deepEqual(result.setup,[]);
  assert.deepEqual(result.steps.map(p=>p.action),passages.map(p=>p.text));
  assert.equal(result.steps[0].action,'Start by working the flour and yeast 1 in a bowl.');
  assert.deepEqual(result.steps.map(p=>p.id),['step_1','step_2']);
});
test('selection rejects repeated IDs, invented IDs, empty lists and generated text', () => {
  const passages=sourcePassages('Mix. Bake.');
  assert.throws(()=>acceptActions({passage_ids:['p_1','p_1']},passages),/Duplicate source passage/);
  assert.throws(()=>acceptActions({passage_ids:['p_999']},passages),/Unknown source passage/);
  assert.throws(()=>acceptActions({passage_ids:[]},passages),/Select 1–100/);
  assert.throws(()=>acceptActions({passage_ids:['p_1'],actions:['Bake at 42888°F']},passages),/unexpected field/);
  assert.throws(()=>acceptActions({passage_ids:['p_1'],setup:['work the flour']},passages),/unexpected field/);
});
test('distinct repeated rest instructions remain separate selectable passages', () => {
  const passages=sourcePassages('Rest 10 minutes. Fold the dough. Rest 10 minutes.');
  const result=acceptActions({passage_ids:passages.map(p=>p.id)},passages);
  assert.equal(result.steps.length,3);assert.equal(result.steps[0].action,result.steps[2].action);
});
test('selection schema enumerates source IDs and offers no rewritten text or setup', () => {
  const schema=actionSchema(sourcePassages('Mix. Bake.'));
  assert.deepEqual(Object.keys(schema.properties),['passage_ids']);
  assert.deepEqual(schema.properties.passage_ids.items.enum,['p_1','p_2']);
});
