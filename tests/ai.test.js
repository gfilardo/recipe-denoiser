import test from 'node:test';
import assert from 'node:assert/strict';
import { convertRecipe as convertWithLabels } from '../src/aiService.js';
import { createOutputGuard, MAX_FORMATTING_WHITESPACE } from '../src/outputGuard.js';
import { source, ingredients, actions, links } from './fixtures/staged.js';
const linkResponses = links.inputs.map(input_ids => ({input_ids}));
function fake(responses, { streaming = false, check = () => {} } = {}) {
  const state = { created: 0, destroyed: 0, prompts: [], options: [], canceled: 0 };
  state.api = { create(options) {
    const index = state.created++; state.options.push(options);
    const request = (prompt, settings) => {
      state.prompts.push(JSON.parse(prompt)); check(index, JSON.parse(prompt), settings);
      const value = responses[index];
      if (value instanceof Error) throw value;
      if (typeof value === 'function') return value(prompt, settings);
      const request = JSON.parse(prompt);
      const data = value;
      return JSON.stringify(data);
    };
    return Promise.resolve({
      ...(streaming ? { promptStreaming(prompt, options) {
        const value = request(prompt, options);
        return new ReadableStream({ start(c) { c.enqueue(''); c.enqueue(value.slice(0,20)); c.enqueue(value.slice(20)); c.close(); }, cancel() {state.canceled++;} });
      } } : { prompt: async (...args) => request(...args) }),
      destroy() { state.destroyed++; }
    });
  } };
  return state;
}
test('isolated extraction and action requests preserve facts, IDs and guided schemas', async () => {
  const events=[];
  const f=fake([ingredients,actions,...linkResponses],{check(index,prompt,options){
    assert.equal(options.omitResponseConstraintInput,false);assert.equal(options.responseConstraint.type,'object');assert.ok(options.signal);
    if(index<2) assert.equal(prompt.source,source);
    if(index>=2){assert.equal(prompt.source,source);assert.equal(prompt.actions,undefined);assert.equal(prompt.current_action.id,`step_${index-1}`);assert.deepEqual(options.responseConstraint.properties.input_ids.items.enum,prompt.available_inputs.map(n=>n.id));}
  }});
  const recipe=await convertRecipe(source,{api:f.api,onDiagnostic:e=>events.push(e)});
  assert.equal(f.created,4);assert.equal(f.destroyed,4);
  assert.ok(f.options.every(o=>o.samplingMode==='most-predictable'));
  assert.equal(new Set(f.options.map(o=>o.initialPrompts[0].content)).size,3);
  assert.equal(recipe.steps[0].action,'Mix lemon juice and salt.');
  assert.deepEqual(events.filter(e=>e.type==='attempt').map(e=>e.stage),['ingredients','actions','connections','connections']);
  assert.equal(events.at(-1).type,'validated');
});
test('one ingredient-only correction rejects corrupted quantities before later stages', async () => {
  const bad={...ingredients,ingredients:[{text:'55550 g flour',role:''}]};
  const f=fake([bad,ingredients,actions,...linkResponses]);
  await convertRecipe(source,{api:f.api});
  assert.equal(f.created,5);assert.equal(f.destroyed,5);
  assert.match(f.prompts[1].correction,/do not match the source/);
  assert.equal(f.options[0].initialPrompts[0].content,f.options[1].initialPrompts[0].content);
  assert.ok(!JSON.stringify(f.prompts[1]).includes('55550')); // Bad generated text is not replayed.
});
test('link correction cannot rewrite frozen ingredients or actions', async () => {
  const f=fake([ingredients,actions,{input_ids:['ing_2','ing_3','ing_999']},...linkResponses]);
  const recipe=await convertRecipe(source,{api:f.api});
  assert.equal(f.created,5);assert.deepEqual(f.prompts[2].available_inputs,f.prompts[3].available_inputs);
  assert.deepEqual(f.prompts[2].current_action,f.prompts[3].current_action);
  assert.match(f.prompts[3].correction,/not available|not eligible|Ineligible connection|Unknown connection choice/);
  assert.equal(recipe.ingredients.find(n=>n.id==='ing_1').text,'1 cup yogurt');
});
test('only one correction is allowed globally, not one per stage', async () => {
  const f=fake([{title:'',ingredients:[{text:'invented',role:''}]},ingredients,{passage_ids:['invented']}]);
  await assert.rejects(convertRecipe(source,{api:f.api}),/single stage correction has been used/);
  assert.equal(f.created,3);assert.equal(f.destroyed,3);
});
test('persistent invalid JSON fails after one correction', async () => {
  const f=fake([()=>'{broken',()=>'{broken']);
  await assert.rejects(convertRecipe(source,{api:f.api}),/single stage correction/);
  assert.equal(f.created,2);assert.equal(f.destroyed,2);
});
test('streamed stage text and first-output timing are retained separately', async () => {
  const f=fake([ingredients,actions,...linkResponses],{streaming:true}),events=[];
  await convertRecipe(source,{api:f.api,onDiagnostic:e=>events.push(e)});
  const output=events.filter(e=>e.type==='output');
  assert.deepEqual(output.map(e=>e.attempt),[1,1,2,2,3,3,4,4]);
  assert.equal(output[1].text,JSON.stringify(ingredients));assert.equal(output[3].text,JSON.stringify(actions));
  assert.equal(output[0].chars,20);assert.ok(output.every(e=>e.attemptElapsedMs>=0));
});
test('stalled initialization cancels even if Chrome ignores abort and cleans late session', async () => {
  let resolveCreate,destroyed=0;
  await assert.rejects(convertRecipe(source,{initializationTimeoutMs:10,api:{create:()=>new Promise(r=>{resolveCreate=r})}}),/did not finish initializing/);
  resolveCreate({destroy(){destroyed++}});await Promise.resolve();assert.equal(destroyed,1);
});
test('synchronous cancellation during create cleans the late session once', async () => {
  const controller=new AbortController();let destroyed=0;
  await assert.rejects(convertRecipe(source,{signal:controller.signal,api:{create(){controller.abort();return Promise.resolve({destroy(){destroyed++}});}}}),{name:'AbortError'});
  assert.equal(destroyed,1);
});
test('cancel exits a create promise that ignores abort', async () => {
  const controller=new AbortController();
  const pending=convertRecipe(source,{signal:controller.signal,api:{create:()=>new Promise(()=>{})}});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('shared deadline identifies the stalled action stage and destroys its session', async () => {
  const f=fake([ingredients,()=>new Promise(()=>{})]);
  await assert.rejects(convertRecipe(source,{api:f.api,inferenceTimeoutMs:10}),/Interpreting cooking actions timed out.*No correction was started/);
  assert.equal(f.created,2);assert.equal(f.destroyed,2);
});
test('shared deadline includes later session creation and cleans a late session', async () => {
  const f=fake([ingredients]);let resolveCreate,destroyed=0,calls=0;
  const api={create(o){if(calls++===0)return f.api.create(o);return new Promise(r=>{resolveCreate=r});}};
  await assert.rejects(convertRecipe(source,{api,inferenceTimeoutMs:10}),/Interpreting cooking actions timed out/);
  resolveCreate({destroy(){destroyed++}});await Promise.resolve();assert.equal(destroyed,1);assert.equal(f.destroyed,1);
});
test('correction deadline is shared and identifies correction stage', async () => {
  const f=fake([{title:'',ingredients:[{text:'wrong',role:''}]},()=>new Promise(()=>{})]);
  await assert.rejects(convertRecipe(source,{api:f.api,inferenceTimeoutMs:10}),/Extracting ingredients \(correction\) timed out.*A correction/);
  assert.equal(f.created,2);assert.equal(f.destroyed,2);
});
test('cancellation during a later stage prevents linking', async () => {
  const controller=new AbortController();
  const f=fake([ingredients,()=>{controller.abort();return JSON.stringify(actions)}]);
  await assert.rejects(convertRecipe(source,{api:f.api,signal:controller.signal}),{name:'AbortError'});
  assert.equal(f.created,2);assert.equal(f.destroyed,2);
});
test('stream timeout retains partial output and cancels the reader', async () => {
  const events=[];let canceled=false,destroyed=false;
  await assert.rejects(convertRecipe(source,{inferenceTimeoutMs:10,onDiagnostic:e=>events.push(e),api:{create:async()=>({
    promptStreaming(){return new ReadableStream({start(c){c.enqueue('{')},cancel(){canceled=true}})},destroy(){destroyed=true}
  })}}),/Extracting ingredients timed out/);
  assert.ok(canceled&&destroyed);assert.equal(events.find(e=>e.type==='output').text,'{');
});
test('stream transport error does not trigger a correction', async () => {
  let calls=0,destroyed=0;
  await assert.rejects(convertRecipe(source,{api:{create:async()=>({promptStreaming(){calls++;return new ReadableStream({start(c){c.error(new Error('disconnected'))}})},destroy(){destroyed++}})}}),/disconnected/);
  assert.equal(calls,1);assert.equal(destroyed,1);
});
test('output limit after parseable text rejects it without repair or later stages', async () => {
  const events=[];let calls=0,destroyed=0;
  await assert.rejects(convertRecipe(source,{onDiagnostic:e=>events.push(e),api:{create:async()=>({promptStreaming(){
    calls++;let sent=false;return new ReadableStream({pull(c){if(!sent){sent=true;c.enqueue(JSON.stringify(ingredients))}else c.error(new DOMException('The response exceeded output limits and was truncated.','QuotaExceededError'))}});
  },destroy(){destroyed++}})}}),/response-length limit.*Increasing the time limit will not fix/);
  assert.equal(calls,1);assert.equal(destroyed,1);assert.equal(events.at(-1).category,'output-limit');
  assert.ok(!events.some(e=>e.type==='stage-validated'));
});
test('input quota failures are not relabeled as output truncation', async () => {
  const events=[],f=fake([new DOMException('Input exceeds context window.','QuotaExceededError')]);
  await assert.rejects(convertRecipe(source,{api:f.api,onDiagnostic:e=>events.push(e)}),/Input exceeds/);
  assert.equal(events.at(-1).category,'other');assert.equal(f.destroyed,1);
});
test('whitespace guard tracks chunks, quoted spaces and escaped quotes', () => {
  const guard=createOutputGuard();for(const c of JSON.stringify({text:'escaped " quote \\ '+ ' '.repeat(800)}))guard(c);
  guard(' '.repeat(100));guard('\n'.repeat(100));assert.throws(()=>guard(' '.repeat(MAX_FORMATTING_WHITESPACE-200)),/consecutive whitespace/);
  const formatted=createOutputGuard();for(const c of JSON.stringify(ingredients,null,2))formatted(c);
});
test('whitespace loop stops early, retains snapshot and does not trigger more generations', async () => {
  const events=[];let canceled=false,destroyed=0,calls=0;
  await assert.rejects(convertRecipe(source,{onDiagnostic:e=>events.push(e),api:{create:async()=>({promptStreaming(){
    calls++;return new ReadableStream({start(c){c.enqueue('{');for(let i=0;i<16;i++)c.enqueue(' '.repeat(64));},cancel(){canceled=true}});
  },destroy(){destroyed++}})}}),/512 consecutive whitespace/);
  assert.ok(canceled);assert.equal(calls,1);assert.equal(destroyed,1);
  assert.equal(events.at(-1).category,'whitespace-loop');assert.equal(events.filter(e=>e.type==='output').at(-1).text,'{'+' '.repeat(512));
});


test('invalid source citations get one correction without rewriting accepted ingredients', async()=>{
  const f=fake([ingredients,{setup:[],preparations:[],actions:[{action:'Invented operation',source:'not in source'}]},actions,...linkResponses]);
  const result=await convertRecipe(source,{api:f.api});
  assert.equal(f.created,5);
  assert.match(f.prompts[2].correction,/do not match the source/);
  assert.deepEqual(result.steps.map(s=>s.action),actions.actions.map(a=>a.action));
});

test('unfinished invalid linking stream is canceled early, retained, and corrected only once', async () => {
  let created = 0, canceled = 0, destroyed = 0;
  const events = [];
  const bad = '{"input_ids":["step_1"'; // Unknown candidate key; outer JSON never closes.
  const api = { async create() {
    const index = created++;
    return {
      promptStreaming() {
        return new ReadableStream({ start(c) {
          if (index >= 2) { c.enqueue(bad); return; } // Never finishes without cancel.
          c.enqueue(JSON.stringify(index === 0 ? ingredients : actions)); c.close();
        }, cancel() { canceled++; } });
      }, destroy() { destroyed++; }
    };
  } };
  await assert.rejects(convertRecipe(source, {api, onDiagnostic:e=>events.push(e), inferenceTimeoutMs:1000}), /single stage correction.*(?:not available|not eligible|Ineligible connection|Unknown connection choice)/);
  assert.equal(created,4); assert.equal(destroyed,4); assert.equal(canceled,2);
  assert.equal(events.filter(e=>e.type==='correction').length,1);
  assert.deepEqual(events.filter(e=>e.type==='output' && e.stage==='connections').map(e=>e.text),[bad,bad]);
});
test('early connection failure can recover without changing earlier stages', async () => {
  const f = fake([ingredients,actions,()=>'{"input_ids":["step_1"',...linkResponses],{streaming:true});
  const recipe = await convertRecipe(source,{api:f.api});
  assert.equal(f.created,5);
  assert.deepEqual(f.prompts[2].available_inputs,f.prompts[3].available_inputs);
  assert.deepEqual(recipe.steps.map(s=>[...s.input_ids].sort()),links.inputs.map(row=>[...row].sort()));
});

test('rejected linking request is distinguished from bad output without a correction', async () => {
  const error = new DOMException('The request is invalid - the input or options could not be processed','UnknownError');
  const events=[];
  const f=fake([ingredients,actions,error],{streaming:true});
  await assert.rejects(convertRecipe(source,{api:f.api,onDiagnostic:e=>events.push(e)}),/Chrome rejected the request.*before returning any output/);
  assert.equal(f.created,3);assert.equal(f.destroyed,3);
  assert.equal(events.filter(e=>e.type==='correction').length,0);
  const failure=events.at(-1);
  assert.equal(failure.category,'request-invalid');assert.equal(failure.chars,0);
  assert.equal(failure.originalMessage,error.message);assert.equal(failure.errorName,'UnknownError');
});

test('17 actions use 17 small linking requests and a correction stays on its action', async () => {
  const recipeSource = 'Flour recipe\n1 cup flour\n' + Array.from({length:17},(_,i)=>i===0 ? 'Mix flour.' : `Cook batch ${i+1}.`).join('\n');
  const selected={setup:[],preparations:[],actions:Array.from({length:17},(_,i)=>{const action=i===0?'Mix flour.':`Cook batch ${i+1}.`;return {action,source:action};})};
  const rows=Array.from({length:17},(_,i)=>({input_ids:[i===0?'ing_1':`step_${i}`]}));
  const f=fake([{title:'Flour recipe',ingredients:[{text:'1 cup flour',role:''}]},selected,...rows.slice(0,8),{input_ids:['ing_1']},...rows.slice(8)],{streaming:true,check(index,prompt){
    if(index<2) return;
    assert.equal(prompt.action_count,17);assert.equal(prompt.actions,undefined);assert.equal(prompt.source,recipeSource);
    assert.equal(prompt.available_inputs.length,1);
    assert.equal(prompt.action_plan.length,17);
  }});
  const events=[];
  const recipe=await convertRecipe(recipeSource,{api:f.api,onDiagnostic:e=>events.push(e)});
  assert.equal(recipe.steps.length,17);assert.equal(f.created,20);assert.equal(f.destroyed,20);
  assert.equal(f.prompts[10].action_number,9);assert.equal(f.prompts[11].action_number,9);
  assert.deepEqual(f.prompts[10].available_inputs,f.prompts[11].available_inputs);
  assert.deepEqual(events.filter(e=>e.type==='connection-validated').map(e=>e.completed),Array.from({length:17},(_,i)=>i+1));
  assert.match(events.filter(e=>e.type==='attempt').at(-1).label,/Connecting action 17 of 17/);
});
test('a correction used during one action is not renewed for the next action', async () => {
  const f=fake([ingredients,actions,{input_ids:[]},linkResponses[0],{input_ids:['ing_1','step_1','ing_2']}]);
  await assert.rejects(convertRecipe(source,{api:f.api}),/single stage correction.*(?:not available|not eligible|Ineligible connection|Unknown connection choice)/);
  assert.equal(f.created,5);assert.equal(f.destroyed,5);
  assert.equal(f.prompts[4].current_action.id,'step_2');
});
test('final action correction leaves earlier connections frozen', async () => {
  const f=fake([ingredients,actions,linkResponses[0],{input_ids:['step_1']},linkResponses[1]]);
  const recipe=await convertRecipe(source,{api:f.api});
  assert.equal(f.created,5);assert.equal(f.destroyed,5);
  assert.match(f.prompts[4].correction,/unconnected inputs/);
  assert.deepEqual(f.prompts[3].available_inputs,f.prompts[4].available_inputs);
  assert.deepEqual(recipe.steps.map(s=>[...s.input_ids].sort()),links.inputs.map(row=>[...row].sort()));
});
test('shared deadline covers a stalled later linking request', async () => {
  const f=fake([ingredients,actions,linkResponses[0],()=>new Promise(()=>{})]);
  await assert.rejects(convertRecipe(source,{api:f.api,inferenceTimeoutMs:20}),/Connecting action 2 of 2 timed out/);
  assert.equal(f.created,4);assert.equal(f.destroyed,4);
});
test('cancel between linked actions prevents starting the next request', async () => {
  const controller=new AbortController();const f=fake([ingredients,actions,linkResponses[0]]);
  await assert.rejects(convertRecipe(source,{api:f.api,signal:controller.signal,onDiagnostic(e){if(e.type==='connection-validated')controller.abort();}}),{name:'AbortError'});
  assert.equal(f.created,3);assert.equal(f.destroyed,3);
});

// These regressions isolate extraction/linking; presentation is tested separately.
function convertRecipe(source, options) { return convertWithLabels(source, { ...options, simplifyProcedures: false, reviewActions:false, reviewGraph:false }); }

test('large text responses stop at the application budget without a retry',async()=>{
  for(const streaming of [true,false]) {
    const f=fake([()=>JSON.stringify({data:'x'.repeat(40001)})],{streaming});
    await assert.rejects(convertRecipe(source,{api:f.api}),/40,000-character application limit/);
    assert.equal(f.created,1);assert.equal(f.destroyed,1);
  }
});
