import { ingredientEvidence } from './ingredientEvidence.js';

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const key = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const operations = /\b(?:thin(?:ning)?|dilut(?:e|ing)|sift(?:ing)?|blanch(?:ing)?|break(?:ing)?|incorporat(?:e|ing)|squeez(?:e|ing)|strain(?:ing)?|decorat(?:e|ing)|add(?:ing)?|mix(?:ing)?|combin(?:e|ing)|stir(?:ring)?|pour(?:ing)?|work(?:ing)?|cut(?:ting)?|slic(?:e|ing)|chop(?:ping)?|drain(?:ing)?|grat(?:e|ing)|melt(?:ing)?|greas(?:e|ing)|finish(?:ing)?|garnish(?:ing)?|drizzl(?:e|ing)|plac(?:e|ing)|spread(?:ing)?|sprinkl(?:e|ing)|whisk(?:ing)?|beat(?:ing)?|season(?:ing)?|coat(?:ing)?|brush(?:ing)?|dust(?:ing)?|knead(?:ing)?|fold(?:ing)?|wash(?:ing)?|rins(?:e|ing)|retriev(?:e|ing)|turn(?:ing)?|cover(?:ing)?|roll(?:ing)?|stretch(?:ing)?)\b/giu;
const referentPattern = /\b(?:dry ingredients|dough|batter|topping|sauce|pizza|filling|dressing|frosting|icing|marinade|pastry|cake|bread|salad|soup|mixture)\b/giu;
export function resultReferents(text) {
  const names = [...text.matchAll(referentPattern)].map(m => key(m[0]));
  // A sifted flour preparation can be referred to as the dry ingredients.
  if (/\bsift\b/iu.test(text) && /\bflour\b/iu.test(text)) names.push('dry ingredients');
  return [...new Set(names)];
}

// This is a bounded English instruction recognizer, not a general parser.
// Only an affirmative operation governing the mention can require a use.
// Descriptions and negations cannot turn into additions to complete a graph.
export function mentionUse(action, phrase) {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, 'giu');
  let uncertain = false;
  for (const match of action.matchAll(pattern)) {
    const prefix = action.slice(0, match.index);
    const boundary = Math.max(...['.', ';', ':', '!', '?'].map(mark => prefix.lastIndexOf(mark)));
    let before = prefix.slice(boundary + 1);
    // An observation can introduce a present instruction in the same sentence.
    // Scope its future tense to the observation, not to "so thin ... with milk".
    // Only reset for an explicit imperative; conditions and future uses retain
    // their original scope ("if ... then", "the milk will be used ...").
    if (/^\s*you will (?:notice|see|find)\b/iu.test(before)) {
      const transition = /,\s*(?:so|then)\s+/giu;
      for (const split of before.matchAll(transition)) {
        const instruction = before.slice(split.index + split[0].length);
        const verb = [...instruction.matchAll(operations)][0];
        if (verb?.index === 0) { before = instruction; break; }
      }
    }
    const end = action.slice(match.index + phrase.length).search(/[.;:!?]/u);
    const after = action.slice(match.index + phrase.length, end < 0 ? undefined : match.index + phrase.length + end);
    const nextOperation = [...after.matchAll(operations)][0];
    const clause = before + phrase + (nextOperation ? after.slice(0, nextOperation.index) : after);
    if (/\b(?:not|never|without|avoid|omit|instead of|rather than)\b/iu.test(before) || /^[-\s]*free\b/iu.test(after)) continue;
    if (/\bwill\b/iu.test(before) || /^\s+will\b/iu.test(after)) continue; // Future work is not an input now.
    if (/\b(?:if|unless|optional|optionally|may|could|or)\b/iu.test(clause)) { uncertain = true; continue; }
    const verb = [...before.matchAll(operations)].at(-1);
    if (!verb && /^greas(?:e|ing)$/iu.test(phrase)) return { kind: 'use', quote: phrase };
    if (verb) {
      const governed = before.slice(verb.index + verb[0].length);
      if (/\b(?:until|while|when|once|because|containing|contains|already|made with|which|that is)\b/iu.test(governed)) continue;
      return { kind: 'use', quote: before.slice(verb.index) + phrase };
    }
    if (!/^\s*(?:(?:then|meanwhile)\s*,?\s*)?(?:rest|wait|notice|observe|check|you will notice|let|leave)\b/iu.test(before)) uncertain = true;
  }
  return { kind: uncertain ? 'uncertain' : 'mention' };
}

export function constrainConnections(candidates, action, previousId) {
  // Same-name ambiguity is resolved by source-role filtering before this pass.
  for (const candidate of candidates) {
    if (candidate.kind !== 'ingredient') continue;
    const decisions = candidate.evidence.map(phrase => ({ phrase, ...mentionUse(action, phrase) }));
    candidate.evidence = decisions.filter(d => d.kind !== 'mention').map(d => d.phrase);
    candidate.use_evidence = decisions.filter(d => d.kind === 'use').map(d => d.phrase);
  }
  for (const candidate of candidates) {
    if (candidate.kind !== 'ingredient' || !candidate.use_evidence.length) continue;
    // Do not turn different words within one mention (e.g. "olive oil")
    // into two mandatory portions. Keep all choices when any name overlaps.
    const ambiguous = candidate.evidence.some(phrase => candidates.some(other =>
      other !== candidate && other.kind === 'ingredient' && other.evidence.some(value => key(value) === key(phrase))));
    if (!ambiguous) {
      candidate.required = true;
      candidate.reason = 'Explicit ingredient use in this action';
    }
  }
  for (const candidate of candidates) if (candidate.kind === 'ingredient' && candidate.required) candidate.evidence = [...candidate.use_evidence];

  const fresh = candidates.filter(n => n.kind === 'ingredient' && n.use_evidence.length);
  const freshMentions = new Set(fresh.flatMap(n => n.use_evidence).map(key));
  const results = candidates.filter(n => n.kind === 'result');
  for (const result of results) {
    // A mention of fresh topping salt is not also a reference to the dough's
    // incorporated salt. Greasing is a fresh-fat alias, not a mixture alias.
    const ingredients = result.contains.flatMap(text => ingredientEvidence(text, action))
      .filter(phrase => !freshMentions.has(key(phrase)) && !/^greas(?:e|ing)$/iu.test(phrase));
    const referents = (result.referents || []).flatMap(name => name === 'dry ingredients'
      ? [...action.matchAll(/\bdry\s+ingredients\b/giu)].map(m=>m[0]) : ingredientEvidence(name, action));
    result.use_evidence = [...new Set([...ingredients, ...referents])]
      .filter(phrase => mentionUse(action, phrase).kind === 'use');
  }
  for (const result of results) {
    if (result.use_evidence.some(phrase => !results.some(other => other !== result && other.use_evidence.some(value => key(value) === key(phrase))))) {
      result.required = true;
      result.reason = 'Explicit use of this prepared result';
    }
  }

  // "Meanwhile" alone is not enough: there must be fresh ingredient use.
  // Explicitly referenced existing results remain eligible (e.g. add garlic
  // to the sauce). Other work stays available for its eventual joining step.
  const independent = /^\s*meanwhile\s*,?\s*(?:prepare|mix|cut|slice|chop|grate|drain|melt|whisk|blanch|squeeze)\b/iu.test(action) && fresh.length > 0;
  const newContainer = fresh.length > 0 && (/^\s*in another bowl\b/iu.test(action) || /^\s*break\b[^.;!?]*\beggs\b[^.;!?]*\binto\b[^.;!?]*\bbowl\b/iu.test(action));
  const focused = /^\s*(?:then\s+)?retriev(?:e|ing)\b/iu.test(action) && results.some(n => n.required);
  if (independent || newContainer || focused) for (const result of results) {
    if (!result.use_evidence.length) {
      result.allowed = false;
      result.reason = independent || newContainer ? 'Independent preparation; this result is not referenced' : 'This action retrieves a different prepared result';
    }
  }

  // Direct pronouns continue the immediately preceding preparation, rather
  // than consuming every live branch (e.g. drain/chop the blanched nuts).
  const pronoun = /^\s*(?:roughly\s+)?(?:drain|dry|peel|chop)\s+them\b/iu.test(action);
  const prior = results.find(n => n.id === previousId);
  if (pronoun && prior) {
    prior.required = true;
    prior.reason = 'Direct pronoun continues the preceding preparation';
    for (const result of results) if (result !== prior && !result.use_evidence.length) {
      result.allowed = false;
      result.reason = 'Pronoun refers to a different preparation';
    }
  }
  // Unmolding names a prepared cake/pastry, not the juice prepared meanwhile.
  const unmolded = /\bunmold\b/iu.test(action) ? results.filter(n => n.referents?.some(name => ['cake','bread','pastry'].includes(name)) && /\b(?:cake|pan|oven)\b/iu.test(n.text)) : [];
  if (unmolded.length === 1) for (const result of results) {
    if (result === unmolded[0]) { result.required = true; result.reason = 'Unmold the prepared cake or pastry'; }
    else if (!result.use_evidence.length) { result.allowed = false; result.reason = 'Unmolding does not use this separate preparation'; }
  }

  // Resolve the narrow anaphor "spread ... over the surface" only when the
  // immediately preceding, still-live result was explicitly spread/flattened.
  const previous = results.find(n => n.id === previousId);
  if (previous && ((/\bspread\b[^.;!?]*\bover the surface\b/iu.test(action) && /\b(?:spread|spreading|flatten|roll|stretch|level)\b/iu.test(previous.text)) ||
    (/\bbrush the surface\b/iu.test(action) && /\bunmold\b/iu.test(previous.text))) &&
    results.some(n => n !== previous && n.required)) {
    previous.required = true;
    previous.allowed = true;
    previous.reason = 'Surface of the result spread in the preceding action';
  }
  return candidates;
}
