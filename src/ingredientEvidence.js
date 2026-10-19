// Ground raw ingredient choices in the current action only. This identifies
// mentions, not quantities, portions, or proof that the cooking link is correct.
const ignored = new Set(`
a an and or the of to for with from into in on at by as is are be this that these those
some any each all about approximately approx optional taste ingredient ingredients
cup cups tbsp tablespoon tablespoons tsp teaspoon teaspoons tbs oz ounce ounces
lb lbs pound pounds g gram grams kg kilogram kilograms mg ml milliliter milliliters
millilitre millilitres l liter liters litre litres pint pints quart quarts gallon gallons
cm mm inch inches min mins minute minutes hour hours hr hrs percent pinch pinches
dash dashes bunch bunches handful handfuls clove cloves slice slices piece pieces
can cans tin tins package packages packet packets portion portions serving servings
small medium large extra fine coarse fresh dried dry ripe raw cooked uncooked
whole ground chopped diced sliced grated shredded minced crushed peeled drained
rinsed washed sifted softened melted beaten divided packed level heaped heaping
cold warm hot room temperature unsalted salted virgin organic type no
black white red green yellow golden brown light dark sweet plain
mix mixed mixing stir stirred stirring add added adding pour poured pouring
prepare prepared preparing cut cutting beat beating knead kneading cook cooking
bake baking boil boiling roast roasting fry frying saute sauteed puree pureed
leaf leaves stem stems sprig sprigs seed seeds skin skins zest
pan bowl sheet tray dish recipe preparation instructions needed desired
`.trim().split(/\s+/u));
const joiningWords = new Set(['di', 'de', 'del', 'della', 'da', 'du', 'des', 'la', 'le']);
const fold = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']s$/u, '');
function forms(value) {
  const variants = new Set([value]);
  // Conservative English plural alternatives; no culinary synonym guessing.
  if (value.length > 3 && /s$/u.test(value) && !/(ss|us|is)$/u.test(value)) variants.add(value.slice(0, -1));
  if (value.length > 4 && /ies$/u.test(value)) variants.add(`${value.slice(0, -3)}y`);
  if (value.length > 4 && /(ches|shes|xes|zes|oes)$/u.test(value)) variants.add(value.slice(0, -2));
  return variants;
}
function meaningful(word) {
  return word.length >= 3 && !joiningWords.has(word) && ![...forms(word)].some(form => ignored.has(form));
}
function tokens(text) {
  return [...text.matchAll(/[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)*/gu)].map(match => ({
    text: match[0], normalized: fold(match[0]), start: match.index, end: match.index + match[0].length,
  }));
}
function names(text, words) {
  const result = [];
  for (let start = 0; start < words.length; start++) {
    const first = words[start];
    if (!meaningful(first.normalized)) continue;
    result.push({ phrase: first.text, forms: forms(first.normalized) });
    // Match spaced/joined names such as Fior di latte / fiordilatte and
    // chick peas / chickpeas. Join only actual adjacent name words, preserving
    // the exact original action slice when one matches.
    let joined = first.normalized;
    for (let end = start + 1; end < Math.min(words.length, start + 4); end++) {
      const current = words[end], previous = words[end - 1];
      if (!/^[\s-]+$/u.test(text.slice(previous.end, current.start))) break;
      if (!meaningful(current.normalized) && !joiningWords.has(current.normalized)) break;
      joined += current.normalized;
      if (meaningful(current.normalized)) result.push({ phrase: text.slice(first.start, current.end), forms: forms(joined) });
    }
  }
  return result;
}
export function ingredientEvidence(ingredientText, actionText) {
  const ingredientWords = tokens(ingredientText), actionWords = tokens(actionText);
  const identity = new Set(names(ingredientText, ingredientWords).flatMap(name => [...name.forms]));
  const found = names(actionText, actionWords)
    .filter(name => [...name.forms].some(form => identity.has(form)))
    .map(name => name.phrase);
  // A narrow preparation alias: greasing can mention the use of a listed fat
  // without naming it. This does not choose between multiple fat portions.
  const ingredientForms = new Set(ingredientWords.flatMap(word => [...forms(word.normalized)]));
  const fat = ['oil', 'butter', 'lard', 'shortening'].some(name => ingredientForms.has(name));
  const butterBeans = ingredientForms.has('butter') && ingredientForms.has('bean');
  if (fat && !butterBeans) {
    found.push(...actionWords.filter(word => /^(grease|greases|greased|greasing)$/u.test(word.normalized)).map(word => word.text));
  }
  return [...new Set(found)];
}
