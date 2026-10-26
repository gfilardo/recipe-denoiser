import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {convertRecipe} from '../src/aiService.js';
import {source,ingredients,actions} from './fixtures/staged.js';
const graph={ing_1:'step_2',ing_2:'step_1',ing_3:'step_1',step_1:'step_2'};
function fake(responses) {
  const requests=[],events=[];
  return {requests,events,api:{async create({initialPrompts}) {return {
    async prompt(prompt,options){requests.push({prompt,options,initialPrompts});const output=responses.shift();return typeof output==='string'?output:JSON.stringify(output);},destroy(){}
  };}}};
}
test('both extraction modes have identical explicit prompts; only extraction enforcement differs',async()=>{
  const runs=[];
  for(const constrainExtraction of [true,false]) {
    const f=fake([ingredients,actions,actions,graph]);
    const result=await convertRecipe(source,{api:f.api,constrainExtraction,simplifyProcedures:false,onDiagnostic:e=>f.events.push(e)});
    assert.equal(result.steps.length,2);
    assert.equal(f.events.find(e=>e.type==='initializing').constrainExtraction,constrainExtraction);
    f.requests.forEach((request,i)=>{
      assert.equal(Object.hasOwn(request.options,'responseConstraint'),i<3?constrainExtraction:true);
      if(i<3) assert.ok(JSON.parse(request.prompt).output_schema);
    });
    runs.push(f);
  }
  assert.deepEqual(runs[0].requests.map(r=>[r.prompt,r.initialPrompts]),runs[1].requests.map(r=>[r.prompt,r.initialPrompts]));
});
test('unconstrained malformed output gets one correction, never relaxed parsing',async()=>{
  const f=fake(['not JSON','```json {} ```']);
  await assert.rejects(convertRecipe(source,{api:f.api,constrainExtraction:false}),/single stage correction/);
  assert.equal(f.requests.length,2);
  assert.ok(f.requests.every(r=>!Object.hasOwn(r.options,'responseConstraint')));
});
test('unconstrained extraction still rejects invented ingredient text',async()=>{
  const bad={title:'Bad',ingredients:[{text:'invented material',role:'base'}]};
  const f=fake([bad,bad]);
  await assert.rejects(convertRecipe(source,{api:f.api,constrainExtraction:false}),/wording or numbers/);
});
test('WebLLM worker omits response_format entirely when no constraint is requested',async()=>{
  const requests=[],messages=[];
  const engine={resetChat:async()=>{},chat:{completions:{create:async request=>{requests.push(request);return (async function*(){yield {choices:[{delta:{content:'{}'}}]};})();}}}};
  const context=vm.createContext({CreateMLCEngine:async()=>engine,self:{postMessage:m=>messages.push(m)}});
  const worker=readFileSync(new URL('../src/webllmWorker.js',import.meta.url),'utf8').replace(/^import .*;$/m,'');
  vm.runInContext(worker,context);
  await context.self.onmessage({data:{type:'load',model:'test',settings:{temperature:0,maxTokens:4096,contextWindow:16384}}});
  for(const schema of [undefined,{type:'object'}]) await context.self.onmessage({data:{type:'generate',id:1,messages:[],schema}});
  assert.equal(Object.hasOwn(requests[0],'response_format'),false);
  assert.equal(requests[1].response_format.schema,'{"type":"object"}');
  assert.equal(messages.filter(m=>m.type==='done').length,2);
});
