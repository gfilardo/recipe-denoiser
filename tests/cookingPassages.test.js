import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourcePassages } from '../src/sourcePassages.js';
import { cookingPassages } from '../src/cookingPassages.js';
import { acceptIngredients, acceptActions, actionSchema } from '../src/recipeExtraction.js';
import { prepareIngredientUses } from '../src/ingredientUses.js';
import { buildConnectionRequest, connectionChoices, acceptConnection } from '../src/actionConnections.js';
import { convertRecipe } from '../src/aiService.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/autumn-cake-source.json', import.meta.url)));
const inventory = acceptIngredients(fixture.ingredients, fixture.source);
const passages = sourcePassages(fixture.source);
const filtered = cookingPassages(passages, inventory);
const selected = { passage_ids: fixture.reported_selection.passage_ids.filter(id => filtered.eligible.some(p => p.id === id)) };

test('cake headings and ingredient entries are not available as cooking actions', () => {
  assert.equal(passages.length, 49);
  assert.equal(filtered.eligible[0].id, 'p_23');
  assert.equal(filtered.eligible[0].text, passages.find(p => p.id === 'p_23').text);
  const ids = actionSchema(filtered.eligible).properties.passage_ids.items.enum;
  for (const id of ['p_1','p_2','p_9','p_15','p_21','p_22']) assert.ok(!ids.includes(id), id);
  assert.throws(() => acceptActions(fixture.reported_selection, filtered.eligible), /Unknown source passage: p_2/);
  assert.throws(() => acceptActions({passage_ids:['p_23','p_9']}, filtered.eligible), /Unknown source passage: p_9/);
  const actions = acceptActions(selected, filtered.eligible);
  assert.equal(actions.steps[0].action, passages.find(p => p.id === 'p_23').text);
  assert.equal(actions.steps.length, 26);
  assert.ok(filtered.eligible.every(p => fixture.source.slice(p.start,p.end) === p.text));
});

test('missing preparation headings do not discard unknown cooking prose', () => {
  const source = 'INGREDIENTS\nOil 10 g\nHeat the pan.\nPour in the oil.';
  const list = {title:'Recipe',ingredients:[{id:'ing_1',text:'Oil 10 g'}]};
  assert.deepEqual(cookingPassages(sourcePassages(source), list).eligible.map(p => p.text), ['Heat the pan.', 'Pour in the oil.']);
  const prose = sourcePassages('How to prepare sauce: mix well.');
  assert.deepEqual(cookingPassages(prose,list).eligible, prose);
});

test('almond milk is the only eligible ingredient at the first cake action', () => {
  const actions = acceptActions(selected, filtered.eligible);
  const prepared = prepareIngredientUses(inventory, actions, fixture.source);
  const request = buildConnectionRequest(prepared, actions, []);
  const choices = connectionChoices(request);
  assert.deepEqual(Object.entries(choices).filter(([, values]) => values.some(Boolean)).map(([id]) => id), ['ing_3']);
  assert.ok(choices.ing_3.includes('almond milk'));
  assert.ok(!choices.ing_3.includes(''));
  const data = Object.fromEntries(Object.keys(choices).map(id => [id, id === 'ing_3' ? 'almond milk' : '']));
  assert.deepEqual(acceptConnection(data, request), ['ing_3']);
  assert.throws(() => acceptConnection({...data, ing_3:''}, request), /Required here/);
});

test('compound modifiers do not erase independent mentions or shared head-noun portions', () => {
  const inv = {ingredients:[{id:'ing_1',text:'Almond flour 100 g'},{id:'ing_2',text:'Almond milk 65 g'},{id:'ing_3',text:'Almonds 50 g'}]};
  const request = buildConnectionRequest(inv,{steps:[{id:'step_1',action:'Mix almonds with almond milk.'}]},[]);
  assert.ok(connectionChoices(request).ing_3.includes('almonds'));
  const oils = buildConnectionRequest({ingredients:[{id:'ing_1',text:'Olive oil 30 g'},{id:'ing_2',text:'Oil 25 g'}]},
    {steps:[{id:'step_1',action:'Add olive oil.'}]},[]);
  assert.ok(connectionChoices(oils).ing_1.includes(''));
  assert.ok(connectionChoices(oils).ing_2.includes(''));
});

test('the reported invalid selection is corrected before linking, then heating milk validates', async () => {
  const controller = new AbortController();
  const events = [], requests = [];
  let calls = 0;
  const api = { async create() { return {
    async prompt(prompt, options) {
      const request = JSON.parse(prompt), index = calls++;
      requests.push(request);
      if (index === 0) return JSON.stringify(fixture.ingredients);
      if (index === 1 || index === 2) {
        assert.ok(!options.responseConstraint.properties.passage_ids.items.enum.includes('p_2'));
        assert.ok(!request.passages.some(p => p.id === 'p_9'));
        return JSON.stringify(index === 1 ? fixture.reported_selection : selected);
      }
      assert.equal(index, 3, 'only the first real action is exercised in this targeted test');
      assert.match(request.current_action.action, /first pour the almond milk/);
      return JSON.stringify(Object.fromEntries(request.available_inputs.map(n => [n.id,n.id === 'ing_3' ? 'almond milk' : ''])));
    }, destroy() {}
  }; }};
  await assert.rejects(convertRecipe(fixture.source, { api, signal:controller.signal, onDiagnostic(event) {
    events.push(event);
    if (event.type === 'connection-validated') controller.abort(new Error('Test completed at first validated cooking action'));
  }}), /Test completed at first validated cooking action/);
  assert.equal(calls, 4);
  assert.equal(events.filter(e => e.type === 'correction').length, 1);
  assert.equal(events.find(e => e.type === 'correction').stage, 'actions');
  assert.match(requests[2].correction, /Unknown source passage: p_2/);
  assert.equal(events.filter(e => e.type === 'connection-validated').length, 1);
});
