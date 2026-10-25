// Language-independent lexical guard, not a unit converter or semantic proof.
const numbers = text => text.match(/\p{N}+(?:[.,/−–-]\p{N}+)*/gu) || [];
export function assertNumericFidelity(text, source, {exact = false} = {}) {
  const available = numbers(source);
  for (const value of numbers(text)) {
    const index = available.indexOf(value);
    if (index < 0) throw Error(`Generated number ${value} is not supported by the cited text. Preserve numbers exactly.`);
    available.splice(index, 1);
  }
  if (exact && available.length) throw Error('Shortened label omitted a number. Preserve all numbers.');
}
