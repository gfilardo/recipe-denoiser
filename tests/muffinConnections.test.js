import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mentionUse } from '../src/connectionSemantics.js';
import { buildConnectionRequest, connectionChoices, acceptConnection } from '../src/actionConnections.js';
import { acceptIngredients, acceptActions, assembleRecipe } from '../src/recipeExtraction.js';
import { sourcePassages } from '../src/sourcePassages.js';
import { prepareIngredientUses } from '../src/ingredientUses.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/muffin-reported.json', import.meta.url)));
const actions = acceptActions(fixture.selection, sourcePassages(fixture.source));
const inventory = prepareIngredientUses(acceptIngredients(fixture.ingredients, fixture.source), actions, fixture.source);

test('an observation does not suppress the following explicit thinning instruction', () => {
  assert.equal(mentionUse(actions.steps[5].action, 'milk').kind, 'use');
  assert.equal(mentionUse('You will see the batter thicken, then dilute it with milk.', 'milk').kind, 'use');
  assert.equal(mentionUse('Thin the batter with milk.', 'milk').kind, 'use');
});

test('future, negative, descriptive and conditional milk mentions remain guarded', () => {
  for (const action of [
    'The milk will be used to thin the batter.',
    'You will notice that the milk thickens.',
    'You will notice the batter thickens, so the milk will be used later.',
    'Do not thin the batter with milk.',
    'Thin the batter without milk.'
  ]) assert.equal(mentionUse(action, 'milk').kind, 'mention', action);
  assert.equal(mentionUse('If the batter is thick, then thin it with milk.', 'milk').kind, 'uncertain');
  assert.equal(mentionUse('Optionally thin the batter with milk.', 'milk').kind, 'uncertain');
});

test('recorded muffin omission is rejected at action 6 and milk enters there without a final leftover', () => {
  const rows = [];
  for (let i = 0; i < actions.steps.length; i++) {
    const request = buildConnectionRequest(inventory, actions, rows);
    const value = Object.fromEntries(request.available_inputs.map(n => [n.id, fixture.responses[i][n.id] || '']));
    if (i === 5) {
      assert.deepEqual(connectionChoices(request).ing_9, ['milk']);
      assert.throws(() => acceptConnection(value, request), /Required here/);
      value.ing_9 = 'milk';
    }
    rows.push(acceptConnection(value, request));
  }
  const recipe = assembleRecipe(inventory, actions, {inputs:rows});
  assert.equal(recipe.steps.length, 16);
  assert.ok(recipe.steps[5].input_ids.includes('ing_9'));
  assert.ok(!recipe.steps[15].input_ids.includes('ing_9'));
  assert.deepEqual(recipe.steps.map(s=>s.action), actions.steps.map(s=>s.action));
});
