import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptIngredients, acceptActions, assembleRecipe, connectionSchema } from '../src/recipeExtraction.js';
import { layoutRecipe } from '../src/layoutRecipe.js';
import {source, ingredients, actions, links} from './fixtures/staged.js';
const accepted = () => [acceptIngredients(ingredients, source), acceptActions(actions, source)];
test('application assigns unique IDs and reorders leaves without changing source text', () => {
  const [inventory, steps] = accepted();
  const before = structuredClone([inventory, steps]);
  const recipe = assembleRecipe(inventory, steps, links);
  assert.deepEqual(recipe.ingredients.map(n=>n.id), ['ing_2','ing_3','ing_1']);
  assert.deepEqual(recipe.steps.map(n=>n.id), ['step_1','step_2']);
  assert.deepEqual([inventory, steps], before);
  assert.equal(recipe.ingredients.find(n=>n.id==='ing_1').text, '1 cup yogurt');
  assert.ok(layoutRecipe(recipe).rows.length === 3);
});
test('model owns interpretation while source references and ID shape remain mechanical',()=>{
  const data={title:'Sauce',ingredients:[{text:'1 cup yogurt',role:'base'}]};
  const result=acceptIngredients(data,source);
  assert.equal(result.ingredients[0].text,'1 cup yogurt');
  assert.equal(result.context.ing_1.role,'base');
  assert.throws(()=>acceptIngredients({...data,id:'injected'},source),/unexpected field/);
  assert.throws(()=>acceptActions({setup:[],preparations:[],actions:[{action:'Mix',source:'invented'}]},source),/do not match/);
  assert.throws(()=>acceptIngredients({title:'',ingredients:[{text:'50 g flour',role:''}]},'550 g flour'),/do not match/);
});
test('connection schema contains only fixed references and no editable recipe content', () => {
  const schema=connectionSchema(...accepted());
  assert.deepEqual(Object.keys(schema.properties),['inputs']);
  assert.deepEqual(schema.properties.inputs.items.items.enum,['ing_1','ing_2','ing_3','step_1','step_2']);
});
for (const [name, data, reason] of [
  ['missing row',{inputs:[['ing_1']]},/connection rows/],
  ['invented ID',{inputs:[['ing_999'],['step_1']]},/unknown or forward/],
  ['forward reference',{inputs:[['step_2'],['ing_1']]},/unknown or forward/],
  ['self reference',{inputs:[['step_1'],['ing_1']]},/unknown or forward/],
  ['shared ingredient',{inputs:[['ing_1'],['step_1','ing_1','ing_2','ing_3']]},/used more than once/],
  ['repeated input',{inputs:[['ing_2','ing_2'],['step_1','ing_1','ing_3']]},/used more than once/],
  ['missing ingredient',{inputs:[['ing_2'],['step_1','ing_1']]},/disconnected/],
  ['disconnected action',{inputs:[['ing_2'],['ing_1','ing_3']]},/disconnected/],
  ['empty input',{inputs:[[],['ing_1','ing_2','ing_3']]},/at least one/],
  ['rewritten facts',{...links,ingredients:['55550 g flour']},/unexpected field/]
]) test(`connections reject ${name}`,()=>assert.throws(()=>assembleRecipe(...accepted(),data),reason));


test('ingredient-local quotations work in a concatenated list without copying preceding entries', () => {
  const source = 'For 12 muffinsEggs 3.9 oz (110 g) - (2 medium)Dark chocolate chips 3.5 oz (100 g)For decorationCocoa glaze 4.4 oz (125 g)Food decorations 24 - small eyes';
  const data = {title:'Halloween Muffins', ingredients:[
    {text:'Eggs 3.9 oz (110 g) - (2 medium)',role:'base'},
    {text:'Dark chocolate chips 3.5 oz (100 g)',role:'base'},
    {text:'Cocoa glaze 4.4 oz (125 g)',role:'decoration'},
    {text:'Food decorations 24 - small eyes',role:'decoration'}
  ]};
  const inventory = acceptIngredients(data, source);
  assert.equal(inventory.ingredients.length, 4);
  assert.equal(inventory.context.ing_2.source, data.ingredients[1].text);
  const corrupted = structuredClone(data);
  corrupted.ingredients[1].text = 'Eggs 3.9 oz (11 g) - (2 medium)Dark chocolate chips 3.5 oz (100 g)';
  assert.throws(() => acceptIngredients(corrupted, source), /ing_2 ingredient: wording or numbers/);
  corrupted.ingredients[1].text = 'Dark chocolate chips 3.5 oz (10 g)';
  assert.throws(() => acceptIngredients(corrupted, source), /ing_2 ingredient: wording or numbers/);
});


test('ingredient display is the exact model-selected quote, not a second generated paraphrase', () => {
  const source = 'Whole milk 0.6 cup (135 g) - at room temperature';
  const data = {title:'Muffins',ingredients:[{text:source,role:'batter'}]};
  const result = acceptIngredients(data,source);
  assert.equal(result.ingredients[0].text,source);
  assert.equal(result.context.ing_1.source,source);
  assert.throws(()=>acceptIngredients({title:'Muffins',ingredients:[{text:'0.6 cup (135 g) milk',role:'batter'}]},source),/do not match/);
  assert.throws(()=>acceptIngredients({title:'Muffins',ingredients:[{...data.ingredients[0],source:'unrelated quotation'}]},source),/unexpected field/);
});
