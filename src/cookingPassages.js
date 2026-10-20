const normalized = text => text.replace(/[*#_]/gu, '').replace(/\s+/gu, ' ').trim().replace(/[.:]+$/u, '').toLowerCase();
const preparationHeading = text => /^(?:preparation|method|directions|instructions|how to prepare [^,;:.!?]+)$/u.test(text);

// Preserve IDs and exact slices. Exclude only known document structure, not
// arbitrary prose based on a growing list of cooking verbs.
export function cookingPassages(passages, inventory) {
  const labels = passages.map(p => normalized(p.text));
  const listEntries = new Set(inventory.ingredients.map(n => normalized(n.text)));
  const excluded = new Map();
  for (let index = 0; index < passages.length; index++) {
    const label = labels[index];
    if (/^ingredients?$/u.test(label)) {
      // Only treat a whole block as an ingredient list when both explicit
      // boundaries exist. Without an end heading, retain unknown prose.
      const end = labels.findIndex((text, i) => i > index && preparationHeading(text));
      if (end !== -1) for (let i = index; i < end; i++) excluded.set(passages[i].id, 'ingredient-list section');
    }
    if (preparationHeading(label) || /^(?:ingredients?|storage|tips?)$/u.test(label)) excluded.set(passages[index].id, 'section heading');
    if (label === normalized(inventory.title || '') || listEntries.has(label)) excluded.set(passages[index].id, 'title or ingredient entry');
  }
  return {
    eligible: passages.filter(p => !excluded.has(p.id)),
    excluded: passages.filter(p => excluded.has(p.id)).map(p => ({ ...p, reason: excluded.get(p.id) }))
  };
}
