import test from 'node:test';
import assert from 'node:assert/strict';
import { ingredientSections } from '../src/ingredientSections.js';
const list = texts => texts.map((text, index) => ({ id: `ing_${index + 1}`, text }));

test('reported concatenated pizza ingredients preserve topping and pan boundaries', () => {
  const ingredients = list([
    'Type 0 flour 4.3 cups (550 g) - Approximately 4 1/3 cups', 'Water 1.8 cups (440 g)',
    'Extra virgin olive oil 2 tbsp (30 g)', "Fresh brewer's yeast 0.4 oz (10 g)", 'Fine salt 1.7 tsp (10 g)',
    'Tomato purée 1 ¼ cup (300 g)', 'Extra virgin olive oil 2 tbsp (25 g)', 'Oregano to taste', 'Fine salt to taste',
    'Fior di latte mozzarella cheese 9 oz (250 g)', 'Basil to taste', 'Black pepper to taste', 'Extra virgin olive oil to taste',
  ]);
  const source = 'INGREDIENTS\nIngredients for a 16x12 in sheet pan (40x30 cm)' + ingredients.slice(0, 5).map(item => item.text).join('') + 'For the topping' + ingredients.slice(5, 12).map(item => item.text).join('') + 'For the pan' + ingredients[12].text + '\nPreparation\nAdd oil and salt.';
  const sections = ingredientSections(source, ingredients);
  for (let index = 0; index < 5; index++) assert.deepEqual(sections[ingredients[index].id], { id: 'section_1', label: '' });
  for (let index = 5; index < 12; index++) assert.deepEqual(sections[ingredients[index].id], { id: 'section_2', label: 'For the topping' });
  assert.deepEqual(sections.ing_13, { id: 'section_3', label: 'For the pan' });
});

test('a single unlabelled list gets one explicit default group', () => {
  assert.deepEqual(ingredientSections('1 cup flour\n1 tsp salt', list(['1 cup flour', '1 tsp salt'])), {
    ing_1: { id: 'section_1', label: '' }, ing_2: { id: 'section_1', label: '' },
  });
});

test('multiline matching preserves exact Markdown and colon heading labels', () => {
  const ingredients = list(['1 cup flour', '2 tbsp olive oil', '1 tsp salt']);
  const source = '# Pizza\n## For the dough\n- 1   CUP\n  FLOUR\n\n### For the Topping\n- 2 tbsp olive oil\n\nFor the pan:\n- 1 tsp salt';
  assert.deepEqual(ingredientSections(source, ingredients), {
    ing_1: { id: 'section_1', label: 'For the dough' },
    ing_2: { id: 'section_2', label: 'For the Topping' },
    ing_3: { id: 'section_3', label: 'For the pan' },
  });
});

test('repeated identical listed portions align sequentially and keep distinct sections', () => {
  const ingredients = list(['Oil to taste', 'Oil to taste', 'Oil to taste']);
  assert.deepEqual(ingredientSections('For the dough\nOil to taste\nFor the topping\nOil to taste\nFor the pan\nOil to taste', ingredients), {
    ing_1: { id: 'section_1', label: 'For the dough' },
    ing_2: { id: 'section_2', label: 'For the topping' },
    ing_3: { id: 'section_3', label: 'For the pan' },
  });
});

test('missing or ambiguous full-list alignment returns no guessed metadata', () => {
  assert.deepEqual(ingredientSections('Flour\nSalt', list(['Flour', 'Basil'])), {});
  assert.deepEqual(ingredientSections('For the dough\nOil\nFor the topping\nOil\nFor the pan\nOil', list(['Oil', 'Oil'])), {});
  assert.deepEqual(ingredientSections('Flour\nSalt\nMix flour and salt.', list(['Flour', 'Salt'])), {});
  assert.deepEqual(ingredientSections('Flour', []), {});
});

test('cooking prose between ingredient phrases does not become a heading', () => {
  for (const gap of ['\nMix well, then add water.\n', '\nMix the dough:\n', '\nFor a better result, mix thoroughly.\n', '\nStir the dough.\n## Topping\n']) {
    const sections = ingredientSections(`1 cup flour${gap}1 tsp salt`, list(['1 cup flour', '1 tsp salt']));
    assert.equal(sections.ing_2.id, 'section_1', gap);
    assert.equal(sections.ing_2.label, '', gap);
  }
});
