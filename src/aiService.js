import { RECIPE_DAG_SCHEMA } from './recipeSchema.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
export async function availability(api = globalThis.LanguageModel) {
  return api ? api.availability() : 'missing';
}
export async function convertRecipe(text, {
  signal, onProgress = () => {}, onPhase = () => {}, api = globalThis.LanguageModel,
  initializationTimeoutMs = 120000, inferenceTimeoutMs = 180000
} = {}) {
  if (!api) throw Error('Chrome local AI is not exposed in this browser. Try Demo or Manual JSON.');
  signal?.throwIfAborted();
  const task = new AbortController();
  const abort = () => task.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  let session, timeout, ticker, phase = 'initializing', lastProgress = null;
  const started = Date.now();
  function arm(ms, message) {
    clearTimeout(timeout);
    timeout = setTimeout(() => task.abort(new Error(message)), ms);
  }
  // Race explicitly: some Chrome builds leave create() pending even after abort.
  function wait(promise) {
    return new Promise((resolve, reject) => {
      const stopped = () => { cleanup(); reject(task.signal.reason); };
      const cleanup = () => task.signal.removeEventListener('abort', stopped);
      if (task.signal.aborted) { reject(task.signal.reason); return; }
      task.signal.addEventListener('abort', stopped, { once: true });
      Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
  }
  const stalledMessage = 'Chrome did not finish initializing the local model (no progress for 2 minutes). Cancelled this attempt. Keep this tab visible, check the model status in chrome://on-device-internals, then retry. Demo and Manual JSON are still available.';
  try {
    onPhase('Preparing local model… Waiting for Chrome to start the session.');
    arm(initializationTimeoutMs, stalledMessage);
    // No await before create: preserve the user's activation for model download.
    const pending = api.create({ initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }], signal: task.signal,
      monitor(m) { m.addEventListener('downloadprogress', e => {
        if (task.signal.aborted || phase !== 'initializing') return;
        lastProgress = Math.max(0, Math.min(1, e.loaded));
        arm(initializationTimeoutMs, stalledMessage);
        onProgress(lastProgress);
        if (lastProgress === 1) onPhase('Model downloaded. Chrome is loading the session…');
      }); } });
    // Clean up even if Chrome resolves after cancellation/timeout.
    Promise.resolve(pending).then(late => { if (task.signal.aborted) late.destroy(); }, () => {});
    ticker = setInterval(() => {
      if (phase !== 'initializing' || task.signal.aborted) return;
      const elapsed = Math.round((Date.now() - started) / 1000);
      onPhase(lastProgress === null
        ? `Waiting for Chrome to initialize the model… ${elapsed}s. A first download can take several minutes. Keep this tab visible; Cancel remains available.`
        : lastProgress === 1 ? `Model downloaded; waiting for Chrome to load the session… ${elapsed}s.`
        : `Downloading local model… ${Math.round(lastProgress * 100)}% (${elapsed}s). Keep this tab visible.`);
    }, 5000);
    session = await wait(pending);
    task.signal.throwIfAborted();
    clearInterval(ticker); phase = 'inference';
    onPhase('Converting recipe on this device…');
    arm(inferenceTimeoutMs, 'Local inference took longer than 3 minutes. Try a shorter recipe or use Manual JSON.');
    const result = await wait(session.prompt(text, { responseConstraint: RECIPE_DAG_SCHEMA, omitResponseConstraintInput: true, signal: task.signal }));
    task.signal.throwIfAborted();
    return JSON.parse(result);
  } finally {
    clearTimeout(timeout); clearInterval(ticker);
    signal?.removeEventListener('abort', abort);
    session?.destroy();
  }
}
