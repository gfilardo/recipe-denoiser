import { bananaBread, verboseRecipe } from './fixtures/bananaBread.js';
import { setupEditor } from './editor.js';
import { layoutRecipe } from './layoutRecipe.js';
import { renderRecipe, renderText } from './tableRenderer.js';
import { availability, convertRecipe } from './aiService.js';
import { setupConversionDialog } from './conversionDialog.js';
import { copyRecipe, downloadRecipe } from './exportRecipe.js';

const $ = id => document.getElementById(id);
const CONVERSION_LIMIT_MINUTES = 10;
let controller, generation = 0, revision = 0, hasResult = false, timer;

function message(text, error = false) { 
  $('message').textContent = text; $('message').classList.toggle('error', error);
}
const editor = setupEditor($('editor'), $('image-input'), text => {
  revision++; $('source-count').textContent = `${text.length.toLocaleString()} characters`;
  if (hasResult) $('result-label').textContent = 'Source changed · convert to update';
}, text => message(text, true));

function busy(value) { 
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
  editor.load(verboseRecipe); message('Sample loaded. Convert with local AI, or use Try demo for the prepared grid.'); 
});
$('demo').addEventListener('click', () => { 
  cancel(); 
  clearTimeout(timer); editor.load(verboseRecipe); $('json-input').value = JSON.stringify(bananaBread, null, 2); apply(bananaBread, 'Demo · 10 ingredients'); message('Demo grid loaded. Edit the JSON to explore the layout.'); 
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
  conversionDialog.open(CONVERSION_LIMIT_MINUTES);
  try {
    let procedureLabels = {};
    const recipe = await convertRecipe(text, {
      onProcedureLabels: labels => { procedureLabels = labels; }, signal: controller.signal,
      inferenceTimeoutMs: CONVERSION_LIMIT_MINUTES * 60000,
      onDiagnostic: event => { if (current === generation) conversionDialog.event(event); },
      onPhase: text => { if (current === generation) { message(text); if (text.startsWith('Converting')) $('progress').hidden = true; } },
      onProgress: progress => { if (current === generation) { $('progress').hidden = false; $('progress').value = progress; message(`Downloading local model… ${Math.round(progress * 100)}%`); } }
    });
    if (current !== generation) return;
    conversionDialog.rendering();
    $('json-input').value = JSON.stringify(recipe, null, 2);
    apply(recipe, sourceRevision === revision ? 'Converted on this device' : 'Source changed · convert to update', procedureLabels); message('Recipe converted. Check quantities and steps against your source.');
    conversionDialog.success();
  } catch (error) {
    if (current === generation) { conversionDialog.fail(error.message || 'Conversion failed. Try again or use Manual JSON.'); message(error.message || 'Conversion failed. Try Demo or Manual JSON.', true); if ($('json-input').value) $('json-drawer').open = true; }
  } finally { if (current === generation) { controller = null; busy(false); void checkAvailability(); } }
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
async function checkAvailability() {
  try {
    const state = await availability();
    $('ai-disclaimer').hidden = ['available', 'downloadable', 'downloading'].includes(state);
    const labels = { available: '● Local AI ready', downloadable: '↓ Model downloadable', downloading: '↓ Model downloading', unavailable: 'Local AI unavailable', missing: 'Demo / manual mode' };
    $('ai-status').textContent = labels[state] || 'Local AI unavailable';
    $('ai-help').textContent = state === 'available' ? 'Your recipe is processed on this device.' : state === 'downloadable' || state === 'downloading' ? 'Click Convert to initialize the model. The first download may take a while.' : 'Use Demo or edit JSON. Local AI needs an eligible Chrome device and localhost/HTTPS. Development setup: chrome://flags/#prompt-api-for-gemini-nano';
  } catch { $('ai-disclaimer').hidden = false; $('ai-status').textContent = 'Local AI unavailable'; $('ai-help').textContent = 'Capability check failed. Demo and Manual JSON are available.'; }
}
void checkAvailability();
