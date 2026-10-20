import test from 'node:test';
import assert from 'node:assert/strict';
import {compactProcedure, procedureBatches, acceptLabels} from '../src/procedureLabels.js';
import {convertRecipe} from '../src/aiService.js';
import {layoutRecipe} from '../src/layoutRecipe.js';
import {renderRecipe} from '../src/tableRenderer.js';
import {source, ingredients, actions, links} from './fixtures/staged.js';
function model(labelReply = 'compact', controller) {
  let count=0, destroyed=0;
  return {get count(){return count;},get destroyed(){return destroyed;},api:{async create(){
    return {promptStreaming(prompt){
      const request=JSON.parse(prompt);count++;
      if(request.procedures && controller) controller.abort(new Error('Canceled labels'));
      if(request.procedures && labelReply instanceof Error) throw labelReply;
      const value=request.procedures ? Object.fromEntries(request.procedures.map(p=>[p.id,labelReply])) :
        request.source ? ingredients : request.passages ? actions :
        Object.fromEntries(request.available_inputs.map(n=>[n.id,links.inputs[request.action_number-1].includes(n.id)?n.kind==='result'?'use':n.evidence[0]:'']));
      return new ReadableStream({start(c){c.enqueue(JSON.stringify(value));c.close();}});
    },destroy(){destroyed++;}};
  }}};
}
test('compact labels retain numeric, equipment, texture, warning and timing details',()=>{
  const action='Then bake at 180°C for 20–25 minutes in a covered pan until golden; do not boil.';
  assert.equal(compactProcedure({action,input_ids:[]},{ingredients:[]}),action.slice(5).replace(/^b/,'B'));
  for(const action of ['Do not add milk.', 'If thick, add milk.', 'Rest for half an hour.', 'Mix half the flour with water.', 'To prepare sauce without milk, stir.', 'After this time, unmold the cake.']) {
    assert.equal(compactProcedure({action,input_ids:[]},{ingredients:[]}),action);
  }
});
test('only a complete bare ingredient list can become an implicit operation',()=>{
  const recipe={ingredients:[{id:'a',text:'1 tsp lemon juice'},{id:'b',text:'1 pinch salt'}]};
  assert.equal(compactProcedure({action:'Mix lemon juice and salt.',input_ids:['a','b']},recipe),'Mix.');
  for(const action of ['Mix half the lemon juice and salt.', 'Mix lemon juice and salt with a spoon.', 'Mix lemon juice and salt until dissolved.'])
    assert.equal(compactProcedure({action,input_ids:['a','b']},recipe),action);
  assert.equal(compactProcedure({action:'Mix lemon juice and salt.',input_ids:['a','result']},recipe),'Mix lemon juice and salt.');
});
test('presentation selections reject unknown steps and invented labels; batches stay bounded',()=>{
  const recipe={ingredients:[],steps:Array.from({length:19},(_,i)=>({id:`s${i}`,action:'Then stir.',input_ids:[]}))};
  const batches=procedureBatches(recipe);assert.deepEqual(batches.map(b=>b.length),[8,8,3]);
  const row=batches[2];
  assert.throws(()=>acceptLabels({s16:'compact',s17:'compact',invented:'compact'},row));
  assert.throws(()=>acceptLabels({s16:'new words',s17:'keep',s18:'keep'},row));
});
test('extra phase leaves the entire recipe and layout identical, with labels delivered separately',async()=>{
  const baseline=await convertRecipe(source,{api:model().api,simplifyProcedures:false});
  const f=model(), events=[];let labels;
  const result=await convertRecipe(source,{api:f.api,onProcedureLabels:x=>{labels=x;},onDiagnostic:e=>events.push(e)});
  assert.deepEqual(result,baseline);assert.deepEqual(layoutRecipe(result),layoutRecipe(baseline));
  assert.deepEqual(labels,{step_1:'Mix.'});assert.equal(f.count,5);assert.equal(f.destroyed,5);
  assert.equal(events.filter(e=>e.type==='correction').length,0);
  assert.equal(events.at(-1).type,'validated');
});
test('invalid or failed optional labeling preserves the validated graph without a correction',async()=>{
  for(const response of ['invented',new Error('model unavailable')]) {
    const f=model(response),events=[];let labels;
    const result=await convertRecipe(source,{api:f.api,onProcedureLabels:x=>{labels=x;},onDiagnostic:e=>events.push(e)});
    assert.deepEqual(labels,{});assert.equal(result.steps[0].action,'Mix lemon juice and salt.');
    assert.equal(events.filter(e=>e.type==='simplification-fallback').length,1);
    assert.equal(events.filter(e=>e.type==='correction').length,0);assert.equal(f.destroyed,5);
  }
});
test('cancellation during optional labels still cancels and cleans up',async()=>{
  const controller=new AbortController(),f=model('compact',controller);
  await assert.rejects(convertRecipe(source,{api:f.api,signal:controller.signal}),/Canceled labels/);
  assert.equal(f.destroyed,5);
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
