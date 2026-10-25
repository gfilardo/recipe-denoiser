import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertRecipe as convertWithGraphReview} from '../src/aiService.js';
import {bananaBread,verboseRecipe} from '../src/fixtures/bananaBread.js';
import {plan} from './fixtures/bananaPlan.js';
import {createSelectionGuard,buildConnectionRequest,acceptConnection} from '../src/actionConnections.js';
const recorded=JSON.parse(readFileSync(new URL('./fixtures/banana-failed-plan.json',import.meta.url)));
// Adapt historical ingredient responses to the current single-quotation wire format.
const quotedIngredients={...recorded.ingredients,ingredients:recorded.ingredients.ingredients.map(({source,text,role})=>({text:source,role}))};
const failedReview=JSON.parse(readFileSync(new URL('./fixtures/banana-failed-review.json',import.meta.url)));
import {acceptActions,acceptOperationPlan,OPERATION_SCHEMA} from '../src/recipeExtraction.js';
import {inventory} from './fixtures/bananaPlan.js';
import {acceptLabels} from '../src/procedureLabels.js';
import {assertNumericFidelity} from '../src/numericFidelity.js';
const operations={setup:plan.setup,actions:[
  ...plan.preparations.map(p=>({action:p.text,source:p.source})),...plan.actions
]};
const rows=[['ing_1'],['ing_2'],['ing_4'],['step_1','step_2','ing_3','step_3'],
  ['ing_5','ing_6','ing_7','ing_8','ing_9'],['step_4','step_5','ing_10'],['step_6'],['step_7'],['step_8']];
test('recorded reviewer corruption and misplaced preparation are rejected without cooking vocabulary',()=>{
  assert.throws(()=>acceptActions(failedReview.review,verboseRecipe,inventory),/555/);
  const fixedBake=structuredClone(failedReview.review);
  fixedBake.actions[3].action=fixedBake.actions[3].source;
  assert.throws(()=>acceptActions(fixedBake,verboseRecipe,inventory),/1010/);
  assert.throws(()=>acceptOperationPlan(recorded.draft,verboseRecipe,inventory),/every food preparation/);
  assert.equal(OPERATION_SCHEMA.properties.preparations,undefined);
});
test('numeric guard rejects unsupported digits and label omissions without converting units',()=>{
  assertNumericFidelity('55 min; 170°C','170°C for 55 minutes');
  assert.throws(()=>assertNumericFidelity('555 min','55 min'),/555/);
  assert.throws(()=>assertNumericFidelity('½','¼'),/½/);
  for(const text of ['Bake 555 min.','Bake.']) assert.throws(()=>acceptLabels({s:text},[{id:'s',original:'Bake for 55 minutes in the pan.'}]));
  assert.deepEqual(acceptLabels({s:'Bake 55 minutes.'},[{id:'s',original:'Bake for 55 minutes in the pan.'}]),{s:'Bake 55 minutes.'});
});
test('complete action selections receive all live inputs and accepted history without suggested answers',async()=>{
  const corrupt=structuredClone(operations);corrupt.actions[6].action=corrupt.actions[6].action.replace('55','555');
  const responses=[quotedIngredients,operations,corrupt,operations];
  const prompts=[],events=[];let calls=0;
  const api={async create(){return {async prompt(text){
    const p=JSON.parse(text);prompts.push(p);calls++;
    return JSON.stringify(p.current_action ? {input_ids:rows[p.action_number-1]} : responses.shift());
  },destroy(){}};}};
  const result=await convertRecipe(verboseRecipe,{api,simplifyProcedures:false,onDiagnostic:e=>events.push(e)});
  assert.equal(calls,13);
  assert.equal(events.filter(e=>e.type==='correction').length,1);
  assert.deepEqual(result.steps.map(n=>[...n.input_ids].sort()),rows.map(row=>[...row].sort()));
  assert.ok(result.ingredients.every(n=>n.prep===''));
  assert.match(result.steps[5].action,/avoid overmixing/);
  assert.match(result.steps[6].action,/55 minutes/);
  const selections=prompts.filter(p=>p.current_action);
  assert.equal(selections.length,9);
  assert.ok(selections.every(p=>p.source===verboseRecipe && !('proposed_input_ids' in p) && !('decisions' in p) && !('candidate' in p)));
  const fold=selections[5];
  assert.deepEqual(new Set(fold.available_inputs.map(p=>p.id)),new Set(['step_4','step_5','ing_10']));
  assert.deepEqual(fold.accepted_connections.map(n=>n.input_ids),rows.slice(0,5));
});
test('cancellation during complete input selection does not publish a recipe',async()=>{
  const controller=new AbortController();let destroyed=0;
  const responses=[quotedIngredients,operations,operations];
  const api={async create(){return {async prompt(text){if(JSON.parse(text).current_action) controller.abort(new Error('Cancel selection'));return JSON.stringify(responses.shift() || {input_ids:['ing_1']});},destroy(){destroyed++;}};}};
  await assert.rejects(convertRecipe(verboseRecipe,{api,signal:controller.signal}),/Cancel selection/);
  assert.equal(destroyed,4);
});
const request={available_inputs:[{id:'a'},{id:'b'},{id:'c'}]};
test('selected-input streaming accepts any chunk boundary without all-candidate output',()=>{
  const text='{"input_ids":["a","c"]}';
  for(let split=0;split<text.length;split++){
    const guard=createSelectionGuard(request);guard(text.slice(0,split));guard(text.slice(split));
  }
  createSelectionGuard(request)('{"input_ids":["\\u0061"]}');
});
test('selected-input streaming stops duplicates, unknown IDs and runaway unfinished output',()=>{
  for(const [text,pattern] of [['{"input_ids":["a","a"',/Duplicate/],['{"input_ids":["unknown"',/Unknown/],['{"input_ids":["'+ 'a'.repeat(500),/budget/]])
    assert.throws(()=>createSelectionGuard(request)(text),pattern);
});

for (const outcome of ['recover','reject','duplicate','cancel']) {
  test(`complete selection correction: ${outcome}, without automatic edges`,async()=>{
    const controller=new AbortController(),prompts=[],events=[];
    const responses=[quotedIngredients,operations,operations];
    let opened=0,destroyed=0;
    const api={async create(){opened++;return {async prompt(text){
      const p=JSON.parse(text);prompts.push(p);
      const q=p;
      if(q.current_action) {
        const i=q.action_number-1;
        if(i===6) {
          const attempts=prompts.filter(x=>x.current_action?.id==='step_7').length;
          if(attempts===1) return JSON.stringify({input_ids:[]});
          if(outcome==='cancel') controller.abort(new Error('Cancel selection'));
          return JSON.stringify({input_ids:outcome==='reject'?[]:outcome==='duplicate'?['step_6','step_6']:['step_6']});
        }
        return JSON.stringify({input_ids:rows[i]});
      }
      return JSON.stringify(responses.shift());
    },destroy(){destroyed++;}};}};
    const result=convertRecipe(verboseRecipe,{api,signal:controller.signal,simplifyProcedures:false,onDiagnostic:e=>events.push(e)});
    if(outcome==='recover') assert.deepEqual((await result).steps[6].input_ids,['step_6']);
    else await assert.rejects(result,outcome==='cancel'?/Cancel selection/:/single.*correction/);
    assert.equal(events.filter(e=>e.type==='correction').length,1);
    assert.equal(opened,destroyed);
  });
}

test('recorded v6 partial votes are not a successful material interpretation',()=>{
  const trace=JSON.parse(readFileSync(new URL('../evaluation/legacy-traces/model-led-v6-missing-inputs.json',import.meta.url)));
  const selected=id=>trace.decisions.filter(n=>n.action===id && n.participates).map(n=>n.input);
  assert.deepEqual(selected('step_4'),['step_1','step_2']);
  assert.deepEqual(selected('step_5'),['ing_7']);
  assert.deepEqual(selected('step_6'),['ing_10']);
  assert.deepEqual(selected('step_8'),[]);
  assert.deepEqual(trace.reconsideration.input_ids,['step_4']);
  const actionPlan=acceptOperationPlan(operations,verboseRecipe,inventory), accepted=[];
  for(let i=1;i<=6;i++) {
    const request=buildConnectionRequest(inventory,actionPlan,accepted);
    accepted.push(acceptConnection({input_ids:selected(`step_${i}`)},request));
  }
  const transfer=buildConnectionRequest(inventory,actionPlan,accepted);
  assert.equal(transfer.available_inputs.length,9); // Missing materials remain live.
  accepted.push(acceptConnection({input_ids:trace.reconsideration.input_ids},transfer));
  const next=buildConnectionRequest(inventory,actionPlan,accepted);
  assert.throws(()=>acceptConnection({input_ids:selected('step_8')},next),/select at least one input/);
  assert.deepEqual(next.available_inputs.find(n=>n.id==='step_7').contains.map(n=>n.id),['ing_1','ing_2']);
});

function convertRecipe(source,options) { return convertWithGraphReview(source,{...options,reviewGraph:false}); }
