import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionRequest, actionConnectionSchema, acceptConnection, connectionChoices } from '../src/actionConnections.js';
import { assembleRecipe } from '../src/recipeExtraction.js';

const inventory = {
  title: 'Sheet-pan pizza',
  ingredients: [
    { id: 'ing_1', text: 'Type 0 flour 4.3 cups (550 g)', prep: '' },
    { id: 'ing_2', text: 'Water 1.8 cups (440 g)', prep: '' },
    { id: 'ing_3', text: 'Fine salt 1.7 tsp (10 g)', prep: '' },
    { id: 'ing_4', text: 'Tomato purée 1 ¼ cup (300 g)', prep: '' },
    { id: 'ing_5', text: 'Extra virgin olive oil 2 tbsp (25 g)', prep: '' },
    { id: 'ing_6', text: 'Basil to taste', prep: '' },
  ],
};
const actions = {
  setup: [],
  steps: [
    { id: 'step_1', action: 'Mix the flour, water and salt.' },
    { id: 'step_2', action: 'Cover and let the dough rest for 10 minutes.' },
    { id: 'step_3', action: 'Meanwhile mix the tomato purée and oil.' },
    { id: 'step_4', action: 'Spread the sauce over the dough and bake at 428°F for 30 minutes (220°C → 428°F).' },
    { id: 'step_5', action: 'Finish the pizza with basil.' },
  ],
};
const rows = [
  ['ing_1', 'ing_2', 'ing_3'],
  ['step_1'],
  ['ing_4', 'ing_5'],
  ['step_2', 'step_3'],
  ['step_4', 'ing_6'],
];
const choose = (request, selected) => Object.fromEntries(request.available_inputs.map(n => [n.id, selected.includes(n.id) ? n.kind === 'result' ? 'use' : n.evidence[0] || 'unsupported' : '']));
const requestAt = index => buildConnectionRequest(inventory, actions, rows.slice(0, index));
const ids = request => request.available_inputs.map(input => input.id).sort();
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test('first linking request provides source context and only the initial ingredients', () => {
  const request = requestAt(0);
  assert.deepEqual(request.current_action, actions.steps[0]);
  assert.equal(request.action_number, 1);
  assert.equal(request.action_count, actions.steps.length);
  assert.equal(request.previous_action, null);
  assert.equal(request.next_action, actions.steps[1].action);
  assert.deepEqual(ids(request), inventory.ingredients.map(input => input.id).sort());
  for (const input of request.available_inputs) {
    assert.equal(input.kind, 'ingredient');
    assert.equal(input.text, inventory.ingredients.find(ingredient => ingredient.id === input.id).text);
  }
});

test('consumed ingredients become a live result with their original quantities', () => {
  const request = requestAt(1);
  assert.deepEqual(ids(request), ['ing_4', 'ing_5', 'ing_6', 'step_1']);
  assert.equal(request.previous_action, actions.steps[0].action);
  assert.equal(request.next_action, actions.steps[2].action);
  const dough = request.available_inputs.find(input => input.id === 'step_1');
  assert.equal(dough.kind, 'result');
  assert.equal(dough.text, actions.steps[0].action);
  assert.deepEqual(dough.contains, inventory.ingredients.slice(0, 3).map(input => input.text));
});

test('independent live branches remain eligible until a later action joins them', () => {
  const request = requestAt(3);
  assert.deepEqual(ids(request), ['ing_6', 'step_2', 'step_3']);
  const dough = request.available_inputs.find(input => input.id === 'step_2');
  const sauce = request.available_inputs.find(input => input.id === 'step_3');
  assert.equal(dough.text, actions.steps[1].action);
  assert.equal(sauce.text, actions.steps[2].action);
  assert.deepEqual(dough.contains, inventory.ingredients.slice(0, 3).map(input => input.text));
  assert.deepEqual(sauce.contains, inventory.ingredients.slice(3, 5).map(input => input.text));
  assert.deepEqual(acceptConnection(choose(request, ['step_2', 'step_3']), request), rows[3]);
});

test('merged result retains exact original facts and only exposes its live branch', () => {
  const request = requestAt(4);
  assert.equal(request.action_number, 5);
  assert.equal(request.next_action, null);
  assert.deepEqual(ids(request), ['ing_6', 'step_4']);
  const pizza = request.available_inputs.find(input => input.id === 'step_4');
  assert.equal(pizza.text, actions.steps[3].action);
  assert.deepEqual(pizza.contains, inventory.ingredients.slice(0, 5).map(input => input.text));
});

test('one-action response schema fixes every candidate field with finite evidence choices', () => {
  const request = requestAt(3);
  assert.deepEqual(actionConnectionSchema(request), {type:'object', properties:{ing_6:{type:'string',enum:['']},step_2:{type:'string',enum:['use']},step_3:{type:'string',enum:['','use']}},required:['ing_6','step_2','step_3'],additionalProperties:false});
});

test('one-action linking rejects unknown, self, future and already consumed inputs', () => {
  const request = requestAt(3);
  for (const id of ['ing_999', 'step_4', 'step_5', 'step_1', 'ing_1', 'ing_4']) {
    assert.throws(() => acceptConnection({...choose(request,['step_2']),[id]:'use'}, request), undefined, id);
  }
});

test('one-action linking rejects empty, duplicate, malformed and expanded output', () => {
  const request = requestAt(3);
  for (const data of [
    { input_ids: [] },
    { input_ids: ['step_2', 'step_2'] },
    { input_ids: 'step_2' },
    { input_ids: [123] },
    { input_ids: [['step_2']] },
    { input_ids: ['step_2'], action: 'Bake at 42888°F.' },
    { inputs: [['step_2']] },
    {},
    [],
    null,
  ]) {
    assert.throws(() => acceptConnection(data, request));
  }
});

test('final action must select every live input without automatically adding missing ones', () => {
  const request = requestAt(4);
  assert.throws(() => acceptConnection(choose(request,['step_4']), request), /final action|unconnected|remaining|unsupported selection/i);
  assert.throws(() => acceptConnection(choose(request,['ing_6']), request), /final action|unconnected|remaining/i);
  assert.deepEqual(acceptConnection(choose(request,['step_4','ing_6']), request), rows[4]);
});

test('failed corrections leave the accepted state and candidates unchanged', () => {
  const acceptedRows = structuredClone(rows.slice(0, 3));
  const inputs = freeze(structuredClone({ inventory, actions, acceptedRows }));
  const request = freeze(buildConnectionRequest(inputs.inventory, inputs.actions, inputs.acceptedRows));
  const before = structuredClone(request);
  assert.throws(() => acceptConnection({ input_ids: ['step_2', 'step_2'] }, request));
  assert.deepEqual(request, before);
  const data = freeze(choose(request,['step_2','step_3']));
  const accepted = acceptConnection(data, request);
  assert.deepEqual(accepted, ['step_2','step_3']);
  accepted.push('ing_6');
  assert.deepEqual(data, choose(request,['step_2','step_3']));
  assert.deepEqual(request, before);
  assert.deepEqual(inputs.acceptedRows, acceptedRows);
  assert.deepEqual(buildConnectionRequest(inputs.inventory, inputs.actions, inputs.acceptedRows), request);
});

test('sequential validated decisions assemble a connected recipe with source facts intact', () => {
  const acceptedRows = [];
  for (const row of rows) {
    const request = buildConnectionRequest(inventory, actions, acceptedRows);
    acceptedRows.push(acceptConnection(choose(request,row), request));
  }
  const recipe = assembleRecipe(inventory, actions, { inputs: acceptedRows });
  assert.deepEqual(recipe.steps.map(step => ({ id: step.id, action: step.action })), actions.steps);
  assert.deepEqual(recipe.steps.map(step => step.input_ids), rows);
  assert.deepEqual(recipe.ingredients, inventory.ingredients);
  assert.deepEqual(acceptedRows, rows);
});

test('first pizza action cannot consume topping or garnish through valid but unrelated IDs', () => {
  const texts=['Type 0 flour 4.3 cups (550 g)','Water 1.8 cups (440 g)','Extra virgin olive oil 2 tbsp (30 g)',"Fresh brewer's yeast 0.4 oz (10 g)",'Fine salt 1.7 tsp (10 g)','Tomato purée 1 ¼ cup (300 g)','Extra virgin olive oil 2 tbsp (25 g)','Oregano to taste','Fine salt to taste','Fior di latte mozzarella cheese 9 oz (250 g)','Basil to taste','Black pepper to taste','Extra virgin olive oil to taste'];
  const inv={title:'Pizza',ingredients:texts.map((text,i)=>({id:`ing_${i+1}`,text,prep:''}))};
  const steps={setup:[],steps:[{id:'step_1',action:'Start by working the flour and yeast 1 in a bowl together with the water 2 and mix with a spoon or spatula 3.'},{id:'step_2',action:'Then add the oil and salt.'}]};
  const request=buildConnectionRequest(inv,steps,[]), choices=connectionChoices(request);
  assert.deepEqual(Object.entries(choices).filter(([,values])=>values.some(Boolean)).map(([id])=>id),['ing_1','ing_2','ing_4']);
  assert.deepEqual(acceptConnection(choose(request,['ing_1','ing_2','ing_4']),request),['ing_1','ing_2','ing_4']);
  for(const evidence of ['water','mix',steps.steps[0].action]) assert.throws(()=>acceptConnection({...choose(request,['ing_1','ing_2','ing_4']),ing_11:evidence},request),/unsupported selection evidence/);
  assert.throws(()=>acceptConnection({...choose(request,['ing_1','ing_2','ing_4']),ing_3:'oil'},request),/unsupported selection evidence/);
  const before=structuredClone(request);
  assert.throws(()=>acceptConnection(Object.fromEntries(texts.map((_,i)=>[`ing_${i+1}`,'use'])),request),/unsupported selection evidence/);
  assert.deepEqual(request,before);
});
test('one ingredient mention cannot silently allocate two separately listed portions', () => {
  const inv={ingredients:[{id:'ing_1',text:'Olive oil 30 g'},{id:'ing_2',text:'Olive oil 25 g'}]};
  const request=buildConnectionRequest(inv,{steps:[{id:'step_1',action:'Add oil.'},{id:'step_2',action:'Use remaining oil.'}]},[]);
  assert.throws(()=>acceptConnection({ing_1:'oil',ing_2:'oil'},request),/same ingredient mention/);
  assert.deepEqual(acceptConnection({ing_1:'oil',ing_2:''},request),['ing_1']);
});
