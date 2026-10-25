import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebLLMBackend,WEBLLM_MODEL} from '../src/webllmBackend.js';
import {convertRecipe} from '../src/aiService.js';
import {source,ingredients,actions} from './fixtures/staged.js';
function harness(responses=[]) {
  const workers=[],requests=[];
  const api=createWebLLMBackend({workerFactory:()=>{
    const w={terminated:false,postMessage(data){
      requests.push(data);
      queueMicrotask(()=>{
        if(w.terminated) return;
        if(data.type==='load') w.onmessage({data:{type:'ready'}});
        else {
          const response=responses.shift();
          if(response === undefined) return;
          if(response instanceof Error) w.onmessage({data:{type:'error',message:response.message}});
          else { w.onmessage({data:{type:'chunk',id:data.id,text:JSON.stringify(response)}}); w.onmessage({data:{type:'done',id:data.id}}); }
        }
      });
    },terminate(){w.terminated=true;}};
    workers.push(w);return w;
  }});
  return {api,workers,requests};
}
test('WebLLM uses the same full conversion pipeline with fresh stage messages and schemas',async()=>{
  const h=harness([ingredients,actions,actions,
    {ing_1:'step_2',ing_2:'step_1',ing_3:'step_1',step_1:'step_2'}]);
  const result=await convertRecipe(source,{api:h.api,simplifyProcedures:false});
  assert.equal(result.steps.length,2);
  const generations=h.requests.filter(r=>r.type==='generate');
  assert.equal(generations.length,4);
  assert.ok(generations.every(r=>r.messages.length===2 && r.messages[0].role==='system' && r.schema.type==='object'));
  assert.equal(h.requests[0].model,WEBLLM_MODEL);
  assert.equal(h.workers.length,1);
  h.api.dispose();assert.equal(h.workers[0].terminated,true);
});
test('canceling a stream terminates computation and next session starts a new worker',async()=>{
  const h=harness();
  const session=await h.api.create({initialPrompts:[]});
  const reader=session.promptStreaming('x',{responseConstraint:{}}).getReader();
  await reader.cancel();session.destroy();
  assert.equal(h.workers[0].terminated,true);
  await h.api.create({initialPrompts:[]});assert.equal(h.workers.length,2);h.api.dispose();
});
test('abort rejects an active read and terminates the worker',async()=>{
  const h=harness(), abort=new AbortController();
  const session=await h.api.create({initialPrompts:[],signal:abort.signal});
  const reader=session.promptStreaming('x',{responseConstraint:{}}).getReader();
  const read=reader.read();abort.abort(new Error('cancelled test'));
  await assert.rejects(read,/cancelled test/);assert.equal(h.workers[0].terminated,true);session.destroy();
});
test('worker errors surface without a hidden backend fallback',async()=>{
  const h=harness([new Error('GPU allocation failed')]);
  const session=await h.api.create({initialPrompts:[]});
  const reader=session.promptStreaming('x',{responseConstraint:{}}).getReader();
  await assert.rejects(reader.read(),/GPU allocation failed/);assert.equal(h.workers[0].terminated,true);session.destroy();
});
