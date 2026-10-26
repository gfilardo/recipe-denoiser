import {createWebLLMBackend, WEBLLM_MODEL, WEBLLM_VERSION, WEBLLM_SETTINGS} from './webllmBackend.js';
import { demoRecipes } from './fixtures/demoRecipes.js';
import { setupEditor } from './editor.js';
import { layoutRecipe } from './layoutRecipe.js';
import { renderRecipe, renderText } from './tableRenderer.js';
import { availability, convertRecipe } from './aiService.js';
import { setupConversionDialog } from './conversionDialog.js';
import { copyRecipe, downloadRecipe } from './exportRecipe.js';

const $ = id => document.getElementById(id);
for(const demo of demoRecipes) {
  const option=document.createElement('option'); option.value=demo.id; option.textContent=demo.label;
  $('demo-recipe').append(option);
}
const selectedDemo = () => demoRecipes.find(demo=>demo.id === $('demo-recipe').value) || demoRecipes[0];
const CONVERSION_LIMIT_MINUTES = {chrome:10, webllm:30};
let controller, generation = 0, revision = 0, hasResult = false, timer;

function message(text, error = false) {
  $('message').textContent = text; $('message').classList.toggle('error', error);
}
const editor = setupEditor($('editor'), $('image-input'), text => {
  revision++; $('source-count').textContent = `${text.length.toLocaleString()} characters`;
  if (hasResult) $('result-label').textContent = 'Source changed · convert to update';
}, text => message(text, true));

function busy(value) {
  document.querySelectorAll('[name=backend]').forEach(input => { input.disabled=value; });
  $('constrain-extraction').disabled=value;
  $('convert').disabled = value; $('cancel').hidden = !value; $('progress').hidden = true;
}

function cancel() {
  generation++; controller?.abort(); controller = null; busy(false);
}

const conversionDialog = setupConversionDialog(() => {
  cancel(); message('Conversion canceled.');
});

function apply(recipe, label, procedureLabels = {}) {
  const layout = layoutRecipe(recipe); renderRecipe(recipe, layout, $('output'), procedureLabels); renderText(recipe, $('text-content'));
  hasResult = true; $('copy').disabled = false; $('print').disabled = false; $('download').disabled = false; $('text-view').hidden = false;
  $('result-label').textContent = label; $('json-error').textContent = '';
}

$('sample').addEventListener('click', () => {
  cancel();
  clearTimeout(timer); editor.load(selectedDemo().source); message('Selected sample loaded. Convert with local AI, or use Try demo for the prepared grid.');
});
$('demo').addEventListener('click', () => {
  cancel();
  const demo=selectedDemo();
  clearTimeout(timer); editor.load(demo.source); $('json-input').value = JSON.stringify(demo.recipe, null, 2); apply(demo.recipe, `Prepared demo · ${demo.recipe.ingredients.length} ingredients`); message('Hand-authored demo grid loaded, not an AI result. Edit the JSON to explore the layout.');
});
$('json-input').addEventListener('input', () => {
  cancel();
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { apply(JSON.parse($('json-input').value), 'Manual JSON'); message('Grid updated from JSON.'); }
    catch (error) { $('json-error').textContent = error.message; }
  }, 350);
});
$('convert').addEventListener('click', async () => {
  const text = editor.text(); if (!text) { message('Paste a recipe or load the sample first.', true); $('editor').focus(); return; }
  if (text.length > 30000) { message('Please shorten the source to 30,000 characters or fewer.', true); return; }
  clearTimeout(timer); cancel(); const current = generation, sourceRevision = revision; controller = new AbortController(); busy(true);
  const backend = document.querySelector('[name=backend]:checked').value;
  const conversionMinutes = CONVERSION_LIMIT_MINUTES[backend];
  conversionDialog.open(conversionMinutes);
  const local = backend === 'webllm' ? createWebLLMBackend() : null;
  conversionDialog.event({type:'backend', elapsedMs:0, backend, model:local ? WEBLLM_MODEL : 'Chrome-managed (exact build unknown)', settings:local ? {...WEBLLM_SETTINGS,runtime:WEBLLM_VERSION} : {samplingMode:'most-predictable'}, browser:navigator.userAgent});
  try {
    let procedureLabels = {};
    const recipe = await convertRecipe(text, {
      constrainExtraction:$('constrain-extraction').checked,
      api: local || globalThis.LanguageModel, engineName: local ? 'WebLLM' : 'Chrome',
      onProcedureLabels: labels => { procedureLabels = labels; }, signal: controller.signal,
      inferenceTimeoutMs: conversionMinutes * 60000,
      onDiagnostic: event => { if (current === generation) conversionDialog.event(event); },
      onPhase: text => { if (current === generation) { message(text); if (text.startsWith('Converting')) $('progress').hidden = true; } },
      onProgress: progress => { if (current === generation) { $('progress').hidden = false; $('progress').value = progress; message(`Downloading local model… ${Math.round(progress * 100)}%`); } }
    });
    if (current !== generation) return;
    conversionDialog.rendering();
    $('json-input').value = JSON.stringify(recipe, null, 2);
    apply(recipe, sourceRevision === revision ? `Converted with ${backend === 'webllm' ? 'WebLLM · Qwen2.5 7B' : 'Chrome built-in AI'}` : 'Source changed · convert to update', procedureLabels); message('Model interpretation ready. Review quantities, connections and shortened labels against your source.');
    conversionDialog.success();
  } catch (error) {
    if (current === generation) { conversionDialog.fail(error.message || 'Conversion failed. Try again or use Manual JSON.'); message(error.message || 'Conversion failed. Try Demo or Manual JSON.', true); if ($('json-input').value) $('json-drawer').open = true; }
  } finally { local?.dispose(); if (current === generation) { controller = null; busy(false); void checkAvailability(); } }
});
$('cancel').addEventListener('click', () => {
  cancel();
  message('Conversion canceled.');
});
$('copy').addEventListener('click', async () => {
  try { await copyRecipe($('output')); message('Recipe HTML copied.'); } catch { message('Clipboard access failed. Use Download HTML to save the recipe.', true); }
});

$('print').addEventListener('click', () => window.print());

const download = document.createElement('button'); download.id = 'download'; download.textContent = 'Download HTML'; download.disabled = true; $('copy').after(download); download.addEventListener('click', () => downloadRecipe($('output')));
let availabilityRevision=0;
document.querySelectorAll('[name=backend]').forEach(input=>input.addEventListener('change',()=>{ void checkAvailability(); }));
async function checkAvailability() {
  const check=++availabilityRevision;
  if(document.querySelector('[name=backend]:checked').value === 'webllm') {
    const adapter=await navigator.gpu?.requestAdapter().catch(()=>null);
    if(check !== availabilityRevision) return;
    $('ai-disclaimer').hidden=true;
    $('ai-status').textContent=adapter ? 'WebLLM · ready to try' : 'WebGPU unavailable';
    $('ai-help').textContent=adapter ? 'Convert downloads Qwen2.5 7B on first use. Available GPU memory is checked during loading; readiness does not guarantee it will fit.' : 'WebLLM needs a WebGPU-capable browser and device. Try Chrome built-in AI, Demo or Manual JSON.';
    return;
  }
  try {
    const state = await availability();
    if(check !== availabilityRevision) return;
    $('ai-disclaimer').hidden = ['available', 'downloadable', 'downloading'].includes(state);
    const labels = { available: '● Local AI ready', downloadable: '↓ Model downloadable', downloading: '↓ Model downloading', unavailable: 'Local AI unavailable', missing: 'Demo / manual mode' };
    $('ai-status').textContent = labels[state] || 'Local AI unavailable';
    $('ai-help').textContent = state === 'available' ? 'Your recipe is processed on this device.' : state === 'downloadable' || state === 'downloading' ? 'Click Convert to initialize the model. The first download may take a while.' : 'Use Demo or edit JSON. Local AI needs an eligible Chrome device and localhost/HTTPS. Development setup: chrome://flags/#prompt-api-for-gemini-nano';
  } catch { $('ai-disclaimer').hidden = false; $('ai-status').textContent = 'Local AI unavailable'; $('ai-help').textContent = 'Capability check failed. Demo and Manual JSON are available.'; }
}
void checkAvailability();
