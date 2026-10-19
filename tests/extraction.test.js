import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptIngredients, acceptActions, assembleRecipe, connectionSchema } from '../src/recipeExtraction.js';
import { sourcePassages } from '../src/sourcePassages.js';
import { layoutRecipe } from '../src/layoutRecipe.js';
import {source, ingredients, actions, links} from './fixtures/staged.js';
const accepted = () => [acceptIngredients(ingredients, source), acceptActions(actions, sourcePassages(source))];
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
test('ingredient extraction cannot inject IDs or action objects', () => {
  assert.throws(()=>acceptIngredients({title:'',ingredients:[{id:'step_1',text:'1 cup yogurt'}]},source), /expected a string/);
  assert.throws(()=>acceptIngredients({...ingredients,id:'duplicate'},source), /unexpected field/);
});
test('source anchoring rejects corrupted quantities and temperatures', () => {
  for (const phrase of ['55550 g flour','44440 g water']) assert.throws(()=>acceptIngredients({title:'',ingredients:[phrase]}, '550 g flour and 440 g water'), /do not match the source/);
  assert.throws(()=>acceptActions({passage_ids:['p_1'],actions:['Bake at 42888°F.']},sourcePassages('Bake at 428°F.')), /unexpected field/);
  assert.throws(()=>acceptIngredients({title:'',ingredients:['50 g flour']}, '550 g flour'), /do not match the source/);
});
test('source anchoring allows whitespace differences but not unit conversions', () => {
  assert.equal(acceptIngredients({title:'',ingredients:['550 g flour']},'550\n g flour').ingredients[0].text,'550 g flour');
  assert.throws(()=>acceptIngredients({title:'',ingredients:['0.55 kg flour']},'550 g flour'), /do not match/);
  assert.throws(()=>acceptActions({setup:['Invent a preheat'],passage_ids:['p_1']},sourcePassages('Mix')), /unexpected field/);
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
