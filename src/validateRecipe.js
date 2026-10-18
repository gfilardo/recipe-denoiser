import { RECIPE_DAG_SCHEMA } from './recipeSchema.js';
function shape(value, schema, path = 'recipe') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${path}: expected an object.`);
    for (const key of schema.required) if (!Object.hasOwn(value, key)) throw Error(`${path}.${key}: required.`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw Error(`${path}.${key}: unexpected field.`);
      shape(value[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw Error(`${path}: expected an array.`);
    value.forEach((v, i) => shape(v, schema.items, `${path}[${i}]`));
  } else if (typeof value !== schema.type || value.length > 20000) throw Error(`${path}: expected a string of at most 20,000 characters.`);
}
export function validateRecipe(recipe) {
  shape(recipe, RECIPE_DAG_SCHEMA);
  if (!recipe.title.trim()) throw Error('Recipe title is empty.');
  if (!recipe.ingredients.length || !recipe.steps.length) throw Error('Include at least one ingredient and step.');
  if (recipe.ingredients.length > 150 || recipe.steps.length > 100 || recipe.setup.length > 50) throw Error('Limit: 150 ingredients, 100 steps, 50 setup actions.');
  const nodes = new Map(), consumers = new Map();
  for (const n of [...recipe.ingredients, ...recipe.steps]) {
    if (!n.id.trim() || nodes.has(n.id)) throw Error(`Duplicate or empty ID: ${n.id}`);
    if (!(n.text ?? n.action).trim()) throw Error(`${n.id}: text/action is empty.`);
    nodes.set(n.id, n); consumers.set(n.id, 0);
  }
  for (const step of recipe.steps) {
    if (!step.input_ids.length) throw Error(`${step.id}: needs at least one input.`);
    if (new Set(step.input_ids).size !== step.input_ids.length) throw Error(`${step.id}: repeated input.`);
    for (const id of step.input_ids) {
      if (!nodes.has(id)) throw Error(`${step.id}: missing input ${id}.`);
      consumers.set(id, consumers.get(id) + 1);
    }
  }
  const visiting = new Set(), visited = new Set();
  function check(id, depth = 0) {
    if (depth > 80) throw Error('Recipe exceeds 80 dependency levels.');
    if (visiting.has(id)) throw Error(`Cycle at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id); for (const child of nodes.get(id).input_ids ?? []) check(child, depth + 1);
    visiting.delete(id); visited.add(id);
  }
  for (const id of nodes.keys()) check(id);
  for (const [id, count] of consumers) if (count > 1) throw Error(`${id}: shared dependencies are unsupported. Split quantities into separate ingredients.`);
  const roots = recipe.steps.filter(n => consumers.get(n.id) === 0);
  if (roots.length !== 1) throw Error('Recipe must have exactly one terminal step.');
  const root = roots[0];
  if (root !== recipe.steps.at(-1)) throw Error('The terminal step must be last in steps.');
  const reachable = new Set(), leaves = [];
  function walk(id) {
    reachable.add(id); const n = nodes.get(id);
    if (n.input_ids) n.input_ids.forEach(walk); else leaves.push(id);
  }
  walk(root.id);
  if (reachable.size !== nodes.size) throw Error('Some ingredients or steps are disconnected from the final step.');
  if (leaves.some((id, i) => id !== recipe.ingredients[i].id)) throw Error('Ingredient order must match the dependency tree input order. Reorder ingredients or input_ids.');
  return { nodes, root };
}
