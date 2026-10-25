import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConnectionRequest,actionConnectionSchema,acceptConnection} from '../src/actionConnections.js';
import {acceptIngredients,acceptActions,assembleRecipe} from '../src/recipeExtraction.js';
import {source,ingredients,actions,links} from './fixtures/staged.js';
const inv=acceptIngredients(ingredients,source), plan=acceptActions(actions,source);
const choose=(request,ids)=>({input_ids:ids});
test('all live ingredients are offered without language-based exclusions',()=>{
  const request=buildConnectionRequest(inv,plan,[]);
  assert.deepEqual(actionConnectionSchema(request).properties.input_ids.items.enum,['ing_1','ing_2','ing_3']);
  assert.equal(request.available_inputs[0].context.role,'sauce');
  assert.equal(request.action_plan.length,2);
  // Deliberately semantically wrong, structurally valid: code does not pretend
  // to understand the recipe or silently fix the model's choice.
  assert.deepEqual(acceptConnection(choose(request,['ing_1']),request),['ing_1']);
});
test('consumed nodes disappear and result ancestry remains visible',()=>{
  const request=buildConnectionRequest(inv,plan,[links.inputs[0]]);
  assert.deepEqual(request.available_inputs.map(n=>n.id),['ing_1','step_1']);
  assert.deepEqual(request.available_inputs[1].contains.map(n=>n.id),['ing_2','ing_3']);
  for(const id of ['step_2','ing_2','unknown'])assert.throws(()=>acceptConnection({...choose(request,['ing_1','step_1']),[id]:'use'},request));
});
test('final leftovers and empty selections fail without inventing edges',()=>{
  const request=buildConnectionRequest(inv,plan,[links.inputs[0]]);
  assert.throws(()=>acceptConnection(choose(request,[]),request),/at least one/);
  assert.throws(()=>acceptConnection(choose(request,['step_1']),request),/unconnected/);
});
test('accepted interpretation forms a tree without mutating supplied model decisions',()=>{
  const rows=[],before=structuredClone([inv,plan]);
  for(const row of links.inputs){const request=buildConnectionRequest(inv,plan,rows);rows.push(acceptConnection(choose(request,row),request));}
  const recipe=assembleRecipe(inv,plan,{inputs:rows});
  assert.equal(recipe.steps.length,2);assert.deepEqual([inv,plan],before);
});
