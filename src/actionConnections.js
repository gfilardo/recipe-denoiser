import { ingredientEvidence } from './ingredientEvidence.js';
import { actionSection } from './ingredientUses.js';
import { validateShape } from './validateRecipe.js';
import { connectionRowValidator } from './recipeExtraction.js';

// Rebuild live inputs from accepted rows only. Rejected attempts cannot consume
// ingredients or alter previously accepted connections.
export function buildConnectionRequest(inventory, actions, acceptedRows) {
  const index = acceptedRows.length;
  if (index >= actions.steps.length) throw new Error('No action remains to connect.');
  const available = new Map(inventory.ingredients.map(n => [n.id, {
    id: n.id, kind: 'ingredient', text: n.text,
    ...(inventory.sections?.[n.id] ? { section: inventory.sections[n.id] } : {}),
    ...(inventory.uses?.[n.id] ? { portion: inventory.uses[n.id] } : {})
  }]));
  const checkRow = connectionRowValidator(inventory, actions);
  acceptedRows.forEach((row, i) => {
    checkRow(row);
    const contains = row.flatMap(id => {
      const input = available.get(id);
      return input.kind === 'ingredient' ? [input.text] : input.contains;
    });
    const sections = [...new Set(row.flatMap(id => {
      const input = available.get(id);
      return input.section ? [input.section.id] : input.sections || [];
    }))];
    row.forEach(id => available.delete(id));
    const step = actions.steps[i];
    available.set(step.id, { id: step.id, kind: 'result', text: step.action, contains,
      ...(sections.length ? { sections } : {}) });
  });
  const action = actions.steps[index];
  let role = actionSection(inventory, action.action);
  // A continuation of a single-role mixture supplies context for an otherwise
  // ambiguous "Then add the oil and salt". Independent work never inherits it.
  if (!role && /^(?:then\s+)?(?:add|stir|mix|pour)\b/iu.test(action.action.trim())) {
    const previous = available.get(actions.steps[index - 1]?.id);
    if (previous?.sections?.length === 1) role = previous.sections[0];
  }
  const candidates = [...available.values()].map(n => {
    if (n.kind !== 'ingredient') return n;
    const evidence = n.portion && n.portion.step_id !== action.id ? []
      : ingredientEvidence(n.portion?.original_text || n.text, action.action);
    return { ...n, evidence };
  });
  // Restrict ambiguous same-name entries only. An explicit unique ingredient
  // mention remains usable even when an action combines multiple recipe roles.
  if (role) for (const candidate of candidates) {
    if (candidate.kind !== 'ingredient' || !candidate.section || candidate.section.id === role) continue;
    candidate.evidence = candidate.evidence.filter(phrase => !candidates.some(other =>
      other.section?.id === role && other.evidence?.some(value => value.toLowerCase() === phrase.toLowerCase())));
  }
  return {
    current_action: { ...actions.steps[index] }, action_number: index + 1, action_count: actions.steps.length,
    previous_action: actions.steps[index - 1]?.action ?? null,
    next_action: actions.steps[index + 1]?.action ?? null,
    ...(role ? { ingredient_section: role } : {}),
    available_inputs: candidates
  };
}
export function connectionChoices(request) {
  return Object.fromEntries(request.available_inputs.map(n => [n.id, n.kind === 'ingredient' ? ['', ...n.evidence] : ['', 'use']]));
}
export function actionConnectionSchema(request) {
  // Fixed fields eliminate an appendable ID list. Keep the browser schema to
  // simple object/string/enum constraints; semantic checks remain local too.
  const choices = connectionChoices(request);
  return { type: 'object', properties: Object.fromEntries(Object.entries(choices).map(([id, values]) => [id, { type: 'string', enum: values }])), required: Object.keys(choices), additionalProperties: false };
}
export function acceptConnection(data, request) {
  validateShape(data, actionConnectionSchema(request));
  const choices = connectionChoices(request), inputs = [], evidenceUsed = new Map();
  for (const candidate of request.available_inputs) {
    const value = data[candidate.id];
    if (!choices[candidate.id].includes(value)) throw new Error(`${candidate.id}: unsupported selection evidence. Use an offered phrase from the current action, or an empty string to leave this input unused.`);
    if (!value) continue;
    if (candidate.kind === 'ingredient') {
      const key = value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ');
      if (evidenceUsed.has(key)) throw new Error(`${candidate.id} and ${evidenceUsed.get(key)} use the same ingredient mention. Do not allocate one mention to multiple listed portions; choose the portion actually used in this action.`);
      evidenceUsed.set(key, candidate.id);
    }
    inputs.push(candidate.id);
  }
  if (!inputs.length) throw new Error(`${request.current_action.id}: needs at least one supported input. No usable connection was selected.`);
  if (request.action_number === request.action_count && inputs.length !== request.available_inputs.length) {
    const remaining = request.available_inputs.filter(n => !inputs.includes(n.id)).map(n => n.id);
    throw new Error(`The final action leaves unconnected inputs: ${remaining.join(', ')}. Select only inputs actually used here; if earlier connections are wrong, do not attach unrelated leftovers just to complete the tree.`);
  }
  // Keep prior mixtures before newly added ingredients for stable tree layout.
  const kind = new Map(request.available_inputs.map(n => [n.id, n.kind]));
  return inputs.sort((a, b) => Number(kind.get(a) === 'ingredient') - Number(kind.get(b) === 'ingredient'));
}
