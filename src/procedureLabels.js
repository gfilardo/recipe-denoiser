import { ingredientEvidence } from './ingredientEvidence.js';

// Bounded wording changes, not free-form rewriting. Details outside these
// explicitly redundant phrases survive verbatim, including all numbers.
export function compactProcedure(step, recipe) {
  let text = step.action.trim();
  const title = (recipe.title || '').replace(/^how to (?:prepare|make)\s+/iu, '').trim();
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (title) text = text.replace(new RegExp(`^To (?:prepare|make) (?:the )?${escapedTitle},\\s*(?:first\\s+)?`, 'iu'), '');
  text = text.replace(/^(?:Then|At this point|Also),?\s+/iu, '')
    .replace(/\b(?:start|begin) (mixing|beating|whisking|stirring)\b/giu, (_, verb) => ({mixing:'mix',beating:'beat',whisking:'whisk',stirring:'stir'}[verb.toLowerCase()]))
    .replace(/\buntil you (?:obtain|get)\s+/giu, 'until ')
    .replace(/\bin order to\b/giu, 'to');
  // Only omit a complete bare ingredient list when ALL immediate inputs are
  // ingredients and each is explicitly named. Modifiers/amounts/equipment or
  // prepared-result inputs prevent this reduction.
  const inputs = step.input_ids.map(id => recipe.ingredients.find(n => n.id === id));
  const bare = text.match(/^(mix|combine|add)\s+(.+?)[.!]?$/iu);
  if (bare && inputs.length && inputs.every(Boolean)) {
    const names = bare[2].split(/\s*,\s*(?:and\s+)?|\s+and\s+/iu);
    if (names.length === inputs.length && names.every(name =>
      inputs.filter(n => ingredientEvidence(n.text, name).some(e => e.toLowerCase() === name.toLowerCase())).length === 1) &&
      inputs.every(n => names.some(name => ingredientEvidence(n.text,name).some(e=>e.toLowerCase()===name.toLowerCase())))) text = bare[1] + '.';
  }
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return text.length < step.action.length ? text : step.action;
}

export function procedureBatches(recipe) {
  const entries = recipe.steps.map(step => ({id:step.id, original:step.action, compact:compactProcedure(step,recipe),
    inputs:step.input_ids.map(id => recipe.ingredients.find(n=>n.id===id)?.text || recipe.steps.find(n=>n.id===id)?.action)}))
    .filter(row => row.compact !== row.original);
  const batches=[];
  for(let i=0;i<entries.length;i+=8) batches.push(entries.slice(i,i+8));
  return batches;
}
export function labelChoices(batch) { return Object.fromEntries(batch.map(row=>[row.id,['keep','compact']])); }
export function labelSchema(batch) {
  return {type:'object',properties:Object.fromEntries(batch.map(row=>[row.id,{type:'string',enum:['keep','compact']}])),required:batch.map(row=>row.id),additionalProperties:false};
}
export function acceptLabels(data,batch) {
  if(!data || Array.isArray(data) || typeof data!=='object' || Object.keys(data).length!==batch.length ||
    batch.some(row=>!Object.hasOwn(data,row.id) || !['keep','compact'].includes(data[row.id]))) throw Error('Invalid procedure label selections.');
  return Object.fromEntries(batch.filter(row=>data[row.id]==='compact').map(row=>[row.id,row.compact]));
}
