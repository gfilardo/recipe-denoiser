import {assertNumericFidelity} from './numericFidelity.js';
import {validateShape} from './validateRecipe.js';
export function procedureBatches(recipe) {
  const nodes=new Map([...recipe.ingredients,...recipe.steps].map(n=>[n.id,n]));
  const entries=recipe.steps.map(step=>({id:step.id,original:step.action,
    inputs:step.input_ids.map(id=>({id,text:nodes.get(id).text || nodes.get(id).action}))}));
  const batches=[];
  for(let i=0;i<entries.length;i+=4) batches.push(entries.slice(i,i+4));
  return batches;
}
export function labelSchema(batch) {
  return {type:'object',properties:Object.fromEntries(batch.map(n=>[n.id,{type:'string'}])),required:batch.map(n=>n.id),additionalProperties:false};
}
export function acceptLabels(data,batch) {
  validateShape(data,labelSchema(batch));
  const labels={};
  for(const row of batch) {
    const text=data[row.id].trim();
    // These are presentation checks, not a claim of semantic fidelity.
    if(text && text.length<row.original.length) {
      assertNumericFidelity(text,row.original,{exact:true});
      labels[row.id]=text;
    }
  }
  return labels;
}
