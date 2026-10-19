// Preserve explicit ingredient-section labels, never infer them from cooking
// prose. A missing or multiply alignable ingredient list yields no metadata.
function normalizedSource(text) {
  let normalized = '';
  const offsets = [];
  let offset = 0;
  for (const character of text) {
    const end = offset + character.length;
    if (/\s/u.test(character)) {
      if (!normalized.endsWith(' ')) {
        normalized += ' ';
        offsets.push({ start: offset, end });
      } else offsets[offsets.length - 1].end = end;
    } else {
      const lower = character.toLowerCase();
      normalized += lower;
      for (let index = 0; index < lower.length; index++) offsets.push({ start: offset, end });
    }
    offset = end;
  }
  return { normalized, offsets };
}
const normalize = text => text.replace(/\s+/gu, ' ').trim().toLowerCase();
const separators = text => /^[\s.,;:*-]*$/u.test(text);
function heading(line) {
  const trimmed = line.trim();
  let label;
  const markdown = trimmed.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/u);
  if (markdown) label = markdown[1].trim();
  else if (/^For\s+(?:the\s+)?[\p{L}][\p{L}\s&’'\-]{0,70}:?$/iu.test(trimmed)) label = trimmed.replace(/:$/u, '').trim();
  else if (/^[\p{L}][\p{L}\s&’'\-]{0,70}:$/u.test(trimmed)) label = trimmed.slice(0, -1).trim();
  if (!label || label.length > 80) return null;
  // A colon does not turn an imperative cooking instruction into a section.
  if (/^(add|mix|stir|pour|cook|bake|boil|fry|roast|knead|cut|cover|place|remove|then|meanwhile)\b/iu.test(label)) return null;
  return label;
}
function headingInGap(gap, initial) {
  const lines = gap.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index--) {
    const label = heading(lines[index]);
    if (label === null) continue;
    if (!lines.slice(index + 1).every(separators)) continue;
    if (!initial && !lines.slice(0, index).every(separators)) continue;
    return label;
  }
  return null;
}
function lowerBound(occurrences, end) {
  let left = 0, right = occurrences.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (occurrences[middle].start < end) left = middle + 1;
    else right = middle;
  }
  return left;
}
export function ingredientSections(source, ingredients) {
  if (!ingredients.length) return {};
  const { normalized, offsets } = normalizedSource(source);
  const seen = new Set();
  const candidates = [];
  for (const ingredient of ingredients) {
    if (!ingredient.id || seen.has(ingredient.id)) return {};
    seen.add(ingredient.id);
    const phrase = normalize(ingredient.text);
    if (!phrase) return {};
    const occurrences = [];
    let position = normalized.indexOf(phrase);
    while (position !== -1) {
      occurrences.push({ start: offsets[position].start, end: offsets[position + phrase.length - 1].end });
      position = normalized.indexOf(phrase, position + 1);
    }
    if (!occurrences.length) return {};
    candidates.push(occurrences);
  }
  // Count possible non-overlapping, source-ordered alignments, capped at two.
  // Repeated equal phrases are fine when their occurrence order is unambiguous.
  const ways = candidates.map(occurrences => occurrences.map(() => 1));
  for (let index = candidates.length - 2; index >= 0; index--) {
    const next = candidates[index + 1], suffix = Array(next.length + 1).fill(0);
    for (let item = next.length - 1; item >= 0; item--) suffix[item] = Math.min(2, suffix[item + 1] + ways[index + 1][item]);
    ways[index] = candidates[index].map(occurrence => suffix[lowerBound(next, occurrence.end)]);
  }
  if (ways[0].reduce((sum, count) => Math.min(2, sum + count), 0) !== 1) return {};
  const spans = [];
  let previousEnd = 0;
  for (let index = 0; index < candidates.length; index++) {
    const position = candidates[index].findIndex((occurrence, item) => occurrence.start >= previousEnd && ways[index][item] === 1);
    if (position < 0) return {};
    const span = candidates[index][position];
    spans.push(span);
    previousEnd = span.end;
  }
  const sections = {};
  let number = 1, label = '';
  previousEnd = 0;
  spans.forEach((span, index) => {
    const nextLabel = headingInGap(source.slice(previousEnd, span.start), index === 0);
    if (nextLabel !== null) {
      if (index !== 0) number++;
      label = nextLabel;
    }
    sections[ingredients[index].id] = { id: `section_${number}`, label };
    previousEnd = span.end;
  });
  return sections;
}
