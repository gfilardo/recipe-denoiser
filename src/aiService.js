import { procedureBatches, labelChoices, labelSchema, acceptLabels } from './procedureLabels.js';
import { buildConnectionRequest, actionConnectionSchema, acceptConnection, connectionChoices } from './actionConnections.js';
import { createActionConnectionGuard, ConnectionOutputError } from './connectionGuard.js';
import { SYSTEM_PROMPTS } from './systemPrompt.js';
import { INGREDIENT_SCHEMA, actionSchema, acceptIngredients, acceptActions, assembleRecipe } from './recipeExtraction.js';
import { sourcePassages } from './sourcePassages.js';
import { cookingPassages } from './cookingPassages.js';
import { prepareIngredientUses } from './ingredientUses.js';
import { createOutputGuard, WhitespaceLoopError } from './outputGuard.js';

// Checking the local model availability is a quick way to detect whether
// the local AI is exposed in this browser. 
// It does not guarantee that the model will successfully complete a conversion
//  request, but it is a good first check.
const SAMPLING_OPTIONS = { samplingMode: 'most-predictable' };
export async function availability(api = globalThis.LanguageModel) {
  return api ? api.availability(SAMPLING_OPTIONS) : 'missing';
}


const labels = { ingredients: 'Extracting ingredients', actions: 'Selecting cooking passages', connections: 'Connecting ingredients and actions' };
export async function convertRecipe(text, {
  signal, onProgress = () => {}, onPhase = () => {}, onDiagnostic = () => {}, api = globalThis.LanguageModel,
  simplifyProcedures = true, onProcedureLabels = () => {},
  initializationTimeoutMs = 120000, inferenceTimeoutMs = 180000
} = {}) {
  if (!api) throw Error('Chrome local AI is not exposed in this browser. Try Demo or Manual JSON.');
  signal?.throwIfAborted();
  const task = new AbortController();
  const abort = () => task.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  let session, timeout, ticker, phase = 'initializing', stage = 'ingredients', activeAttempt = 0;
  let stageLabel = labels.ingredients;
  let receivedChars = 0, receivedChunks = 0, correctionUsed = false, correcting = false, inferenceStarted = false;
  const started = Date.now();
  const report = (type, detail = {}) => onDiagnostic({ type, elapsedMs: Date.now() - started, stage, ...detail });
  function arm(ms, message) {
    clearTimeout(timeout);
    timeout = setTimeout(() => task.abort(new Error(typeof message === 'function' ? message() : message)), ms);
  }
  function wait(promise) {
    return new Promise((resolve, reject) => {
      const cleanup = () => task.signal.removeEventListener('abort', stopped);
      const stopped = () => { cleanup(); reject(task.signal.reason); };
      // Always observe the promise, including synchronous aborts from create().
      Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
      if (task.signal.aborted) { reject(task.signal.reason); return; }
      task.signal.addEventListener('abort', stopped, { once: true });
    });
  }
  function destroy() { if (session) { const current = session; session = null; current.destroy(); } }
  const startupMessage = 'Chrome did not finish initializing the local model. Inspect chrome://on-device-internals, then retry. Demo and Manual JSON are still available.';
  const limit = inferenceTimeoutMs % 60000 === 0 ? `${inferenceTimeoutMs / 60000} minutes` : `${inferenceTimeoutMs / 1000} seconds`;
  async function openSession() {
    phase = inferenceStarted ? 'stage-initializing' : 'initializing';
    report('session', { label: stageLabel });
    const pending = api.create({ ...SAMPLING_OPTIONS, initialPrompts: [{ role: 'system', content: SYSTEM_PROMPTS[stage] }], signal: task.signal,
      monitor(m) { m.addEventListener('downloadprogress', e => {
        if (task.signal.aborted) return;
        const progress = Math.max(0, Math.min(1, e.loaded));
        if (!inferenceStarted) arm(initializationTimeoutMs, startupMessage);
        onProgress(progress); report('download', { progress });
      }); } });
    Promise.resolve(pending).then(late => { if (task.signal.aborted) late.destroy(); }, () => {});
    session = await wait(pending);
    // Late-create cleanup above owns the session if create synchronously aborted.
    if (task.signal.aborted) { session = null; task.signal.throwIfAborted(); }
    if (!inferenceStarted) {
      inferenceStarted = true;
      arm(inferenceTimeoutMs, () => `${stageLabel}${correcting ? ' (correction)' : ''} timed out within the shared ${limit} conversion limit. ${correctionUsed ? 'One stage correction was used.' : 'No correction was started.'} Inspect the diagnostic report or use Manual JSON.`);
    }
    report('ready', { streaming: typeof session.promptStreaming === 'function' });
  }
  async function generate(prompt, schema, connectionGuard) {
    const options = { responseConstraint: schema, omitResponseConstraintInput: false, signal: task.signal };
    const attemptStarted = Date.now(), streaming = typeof session.promptStreaming === 'function';
    phase = 'generating'; activeAttempt++; receivedChars = 0; receivedChunks = 0;
    const label = `${stageLabel}${correcting ? ' · correction' : ''}`;
    report('attempt', { attempt: activeAttempt, label, correction: correcting, streaming,
      promptChars: prompt.length, systemChars: SYSTEM_PROMPTS[stage].length, schemaChars: JSON.stringify(schema).length });
    onPhase(`Converting recipe: ${label.toLowerCase()}…`);
    let result = '';
    const guard = createOutputGuard();
    if (streaming) {
      const reader = session.promptStreaming(prompt, options).getReader();
      let completed = false;
      try {
        while (true) {
          const { value, done } = await wait(reader.read());
          task.signal.throwIfAborted();
          if (done) { completed = true; break; }
          if (typeof value !== 'string') throw new Error('The local model returned a non-text response.');
          if (!value.length) continue;
          result += value; receivedChars = result.length; receivedChunks++;
          report('output', { attempt: activeAttempt, text: result, chars: receivedChars, chunks: receivedChunks, attemptElapsedMs: Date.now() - attemptStarted });
          guard(value);
          connectionGuard?.(value);
        }
      } finally {
        if (!completed) void reader.cancel(task.signal.reason).catch(() => {});
        reader.releaseLock();
      }
    } else {
      result = await wait(session.prompt(prompt, options));
      if (typeof result !== 'string') throw new Error('The local model returned a non-text response.');
      receivedChars = result.length;
    }
    task.signal.throwIfAborted();
    report('response', { attempt: activeAttempt, text: result, chars: receivedChars, attemptElapsedMs: Date.now() - attemptStarted });
    if (!streaming) connectionGuard?.(result);
    return result;
  }
  async function runStage(name, schema, input, accept, makeGuard, label = labels[name]) {
    stage = name; stageLabel = label; correcting = false;
    let feedback = '';
    while (true) {
      task.signal.throwIfAborted();
      await openSession();
      const prompt = JSON.stringify({ ...input, ...(feedback ? { correction: feedback } : {}) });
      // Transport, timeout, whitespace and output-limit failures are not retried.
      let accepted, validating = false;
      try {
        const response = await generate(prompt, schema, makeGuard?.());
        validating = true;
        phase = 'validating'; report('validating', { label: stageLabel });
        accepted = accept(JSON.parse(response));
      } catch (error) {
        if (!validating && !(error instanceof ConnectionOutputError)) throw error;
        report('invalid', { message: error.message });
        destroy();
        if (correctionUsed) throw new Error(`${stageLabel} failed validation; the single stage correction has been used: ${error.message} Inspect the output snapshot or use Manual JSON.`, { cause: error });
        correctionUsed = true; correcting = true;
        feedback = `The previous response failed validation: ${error.message} Correct ONLY this stage using the original source and fixed data in this request. Do not invent or rewrite quantities. Return the complete JSON for only this request.`;
        report('correction', { label: stageLabel });
        continue;
      }
      report('stage-validated', { label: stageLabel });
      destroy();
      return accepted;
    }
  }
  try {
    report('initializing', { sourceChars: text.length, pipeline: 'staged-v11-procedure-labels', schemaGuidance: true });
    onPhase('Preparing local model…'); arm(initializationTimeoutMs, startupMessage);
    ticker = setInterval(() => {
      if (!task.signal.aborted) onPhase(`${stageLabel}${correcting ? ' · correction' : ''}… ${Math.floor((Date.now() - started) / 1000)}s elapsed. Cancel remains available.`);
    }, 5000);
    // runStage reaches create() before its first await, preserving click activation.
    const extractedInventory = await runStage('ingredients', INGREDIENT_SCHEMA, { source: text }, data => acceptIngredients(data, text));
    const passages = sourcePassages(text);
    report('passages', { passages });
    const { eligible } = cookingPassages(passages, extractedInventory);
    if (!eligible.length) throw new Error('No cooking passages remain after excluding the ingredient list and headings. Include the preparation instructions or use Manual JSON.');
    const actions = await runStage('actions', actionSchema(eligible), { passages: eligible.map(({ id, text }) => ({ id, text })) }, data => acceptActions(data, eligible));
    const inventory = prepareIngredientUses(extractedInventory, actions, text);
    const rows = [];
    for (let i = 0; i < actions.steps.length; i++) {
      const request = buildConnectionRequest(inventory, actions, rows);
      stage = 'connections';
      report('connection', { request });
      const row = await runStage('connections', actionConnectionSchema(request), request, data => {
        const inputs = acceptConnection(data, request);
        // Check the entire graph inside the bounded correction path before
        // accepting the last row. Earlier successful rows stay frozen.
        if (i === actions.steps.length - 1) assembleRecipe(inventory, actions, { inputs: [...rows, inputs] });
        return inputs;
      }, () => createActionConnectionGuard(connectionChoices(request)), `Connecting action ${i + 1} of ${actions.steps.length}`);
      rows.push(row);
      report('connection-validated', { completed: rows.length, total: actions.steps.length });
    }
    const recipe = assembleRecipe(inventory, actions, { inputs: rows });
    if (simplifyProcedures) {
      const batches = procedureBatches(recipe), labels = {};
      stage = 'simplification'; correcting = false;
      report('simplification-start', { batches: batches.length });
      for (let i = 0; i < batches.length; i++) {
        stageLabel = `Shortening procedure labels ${i + 1} of ${batches.length}`;
        try {
          await openSession();
          const response = await generate(JSON.stringify({ procedures: batches[i] }), labelSchema(batches[i]), createActionConnectionGuard(labelChoices(batches[i])));
          Object.assign(labels, acceptLabels(JSON.parse(response), batches[i]));
        } catch (error) {
          task.signal.throwIfAborted();
          // Presentation must not spend the graph correction or invalidate it.
          report('simplification-fallback', { message: error.message });
          break;
        } finally { destroy(); }
      }
      onProcedureLabels(labels);
      report('simplification-complete', { shortened: Object.keys(labels).length });
    }
    report('validated');
    return recipe;
  } catch (error) {
    const originalMessage = error.message || String(error);
    const outputLimited = /response exceeded output limits|output (?:token )?limit.*truncat/i.test(originalMessage);
    const requestInvalid = phase === 'generating' && receivedChars === 0 && /request is invalid.*input or options could not be processed/i.test(originalMessage);
    const failure = requestInvalid ? new Error(`Chrome rejected the request while ${stageLabel.toLowerCase()} before returning any output. The request or its options could not be processed; this is not a repetition or timeout failure. Inspect the diagnostic report. No correction was started for this request error.`, { cause: error }) : outputLimited ? new Error(`Chrome reached its response-length limit during ${stageLabel.toLowerCase()}. ${receivedChars.toLocaleString()} characters were received. Increasing the time limit will not fix this. Inspect the output snapshot; no incomplete recipe was applied.`, { cause: error }) : error;
    report('failed', { message: failure.message || String(failure), originalMessage, errorName: error.name || 'Error',
      category: error instanceof ConnectionOutputError || error.cause instanceof ConnectionOutputError ? 'connection-invalid' : requestInvalid ? 'request-invalid' : error instanceof WhitespaceLoopError ? 'whitespace-loop' : outputLimited ? 'output-limit' : 'other', phase,
      attempt: activeAttempt, chars: receivedChars, chunks: receivedChunks });
    throw failure;
  } finally {
    clearTimeout(timeout); clearInterval(ticker); signal?.removeEventListener('abort', abort); destroy();
  }
}
