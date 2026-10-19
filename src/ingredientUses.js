import { ingredientSections } from './ingredientSections.js';
import { ingredientEvidence } from './ingredientEvidence.js';

const fold = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const key = text => fold(text).replace(/\s+/gu, ' ');

// Only explicit section labels or ingredient mentions unique to one section
// establish a role. Conflicting anchors leave the role unresolved.
export function actionSection(inventory, action) {
  const sections = inventory.sections || {};
  const named = new Set();
  for (const section of Object.values(sections)) {
    const label = fold(section.label).replace(/^for\s+(?:the\s+)?/u, '').trim();
    if (!label || /^(ingredients?|preparation|recipe)$/u.test(label)) continue;
    if (new RegExp(`\\b${escape(label)}\\b`, 'u').test(fold(action))) named.add(section.id);
  }
  const mentions = new Map();
  for (const ingredient of inventory.ingredients) {
    const section = sections[ingredient.id];
    if (!section) continue;
    for (const phrase of ingredientEvidence(inventory.uses?.[ingredient.id]?.original_text || ingredient.text, action)) {
      const id = key(phrase);
      if (!mentions.has(id)) mentions.set(id, new Set());
      mentions.get(id).add(section.id);
    }
  }
  const anchors = new Set([...mentions.values()].filter(ids => ids.size === 1).flatMap(ids => [...ids]));
  if (anchors.size) return anchors.size === 1 ? [...anchors][0] : null;
  return named.size === 1 ? [...named][0] : null;
}

// Recognize a deliberately small, source-grounded subset of divided portions.
// Qualifiers must immediately precede an actual ingredient mention. This does
// not turn every repeated mention of an ingredient into another quantity.
function portionPhrase(ingredient, action, later) {
  const qualifier = later
    ? '(?:a little more|some more|the remaining|remaining|the rest of|rest of)'
    : '(?:about half|half)';
  for (const evidence of ingredientEvidence(ingredient.text, action).sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`\\b${qualifier}\\s+(?:(?:of|the|that|same)\\s+)*${escape(evidence)}\\b`, 'iu');
    const match = action.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export function prepareIngredientUses(inventory, actions, source) {
  const sections = ingredientSections(source, inventory.ingredients);
  const original = { ...inventory, sections };
  const roles = [];
  let active = null;
  for (const step of actions.steps) {
    active = actionSection(original, step.action) || active;
    roles.push(active);
  }
  const ingredients = [], uses = {}, preparedSections = {}, notes = [];
  for (const ingredient of inventory.ingredients) {
    const section = sections[ingredient.id];
    const portions = [];
    for (let index = 0; index < actions.steps.length; index++) {
      const step = actions.steps[index];
      const phrase = portionPhrase(ingredient, step.action, portions.length > 0);
      if (!phrase) continue;
      // A same-name portion must be distinguished by its source section.
      // Without that evidence, preserve the original entry and let validation
      // expose ambiguity rather than inventing an allocation.
      const peers = inventory.ingredients.filter(other => ingredientEvidence(other.text, phrase).length);
      const eligible = peers.filter(other => sections[other.id]?.id === roles[index]);
      if (peers.length !== 1 && (eligible.length !== 1 || eligible[0].id !== ingredient.id)) continue;
      if (section && roles[index] && section.id !== roles[index]) continue;
      portions.push({ step_id: step.id, phrase });
    }
    // A lone "half" does not establish where the rest is used. A later
    // unqualified mention or third allocation also needs explicit interpretation.
    const scopedMentions = actions.steps.filter((step, index) =>
      (!section || !roles[index] || roles[index] === section.id) && ingredientEvidence(ingredient.text, step.action).length);
    if (portions.length === 2 && portions[0].step_id !== portions[1].step_id &&
      scopedMentions.every(step => portions.some(portion => portion.step_id === step.id))) {
      notes.push(`Shared ingredient total: ${ingredient.text}. The two use entries draw from this ONE listed amount; do not add their totals together.`);
      portions.forEach((portion, index) => {
        const id = `${ingredient.id}_use_${index + 1}`;
        ingredients.push({ id, text: `Use ${index + 1} of 2 — ${portion.phrase}. Shared total (not an extra amount): ${ingredient.text}`, prep: ingredient.prep });
        uses[id] = { ...portion, original_id: ingredient.id, original_text: ingredient.text };
        if (section) preparedSections[id] = section;
      });
    } else {
      ingredients.push({ ...ingredient });
      if (section) preparedSections[ingredient.id] = section;
    }
  }
  return { ...inventory, ingredients, sections: preparedSections, uses, notes };
}
