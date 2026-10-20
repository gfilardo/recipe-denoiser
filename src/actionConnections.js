import { ingredientEvidence } from './ingredientEvidence.js';
import { actionSection } from './ingredientUses.js';
import { validateShape } from './validateRecipe.js';
import { connectionRowValidator } from './recipeExtraction.js';
import { constrainConnections, resultReferents, mentionUse } from './connectionSemantics.js';

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
    const referents = [...new Set([...row.flatMap(id => available.get(id).referents || []), ...resultReferents(actions.steps[i].action)])];
    row.forEach(id => available.delete(id));
    const step = actions.steps[i];
    available.set(step.id, { id: step.id, kind: 'result', text: step.action, contains,
      ...(sections.length ? { sections } : {}), referents });
  });
  const action = actions.steps[index];
  let role = actionSection(inventory, action.action) || preparedIngredientRole(inventory, actions.steps, index);
  // A continuation of a single-role mixture supplies context for an otherwise
  // ambiguous "Then add the oil and salt". Independent work never inherits it.
  if (!role && /^(?:then\s+)?(?:add|stir|mix|pour)\b/iu.test(action.action.trim())) {
    const previous = available.get(actions.steps[index - 1]?.id);
    if (previous?.sections?.length === 1) role = previous.sections[0];
  }
  const ingredients = [...available.values()].filter(n => n.kind === 'ingredient');
  // Incorporated ingredients still disambiguate roles: chopped cake nuts
  // must not turn into a fresh allocation of the unused garnish nuts.
  const roleIngredients = [...ingredients, ...[...available.values()].filter(n => n.kind === 'result' && role && n.sections?.includes(role))
    .flatMap(n => n.contains.map(text => ({text, section:{id:role}})))];
  const candidates = [...available.values()].map(n => n.kind === 'ingredient' ? candidateEvidence(n, action, role, roleIngredients) : n);
  preferSpecificMentions(candidates, action.action);
  constrainConnections(candidates, action.action, actions.steps[index - 1]?.id);
  return {
    current_action: { ...actions.steps[index] }, action_number: index + 1, action_count: actions.steps.length,
    previous_action: actions.steps[index - 1]?.action ?? null,
    next_action: actions.steps[index + 1]?.action ?? null,
    ...(role ? { ingredient_section: role } : {}),
    available_inputs: candidates
  };
}
// Resolve an independent preparation through its first later explicit use.
// A prepared adjective plus an intervening operation must connect the two;
// neither list order nor the previous mixture's role is enough.
function preparedIngredientRole(inventory, steps, index) {
  const action = steps[index].action;
  if (!/^\s*(?:meanwhile\s*,?\s*)?(?:blanch|chop|toast|roast)\b/iu.test(action)) return null;
  const roles = new Set();
  for (const ingredient of inventory.ingredients) {
    const phrases = ingredientEvidence(ingredient.text, action);
    for (const phrase of phrases) {
      if (mentionUse(action, phrase).kind !== 'use') continue;
      const peers = inventory.ingredients.filter(n => ingredientEvidence(n.text, phrase).length);
      const sections = new Set(peers.map(n => inventory.sections?.[n.id]?.id).filter(Boolean));
      if (sections.size < 2) continue;
      for (let later = index + 1; later < steps.length; later++) {
        const text = steps[later].action;
        const mentions = ingredientEvidence(ingredient.text, text);
        if (!mentions.length) continue;
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prepared = text.match(new RegExp(`\\b(chopped|blanched|toasted|roasted)\\s+${escaped}\\b`, 'iu'));
        const verbs = {chopped:'chop',blanched:'blanch',toasted:'toast',roasted:'roast'};
        const preparation = prepared && steps.slice(index, later).some(step =>
          (ingredientEvidence(ingredient.text, step.action).length || /\bthem\b/iu.test(step.action)) && new RegExp(`\\b${verbs[prepared?.[1]?.toLowerCase()]}\\b`, 'iu').test(step.action));
        const role = actionSection(inventory, text);
        if (prepared && preparation && mentionUse(text, phrase).kind === 'use' &&
            role && peers.filter(n => inventory.sections?.[n.id]?.id === role).length === 1) roles.add(role);
        else return null;
        break;
      }
    }
  }
  return roles.size === 1 ? [...roles][0] : null;
}
// "Almond milk" is evidence for milk, not also almond flour and garnish
// almonds. Suppress a shorter match only when EVERY occurrence is covered by
// a longer offered match as a modifier. A shared head noun ("oil" in
// "olive oil") can still name distinct portions and remains ambiguous.
function preferSpecificMentions(candidates, action) {
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const occurrences = phrase => [...action.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, 'giu'))]
    .map(m => [m.index, m.index + m[0].length]);
  const mentions = candidates.flatMap(n => (n.kind === 'ingredient' ? n.evidence : n.contains.flatMap(text => ingredientEvidence(text, action)))
    .map(phrase => ({ id: n.id, phrase, spans: occurrences(phrase) })));
  for (const candidate of candidates) {
    if (candidate.kind !== 'ingredient') continue;
    candidate.evidence = candidate.evidence.filter(phrase => {
      const spans = occurrences(phrase);
      return !spans.length || !spans.every(([start, end]) => mentions.some(other =>
        other.id !== candidate.id && other.phrase.length > phrase.length && other.spans.some(([left, right]) => left <= start && right > end)));
    });
  }
  // A distinct standalone occurrence plus a specific compound occurrence
  // resolves "flour ... almond flour". Without that standalone occurrence,
  // preserve ambiguity between separately listed oils/flours sharing a name.
  const removals = new Map();
  for (const candidate of candidates.filter(n => n.kind === 'ingredient')) {
    const compounds = candidate.evidence.filter(phrase => /\s/u.test(phrase));
    const remove = candidate.evidence.filter(short => compounds.some(long => long.length > short.length && long.toLowerCase().includes(short.toLowerCase())) &&
      candidates.some(other => other.kind === 'ingredient' && other !== candidate && other.evidence.includes(short) &&
        occurrences(short).some(([start,end]) => !compounds.some(long => occurrences(long).some(([left,right]) => left <= start && right >= end)))));
    removals.set(candidate.id, new Set(remove));
  }
  for (const candidate of candidates.filter(n => n.kind === 'ingredient')) candidate.evidence = candidate.evidence.filter(phrase => !removals.get(candidate.id).has(phrase));
}
// Restrict ambiguous same-name entries only. An explicit unique ingredient
// mention remains usable even when an action combines multiple recipe roles.
function candidateEvidence(ingredient, action, role, ingredients) {
  const evidenceFor = n => n.portion && n.portion.step_id !== action.id ? []
    : ingredientEvidence(n.portion?.original_text || n.text, action.action);
  let evidence = evidenceFor(ingredient);
  if (role && ingredient.section && ingredient.section.id !== role) {
    const roleMentions = new Set(ingredients.filter(other => other.section?.id === role).flatMap(evidenceFor).map(phrase => phrase.toLowerCase()));
    evidence = evidence.filter(phrase => !roleMentions.has(phrase.toLowerCase()));
  }
  return { ...ingredient, evidence };
}
const mentionKey = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ');
export function connectionChoices(request) {
  return Object.fromEntries(request.available_inputs.map(n => [n.id, n.kind === 'ingredient' ? [...(n.required ? [] : ['']), ...n.evidence] : n.allowed === false ? [''] : n.required ? ['use'] : ['', 'use']]));
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
    if (!choices[candidate.id].includes(value)) throw new Error(`${candidate.id}: unsupported selection evidence. ${candidate.required ? `Required here: ${candidate.reason}. Select an offered value.` : candidate.allowed === false ? `${candidate.reason}. Leave this result unused for its later action.` : 'Use an offered phrase from the current action, or an empty string to leave this input unused.'}`);
    if (!value) continue;
    if (candidate.kind === 'ingredient') {
      const key = mentionKey(value);
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
