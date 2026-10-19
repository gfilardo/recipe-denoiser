export function setupConversionDialog(onCancel) {
  const el = id => document.getElementById(id);
  const dialog = el('conversion-dialog');
  let running = false, started = 0, timer, events = [], lastOutputAt = null, attemptStarted = null, streaming = false, downloadBucket = -1;
  let outputs = new Map(), outputLabels = new Map(), requestContexts = new Map(), currentConnection = null, passages = [];
  const duration = ms => `${(ms / 1000).toFixed(1)}s`;
  function log(message) {
    const entry = `${duration(Date.now() - started)} · ${message}`;
    events.push(entry);
    const li = document.createElement('li'); li.textContent = entry;
    el('conversion-history').append(li);
    li.scrollIntoView({ block: 'nearest' });
  }
  function tick() {
    el('conversion-elapsed').textContent = duration(Date.now() - started);
    if (attemptStarted !== null) el('conversion-activity').textContent = !streaming
      ? 'This browser reports output only when the response finishes.'
      : lastOutputAt === null ? `Waiting for first output · ${duration(Date.now() - attemptStarted)}`
      : `Last output received ${duration(Date.now() - lastOutputAt)} ago`;
  }
  function finish(message, error = false) {
    running = false; clearInterval(timer); tick();
    el('conversion-activity').textContent = `At stop: ${el('conversion-activity').textContent}`;
    el('conversion-stage').textContent = message;
    el('conversion-connection-progress').textContent = el('conversion-connection-progress').textContent.replace('Working on action', 'Stopped at action');
    el('conversion-stage').classList.toggle('error', error);
    el('conversion-cancel').hidden = true; el('conversion-close').hidden = false;
    log(message); el('conversion-close').focus();
  }
  function cancel() {
    if (!running) return;
    onCancel(); finish('Conversion canceled. No new result was applied.');
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (running) cancel(); else dialog.close(); });
  el('conversion-cancel').addEventListener('click', cancel);
  el('conversion-close').addEventListener('click', () => dialog.close());
  el('conversion-debug-show').addEventListener('click', () => {
    const snapshot = [...outputs].map(([attempt, text]) => {
      const label = outputLabels.get(attempt) || `Request ${attempt}`;
      const context = requestContexts.get(attempt);
      const request = context ? `--- Context for ${label} ---\nCurrent action: ${context.current_action.id}: ${context.current_action.action}\nIngredient section context: ${context.ingredient_section || 'unresolved'}\nEligible inputs:\n${context.available_inputs.map(n => `${n.id} (${n.kind}): ${n.text}${n.section ? `\n  Source section: ${n.section.label || 'Initial ingredient group'} (${n.section.id})` : ''}${n.portion ? `\n  Assigned use: ${n.portion.step_id}; source phrase: ${JSON.stringify(n.portion.phrase)}; original total: ${n.portion.original_text}` : ''}${n.contains ? `\n  Contains: ${n.contains.join('; ')}` : ''}${n.evidence ? `\n  Evidence choices: ${n.evidence.length ? n.evidence.map(s => JSON.stringify(s)).join(', ') : '(none; leave unused)'}` : ''}`).join('\n')}\n\n` : '';
      return request + `--- ${label} · ${text.length} characters ---\n${text || '(No output received.)'}`;
    }).join('\n\n');
    const sourceMap = passages.length ? '--- Source passage IDs (original text) ---\n' + passages.map(p => `${p.id}: ${p.text}`).join('\n') + '\n\n' : '';
    el('conversion-debug-text').value = sourceMap + (snapshot || 'No output received yet.');
    el('conversion-debug-label').textContent = `Snapshot at ${duration(Date.now() - started)}. Raw model output; may be incomplete or invalid. It is not a verified recipe.`;
    el('conversion-debug').hidden = false;
    el('conversion-debug-show').textContent = 'Refresh output snapshot';
    el('conversion-debug-status').textContent = '';
  });
  el('conversion-debug-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el('conversion-debug-text').value); el('conversion-debug-status').textContent = 'Output snapshot copied.'; }
    catch { el('conversion-debug-status').textContent = 'Could not copy. Select and copy the text below.'; el('conversion-debug-text').focus(); el('conversion-debug-text').select(); }
  });
  el('conversion-debug-print').addEventListener('click', () => {
    console.info('Recipe Denoiser — unvalidated model output snapshot\n' + el('conversion-debug-text').value);
    el('conversion-debug-status').textContent = 'Snapshot printed to the browser console.';
  });
  el('conversion-copy').addEventListener('click', async () => {
    const report = ['Recipe conversion report', el('conversion-inputs').textContent,
      `Elapsed: ${el('conversion-elapsed').textContent}`, `Connections: ${el('conversion-connection-progress').textContent}`, `First output: ${el('conversion-first').textContent}`,
      `Output received: ${el('conversion-output').textContent}`, el('conversion-activity').textContent, ...events].join('\n');
    try { await navigator.clipboard.writeText(report); el('conversion-copy-status').textContent = 'Report copied.'; }
    catch { el('conversion-copy-status').textContent = 'Could not copy. Select and copy the history below.'; }
  });
  return {
    open(minutes) {
      clearInterval(timer); running = true; started = Date.now(); events = []; lastOutputAt = null; attemptStarted = null; downloadBucket = -1;
      outputs = new Map(); outputLabels = new Map(); requestContexts = new Map(); currentConnection = null; passages = [];
      el('conversion-connection-progress').hidden = true; el('conversion-connection-progress').textContent = 'Not started';
      el('conversion-debug').hidden = true; el('conversion-debug-text').value = '';
      el('conversion-debug-show').textContent = 'Show current output'; el('conversion-debug-status').textContent = '';
      el('conversion-history').replaceChildren(); el('conversion-stage').classList.remove('error');
      el('conversion-stage').textContent = 'Preparing local model…';
      el('conversion-inputs').textContent = `Conversion limit: ${minutes} minutes (shared by extraction, per-action linking and at most one correction).`;
      el('conversion-first').textContent = 'Not yet'; el('conversion-output').textContent = '0 characters';
      el('conversion-activity').textContent = 'Waiting for the model session.'; el('conversion-copy-status').textContent = '';
      el('conversion-cancel').hidden = false; el('conversion-close').hidden = true;
      if (!dialog.open) dialog.showModal();
      tick(); timer = setInterval(tick, 1000); log('Conversion requested.');
    },
    event(event) {
      if (!running) return;
      switch (event.type) {
        case 'initializing':
          el('conversion-inputs').textContent += ` Source: ${event.sourceChars} characters. Pipeline: ${event.pipeline}. Schema guidance: ${event.schemaGuidance ? 'enabled' : 'not reported'}. Per-request sizes appear in the history; these are characters, not tokens.`;
          log('Preparing local model.'); break;
        case 'download':
          el('conversion-stage').textContent = `Downloading local model · ${Math.round(event.progress * 100)}%`;
          if (Math.floor(event.progress * 4) > downloadBucket) { downloadBucket = Math.floor(event.progress * 4); log(`Model download: ${Math.round(event.progress * 100)}%.`); }
          break;
        case 'passages': passages = event.passages; log(`Prepared ${passages.length} source passages for selection.`); break;
        case 'connection':
          currentConnection = event.request;
          el('conversion-connection-progress').hidden = false;
          el('conversion-connection-progress').textContent = `Connections checked: ${event.request.action_number - 1} of ${event.request.action_count}. Working on action ${event.request.action_number}.`;
          break;
        case 'connection-validated':
          el('conversion-connection-progress').textContent = `Connections checked: ${event.completed} of ${event.total}.`;
          log(`Connections checked: ${event.completed} of ${event.total}.`); break;
        case 'session':
          attemptStarted = null;
          el('conversion-stage').textContent = `Preparing session: ${event.label.toLowerCase()}…`;
          el('conversion-activity').textContent = 'Waiting for a fresh model session.';
          log(`Preparing a fresh session for ${event.label.toLowerCase()}.`); break;
        case 'ready': log('Model session ready.'); break;
        case 'attempt':
          outputs.set(event.attempt, ''); outputLabels.set(event.attempt, event.label);
          if (event.stage === 'connections' && currentConnection) requestContexts.set(event.attempt, currentConnection);
          attemptStarted = Date.now(); lastOutputAt = null; streaming = event.streaming;
          el('conversion-first').textContent = 'Not yet'; el('conversion-output').textContent = '0 characters';
          el('conversion-stage').textContent = `${event.label}…`;
          log(`${event.label}: response requested. Prompt: ${event.promptChars} characters; instructions: ${event.systemChars}; schema: ${event.schemaChars}.`);
          if (!streaming) log('Streaming unavailable; first-output timing cannot be measured.');
          tick(); break;
        case 'output':
          outputs.set(event.attempt, event.text);
          if (lastOutputAt === null) { el('conversion-first').textContent = duration(event.attemptElapsedMs); log(`First output received ${duration(event.attemptElapsedMs)} after this attempt started.`); }
          lastOutputAt = Date.now();
          el('conversion-output').textContent = `${event.chars.toLocaleString()} characters · ${event.chunks} chunks`;
          tick(); break;
        case 'response':
          outputs.set(event.attempt, event.text);
          el('conversion-output').textContent = `${event.chars.toLocaleString()} characters`;
          log(`Response complete in ${duration(event.attemptElapsedMs)} · ${event.chars} characters.`); break;
        case 'validating': el('conversion-stage').textContent = `Checking ${event.label.toLowerCase()}…`; log(`Validating ${event.label.toLowerCase()}.`); break;
        case 'correction': log(`Using the single conversion correction for ${event.label.toLowerCase()}. Accepted earlier work stays unchanged.`); break;
        case 'stage-validated': log(`${event.label}: validation passed.`); break;
        case 'invalid': log(`Validation failed: ${event.message}`); break;
        case 'validated': log('Recipe validation passed.'); break;
        case 'failed':
          log(`Model operation stopped during ${event.stage} / ${event.phase}: ${event.message}`);
          log(`Browser error (${event.errorName}): ${event.originalMessage}`);
          log(`Attempt ${event.attempt}: ${event.chars} characters in ${event.chunks} streamed chunks received; category: ${event.category}.`);
          break;
      }
    },
    rendering() { el('conversion-stage').textContent = 'Building your cooking grid…'; log('Building the grid.'); },
    success() { finish('Recipe converted successfully.'); dialog.close(); document.getElementById('output-heading').focus(); },
    fail(message) { finish(message, true); }
  };
}
