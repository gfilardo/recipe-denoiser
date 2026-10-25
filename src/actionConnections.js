import { ConnectionOutputError } from './connectionGuard.js';
import { validateShape } from './validateRecipe.js';
import { connectionRowValidator, assembleRecipe } from './recipeExtraction.js';

// Code tracks identity and consumption only. Every live input is offered;
// the model, not a vocabulary matcher, decides what the action uses.
export function buildConnectionRequest(inventory, actions, acceptedRows) {
  const index = acceptedRows.length;
  if (index >= actions.steps.length) throw Error('No action remains to connect.');
  const available = new Map(inventory.ingredients.map(n => [n.id, {
    ...n, kind:'ingredient', context:inventory.context?.[n.id] || null
  }]));
  const check = connectionRowValidator(inventory, actions);
  acceptedRows.forEach((row,i) => {
    check(row);
    const contains = row.flatMap(id => {
      const input = available.get(id);
      return input.kind === 'ingredient' ? [{id:input.id,text:input.text,prep:input.prep,context:input.context}] : input.contains;
    });
    row.forEach(id=>available.delete(id));
    const step=actions.steps[i];
    available.set(step.id,{id:step.id,kind:'result',text:step.action,contains});
  });
  return {current_action:actions.steps[index],action_number:index+1,action_count:actions.steps.length,
    source_excerpt:actions.context?.[actions.steps[index].id]?.source || null,
    accepted_connections:acceptedRows.map((row,i)=>({...actions.steps[i],input_ids:[...row]})),
    action_plan:actions.steps.map(step=>({...step,source:actions.context?.[step.id]?.source || null})), available_inputs:[...available.values()]};
}
export function actionConnectionSchema(request) {
  return {type:'object',properties:{input_ids:{type:'array',items:{type:'string',enum:request.available_inputs.map(n=>n.id)}}},required:['input_ids'],additionalProperties:false};
}
// Bound a selected-ID list without interpreting ingredient/action wording.
export function createSelectionGuard(request, key = 'input_ids') {
  const known=new Set(request.available_inputs.map(n=>n.id));
  const budget=128+request.available_inputs.reduce((sum,n)=>sum+n.id.length*6+8,0);
  let text='';
  return chunk=>{
    text+=chunk;
    if(text.replace(/\s/gu,'').length>budget) throw new ConnectionOutputError('Connection selection exceeded its content budget.');
    let tokens;
    try { tokens=[...text.matchAll(/"(?:[^"\\]|\\.)*"/gu)].map(m=>JSON.parse(m[0])); }
    catch { throw new ConnectionOutputError('Invalid JSON string in connection selection.'); }
    if(tokens.length && tokens[0]!==key) throw new ConnectionOutputError(`Unknown connection choice: ${tokens[0]}. Return ${key}.`);
    const seen=new Set();
    for(const id of tokens.slice(1)) {
      if(!known.has(id)) throw new ConnectionOutputError(`Unknown connection choice: ${id}. Select an available input.`);
      if(seen.has(id)) throw new ConnectionOutputError(`Duplicate connection input: ${id}. Select each input once.`);
      seen.add(id);
    }
  };
}
export function acceptConnection(data,request) {
  validateShape(data,actionConnectionSchema(request));
  const inputs=[...data.input_ids],known=new Set(request.available_inputs.map(n=>n.id));
  if(new Set(inputs).size!==inputs.length) throw Error('Duplicate connection inputs.');
  if(inputs.some(id=>!known.has(id))) throw Error('Unknown connection choice.');
  if(!inputs.length) throw Error(`${request.current_action.id}: select at least one input.`);
  if(request.action_number===request.action_count && inputs.length!==request.available_inputs.length) {
    const remaining=request.available_inputs.filter(n=>!inputs.includes(n.id)).map(n=>n.id);
    throw Error(`The final action leaves unconnected inputs: ${remaining.join(', ')}. Review the interpretation; do not attach unrelated ingredients just to satisfy validation.`);
  }
  // Preserve the model-selected order; no semantic or mixture-first reordering.
  return inputs;
}

// Drafts do not consume inputs. Later model review may revise any earlier edge.
export function buildDraftConnectionRequest(inventory, actions, rows) {
  const index=rows.length;
  return {
    current_action:actions.steps[index], action_number:index+1, action_count:actions.steps.length,
    source_excerpt:actions.context?.[actions.steps[index].id]?.source || null,
    action_plan:actions.steps.map(step=>({...step,source:actions.context?.[step.id]?.source || null})),
    provisional_connections:rows.map((input_ids,i)=>({...actions.steps[i],input_ids:[...input_ids]})),
    available_inputs:[
      ...inventory.ingredients.map(n=>({...n,kind:'ingredient',context:inventory.context?.[n.id] || null})),
      ...actions.steps.slice(0,index).map((n,i)=>({id:n.id,kind:'result',text:n.action,provisional_input_ids:[...rows[i]]}))
    ]
  };
}
export function acceptDraftConnection(data,request) {
  validateShape(data,actionConnectionSchema(request));
  if(new Set(data.input_ids).size!==data.input_ids.length) throw Error('Duplicate connection inputs.');
  // Empty or conflicting rows remain visible for whole-graph model review.
  return [...data.input_ids];
}
// A single-consumer tree can be expressed as one destination per nonfinal node.
// The model chooses destinations; regrouping them does not infer any edges.
export function graphSelectionSchema(inventory,actions) {
  const destinations=actions.steps.map(n=>n.id);
  const properties=Object.fromEntries([
    ...inventory.ingredients.map(n=>[n.id,{type:'string',enum:destinations}]),
    ...actions.steps.slice(0,-1).map((n,i)=>[n.id,{type:'string',enum:destinations.slice(i+1)}])
  ]);
  return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};
}
export function acceptGraphSelection(data,inventory,actions) {
  validateShape(data,graphSelectionSchema(inventory,actions));
  const inputs=actions.steps.map(step=>Object.entries(data).filter(([,destination])=>destination===step.id).map(([id])=>id));
  const empty=actions.steps.filter((step,i)=>!inputs[i].length).map(step=>step.id);
  if(empty.length) throw Error(`${empty.join(', ')}: needs at least one input. Reconsider all destinations from the source; do not attach unrelated materials.`);
  return assembleRecipe(inventory,actions,{inputs});
}
export function createGraphSelectionGuard(inventory,actions) {
  const keys=new Set([...inventory.ingredients,...actions.steps.slice(0,-1)].map(n=>n.id));
  const destinations=new Set(actions.steps.map(n=>n.id));
  const longest=Math.max(...[...destinations].map(id=>id.length));
  const budget=128+[...keys].reduce((sum,id)=>sum+(id.length+longest)*6+8,0);
  let text='';
  return chunk=>{
    text+=chunk;
    if(text.replace(/\s/gu,'').length>budget) throw new ConnectionOutputError('Graph selection exceeded its content budget.');
    const seen=new Set();
    for(const match of text.matchAll(/"(?:[^"\\]|\\.)*"\s*([:,}])/gu)) {
      let id;
      try { id=JSON.parse(match[0].slice(0,match[0].lastIndexOf(match[1])).trim()); }
      catch { throw new ConnectionOutputError('Invalid JSON string in graph selection.'); }
      if(match[1]===':') {
        if(!keys.has(id)) throw new ConnectionOutputError(`Unknown graph input: ${id}.`);
        if(seen.has(id)) throw new ConnectionOutputError(`Duplicate graph input: ${id}.`);
        seen.add(id);
      } else if(!destinations.has(id)) throw new ConnectionOutputError(`Unknown graph destination: ${id}.`);
    }
  };
}
