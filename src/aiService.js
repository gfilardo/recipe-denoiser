import { RECIPE_DAG_SCHEMA } from './recipeSchema.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
export async function availability(api = globalThis.LanguageModel) {
  return api ? api.availability() : 'missing';
}
export async function convertRecipe(text, { signal, onProgress = () => {}, onPhase = () => {}, api = globalThis.LanguageModel } = {}) {
  if (!api) throw Error('Chrome local AI is not exposed in this browser. Try Demo or Manual JSON.');
  let session;
  try {
    // No await before create: keep this call on the user's activation path.
    const pending = api.create({ initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }], signal,
      monitor(m) { m.addEventListener('downloadprogress', e => onProgress(e.loaded)); } });
    onPhase('Preparing local model…');
    session = await pending;
    signal?.throwIfAborted();
    onPhase('Converting recipe on this device…');
    const result = await session.prompt(text, { responseConstraint: RECIPE_DAG_SCHEMA, omitResponseConstraintInput: true, signal });
    signal?.throwIfAborted();
    return JSON.parse(result);
  } finally { session?.destroy(); }
}
