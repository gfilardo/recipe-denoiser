import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mentionUse } from '../src/connectionSemantics.js';
import { buildConnectionRequest, connectionChoices, acceptConnection } from '../src/actionConnections.js';
import { acceptIngredients, acceptActions, assembleRecipe } from '../src/recipeExtraction.js';
import { prepareIngredientUses } from '../src/ingredientUses.js';
import { sourcePassages } from '../src/sourcePassages.js';
import { convertRecipe } from '../src/aiService.js';
import { createActionConnectionGuard } from '../src/connectionGuard.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/pizza-source.json', import.meta.url)));
const reported = JSON.parse(readFileSync(new URL('./fixtures/pizza-reported-links.json', import.meta.url)));
const actions = acceptActions(fixture.actions, sourcePassages(fixture.source));
const inventory = prepareIngredientUses(acceptIngredients(fixture.ingredients, fixture.source), actions, fixture.source);
const correct = [
  ['ing_1','ing_2','ing_4'], ['step_1'], ['step_2','ing_3','ing_5'],
  ['step_3'], ['step_4'], ['step_5'], ['step_6'], ['step_7','ing_13'],
  ['step_8'], ['step_9'], ['ing_6','ing_7_use_1','ing_8','ing_9'], ['step_10'],
  ['step_12','step_11','ing_7_use_2'], ['step_13'], ['ing_10'],
  ['step_14','step_15'], ['step_16','ing_11','ing_12']
];
const at = index => buildConnectionRequest(inventory, actions, correct.slice(0, index));
const response = (request, row) => Object.fromEntries(request.available_inputs.map(n => [n.id,
  row.includes(n.id) ? n.kind === 'result' ? 'use' : n.evidence[0] : '']));

test('affirmative uses differ from descriptions, negations and alternative ingredients', () => {
  for (const [action, phrase] of [
    ['Then add the oil 5 and the salt 6.', 'salt'],
    ['Mix flour and water.', 'flour'],
    ['Meanwhile cut the fiordilatte and let it drain.', 'fiordilatte'],
    ['Mix flour and water, then stir with a spoon or spatula.', 'flour']
  ]) assert.equal(mentionUse(action, phrase).kind, 'use', action);
  for (const [action, phrase] of [
    ['Rest until the flour is hydrated.', 'flour'],
    ['Mix until the flour is hydrated.', 'flour'],
    ['Do not add oil.', 'oil'],
    ['Mix the dough without adding oil.', 'oil'],
    ['Use an oil-free pan.', 'oil'],
    ['Mix the dough containing flour.', 'flour']
  ]) assert.equal(mentionUse(action, phrase).kind, 'mention', action);
  for (const action of ['Mix flour or oats.', 'If needed, add flour.', 'Optionally add flour.']) {
    assert.equal(mentionUse(action, 'flour').kind, 'uncertain', action);
  }
});

test('flour must enter the mixing action and cannot be forced into a hydration observation', () => {
  const inv = { ingredients: [{id:'ing_1', text:'Flour 100 g'}, {id:'ing_2', text:'Water 100 ml'}] };
  const steps = { steps: [{id:'step_1', action:'Mix flour and water.'}, {id:'step_2', action:'Rest until the flour is hydrated.'}] };
  const first = buildConnectionRequest(inv, steps, []);
  assert.deepEqual(connectionChoices(first).ing_1, ['flour']);
  assert.throws(() => acceptConnection({ing_1:'',ing_2:'water'}, first), /Required here/);
  // Even a historical/externally supplied bad prefix cannot force the raw
  // flour into the later description to make the tree look complete.
  const second = buildConnectionRequest(inv, steps, [['ing_2']]);
  assert.deepEqual(connectionChoices(second).ing_1, ['']);
  assert.throws(() => acceptConnection({ing_1:'flour',step_1:'use'}, second), /unsupported/);
});

test('recorded omissions and bad result connections are rejected where they occur', () => {
  for (const index of [2,10,11,12,14,15]) {
    const request = at(index);
    const raw = Object.fromEntries(request.available_inputs.map(n => [n.id, reported[index][n.id] || '']));
    assert.throws(() => acceptConnection(raw, request), /unsupported/, `recorded action ${index + 1}`);
  }
});

test('adding missing ingredients cannot hide the recorded independent-branch errors', () => {
  for (const [index, wrongResult] of [[10,'step_10'],[14,'step_14']]) {
    const request = at(index);
    const bad = { ...response(request, correct[index]), [wrongResult]:'use' };
    assert.deepEqual(connectionChoices(request)[wrongResult], ['']);
    assert.throws(() => acceptConnection(bad, request), /Independent preparation/);
    const guard = createActionConnectionGuard(connectionChoices(request));
    assert.throws(() => { for (const char of JSON.stringify(bad)) guard(char); }, /Invalid selection/);
  }
});

test('the correct dough is retrieved and parallel results are required at their joins', () => {
  assert.deepEqual(connectionChoices(at(11)).step_10, ['use']);
  assert.deepEqual(connectionChoices(at(11)).step_11, ['']);
  assert.deepEqual(connectionChoices(at(12)).step_11, ['use']);
  assert.deepEqual(connectionChoices(at(12)).step_12, ['use']);
  assert.deepEqual(connectionChoices(at(15)).step_14, ['use']);
  assert.deepEqual(connectionChoices(at(15)).step_15, ['use']);
  const rows = [];
  for (const row of correct) {
    const request = buildConnectionRequest(inventory, actions, rows);
    rows.push(acceptConnection(response(request, row), request));
  }
  assert.equal(assembleRecipe(inventory, actions, {inputs:rows}).steps.length, 17);
});

test('meanwhile does not prohibit an explicitly used existing sauce', () => {
  const inv = {ingredients:[{id:'ing_1',text:'Tomato 300 g'},{id:'ing_2',text:'Garlic 2 cloves'}]};
  const steps = {steps:[{id:'step_1',action:'Mix tomato into a sauce.'},{id:'step_2',action:'Meanwhile mix garlic into the sauce.'}]};
  const request = buildConnectionRequest(inv, steps, [['ing_1']]);
  assert.deepEqual(connectionChoices(request).step_1, ['use']);
  assert.deepEqual(acceptConnection(response(request,['step_1','ing_2']),request), ['step_1','ing_2']);
});

test('ambiguous matching portions and conditional additions are not made mandatory', () => {
  for (const action of ['Add oil.', 'If needed, add oil.']) {
    const inv = {ingredients:[{id:'ing_1',text:'Oil 30 g'},{id:'ing_2',text:'Oil 25 g'}]};
    const request = buildConnectionRequest(inv,{steps:[{id:'step_1',action}]},[]);
    assert.deepEqual(connectionChoices(request).ing_1, ['', 'oil']);
    assert.deepEqual(connectionChoices(request).ing_2, ['', 'oil']);
  }
  const overlaps = buildConnectionRequest({ingredients:[{id:'ing_1',text:'Olive oil 30 g'},{id:'ing_2',text:'Oil 25 g'}]},
    {steps:[{id:'step_1',action:'Add olive oil.'}]},[]);
  assert.ok(connectionChoices(overlaps).ing_1.includes(''));
  assert.ok(connectionChoices(overlaps).ing_2.includes(''));
});

test('guided replay of the real bad decisions preserves separate preparations and completes without retries', async () => {
  let count = 0, destroyed = 0;
  const events = [];
  const api = { async create() {
    return { promptStreaming(prompt, options) {
      const request = JSON.parse(prompt), index = count++;
      let value = index === 0 ? fixture.ingredients : fixture.actions;
      if (index >= 2) {
        // Emulate schema enforcement on the recorded bad answers, rather than
        // supplying the expected correct graph as the mock's response.
        value = Object.fromEntries(Object.entries(options.responseConstraint.properties).map(([id, field]) => {
          const original = reported[index - 2][id] || '';
          return [id, field.enum.includes(original) ? original : field.enum[0]];
        }));
      }
      const output = JSON.stringify(value);
      return new ReadableStream({ start(controller) {
        for (let i=0;i<output.length;i+=9) controller.enqueue(output.slice(i,i+9));
        controller.close();
      }});
    }, destroy() { destroyed++; } };
  }};
  const recipe = await convertRecipe(fixture.source,{api,onDiagnostic:e=>events.push(e)});
  assert.equal(count,19);
  assert.equal(destroyed,19);
  assert.equal(events.filter(e=>e.type==='correction').length,0);
  recipe.steps.forEach((step,index)=>assert.deepEqual([...step.input_ids].sort(),[...correct[index]].sort(),`action ${index+1}`));
  assert.equal(events.find(e=>e.type==='initializing').pipeline,'staged-v10-preparation-roles');
});
