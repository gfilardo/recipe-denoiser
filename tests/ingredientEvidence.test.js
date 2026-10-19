import test from 'node:test';
import assert from 'node:assert/strict';
import { ingredientEvidence } from '../src/ingredientEvidence.js';

const firstPizzaAction = 'To prepare the sheet-pan pizza made with a spoon, start by working the flour and yeast 1 in a bowl together with the water 2 and mix with a spoon or spatula 3.';
const pizzaIngredients = [
  'Type 0 flour 4.3 cups (550 g) - Approximately 4 1/3 cups',
  'Water 1.8 cups (440 g)',
  'Extra virgin olive oil 2 tbsp (30 g)',
  "Fresh brewer's yeast 0.4 oz (10 g)",
  'Fine salt 1.7 tsp (10 g)',
  'Tomato purée 1 ¼ cup (300 g)',
  'Extra virgin olive oil 2 tbsp (25 g)',
  'Oregano to taste',
  'Fine salt to taste',
  'Fior di latte mozzarella cheese 9 oz (250 g)',
  'Basil to taste',
  'Black pepper to taste',
  'Extra virgin olive oil to taste',
];

test('reported pizza first action grounds only flour, water and yeast', () => {
  const evidence = pizzaIngredients.map(ingredient => ingredientEvidence(ingredient, firstPizzaAction));
  assert.deepEqual(evidence.map((quotes, index) => quotes.length ? index + 1 : null).filter(Boolean), [1, 2, 4]);
  assert.deepEqual(evidence[0], ['flour']);
  assert.deepEqual(evidence[1], ['water']);
  assert.deepEqual(evidence[3], ['yeast']);
});

test('evidence is unique exact current-action text and does not normalize original facts', () => {
  const action = 'Add BASIL, basil, and basil; then add 2 tsp water.';
  const evidence = ingredientEvidence('Fresh basil to taste', action);
  assert.deepEqual(evidence, ['BASIL', 'basil']);
  for (const quote of evidence) assert.ok(action.includes(quote));
  assert.deepEqual(ingredientEvidence('Basil to taste', 'Add water.'), []);
  assert.deepEqual(ingredientEvidence('Basil to taste', ''), []);
});

test('case, Unicode accents and conservative singular/plural forms identify mentions', () => {
  assert.deepEqual(ingredientEvidence('2 tomatoes', 'Slice the TOMATO.'), ['TOMATO']);
  assert.deepEqual(ingredientEvidence('1 berry', 'Add berries.'), ['berries']);
  assert.deepEqual(ingredientEvidence('1 cookie', 'Crush the cookies.'), ['cookies']);
  assert.deepEqual(ingredientEvidence('Jalapeño pepper', 'Add JALAPENOS.'), ['JALAPENOS']);
  const decomposed = 'jalapen\u0303o';
  assert.deepEqual(ingredientEvidence('Jalapeño', `Add ${decomposed}.`), [decomposed]);
});

test('joined or spaced ingredient names retain the exact matching source phrase', () => {
  assert.deepEqual(ingredientEvidence('Fior di latte mozzarella cheese 9 oz', 'Cut the fiordilatte and drain it.'), ['fiordilatte']);
  assert.deepEqual(ingredientEvidence('Fiordilatte 250 g', 'Cut the Fior di latte and drain it.'), ['Fior di latte']);
  assert.deepEqual(ingredientEvidence('chickpeas', 'Add chick peas.'), ['chick peas']);
  assert.deepEqual(ingredientEvidence('chick peas', 'Add chickpeas.'), ['chickpeas']);
  assert.deepEqual(ingredientEvidence('chickpeas', 'Add chick, peas.'), []);
  assert.deepEqual(ingredientEvidence('chickpeas', 'Add chick 2 peas.'), []);
});

test('shared tomato mention supports passata without inventing a synonym', () => {
  assert.deepEqual(ingredientEvidence('Tomato purée 1 ¼ cup (300 g)', 'Mix tomato passata, salt and oregano.'), ['tomato']);
  assert.deepEqual(ingredientEvidence('Tomato purée', 'Purée the basil.'), []);
  assert.deepEqual(ingredientEvidence('Tomato purée', 'Add passata.'), []);
});

test('quantities, units, generic descriptors, prep words and function words cannot ground ingredients', () => {
  for (const ingredient of ['Basil to taste', 'Fresh basil 1 cup', 'Ground pepper 2 tsp', 'Fine salt 3 g', 'Chopped onion', 'White flour', 'Tomato purée', 'Type 0 flour']) {
    assert.deepEqual(ingredientEvidence(ingredient, 'Mix to taste in a fresh fine white cup; add 1, 2, 3 g and tsp. Purée, ground, chopped, type.'), [], ingredient);
  }
  assert.deepEqual(ingredientEvidence('Flour 4.3 cups', 'Mix the dry ingredients.'), []);
  assert.deepEqual(ingredientEvidence('Basil to taste', 'Stir the water and cover the bowl.'), []);
  assert.deepEqual(ingredientEvidence('1 cup salt', 'Mix in a saucepan.'), []);
});

test('greasing supplies a narrow fat-use alias without choosing a portion', () => {
  const action = 'Grease a rectangular pan, then turn the dough into it.';
  for (const ingredient of ['Extra virgin olive oil to taste', 'Butter 1 tbsp', 'Lard', 'Vegetable shortening']) {
    assert.deepEqual(ingredientEvidence(ingredient, action), ['Grease'], ingredient);
  }
  assert.deepEqual(ingredientEvidence('Basil to taste', action), []);
  assert.deepEqual(ingredientEvidence('Butter beans', action), []);
  assert.deepEqual(ingredientEvidence('Olive oil 30 g', 'Line a pan.'), []);
  assert.deepEqual(ingredientEvidence('Olive oil 30 g', 'Add the oil.'), ['oil']);
  assert.deepEqual(ingredientEvidence('Olive oil 25 g', 'Add the oil.'), ['oil']);
});
