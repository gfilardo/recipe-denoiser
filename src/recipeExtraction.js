import { validateShape, validateRecipe } from './validateRecipe.js';
const strings = { type: 'array', items: { type: 'string' } };
export const INGREDIENT_SCHEMA = { type: 'object', properties: { title: { type: 'string' }, ingredients: strings }, required: ['title', 'ingredients'], additionalProperties: false };
export function actionSchema(passages) {
  return { type: 'object', properties: { passage_ids: { type: 'array', items: { type: 'string', enum: passages.map(p => p.id) } } }, required: ['passage_ids'], additionalProperties: false };
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
  if (!data.ingredients.length || data.ingredients.length > 150) throw new Error('Extract 1–150 source ingredients.');
  return { title: data.title.trim() ? quote(data.title, source, 'Title') : 'Recipe', ingredients: data.ingredients.map((text, i) => ({ id: `ing_${i + 1}`, text: quote(text, source, `Ingredient ${i + 1}`), prep: '' })) };
}
export function acceptActions(data, passages) {
  validateShape(data, actionSchema(passages));
  if (!data.passage_ids.length || data.passage_ids.length > 100) throw new Error('Select 1–100 source passages for cooking actions.');
  const selected = new Set();
  const known = new Set(passages.map(p => p.id));
  for (const id of data.passage_ids) {
    if (!known.has(id)) throw new Error(`Unknown source passage: ${id}. Select only supplied passage IDs.`);
    if (selected.has(id)) throw new Error(`Duplicate source passage: ${id}. Select each passage only once.`);
    selected.add(id);
  }
  // Selection order cannot rewrite the source's sequence. No generated action text is accepted.
  const chosen = passages.filter(p => selected.has(p.id));
  return { setup: [], steps: chosen.map((p, i) => ({ id: `step_${i + 1}`, action: p.text })) };
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
