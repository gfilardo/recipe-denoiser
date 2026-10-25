import test from 'node:test';
import assert from 'node:assert/strict';
import {bananaBread,verboseRecipe} from '../src/fixtures/bananaBread.js';
import {acceptIngredients,acceptActions,applyPreparations,assembleRecipe} from '../src/recipeExtraction.js';
import {layoutRecipe} from '../src/layoutRecipe.js';
import {inventory,plan} from './fixtures/bananaPlan.js';
test('model-classified setup and preparation can reproduce reference branching and spans',()=>{
  // Explicit supplied model-shaped plan verifies the contract and renderer;
  // this is not a claim that the real local model produced this plan.
  const actions=acceptActions(plan,verboseRecipe,inventory);
  const prepared=applyPreparations(inventory,actions);
  const recipe=assembleRecipe(prepared,actions,{inputs:bananaBread.steps.map(n=>n.input_ids)});
  const shape=layout=>({cols:layout.totalCols,rows:layout.rows.map(row=>row.map(({text,...cell})=>cell))});
  assert.deepEqual(shape(layoutRecipe(recipe)),shape(layoutRecipe(bananaBread)));
  assert.deepEqual(recipe.setup,bananaBread.setup);
  assert.deepEqual(recipe.ingredients.map(n=>n.prep),bananaBread.ingredients.map(n=>n.prep));
  assert.equal(inventory.ingredients[0].prep,'');
  assert.match(recipe.steps[2].action,/avoid overmixing/);
  assert.match(recipe.steps[3].action,/55 minutes/);
  assert.equal(recipe.steps[0].input_ids.length,4);
  assert.equal(recipe.steps[1].input_ids.length,5);
});
test('preparation references are checked mechanically, without cooking-language classification',()=>{
  for(const preparations of [
    [{ingredient_id:'unknown',text:'x',source:'Mash the bananas'}],
    [...plan.preparations,plan.preparations[0]]
  ])assert.throws(()=>acceptActions({...plan,preparations},verboseRecipe,inventory),/Unknown|Duplicate/);
  assert.throws(()=>acceptActions({...plan,setup:[{text:'Preheat',source:'invented'}]},verboseRecipe,inventory),/do not match/);
  const arbitrary={...plan,preparations:[{ingredient_id:'ing_1',text:'Model-authored preparation wording',source:'Mash the bananas'}]};
  assert.equal(acceptActions(arbitrary,verboseRecipe,inventory).preparations.ing_1.text,'Model-authored preparation wording');
});
