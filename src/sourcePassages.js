// Conservative boundaries: retain exact source slices, including numbers and units.
// Abbreviations may keep adjacent sentences together; prefer that to cutting a quantity.
const abbreviations = new Set(['tsp', 'tbsp', 'tbs', 'oz', 'lb', 'lbs', 'min', 'mins', 'hr', 'hrs', 'in', 'cm', 'mm', 'ml', 'g', 'kg', 'approx', 'no', 'e.g', 'i.e']);
export function sourcePassages(source) {
  const passages = [];
  let start = 0, depth = 0;
  function emit(end) {
    let left = start, right = end;
    while (left < right && /\s/u.test(source[left])) left++;
    while (right > left && /\s/u.test(source[right - 1])) right--;
    const text = source.slice(left, right);
    if (text && !/^\[Image:[^\]]*\]$/u.test(text)) passages.push({ id: `p_${passages.length + 1}`, text, start: left, end: right });
    start = end;
  }
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (depth) continue;
    if (char === '\n' || char === '\r' || char === ';') { emit(i + 1); continue; }
    if (!'.!?'.includes(char) || (i + 1 < source.length && !/\s/u.test(source[i + 1]))) continue;
    if (char === '.') {
      if (/\d/u.test(source[i - 1] || '') && /\d/u.test(source[i + 1] || '')) continue;
      const token = source.slice(start, i).match(/([\p{L}.]+)$/u)?.[1].toLowerCase();
      if (abbreviations.has(token) || /^\s*(?:[-*]\s*)?\d+\.$/u.test(source.slice(start, i + 1))) continue;
    }
    emit(i + 1);
  }
  emit(source.length);
  return passages;
}
