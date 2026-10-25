import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureBatches, acceptLabels} from '../src/procedureLabels.js';
import {convertRecipe as convertWithGraphReview} from '../src/aiService.js';
import {layoutRecipe} from '../src/layoutRecipe.js';
import {renderRecipe} from '../src/tableRenderer.js';
import {source, ingredients, actions, links} from './fixtures/staged.js';
function model(labelReply = 'Blend.', controller) {
  let count=0, destroyed=0;
  return {get count(){return count;},get destroyed(){return destroyed;},api:{async create(){
    return {promptStreaming(prompt){
      const request=JSON.parse(prompt);count++;
      if(request.procedures && controller) controller.abort(new Error('Canceled labels'));
      if(request.procedures && labelReply instanceof Error) throw labelReply;
      const value=request.procedures ? Object.fromEntries(request.procedures.map(p=>[p.id,labelReply])) :
        request.ingredients ? actions : request.current_action ? {input_ids:links.inputs[request.action_number-1]} : request.source ? ingredients :
        {input_ids:links.inputs[request.action_number-1]};
      return new ReadableStream({start(c){c.enqueue(JSON.stringify(value));c.close();}});
    },destroy(){destroyed++;}};
  }}};
}
test('the model can generate novel concise wording without a candidate vocabulary',()=>{
  const recipe={ingredients:[],steps:[{id:'s',action:'Stir gently until completely smooth.',input_ids:[]}]};
  const batch=procedureBatches(recipe)[0];
  assert.equal(batch[0].compact,undefined);
  assert.deepEqual(acceptLabels({s:'Gently stir until smooth.'},batch),{s:'Gently stir until smooth.'});
  assert.throws(()=>acceptLabels({unknown:'Stir'},batch));
  assert.deepEqual(acceptLabels({s:''},batch),{});
  assert.deepEqual(acceptLabels({s:'This generated wording is longer than the original instruction.'},batch),{});
});
test('extra phase leaves the entire recipe and layout identical, with labels delivered separately',async()=>{
  const baseline=await convertRecipe(source,{api:model().api,simplifyProcedures:false});
  const f=model(), events=[];let labels;
  const result=await convertRecipe(source,{api:f.api,onProcedureLabels:x=>{labels=x;},onDiagnostic:e=>events.push(e)});
  assert.deepEqual(result,baseline);assert.deepEqual(layoutRecipe(result),layoutRecipe(baseline));
  assert.deepEqual(labels,{step_1:'Blend.',step_2:'Blend.'});assert.equal(f.count,6);assert.equal(f.destroyed,6);
  assert.equal(events.filter(e=>e.type==='correction').length,0);
  assert.equal(events.at(-1).type,'validated');
});
test('invalid or failed optional labeling preserves the validated graph without a correction',async()=>{
  for(const response of [null,new Error('model unavailable')]) {
    const f=model(response),events=[];let labels;
    const result=await convertRecipe(source,{api:f.api,onProcedureLabels:x=>{labels=x;},onDiagnostic:e=>events.push(e)});
    assert.deepEqual(labels,{});assert.equal(result.steps[0].action,'Mix lemon juice and salt.');
    assert.equal(events.filter(e=>e.type==='simplification-fallback').length,1);
    assert.equal(events.filter(e=>e.type==='correction').length,0);assert.equal(f.destroyed,6);
  }
});
test('cancellation during optional labels still cancels and cleans up',async()=>{
  const controller=new AbortController(),f=model('Blend.',controller);
  await assert.rejects(convertRecipe(source,{api:f.api,signal:controller.signal}),/Canceled labels/);
  assert.equal(f.destroyed,6);
});
test('renderer changes only action text and keeps original details accessible',()=>{
  const previous=globalThis.document;
  const node=()=>({children:[],dataset:{},attrs:{},classList:{toggle(){}},append(x){this.children.push(x);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){},createTBody(){const x=node();this.append(x);return x;},insertRow(){const x=node();this.append(x);return x;},insertCell(){const x=node();this.append(x);return x;}});
  globalThis.document={createElement:node};
  try {
    const recipe={title:'Test',setup:[],steps:[{id:'s',input_ids:['a']}]};
    const layout={totalCols:2,rows:[[{id:'a',kind:'ingredient',text:'Salt',rowSpan:1,colSpan:1},{id:'s',kind:'action',text:'Then stir.',rowSpan:1,colSpan:1}]]};
    const target={replaceChildren(...children){this.children=children;}};
    renderRecipe(recipe,layout,target,{s:'Stir.',a:'Wrong'});
    const cells=target.children[1].children[0].children[0].children;
    assert.equal(cells[0].textContent,'Salt');assert.equal(cells[1].textContent,'Stir.');
    assert.equal(cells[1].title,'Then stir.');assert.equal(cells[1].attrs['aria-label'],'Then stir.');
    assert.equal(cells[1].rowSpan,1);assert.equal(cells[1].colSpan,1);
  } finally {globalThis.document=previous;}
});

function convertRecipe(source,options) { return convertWithGraphReview(source,{...options,reviewGraph:false}); }
