import test from 'node:test';
import assert from 'node:assert/strict';
import {convertRecipe} from '../src/aiService.js';
import {createGraphSelectionGuard,graphSelectionSchema,acceptGraphSelection} from '../src/actionConnections.js';
import {source,ingredients,actions,links} from './fixtures/staged.js';
const reviewed={ing_2:'step_1',ing_3:'step_1',step_1:'step_2',ing_1:'step_2'};
function model(reviews,{brokenDraft=false,spendCorrection=false,cancel}={}) {
  const prompts=[],events=[],initial=spendCorrection?[ingredients,actions,{},actions]:[ingredients,actions,actions];
  let opened=0,destroyed=0;
  return {prompts,events,get opened(){return opened;},get destroyed(){return destroyed;},api:{async create(){opened++;return {
    async prompt(text){
      const p=JSON.parse(text);prompts.push(p);
      if(p.required_input_ids){if(cancel)cancel.abort(new Error('Canceled global interpretation'));return JSON.stringify(reviews.shift());}
      if(p.current_action)return JSON.stringify({input_ids:brokenDraft?(p.action_number===1?['ing_2']:[]):links.inputs[p.action_number-1]});
      return JSON.stringify(initial.shift());
    },destroy(){destroyed++;}
  };}}};
}
test('global interpretation runs directly with no draft requests',async()=>{
  const f=model([reviewed],{brokenDraft:true});
  const recipe=await convertRecipe(source,{api:f.api,simplifyProcedures:false,onDiagnostic:e=>f.events.push(e)});
  assert.deepEqual(recipe.steps.map(n=>n.input_ids),links.inputs);
  const global=f.prompts.find(p=>p.required_input_ids);
  assert.equal(global.source,source);assert.equal(global.draft,undefined);
  assert.deepEqual(global.required_input_ids,['ing_1','ing_2','ing_3','step_1']);
  assert.equal(f.prompts.some(p=>p.current_action),false);
  assert.equal(f.events.some(e=>e.type==='graph-review'),false);
  assert.equal(f.opened,4);assert.equal(f.opened,f.destroyed);
});
test('global interpretation runs once when valid',async()=>{
  const f=model([reviewed]);await convertRecipe(source,{api:f.api,simplifyProcedures:false});
  assert.equal(f.prompts.filter(p=>p.required_input_ids).length,1);
});
test('invalid global destinations use the reserved graph correction',async()=>{
  const f=model([{},reviewed]);
  assert.deepEqual((await convertRecipe(source,{api:f.api,simplifyProcedures:false})).steps.map(n=>n.input_ids),links.inputs);
  assert.ok(f.prompts.filter(p=>p.required_input_ids)[1].correction);
  assert.equal(f.opened,f.destroyed);
});
test('invalid global result fails after its bounded correction',async()=>{
  const f=model([{},{}]);let labels=false;
  await assert.rejects(convertRecipe(source,{api:f.api,onProcedureLabels:()=>labels=true}),/graph correction/);
  assert.equal(labels,false);assert.equal(f.opened,f.destroyed);
});
test('graph correction remains available after extraction correction, with previous response and feedback',async()=>{
  const f=model([{},reviewed],{spendCorrection:true});
  const recipe=await convertRecipe(source,{api:f.api,simplifyProcedures:false,onDiagnostic:e=>f.events.push(e)});
  assert.deepEqual(recipe.steps.map(n=>n.input_ids),links.inputs);
  const requests=f.prompts.filter(p=>p.required_input_ids);
  assert.equal(requests.length,2);
  assert.equal(requests[1].previous_response,'{}');
  assert.ok(requests[1].correction);
  assert.deepEqual(f.events.filter(e=>e.type==='correction').map(e=>e.budget),['extraction','graph']);
});
test('global cancellation cleans up without publishing',async()=>{
  const cancel=new AbortController(),f=model([reviewed],{cancel});
  await assert.rejects(convertRecipe(source,{api:f.api,signal:cancel.signal}),/Canceled global/);
  assert.equal(f.opened,f.destroyed);
});
const inventory={title:'Test',ingredients:[{id:'i1',text:'A',prep:''},{id:'i2',text:'B',prep:''}]};
const plan={setup:[],steps:[{id:'s1',action:'First'},{id:'s2',action:'Second'}]};
test('destination schema requires every nonfinal node and regrouping preserves exact model edges',()=>{
  assert.deepEqual(graphSelectionSchema(inventory,plan).required,['i1','i2','s1']);
  const result=acceptGraphSelection({s1:'s2',i2:'s1',i1:'s1'},inventory,plan);
  assert.deepEqual(result.steps.map(n=>n.input_ids),[['i2','i1'],['s1']]);
  for(const invalid of [{i1:'s1'},{i1:'s1',i2:'s1',s1:'s2',s2:'s2'},{i1:'s1',i2:'s1',s1:'s1'},{i1:'s2',i2:'s2',s1:'s2'},{s1:['i1','i2'],s2:['s1']}])
    assert.throws(()=>acceptGraphSelection(invalid,inventory,plan));
});
test('destination streaming permits shared destinations but rejects repeated keys and unknown IDs',()=>{
  const valid=JSON.stringify({i1:'s1',i2:'s1',s1:'s2'});
  for(let split=0;split<valid.length;split++){
    const guard=createGraphSelectionGuard(inventory,plan);guard(valid.slice(0,split));guard(valid.slice(split));
  }
  for(const [raw,message] of [['{"i1":"s1","i1":',/Duplicate/],['{"i1":"unknown"}',/Unknown/],['{"s2":',/Unknown/],['{"i1":"'+'x'.repeat(2000),/budget/]])
    assert.throws(()=>createGraphSelectionGuard(inventory,plan)(raw),message);
});
for(const failure of ['duplicate','unknown','malformed','transport','cancel']) {
  test(`global ${failure} has bounded recovery after extraction correction`,async()=>{
    const controller=new AbortController(),events=[],initial=[ingredients,actions,{},actions];let calls=0,opened=0,destroyed=0;
    const api={async create(){opened++;return {
      promptStreaming(text){
        const p=JSON.parse(text);let output;
        if(p.required_input_ids){
          calls++;
          if(failure==='transport')throw new Error('Transport unavailable');
          if(failure==='cancel')controller.abort(new Error('User canceled graph'));
          output=calls>1?JSON.stringify(reviewed):failure==='unknown'?'{"unknown":':failure==='malformed'?'{invalid':'{"ing_1":"step_1","ing_1":';
        }else output=JSON.stringify(initial.shift());
        return new ReadableStream({start(c){c.enqueue(output);c.close();}});
      },destroy(){destroyed++;}
    };}};
    const result=convertRecipe(source,{api,signal:controller.signal,simplifyProcedures:false,onDiagnostic:e=>events.push(e)});
    if(['transport','cancel'].includes(failure)) {
      await assert.rejects(result,failure==='transport'?/Transport unavailable/:/User canceled graph/);
      assert.equal(calls,1);
    }else {
      assert.deepEqual((await result).steps.map(n=>n.input_ids),links.inputs);assert.equal(calls,2);
    }
    assert.equal(opened,destroyed);
  });
}

test('graph feedback identifies all empty operations without assigning edges',()=>{
  const p={setup:[],steps:[{id:'s1',action:'A'},{id:'s2',action:'B'},{id:'s3',action:'C'}]};
  assert.throws(()=>acceptGraphSelection({i1:'s3',i2:'s3',s1:'s3',s2:'s3'},inventory,p),/s1, s2: needs at least one input/);
});
