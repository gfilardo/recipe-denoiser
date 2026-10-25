import {assertNumericFidelity} from './numericFidelity.js';
import { validateShape, validateRecipe } from './validateRecipe.js';
const string = { type:'string' };
const object = properties => ({type:'object', properties, required:Object.keys(properties), additionalProperties:false});
export const INGREDIENT_SCHEMA = object({title:string,ingredients:{type:'array',items:object({text:string,role:string})}});
export const ACTION_SCHEMA = object({setup:{type:'array',items:object({text:string,source:string})},preparations:{type:'array',items:object({ingredient_id:string,text:string,source:string})},actions:{type:'array',items:object({action:string,source:string})}});
// Runtime planning does not ask the model to guess which operations fit a
// one-ingredient preparation cell before their dependencies are known.
export const OPERATION_SCHEMA = object({setup:ACTION_SCHEMA.properties.setup, actions:ACTION_SCHEMA.properties.actions});
export function acceptOperationPlan(data, source, inventory) {
  // Accept empty legacy preparations for callers replaying older empty plans.
  const {preparations = [], ...plan} = data;
  if (!Array.isArray(preparations) || preparations.length) throw Error('Put every food preparation into actions, with its own source excerpt. Do not attach operations to an ingredient.');
  validateShape(plan, OPERATION_SCHEMA);
  return acceptActions({...plan, preparations:[]}, source, inventory);
}
export function connectionSchema(inventory, actions) {
  const ids = [...inventory.ingredients, ...actions.steps].map(n => n.id);
  // Keep browser grammar constraints simple. Enforce row bounds and uniqueness
  // in the streaming guard and final validator, not in Chrome's schema compiler.
  return { type: 'object', properties: { inputs: { type: 'array', items: { type: 'array', items: { type: 'string', enum: ids } } } }, required: ['inputs'], additionalProperties: false };
}
const normalize = text => text.replace(/\s+/gu, ' ').trim();
function quote(text, source, label) {
  const value = normalize(text), original = normalize(source);
  if (!value) throw new Error(`${label}: empty source phrase.`);
  // Ignore layout whitespace only. Never repair or normalize numbers/units.
  let index = original.indexOf(value);
  while (index !== -1) {
    const before = original[index - 1] || '', after = original[index + value.length] || '';
    if (!(/\d/.test(before) && /^\d/.test(value)) && !(/\d$/.test(value) && /\d/.test(after))) return text.trim();
    index = original.indexOf(value, index + 1);
  }
  throw new Error(`${label}: wording or numbers do not match the source. Copy the source phrase verbatim.`);
}
export function acceptIngredients(data, source) {
  validateShape(data, INGREDIENT_SCHEMA);
  if (!data.ingredients.length || data.ingredients.length > 150) throw Error('Extract 1–150 ingredient uses.');
  const context = {};
  const ingredients = data.ingredients.map((entry,i)=>{
    const id=`ing_${i+1}`;
    if(!entry.text.trim()) throw Error(`${id}: ingredient text is empty.`);
    context[id]={source:quote(entry.text,source,`${id} ingredient`),role:entry.role.trim()};
    return {id,text:entry.text.trim(),prep:''};
  });
  return {title:data.title.trim() || 'Recipe',ingredients,context};
}
export function acceptActions(data, source, inventory = {ingredients:[]}) {
  validateShape(data, ACTION_SCHEMA);
  if(!data.actions.length || data.actions.length>100) throw Error('Extract 1–100 cooking actions.');
  if(data.setup.length>50 || data.preparations.length>inventory.ingredients.length) throw Error('Too many setup or preparation entries.');
  const known=new Set(inventory.ingredients.map(n=>n.id)), preparations={}, setupSources=[];
  const setup=data.setup.map((entry,i)=>{
    if(!entry.text.trim()) throw Error('Empty setup instruction.');
    setupSources.push(quote(entry.source,source,`setup ${i+1} source`));
    assertNumericFidelity(entry.text, entry.source);
    return entry.text.trim();
  });
  for(const entry of data.preparations) {
    if(!known.has(entry.ingredient_id)) throw Error(`Unknown preparation ingredient: ${entry.ingredient_id}`);
    if(Object.hasOwn(preparations,entry.ingredient_id)) throw Error(`Duplicate preparation ingredient: ${entry.ingredient_id}`);
    if(!entry.text.trim()) throw Error('Empty preparation instruction.');
    assertNumericFidelity(entry.text, entry.source);
    preparations[entry.ingredient_id]={text:entry.text.trim(),source:quote(entry.source,source,'preparation source')};
  }
  const context={};
  const steps=data.actions.map((entry,i)=>{
    const id=`step_${i+1}`;
    if(!entry.action.trim()) throw Error(`${id}: action text is empty.`);
    context[id]={source:quote(entry.source,source,`${id} source`)};
    assertNumericFidelity(entry.action, entry.source);
    return {id,action:entry.action.trim()};
  });
  return {setup,steps,context,preparations,setupSources};
}
export function applyPreparations(inventory, actions) {
  return {...inventory,ingredients:inventory.ingredients.map(n=>({...n,prep:actions.preparations?.[n.id]?.text || n.prep}))};
}
export function assembleRecipe(inventory, actions, data) {
  validateShape(data, connectionSchema(inventory, actions));
  if (data.inputs.length !== actions.steps.length) throw new Error(`Expected ${actions.steps.length} connection rows, one for each fixed action; received ${data.inputs.length}.`);
  const checkRow = connectionRowValidator(inventory, actions);
  const used = new Set();
  const steps = actions.steps.map((step, i) => {
    checkRow(data.inputs[i]);
    data.inputs[i].forEach(id => used.add(id));
    return { ...step, input_ids: [...data.inputs[i]] };
  });
  const nodes = new Map([...inventory.ingredients, ...steps].map(n => [n.id, n]));
  const ingredients = [];
  function walk(id) {
    const node = nodes.get(id);
    if (node.input_ids) node.input_ids.forEach(walk); else ingredients.push({ ...node });
  }
  // Earlier-step-only references and single consumption guarantee an acyclic walk.
  walk(steps.at(-1).id);
  if (ingredients.length !== inventory.ingredients.length || used.size !== nodes.size - 1) throw new Error('Connections leave ingredients or actions disconnected from the final step.');
  const recipe = { title: inventory.title, setup: [...actions.setup, ...(inventory.notes || [])], ingredients, steps };
  validateRecipe(recipe);
  return recipe;
}

// Shared by streamed rows and final assembly; neither path silently repairs edges.
export function connectionRowValidator(inventory, actions) {
  const available = new Set(inventory.ingredients.map(n => n.id)), used = new Set();
  let index = 0;
  return row => {
    const step = actions.steps[index];
    if (!step) throw new Error(`Expected ${actions.steps.length} connection rows, one for each fixed action; received an extra row.`);
    if (!Array.isArray(row) || !row.length) throw new Error(`${step.id}: needs at least one input.`);
    for (const id of row) {
      if (!available.has(id)) throw new Error(`${step.id}: unknown or forward input ${id}. Use only fixed ingredients and earlier steps.`);
      if (used.has(id)) throw new Error(`${id}: used more than once. Shared dependencies are unsupported; do not duplicate quantities.`);
      used.add(id);
    }
    available.add(step.id);
    index++;
  };
}
