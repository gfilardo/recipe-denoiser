import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acceptIngredients, acceptActions, assembleRecipe } from '../src/recipeExtraction.js';
import { sourcePassages } from '../src/sourcePassages.js';
import { prepareIngredientUses } from '../src/ingredientUses.js';
import { buildConnectionRequest, connectionChoices, acceptConnection } from '../src/actionConnections.js';
import { layoutRecipe } from '../src/layoutRecipe.js';
import { convertRecipe } from '../src/aiService.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/pizza-source.json', import.meta.url)));
const original = acceptIngredients(fixture.ingredients, fixture.source);
const actions = acceptActions(fixture.actions, sourcePassages(fixture.source));
const inventory = prepareIngredientUses(original, actions, fixture.source);
const rows = [
  ['ing_1','ing_2','ing_4'], ['step_1'], ['step_2','ing_3','ing_5'],
  ['step_3'], ['step_4'], ['step_5'], ['step_6'], ['step_7','ing_13'],
  ['step_8'], ['step_9'], ['ing_6','ing_7_use_1','ing_8','ing_9'], ['step_10'],
  ['step_12','step_11','ing_7_use_2'], ['step_13'], ['ing_10'],
  ['step_14','step_15'], ['step_16','ing_11','ing_12']
];
const choose = (request, selected) => Object.fromEntries(request.available_inputs.map(n =>
  [n.id, !selected.includes(n.id) ? '' : n.kind === 'result' ? 'use' : n.evidence[0] || 'UNSUPPORTED']));

test('pizza oil uses keep source sections, exact total and source-supported allocations', () => {
  assert.equal(original.ingredients.length, 13);
  assert.equal(inventory.ingredients.length, 14);
  assert.equal(inventory.sections.ing_3.id, 'section_1');
  assert.equal(inventory.sections.ing_7_use_1.label, 'For the topping');
  assert.equal(inventory.sections.ing_13.label, 'For the pan');
  assert.equal(inventory.uses.ing_7_use_1.step_id, 'step_11');
  assert.equal(inventory.uses.ing_7_use_1.phrase, 'about half the oil');
  assert.equal(inventory.uses.ing_7_use_2.step_id, 'step_13');
  assert.equal(inventory.uses.ing_7_use_2.phrase, 'a little more oil');
  for (const use of Object.values(inventory.uses)) assert.equal(use.original_text, original.ingredients[6].text);
  assert.equal(inventory.notes.length, 1);
  assert.match(inventory.notes[0], /25 g.*ONE listed amount/);
  assert.ok(!JSON.stringify(inventory).includes('12.5'));
  assert.deepEqual(prepareIngredientUses(original, actions, fixture.source), inventory);
  assert.deepEqual(acceptIngredients(fixture.ingredients, fixture.source), original);
});

test('reported action 3 can select dough oil and salt but not topping or pan portions', () => {
  const request = buildConnectionRequest(inventory, actions, rows.slice(0, 2));
  const choices = connectionChoices(request);
  assert.equal(request.ingredient_section, 'section_1');
  assert.deepEqual(choices.ing_3, ['oil']);
  assert.deepEqual(choices.ing_5, ['salt']);
  for (const id of ['ing_7_use_1', 'ing_7_use_2', 'ing_9', 'ing_13']) {
    assert.deepEqual(choices[id], ['']);
    assert.throws(() => acceptConnection({ ...choose(request, rows[2]), [id]: id === 'ing_9' ? 'salt' : 'oil' }, request), /unsupported selection/);
  }
  assert.deepEqual(acceptConnection(choose(request, rows[2]), request), rows[2]);
});

test('reported run: explicit uses of dough oil, dough salt and tomato cannot be skipped', () => {
  // The model left these empty at actions 3 and 11, then action 17 could not connect them.
  const at = index => buildConnectionRequest(inventory, actions, rows.slice(0, index));
  const third = at(2), eleventh = at(10);
  assert.ok(third.available_inputs.find(n => n.id === 'ing_3').required);
  assert.ok(third.available_inputs.find(n => n.id === 'ing_5').required);
  assert.throws(() => acceptConnection({ ...choose(third, rows[2]), ing_3: '', ing_5: '' }, third), /ing_3: unsupported selection/);
  assert.deepEqual(connectionChoices(eleventh).ing_6, ['tomato']);
  assert.throws(() => acceptConnection({ ...choose(eleventh, rows[10]), ing_6: '' }, eleventh), /ing_6: unsupported selection/);
  // A later repeated mention does not make an explicit addition optional.
  const first = buildConnectionRequest(inventory, { steps: [actions.steps[0], ...actions.steps] }, []);
  assert.deepEqual(connectionChoices(first).ing_1, ['flour']);
});

test('pizza linking keeps independent preparations and produces a complete tree', () => {
  const accepted = [];
  for (const row of rows) {
    const request = buildConnectionRequest(inventory, actions, accepted);
    accepted.push(acceptConnection(choose(request, row), request));
  }
  const recipe = assembleRecipe(inventory, actions, { inputs: accepted });
  assert.equal(recipe.ingredients.length, 14);
  assert.equal(recipe.steps.length, 17);
  assert.deepEqual(recipe.steps.map(s => s.action), actions.steps.map(s => s.action));
  assert.deepEqual(recipe.setup, inventory.notes);
  const layout = layoutRecipe(recipe);
  const grid = layout.rows.map(() => Array(layout.totalCols).fill(0));
  layout.rows.forEach((cells, row) => cells.forEach(cell => {
    for (let r = row; r < row + cell.rowSpan; r++) for (let c = cell.startCol; c < cell.startCol + cell.colSpan; c++) grid[r][c]++;
  }));
  assert.ok(grid.flat().every(n => n === 1));
});

test('ambiguous or unsupported repeated mentions do not invent additional portions', () => {
  for (const { texts, steps } of [
    { texts: ['Oil 30 g', 'Oil 25 g'], steps: ['Mix half the oil.', 'Drizzle a little more oil.'] },
    { texts: ['Oil 25 g'], steps: ['Mix oil.', 'Stir the oil.'] },
    { texts: ['Oil 25 g'], steps: ['Mix half the oil.', 'Stir oil.'] },
    { texts: ['Oil 25 g'], steps: ['Mix half the oil.', 'Add a little more oil.', 'Add oil.'] },
    { texts: ['Oil 25 g'], steps: ['Mix half the oil.', 'Add a little more oil.', 'Add the remaining oil.'] }
  ]) {
    const inv = { ingredients: texts.map((text, i) => ({ id: `ing_${i + 1}`, text, prep: '' })) };
    const prepared = prepareIngredientUses(inv, { steps: steps.map((action, i) => ({ id: `step_${i + 1}`, action })) }, texts.join('\n'));
    assert.deepEqual(prepared.ingredients, inv.ingredients);
    assert.deepEqual(prepared.uses, {});
  }
});

test('a single clearly divided ingredient needs no invented section or gram split', () => {
  const inv = { ingredients: [{ id: 'ing_1', text: 'Butter 100 g', prep: '' }] };
  const act = { steps: [{ id: 'step_1', action: 'Melt half the butter.' }, { id: 'step_2', action: 'Add the remaining butter.' }] };
  const prepared = prepareIngredientUses(inv, act, 'Butter 100 g');
  assert.equal(prepared.ingredients.length, 2);
  assert.equal(prepared.uses.ing_1_use_2.phrase, 'the remaining butter');
  assert.ok(prepared.ingredients.every(n => n.text.includes('Butter 100 g')));
  assert.ok(!JSON.stringify(prepared).includes('50 g'));
});

test('separate listed oils stay separate even without a split, and explicit new roles override continuation', () => {
  const source = 'For the dough\nFlour 100 g\nOil 30 g\nFor the topping\nOil 25 g';
  const inv = acceptIngredients({ title: '', ingredients: ['Flour 100 g', 'Oil 30 g', 'Oil 25 g'] }, source);
  const steps = { steps: [{ id: 'step_1', action: 'Mix flour.' }, { id: 'step_2', action: 'Then add oil.' }] };
  const prepared = prepareIngredientUses(inv, steps, source);
  assert.equal(prepared.ingredients.length, 3);
  const request = buildConnectionRequest(prepared, steps, [['ing_1']]);
  assert.deepEqual(connectionChoices(request).ing_2, ['oil']);
  assert.deepEqual(connectionChoices(request).ing_3, ['']);
  steps.steps[1].action = 'Mix oil for the topping.';
  const topping = buildConnectionRequest(prepared, steps, [['ing_1']]);
  assert.deepEqual(connectionChoices(topping).ing_2, ['']);
  assert.deepEqual(connectionChoices(topping).ing_3, ['oil']);
});

test('streaming conversion integrates roles and portions without extra inference calls', async () => {
  let calls = 0, destroyed = 0;
  const requests = [], events = [];
  const api = { async create() {
    return { promptStreaming(prompt) {
      const request = JSON.parse(prompt), index = calls++;
      requests.push(request);
      const value = index === 0 ? fixture.ingredients : index === 1 ? fixture.actions : choose(request, rows[index - 2]);
      const output = JSON.stringify(value);
      return new ReadableStream({ start(controller) {
        for (let i = 0; i < output.length; i += 7) controller.enqueue(output.slice(i, i + 7));
        controller.close();
      } });
    }, destroy() { destroyed++; } };
  } };
  const recipe = await convertRecipe(fixture.source, { api, onDiagnostic: e => events.push(e) });
  assert.equal(calls, 19);
  assert.equal(destroyed, 19);
  assert.equal(events.filter(e => e.type === 'correction').length, 0);
  assert.equal(events.find(e => e.type === 'initializing').pipeline, 'staged-v10-preparation-roles');
  assert.equal(requests[4].available_inputs.find(n => n.id === 'ing_13').evidence.length, 0);
  assert.equal(recipe.ingredients.length, 14);
  assert.equal(recipe.steps.length, 17);
});
