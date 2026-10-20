import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingredientEvidence } from '../src/ingredientEvidence.js';
import { mentionUse } from '../src/connectionSemantics.js';
import { acceptIngredients, acceptActions, assembleRecipe } from '../src/recipeExtraction.js';
import { sourcePassages } from '../src/sourcePassages.js';
import { cookingPassages } from '../src/cookingPassages.js';
import { prepareIngredientUses } from '../src/ingredientUses.js';
import { buildConnectionRequest, connectionChoices, acceptConnection } from '../src/actionConnections.js';
import { convertRecipe as convertWithLabels } from '../src/aiService.js';
import { layoutRecipe } from '../src/layoutRecipe.js';
const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const fixture = read('autumn-cake-source'), recorded = read('cake-reported-links'), expected = read('cake-expected-links');
const extracted = acceptIngredients(fixture.ingredients, fixture.source);
const passages = cookingPassages(sourcePassages(fixture.source), extracted).eligible;
const selection = {passage_ids:passages.map(p=>p.id)};
const actions = acceptActions(selection, passages);
const inventory = prepareIngredientUses(extracted, actions, fixture.source);
const at = index => buildConnectionRequest(inventory, actions, expected.slice(0,index));
const choose = (request, ids) => Object.fromEntries(request.available_inputs.map(n=>[n.id, ids.includes(n.id) ? n.kind==='result'?'use':n.evidence.at(-1) : '']));

test('both separately mentioned flours and the source spelling variant are required at their uses', () => {
  const sift=at(9), spice=at(12);
  assert.deepEqual(connectionChoices(sift).ing_1,['flour']);
  assert.ok(connectionChoices(sift).ing_2.includes('almond flour'));
  assert.ok(!connectionChoices(sift).ing_2.includes(''));
  assert.ok(!connectionChoices(sift).ing_2.includes('flour'));
  assert.deepEqual(connectionChoices(spice).ing_5,['cardamom']);
  assert.throws(()=>acceptConnection({...choose(sift,expected[9]),ing_1:''},sift),/Required here/);
  assert.throws(()=>acceptConnection({...choose(spice,expected[12]),ing_5:''},spice),/Required here/);
  assert.equal(inventory.ingredients.find(n=>n.id==='ing_5').text,'Cardamon ½ tsp (1 g) - ground');
});

test('shared head nouns remain ambiguous without a separate standalone mention', () => {
  const request=buildConnectionRequest({ingredients:[{id:'a',text:'Type 00 flour 100 g'},{id:'b',text:'Almond flour 100 g'}]},
    {steps:[{id:'step_1',action:'Sift almond flour.'}]},[]);
  assert.ok(connectionChoices(request).a.includes(''));
  assert.ok(connectionChoices(request).b.includes(''));
});

test('peeling nuts, blanching water and future juice instructions do not introduce unrelated ingredients', () => {
  assert.deepEqual(ingredientEvidence('Orange peel 1','Drain them and peel them.'),[]);
  assert.ok(ingredientEvidence('Orange peel 1','Peel them, then add the peel.').includes('peel'));
  assert.deepEqual(ingredientEvidence('Rose water 5 g','Blanch pistachios in boiling water.'),[]);
  assert.equal(mentionUse('The juice will be used to brush the cake.','cake').kind,'mention');
  assert.deepEqual(connectionChoices(at(3)).ing_7,['']);
  assert.deepEqual(connectionChoices(at(13)).ing_17,['']);
  assert.ok(connectionChoices(at(13)).ing_7.includes('orange zest'));
});

test('prepared ingredients disambiguate unused garnish and compound-name modifiers', () => {
  const nuts=at(12), milk=at(14);
  assert.deepEqual(connectionChoices(nuts).ing_13,['']);
  assert.deepEqual(connectionChoices(nuts).step_6,['use']);
  assert.deepEqual(connectionChoices(milk).ing_14,['']);
  assert.deepEqual(connectionChoices(milk).step_2,['use']);
});

test('cake branches stay independent through bowl preparations, pronouns, unmolding and brushing', () => {
  for(const [index,id] of [[2,'step_2'],[3,'step_2'],[6,'step_6'],[9,'step_9'],[20,'step_20'],[22,'step_22']]) {
    const request=at(index);
    assert.deepEqual(connectionChoices(request)[id],['']);
    assert.throws(()=>acceptConnection({...choose(request,expected[index]),[id]:'use'},request),/unsupported selection/);
  }
  for(const [index,ids] of [[10,['step_9','step_10']],[22,['step_20']],[23,['step_22','step_23']]]) {
    for(const id of ids) assert.deepEqual(connectionChoices(at(index))[id],['use']);
  }
});

test('complete cake decisions validate and fill the table without modifying ingredient quantities or action text', () => {
  const rows=[];
  for(const row of expected) {
    const request=buildConnectionRequest(inventory,actions,rows);
    rows.push(acceptConnection(choose(request,row),request));
  }
  const recipe=assembleRecipe(inventory,actions,{inputs:rows});
  assert.equal(recipe.ingredients.length,17);assert.equal(recipe.steps.length,27);
  assert.deepEqual(recipe.ingredients.map(n=>n.text).sort(),fixture.ingredients.ingredients.slice().sort());
  assert.deepEqual(recipe.steps.map(n=>n.action),actions.steps.map(n=>n.action));
  const layout=layoutRecipe(recipe), grid=layout.rows.map(()=>Array(layout.totalCols).fill(0));
  layout.rows.forEach((cells,row)=>cells.forEach(cell=>{
    for(let r=row;r<row+cell.rowSpan;r++)for(let c=cell.startCol;c<cell.startCol+cell.colSpan;c++)grid[r][c]++;
  }));
  assert.ok(grid.flat().every(n=>n===1));
});

test('schema-guided replay of the reported cake responses completes the expected 27-action graph', async () => {
  let calls=0,destroyed=0;
  const events=[];
  const api={async create(){return {promptStreaming(prompt,options){
    const index=calls++;
    let value=index===0?fixture.ingredients:selection;
    if(index>=2)value=Object.fromEntries(Object.entries(options.responseConstraint.properties).map(([id,field])=>{
      // The latest trace selected both portions at blanching, twice.
      const raw=index===4 && id==='ing_13' ? 'pistachios' : recorded[index-2][id]||'';
      return [id,field.enum.includes(raw)?raw:field.enum[0]];
    }));
    const text=JSON.stringify(value);
    return new ReadableStream({start(controller){for(let i=0;i<text.length;i+=11)controller.enqueue(text.slice(i,i+11));controller.close();}});
  },destroy(){destroyed++;}};}};
  const recipe=await convertRecipe(fixture.source,{api,onDiagnostic:e=>events.push(e)});
  assert.equal(calls,29);assert.equal(destroyed,29);
  assert.equal(events.filter(e=>e.type==='correction').length,0);
  recipe.steps.forEach((step,i)=>assert.deepEqual([...step.input_ids].sort(),[...expected[i]].sort(),`action ${i+1}`));
});


test('blanching selects the cake pistachios and excludes the separately listed garnish portion', () => {
  const request = at(2);
  assert.equal(request.ingredient_section, inventory.sections.ing_6.id);
  assert.deepEqual(connectionChoices(request).ing_6, ['pistachios']);
  assert.deepEqual(connectionChoices(request).ing_13, ['']);
  assert.deepEqual(connectionChoices(request).step_2, ['']);
  const duplicate = {...choose(request, expected[2]), ing_13:'pistachios'};
  assert.throws(() => acceptConnection(duplicate, request), /unsupported selection/);
  assert.ok(!connectionChoices(at(24)).ing_13.includes(''));
});

test('preparation role remains unresolved without a supported later prepared use', () => {
  for (const change of ['Fold in the pistachios.', 'Fold in the chopped pistachios.', 'Optionally add cardamom and chopped pistachios.']) {
    const steps = actions.steps.slice(0, 3).concat({id:'step_4', action:change});
    const request = buildConnectionRequest(inventory, {steps}, expected.slice(0,2));
    assert.ok(connectionChoices(request).ing_6.includes(''));
    assert.ok(connectionChoices(request).ing_13.includes(''));
  }
});

test('an explicit garnish preparation takes precedence over later cake context', () => {
  const steps = actions.steps.map((s,i)=>i===2?{...s, action:'For garnish, blanch the pistachios.'}:s);
  const request = buildConnectionRequest(inventory, {steps}, expected.slice(0,2));
  assert.equal(request.ingredient_section, inventory.sections.ing_13.id);
  assert.deepEqual(connectionChoices(request).ing_6, ['']);
  assert.deepEqual(connectionChoices(request).ing_13, ['pistachios']);
});

// These regressions isolate extraction/linking; presentation is tested separately.
function convertRecipe(source, options) { return convertWithLabels(source, { ...options, simplifyProcedures: false }); }
