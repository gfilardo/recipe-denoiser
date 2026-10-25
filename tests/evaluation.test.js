import test from 'node:test';
import assert from 'node:assert/strict';
import {runEvaluation} from '../evaluation/run-in-browser.js';
import {source,ingredients,actions,links} from './fixtures/staged.js';
function apiFor(responses){let i=0;return {async create(){return {async prompt(){return JSON.stringify(responses[i++]);},destroy(){}};}};}
test('evaluation preserves supplied model output and never declares a semantic pass',async()=>{
  const report=await runEvaluation([{id:'test',source,review:['Check quantities']}],{api:apiFor([
    ingredients,actions,actions,{ing_2:'step_1',ing_3:'step_1',step_1:'step_2',ing_1:'step_2'},
    {step_1:'Blend.',step_2:'Serve.'} // Deliberate semantic omission, not rewritten.
  ])});
  assert.equal(report.results[0].structuralSuccess,true);
  assert.equal(report.results[0].labels.step_2,'Serve.');
  assert.equal(report.results[0].semanticReview,'not assessed');
  assert.equal(report.results[0].corrections,0);
  assert.equal(report.results[0].outputs.length,5);
});
test('evaluation records a failed model answer without supplying a correct replacement',async()=>{
  const report=await runEvaluation([{id:'bad',source,review:[]}],{api:apiFor([{},{}])});
  assert.equal(report.results[0].structuralSuccess,false);
  assert.equal(report.results[0].recipe,undefined);
  assert.equal(report.results[0].outputs.length,2);
  assert.equal(report.results[0].semanticReview,'not assessed');
});
